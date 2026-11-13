// Direct client for the SSV.asia Expert AI Gateway (Cloudflare Worker,
// OpenAI-compatible /v1/chat/completions). No pi-server, no pairing —
// the app talks straight to the gateway. Sign-in is mandatory: there is no
// anonymous/community fallback credential. Every call requires a real
// ssv.asia session token from lib/auth.ts.
//
// Uses expo/fetch instead of the global fetch: React Native's built-in fetch
// does not reliably support reading a streamed ReadableStream response body
// (response.body.getReader()), which SSE streaming depends on entirely.
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const FEEDBACK_PATH = `${FileSystem.documentDirectory}response-feedback-v1.json`;
const FEEDBACK_KEY = '@expert-ai/response-feedback-v1';
let feedbackWriteChain: Promise<void> = Promise.resolve();

type PendingFeedback = { text: string; rating: 'positive' | 'negative'; createdAt: number };

async function readPendingFeedback(): Promise<PendingFeedback[]> {
  try {
    const raw = Platform.OS === 'web'
      ? localStorage.getItem(FEEDBACK_KEY)
      : (await FileSystem.getInfoAsync(FEEDBACK_PATH)).exists
        ? await FileSystem.readAsStringAsync(FEEDBACK_PATH)
        : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-24) : [];
  } catch { return []; }
}

async function writePendingFeedback(items: PendingFeedback[]): Promise<void> {
  const value = JSON.stringify(items.slice(-24));
  if (Platform.OS === 'web') localStorage.setItem(FEEDBACK_KEY, value);
  else await FileSystem.writeAsStringAsync(FEEDBACK_PATH, value);
}

async function enqueueFeedback(item: PendingFeedback): Promise<void> {
  const operation = feedbackWriteChain.then(async () => writePendingFeedback([...(await readPendingFeedback()), item]));
  feedbackWriteChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

// Ordered list of gateway origins. `resilientFetch` tries them in order and then
// sticks to whichever answered last, so a network that can't resolve one origin
// transparently rides the next with no error surfaced.
//   - api.ssv.asia: custom domain on our own zone (provisioned + verified
//     2026-08-29). NOT on the shared *.workers.dev apex that some ISPs — India
//     especially — NXDOMAIN / SNI-filter. Primary.
//   - the workers.dev origin: always-present fallback.
export const GATEWAY_HOSTS: readonly string[] = [
  'https://api.ssv.asia',
  'https://expert-ai-gateway.arthouse.workers.dev',
];

/** Back-compat for modules that import a single base URL. Prefer resilientFetch /
 *  GATEWAY_HOSTS for anything on a flaky-network path. */
export const GATEWAY_BASE_URL = GATEWAY_HOSTS[0];

export type GatewayHealth = {
  ok: boolean;
  service?: string;
  status: 'operational' | 'degraded' | 'unreachable' | 'unknown';
  version?: string;
  checkedAt?: string;
  capabilities?: { durableJobs?: boolean; streaming?: boolean; mcp?: boolean };
};

/** Dependency-free reachability check used by diagnostics and support flows.
 * It deliberately does not require a session, so an expired login can be
 * distinguished from an unavailable gateway. */
export async function checkGatewayHealth(): Promise<GatewayHealth> {
  try {
    const response = await resilientFetch('/health', { method: 'GET' }, { attemptTimeoutMs: 6000, retries: 0 });
    const body = await response.json().catch(() => ({})) as Partial<GatewayHealth>;
    if (!response.ok) return { ok: false, status: 'degraded', ...body };
    return { ok: true, status: 'operational', ...body };
  } catch {
    return { ok: false, status: 'unreachable' };
  }
}
// Last origin that produced a real HTTP response this process. Tried first next
// time so we don't re-pay a dead-origin timeout on every request.
let stickyHost: string | null = null;
let lastGatewayRequestId: string | null = null;

/** Correlation ID from the most recent gateway response, useful when a user
 * reports a failed or slow turn and support needs to locate the edge trace. */
export function getLastGatewayRequestId(): string | null {
  return lastGatewayRequestId;
}

function orderedHosts(): string[] {
  if (!stickyHost) return [...GATEWAY_HOSTS];
  return [stickyHost, ...GATEWAY_HOSTS.filter((h) => h !== stickyHost)];
}

const NETWORK_ERR_RE =
  /network request failed|unable to resolve host|no address associated|failed to fetch|connection (reset|refused|closed|aborted)|software caused connection abort|the network connection was lost|timed? ?out|econnreset|enotfound|eai_again/i;

/** True for errors where retrying / trying another origin is worthwhile (vs. a
 *  real API rejection like 401 that will fail identically everywhere). */
function isRetriableError(err: unknown): boolean {
  if (err instanceof Error) {
    if (isCancellation(err)) return false; // caller cancelled — never retry
    return NETWORK_ERR_RE.test(err.message);
  }
  return false;
}

// expo/fetch's own AbortController doesn't reliably surface a cancellation with
// name === 'AbortError' the way our hand-rolled abortErr() does — some paths throw
// with a generic name but a message like "Fetch request has been canceled". Left
// unhandled, those fell into the NetworkError branch below and got reported as real
// failures (Sentry REACT-NATIVE-3) even though they're just a normal stop-generation
// tap or a screen unmount. Match on message text too, not just name.
function isCancellation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  return /\b(cancel(l?ed)?|aborted?)\b/i.test(err.message);
}

