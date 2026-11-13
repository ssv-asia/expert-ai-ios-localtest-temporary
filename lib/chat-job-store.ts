import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { createChatJob, getChatJob, retryChatJob, type ChatJob } from './chat-jobs';
import type { ChatMessage } from './gateway-client';

const STORAGE_KEY = '@expert-ai/pending-chat-jobs-v1';
const STORAGE_PATH = `${FileSystem.documentDirectory}pending-chat-jobs-v1.json`;
const HISTORY_KEY = '@expert-ai/chat-job-history-v1';
const HISTORY_PATH = `${FileSystem.documentDirectory}chat-job-history-v1.json`;
const MAX_HISTORY = 40;
let writeChain: Promise<void> = Promise.resolve();

export interface PendingChatJob {
  jobId: string;
  idempotencyKey?: string;
  pushToken?: string;
  scheduledFor?: number;
  model?: string;
  messages?: ChatMessage[];
  conversationId?: string;
  assistantMessageId: string;
  createdAt: number;
}

export interface ChatJobHistoryEntry {
  jobId: string;
  conversationId?: string;
  assistantMessageId: string;
  status: ChatJob['status'];
  textPreview?: string;
  error?: string | null;
  completedAt: number;
}

async function readHistory(): Promise<ChatJobHistoryEntry[]> {
  const raw = Platform.OS === 'web'
    ? localStorage.getItem(HISTORY_KEY)
    : (await FileSystem.getInfoAsync(HISTORY_PATH)).exists
      ? await FileSystem.readAsStringAsync(HISTORY_PATH)
      : null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item?.jobId && item?.assistantMessageId && item?.status) : [];
  } catch { return []; }
}

async function writeHistory(items: ChatJobHistoryEntry[]): Promise<void> {
  const value = JSON.stringify(items.slice(-MAX_HISTORY));
  if (Platform.OS === 'web') await Promise.resolve(localStorage.setItem(HISTORY_KEY, value));
  else await FileSystem.writeAsStringAsync(HISTORY_PATH, value);
}

async function recordHistoryUnsafe(entry: ChatJobHistoryEntry): Promise<void> {
  const items = await readHistory();
  const next = items.filter((item) => item.jobId !== entry.jobId);
  next.push({ ...entry, textPreview: entry.textPreview?.slice(0, 240), error: entry.error?.slice(0, 500) });
  await writeHistory(next);
}

/** Retain a compact local audit trail after a durable job leaves active recovery. */
export async function recordChatJobHistory(entry: ChatJobHistoryEntry): Promise<void> {
  const operation = writeChain.then(() => recordHistoryUnsafe(entry));
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

export async function readChatJobHistory(): Promise<ChatJobHistoryEntry[]> { return readHistory(); }

async function readAll(): Promise<PendingChatJob[]> {
  const raw = Platform.OS === 'web'
    ? localStorage.getItem(STORAGE_KEY)
    : (await FileSystem.getInfoAsync(STORAGE_PATH)).exists
      ? await FileSystem.readAsStringAsync(STORAGE_PATH)
      : null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item) => (item?.jobId || item?.idempotencyKey) && item?.assistantMessageId)
      : [];
  } catch {
    return [];
  }
}

async function writeAll(items: PendingChatJob[]): Promise<void> {
  const value = JSON.stringify(items.slice(-32));
  if (Platform.OS === 'web') await Promise.resolve(localStorage.setItem(STORAGE_KEY, value));
  else await FileSystem.writeAsStringAsync(STORAGE_PATH, value);
}

