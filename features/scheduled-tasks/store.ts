import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NotificationsService } from '@/lib/notifications-service';
import { cancelChatJob } from '@/lib/chat-jobs';
import { getActiveToken, getSession } from '@/lib/auth';

const STORAGE_KEY = 'scheduled_tasks';
// SecureStore has a real per-item size ceiling on some platforms (~2KB on
// classic Android Keystore backends) — keep the stored list bounded rather
// than letting a long history of completed tasks silently fail to save.
const MAX_STORED_TASKS = 40;
let storageWriteChain: Promise<void> = Promise.resolve();

export type ScheduledTaskStatus = 'pending' | 'completed' | 'failed' | 'exhausted';

export interface ScheduledTask {
  id: string;
  prompt: string;
  scheduledFor: number; // epoch ms
  createdAt: number;
  status: ScheduledTaskStatus;
  lastRunAt?: number;
  lastResultPreview?: string;
  /** Server-side durable generation job, when this task is scheduled remotely. */
  jobId?: string;
  conversationId?: string;
  /** id of the local notification that reminds the user this task is due */
  reminderId?: string | null;
}

interface ScheduledTasksState {
  tasks: ScheduledTask[];
  loaded: boolean;
  persistenceError: string | null;
  load: () => Promise<void>;
  retryPersistence: () => Promise<void>;
  addTask: (prompt: string, scheduledFor: number, remote?: { jobId: string; conversationId: string }) => Promise<ScheduledTask>;
  rescheduleTask: (id: string, scheduledFor: number) => Promise<void>;
  replaceRemoteTask: (id: string, scheduledFor: number, remote: { jobId: string; conversationId: string }) => Promise<void>;
  markRun: (id: string, status: 'completed' | 'failed' | 'exhausted', resultPreview?: string) => Promise<void>;
  markPending: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
}

async function readFromStore(): Promise<ScheduledTask[]> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    if (Platform.OS === 'ios') throw error;
    return [];
  }
}

async function writeToStore(tasks: ScheduledTask[]) {
  const operation = storageWriteChain.then(async () => {
    try {
      // Keep the most relevant tasks if we're over the cap: all pending ones
      // (a user should never silently lose an upcoming task) plus the most
      // recent completed/failed ones to fill out the rest.
      const pending = tasks.filter((t) => t.status === 'pending');
      const rest = tasks
        .filter((t) => t.status !== 'pending')
        .sort((a, b) => b.createdAt - a.createdAt);
      const bounded = [...pending, ...rest].slice(0, MAX_STORED_TASKS);

      const json = JSON.stringify(bounded);
      if (Platform.OS === 'web') {
        localStorage.setItem(STORAGE_KEY, json);
      } else {
        await SecureStore.setItemAsync(STORAGE_KEY, json);
      }
    } catch (error) {
      if (Platform.OS === 'ios') throw error;
      // silently fail — matches this codebase's other SecureStore-backed stores
    }
  });
  storageWriteChain = operation.then(() => undefined).catch(() => {});
  await operation;
}

/** Direct storage read, independent of the zustand store's in-memory state —
 *  used by the headless widget task handler, which runs in its own JS
 *  execution with no guarantee the store has ever been `load()`ed. */
export async function loadStoredTasks(): Promise<ScheduledTask[]> {
  return readFromStore();
}

let nextId = 0;
function makeTaskId() {
  nextId += 1;
  return `task_${Date.now().toString(36)}_${nextId}`;
}