/** Human-readable version of the low-level network errors RN throws, so the UI
 *  never shows "java.net.UnknownHostException" or "Network request failed". */
export function friendlyNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/unable to resolve host|no address associated|enotfound|eai_again/i.test(msg)) {
    return "Can't reach Expert AI on this network. Check your connection — if you're on Wi-Fi, mobile data or a different network usually works.";
  }
  if (/timed? ?out/i.test(msg)) {
    return 'The server took too long to respond. Retrying…';
  }
  if (NETWORK_ERR_RE.test(msg)) {
    return 'Connection dropped. Retrying…';
  }
  return msg;
}

interface ResilientOptions {
  /** External cancel signal (e.g. the stop-generation button). */
  signal?: AbortSignal;
  /** Abort a single attempt if no response headers within this long. */
  attemptTimeoutMs?: number;
  /** Full-loop retries (each loop tries every origin) after the first pass. */
  retries?: number;
}

/**
 * fetch() with origin fallback + bounded retries + per-attempt timeout.
 * `path` is an absolute path beginning with "/". Returns the first real HTTP
 * response (even a 4xx — that's the server talking); only network-level failures
 * and 502/503/504/429 cause a fallback/retry. Throws only when every origin has
 * failed `retries + 1` times, or when the caller's signal aborts.
 */
