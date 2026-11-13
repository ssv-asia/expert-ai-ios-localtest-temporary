import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Play, Square, ChevronDown } from 'lucide-react-native';

import { Fonts } from '@/constants/theme';
import { useTasksStore } from '../store';
import { useWorkspaceStore } from '@/features/workspace/store';

interface MobileTaskSelectorProps {
  color: string;
  bgColor: string;
  onPress: () => void;
  onOutputPress: () => void;
}

export function MobileTaskSelector({ color, bgColor, onPress, onOutputPress }: MobileTaskSelectorProps) {
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

  const selectedInstance = instances.find((i) => i.label === selectedTaskLabel);
  const isRunning = selectedInstance?.status === 'running';
  const displayLabel = selectedTaskLabel ?? 'Task';

  const handleToggle = () => {
    if (!selectedTaskLabel || !workspace?.id) return;
    if (isRunning && selectedInstance) {
      stopTask(selectedInstance.id);
    } else {
      startTask(selectedTaskLabel, workspace.id);
    }
  };

  const handleLabelPress = () => {
    if (isRunning && selectedInstance) {
      onOutputPress();
    } else {
      onPress();
    }
  };

  return (
    <View style={[styles.selector, { backgroundColor: bgColor }]}>
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
        onPress={handleLabelPress}
        style={({ pressed }) => [
          styles.labelBtn,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel="Select task"
      >
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {displayLabel}
        </Text>
        <ChevronDown size={10} color={color} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    borderRadius: 6,
    overflow: 'hidden',
  },
  toggleBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: 6,
    height: 24,
  },
  label: {
    fontSize: 11,
    fontFamily: Fonts.sansMedium,
    fontWeight: '500',
    maxWidth: 80,
  },
});
