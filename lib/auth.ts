// Native account authentication. Ghost remains the member database and transactional email sender;
// the app never opens Ghost Portal for email sign-in. The gateway asks Ghost to send its normal
// one-time code email, verifies the code through Ghost's member API, and returns an Expert AI token.
// A real session is required for every gateway call — callers must gate on `session !== null`
// before sending anything. `startFreeTrial()` below is the one no-signup path: it issues a
// session for a fresh synthetic community-tier identity rather than a real membership email.

import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import { GATEWAY_BASE_URL, GATEWAY_HOSTS, resilientFetch, type Tier } from './gateway-client';

/** Races a fixed delay against the app returning to the foreground, so the poll
 *  loop below checks again the instant the user switches back from the in-app
 *  browser instead of waiting out whatever's left of its last sleep — Android
 *  can throttle JS timers while the app is backgrounded, so without this the
 *  first poll after switching back can land late enough to lose a race against
 *  a short-lived "confirmed, not yet claimed" window on the server and come
 *  back 'expired' even though the user really did just complete sign-in. */
function sleepOrForeground(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(finish, ms);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') finish();
    });
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.remove();
      resolve();
    }
  });
}

const STORE_KEY = 'expert-ai.session';

/** A single hung request must not stall the whole poll loop until its overall
 *  deadline — each individual fetch gets its own short timeout so a bad
 *  network blip surfaces as "still pending, try again next tick" rather than
 *  hanging the loop for however long that one request takes to fail. */
/** Login endpoints: route through resilientFetch so sign-in also gets origin
 *  failover + retry on a flaky network (this is the very first thing a new user
 *  does — it must not fail on a hostile Wi-Fi). Accepts a full gateway URL for
 *  call-site compatibility and reduces it to a path. */
type AuthResponse = Pick<Response, 'ok' | 'status' | 'json'>;

/**
 * Auth requests are deliberately sent through React Native's XMLHttpRequest
 * bridge. Expo SDK 54's Winter fetch path can pass the JSON request body to
 * the native request.start method with the wrong bridged type in an R8 release
 * build (ReadableNativeMap -> ByteArray), which makes sign-in fail before the
 * gateway is reached. XHR is the long-standing RN transport and avoids that
 * typed Expo-fetch bridge entirely. Streaming chat continues to use expo/fetch.
 */