export async function resilientFetch(
  path: string,
  init: Parameters<typeof fetch>[1] = {},
  { signal, attemptTimeoutMs = 15000, retries = 2 }: ResilientOptions = {},
): Promise<Response> {
  // Hermes has no DOMException — hand-roll an AbortError-shaped Error.
  const abortErr = () => {
    const e = new Error('Aborted');
    e.name = 'AbortError';
    return e;
  };
  let lastErr: unknown = new Error('Network request failed');

  for (let loop = 0; loop <= retries; loop++) {
    if (signal?.aborted) throw abortErr();

    for (const host of orderedHosts()) {
      const ctl = new AbortController();
      const onOuterAbort = () => ctl.abort();
      signal?.addEventListener('abort', onOuterAbort);
      const timer = setTimeout(() => ctl.abort(), attemptTimeoutMs);
      try {
        const resp = await fetch(`${host}${path}`, { ...init, signal: ctl.signal });
        stickyHost = host; // this origin is reachable — prefer it next time
        lastGatewayRequestId = resp.headers.get('x-request-id');
        // 5xx/429 from the edge: the origin resolved but can't serve right now —
        // worth trying the other origin and then backing off.
        if (resp.status === 502 || resp.status === 503 || resp.status === 504 || resp.status === 429) {
          lastErr = new Error(`Gateway ${resp.status}`);
          continue;
        }
        return resp;
      } catch (err) {
        if (signal?.aborted) throw abortErr();
        lastErr = err;
        if (!isRetriableError(err) && !isCancellation(err)) {
          // A non-network error we don't understand — don't spin on it.
          throw err;
        }
        // else: try the next origin
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onOuterAbort);
      }
    }

    // Every origin failed this pass — back off (250ms, 1s, 2s…) then retry.
    if (loop < retries) {
      await new Promise((r) => setTimeout(r, Math.min(2000, 250 * 2 ** loop)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Prints round-trip timing for a chat completion so a real Metro/logcat trace
 *  can show whether a slow reply is connection setup (request -> ttfb),
 *  server-side generation start (ttfb -> firstToken), or just slow token
 *  throughput (firstToken -> done) — instead of guessing at the cause. */
function logStreamTiming(
  model: string,
  startedAt: number,
  ttfbMs: number | null,
  firstTokenMs: number | null,
  error?: unknown,
  servedModel?: string | null,
  requestId?: string | null,
) {
  const totalMs = Date.now() - startedAt;
  console.log(
    `[gateway timing] model=${model} served=${servedModel ?? '?'} requestId=${requestId ?? '?'} ttfb=${ttfbMs ?? '?'}ms firstToken=${firstTokenMs ?? '?'}ms total=${totalMs}ms` +
      (error ? ` error=${error instanceof Error ? error.message : String(error)}` : ''),
  );
}

export type Tier =
  | 'community'
  | 'researcher'
  | 'engineer'
  | 'professional'
  | 'aec'
  | 'foundation';

export interface ModelOption {
  /** Route id sent as `model` in the chat completion request — unchanged, this
   *  is what the gateway expects and has no bearing on the display label. */
  id: string;
  /** Display label shown in the model picker. Deliberately not tier-ranked
   *  language ("free"/"pro" implying a ladder) — each name describes what the
   *  model is for, not where it sits in a pricing hierarchy. */
  label: string;
  description: string;
}

export const MODELS: ModelOption[] = [
  {
    id: 'openrouter/unlimited',
    label: 'Unlimited',
    description: 'Fast by default — every reply starts on our quickest model',
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

/** Whether `tier` is allowed to use `modelId`, mirroring the worker's routerOf()/precheck() gating.
 *  The "unlimited" router is open to every tier, including community — that's the point: one
 *  model, no picker, no tier-driven speed bias between options. */
export function isModelUnlocked(_modelId: string, _tier: Tier): boolean {
  return true;
}

export type ChatRole = 'system' | 'user' | 'assistant';

/** OpenAI-style multimodal content part — a message's `content` is either a plain
 *  string or an array of these (text + inline image_url data: URIs). The gateway's
 *  `unlimited` router passes `payload.messages` through untouched to OpenRouter, so
 *  an array here reaches a vision-capable model (Haiku 4.5, for paying tiers) with
 *  no gateway changes needed. */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

/** Carries the gateway's structured error shape (error.type / error.upgrade)
 *  through to the UI, so a quota/tier rejection can prompt "Upgrade" instead
 *  of just showing a generic red error banner. See handleCompletion's gate
 *  checks in the worker source for the full set of `type` values:
 *  'auth' | 'model' | 'banned' | 'rate_limit' | 'tier' | 'quota'. */
/** True when `error` is the rejection from an aborted fetch (stop-generation
 *  button), so the caller can skip showing it as a real failure. */
export function isAbortError(error: unknown): boolean {
  return isCancellation(error);
}

export class GatewayError extends Error {
  type?: string;
  upgrade?: string;
  requestId?: string;
  /** Seconds to wait before retrying — only ever present for type 'rate_limit'. */
  wait?: number;
  constructor(message: string, type?: string, upgrade?: string, wait?: number, requestId?: string | null) {
    super(message);
    this.name = 'GatewayError';
    this.type = type;
    this.upgrade = upgrade;
    this.wait = wait;
    this.requestId = requestId ?? undefined;
  }
}

/** Every gate-check rejection type the gateway can return (see handleCompletion's
 *  precheck() on the worker side) plus our own client-side 'upstream_timeout'.
 *  Centralizing this mapping is the whole point: the UI switches on `type`, never
 *  on message text (the message can change; the type is the stable contract), and
 *  this is the one place to look when debugging "why did the user see X". */
export interface GatewayErrorInfo {
  /** True when this rejection happens before any generation/billing occurs —
   *  safe to reassure the user their usage/quota wasn't touched. */
  notCharged: boolean;
  /** True when retrying the same request again might just work (transient). */
  retryable: boolean;
  /** True when this specifically means "you're out of quota for your plan" —
   *  gates showing the Upgrade CTA (only ever for real quota/tier exhaustion,
   *  never for auth/banned/model/capacity). */
  isQuotaExhaustion: boolean;
}

const GATEWAY_ERROR_INFO: Record<string, GatewayErrorInfo> = {
  auth: { notCharged: true, retryable: false, isQuotaExhaustion: false },
  banned: { notCharged: true, retryable: false, isQuotaExhaustion: false },
  rate_limit: { notCharged: true, retryable: true, isQuotaExhaustion: false },
  tier: { notCharged: true, retryable: false, isQuotaExhaustion: true },
  quota: { notCharged: true, retryable: false, isQuotaExhaustion: true },
  capacity: { notCharged: true, retryable: true, isQuotaExhaustion: false },
  model: { notCharged: true, retryable: false, isQuotaExhaustion: false },
};

export function classifyGatewayError(type: string | undefined): GatewayErrorInfo {
  return (type && GATEWAY_ERROR_INFO[type]) || { notCharged: false, retryable: false, isQuotaExhaustion: false };
}

export interface StreamedToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface StreamCallbacks {
  onDelta: (textChunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
  /** Called instead of onDone when the model's turn ends by requesting tool calls
   *  (finish_reason "tool_calls"). Caller is responsible for executing the tools and
   *  re-invoking streamChatCompletion with the extended history for the final answer. */
  onToolCalls?: (toolCalls: StreamedToolCall[]) => void;
  onPhase?: (phase: 'connecting' | 'thinking' | 'using_tool' | 'synthesizing' | 'complete' | 'error') => void;
  onModel?: (servedModel: string) => void;
}

interface StreamOptions {
  token: string;
  model: string;
  /** Lets the caller cancel an in-flight request (stop-generation button). */
  signal?: AbortSignal;
}

/**
 * Streams a chat completion from the gateway. Parses OpenAI-style SSE
 * ("data: {...}\n\n" chunks, terminated by "data: [DONE]").
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  { token, model, signal }: StreamOptions,
  { onDelta, onDone, onError, onToolCalls, onPhase, onModel }: StreamCallbacks,
): Promise<void> {
  // Timing instrumentation for the "sometimes just sits there" complaint —
  // logs three numbers per request so a real trace can show whether the delay
  // is connection setup (requestStart -> ttfb), generation start (ttfb ->
  // firstToken), or just slow token throughput (firstToken -> done). Cheap
  // (a few Date.now() calls + one console.log), left enabled in all builds
  // since there's no live device to profile against right now — pull real
  // numbers from `adb logcat` / Metro console next test pass rather than
  // guessing at the cause.
  const t0 = Date.now();
  let ttfbMs: number | null = null;
  let firstTokenMs: number | null = null;
  // Which upstream actually served this response (e.g. the gateway's 17.wtf
  // "posiden/deepseek-v4-flash" priority route for the free tier, vs. its
  // OpenRouter fallback chain) — read straight off each SSE chunk's own
  // `model` field, same field every OpenAI-compatible provider echoes back.
  // Needed to tell apart "17.wtf itself is slow" from "we fell back to
  // OpenRouter's free pool and inherited its queueing", instead of assuming
  // one or the other from the request's route id alone.
  let servedModel: string | null = null;
  try {
    // Origin fallback + retry + a 20s cap on getting response headers. Retrying
    // here is safe: it can only happen before any delta has been emitted.
    const response = await resilientFetch(
      '/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ model, messages, stream: true }),
      },
      { signal, attemptTimeoutMs: 20000, retries: 2 },
    );
    ttfbMs = Date.now() - t0;
    // Headers arrived: the gateway accepted the turn and the upstream is now
    // working. This is the honest boundary for the mobile agent's planning
    // state; before this point it is only connecting.
    onPhase?.('thinking');

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      let message = text || response.statusText;
      let errorType: string | undefined;
      let upgrade: string | undefined;
      let wait: number | undefined;
      try {
        const parsed = JSON.parse(text);
        message = parsed?.error?.message || message;
        errorType = parsed?.error?.type;
        upgrade = parsed?.error?.upgrade;
        wait = typeof parsed?.error?.wait === 'number' ? parsed.error.wait : undefined;
      } catch {
        // not JSON, use raw text
      }
      if (wait === undefined) {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter && !Number.isNaN(Number(retryAfter))) wait = Number(retryAfter);
      }
      throw new GatewayError(message, errorType, upgrade, wait, response.headers.get('x-request-id'));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    // Mid-stream stall guard: if the connection silently dies (Wi-Fi drop, NAT
    // timeout, carrier switch), reader.read() can hang forever and the UI sits on
    // a spinner. Abort the read after total silence so onError fires with
    // something the user can act on instead of an infinite "loading".
    //
    // The gateway now emits a `: ping\n\n` heartbeat comment every 15s during
    // genuine silent generation gaps (deployed 2026-09-14), so a real connection
    // stays "heard from" well inside this window even during a long thinking
    // pause — a stall this long past that means the connection is actually gone,
    // not just slow. 20s (a bit over one missed heartbeat) resolves that faster
    // than the old 30s, which predated the heartbeat and had to assume total
    // silence might just be a slow model.
    const STALL_MS = 20000;
    const readWithStallGuard = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      const stall = new Promise<never>((_, reject) => {
        stallTimer = setTimeout(
          () => reject(new Error(`Connection stalled — no response from the server for ${STALL_MS / 1000}s`)),
          STALL_MS,
        );
      });
      try {
        return await Promise.race([reader.read(), stall]);
      } catch (e) {
        try { await reader.cancel(); } catch { /* already closed */ }
        throw e;
      } finally {
        clearTimeout(stallTimer);
      }
    };
    // Accumulate streamed tool_call fragments keyed by index — OpenAI-style streaming
    // sends the id/name once and arguments in pieces across multiple delta chunks.
    const toolCallsByIndex = new Map<number, StreamedToolCall>();
    let finishReason: string | null = null;

    for (;;) {
      const { done, value } = await readWithStallGuard();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          logStreamTiming(model, t0, ttfbMs, firstTokenMs, undefined, servedModel, lastGatewayRequestId);
          if (finishReason === 'tool_calls' && toolCallsByIndex.size > 0 && onToolCalls) {
            onPhase?.('using_tool');
            onToolCalls(Array.from(toolCallsByIndex.values()));
            return;
          }
          onPhase?.('complete');
          onDone(fullText);
          return;
        }
        try {
          const parsed = JSON.parse(data);
          // A mid-stream error frame from the gateway (e.g. `{"error":{"type":"upstream_timeout",
          // "message":"..."}}` before the closing [DONE]) — forward-compatible with the gateway's
          // planned terminal-error-frame change, and harmless today if the gateway never sends one.
          // Gives the user a specific "server timed out" message instead of a raw connection drop
          // reading as a generic NetworkError.
          if (parsed?.error) {
            logStreamTiming(model, t0, ttfbMs, firstTokenMs, parsed.error, servedModel);
            if (parsed.error.type === 'upstream_timeout') {
              // Transient — the model backend stalled, not a real rejection. Route
              // through the same NetworkError path as a dropped connection so the
              // caller auto-retries instead of dead-ending on a banner (that's
              // reserved for real rejections like quota/auth/tier).
              const timeoutErr = new Error('The server took too long to respond. Retrying…');
              timeoutErr.name = 'NetworkError';
              onError(timeoutErr);
            } else {
              onError(new GatewayError(
                parsed.error.message || 'The server had a problem generating a response.',
                parsed.error.type,
                parsed.error.upgrade,
                typeof parsed.error.wait === 'number' ? parsed.error.wait : undefined,
                response.headers.get('x-request-id'),
              ));
            }
            return;
          }
          if (!servedModel && typeof parsed?.model === 'string') {
            servedModel = parsed.model;
            onModel?.(parsed.model);
          }
          const choice = parsed?.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;

          // OpenAI-compatible fallbacks occasionally return a complete choice
          // inside an otherwise streaming response. Accept all text-bearing
          // shapes so a valid answer is not treated as an empty stream.
          const delta: string | undefined = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
          if (delta) {
            if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
            onPhase?.('synthesizing');
            fullText += delta;
            onDelta(delta);
          }

          const toolDeltas = choice?.delta?.tool_calls;
          if (Array.isArray(toolDeltas)) {
            for (const td of toolDeltas) {
              const idx = td.index ?? 0;
              const existing = toolCallsByIndex.get(idx) || {
                id: '',
                type: 'function' as const,
                function: { name: '', arguments: '' },
              };
              if (td.id) existing.id = td.id;
              if (td.function?.name) existing.function.name += td.function.name;
              if (td.function?.arguments) existing.function.arguments += td.function.arguments;
              toolCallsByIndex.set(idx, existing);
            }
          }
        } catch {
          // Ignore malformed SSE chunks.
        }
      }
    }

    // A provider may close after the final SSE frame without a trailing
    // newline. Consume that buffered frame so a valid answer is not reported
    // as an empty stream.
    const trailing = buffer.trim();
    if (trailing.startsWith('data:')) {
      const data = trailing.slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          const choice = parsed?.choices?.[0];
          const delta: string | undefined = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
          if (delta) {
            if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
            onPhase?.('synthesizing');
            fullText += delta;
            onDelta(delta);
          }
        } catch {
          // Ignore an incomplete terminal frame.
        }
      }
    }

    logStreamTiming(model, t0, ttfbMs, firstTokenMs, undefined, servedModel, lastGatewayRequestId);
    if (finishReason === 'tool_calls' && toolCallsByIndex.size > 0 && onToolCalls) {
      onPhase?.('using_tool');
      onToolCalls(Array.from(toolCallsByIndex.values()));
      return;
    }
    // A clean transport close with no text is not a successful answer. Treat
    // it as transient so the caller's bounded retry and durable-job recovery
    // can obtain the response instead of displaying a blank/failed turn.
    if (!fullText.trim()) {
      const empty = new Error('The server returned an empty response. Retrying…');
      empty.name = 'NetworkError';
      onPhase?.('error');
      onError(empty);
      return;
    }
    onPhase?.('complete');
    onDone(fullText);
  } catch (error) {
    onPhase?.('error');
    logStreamTiming(model, t0, ttfbMs, firstTokenMs, error, servedModel, lastGatewayRequestId);
    // Pass structured gateway errors and user-cancellations straight through;
    // translate raw RN network errors into something the user can read + act on.
    if (error instanceof GatewayError || isCancellation(error)) {
      onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      const friendly = new Error(friendlyNetworkError(error));
      friendly.name = 'NetworkError';
      onError(friendly);
    }
  }
}

