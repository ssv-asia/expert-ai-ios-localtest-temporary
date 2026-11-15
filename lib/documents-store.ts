// Local-only store for documents created from the chat (PDF/Markdown/text
// exports, canvas boards). Backs the side panel's "Documents" tab. Nothing
// here ever touches the gateway. Same file-backed pattern as chat-history.ts:
// SecureStore caps values at ~2KB, far too small for document content, so
// this uses expo-file-system/legacy (not the new File/Paths API, which has
// crashed elsewhere in this app — see chat-history.ts's comment).
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export type DocumentKind = 'markdown' | 'text' | 'pdf' | 'canvas';

export interface StoredDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  /** Markdown/text source content. For 'pdf' this is the markdown that was
   *  rendered — the actual .pdf file lives on disk, see `filePath`. For
   *  'canvas' this is a JSON-serialized CanvasBoard. */
  content: string;
  /** Absolute file path on disk, set once exported to a real file. */
  filePath?: string;
  conversationId: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'expert_ai_documents_v1';
const documentsPath = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
const MAX_DOCUMENTS = 100;

let cache: StoredDocument[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function readKey(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(STORAGE_KEY);
  const info = await FileSystem.getInfoAsync(documentsPath);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(documentsPath);
}

async function writeKey(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY, value);
    return;
  }
  if (Platform.OS === 'ios') {
    const tempPath = `${documentsPath}.tmp`;
    const backupPath = `${documentsPath}.bak`;
    await FileSystem.writeAsStringAsync(tempPath, value);
    const current = await FileSystem.getInfoAsync(documentsPath);
    if (current.exists) {
      try {
        const parsed = JSON.parse(await FileSystem.readAsStringAsync(documentsPath));
        if (Array.isArray(parsed)) await FileSystem.copyAsync({ from: documentsPath, to: backupPath });
      } catch { /* keep the previous known-good backup if the primary is corrupt */ }
      await FileSystem.deleteAsync(documentsPath, { idempotent: true });
    }
    await FileSystem.moveAsync({ from: tempPath, to: documentsPath });
    return;
  }
  await FileSystem.writeAsStringAsync(documentsPath, value);
}

async function readAll(): Promise<StoredDocument[]> {
  if (cache) return cache;
  if (Platform.OS === 'ios') {
    let foundSnapshot = false;
    for (const path of [documentsPath, `${documentsPath}.bak`, `${documentsPath}.tmp`]) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) continue;
        foundSnapshot = true;
        const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
        if (!Array.isArray(parsed)) continue;
        cache = parsed;
        if (path !== documentsPath) {
          try {
            await FileSystem.writeAsStringAsync(`${documentsPath}.tmp`, JSON.stringify(parsed));
            await FileSystem.deleteAsync(documentsPath, { idempotent: true });
            await FileSystem.moveAsync({ from: `${documentsPath}.tmp`, to: documentsPath });
          } catch { /* recovered in memory; next successful mutation repairs disk */ }
        }
        return cache;
      } catch {
        // Try the backup or completed temporary snapshot.
      }
    }
    if (foundSnapshot) throw new Error('No valid saved documents snapshot found.');
    cache = [];
  } else {
    try {
      const raw = await readKey();
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error('Saved documents have an invalid format.');
      cache = parsed;
    } catch {
      cache = [];
    }
  }
  return cache;
}

async function writeAll(update: StoredDocument[] | ((current: StoredDocument[]) => StoredDocument[])): Promise<void> {
  const operation = writeChain.then(async () => {
    const docs = typeof update === 'function' ? update([...await readAll()]) : update;
    const bounded = docs
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_DOCUMENTS);
    if (Platform.OS === 'ios') {
      try {
        await writeKey(JSON.stringify(bounded));
      } catch (error) {
        try { await FileSystem.deleteAsync(`${documentsPath}.tmp`, { idempotent: true }); } catch { /* retain original write error */ }
        throw error;
      }
      cache = bounded;
    } else {
      cache = bounded;
      try { await writeKey(JSON.stringify(bounded)); } catch { /* preserve existing best-effort behavior */ }
    }
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

export async function listDocuments(conversationId?: string): Promise<StoredDocument[]> {
  const all = await readAll();
  const sorted = [...all].sort((a, b) => b.updatedAt - a.updatedAt);
  return conversationId ? sorted.filter((d) => d.conversationId === conversationId) : sorted;
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const all = await readAll();
  return all.find((d) => d.id === id) ?? null;
}

export async function saveDocument(doc: StoredDocument): Promise<void> {
  await writeAll((current) => {
    const idx = current.findIndex((document) => document.id === doc.id);
    if (idx >= 0) current[idx] = doc;
    else current.unshift(doc);
    return current;
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await writeAll((current) => current.filter((document) => document.id !== id));
}

export function makeDocumentId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
