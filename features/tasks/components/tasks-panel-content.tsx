import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Play,
  Square,
  RotateCcw,
  Circle,
  ChevronDown,
  ChevronRight,
  Trash2,
} from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTasksStore } from '../store';
import { useWorkspaceStore } from '@/features/workspace/store';
import type { TaskDefinition, TaskInfo } from '@expertai/client';

const SOURCE_COLORS: Record<string, string> = {
  npm: '#CB3837',
  yarn: '#2C8EBB',
  pnpm: '#F69220',
  bun: '#FBF0DF',
  make: '#6D8086',
  cargo: '#CE412B',
  docker: '#2496ED',
  python: '#3776AB',
  rake: '#CC342D',
  gradle: '#02303A',
  deno: '#000000',
  pi: '#8B5CF6',
};

const SOURCE_LABELS: Record<string, string> = {
  npm: 'npm',
  yarn: 'yarn',
  pnpm: 'pnpm',
  bun: 'bun',
  make: 'make',
  cargo: 'cargo',
  docker: 'docker',
  python: 'py',
  rake: 'rake',
  gradle: 'gradle',
  deno: 'deno',
  pi: 'pi',
};

function SourceBadge({ source, isDark }: { source: string; isDark: boolean }) {
  const bg = SOURCE_COLORS[source] ?? (isDark ? '#555' : '#999');
  const label = SOURCE_LABELS[source] ?? source;
  const textColor = source === 'bun' ? '#000' : '#fff';
  return (
    <View style={[styles.sourceBadge, { backgroundColor: bg }]}>
      <Text style={[styles.sourceBadgeText, { color: textColor }]}>
        {label}
      </Text>
    </View>
  );
}

function StatusDot({ status }: { status: TaskInfo['status'] }) {
  const color =
    status === 'running'
      ? '#34C759'
      : status === 'failed'
        ? '#FF3B30'
        : '#8E8E93';
  return <Circle size={8} color={color} fill={color} strokeWidth={0} />;
}

export function TasksPanelContent() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDark = colorScheme === 'dark';
  const textPrimary = isDark ? '#fefdfd' : colors.text;
  const textMuted = isDark ? '#cdc8c5' : colors.textTertiary;
  const hoverBg = isDark ? '#333' : '#F5F5F5';

  const definitions = useTasksStore((s) => s.definitions);
  const instances = useTasksStore((s) => s.instances);
  const selectedTaskLabel = useTasksStore((s) => s.selectedTaskLabel);
  const setSelectedTaskLabel = useTasksStore((s) => s.setSelectedTaskLabel);
  const startTask = useTasksStore((s) => s.startTask);
  const stopTask = useTasksStore((s) => s.stopTask);
  const restartTask = useTasksStore((s) => s.restartTask);
  const removeTask = useTasksStore((s) => s.removeTask);
  const loading = useTasksStore((s) => s.loading);
  const setSelectedTaskId = useTasksStore((s) => s.setSelectedTaskId);
  const setOutputPanelVisible = useTasksStore((s) => s.setOutputPanelVisible);
  const setPanelOpen = useTasksStore((s) => s.setPanelOpen);

  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.selectedWorkspaceId),
  );
  const workspaceId = workspace?.id ?? '';

  const fetchConfig = useTasksStore((s) => s.fetchConfig);
  const fetchInstances = useTasksStore((s) => s.fetchInstances);

  const [expandedSection, setExpandedSection] = useState<'available' | 'running' | null>(
    instances.length > 0 ? 'running' : 'available',
  );

  useEffect(() => {
    if (workspaceId) {
      fetchConfig(workspaceId);
      fetchInstances(workspaceId);
    }
  }, [workspaceId, fetchConfig, fetchInstances]);

  useEffect(() => {
    if (instances.length > 0 && expandedSection === null) {
      setExpandedSection('running');
    } else if (instances.length === 0 && expandedSection === 'running') {
      setExpandedSection('available');
    }
  }, [instances.length]);

  const handleStart = useCallback(
    (label: string) => {
      startTask(label, workspaceId);
      setPanelOpen(false);
    },
    [startTask, workspaceId, setPanelOpen],
  );

  const handleStop = useCallback(
    (taskId: string) => { stopTask(taskId); },
    [stopTask],
  );

  const handleRestart = useCallback(
    (taskId: string) => { restartTask(taskId); },
    [restartTask],
  );

  const handleRemove = useCallback(
    (taskId: string) => { removeTask(taskId); },
    [removeTask],
  );

  const handleSelectTask = useCallback(
    (label: string, instanceId?: string) => {
      setSelectedTaskLabel(label);
      if (instanceId) {
        setSelectedTaskId(instanceId);
        setOutputPanelVisible(true);
      }
      setPanelOpen(false);
    },
    [setSelectedTaskLabel, setSelectedTaskId, setOutputPanelVisible, setPanelOpen],
  );

  const runningLabels = new Set(
    instances.filter((i) => i.status === 'running').map((i) => i.label),
  );
  const availableTasks = definitions.filter(
    (d) => !runningLabels.has(d.label),
  );

  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent} bounces={false}>
      {instances.length > 0 && (
        <>
          <Pressable
            onPress={() =>
              setExpandedSection(expandedSection === 'running' ? null : 'running')
            }
            style={styles.sectionHeader}
          >
            {expandedSection === 'running' ? (
              <ChevronDown size={12} color={textMuted} strokeWidth={2} />
            ) : (
              <ChevronRight size={12} color={textMuted} strokeWidth={2} />
            )}
            <Text style={[styles.sectionTitle, { color: textMuted }]}>
              ACTIVE ({instances.length})
            </Text>
          </Pressable>
          {expandedSection === 'running' &&
            instances.map((instance) => (
              <TaskInstanceRow
                key={instance.id}
                instance={instance}
                isSelected={instance.label === selectedTaskLabel}
                onSelect={() => handleSelectTask(instance.label, instance.id)}
                onStop={() => handleStop(instance.id)}
                onRestart={() => handleRestart(instance.id)}
                onRemove={() => handleRemove(instance.id)}
                textPrimary={textPrimary}
                textMuted={textMuted}
                hoverBg={hoverBg}
                isDark={isDark}
              />
            ))
          }
        </>
      )}

      {availableTasks.length > 0 && (
        <>
          <Pressable
            onPress={() =>
              setExpandedSection(expandedSection === 'available' ? null : 'available')
            }
            style={styles.sectionHeader}
          >
            {expandedSection === 'available' ? (
              <ChevronDown size={12} color={textMuted} strokeWidth={2} />
            ) : (
              <ChevronRight size={12} color={textMuted} strokeWidth={2} />
            )}
            <Text style={[styles.sectionTitle, { color: textMuted }]}>
              AVAILABLE ({availableTasks.length})
            </Text>
          </Pressable>
          {expandedSection === 'available' &&
            availableTasks.map((def) => (
              <AvailableTaskRow
                key={def.label}
                definition={def}
                isSelected={def.label === selectedTaskLabel}
                onSelect={() => handleSelectTask(def.label)}
                onStart={() => handleStart(def.label)}
                textPrimary={textPrimary}
                textMuted={textMuted}
                hoverBg={hoverBg}
                loading={loading}
                isDark={isDark}
              />
            ))
          }
        </>
      )}

      {instances.length === 0 && availableTasks.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: textMuted }]}>
            No tasks configured.{'\n'}Add .pi/tasks.json to your workspace.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function TaskInstanceRow({
  instance,
  isSelected,
  onSelect,
  onStop,
  onRestart,
  onRemove,
  textPrimary,
  textMuted,
  hoverBg,
  isDark,
}: {
  instance: TaskInfo;
  isSelected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onRestart: () => void;
  onRemove: () => void;
  textPrimary: string;
  textMuted: string;
  hoverBg: string;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed, hovered }: any) => [
        styles.taskRow,
        isSelected && {
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
        (pressed || hovered) && { backgroundColor: hoverBg },
      ]}
    >
      <StatusDot status={instance.status} />
      <SourceBadge source={instance.source ?? 'pi'} isDark={isDark} />
      <View style={styles.taskRowInfo}>
        <Text style={[styles.taskRowLabel, { color: textPrimary }]} numberOfLines={1}>
          {instance.label}
        </Text>
        <Text style={[styles.taskRowCmd, { color: textMuted }]} numberOfLines={1}>
          {instance.command}
        </Text>
      </View>
      <View style={styles.taskRowActions}>
        {instance.status === 'running' ? (
          <>
            <Pressable onPress={onRestart} style={styles.actionBtn} accessibilityLabel="Restart task">
              <RotateCcw size={12} color={textMuted} strokeWidth={2} />
            </Pressable>
            <Pressable onPress={onStop} style={styles.actionBtn} accessibilityLabel="Stop task">
              <Square size={12} color="#FF3B30" strokeWidth={2} />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={onRestart} style={styles.actionBtn} accessibilityLabel="Restart task">
              <Play size={12} color="#34C759" strokeWidth={2} />
            </Pressable>
            <Pressable onPress={onRemove} style={styles.actionBtn} accessibilityLabel="Remove task">
              <Trash2 size={12} color={textMuted} strokeWidth={2} />
            </Pressable>
          </>
        )}
      </View>
    </Pressable>
  );
}