export interface RouterBudgets {
  free?: number;
  pro?: number;
  foundation?: number;
}

export interface BalanceInfo {
  email: string;
  entitlement: Tier;
  sessionExpires?: number;
  tier?: string;
  tierLabel?: string;
  /** True for a paid 6h/monthly pass; false on the shared community token. */
  passActive?: boolean;
  /** True if the active pass is a 30-day monthly subscription rather than a 6h pass —
   *  monthly plans carry a much larger `free` router budget (500M tokens) than 6h passes
   *  (1-3M), so this must be read from the API, never assumed from tier alone. */
  monthly?: boolean;
  secondsLeft?: number;
  /** Community (unauthenticated/free) tier only: daily message counter. */
  community?: { used: number; limit: number };
  /** Paid tier only: per-router token budgets for the active pass. */
  budgets?: RouterBudgets;
  /** Paid tier only: per-router tokens consumed so far this pass. */
  used?: { foundation?: number; free?: number; pro?: number; opus?: number };
  opusCap?: number;
  [key: string]: unknown;
}

/** Formats a token count for display: 500000000 -> "500M", 1500000 -> "1.5M", 900 -> "900". */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

export async function fetchBalance(token: string): Promise<BalanceInfo> {
  // Origin fallback + one retry, 6s per attempt. Never hangs the Settings screen.
  const response = await resilientFetch(
    '/balance',
    { headers: { Authorization: `Bearer ${token}` } },
    { attemptTimeoutMs: 6000, retries: 1 },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Balance check failed (${response.status})`);
  }
  return data as BalanceInfo;
}

/** Server-authoritative Google Play subscription verification. The Play token
 * is never treated as proof of entitlement in the client; the gateway must
 * validate it with the Google Play Developer API before access changes. */
export async function verifyGooglePlaySubscription(token: string, input: { productId: string; purchaseToken: string; orderId?: string }): Promise<void> {
  const response = await resilientFetch('/billing/google/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw new Error(data?.error?.message || data?.error || 'Google Play purchase could not be verified yet.');
}

// ---------------------------------------------------------------------------
// Content reporting — Google Play's AI-Generated Content policy requires an
// in-app way to flag an offensive/harmful/incorrect AI reply without leaving
// the chat. Fire-and-forget from the UI's point of view: the worker just logs
// it server-side for review, there is no client-visible follow-up state.
export async function reportMessage(token: string, messageText: string, reason: string): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    await resilientFetch(
      '/report',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: messageText, reason }),
      },
      { signal: controller.signal, attemptTimeoutMs: 8000, retries: 1 },
    );
  } catch {
    // Best-effort — a failed report shouldn't surface as a chat error.
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Send a lightweight quality signal for a completed assistant response. The
 * gateway records the bounded event for aggregate routing/evaluation review;
 * no message history is persisted by this endpoint. */
export async function sendResponseFeedback(
  token: string,
  messageText: string,
  rating: 'positive' | 'negative',
): Promise<void> {
  try {
    await resilientFetch(
      '/feedback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: messageText, rating }),
      },
      { attemptTimeoutMs: 5000, retries: 0 },
    );
  } catch {
    // Keep the signal locally so a transient outage does not silently discard
    // product-quality data. It is bounded and never blocks the completed reply.
    await enqueueFeedback({ text: messageText.slice(0, 120), rating, createdAt: Date.now() });
  }
}

/** Best-effort delivery of feedback captured during an offline period. */
export async function flushResponseFeedback(token: string): Promise<void> {
  const operation = feedbackWriteChain.then(async () => {
    const pending = await readPendingFeedback();
    if (!pending.length) return;
    const keep: PendingFeedback[] = [];
    for (const item of pending) {
      try {
        await resilientFetch('/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: item.text, rating: item.rating }),
        }, { attemptTimeoutMs: 5000, retries: 0 });
      } catch {
        keep.push(item);
      }
    }
    await writePendingFeedback(keep);
  });
  feedbackWriteChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** A single model's usage this billing cycle. */
export interface ModelUsage {
  used: number;
  total: number;
}

/** Real recurring-autopay state for a tier-ladder subscription. */
export interface SubscriptionInfo {
  id: string;
  status: string;
  tierIdx: number;
  kind: 'monthly' | 'weekly' | string;
  lastEventAt?: number;
  lastError?: string;
  /** True when the subscription has been wedged in 'creating' for >10min. */
  stuck?: boolean;
}

/** GET /me — the account/dashboard screen's data source. A strict superset of
 *  /balance (fetchBalance above): everything needed for a full native account
 *  screen instead of sending the user to ssv.asia's website. Read-only display
 *  data only — this app does not initiate any purchase/subscribe flow (Play
 *  Store billing policy: digital subscriptions consumed in-app must go through
 *  Google Play Billing, which isn't wired up yet — see CLAUDE.md). */
export interface AccountInfo {
  email: string;
  planLabel: string;
  expires?: string;
  haiku?: ModelUsage;
  sonnet?: ModelUsage;
  luna?: ModelUsage;
  /** The "Expert AI Total" headline number (2x paid sum). */
  expert_ai?: ModelUsage;
  /** Never resets — tracked since 2026-09-13. */
  lifetime?: { haiku?: number; sonnet?: number; luna?: number; free?: number };
  /** Which apps/features this tier unlocks. */
  apps?: string[];
  /** "Never runs out" — true from the Expert tier up. */
  unlimited?: boolean;
  subscription?: SubscriptionInfo | null;
  /** Dormant-user signal — true if this account hasn't been active in a while. */
  welcomeBack?: boolean;
  lastReqAt?: number;
  /** Old/legacy pre-tier-ladder paid accounts: their real entitlement lives here
   *  instead of haiku/sonnet/luna (those are always 0 for these accounts —
   *  tierIdx is never set for them, per the gateway's own /me implementation). */
  legacyGrant?: { free?: number; freeUsed?: number; pro?: number; proUsed?: number; foundation?: number; foundationUsed?: number };
  giftLifetime?: unknown;
  /** One-time view — the server clears this after returning it once. A
   *  non-null response here is only ever returned exactly once per gift. */
  gift?: { haiku: number; sonnet: number; luna: number; message: string; ts: number } | null;
  [key: string]: unknown;
}

export async function fetchAccountInfo(token: string): Promise<AccountInfo> {
  const response = await resilientFetch(
    '/me',
    { headers: { Authorization: `Bearer ${token}` } },
    { attemptTimeoutMs: 8000, retries: 1 },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `Couldn't load account info (${response.status})`);
  }
  return data as AccountInfo;
}

// Self-service "sign out of all devices" — bumps the account's session_epoch
// server-side, invalidating every outstanding session token including the one
// used to call this. The caller must treat this exactly like a normal sign-out
// immediately after (the response can't be used for anything further).
export async function signOutEverywhere(token: string): Promise<void> {
  const response = await resilientFetch(
    '/account/sign-out-everywhere',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    { attemptTimeoutMs: 15000, retries: 1 },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `Couldn't sign out of all devices (${response.status})`);
  }
}

// Permanently deletes the signed-in user's account and all associated backend
// data (workspaces, sessions, usage records) — the same real endpoint Agent
// mode's Settings screen already uses.
export async function deleteAccount(token: string): Promise<void> {
  const response = await resilientFetch(
    '/account/delete',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    },
    { attemptTimeoutMs: 15000, retries: 2 },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Delete failed (${response.status})`);
  }
}

