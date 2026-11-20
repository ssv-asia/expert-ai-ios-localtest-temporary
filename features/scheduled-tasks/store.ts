import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { NotificationsService } from '@/lib/notifications-service';
import { cancelChatJob } from '@/lib/chat-jobs';
import { getActiveToken, getSession } from '@/lib/auth';

const STORAGE_KEY = 'scheduled_tasks';
const TASKS_FILE = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
const TASKS_BACKUP_FILE = `${TASKS_FILE}.bak`;
const TASKS_TEMP_FILE = `${TASKS_FILE}.tmp`;
// Keep history bounded on SecureStore-backed platforms. iOS task data is
// file-backed below, so pending iOS tasks are not discarded at this limit.
const MAX_STORED_TASKS = 40;
let storageWriteChain: Promise<void> = Promise.resolve();
let reminderRestorePromise: Promise<number> | null = null;

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
  /** A Gateway create request has an idempotent recovery intent but no confirmed job ID yet. */
  submissionPending?: boolean;
  assistantMessageId?: string;
  conversationId?: string;
  /** id of the local notification that reminds the user this task is due */
  reminderId?: string | null;
}

interface ScheduledTasksState {
  tasks: ScheduledTask[];
  loaded: boolean;
  persistenceError: string | null;
  load: () => Promise<void>;
  restoreMissingReminders: () => Promise<number>;
  retryPersistence: () => Promise<void>;
  addTask: (prompt: string, scheduledFor: number, remote?: { jobId: string; conversationId: string; assistantMessageId?: string }) => Promise<ScheduledTask>;
  rescheduleTask: (id: string, scheduledFor: number, prompt?: string) => Promise<void>;
  replaceRemoteTask: (id: string, scheduledFor: number, remote: { jobId: string; conversationId: string; assistantMessageId?: string; prompt?: string }) => Promise<void>;
  markSubmissionPending: (id: string, run: { conversationId: string; assistantMessageId: string }) => Promise<void>;
  clearSubmissionPending: (id: string) => Promise<void>;
  markRemoteJobLost: (id: string, reason: string) => Promise<void>;
  markRun: (id: string, status: 'completed' | 'failed' | 'exhausted', resultPreview?: string, run?: { conversationId?: string; assistantMessageId?: string }) => Promise<void>;
  markPending: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
}