function AvailableTaskRow({
  definition,
  isSelected,
  onSelect,
  onStart,
  textPrimary,
  textMuted,
  hoverBg,
  loading,
  isDark,
}: {
  definition: TaskDefinition;
  isSelected: boolean;
  onSelect: () => void;
  onStart: () => void;
  textPrimary: string;
  textMuted: string;
  hoverBg: string;
  loading: boolean;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onSelect}
      disabled={loading}
      style={({ pressed, hovered }: any) => [
        styles.taskRow,
        isSelected && {
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
        (pressed || hovered) && { backgroundColor: hoverBg },
        loading && { opacity: 0.5 },
      ]}
    >
      <SourceBadge source={definition.source ?? 'pi'} isDark={isDark} />
      <View style={styles.taskRowInfo}>
        <Text style={[styles.taskRowLabel, { color: textPrimary }]} numberOfLines={1}>
          {definition.label}
        </Text>
        <Text style={[styles.taskRowCmd, { color: textMuted }]} numberOfLines={1}>
          {definition.command}
        </Text>
      </View>
      {definition.group && (
        <View style={[styles.groupBadge, { borderColor: textMuted }]}>
          <Text style={[styles.groupBadgeText, { color: textMuted }]}>
            {definition.group}
          </Text>
        </View>
      )}
      <Pressable
        onPress={onStart}
        disabled={loading}
        style={styles.actionBtn}
        accessibilityLabel="Start task"
      >
        <Play size={12} color="#34C759" strokeWidth={2.5} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: Fonts.sansSemiBold,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  taskRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  taskRowLabel: {
    fontSize: 13,
    fontFamily: Fonts.sansMedium,
    fontWeight: '500',
  },
  taskRowCmd: {
    fontSize: 11,
    fontFamily: Fonts.mono,
    marginTop: 1,
  },
  taskRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBadge: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  sourceBadgeText: {
    fontSize: 8,
    fontFamily: Fonts.sansSemiBold,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  groupBadge: {
    borderWidth: 0.633,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  groupBadgeText: {
    fontSize: 9,
    fontFamily: Fonts.sansMedium,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    textAlign: 'center',
    lineHeight: 18,
  },
});

