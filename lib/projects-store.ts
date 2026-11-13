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
  await FileSystem.writeAsStringAsync(projectsPath, value);
}

async function readAll(): Promise<Project[]> {
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

async function writeAll(projects: Project[]): Promise<void> {
  const operation = writeChain.then(async () => {
    cache = projects;
    try {
      await writeKey(JSON.stringify(projects));
    } catch {
      /* best-effort — losing a project write is recoverable, never crash the chat over it */
    }
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

export async function listProjects(): Promise<Project[]> {
  const all = await readAll();
  return [...all].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function makeProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function createProject(name: string): Promise<Project> {
  const all = await readAll();
  const now = Date.now();
  const project: Project = { id: makeProjectId(), name: name.trim() || 'Untitled project', createdAt: now, updatedAt: now };
  all.unshift(project);
  await writeAll(all);
  return project;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], name: name.trim() || all[idx].name, updatedAt: Date.now() };
  await writeAll(all);
}

export async function deleteProject(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((p) => p.id !== id));
}
