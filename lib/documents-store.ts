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
  await FileSystem.writeAsStringAsync(documentsPath, value);
}

async function readAll(): Promise<StoredDocument[]> {
  if (cache) return cache;
  try {
    const raw = await readKey();
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function writeAll(docs: StoredDocument[]): Promise<void> {
  const operation = writeChain.then(async () => {
    const bounded = docs
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_DOCUMENTS);
    cache = bounded;
    try {
      await writeKey(JSON.stringify(bounded));
    } catch {
      /* best-effort — losing a document write is recoverable, never crash the chat over it */
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
  const all = await readAll();
  const idx = all.findIndex((d) => d.id === doc.id);
  if (idx >= 0) all[idx] = doc;
  else all.unshift(doc);
  await writeAll(all);
}

export async function deleteDocument(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((d) => d.id !== id));
}

export function makeDocumentId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