async function readFromStore(): Promise<ScheduledTask[]> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
    if (Platform.OS === 'ios') {
      let foundSnapshot = false;
      for (const path of [TASKS_FILE, TASKS_BACKUP_FILE, TASKS_TEMP_FILE]) {
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) continue;
        foundSnapshot = true;
        try {
          const parsed = JSON.parse(await FileSystem.readAsStringAsync(path));
          if (Array.isArray(parsed)) {
            if (path !== TASKS_FILE) {
              try {
                await FileSystem.writeAsStringAsync(TASKS_TEMP_FILE, JSON.stringify(parsed));
                await FileSystem.deleteAsync(TASKS_FILE, { idempotent: true });
                await FileSystem.moveAsync({ from: TASKS_TEMP_FILE, to: TASKS_FILE });
              } catch {
                // Keep serving the recovered snapshot; a later successful
                // mutation can repair storage once the filesystem is writable.
              }
            }
            return parsed;
          }
        } catch {
          // Fall back to the backup or completed temporary snapshot.
        }
      }
      // One-time migration from the old SecureStore record. Task histories can
      // exceed SecureStore's item-size limit, so future iOS writes use a file.
      const legacy = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!legacy) {
        if (foundSnapshot) throw new Error('No valid scheduled-task snapshot found.');
        return [];
      }
      const parsed = JSON.parse(legacy);
      if (!Array.isArray(parsed)) throw new Error('Saved scheduled tasks have an invalid format.');
      await FileSystem.writeAsStringAsync(TASKS_TEMP_FILE, legacy);
      await FileSystem.deleteAsync(TASKS_FILE, { idempotent: true });
      await FileSystem.moveAsync({ from: TASKS_TEMP_FILE, to: TASKS_FILE });
      await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
      return parsed;
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
      const bounded = Platform.OS === 'ios'
        ? [...pending, ...rest.slice(0, Math.max(0, MAX_STORED_TASKS - pending.length))]
        : [...pending, ...rest].slice(0, MAX_STORED_TASKS);

      const json = JSON.stringify(bounded);
      if (Platform.OS === 'web') {
        localStorage.setItem(STORAGE_KEY, json);
      } else if (Platform.OS === 'ios') {
        await FileSystem.writeAsStringAsync(TASKS_TEMP_FILE, json);
        const current = await FileSystem.getInfoAsync(TASKS_FILE);
        if (current.exists) {
          await FileSystem.deleteAsync(TASKS_BACKUP_FILE, { idempotent: true });
          await FileSystem.copyAsync({ from: TASKS_FILE, to: TASKS_BACKUP_FILE });
          await FileSystem.deleteAsync(TASKS_FILE, { idempotent: true });
        }
        await FileSystem.moveAsync({ from: TASKS_TEMP_FILE, to: TASKS_FILE });
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
        throw new Error('This scheduled task could not be saved on this iPhone. Check device storage and try again.');
      }
    }
  };

  return {
    tasks: [],
    loaded: false,
    persistenceError: null,

    load: async () => {
      if (get().loaded && get().persistenceError?.startsWith('Scheduled tasks could not be loaded')) {
        set({ persistenceError: null });
      } else if (get().loaded) {
        return;
      }
      try {
        const tasks = await readFromStore();
        set({ tasks, loaded: true, persistenceError: null });
        void get().restoreMissingReminders().catch(() => {});
      } catch {
        set({ loaded: true, persistenceError: 'Scheduled tasks could not be loaded from this device.' });
      }
    },

    restoreMissingReminders: async () => {
      if (Platform.OS !== 'ios') return 0;
      if (reminderRestorePromise) return reminderRestorePromise;
      const operation = (async () => {
        if (!get().loaded) await get().load();
        if (get().persistenceError?.startsWith('Scheduled tasks could not be loaded')) return 0;
        if (!(await NotificationsService.hasPermission())) return 0;

        const scheduledIds = await NotificationsService.getScheduledNotificationIds();
        const previousTasks = get().tasks;
        const scheduled = new Map<string, { notificationId: string; scheduledFor: number; prompt: string; previousReminderId?: string | null }>();
        for (const task of previousTasks) {
          const hasQueuedReminder = task.reminderId && (scheduledIds === null || scheduledIds.has(task.reminderId));
          if (task.status !== 'pending' || hasQueuedReminder || task.scheduledFor <= Date.now() + 5000) continue;
          const reminderId = await NotificationsService.scheduleTaskReminder(task.id, task.prompt, task.scheduledFor);
          if (reminderId) scheduled.set(task.id, {
            notificationId: reminderId,
            scheduledFor: task.scheduledFor,
            prompt: task.prompt,
            previousReminderId: task.reminderId,
          });
        }
        if (scheduled.size === 0) return 0;

        const currentTasks = get().tasks;
        const applied = new Map<string, string>();
        const tasks = currentTasks.map((task) => {
          const reminder = scheduled.get(task.id);
          if (!reminder) return task;
          if (task.status !== 'pending' || task.reminderId !== reminder.previousReminderId || task.scheduledFor !== reminder.scheduledFor || task.prompt !== reminder.prompt) return task;
          applied.set(task.id, reminder.notificationId);
          return { ...task, reminderId: reminder.notificationId };
        });
        const orphanedReminderIds = [...scheduled.entries()]
          .filter(([taskId]) => !applied.has(taskId))
          .map(([, reminder]) => reminder.notificationId);
        await Promise.all(orphanedReminderIds.map((id) => NotificationsService.cancelScheduled(id)));
        if (applied.size === 0) return 0;
        set({ tasks });
        try {
          await persistTasks(tasks);
        } catch (error) {
          set({ tasks: currentTasks });
          await Promise.all([...applied.values()].map((id) => NotificationsService.cancelScheduled(id)));
          throw error;
        }
        return applied.size;
      })();
      reminderRestorePromise = operation;
      try {
        return await operation;
      } finally {
        if (reminderRestorePromise === operation) reminderRestorePromise = null;
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
      if (Platform.OS === 'ios' && remote?.jobId) {
        const existing = get().tasks.find((task) => task.jobId === remote.jobId);
        if (existing) return existing;
      }
      const id = makeTaskId();
      // iOS keeps a local reminder even when generation itself runs on the
      // Gateway. Preserve Android's existing remote-task notification policy.
      const reminderId = Platform.OS === 'ios' || !remote
        ? await NotificationsService.scheduleTaskReminder(Platform.OS === 'android' && !remote ? `pending-${Date.now()}` : id, prompt, scheduledFor)
        : null;
      const task: ScheduledTask = {
        id,
        prompt,
        scheduledFor,
        createdAt: Date.now(),
        status: 'pending',
        reminderId,
        jobId: remote?.jobId,
        assistantMessageId: remote?.assistantMessageId,
        conversationId: remote?.conversationId,
      };
      const tasks = [...get().tasks, task];
      set({ tasks });
      try {
        await persistTasks(tasks);
      } catch (error) {
        set({ tasks: get().tasks.filter((item) => item.id !== task.id) });
        await NotificationsService.cancelScheduled(reminderId);
        throw error;
      }
      return task;
    },

    rescheduleTask: async (id, scheduledFor, prompt) => {
      const existing = get().tasks.find((t) => t.id === id);
      // Android retains its established cancel-then-reschedule reminder flow.
      if (Platform.OS === 'android') await NotificationsService.cancelScheduled(existing?.reminderId);
      const reminderId = existing
        ? await NotificationsService.scheduleTaskReminder(id, prompt ?? existing.prompt, scheduledFor)
        : null;
      const previousTasks = get().tasks;
      const tasks = previousTasks.map((t) =>
        t.id === id
          ? {
              ...t,
              prompt: Platform.OS === 'ios' ? (prompt ?? t.prompt) : t.prompt,
              scheduledFor,
              status: 'pending' as const,
              submissionPending: false,
              lastRunAt: undefined,
              lastResultPreview: undefined,
              reminderId,
            }
          : t,
      );
      set({ tasks });
      try {
        await persistTasks(tasks);
      } catch (error) {
        set({ tasks: previousTasks });
        await NotificationsService.cancelScheduled(reminderId);
        throw error;
      }
      if (Platform.OS !== 'android' && existing?.reminderId && existing.reminderId !== reminderId) {
        await NotificationsService.cancelScheduled(existing.reminderId);
      }
    },

    replaceRemoteTask: async (id, scheduledFor, remote) => {
      const existing = get().tasks.find((task) => task.id === id);
      if (Platform.OS === 'android') await NotificationsService.cancelScheduled(existing?.reminderId);
      const reminderId = existing && Platform.OS === 'ios'
        ? await NotificationsService.scheduleTaskReminder(id, remote.prompt ?? existing.prompt, scheduledFor)
        : null;
      const previousTasks = get().tasks;
      const tasks = previousTasks.map((task) =>
        task.id === id
          ? {
              ...task,
              prompt: Platform.OS === 'ios' ? (remote.prompt ?? task.prompt) : task.prompt,
              scheduledFor,
              status: 'pending' as const,
              submissionPending: false,
              lastRunAt: undefined,
              lastResultPreview: undefined,
              reminderId,
              jobId: remote.jobId,
              assistantMessageId: remote.assistantMessageId ?? task.assistantMessageId,
              conversationId: remote.conversationId,
            }
          : task,
      );
      set({ tasks });
      try {
        await persistTasks(tasks);
      } catch (error) {
        set({ tasks: previousTasks });
        await NotificationsService.cancelScheduled(reminderId);
        throw error;
      }
      if (Platform.OS !== 'android' && existing?.reminderId) await NotificationsService.cancelScheduled(existing.reminderId);
    },

    markSubmissionPending: async (id, run) => {
      const previousTasks = get().tasks;
      const tasks = previousTasks.map((task) => task.id === id
        ? { ...task, submissionPending: true, conversationId: run.conversationId, assistantMessageId: run.assistantMessageId }
        : task);
      set({ tasks });
      try {
        await persistTasks(tasks);
      } catch (error) {
        set({ tasks: previousTasks });
        throw error;
      }
    },

    clearSubmissionPending: async (id) => {
      const previousTasks = get().tasks;
      const tasks = previousTasks.map((task) => task.id === id
        ? { ...task, submissionPending: false, conversationId: undefined, assistantMessageId: undefined }
        : task);
      set({ tasks });
      try {
        await persistTasks(tasks);
      } catch (error) {
        set({ tasks: previousTasks });
        throw error;
      }
    },

    markRemoteJobLost: async (id, reason) => {
      const previousTasks = get().tasks;
      const tasks = previousTasks.map((task) => task.id === id
        ? {
            ...task,
            status: 'failed' as const,
            submissionPending: false,
            jobId: undefined,
            lastRunAt: Date.now(),
            lastResultPreview: reason.slice(0, 160),
          }
        : task);
      set({ tasks });
      try {
        await persistTasks(tasks);
      } catch (error) {
        set({ tasks: previousTasks });
        throw error;
      }
    },

    markRun: async (id, status, resultPreview, run) => {
      const existing = get().tasks.find((t) => t.id === id);
      const previousTasks = get().tasks;
      const tasks = previousTasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              submissionPending: false,
              lastRunAt: Date.now(),
              lastResultPreview: resultPreview,
              reminderId: null,
              conversationId: run?.conversationId ?? t.conversationId,
              assistantMessageId: run?.assistantMessageId ?? t.assistantMessageId,
            }
          : t,
      );
      set({ tasks });
      try {
        await persistTasks(tasks);
      } catch (error) {
        set({ tasks: previousTasks });
        throw error;
      }
      await NotificationsService.cancelScheduled(existing?.reminderId);
    },

    markPending: async (id) => {
      const previousTasks = get().tasks;
      if (Platform.OS !== 'ios') {
        const tasks = previousTasks.map((task) =>
          task.id === id
            ? { ...task, status: 'pending' as const, lastRunAt: undefined, lastResultPreview: undefined }
            : task,
        );
        set({ tasks });
        await persistTasks(tasks);
        return;
      }
      const tasks = previousTasks.map((task) =>
        task.id === id
          ? { ...task, status: 'pending' as const, submissionPending: false, lastRunAt: undefined, lastResultPreview: undefined, scheduledFor: Math.max(task.scheduledFor, Date.now() + 1000) }
          : task,
      );
      const existing = previousTasks.find((task) => task.id === id);
      const reminderId = existing
        ? await NotificationsService.scheduleTaskReminder(id, existing.prompt, Math.max(existing.scheduledFor, Date.now() + 1000))
        : null;
      const withReminder = tasks.map((task) => task.id === id ? { ...task, reminderId } : task);
      set({ tasks: withReminder });
      try {
        await persistTasks(withReminder);
      } catch (error) {
        set({ tasks: previousTasks });
        await NotificationsService.cancelScheduled(reminderId);
        throw error;
      }
      if (existing?.reminderId) await NotificationsService.cancelScheduled(existing.reminderId);
    },

    removeTask: async (id) => {
      const existing = get().tasks.find((t) => t.id === id);
      if (Platform.OS === 'ios' && existing?.submissionPending) {
        throw new Error('This task is checking whether the Gateway accepted it. Check its status before deleting it to avoid orphaning active work.');
      }
      if (existing?.jobId) {
        const session = await getSession();
        const token = getActiveToken(session);
        if (Platform.OS === 'ios') {
          if (!token) throw new Error('Sign in again before deleting this remote scheduled task.');
          await cancelChatJob(token, existing.jobId);
        } else if (token) {
          await cancelChatJob(token, existing.jobId).catch(() => {});
        }
      }
      const previousTasks = get().tasks;
      const tasks = previousTasks.filter((t) => t.id !== id);
      set({ tasks });
      try {
        await persistTasks(tasks);
      } catch (error) {
        set({ tasks: previousTasks });
        throw error;
      }
      if (existing?.reminderId) await NotificationsService.cancelScheduled(existing.reminderId);
    },
  };
});