/** Persist the relationship between a server job and its local assistant row. */
export async function rememberChatJob(job: PendingChatJob): Promise<void> {
  const operation = writeChain.then(async () => {
    const items = await readAll();
    const next = items.filter((item) => item.jobId !== job.jobId && item.assistantMessageId !== job.assistantMessageId);
    next.push(job);
    await writeAll(next);
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** Write the create intent before the network request so a process kill cannot
 * orphan a server job. The gateway idempotency key makes re-attachment safe. */
export async function rememberChatJobIntent(job: Omit<PendingChatJob, 'jobId'> & { idempotencyKey: string; model: string; messages: ChatMessage[] }): Promise<void> {
  const operation = writeChain.then(async () => {
    const items = await readAll();
    const next = items.filter((item) => item.assistantMessageId !== job.assistantMessageId);
    next.push({ ...job, jobId: '' });
    await writeAll(next);
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

export async function forgetChatJob(jobId: string): Promise<void> {
  const operation = writeChain.then(async () => {
    await writeAll((await readAll()).filter((item) => item.jobId !== jobId));
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** Remove an unsubmitted create intent by its local assistant row. */
export async function forgetChatJobIntent(assistantMessageId: string): Promise<void> {
  const operation = writeChain.then(async () => {
    await writeAll((await readAll()).filter((item) => item.assistantMessageId !== assistantMessageId));
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** Read pending jobs after app restart; expired jobs are removed locally. */
export async function reconcilePendingChatJobs(token: string): Promise<(PendingChatJob & { state: ChatJob })[]> {
  const operation = writeChain.then(async () => {
    const now = Date.now();
    const pending = await readAll();
    const results: (PendingChatJob & { state: ChatJob })[] = [];
    const keep: PendingChatJob[] = [];

    // Four concurrent reads make cold-start recovery quick for multi-chat users
    // without creating a request burst on the free-plan gateway.
    for (let offset = 0; offset < pending.length; offset += 4) {
      const batch = pending.slice(offset, offset + 4);
      const recovered = await Promise.all(batch.map(async (item) => {
        try {
          if (!item.jobId) {
            if (!item.idempotencyKey || !item.model || !item.messages) return { item, state: null };
            const created = await createChatJob({ token, idempotencyKey: item.idempotencyKey, model: item.model, messages: item.messages, conversationId: item.conversationId, pushToken: item.pushToken, scheduledFor: item.scheduledFor });
            return { item: { ...item, jobId: created.jobId }, state: created };
          }
          let state = await getChatJob(token, item.jobId);
          // Mirror the gateway's stale-running threshold so a cold start can
          // recover a job whose Worker invocation died without a final state.
          if (state.status === 'running' && Date.now() - state.updatedAt >= 2 * 60 * 1000) {
            state = await retryChatJob(token, item.jobId);
          }
          return { item, state };
        } catch {
          // Preserve the item through temporary offline/auth/network failures.
          return { item, state: null };
        }
      }));
      for (const { item, state } of recovered) {
        if (!state) {
          keep.push(item);
          continue;
        }
        // A process can die after persisting the create intent but before the
        // server response is written locally. The idempotent create call above
        // safely reattaches to that server job; persist the recovered ID now
        // so subsequent launches reconcile by job ID instead of recreating by
        // idempotency key and so the caller receives the recovered state.
        const resolvedItem = item.jobId ? item : { ...item, jobId: state.jobId };
        // Completed jobs are acknowledged below and cancelled jobs are no
        // longer recoverable. Failed jobs must remain locally linked until the
        // user retries or dismisses them; otherwise a process kill between
        // showing the error and pressing Retry loses the server job id.
        if (state.expiresAt > now && !['completed', 'cancelled'].includes(state.status)) keep.push(resolvedItem);
        if (['completed', 'failed', 'cancelled', 'dead_letter'].includes(state.status)) {
          await recordHistoryUnsafe({ jobId: resolvedItem.jobId, conversationId: resolvedItem.conversationId, assistantMessageId: resolvedItem.assistantMessageId, status: state.status, textPreview: state.text, error: state.error, completedAt: state.updatedAt });
        }
        if (state.expiresAt > now) results.push({ ...resolvedItem, state });
      }
    }
    await writeAll(keep);
    return results;
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  return operation;
}
