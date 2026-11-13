import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface AutomationRecipe { id: string; name: string; prompt: string; createdAt: number; }
const KEY = 'expert_ai_automation_recipes_v1';
const PATH = `${FileSystem.documentDirectory}${KEY}.json`;
const MAX = 30;
let cache: AutomationRecipe[] | null = null;

async function readAll(): Promise<AutomationRecipe[]> {
  if (cache) return cache;
  try {
    const raw = Platform.OS === 'web' ? localStorage.getItem(KEY) : (await FileSystem.getInfoAsync(PATH)).exists ? await FileSystem.readAsStringAsync(PATH) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.slice(-MAX) : [];
  } catch { cache = []; }
  return cache;
}
async function writeAll(items: AutomationRecipe[]) {
  cache = items.slice(-MAX);
  const raw = JSON.stringify(cache);
  try { if (Platform.OS === 'web') localStorage.setItem(KEY, raw); else await FileSystem.writeAsStringAsync(PATH, raw); } catch { /* local convenience only */ }
}
export async function listAutomationRecipes(): Promise<AutomationRecipe[]> { return [...(await readAll())].reverse(); }
export async function saveAutomationRecipe(name: string, prompt: string): Promise<AutomationRecipe> {
  const item = { id: `recipe_${Date.now().toString(36)}`, name: name.trim().slice(0, 80) || 'Untitled recipe', prompt: prompt.trim().slice(0, 8000), createdAt: Date.now() };
  await writeAll([...(await readAll()), item]);
  return item;
}
export async function deleteAutomationRecipe(id: string): Promise<void> { await writeAll((await readAll()).filter((item) => item.id !== id)); }
