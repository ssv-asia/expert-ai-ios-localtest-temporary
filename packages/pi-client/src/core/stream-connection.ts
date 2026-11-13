import { Subject, BehaviorSubject, Observable } from "rxjs";
import type { ConnectionState } from "../types";
import type { StreamEventEnvelope } from "../types/stream-events";
import { XhrEventSource } from "./event-source";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

function getReconnectDelay(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * Math.pow(2, Math.max(0, attempt - 1)), maxMs);
}

function isStreamEventPayload(value: object): boolean {
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "number" &&
    typeof v["session_id"] === "string" &&
    typeof v["type"] === "string" &&
    typeof v["timestamp"] === "number" &&
    typeof v["data"] === "object" &&
    v["data"] !== null
  );
}

function parseStreamEvents(raw: string): StreamEventEnvelope[] {
  try {
    const parsed = JSON.parse(raw) as object | object[];
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.filter(
      (item): item is StreamEventEnvelope =>
        typeof item === "object" && item !== null && isStreamEventPayload(item),
    );
  } catch (e) {
    console.warn('[Stream] Failed to parse stream events:', e);
    return [];
  }
}

export interface StreamConnectionConfig {
  serverUrl: string;
  getAccessToken: () => string;
  onAuthError?: () => void;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

export class StreamConnection {
  private readonly _events$ = new Subject<StreamEventEnvelope>();
  private readonly _connection$ = new BehaviorSubject<ConnectionState>({
    status: "idle",
    retryAttempt: 0,
    nextRetryAt: null,
    lastDisconnectReason: null,
    disconnectedAt: null,
  });
  private readonly _instanceId$ = new Subject<string>();
  private readonly _connectionId$ = new Subject<string>();
  private readonly _activeSessions$ = new Subject<string[]>();

  private readonly _config: StreamConnectionConfig;
  private _connectionId: string | null = null;
  private _lastEventId: number | null = null;
  private _retryCount = 0;
  private _es: XhrEventSource | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _recycleTimer: ReturnType<typeof setTimeout> | null = null;
  private _recycling = false;
  private _destroyed = false;

  // The XHR-backed SSE keeps the ENTIRE response body in memory and it only grows.
  // Left alone for a whole session that's hundreds of KB / MBs of delta events, and
  // every readystatechange pays a full-buffer copy — the JS thread stalls and the
  // 2nd/3rd message never renders. So after each completed turn (agent_end), and as
  // a hard backstop once the buffer passes this size, we transparently tear the XHR
  // down and reopen it from _lastEventId. The server replays anything missed.
  private static readonly RECYCLE_BYTES = 256 * 1024;

  constructor(config: StreamConnectionConfig) {
    this._config = config;
  }

  get events$(): Observable<StreamEventEnvelope> {
    return this._events$.asObservable();
  }

  get connection$(): Observable<ConnectionState> {
    return this._connection$.asObservable();
  }

  get instanceId$(): Observable<string> {
    return this._instanceId$.asObservable();
  }

  get connectionId$(): Observable<string> {
    return this._connectionId$.asObservable();
  }

  get connectionId(): string | null {
    return this._connectionId;
  }

  get activeSessions$(): Observable<string[]> {
    return this._activeSessions$.asObservable();
  }

  get connectionSnapshot(): ConnectionState {
    return this._connection$.getValue();
  }

  get lastEventId(): number | null {
    return this._lastEventId;
  }

  connect(): void {
    if (this._destroyed) return;
    this._close();
    this._clearReconnectTimer();
    this._clearRecycleTimer();
    this._recycling = false;
    this._retryCount = 0;
    this._openSse();
  }

  disconnect(): void {
    this._destroyed = true;
    this._clearReconnectTimer();
    this._clearRecycleTimer();
    this._recycling = false;
    this._close();
    this._setConnection({ status: "idle" });
    this._events$.complete();
    this._connection$.complete();
    this._instanceId$.complete();
    this._connectionId$.complete();
    this._activeSessions$.complete();
  }

  reconnect(): void {
    if (this._destroyed) return;
    this._close();
    this._clearReconnectTimer();
    this._clearRecycleTimer();
    this._recycling = false;
    this._retryCount = 0;
    this._openSse();
  }

