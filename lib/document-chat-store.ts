// The document currently "open" in the chat screen — see CLAUDE.md-adjacent
// design note: opening a file from an Archive (GitHub-backed repo) doesn't
// take you to a separate editor screen. Instead the chat itself becomes the
// document: its content renders inline above the message list, editable by
// hand, AND the composer below can be used to ask the AI to change it
// ("make this shorter", "fix the intro") — the assistant's reply is scanned
// for a ```document fenced block and, if present, becomes the new content.
//
// Persisted to disk (not just an in-memory zustand store) because this app
// has an already-documented failure mode where the OS kills it in the
// background (see chat-history.ts's draft-saving comment — a Samsung Fold's
// inner/outer display switch can trigger this). Losing a half-written AI
// edit to a background-kill with zero warning would be exactly the kind of
// bug this project can't afford to ship again.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

export interface ActiveDocument {
  archiveId: string;
  archiveName: string;
  repoFullName: string;
  path: string;
  sha: string;
  content: string;
  /** The content as of the last successful commit — compared against
   *  `content` to know whether there's anything to commit. */
  original: string;
}

const STORAGE_KEY = 'expert_ai_active_document_v1';
const storagePath = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
const storageBackupPath = `${storagePath}.bak`;
const storageTempPath = `${storagePath}.tmp`;

function isActiveDocument(value: unknown): value is ActiveDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Partial<ActiveDocument>;
  return typeof doc.archiveId === 'string'
    && typeof doc.archiveName === 'string'
    && typeof doc.repoFullName === 'string'
    && typeof doc.path === 'string'
    && typeof doc.sha === 'string'
    && typeof doc.content === 'string'
    && typeof doc.original === 'string';
}

async function readPersisted(): Promise<ActiveDocument | null> {
  if (Platform.OS === 'web') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isActiveDocument(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  for (const path of [storagePath, storageTempPath, storageBackupPath]) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) continue;
      const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(path));
      if (isActiveDocument(parsed)) return parsed;
    } catch {
      // Try the completed temporary snapshot or backup before giving up.
    }
  }
  return null;
}

async function writePersisted(doc: ActiveDocument | null): Promise<void> {
  if (doc == null) {
    if (Platform.OS === 'web') { localStorage.removeItem(STORAGE_KEY); return; }
    await FileSystem.deleteAsync(storageTempPath, { idempotent: true });
    await FileSystem.deleteAsync(storageBackupPath, { idempotent: true });
    await FileSystem.deleteAsync(storagePath, { idempotent: true });
    return;
  }
  const json = JSON.stringify(doc);
  if (Platform.OS === 'web') { localStorage.setItem(STORAGE_KEY, json); return; }
  await FileSystem.writeAsStringAsync(storageTempPath, json);
  const current = await FileSystem.getInfoAsync(storagePath);
  if (current.exists) {
    await FileSystem.deleteAsync(storageBackupPath, { idempotent: true });
    await FileSystem.copyAsync({ from: storagePath, to: storageBackupPath });
    await FileSystem.deleteAsync(storagePath, { idempotent: true });
  }
  await FileSystem.moveAsync({ from: storageTempPath, to: storagePath });
}

interface DocumentChatState {
  activeDocument: ActiveDocument | null;
  persistenceError: string | null;
  /** True once the initial disk read (on app start) has completed, so the
   *  UI can avoid flashing "no document" before a saved one has a chance to
   *  load in. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  open: (doc: ActiveDocument) => void;
  updateContent: (content: string) => void;
  /** Called after a successful commit — the new sha becomes current and the
   *  dirty comparison resets. */
  markCommitted: (sha: string, content: string, identity: Pick<ActiveDocument, 'archiveId' | 'repoFullName' | 'path'>) => void;
  retryPersistence: () => Promise<void>;
  flushPersistence: () => Promise<void>;
  close: () => void;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();
let documentMutationRevision = 0;
function queuePersist(doc: ActiveDocument | null) {
  const operation = persistChain.then(() => writePersisted(doc));
  persistChain = operation.then(() => undefined).catch(() => {});
  return operation;
}
function scheduleWrite(doc: ActiveDocument, persist: (snapshot: ActiveDocument | null) => Promise<void>) {
  if (writeTimer) clearTimeout(writeTimer);
  // Debounced — typing in the document box would otherwise hit the
  // filesystem on every keystroke. 600ms is short enough that a
  // background-kill can only ever lose a few hundred ms of typing.
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void persist(doc).catch(() => {});
  }, 600);
}

export const useDocumentChatStore = create<DocumentChatState>((set, get) => {
  const persist = async (snapshot: ActiveDocument | null) => {
    try {
      await queuePersist(snapshot);
      set({ persistenceError: null });
    } catch (error) {
      set({ persistenceError: 'The open file draft could not be saved on this device. Keep the file open and retry before switching chats.' });
      throw error;
    }
  };

  return {
    activeDocument: null,
    persistenceError: null,
    hydrated: false,
    hydrate: async () => {
      if (get().hydrated) return;
      const revision = documentMutationRevision;
      const restored = await readPersisted();
      if (revision !== documentMutationRevision) {
        set({ hydrated: true });
        return;
      }
      set({ activeDocument: restored, hydrated: true });
    },
    open: (doc) => {
      documentMutationRevision += 1;
      set({ activeDocument: doc, persistenceError: null, hydrated: true });
      if (writeTimer) clearTimeout(writeTimer);
      void persist(doc).catch(() => {});
    },
    updateContent: (content) => {
      const current = get().activeDocument;
      if (!current) return;
      documentMutationRevision += 1;
      const updated = { ...current, content };
      set({ activeDocument: updated, persistenceError: null });
      scheduleWrite(updated, persist);
    },
    markCommitted: (sha, content, identity) => {
      const current = get().activeDocument;
      if (!current
        || current.archiveId !== identity.archiveId
        || current.repoFullName !== identity.repoFullName
        || current.path !== identity.path) return;
      documentMutationRevision += 1;
      set((state) => (state.activeDocument
        // `content` is the exact snapshot sent to GitHub. The user may keep
        // typing while that request is in flight, so update the committed
        // baseline and remote SHA without replacing the newer live draft.
        ? { activeDocument: { ...state.activeDocument, sha, original: content }, persistenceError: null }
        : state));
      if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
      const doc = get().activeDocument;
      if (doc) void persist({ ...doc, sha, content, original: content }).catch(() => {});
    },
    retryPersistence: async () => {
      if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
      const doc = get().activeDocument;
      if (doc) await persist(doc);
    },
    flushPersistence: async () => {
      if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
      const doc = get().activeDocument;
      if (doc) await persist(doc);
    },
    close: () => {
      documentMutationRevision += 1;
      if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
      set({ activeDocument: null, hydrated: true });
      void persist(null).catch(() => {});
    },
  };
});
