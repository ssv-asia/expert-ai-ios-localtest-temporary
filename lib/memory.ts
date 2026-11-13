// Native client for ssv.asia/memo — a single free-text "memory" field per
// user (rules, role, tone, projects — whatever the user wants the assistant
// to already know), the same one editable at https://ssv.asia/memo. Auth here
// is DIFFERENT from every other gateway endpoint: {email, uuid} in the body,
// not a bearer token — uuid is the Ghost member uuid, present only for
// sessions that went through a real Ghost-backed sign-in (magic-link or
// Google). A synthetic trial identity has no Ghost record and so no uuid;
// callers must treat that as "memory isn't available", not an error to retry.
import { getSessionUuid, type Session } from './auth';
import { resilientFetch } from './gateway-client';

// The web page enforces this client-side too (there's no server-side
// rejection — the server silently truncates at 4000 chars/~500 words and
// returns whatever it actually kept). Matching the same limit here keeps the
// native experience honest with what will actually be saved.
export const MEMORY_MAX_WORDS = 500;
export const MEMORY_MAX_CHARS = 4000;

export interface MemoryResult {
  text: string;
  updated: number;
}

export function hasMemorySupport(session: Session | null): boolean {
  return !!session && !!getSessionUuid(session.token);
}

export async function fetchMemory(session: Session): Promise<MemoryResult> {
  const uuid = getSessionUuid(session.token);
  if (!uuid) throw new Error("Memory isn't available for this sign-in method yet.");
  const response = await resilientFetch(
    '/memory/me',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: session.email, uuid }),
    },
    { attemptTimeoutMs: 8000, retries: 1 },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Couldn't load your memory (${response.status})`);
  }
  return { text: data.text ?? '', updated: data.updated ?? 0 };
}

// Heuristic only — deliberately generous rather than clever, since a false
// positive here just costs one extra silent completion call, while a false
// negative means "remember this" silently does nothing, which is worse.
const MEMORY_FACT_TRIGGER_RE =
  /\b(remember (this|that|it)|commit (this |that )?to memory|don'?t forget|keep in mind|for future reference|my name is|call me\b|i (work|live) (as|at|in)|i'?m an?\s)/i;

// A stronger, explicit ask — "save this to memory"/"save this conversation" —
// means capture the CONVERSATION's key points and context, not just distill
// one line from the single latest message. Checked separately so the two
// intents get genuinely different handling, not the same extraction with a
// different label.
const MEMORY_FULL_CONTEXT_TRIGGER_RE =
  /\bsave (this|it|our)?\s?(conversation|convo|chat)?\s?to memory\b|\bsave (this|our) (conversation|convo|chat)\b/i;

export type MemoryTriggerKind = 'fact' | 'full-context' | null;

export function classifyMemoryTrigger(userText: string): MemoryTriggerKind {
  if (MEMORY_FULL_CONTEXT_TRIGGER_RE.test(userText)) return 'full-context';
  if (MEMORY_FACT_TRIGGER_RE.test(userText)) return 'fact';
  return null;
}

/** @deprecated use classifyMemoryTrigger — kept only if anything else imports it. */
export function looksLikeMemoryRequest(userText: string): boolean {
  return classifyMemoryTrigger(userText) !== null;
}

/** Merges a newly-extracted fact into existing memory text, trimmed to the
 *  word cap (oldest lines dropped first — a running note, not an archive). */
export function mergeMemoryFact(existingText: string, newFact: string): string {
  const merged = existingText.trim() ? `${existingText.trim()}\n${newFact.trim()}` : newFact.trim();
  const words = merged.split(/\s+/);
  if (words.length <= MEMORY_MAX_WORDS) return merged;
  // Drop whole leading lines (oldest facts) until back under the cap, rather
  // than truncating mid-sentence.
  const lines = merged.split('\n');
  while (lines.length > 1 && lines.join(' ').split(/\s+/).length > MEMORY_MAX_WORDS) {
    lines.shift();
  }
  return lines.join('\n');
}

export async function saveMemory(session: Session, text: string): Promise<MemoryResult> {
  const uuid = getSessionUuid(session.token);
  if (!uuid) throw new Error("Memory isn't available for this sign-in method yet.");
  const response = await resilientFetch(
    '/memory/save',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: session.email, uuid, text: text.slice(0, MEMORY_MAX_CHARS) }),
    },
    { attemptTimeoutMs: 10000, retries: 1 },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Couldn't save your memory (${response.status})`);
  }
  return { text: data.text ?? '', updated: data.updated ?? 0 };
}
