// Daily Notes — a per-day local scratchpad with an archive, deeply tied into the
// chat model (see app/simple-chat.tsx). Device-local only, never synced to the
// gateway. Storage mirrors lib/chat-history.ts exactly: one JSON file on native
// via expo-file-system/legacy, localStorage on web, an in-memory cache, and
// best-effort writes (losing a note is never fatal, never a crash).
//
// Why one JSON file and not one .md file per day: the legacy file API is the only
// storage this app has used without crashing on device (see the chat-history.ts
// header for the File/Paths + SecureStore history). A single bounded document is
// the proven-safe shape. The note *body* is still markdown text — "a .md file" is
// the mental model the user works in, we just persist the collection as one blob.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface DailyNote {
  /** Local calendar day, `YYYY-MM-DD` — also the stable id. */
  id: string;
  /** Human title, e.g. "Friday, 29 Aug 2026". */
  title: string;
  /** Markdown body. */
  body: string;
  /** False until the user actually edits away from the seeded template — used so
   *  an auto-created but untouched note doesn't count toward the streak. */
  touched: boolean;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'daily_notes_v1';
const notesPath = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
const notesBackupPath = `${notesPath}.bak`;
const notesTempPath = `${notesPath}.tmp`;

// Keep the on-device archive bounded — a year of notes is plenty and keeps the
// single-file read/write cheap. Oldest are dropped first.
const MAX_NOTES = 400;

let cache: DailyNote[] | null = null;
// Every note mutation writes the same bounded document. Serialize those writes
// so a debounced editor save cannot race an append/delete and restore stale data.
let writeChain: Promise<void> = Promise.resolve();

async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
  let found = false;
  for (const path of [notesPath, notesBackupPath, notesTempPath]) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) continue;
      found = true;
      const raw = await FileSystem.readAsStringAsync(path);
      if (Array.isArray(JSON.parse(raw))) return raw;
    } catch {
      // Try the backup or completed temporary snapshot.
    }
  }
  if (found) throw new Error('No valid daily-notes snapshot found');
  return null;
}

async function writeRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* quota / private mode — best effort */
    }
    return;
  }
  await FileSystem.writeAsStringAsync(notesTempPath, value);
  const current = await FileSystem.getInfoAsync(notesPath);
  if (current.exists) {
    await FileSystem.deleteAsync(notesBackupPath, { idempotent: true });
    await FileSystem.copyAsync({ from: notesPath, to: notesBackupPath });
    await FileSystem.deleteAsync(notesPath, { idempotent: true });
  }
  await FileSystem.moveAsync({ from: notesTempPath, to: notesPath });
}

async function readAll(): Promise<DailyNote[]> {
  if (cache) return cache;
  try {
    const raw = await readRaw();
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? (parsed as DailyNote[]) : [];
  } catch (error) {
    if (cache) return cache;
    throw error;
  }
  return cache;
}

async function writeAll(notes: DailyNote[]): Promise<void> {
  const operation = writeChain.then(async () => {
    // Newest first, then clamp.
    const bounded = [...notes].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, MAX_NOTES);
    await writeRaw(JSON.stringify(bounded));
    cache = bounded;
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** `YYYY-MM-DD` for the given date in the DEVICE's local timezone (not UTC —
 *  `toISOString` would roll over at the wrong moment for most of the world). */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** "Friday, 29 Aug 2026" */
export function dailyNoteTitle(key: string): string {
  return dateFromKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Pull `- [ ]` style open checkbox items out of a markdown body. */
export function extractOpenTasks(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*[-*]\s*\[ \]\s*(.+\S)\s*$/);
    if (m) {
      const text = m[1].trim();
      const k = text.toLowerCase();
      if (text && !seen.has(k)) {
        seen.add(k);
        out.push(text);
      }
    }
  }
  return out;
}

function buildTemplate(key: string, carried: string[]): string {
  let t = `# ${dailyNoteTitle(key)}\n\n## Focus\n- [ ] \n- [ ] \n- [ ] \n\n## Notes\n- `;
  if (carried.length > 0) {
    t += `\n\n## Carried over\n${carried.map((c) => `- [ ] ${c}`).join('\n')}`;
  }
  return t;
}

/** Newest-first list of every stored note. */
export async function listDailyNotes(): Promise<DailyNote[]> {
  const all = await readAll();
  return [...all].sort((a, b) => (a.id < b.id ? 1 : -1));
}

export async function getDailyNote(id: string): Promise<DailyNote | null> {
  const all = await readAll();
  return all.find((n) => n.id === id) ?? null;
}

/** Today's note, creating it (with carry-forward of yesterday's unchecked Focus
 *  items) the first time it's opened on a new local day. */
export async function getOrCreateTodayNote(): Promise<DailyNote> {
  const all = await readAll();
  const key = localDayKey();
  const existing = all.find((n) => n.id === key);
  if (existing) return existing;

  // Carry forward any still-open checkbox items from the most recent prior note.
  const prior = [...all].sort((a, b) => (a.id < b.id ? 1 : -1)).find((n) => n.id < key);
  const carried = prior ? extractOpenTasks(prior.body).slice(0, 12) : [];

  const now = Date.now();
  const note: DailyNote = {
    id: key,
    title: dailyNoteTitle(key),
    body: buildTemplate(key, carried),
    touched: false,
    createdAt: now,
    updatedAt: now,
  };
  await writeAll([note, ...all]);
  return note;
}

