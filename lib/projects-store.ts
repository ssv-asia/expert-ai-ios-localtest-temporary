// Local-only "Projects" — named containers a user groups chats and documents
// under (see CLAUDE.md-adjacent design note: workspace was chat-scoped only,
// which made saved documents impossible to find once you left that chat).
// Same file-backed pattern as chat-history.ts / documents-store.ts.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'expert_ai_projects_v1';
const projectsPath = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;

let cache: Project[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function readKey(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(STORAGE_KEY);
  const info = await FileSystem.getInfoAsync(projectsPath);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(projectsPath);
}

async function writeKey(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY, value);
    return;
  }
  if (Platform.OS === 'ios') {
    const tempPath = `${projectsPath}.tmp`;
    const backupPath = `${projectsPath}.bak`;
    await FileSystem.writeAsStringAsync(tempPath, value);
    const current = await FileSystem.getInfoAsync(projectsPath);
    if (current.exists) {
      try {
        const parsed = JSON.parse(await FileSystem.readAsStringAsync(projectsPath));
        if (Array.isArray(parsed)) await FileSystem.copyAsync({ from: projectsPath, to: backupPath });
      } catch { /* keep the previous known-good backup if the primary is corrupt */ }
      await FileSystem.deleteAsync(projectsPath, { idempotent: true });
    }
    await FileSystem.moveAsync({ from: tempPath, to: projectsPath });
    return;
  }
  await FileSystem.writeAsStringAsync(projectsPath, value);
}

async function readAll(): Promise<Project[]> {
  if (cache) return cache;
  if (Platform.OS === 'ios') {
    let foundSnapshot = false;
    for (const path of [projectsPath, `${projectsPath}.bak`, `${projectsPath}.tmp`]) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) continue;
        foundSnapshot = true;
        const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
        if (!Array.isArray(parsed)) continue;
        cache = parsed;
        if (path !== projectsPath) {
          try {
            await FileSystem.writeAsStringAsync(`${projectsPath}.tmp`, JSON.stringify(parsed));
            await FileSystem.deleteAsync(projectsPath, { idempotent: true });
            await FileSystem.moveAsync({ from: `${projectsPath}.tmp`, to: projectsPath });
          } catch { /* recovered in memory; next successful mutation repairs disk */ }
        }
        return cache;
      } catch {
        // Try the backup or completed temporary snapshot.
      }
    }
    if (foundSnapshot) throw new Error('No valid saved projects snapshot found.');
    cache = [];
  } else {
    try {
      const raw = await readKey();
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error('Saved projects have an invalid format.');
      cache = parsed;
    } catch { cache = []; }
  }
  return cache;
}

async function writeAll(projects: Project[]): Promise<void> {
  const operation = writeChain.then(async () => {
    if (Platform.OS === 'ios') {
      try {
        await writeKey(JSON.stringify(projects));
      } catch (error) {
        try { await FileSystem.deleteAsync(`${projectsPath}.tmp`, { idempotent: true }); } catch { /* retain original write error */ }
        throw error;
      }
      cache = projects;
      return;
    }
    cache = projects;
    try { await writeKey(JSON.stringify(projects)); } catch { /* preserve existing best-effort behavior */ }
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

export async function listProjects(): Promise<Project[]> {
  const all = [...await readAll()];
  return [...all].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function makeProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function createProject(name: string): Promise<Project> {
  const all = [...await readAll()];
  const now = Date.now();
  const project: Project = { id: makeProjectId(), name: name.trim() || 'Untitled project', createdAt: now, updatedAt: now };
  all.unshift(project);
  await writeAll(all);
  return project;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const all = [...await readAll()];
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], name: name.trim() || all[idx].name, updatedAt: Date.now() };
  await writeAll(all);
}

export async function deleteProject(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((p) => p.id !== id));
}