export const useScheduledTasksStore = create<ScheduledTasksState>((set, get) => {
  const persistTasks = async (tasks: ScheduledTask[]) => {
    try {
      await writeToStore(tasks);
      if (Platform.OS === 'ios') set({ persistenceError: null });
    } catch {
      if (Platform.OS === 'ios') {
        set({ persistenceError: 'Scheduled task changes could not be saved. Check device storage and retry.' });
      }
    }
  };

  return {
    tasks: [],
    loaded: false,
    persistenceError: null,

    load: async () => {
      try {
        const tasks = await readFromStore();
        set({ tasks, loaded: true, persistenceError: null });
      } catch {
        set({ tasks: [], loaded: true, persistenceError: 'Scheduled tasks could not be loaded from this device.' });
      }
    },

    retryPersistence: async () => {
      try {
        if (get().persistenceError?.startsWith('Scheduled tasks could not be loaded')) {
          const tasks = await readFromStore();
          set({ tasks, loaded: true, persistenceError: null });
          return;
        }
        await writeToStore(get().tasks);
        set({ persistenceError: null });
      } catch {
        const failedToLoad = get().persistenceError?.startsWith('Scheduled tasks could not be loaded');
        set({ persistenceError: failedToLoad
          ? 'Scheduled tasks could not be loaded from this device.'
          : 'Scheduled task changes could not be saved. Check device storage and try again.' });
      }
    },

    addTask: async (prompt, scheduledFor, remote) => {
      // A tool call or notification can arrive before the screen's hydration
      // effect finishes. Load first so adding one task cannot replace the saved
      // list with an empty in-memory list.
      if (Platform.OS === 'ios' && !get().loaded) await get().load();
      if (Platform.OS === 'ios' && get().persistenceError?.startsWith('Scheduled tasks could not be loaded')) {
        throw new Error('Scheduled tasks could not be loaded. Retry loading them before adding another task.');
      }
      const reminderId = remote ? null : await NotificationsService.scheduleTaskReminder(
        `pending-${Date.now()}`,
        prompt,
        scheduledFor,
      );
      const task: ScheduledTask = {
        id: makeTaskId(),
        prompt,
        scheduledFor,
        createdAt: Date.now(),
        status: 'pending',
        reminderId,
        jobId: remote?.jobId,
        conversationId: remote?.conversationId,
      };
      const tasks = [...get().tasks, task];
      set({ tasks });
      await persistTasks(tasks);
      return task;
    },

    rescheduleTask: async (id, scheduledFor) => {
      const existing = get().tasks.find((t) => t.id === id);
      await NotificationsService.cancelScheduled(existing?.reminderId);
      const reminderId = existing
        ? await NotificationsService.scheduleTaskReminder(id, existing.prompt, scheduledFor)
        : null;
      const tasks = get().tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              scheduledFor,
              status: 'pending' as const,
              lastRunAt: undefined,
              lastResultPreview: undefined,
              reminderId,
            }
          : t,
      );
      set({ tasks });
      await persistTasks(tasks);
    },

    replaceRemoteTask: async (id, scheduledFor, remote) => {
      const existing = get().tasks.find((task) => task.id === id);
      await NotificationsService.cancelScheduled(existing?.reminderId);
      const tasks = get().tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              scheduledFor,
              status: 'pending' as const,
              lastRunAt: undefined,
              lastResultPreview: undefined,
              reminderId: null,
              jobId: remote.jobId,
              conversationId: remote.conversationId,
            }
          : task,
      );
      set({ tasks });
      await persistTasks(tasks);
    },

    markRun: async (id, status, resultPreview) => {
      const existing = get().tasks.find((t) => t.id === id);
      await NotificationsService.cancelScheduled(existing?.reminderId);
      const tasks = get().tasks.map((t) =>
        t.id === id
          ? { ...t, status, lastRunAt: Date.now(), lastResultPreview: resultPreview, reminderId: null }
          : t,
      );
      set({ tasks });
      await persistTasks(tasks);
    },

    markPending: async (id) => {
      const tasks = get().tasks.map((task) =>
        task.id === id
          ? { ...task, status: 'pending' as const, lastRunAt: undefined, lastResultPreview: undefined }
          : task,
      );
      set({ tasks });
      await persistTasks(tasks);
    },

    removeTask: async (id) => {
      const existing = get().tasks.find((t) => t.id === id);
      if (existing?.jobId) {
        const session = await getSession();
        const token = getActiveToken(session);
        if (token) await cancelChatJob(token, existing.jobId).catch(() => {});
      }
      await NotificationsService.cancelScheduled(existing?.reminderId);
      const tasks = get().tasks.filter((t) => t.id !== id);
      set({ tasks });
      await persistTasks(tasks);
    },
  };
});
