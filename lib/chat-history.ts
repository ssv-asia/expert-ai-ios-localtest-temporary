// Local conversation history — persisted via localStorage (web) or expo-file-system
// (native). Chat history is device-local, not synced to the gateway (stateless).
//
// Native uses expo-file-system/legacy explicitly: the new File/Paths class API caused
// a hard crash here before (`this.validatePath is not a function`), and SecureStore
// (used elsewhere in this app) caps values at ~2KB per key — too small for a growing
// chat history. The legacy file API has none of those problems on native and is what
// this file used successfully before; bare `localStorage` only worked because it was
// tested in a web browser preview, where it genuinely exists — React Native has no
// global localStorage on native, so that path alone would silently fail (or throw)
// on a real device build, which is the exact bug this file exists to fix.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Non-sensitive route attribution captured from the stream metadata. */
  servedModel?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  modelId: string;
  updatedAt: number;
  /** Pinned conversations sort above everything else in listConversations. */
  pinned?: boolean;
  /** Project this chat is organized under, if any — see lib/projects-store.ts.
   *  A chat can belong to at most one project. */
  projectId?: string;
}

const STORAGE_KEY_CONVERSATIONS = 'chat_conversations_v1';
const STORAGE_KEY_LAST_ACTIVE = 'chat_last_active_v1';
const STORAGE_KEY_DRAFTS = 'chat_drafts_v1';

const conversationsPath = `${FileSystem.documentDirectory}${STORAGE_KEY_CONVERSATIONS}.json`;
const conversationsBackupPath = `${conversationsPath}.bak`;
const conversationsTempPath = `${conversationsPath}.tmp`;
const lastActivePath = `${FileSystem.documentDirectory}${STORAGE_KEY_LAST_ACTIVE}.json`;
const draftsPath = `${FileSystem.documentDirectory}${STORAGE_KEY_DRAFTS}.json`;

let cache: Conversation[] | null = null;
let mutationChain: Promise<void> = Promise.resolve();

async function readKey(webKey: string, nativePath: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(webKey);
  }
  const info = await FileSystem.getInfoAsync(nativePath);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(nativePath);
}

async function writeKey(webKey: string, nativePath: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(webKey, value);
    return;
  }
  await FileSystem.writeAsStringAsync(nativePath, value);
}

/**
 * History is user data, not a cache. A direct write can leave a truncated JSON
 * file if Android kills the process during the write. Keep one known-good
 * backup and replace the primary only after the new payload is complete.
 */
async function writeConversationHistory(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, value);
    return;
  }

  await FileSystem.writeAsStringAsync(conversationsTempPath, value);
  const current = await FileSystem.getInfoAsync(conversationsPath);
  if (current.exists) {
    await FileSystem.deleteAsync(conversationsBackupPath, { idempotent: true });
    await FileSystem.copyAsync({ from: conversationsPath, to: conversationsBackupPath });
    await FileSystem.deleteAsync(conversationsPath, { idempotent: true });
  }
  await FileSystem.moveAsync({ from: conversationsTempPath, to: conversationsPath });
}

async function readConversationHistory(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(STORAGE_KEY_CONVERSATIONS);
  const candidates = [conversationsPath, conversationsBackupPath, conversationsTempPath];
  let foundFile = false;
  for (const path of candidates) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        foundFile = true;
        const raw = await FileSystem.readAsStringAsync(path);
        // Validate before returning so a truncated primary falls through to
        // the backup instead of being treated as an empty history.
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return raw;
      }
    } catch {
      // Try the next recovery copy.
    }
  }
  if (foundFile) throw new Error('No valid conversation history snapshot found');
  return null;
}