  private _openSse(): void {
    if (this._destroyed) return;

    const url = this._buildStreamUrl();
    const token = this._config.getAccessToken();

    if (!this._recycling) {
      this._setConnection({
        status: this._retryCount > 0 ? "reconnecting" : "connecting",
        retryAttempt: this._retryCount,
      });
    }

    const es = new XhrEventSource(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    this._es = es;

    es.addEventListener("open", () => {
      if (this._destroyed || this._es !== es) { es.close(); return; }
      this._retryCount = 0;
      if (this._recycling) {
        // Transparent buffer recycle — the UI never saw a disconnect, don't flap it.
        this._recycling = false;
      } else {
        this._setConnection({ status: "connected" });
      }
    });

    es.addEventListener("message", (event) => {
      if (this._destroyed || this._es !== es || !event.data) return;

      let raw: Record<string, unknown> | null = null;
      try {
        raw = JSON.parse(event.data) as Record<string, unknown>;
      } catch (err) {
        // Real parse error - log it but still try regular event parsing
        if (event.data.trim().startsWith("{")) {
          console.warn('[Stream] Failed to parse control message JSON:', err);
        }
        // Fall through to regular event parsing
      }

      // Check if it's a control event (only if JSON parsed successfully)
      if (raw) {
        if (raw["type"] === "server_hello" && typeof raw["instance_id"] === "string") {
          if (typeof raw["connection_id"] === "string") {
            this._connectionId = raw["connection_id"] as string;
            this._connectionId$.next(this._connectionId);
          }
          this._instanceId$.next(raw["instance_id"] as string);
          return;
        }
        if (raw["type"] === "active_sessions" && Array.isArray(raw["session_ids"])) {
          this._activeSessions$.next(raw["session_ids"] as string[]);
          return;
        }
      }

      // Not a control event, parse as regular stream event
      const events = parseStreamEvents(event.data);
      for (const evt of events) {
        if (evt.id > 0) {
          // Drop anything we've already delivered — a recycle reopens the stream
          // from _lastEventId and the server's replay can be inclusive of it.
          if (this._lastEventId !== null && evt.id <= this._lastEventId) continue;
          this._lastEventId = evt.id;
        }
        this._events$.next(evt);

        // A turn just finished — safe point to recycle the XHR buffer so it can't
        // grow across turns. Also recycle mid-turn if it has already grown large.
        const t = (evt as { type?: string }).type;
        if (t === "agent_end" || t === "turn_end") {
          this._scheduleRecycle(300);
        }
      }

      if (
        !this._recycling &&
        this._es !== null &&
        this._es.bytesProcessed > StreamConnection.RECYCLE_BYTES
      ) {
        this._scheduleRecycle(0);
      }
    });

    es.addEventListener("error", (event) => {
      if (this._destroyed || this._es !== es) { es.close(); return; }

      const status = event.xhrStatus ?? 0;
      if (status === 401 || status === 403) {
        this._recycling = false;
        this._clearRecycleTimer();
        this._close();
        this._setConnection({
          status: "disconnected",
          lastDisconnectReason: "Authentication expired. Sign in again to reconnect.",
          disconnectedAt: Date.now(),
        });
        this._config.onAuthError?.();
        return;
      }

      this._close();
      this._scheduleReconnect(event.message ?? "SSE connection lost");
    });

    es.addEventListener("close", () => {
      if (this._destroyed || this._es !== es) return;
      this._close();
      this._scheduleReconnect("SSE connection closed");
    });
  }

  /** Transparently tear down and reopen the SSE XHR from _lastEventId so its
   *  ever-growing responseText buffer can't stall the JS thread. No UI status
   *  change, no retry backoff — the stream is considered continuously connected. */
  private _scheduleRecycle(delayMs: number): void {
    if (this._destroyed || this._recycling || this._recycleTimer) return;
    this._recycleTimer = setTimeout(() => {
      this._recycleTimer = null;
      if (this._destroyed || this._reconnectTimer) return;
      this._recycling = true;
      this._close();
      this._openSse();
    }, delayMs);
  }

  private _clearRecycleTimer(): void {
    if (this._recycleTimer) {
      clearTimeout(this._recycleTimer);
      this._recycleTimer = null;
    }
  }

  private _scheduleReconnect(reason: string): void {
    if (this._destroyed) return;

    // A real drop supersedes any pending transparent recycle.
    this._recycling = false;
    this._clearRecycleTimer();
    this._retryCount += 1;
    const baseMs = this._config.reconnectBaseMs ?? RECONNECT_BASE_MS;
    const maxMs = this._config.reconnectMaxMs ?? RECONNECT_MAX_MS;
    const delay = getReconnectDelay(this._retryCount, baseMs, maxMs);

    this._setConnection({
      status: "reconnecting",
      retryAttempt: this._retryCount,
      nextRetryAt: Date.now() + delay,
      lastDisconnectReason: reason,
      disconnectedAt: this._connection$.getValue().disconnectedAt ?? Date.now(),
    });

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._openSse();
    }, delay);
  }

  private _close(): void {
    if (this._es) {
      this._es.removeAllEventListeners();
      this._es.close();
      this._es = null;
    }
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private _setConnection(partial: Partial<ConnectionState>): void {
    const current = this._connection$.getValue();
    this._connection$.next({
      status: partial.status ?? current.status,
      retryAttempt: partial.retryAttempt ?? 0,
      nextRetryAt: partial.nextRetryAt ?? null,
      lastDisconnectReason: partial.lastDisconnectReason ?? null,
      disconnectedAt: partial.disconnectedAt ?? null,
    });
  }

  private _buildStreamUrl(): string {
    const url = new URL(`${this._config.serverUrl}/api/stream`);
    if (this._lastEventId !== null) {
      url.searchParams.set("from", String(this._lastEventId));
    }
    return url.toString();
  }
}
