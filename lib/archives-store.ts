// "Archives" — saved connections to text-based GitHub repos, browsable like
// an Obsidian vault. Deliberately generalized beyond "the user's own repo":
// an archive can be a repo the signed-in GitHub account owns/collaborates
// on, OR any public repo added by URL — which is how curated, bespoke
// repositories (e.g. a publisher's own reference archive, shared publicly)
// get distributed to users without every user needing write access to it.
// Same file-backed pattern as documents-store.ts / projects-store.ts.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface Archive {
  id: string;
  /** User-facing label — defaults to the repo name but is editable so
   *  someone can tell two archives apart at a glance ("My Notes" vs
   *  "AEC Reference Archive"). */
  name: string;
  /** "owner/repo" — the only thing actually needed to hit the GitHub API. */
  repoFullName: string;
  addedAt: number;
}

const STORAGE_KEY = 'expert_ai_archives_v1';
const archivesPath = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;

let cache: Archive[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function readKey(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(STORAGE_KEY);
  const info = await FileSystem.getInfoAsync(archivesPath);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(archivesPath);
}

async function writeKey(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY, value);
    return;
  }
  await FileSystem.writeAsStringAsync(archivesPath, value);
}

async function readAll(): Promise<Archive[]> {
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

async function writeAll(archives: Archive[]): Promise<void> {
  const operation = writeChain.then(async () => {
    cache = archives;
    try {
      await writeKey(JSON.stringify(archives));
    } catch {
      /* best-effort */
    }
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

export async function listArchives(): Promise<Archive[]> {
  const all = await readAll();
  return [...all].sort((a, b) => b.addedAt - a.addedAt);
}

export function makeArchiveId(): string {
  return `arc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function addArchive(name: string, repoFullName: string): Promise<Archive> {
  const all = await readAll();
  if (all.some((a) => a.repoFullName.toLowerCase() === repoFullName.toLowerCase())) {
    throw new Error('This repository is already connected as an archive.');
  }
  const archive: Archive = { id: makeArchiveId(), name: name.trim() || repoFullName, repoFullName, addedAt: Date.now() };
  all.unshift(archive);
  await writeAll(all);
  return archive;
}

export async function removeArchive(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((a) => a.id !== id));
}

/** Accepts "owner/repo", a full https://github.com/owner/repo URL, or a URL
 *  with a trailing slash/extra path — returns just "owner/repo", or null if
 *  it can't find that shape. Lets "Add archive" take whatever a user pastes. */
export function parseRepoFullName(input: string): string | null {
  const trimmed = input.trim().replace(/\.git$/, '');
  const urlMatch = trimmed.match(/github\.com\/([^/\s]+)\/([^/\s]+)/i);
  if (urlMatch) return `${urlMatch[1]}/${urlMatch[2]}`;
  const bareMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (bareMatch) return `${bareMatch[1]}/${bareMatch[2]}`;
  return null;
}
