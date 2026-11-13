import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Play, Square, ChevronDown } from 'lucide-react-native';

import { Fonts } from '@/constants/theme';
import { useTasksStore } from '../store';
import { useWorkspaceStore } from '@/features/workspace/store';
import { TasksDropdown } from './tasks-panel';

export function TaskSelector() {
  const panelOpen = useTasksStore((s) => s.panelOpen);
  const togglePanel = useTasksStore((s) => s.togglePanel);
  const instances = useTasksStore((s) => s.instances);
  const definitions = useTasksStore((s) => s.definitions);
  const hasConfig = useTasksStore((s) => s.hasConfig);
  const selectedTaskLabel = useTasksStore((s) => s.selectedTaskLabel);
  const fetchConfig = useTasksStore((s) => s.fetchConfig);
  const fetchInstances = useTasksStore((s) => s.fetchInstances);
  const startTask = useTasksStore((s) => s.startTask);
  const stopTask = useTasksStore((s) => s.stopTask);

  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.selectedWorkspaceId),
  );

  useEffect(() => {
    if (workspace?.id) {
      fetchConfig(workspace.id);
      fetchInstances(workspace.id);
    }
  }, [workspace?.id, fetchConfig, fetchInstances]);

  if (!hasConfig && instances.length === 0) return null;

  const selectedDef = definitions.find((d) => d.label === selectedTaskLabel);
  const selectedInstance = instances.find((i) => i.label === selectedTaskLabel);
  const isRunning = selectedInstance?.status === 'running';
  const displayLabel = selectedTaskLabel ?? 'No task';

  const handleToggle = () => {
    if (!selectedTaskLabel || !workspace?.id) return;
    if (isRunning && selectedInstance) {
      stopTask(selectedInstance.id);
    } else {
      startTask(selectedTaskLabel, workspace.id);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.selector}>
        <Pressable
          onPress={handleToggle}
          disabled={!selectedTaskLabel}
          style={({ pressed }) => [
            styles.toggleBtn,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel={isRunning ? 'Stop task' : 'Start task'}
        >
          {isRunning ? (
            <Square size={10} color="#FF3B30" fill="#FF3B30" strokeWidth={0} />
          ) : (
            <Play size={10} color="#34C759" fill="#34C759" strokeWidth={0} />
          )}
        </Pressable>

        <Pressable
          onPress={togglePanel}
          style={({ pressed }) => [
            styles.labelBtn,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Select task"
        >
          <Text style={styles.label} numberOfLines={1}>
            {displayLabel}
          </Text>
          <ChevronDown size={10} color="#888" strokeWidth={2} />
        </Pressable>
      </View>

      {panelOpen && <TasksDropdown />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
    borderRadius: 6,
    overflow: 'hidden',
  },
  toggleBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  labelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 26,
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.sansMedium,
    fontWeight: '500',
    color: '#999',
    maxWidth: 120,
  },
});
