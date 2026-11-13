import { create } from 'zustand';
import { sdk, unwrapApiData } from '@expertai/client';
import type { TaskDefinition, TaskInfo } from '@expertai/client';
const {
  getConfig,
  listTasks,
  startTask: apiStartTask,
  stopTask: apiStopTask,
  restartTask: apiRestartTask,
  getLogs,
  removeTask: apiRemoveTask,
} = sdk;

interface TasksState {
  definitions: TaskDefinition[];
  instances: TaskInfo[];
  logsById: Record<string, string[]>;
  panelOpen: boolean;
  selectedTaskId: string | null;
  selectedTaskLabel: string | null;
  loading: boolean;
  error: string | null;
  hasConfig: boolean;
  outputPanelVisible: boolean;
  outputPanelHeight: number;

  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setSelectedTaskId: (id: string | null) => void;
  setSelectedTaskLabel: (label: string | null) => void;
  setOutputPanelVisible: (visible: boolean) => void;
  setOutputPanelHeight: (height: number) => void;
  fetchConfig: (workspaceId: string) => Promise<void>;
  fetchInstances: (workspaceId: string) => Promise<void>;
  fetchLogs: (taskId: string) => Promise<void>;
  startTask: (label: string, workspaceId: string) => Promise<void>;
  stopTask: (taskId: string) => Promise<void>;
  restartTask: (taskId: string) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
  appendLogLine: (taskId: string, line: string) => void;
  updateTaskStatus: (taskId: string, status: TaskInfo['status'], exitCode?: number | null) => void;
  addTaskInstance: (info: TaskInfo) => void;
}

const DEFAULT_OUTPUT_HEIGHT = 200;

export const useTasksStore = create<TasksState>((set, get) => ({
  definitions: [],
  instances: [],
  logsById: {},
  panelOpen: false,
  selectedTaskId: null,
  selectedTaskLabel: null,
  loading: false,
  error: null,
  hasConfig: false,
  outputPanelVisible: false,
  outputPanelHeight: DEFAULT_OUTPUT_HEIGHT,

  setPanelOpen: (open) => set({ panelOpen: open }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setSelectedTaskLabel: (label) => set({ selectedTaskLabel: label }),
  setOutputPanelVisible: (visible) => set({ outputPanelVisible: visible }),
  setOutputPanelHeight: (height) => set({ outputPanelHeight: Math.max(100, Math.min(500, height)) }),

  fetchConfig: async (workspaceId) => {
    try {
      const result = await getConfig({ path: { workspace_id: workspaceId } });
      const config = unwrapApiData(result.data);
      if (config) {
        const tasks = config.tasks;
        const state = get();
        const selectedLabel = state.selectedTaskLabel;
        const hasSelected = selectedLabel && tasks.some((t) => t.label === selectedLabel);
        set({
          definitions: tasks,
          hasConfig: tasks.length > 0,
          error: null,
          selectedTaskLabel: hasSelected ? selectedLabel : (tasks[0]?.label ?? null),
        });
      } else {
        set({ definitions: [], hasConfig: false, selectedTaskLabel: null });
      }
    } catch (e: any) {
      set({ definitions: [], hasConfig: false, error: e.message });
    }
  },

  fetchInstances: async (workspaceId) => {
    try {
      const result = await listTasks({ path: { workspace_id: workspaceId } });
      const instances = unwrapApiData(result.data);
      if (instances) {
        set({ instances, error: null });
      }
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchLogs: async (taskId) => {
    try {
      const result = await getLogs({ path: { task_id: taskId } });
      const logs = unwrapApiData(result.data);
      if (logs) {
        set((s) => ({
          logsById: { ...s.logsById, [taskId]: logs.lines },
        }));
      }
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  startTask: async (label, workspaceId) => {
    set({ loading: true, error: null });
    try {
      const result = await apiStartTask({
        body: { label, workspace_id: workspaceId },
      });
      const info = unwrapApiData(result.data);
      if (info) {
        set((s) => ({
          instances: [...s.instances.filter((i) => i.id !== info.id), info],
          loading: false,
          selectedTaskId: info.id,
          selectedTaskLabel: info.label,
          outputPanelVisible: true,
        }));
      }
    } catch (e: any) {
      set({ loading: false, error: e.message });
    }
  },

  stopTask: async (taskId) => {
    set({ loading: true, error: null });
    try {
      const result = await apiStopTask({ body: { task_id: taskId } });
      const info = unwrapApiData(result.data);
      if (info) {
        set((s) => ({
          instances: s.instances.map((i) => (i.id === info.id ? info : i)),
          loading: false,
        }));
      }
    } catch (e: any) {
      set({ loading: false, error: e.message });
    }
  },

  restartTask: async (taskId) => {
    set({ loading: true, error: null });
    try {
      const result = await apiRestartTask({ body: { task_id: taskId } });
      const info = unwrapApiData(result.data);
      if (info) {
        set((s) => ({
          instances: [
            ...s.instances.filter((i) => i.id !== taskId && i.id !== info.id),
            info,
          ],
          loading: false,
          selectedTaskId: info.id,
          selectedTaskLabel: info.label,
          logsById: { ...s.logsById, [info.id]: [] },
          outputPanelVisible: true,
        }));
      }
    } catch (e: any) {
      set({ loading: false, error: e.message });
    }
  },

  removeTask: async (taskId) => {
    try {
      await apiRemoveTask({ path: { task_id: taskId } });
      set((s) => ({
        instances: s.instances.filter((i) => i.id !== taskId),
        selectedTaskId: s.selectedTaskId === taskId ? null : s.selectedTaskId,
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  appendLogLine: (taskId, line) =>
    set((s) => {
      const existing = s.logsById[taskId] ?? [];
      const updated = [...existing, line];
      if (updated.length > 5000) {
        updated.splice(0, updated.length - 5000);
      }
      return { logsById: { ...s.logsById, [taskId]: updated } };
    }),

  updateTaskStatus: (taskId, status, exitCode) =>
    set((s) => ({
      instances: s.instances.map((i) =>
        i.id === taskId
          ? { ...i, status, exit_code: exitCode ?? i.exit_code, stopped_at: status !== 'running' ? new Date().toISOString() : i.stopped_at }
          : i
      ),
    })),

  addTaskInstance: (info) =>
    set((s) => ({
      instances: [...s.instances.filter((i) => i.id !== info.id), info],
    })),
}));

