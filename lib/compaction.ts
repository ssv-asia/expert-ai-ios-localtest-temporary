// Conversation compaction — the gap that mirrors Claude Code's own /compact.
// Without this, every single turn resent the ENTIRE message history from the
// start of the conversation, forever — linearly growing cost and latency with
// no ceiling. This keeps the most recent messages verbatim and folds
// everything older into one running summary, regenerated incrementally (old
// summary + only the newly-aged-out messages, never the whole history again)
// so the summarization call itself stays cheap regardless of how long the
// conversation ultimately gets.
import type { ChatMessage } from './gateway-client';
import { streamChatCompletion } from './gateway-client';

export interface DisplayMessageLike {
  role: 'user' | 'assistant';
  text: string;
}

// Below this many messages, compaction does nothing — not worth the extra
// completion call for a short chat.
const TRIGGER_MESSAGE_COUNT = 30;
// Always kept verbatim, uncompacted — recent turns matter most for coherence.
const KEEP_RECENT_COUNT = 12;

interface CompactionState {
  summary: string;
  /** How many of the OLDER (not-kept-recent) messages this summary covers. */
  summarizedCount: number;
}

const stateByConversation = new Map<string, CompactionState>();

/** Drop cached state for a conversation — call when it's deleted or cleared,
 *  so a reused/new conversation id (shouldn't happen, but defensively) never
 *  inherits a stale summary. */
export function clearCompactionState(conversationId: string): void {
  stateByConversation.delete(conversationId);
}

async function summarize(
  priorSummary: string | null,
  newOlderMessages: DisplayMessageLike[],
  session: { token: string },
  model: string,
): Promise<string> {
  const transcript = newOlderMessages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
  const prompt = priorSummary
    ? `Existing summary of the conversation so far:\n"""\n${priorSummary}\n"""\n\nAdditional messages that happened since that summary:\n"""\n${transcript}\n"""\n\nProduce ONE updated summary covering everything (the existing summary plus the new messages) — concise, preserving names/decisions/facts/ongoing context a reply would need. Reply with ONLY the summary.`
    : `Summarize this part of a conversation concisely, preserving names/decisions/facts/ongoing context a reply would need:\n"""\n${transcript}\n"""\n\nReply with ONLY the summary.`;

  let result = '';
  await new Promise<void>((resolve) => {
    streamChatCompletion(
      [{ role: 'system', content: 'You summarize conversations concisely and factually. Output only the summary, no preamble.' }, { role: 'user', content: prompt }],
      { token: session.token, model },
      {
        onDelta: (chunk: string) => { result += chunk; },
        onDone: () => resolve(),
        onError: () => resolve(),
      },
    );
  });
  return result.trim();
}

/**
 * Returns the ChatMessage array to actually send: recent messages verbatim,
 * older ones folded into a summary system-message when the conversation is
 * long enough to warrant it. Falls back to the full uncompacted history on
 * any failure — compaction is a cost/latency optimization, never something
 * that should be able to break a send.
 */
export async function buildHistoryForSend(
  conversationId: string,
  systemMessage: ChatMessage,
  messages: DisplayMessageLike[],
  session: { token: string },
  model: string,
): Promise<ChatMessage[]> {
  const toChatMessage = (m: DisplayMessageLike): ChatMessage => ({ role: m.role, content: m.text });

  if (messages.length <= TRIGGER_MESSAGE_COUNT) {
    return [systemMessage, ...messages.map(toChatMessage)];
  }

  try {
    const olderMessages = messages.slice(0, messages.length - KEEP_RECENT_COUNT);
    const recentMessages = messages.slice(messages.length - KEEP_RECENT_COUNT);
    const existing = stateByConversation.get(conversationId) ?? null;

    let summary: string;
    if (existing && existing.summarizedCount === olderMessages.length) {
      // Already covers exactly this much — nothing new to fold in.
      summary = existing.summary;
    } else {
      const alreadyCovered = existing?.summarizedCount ?? 0;
      const newOlder = olderMessages.slice(alreadyCovered);
      summary = await summarize(existing?.summary ?? null, newOlder, session, model);
      if (!summary) {
        // Summarization failed silently (onError path) — don't cache a blank
        // summary, and fall through to sending full history this once.
        return [systemMessage, ...messages.map(toChatMessage)];
      }
      stateByConversation.set(conversationId, { summary, summarizedCount: olderMessages.length });
    }

    return [
      systemMessage,
      { role: 'system', content: `Summary of earlier conversation (for context, not verbatim):\n${summary}` },
      ...recentMessages.map(toChatMessage),
    ];
  } catch {
    return [systemMessage, ...messages.map(toChatMessage)];
  }
}