function nativeAuthRequest(url: string, options: RequestInit, timeoutMs: number): Promise<AuthResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const onAbort = () => finish(() => {
      xhr.abort();
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
    });
    const signal = options.signal;

    try {
      xhr.open(String(options.method ?? 'GET'), url, true);
      xhr.timeout = timeoutMs;
      if (options.headers && !Array.isArray(options.headers)) {
        Object.entries(options.headers as Record<string, string>).forEach(([key, value]) => {
          xhr.setRequestHeader(key, String(value));
        });
      }
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;
        finish(() => resolve({
          status: xhr.status,
          ok: xhr.status >= 200 && xhr.status < 300,
          json: async () => JSON.parse(xhr.responseText || '{}'),
        }));
      };
      xhr.onerror = () => finish(() => reject(new Error('Network request failed')));
      xhr.ontimeout = () => finish(() => reject(new Error('Network request timed out')));
      xhr.onabort = () => finish(() => reject(new Error('Aborted')));
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      xhr.send(typeof options.body === 'string' ? options.body : null);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<AuthResponse> {
  let path = url;
  for (const host of GATEWAY_HOSTS) {
    if (url.startsWith(host)) { path = url.slice(host.length); break; }
  }
  if (path.startsWith('http')) {
    // Not a gateway URL — fall back to a plain timed fetch.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  // Keep the same origin failover/retry behavior, but use RN XHR for the
  // non-streaming auth endpoints so release builds never enter Expo Winter
  // fetch's problematic typed native request bridge.
  let lastError: unknown;
  for (const host of GATEWAY_HOSTS) {
    try {
      return await nativeAuthRequest(`${host}${path}`, options, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

export interface Session {
  token: string;
  email: string;
  tier: Tier;
  expiresAt: number; // epoch seconds
}

let cached: Session | null | undefined; // undefined = not loaded yet

async function loadStored(): Promise<Session | null> {
  const raw = Platform.OS === 'web'
    ? (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })()
    : await SecureStore.getItemAsync(STORE_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (!session.token || session.expiresAt * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

/** Returns the signed-in session if present and not expired, else null — callers must not send
 *  a gateway request without one; there is no anonymous fallback. */
export async function getSession(): Promise<Session | null> {
  if (cached === undefined) cached = await loadStored();
  return cached;
}

/** Empty string when signed out — never sent, since every call site gates on `session` first. */
export function getActiveToken(session: Session | null): string {
  return session?.token ?? '';
}

export function getActiveTier(session: Session | null): Tier {
  return session?.tier ?? 'community';
}

async function persist(session: Session) {
  cached = session;
  const value = JSON.stringify(session);
  if (Platform.OS === 'web') {
    try { localStorage.setItem(STORE_KEY, value); } catch { /* browser storage may be blocked */ }
  } else {
    await SecureStore.setItemAsync(STORE_KEY, value);
  }
}

export async function signOut(): Promise<void> {
  cached = null;
  if (Platform.OS === 'web') {
    try { localStorage.removeItem(STORE_KEY); } catch { /* no-op */ }
  } else {
    await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
  }
}

export interface EmailCodeChallenge {
  nonce: string;
  email: string;
  expiresIn: number;
  codeLength: number;
}

/** Starts Ghost's native member email flow. No browser or redirect is involved. */
export async function requestSsvAsiaCode(email: string): Promise<EmailCodeChallenge> {
  const response = await fetchWithTimeout(`${GATEWAY_BASE_URL}/auth/native/email/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !data?.nonce) {
    throw new Error(data?.error || `Could not send the verification email (${response.status})`);
  }
  return data as EmailCodeChallenge;
}

/** Completes the native Ghost OTP flow and persists the app session. */
export async function verifySsvAsiaCode(nonce: string, code: string): Promise<Session> {
  const response = await fetchWithTimeout(`${GATEWAY_BASE_URL}/auth/native/email/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, code: code.replace(/\s/g, '') }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || `Verification failed (${response.status})`);
  }
  const payload = decodeSessionToken(data.token);
  const session: Session = {
    token: data.token,
    email: data.email ?? payload?.e ?? '',
    tier: (data.entitlement as Tier) ?? (payload?.t as Tier) ?? 'community',
    expiresAt: data.sessionExpires ?? payload?.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  await persist(session);
  return session;
}

/** Validates a stored session against the gateway during app startup. */
export async function restoreSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    const response = await fetchWithTimeout(`${GATEWAY_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${session.token}` },
    }, 8000);
    // Only an authenticated rejection proves that the session is invalid or
    // revoked. A 5xx/429, proxy failure, or maintenance response must not log
    // a user out after a transient gateway problem; keep the 30-day session
    // and let the next foreground/API retry recover normally.
    if (response.status === 401 || response.status === 403) {
      await signOut();
      return null;
    }
    if (!response.ok) return session;
    return session;
  } catch {
    // Keep a non-expired token during a transient offline launch; normal API calls
    // will retry and the next successful launch will validate it again.
    return session;
  }
}

/** Consumes the session returned by the browser Google OAuth callback. */
export async function consumeGoogleRedirectSession(): Promise<Session | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const token = url.searchParams.get('g_token');
  const email = url.searchParams.get('g_email');
  if (!token || !email) return null;
  const payload = decodeSessionToken(token);
  const session: Session = {
    token,
    email,
    tier: (payload?.t as Tier) ?? 'community',
    expiresAt: payload?.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  await persist(session);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
  return session;
}

interface StartResult {
  nonce: string;
  authUrl: string;
  expiresIn: number;
  /** True only for the demo@ssv.asia account — the gateway confirms this nonce immediately,
   *  server-side, before this even returns. No browser tab is needed or opened for it. */
  demo?: boolean;
}

async function startSignIn(email: string): Promise<StartResult> {
  const response = await fetchWithTimeout(`${GATEWAY_BASE_URL}/auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Sign-in failed (${response.status})`);
  }
  return data as StartResult;
}

interface AppStartResult {
  nonce: string;
  authUrl: string;
  expiresIn: number;
}

// The app-auth bridge uses a verifier generated on-device. The Worker stores only its hash, so a
// callback URL alone cannot redeem a session. Native builds use the registered app scheme; web
// keeps the HTTPS callback for the exported site.
function makeAuthVerifier(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  const bytes = new Uint8Array(64);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues: (array: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function appAuthCallbackUrl(): string {
  return Platform.OS === 'web' ? Linking.createURL('app-auth/callback') : 'expertai://auth-callback';
}

async function startAppSignIn(email: string, verifier: string, callback: string): Promise<AppStartResult> {
  const response = await fetchWithTimeout(`${GATEWAY_BASE_URL}/auth/app/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, verifier, callback }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.nonce || !data?.authUrl) {
    throw new Error(data?.error || `Sign-in failed (${response.status})`);
  }
  return data as AppStartResult;
}

async function appAuthStatus(nonce: string): Promise<'pending' | 'confirmed' | 'expired'> {
  const response = await fetchWithTimeout(
    `${GATEWAY_BASE_URL}/auth/app/status?nonce=${encodeURIComponent(nonce)}`,
    {},
    8000,
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Sign-in status failed (${response.status})`);
  return data?.status === 'confirmed' ? 'confirmed' : data?.status === 'expired' ? 'expired' : 'pending';
}

async function exchangeAppSignIn(nonce: string, verifier: string): Promise<Session> {
  const response = await fetchWithTimeout(`${GATEWAY_BASE_URL}/auth/app/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce, verifier }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || `Sign-in could not be completed (${response.status})`);
  }
  const payload = decodeSessionToken(data.token);
  const session: Session = {
    token: data.token,
    email: data.email ?? payload?.e ?? '',
    tier: (data.entitlement as Tier) ?? (payload?.t as Tier) ?? 'community',
    expiresAt: data.sessionExpires ?? payload?.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  await persist(session);
  return session;
}

async function runAppSignInFlow(
  email: string,
  onStatus?: (status: 'opening' | 'waiting') => void,
): Promise<Session> {
  const verifier = makeAuthVerifier();
  const callback = appAuthCallbackUrl();
  const start = await startAppSignIn(email, verifier, callback);
  onStatus?.('opening');
  onStatus?.('waiting');

  // Ghost owns the member email/magic-link flow. Do not depend on Android handing a custom
  // scheme back from Chrome Custom Tabs: the app watches the verifier-bound transaction directly
  // and closes the browser as soon as Ghost confirms the member.
  await WebBrowser.openBrowserAsync(start.authUrl);
  const deadline = Date.now() + start.expiresIn * 1000;
  while (Date.now() < deadline) {
    try {
      const status = await appAuthStatus(start.nonce);
      if (status === 'confirmed') {
        try { WebBrowser.dismissBrowser(); } catch { /* no-op */ }
        return exchangeAppSignIn(start.nonce, verifier);
      }
      if (status === 'expired') break;
    } catch {
      // A transient network failure is not a failed sign-in; retry on the next tick.
    }
    await sleepOrForeground(1500);
  }
  try { WebBrowser.dismissBrowser(); } catch { /* no-op */ }
  throw new Error('Sign-in timed out. Please try again.');
}

/** No-signup path — "Unlock 30 questions per day". Issues a fresh, unique synthetic
 *  community-tier identity server-side (never a real email); always resolves like the
 *  demo account (already confirmed, no browser tab needed). */
async function startTrial(): Promise<StartResult> {
  const response = await fetchWithTimeout(`${GATEWAY_BASE_URL}/auth/trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Couldn't start trial (${response.status})`);
  }
  return data as StartResult;
}

async function pollOnce(nonce: string): Promise<Session | 'pending' | 'expired'> {
  // A timed-out or network-failed poll tick is not a fatal sign-in failure —
  // it just means "no answer this round," same as an explicit 'pending'
  // status. The overall deadline in signInWithSsvAsia still bounds the whole
  // flow, so this can't hang forever even if every tick fails this way.
  let response: AuthResponse;
  try {
    response = await fetchWithTimeout(
      `${GATEWAY_BASE_URL}/auth/poll?nonce=${encodeURIComponent(nonce)}`,
      {},
      8000,
    );
  } catch {
    return 'pending';
  }
  const data = await response.json().catch(() => ({}));
  if (data.status === 'expired') return 'expired';
  if (data.status !== 'ok') return 'pending';
  return {
    token: data.token,
    email: data.email ?? '',
    tier: (data.entitlement as Tier) ?? 'community',
    expiresAt: data.sessionExpires,
  };
}

export interface SignInHandle {
  /** Cancels polling. Does not close an already-opened browser tab. */
  cancel: () => void;
}

/** Shared by both the email sign-in and the no-signup trial — everything after the
 *  /auth/start (or /auth/trial) call is identical: open a browser tab unless the
 *  nonce is already server-confirmed (demo/trial), then poll until resolved. */
async function runSignInFlow(
  { nonce, authUrl, expiresIn, demo }: StartResult,
  onStatus?: (status: 'opening' | 'waiting') => void,
): Promise<Session | 'expired'> {
  onStatus?.('opening');
  if (!demo) {
    // openAuthSessionAsync (not openBrowserAsync): on Android this additionally
    // watches AppState and auto-dismisses the tab the moment the app regains
    // foreground, and resolves instantly via Linking if ssv.asia's confirm page
    // ever redirects to redirectUrl. Fire-and-forget — the actual token still
    // comes from polling below, this call is only responsible for closing the
    // browser tab promptly so the user isn't left stranded on the "verified" page.
    const redirectUrl = Linking.createURL('auth-callback');
    WebBrowser.openAuthSessionAsync(authUrl, redirectUrl).catch(() => {});
  }
  // Demo account: the gateway already confirmed this nonce server-side before returning it —
  // no browser tab, no real sign-in page to show. Go straight to polling, which will resolve
  // almost immediately.

  onStatus?.('waiting');
  const deadline = Date.now() + expiresIn * 1000;
  while (Date.now() < deadline) {
    const result = await pollOnce(nonce);
    if (result === 'expired') return 'expired';
    if (result !== 'pending') {
      await persist(result);
      try {
        WebBrowser.dismissBrowser();
      } catch {
        // no-op: not supported/available on this platform
      }
      return result;
    }
    // Sleeps 2s, but wakes immediately if the app comes back to the foreground
    // (e.g. the user just returned from confirming in the browser) instead of
    // waiting out whatever's left of this interval — see sleepOrForeground.
    await sleepOrForeground(2000);
  }
  try {
    WebBrowser.dismissBrowser();
  } catch {
    // no-op
  }
  throw new Error('Sign-in timed out. Please try again.');
}

/**
 * Kicks off the app-auth flow: requests a verifier-bound nonce, opens the Ghost login/signup page
 * in a secure browser session, then exchanges the one-time callback for a normal Expert AI session.
 * Resolves with the new session once confirmed, or throws/rejects on failure.
 *
 * A single 'expired' result is retried once, automatically, with a fresh nonce
 * and browser tab, before surfacing an error — in practice the confirm-then-poll
 * race that produces 'expired' resolves cleanly on a second attempt (this is
 * exactly what manually tapping Sign In again was doing), so retrying here once
 * makes that recovery seamless instead of dumping the user back at a dead end.
 */
export async function signInWithSsvAsia(
  email: string,
  onStatus?: (status: 'opening' | 'waiting') => void,
): Promise<Session> {
  try {
    return await runAppSignInFlow(email, onStatus);
  } catch (firstError) {
    // An expired Ghost transaction is safe to retry once with a fresh verifier and nonce. Explicit
    // cancellation and ordinary validation errors should return immediately and preserve their UI.
    if (!/expired|incomplete|timed out/i.test(firstError instanceof Error ? firstError.message : String(firstError))) {
      throw firstError;
    }
    return runAppSignInFlow(email, onStatus);
  }
}

/**
 * "Unlock 30 questions per day" — no email, no signup. Issues a brand-new synthetic
 * community-tier identity and signs into it immediately; same retry-once-on-expired
 * behavior as the real sign-in flow.
 */
export async function startFreeTrial(
  onStatus?: (status: 'opening' | 'waiting') => void,
): Promise<Session> {
  const first = await runSignInFlow(await startTrial(), onStatus);
  if (first !== 'expired') return first;

  const second = await runSignInFlow(await startTrial(), onStatus);
  if (second !== 'expired') return second;

  throw new Error('Could not start trial. Please try again.');
}

/** Minimal base64url decoder — no signature verification (that already happens
 *  server-side on every subsequent request; this is purely to read `tier`/`exp`
 *  for local display without an extra round-trip). Hand-rolled instead of relying
 *  on a global `atob` existing under Hermes, which isn't guaranteed across RN
 *  versions. */
function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of padded) {
    if (ch === '=') break;
    const value = chars.indexOf(ch);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

interface SessionTokenPayload {
  e: string; // email
  t: string; // tier
  exp: number; // epoch seconds
  u?: string; // Ghost member uuid — only present when the session went through
  // a real Ghost-backed sign-in (magic-link or Google); a synthetic trial
  // identity has no Ghost record and so no uuid.
  [key: string]: unknown;
}

/** Ghost member uuid embedded in a session token, if any — needed for the
 *  /memory/* endpoints, which authenticate via {email, uuid} rather than the
 *  bearer token every other endpoint uses. Returns undefined for sessions
 *  with no Ghost record (the synthetic trial identity, or an edge case in the
 *  Google sign-in path that doesn't resolve one) — callers must treat that as
 *  "memory isn't available for this account", not retry/error. */
export function getSessionUuid(token: string): string | undefined {
  return decodeSessionToken(token)?.u;
}

function decodeSessionToken(token: string): SessionTokenPayload | null {
  try {
    const [payloadB64] = token.split('.');
    return JSON.parse(base64UrlDecode(payloadB64)) as SessionTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Native Google Sign-In — takes the ID token from the on-device Google Sign-In
 * SDK (see components/google-sign-in-button.tsx) and exchanges it with the
 * gateway for a real ssv.asia session, entirely in-app: no browser, no redirect.
 * The gateway verifies the ID token server-side (RS256 signature + aud/iss/exp/
 * email_verified against Google's own keys) before minting a session — this
 * function never trusts the client-supplied token on its own.
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<Session> {
  const response = await fetchWithTimeout(`${GATEWAY_BASE_URL}/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || `Google sign-in failed (${response.status})`);
  }
  const payload = decodeSessionToken(data.token);
  const session: Session = {
    token: data.token,
    email: data.email ?? payload?.e ?? '',
    tier: (payload?.t as Tier) ?? 'community',
    expiresAt: payload?.exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  await persist(session);
  return session;
}
