// Thin wrapper over the GitHub REST API (api.github.com) for the in-app repo
// browser/editor — repo listing, directory listing, file read, and file
// commit (create or update). All calls carry the device-flow token from
// github-auth.ts. No SDK dependency — this is a handful of plain fetches.
import { getGithubToken } from './github-auth';

const API = 'https://api.github.com';

export class GithubApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** `require: true` for anything that inherently needs a signed-in account
 *  (your own repo list, committing). Reads of a public repo's contents work
 *  fine unauthenticated (rate-limited, but that's acceptable for browsing) —
 *  which is what makes "curated public archive, no sign-in needed" possible. */
async function apiFetch(path: string, init?: RequestInit, require: boolean = false): Promise<Response> {
  const token = await getGithubToken();
  if (require && !token) throw new GithubApiError('Not signed in to GitHub.');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GithubApiError(body.message || `GitHub API error (${res.status})`, res.status);
  }
  return res;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  updated_at: string;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

const repoCache = new Map<string, { at: number; value: GithubRepo[] }>();

/** The signed-in user's own repos plus ones they collaborate on — sorted by
 *  most recently pushed, matching what you'd want at the top of a "pick a
 *  vault" list. */
export async function listMyRepos(): Promise<GithubRepo[]> {
  const cached = repoCache.get('mine');
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const res = await apiFetch('/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator', undefined, true);
  const value = await res.json();
  // Keep the list cache separate from repository metadata; this avoids
  // reloading the picker every time the archive sheet is reopened.
  repoCache.set('mine', { at: Date.now(), value });
  return value;
}

/** Whether a repo can be reached at all right now — public repos work with
 *  no sign-in, private ones need a token with access. Used to validate
 *  "Add archive by URL" before saving it. */
export async function checkRepoAccessible(fullName: string): Promise<boolean> {
  try {
    await apiFetch(`/repos/${fullName}`);
    return true;
  } catch {
    return false;
  }
}

export interface GithubEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
  size: number;
}

export interface GithubCommit {
  sha: string;
  html_url: string;
  message: string;
  author: { login?: string; avatar_url?: string } | null;
  date: string | null;
  files?: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
}

// A short-lived in-memory cache keeps archive navigation instant when users
// return to a folder, while still refreshing after the TTL.
const contentsCache = new Map<string, { at: number; value: GithubEntry[] }>();
const CONTENTS_TTL = 30_000;

function invalidateContents(fullName: string, path: string): void {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  // The changed file's own entry and every cached ancestor directory must be
  // invalidated. Otherwise a successful create/delete can remain invisible in
  // the tree until the 30-second TTL expires.
  const parts = normalized ? normalized.split('/') : [];
  for (let index = parts.length; index >= 0; index -= 1) {
    const parent = parts.slice(0, index).join('/');
    contentsCache.delete(`${fullName}:${parent}`);
  }
}

export async function listContents(fullName: string, path: string, force = false): Promise<GithubEntry[]> {
  const key = `${fullName}:${path}`;
  const cached = contentsCache.get(key);
  if (!force && cached && Date.now() - cached.at < CONTENTS_TTL) return cached.value;
  const res = await apiFetch(`/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`);
  const data = await res.json();
  const value = (Array.isArray(data) ? data : [data]) as GithubEntry[];
  contentsCache.set(key, { at: Date.now(), value });
  return value;
}

export async function listCommits(fullName: string, path?: string, perPage = 20): Promise<GithubCommit[]> {
  const suffix = path ? `&path=${encodeURIComponent(path)}` : '';
  const res = await apiFetch(`/repos/${fullName}/commits?per_page=${perPage}${suffix}`);
  const data = await res.json();
  return data.map((c: any) => ({
    sha: c.sha,
    html_url: c.html_url,
    message: String(c.commit?.message ?? '').split('\n')[0],
    author: c.author ? { login: c.author.login, avatar_url: c.author.avatar_url } : c.commit?.author ? { login: c.commit.author.name } : null,
    date: c.commit?.author?.date ?? null,
  }));
}

export async function getCommit(fullName: string, sha: string): Promise<GithubCommit> {
  const res = await apiFetch(`/repos/${fullName}/commits/${sha}`);
  const c = await res.json();
  return {
    sha: c.sha,
    html_url: c.html_url,
    message: c.commit?.message ?? '',
    author: c.author ? { login: c.author.login, avatar_url: c.author.avatar_url } : c.commit?.author ? { login: c.commit.author.name } : null,
    date: c.commit?.author?.date ?? null,
    files: (c.files ?? []).map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch })),
  };
}

export interface GithubFile {
  path: string;
  sha: string;
  content: string; // decoded UTF-8 text
  encoding: 'text';
}

/** Text files only — this feature is for notes (Markdown/plain text), not a
 *  general binary editor. GitHub's contents API returns base64; anything
 *  that doesn't decode as clean UTF-8 text is out of scope here. */
export async function getFile(fullName: string, path: string): Promise<GithubFile> {
  const res = await apiFetch(`/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`);
  const data = await res.json();
  if (Array.isArray(data) || data.type !== 'file') throw new GithubApiError('Not a file.');
  const content = decodeBase64Utf8(data.content);
  return { path: data.path, sha: data.sha, content, encoding: 'text' };
}

export async function deleteFile(fullName: string, path: string, sha: string, message: string): Promise<void> {
  await apiFetch(`/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha }),
  }, true);
  invalidateContents(fullName, path);
}

/** GitHub folders are implicit; remove every file below the folder so the
 * directory disappears while preserving each deletion in repository history. */
export async function deleteFolder(fullName: string, path: string, message: string): Promise<void> {
  const children = await listContents(fullName, path, true);
  for (const child of children) {
    if (child.type === 'dir') {
      await deleteFolder(fullName, child.path, message);
    } else {
      const file = await getFile(fullName, child.path);
      await deleteFile(fullName, child.path, file.sha, message);
    }
  }
  invalidateContents(fullName, path);
}

/** GitHub represents folders implicitly. Creating a Markdown placeholder
 * creates the requested folder path while remaining editable in the app. */
export async function createFolder(fullName: string, path: string, message: string): Promise<{ sha: string }> {
  const normalized = path.replace(/\/+$/, '');
  return putFile(fullName, `${normalized}/.gitkeep`, '', message);
}

/** Creates or updates a text file and commits it — `sha` must be the file's
 *  current sha when updating an existing file (omit to create a new one);
 *  GitHub's contents API uses this as an optimistic-concurrency check and
 *  rejects the write with a 409 if the file changed since it was read. */
export async function putFile(
  fullName: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const res = await apiFetch(`/repos/${fullName}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encodeBase64Utf8(content),
      ...(sha ? { sha } : {}),
    }),
  }, true);
  const data = await res.json();
  invalidateContents(fullName, path);
  return { sha: data.content.sha };
}

// atob/btoa are natively available in modern Hermes (confirmed against
// facebook/hermes#1178 before relying on this — "research before guessing"),
// but TextEncoder/TextDecoder support varies by exact Hermes version bundled
// with a given React Native release, so this deliberately avoids them. The
// escape/unescape roundtrip is the well-known cross-environment-safe way to
// get UTF-8 bytes through atob/btoa's Latin1-only string model.
function decodeBase64Utf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

function encodeBase64Utf8(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}
