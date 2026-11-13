// Lightweight, on-device crash log. No third-party SDK, no native module, no
// network — just a capped ring of the most recent unhandled JS errors and
// React render errors, persisted to a file so they survive the crash/restart
// and can be surfaced in the founder Console.
//
// This is deliberately the "free, zero-rebuild" tier of crash reporting: it
// only sees the JS side and only this device. A full crash reporter (native
// crashes, breadcrumbs, de-minified stacks, cross-device aggregation) would be
// a native dependency + a real prebuild — kept as a follow-up, not this pass.
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

export interface CrashRecord {
  at: number;
  message: string;
  stack: string;
  kind: 'fatal' | 'nonfatal' | 'render';
  appVersion: string;
  platform: string;
}

const STORAGE_KEY = 'crash_log_v1';
const path = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
const MAX_RECORDS = 25;

let cache: CrashRecord[] | null = null;
let installed = false;

const appVersion = (Constants.expoConfig?.version as string | undefined) || 'unknown';

async function readAll(): Promise<CrashRecord[]> {
  if (cache) return cache;
  let next: CrashRecord[] = [];
  try {
    if (Platform.OS === 'web') {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      next = raw ? JSON.parse(raw) : [];
    } else {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(path);
        next = raw ? JSON.parse(raw) : [];
      }
    }
  } catch {
    next = [];
  }
  cache = Array.isArray(next) ? next : [];
  return cache;
}

async function writeAll(records: CrashRecord[]): Promise<void> {
  cache = records;
  try {
    const raw = JSON.stringify(records);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, raw);
    } else {
      await FileSystem.writeAsStringAsync(path, raw);
    }
  } catch {
    // Best-effort — never let the crash logger itself throw.
  }
}

export async function recordCrash(
  error: unknown,
  kind: CrashRecord['kind'] = 'nonfatal',
  extraStack?: string,
): Promise<void> {
  try {
    const err = error as { message?: string; stack?: string } | undefined;
    const rec: CrashRecord = {
      at: Date.now(),
      message: (err?.message || String(error) || 'Unknown error').slice(0, 500),
      stack: (extraStack || err?.stack || '').slice(0, 4000),
      kind,
      appVersion,
      platform: `${Platform.OS} ${Platform.Version}`,
    };
    const all = await readAll();
    const next = [rec, ...all].slice(0, MAX_RECORDS);
    await writeAll(next);
  } catch {
    // swallow
  }
}

export async function getCrashLog(): Promise<CrashRecord[]> {
  return [...(await readAll())];
}

export async function clearCrashLog(): Promise<void> {
  await writeAll([]);
}

/**
 * Chain a persist step onto React Native's global JS error handler. Runs once;
 * always calls the previous handler afterwards so the normal red-box / crash
 * behaviour is unchanged.
 */
export function installCrashHandler(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const EU = g.ErrorUtils;
  if (!EU?.getGlobalHandler || !EU?.setGlobalHandler) return;
  const prev = EU.getGlobalHandler();
  EU.setGlobalHandler((e: unknown, isFatal?: boolean) => {
    // Fire-and-forget; do not await inside the crash path.
    recordCrash(e, isFatal ? 'fatal' : 'nonfatal');
    if (typeof prev === 'function') prev(e, isFatal);
  });
}
