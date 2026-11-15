import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface AutomationRecipe { id: string; name: string; prompt: string; createdAt: number; }
const KEY = 'expert_ai_automation_recipes_v1';
const PATH = `${FileSystem.documentDirectory}${KEY}.json`;
const BACKUP_PATH = `${PATH}.bak`;
const TEMP_PATH = `${PATH}.tmp`;
const MAX = 30;
let cache: AutomationRecipe[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function readAll(): Promise<AutomationRecipe[]> {
  if (cache) return cache;
  if (Platform.OS === 'ios') {
    let foundSnapshot = false;
    for (const path of [PATH, BACKUP_PATH, TEMP_PATH]) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) continue;
        foundSnapshot = true;
        const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
        if (!Array.isArray(parsed)) continue;
        cache = parsed.slice(-MAX);
        if (path !== PATH) {
          try {
            await FileSystem.writeAsStringAsync(TEMP_PATH, JSON.stringify(cache));
            await FileSystem.deleteAsync(PATH, { idempotent: true });
            await FileSystem.moveAsync({ from: TEMP_PATH, to: PATH });
          } catch { /* recovered in memory; next successful mutation repairs disk */ }
        }
        return cache;
      } catch {
        // Try the backup or completed temporary snapshot.
      }
    }
    if (foundSnapshot) throw new Error('No valid saved workflows snapshot found.');
    cache = [];
  } else {
    try {
      const raw = Platform.OS === 'web' ? localStorage.getItem(KEY) : (await FileSystem.getInfoAsync(PATH)).exists ? await FileSystem.readAsStringAsync(PATH) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error('Saved workflows have an invalid format.');
      cache = parsed.slice(-MAX);
    } catch { cache = []; }
  }
  return cache;
}
async function writeAll(items: AutomationRecipe[]) {
  const operation = writeChain.then(async () => {
    const next = items.slice(-MAX);
    const raw = JSON.stringify(next);
    if (Platform.OS === 'ios') {
      try {
        await FileSystem.writeAsStringAsync(TEMP_PATH, raw);
        const current = await FileSystem.getInfoAsync(PATH);
        if (current.exists) {
          try {
            const parsed = JSON.parse(await FileSystem.readAsStringAsync(PATH));
            if (Array.isArray(parsed)) await FileSystem.copyAsync({ from: PATH, to: BACKUP_PATH });
          } catch { /* keep the previous known-good backup if the primary is corrupt */ }
          await FileSystem.deleteAsync(PATH, { idempotent: true });
        }
        await FileSystem.moveAsync({ from: TEMP_PATH, to: PATH });
      } catch (error) {
        try { await FileSystem.deleteAsync(TEMP_PATH, { idempotent: true }); } catch { /* retain original write error */ }
        throw error;
      }
      cache = next;
      return;
    }
    cache = next;
    if (Platform.OS === 'web') localStorage.setItem(KEY, raw);
    else await FileSystem.writeAsStringAsync(PATH, raw);
  });
  writeChain = operation.then(() => undefined).catch(() => {});
  await operation;
}
export async function listAutomationRecipes(): Promise<AutomationRecipe[]> { return [...(await readAll())].reverse(); }
export async function saveAutomationRecipe(name: string, prompt: string): Promise<AutomationRecipe> {
  const item = { id: `recipe_${Date.now().toString(36)}`, name: name.trim().slice(0, 80) || 'Untitled recipe', prompt: prompt.trim().slice(0, 8000), createdAt: Date.now() };
  await writeAll([...(await readAll()), item]);
  return item;
}
export async function deleteAutomationRecipe(id: string): Promise<void> { await writeAll((await readAll()).filter((item) => item.id !== id)); }