export async function saveDailyNoteBody(id: string, body: string): Promise<void> {
  const operation = writeChain.then(async () => {
    cache = null;
    const all = await readAll();
    const idx = all.findIndex((n) => n.id === id);
    const now = Date.now();
    const next = idx >= 0
      ? all.map((note, index) => index === idx ? { ...note, body, touched: true, updatedAt: now } : note)
      : [{ id, title: dailyNoteTitle(id), body, touched: true, createdAt: now, updatedAt: now }, ...all];
    const bounded = next.sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, MAX_NOTES);
    await writeRaw(JSON.stringify(bounded));
    cache = bounded;
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** Append a block of text under a "## From chat" heading in the given note
 *  (defaults to today). Used by "Save reply to note" in the chat. */
export async function appendToDailyNote(id: string, block: string): Promise<void> {
  // Read and append inside the serialized mutation. This prevents a pending
  // editor debounce from overwriting a newly saved chat response.
  const operation = writeChain.then(async () => {
    cache = null;
    const all = await readAll();
    const note = all.find((n) => n.id === id);
    const base = note?.body ?? `# ${dailyNoteTitle(id)}\n`;
    const stamp = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const next = `${base.replace(/\s+$/, '')}\n\n## From chat · ${stamp}\n${block.trim()}\n`;
    const now = Date.now();
    const updated: DailyNote = note
      ? { ...note, body: next, touched: true, updatedAt: now }
      : { id, title: dailyNoteTitle(id), body: next, touched: true, createdAt: now, updatedAt: now };
    const bounded = [updated, ...all.filter((n) => n.id !== id)]
      .sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, MAX_NOTES);
    await writeRaw(JSON.stringify(bounded));
    cache = bounded;
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** Execute the small, deterministic local note tool used by agentic chat.
 * The model never receives filesystem access; it can only request these
 * bounded operations through the app, which keeps the note directory private. */
export async function executeDailyNoteTool(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const action = String(args.action || 'read');
  if (action === 'list') {
    const notes = await listDailyNotes();
    return {
      ok: true,
      notes: notes.slice(0, 40).map(({ id, title, touched, updatedAt }) => ({ id, title, touched, updatedAt })),
    };
  }
  const id = String(args.date || localDayKey());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return { error: true, message: 'Use date format YYYY-MM-DD.' };
  const [year, month, day] = id.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
    return { error: true, message: 'Choose a real calendar date in YYYY-MM-DD format.' };
  }
  if (action === 'read') {
    const note = await getDailyNote(id);
    return note ? { ok: true, date: id, title: note.title, body: note.body } : { ok: true, date: id, exists: false };
  }
  if (action === 'create') {
    const note = await getOrCreateNoteForDate(id);
    return { ok: true, date: id, title: note.title, body: note.body, created: true };
  }
  const content = String(args.content || '').trim();
  if (!content) return { error: true, message: 'Content is required for note changes.' };
  if (action === 'append') {
    await appendToDailyNote(id, content);
    const note = await getDailyNote(id);
    return { ok: true, date: id, title: note?.title || dailyNoteTitle(id), body: note?.body || '' };
  }
  if (action === 'replace') {
    await saveDailyNoteBody(id, content);
    const note = await getDailyNote(id);
    return { ok: true, date: id, title: note?.title || dailyNoteTitle(id), body: note?.body || content };
  }
  return { error: true, message: `Unsupported daily-note action: ${action}` };
}

/** Get or create a note for an explicitly selected local-calendar date. */
export async function getOrCreateNoteForDate(id: string): Promise<DailyNote> {
  let result: DailyNote | null = null;
  const operation = writeChain.then(async () => {
    cache = null;
    const all = await readAll();
    result = all.find((n) => n.id === id) ?? null;
    if (result) return;
    const now = Date.now();
    result = { id, title: dailyNoteTitle(id), body: `# ${dailyNoteTitle(id)}\n\n## Notes\n- `, touched: false, createdAt: now, updatedAt: now };
    const bounded = [result, ...all].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, MAX_NOTES);
    await writeRaw(JSON.stringify(bounded));
    cache = bounded;
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
  return result!;
}

export async function deleteDailyNote(id: string): Promise<void> {
  const operation = writeChain.then(async () => {
    cache = null;
    const all = await readAll();
    const next = all.filter((n) => n.id !== id);
    await writeRaw(JSON.stringify(next));
    cache = next;
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** Consecutive-day streak of *touched* notes, counting back from today (or from
 *  yesterday if today's note isn't touched yet, so the streak shows before the
 *  first edit of the day rather than reading 0). */
export function computeStreak(notes: DailyNote[]): number {
  const touched = new Set(notes.filter((n) => n.touched).map((n) => n.id));
  if (touched.size === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let cursor = new Date(today);
  if (!touched.has(localDayKey(cursor))) {
    // Allow the streak to "hang" from yesterday until today is written.
    cursor.setDate(cursor.getDate() - 1);
    if (!touched.has(localDayKey(cursor))) return 0;
  }

  let streak = 0;
  while (touched.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Concatenate the last `days` notes (most recent first) into one prompt-ready
 *  block for the weekly digest. */
export async function recentNotesBlock(days: number): Promise<string> {
  const all = await listDailyNotes();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = localDayKey(cutoff);
  const recent = all.filter((n) => n.id >= cutoffKey && n.touched);
  if (recent.length === 0) return '';
  return recent.map((n) => `=== ${n.title} ===\n${n.body.trim()}`).join('\n\n');
}
