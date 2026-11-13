import { useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTasksStore } from '../../store';
import { TasksPanelContent } from '../tasks-panel-content';

export function TasksDropdown() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDark = colorScheme === 'dark';
  const textPrimary = isDark ? '#fefdfd' : colors.text;
  const textMuted = isDark ? '#cdc8c5' : colors.textTertiary;
  const popoverBg = isDark ? '#252525' : '#FFFFFF';
  const borderColor = isDark ? '#3b3a39' : 'rgba(0,0,0,0.12)';

  const setPanelOpen = useTasksStore((s) => s.setPanelOpen);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-tasks-panel]')) {
        setPanelOpen(false);
      }
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [setPanelOpen]);

  return (
    <View
      {...({ 'data-tasks-panel': true } as any)}
      style={[
        styles.panel,
        { backgroundColor: popoverBg, borderColor },
      ]}
    >
      <View style={[styles.panelHeader, { borderBottomColor: borderColor }]}>
        <Text style={[styles.panelTitle, { color: textPrimary }]}>Tasks</Text>
        <Pressable onPress={() => setPanelOpen(false)} style={styles.closeBtn}>
          <X size={14} color={textMuted} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.panelBody}>
        <TasksPanelContent />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 30,
    right: 0,
    width: 340,
    maxHeight: 420,
    borderRadius: 10,
    borderWidth: 0.633,
    zIndex: 1000,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.2)' },
      default: { elevation: 16 },
    }),
  } as any,
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 0.633,
  },
  panelTitle: {
    fontSize: 13,
    fontFamily: Fonts.sansSemiBold,
    fontWeight: '600',
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelBody: {
    flex: 1,
  },
});
