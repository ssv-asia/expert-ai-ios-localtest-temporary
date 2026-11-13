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

async function readPersisted(): Promise<ActiveDocument | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    }
    const info = await FileSystem.getInfoAsync(storagePath);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(storagePath);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writePersisted(doc: ActiveDocument | null): Promise<void> {
  try {
    if (doc == null) {
      if (Platform.OS === 'web') { localStorage.removeItem(STORAGE_KEY); return; }
      const info = await FileSystem.getInfoAsync(storagePath);
      if (info.exists) await FileSystem.deleteAsync(storagePath, { idempotent: true });
      return;
    }
    const json = JSON.stringify(doc);
    if (Platform.OS === 'web') { localStorage.setItem(STORAGE_KEY, json); return; }
    await FileSystem.writeAsStringAsync(storagePath, json);
  } catch {
    // Best-effort — losing the persisted copy just means a background-kill
    // during that specific window won't recover; never crash the chat over it.
  }
}

interface DocumentChatState {
  activeDocument: ActiveDocument | null;
  /** True once the initial disk read (on app start) has completed, so the
   *  UI can avoid flashing "no document" before a saved one has a chance to
   *  load in. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  open: (doc: ActiveDocument) => void;
  updateContent: (content: string) => void;
  /** Called after a successful commit — the new sha becomes current and the
   *  dirty comparison resets. */
  markCommitted: (sha: string, content: string) => void;
  close: () => void;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();
function queuePersist(doc: ActiveDocument | null) {
  const operation = persistChain.then(() => writePersisted(doc));
  persistChain = operation.then(() => undefined).catch(() => {});
  return operation;
}
function scheduleWrite(doc: ActiveDocument | null) {
  if (writeTimer) clearTimeout(writeTimer);
  // Debounced — typing in the document box would otherwise hit the
  // filesystem on every keystroke. 600ms is short enough that a
  // background-kill can only ever lose a few hundred ms of typing.
  writeTimer = setTimeout(() => { queuePersist(doc); }, 600);
}

export const useDocumentChatStore = create<DocumentChatState>((set, get) => ({
  activeDocument: null,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    const restored = await readPersisted();
    set({ activeDocument: restored, hydrated: true });
  },
  open: (doc) => {
    set({ activeDocument: doc });
    if (writeTimer) clearTimeout(writeTimer);
    queuePersist(doc);
  },
  updateContent: (content) => {
    const current = get().activeDocument;
    if (!current) return;
    const updated = { ...current, content };
    set({ activeDocument: updated });
    scheduleWrite(updated);
  },
  markCommitted: (sha, content) => {
    set((s) => (s.activeDocument ? { activeDocument: { ...s.activeDocument, sha, content, original: content } } : s));
    if (writeTimer) clearTimeout(writeTimer);
    const doc = get().activeDocument;
    if (doc) queuePersist({ ...doc, sha, content, original: content });
  },
  close: () => {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    set({ activeDocument: null });
    queuePersist(null);
  },
}));