// Tracks which conversation was on screen, so a cold relaunch (app killed by
// the OS in the background — e.g. a Samsung Fold's inner/outer display switch
// can trigger this — resumes the same conversation instead of opening blank.
export async function getLastActiveConversationId(): Promise<string | null> {
  try {
    const raw = await readKey(STORAGE_KEY_LAST_ACTIVE, lastActivePath);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

export async function setLastActiveConversationId(id: string): Promise<void> {
  try {
    await writeKey(STORAGE_KEY_LAST_ACTIVE, lastActivePath, JSON.stringify({ id }));
  } catch {
    // Best-effort; losing this pointer just means the next launch starts fresh.
  }
}

async function readAll(): Promise<Conversation[]> {
  if (cache) return cache;
  try {
    const raw = await readConversationHistory();
    if (!raw) {
      cache = [];
      return cache;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid conversation history shape');
    cache = parsed;
  } catch (error) {
    // Never turn an unreadable file into an empty cache: a later save of that
    // empty cache would overwrite recoverable user data. Keep the in-memory
    // snapshot if one exists, otherwise fail closed with no write scheduled.
    if (cache) return cache;
    throw error;
  }
  return cache;
}

// Unlike daily notes (capped at 400) and scheduled tasks (capped at 40), this
// file had NO growth bound at all — an active daily user could accumulate an
// unbounded number of conversations, each holding its full message history,
// forever growing the on-device JSON file this all lives in. Bounded the same
// way scheduled-tasks/store.ts already does it: pinned conversations are
// never evicted (a user pinned them on purpose), the rest are capped by most
// recent. Conversations assigned to a Project are protected the same way as
// pinned ones — a user deliberately organized it there, and silently
// dropping it out of that project's chat list (with no indication anything
// was evicted) would be a confusing, hard-to-notice data loss.
const MAX_CONVERSATIONS = 200;

function boundConversations(conversations: Conversation[]): Conversation[] {
  const protected_ = conversations.filter((c) => c.pinned || c.projectId);
  const rest = conversations
    .filter((c) => !c.pinned && !c.projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(0, MAX_CONVERSATIONS - protected_.length));
  return [...protected_, ...rest];
}

async function writeAll(conversations: Conversation[]) {
  const bounded = boundConversations(conversations);
  const payload = JSON.stringify(bounded);
  await writeConversationHistory(payload);
  cache = bounded;
}

/** Serialize read-modify-write operations so concurrent stream checkpoints
 * cannot overwrite each other's latest conversation state. */
async function mutateAll(mutator: (conversations: Conversation[]) => Conversation[]): Promise<void> {
  const operation = mutationChain.then(async () => {
    const all = await readAll();
    await writeAll(mutator(all));
  });
  mutationChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

export async function listConversations(): Promise<Conversation[]> {
  const all = await readAll();
  return [...all].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

function makeTitle(messages: StoredMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser || !firstUser.text.trim()) return 'New chat';
  const trimmed = firstUser.text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

export async function saveConversation(
  id: string,
  messages: StoredMessage[],
  modelId: string,
): Promise<void> {
  if (messages.length === 0) return;
  await mutateAll((all) => {
    const existingIndex = all.findIndex((c) => c.id === id);
    const previous = existingIndex >= 0 ? all[existingIndex] : undefined;
    // A stale React effect can arrive after a newer checkpoint (especially
    // during backgrounding or chat switching). Never replace a richer history
    // with a strict subset that contains no new message IDs. Explicit edits
    // create new IDs and therefore still replace the edited branch normally.
    const incomingIds = new Set(messages.map((message) => message.id));
    const isStrictStaleSubset = previous && messages.length < previous.messages.length
      && messages.every((message) => incomingIds.has(message.id))
      && previous.messages.some((message) => !incomingIds.has(message.id));
    const safeMessages = isStrictStaleSubset ? previous.messages : messages;
    const conversation: Conversation = {
      id,
      title: makeTitle(safeMessages),
      messages: safeMessages,
      modelId,
      updatedAt: Date.now(),
      // Preserve pin state and project link across every re-save (each streamed
      // exchange rewrites this whole object) — without this, pinning a chat (or
      // its project assignment) would silently reset the next time a message
      // was sent in it.
      pinned: existingIndex >= 0 ? all[existingIndex].pinned : undefined,
      projectId: existingIndex >= 0 ? all[existingIndex].projectId : undefined,
    };
    if (existingIndex >= 0) all[existingIndex] = conversation;
    else all.push(conversation);
    return all;
  });
}

/** Creates a chat immediately linked to a project, before any message has
 *  been sent — normally `saveConversation` no-ops on an empty message list
 *  (abandoned chats shouldn't clutter history), but a chat started from
 *  inside a Project should show up there right away, not only after the
 *  first message. */
export async function createEmptyConversation(id: string, projectId: string, modelId: string): Promise<void> {
  await mutateAll((all) => [...all, { id, title: 'New chat', messages: [], modelId, updatedAt: Date.now(), projectId }]);
}

export async function togglePinConversation(id: string): Promise<void> {
  await mutateAll((all) => all.map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item));
}

/** Manually assigns (or clears, with `null`) an existing chat's project —
 *  the Chat History sheet's per-row "move to project" action. */
export async function assignConversationToProject(id: string, projectId: string | null): Promise<void> {
  await mutateAll((all) => all.map((item) => item.id === id ? { ...item, projectId: projectId ?? undefined } : item));
}

/** Clears a project assignment off every conversation that has it — used
 *  when a project is deleted. Reads fresh from disk rather than trusting a
 *  caller's in-memory conversation list, which can be stale: the Chat
 *  History sheet and the workspace panel's Projects tab are two independent
 *  UI surfaces that both write `projectId`, so a project deletion racing a
 *  just-made assignment from the OTHER surface must not leave an orphaned
 *  reference to a project that no longer exists. */
export async function clearProjectFromAllConversations(projectId: string): Promise<void> {
  await mutateAll((all) => all.map((c) => c.projectId === projectId ? { ...c, projectId: undefined } : c));
}

export async function deleteConversation(id: string): Promise<void> {
  await mutateAll((all) => all.filter((c) => c.id !== id));
}

export async function clearAllConversations(): Promise<void> {
  await mutateAll(() => []);
}

export function makeConversationId(): string {
  return `c${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

// --- Per-conversation unsent draft text -------------------------------------
// Kept in one small map file so leaving a half-typed message and switching
// chats (or backgrounding the app) never loses it. Best-effort: a failed read
// or write just means the draft isn't restored, never a crash.
let draftsCache: Record<string, string> | null = null;

async function readDrafts(): Promise<Record<string, string>> {
  if (draftsCache) return draftsCache;
  let next: Record<string, string> = {};
  try {
    const raw = await readKey(STORAGE_KEY_DRAFTS, draftsPath);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') next = parsed as Record<string, string>;
  } catch {
    next = {};
  }
  draftsCache = next;
  return next;
}

export async function getDraft(id: string): Promise<string> {
  const drafts = await readDrafts();
  return typeof drafts[id] === 'string' ? drafts[id] : '';
}

export async function setDraft(id: string, text: string): Promise<void> {
  const drafts = await readDrafts();
  if (text.trim()) drafts[id] = text;
  else delete drafts[id];
  draftsCache = drafts;
  try {
    await writeKey(STORAGE_KEY_DRAFTS, draftsPath, JSON.stringify(drafts));
  } catch {
    // Best-effort.
  }
}
