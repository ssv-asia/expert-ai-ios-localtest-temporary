// Founder-only admin console client. Every function here sends the caller's OWN normal ssv.asia
// session token (the exact same token every other authenticated call in this app already uses) —
// never a shared secret. The worker re-verifies server-side, on every single call, that the
// signed-in email really is FOUNDER_EMAIL before running anything (see requireAdmin() in
// worker/src/index.js) — this file has no privileged material in it at all, so nothing here is
// sensitive if the APK is decompiled. Only wire this UI up behind a client-side
// `session?.email === 'mail@ssv.asia'` check for UX (hide the button from everyone else) — the
// real enforcement is entirely server-side and does not depend on that check.
import { friendlyNetworkError, resilientFetch } from './gateway-client';

async function adminFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // Route through resilientFetch: custom-domain primary + workers.dev fallback +
    // per-attempt timeout + bounded retry. This is why the admin console used to
    // hang / never load on Wi-Fi networks that NXDOMAIN the *.workers.dev apex.
    response = await resilientFetch(
      path,
      {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      } as Parameters<typeof resilientFetch>[1],
      { attemptTimeoutMs: 15000, retries: 2 },
    );
  } catch (err) {
    throw new Error(friendlyNetworkError(err));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`);
  }
  return data as T;
}

export interface AdminMember {
  email: string;
  member: boolean;
  entitlement: string | null;
  banned: boolean;
  mcp: { credits: number; queries: number };
  passActive: boolean;
  monthly: boolean;
  secondsLeft: number;
  tier: string;
  budgets: Record<string, number>;
  used: Record<string, number>;
  opusCap?: number;
}

export function lookupMember(token: string, email: string): Promise<AdminMember> {
  return adminFetch<AdminMember>(token, `/admin/member?email=${encodeURIComponent(email)}`);
}

export interface GrantResult {
  ok: true;
  email: string;
  tier: string;
  passActive: boolean;
  secondsLeft: number;
}

/** Starts/extends a pass for `email` at `tier` (researcher|engineer|professional|aec|foundation).
 *  hours defaults to the standard 6h pass if omitted — pass any value to grant a custom window
 *  (e.g. a full 720h/30-day comp). Stacks with any pass already active, same as a real purchase. */
export function grantPass(token: string, email: string, tier: string, hours?: number): Promise<GrantResult> {
  return adminFetch<GrantResult>(token, '/admin/grant', {
    method: 'POST',
    body: JSON.stringify({ email, tier, ...(hours ? { hours } : {}) }),
  });
}

export function setBanned(token: string, email: string, banned: boolean): Promise<{ ok: true; email: string; banned: boolean }> {
  return adminFetch(token, banned ? '/admin/ban' : '/admin/unban', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Revokes just the active pass (e.g. after a refund) — the account stays usable on community tier. */
export function revokePass(token: string, email: string): Promise<{ ok: true; email: string; revoked: true }> {
  return adminFetch(token, '/admin/revoke', { method: 'POST', body: JSON.stringify({ email }) });
}

/** Full reset — clears pass, community counters, everything except ban state. Destructive; confirm
 *  with the founder before calling. */
export function resetMember(token: string, email: string): Promise<{ ok: true; email: string }> {
  return adminFetch(token, '/admin/reset', { method: 'POST', body: JSON.stringify({ email }) });
}

export interface UsageSummary {
  days: { day: string; reqs: number; tokens: number; cost: number; tiers: Record<string, number> }[];
  all: { reqs: number; tokens: number; cost: number };
  capToday: number;
}

export function fetchUsage(token: string, days = 7): Promise<UsageSummary> {
  return adminFetch<UsageSummary>(token, `/admin/usage?days=${days}`);
}

// ---------------------------------------------------------------------------
// Model / key pool — the OpenRouter API keys backing every router (free/pro/foundation/aec).
// "Controlling the models" in practice means controlling THIS pool: which keys are live, forcing
// a health check, or reviving one the worker marked dead after repeated failures.
export interface KeyStatus {
  fp: string; // fingerprint — keys are never sent in full, even to the founder's own session
  dead: boolean;
  cooling: boolean;
  fails: number;
  uses: number;
  lastError: string;
}

export function listKeys(token: string): Promise<{ count: number; keys: KeyStatus[] }> {
  return adminFetch(token, '/admin/keys');
}

export function testKeys(token: string): Promise<{ tested: number; results: { fp: string; ok: boolean; status: number; err: string }[] }> {
  return adminFetch(token, '/admin/keys/test', { method: 'POST' });
}

export function reviveKey(token: string, fp: string): Promise<Record<string, unknown>> {
  return adminFetch(token, '/admin/keys/revive', { method: 'POST', body: JSON.stringify({ fp }) });
}

// ---------------------------------------------------------------------------
// Member directory — Ghost's full member list with resolved tier. Read-only; live pass state for
// one person still needs lookupMember() (Ghost's tier is the entitlement, not the live per-DO pass).
export interface MemberSummary { email: string; tier: string; status: string; name: string }

export function listMembers(
  token: string,
  opts?: { tier?: string; nonCommunity?: boolean },
): Promise<{ total: number; counts: Record<string, number>; members: MemberSummary[] }> {
  const params = new URLSearchParams();
  if (opts?.tier) params.set('tier', opts.tier);
  if (opts?.nonCommunity) params.set('nonCommunity', '1');
  const qs = params.toString();
  return adminFetch(token, `/admin/members${qs ? `?${qs}` : ''}`);
}

// Relabels a member's Ghost entitlement tier, and (unless activate:false) grants/refreshes the
// matching 30-day standing pass in the same call — one action both fixes the label and turns it on.
export function setMemberTier(
  token: string,
  email: string,
  tier: string,
  activate = true,
): Promise<Record<string, unknown>> {
  return adminFetch(token, '/admin/tier', { method: 'POST', body: JSON.stringify({ email, tier, activate }) });
}

// ---------------------------------------------------------------------------
// Payments / refunds
export interface PaymentRecord {
  id?: string;
  email?: string;
  tier?: string;
  kind?: string;
  amount?: number;
  ts?: number;
  refunded?: boolean;
}

export function listPayments(token: string, email?: string, n = 50): Promise<{ email: string | null; payments: PaymentRecord[] }> {
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  params.set('n', String(n));
  return adminFetch(token, `/admin/payments?${params.toString()}`);
}

/** Razorpay refund + automatic claw-back (revokes the pass it granted, or deducts MCP credits it topped up). */
export function refundPayment(
  token: string,
  paymentId: string,
): Promise<{ ok: true; payment_id: string; email: string | null; creditsClawed: number; passRevoked: boolean }> {
  return adminFetch(token, '/admin/refund', { method: 'POST', body: JSON.stringify({ payment_id: paymentId }) });
}

// ---------------------------------------------------------------------------
// MCP prepaid credits (₹1 = 1 AEC search) — separate economy from the token passes above.
export function grantCredits(token: string, email: string, credits: number): Promise<{ ok: true; email: string; credits: number }> {
  return adminFetch(token, '/admin/credits', { method: 'POST', body: JSON.stringify({ email, credits }) });
}

export function mintMcpLink(token: string, email: string, days = 90): Promise<{ ok: true; email: string; link: string; expiresDays: number }> {
  return adminFetch(token, '/admin/mcp-link', { method: 'POST', body: JSON.stringify({ email, days }) });
}

// ---------------------------------------------------------------------------
// Audit trail — recent grants / refunds / bans, for reconciliation.
export interface AuditEvent { at?: string; ts?: number; email?: string; [key: string]: unknown }

export function fetchAudit(token: string, n = 50): Promise<{ events: AuditEvent[] }> {
  return adminFetch(token, `/admin/audit?n=${n}`);
}

// ---------------------------------------------------------------------------
// KPIs / stats dashboards — deep, evolving shapes (revenue, funnel, growth, key-pool health,
// website analytics, spend reconciliation). Left loosely typed on purpose: this is a read-only
// display surface, and a shape change on the worker side should never break the build — only
// change what's shown, gracefully. Render defensively (optional chaining, fallbacks).
export type AdminKpis = Record<string, any>;
export type AdminStats = Record<string, any>;

export function fetchKpis(token: string): Promise<AdminKpis> {
  return adminFetch(token, '/admin/kpis');
}

export function fetchStats(token: string): Promise<AdminStats> {
  return adminFetch(token, '/admin/stats');
}
