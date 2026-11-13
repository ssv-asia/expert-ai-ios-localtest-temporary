// Founder broadcast — the no-push, no-Firebase version.
//
// The gateway holds at most one "current announcement". Every app fetches it on
// launch and on returning to the foreground; if its id is newer than the last
// one this device dismissed, a dismissible banner shows at the top of the chat
// screen. That reaches everyone who opens the app — which, for an app people use
// regularly, is effectively everyone within a day — with zero push
// infrastructure, zero per-message cost, and nothing for the user to set up.
//
// Worker side (not yet deployed):
//   GET  /announcement            -> { id, title, body, url?, ts } | {}
//   POST /admin/announcement      -> { title, body, url?, ttlHours? }   (founder)
//   DELETE /admin/announcement    -> clears it                          (founder)
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { resilientFetch } from './gateway-client';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  url?: string;
  ts: number;
}

const STORAGE_KEY = 'announcement_seen_v1';
const path = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;

async function readSeenId(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    }
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = raw ? JSON.parse(raw) : null;
    return typeof parsed?.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

export async function markAnnouncementSeen(id: string): Promise<void> {
  try {
    const raw = JSON.stringify({ id });
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, raw);
    } else {
      await FileSystem.writeAsStringAsync(path, raw);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Returns the current announcement only if it exists and this device hasn't
 * dismissed it yet. Fully swallow failures — a missing endpoint (pre-deploy) or
 * an offline device just means "no banner", never an error.
 */
export async function fetchPendingAnnouncement(): Promise<Announcement | null> {
  try {
    const resp = await resilientFetch('/announcement', { method: 'GET' }, { attemptTimeoutMs: 8000, retries: 1 });
    if (!resp.ok) return null;
    const data = (await resp.json().catch(() => null)) as Partial<Announcement> | null;
    if (!data || !data.id || !data.title) return null;
    const seen = await readSeenId();
    if (seen === data.id) return null;
    return {
      id: data.id,
      title: data.title,
      body: data.body ?? '',
      url: data.url,
      ts: typeof data.ts === 'number' ? data.ts : Date.now(),
    };
  } catch {
    return null;
  }
}
