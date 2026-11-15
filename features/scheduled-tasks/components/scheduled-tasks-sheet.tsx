import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Fonts } from '@/constants/theme';
import { useScheduledTasksStore, type ScheduledTask } from '../store';
import { ScheduleTaskSheet } from './schedule-task-sheet';

interface ThemeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  sheetBackground: string;
  sheetHandle: string;
  border: string;
  accent: string;
}

interface ScheduledTasksSheetProps {
  visible: boolean;
  isDark: boolean;
  colors: ThemeColors;
  onClose: () => void;
  onOpenScheduleNew: () => void;
  onRunTask: (task: ScheduledTask) => void;
  onRescheduleRemote?: (task: ScheduledTask, prompt: string, scheduledFor: number) => Promise<void>;
  onReplaceRemoteTask?: (task: ScheduledTask, prompt: string, scheduledFor: number) => Promise<void>;
  /** Switch to the Daily notes "tab" — omit to hide the segmented control. */
  onSwitchToNotes?: () => void;
}

function formatWhen(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

function TaskRow({
  task,
  isDark,
  colors,
  onRun,
  onReschedule,
  canReschedule,
  onDelete,
}: {
  task: ScheduledTask;
  isDark: boolean;
  colors: ThemeColors;
  onRun: () => void;
  onReschedule: () => void;
  canReschedule: boolean;
  onDelete: () => void;
}) {
  const isDue = task.status === 'pending' && !task.submissionPending && task.scheduledFor <= Date.now();
  const badgeColor = task.submissionPending ? colors.accent : task.status === 'completed' ? '#34C759' : task.status === 'failed' || (Platform.OS === 'ios' && task.status === 'exhausted') ? '#FF3B30' : isDue ? '#FF9500' : colors.textTertiary;
  const badgeLabel = task.submissionPending ? 'Checking status' : task.status === 'completed' ? 'Done' : Platform.OS === 'ios' && task.status === 'exhausted' ? 'Needs restart' : task.status === 'failed' ? 'Failed' : isDue ? 'Due now' : 'Scheduled';

  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowPrompt, { color: colors.text }]} numberOfLines={2}>
          {task.prompt}
        </Text>
        <View style={styles.rowMetaLine}>
          <View style={[styles.badge, { backgroundColor: `${badgeColor}22` }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
          <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>
            {task.submissionPending ? 'Checking Gateway acceptance…' : task.status === 'pending' ? formatWhen(task.scheduledFor) : task.lastRunAt ? `Ran ${formatWhen(task.lastRunAt)}` : ''}
          </Text>
        </View>
        {Platform.OS === 'ios' && task.status === 'pending' && !task.submissionPending && !task.reminderId ? (
          <Text style={[styles.resultPreview, { color: '#C48A2D' }]} numberOfLines={2}>
            No iPhone reminder was saved. Check notification permission or run this task manually.
          </Text>
        ) : null}
        {task.lastResultPreview ? (
          <Text style={[styles.resultPreview, { color: colors.textSecondary }]} numberOfLines={2}>
            {task.lastResultPreview}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
        <Pressable onPress={onRun} hitSlop={8} {...(Platform.OS === 'ios' ? { accessibilityRole: 'button' as const, accessibilityLabel: task.submissionPending ? 'Check scheduled task submission status' : 'Run scheduled task' } : {})} style={styles.rowActionBtn}>
          <Ionicons name={task.submissionPending ? 'refresh-outline' : 'play-circle-outline'} size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={onReschedule} disabled={!canReschedule || task.submissionPending} hitSlop={8} style={styles.rowActionBtn}>
          <Ionicons name="time-outline" size={20} color={canReschedule ? colors.text : colors.textTertiary} />
        </Pressable>
        <Pressable onPress={onDelete} disabled={!!task.submissionPending} hitSlop={8} style={[styles.rowActionBtn, { opacity: task.submissionPending ? 0.4 : 1 }]}>
          <Ionicons name="trash-outline" size={19} color="#FF3B30" />
        </Pressable>
      </View>
    </View>
  );
}

export function ScheduledTasksSheet({ visible, isDark, colors, onClose, onOpenScheduleNew, onRunTask, onRescheduleRemote, onReplaceRemoteTask, onSwitchToNotes }: ScheduledTasksSheetProps) {
  const { tasks, loaded, load, persistenceError, retryPersistence, rescheduleTask, removeTask } = useScheduledTasksStore();
  const [rescheduling, setRescheduling] = useState<ScheduledTask | null>(null);

  useEffect(() => {
    if (visible && !loaded) load();
  }, [visible, loaded, load]);

  const pending = tasks.filter((t) => t.status === 'pending').sort((a, b) => a.scheduledFor - b.scheduledFor);
  const history = tasks.filter((t) => t.status !== 'pending').sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0));

  const confirmDelete = (task: ScheduledTask) => {
    if (Platform.OS !== 'ios') return removeTask(task.id);
    Alert.alert('Delete scheduled task?', 'This removes the task and cancels its reminder. A remote task that has already started may still finish.', [
      { text: 'Keep task', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        void removeTask(task.id).catch((error) => Alert.alert('Could not delete task', error instanceof Error ? error.message : 'Please try again.'));
      } },
    ]);
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%' }}>
            <View style={[styles.sheet, { backgroundColor: colors.sheetBackground }]}>
              <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />
              {onSwitchToNotes ? (
                <View style={[styles.segment, { backgroundColor: isDark ? '#1E1E1E' : '#F6F6F6' }]}>
                  <Pressable
                    onPress={onSwitchToNotes}
                    style={({ pressed }) => [styles.segmentOff, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.segmentOffText, { color: colors.text }]}>Daily notes</Text>
                  </Pressable>
                  <View style={[styles.segmentOn, { backgroundColor: isDark ? '#E8E8E8' : '#1A1A1A' }]}>
                    <Text style={[styles.segmentOnText, { color: isDark ? '#1A1A1A' : '#fff' }]}>Scheduled</Text>
                  </View>
                </View>
              ) : null}
              <View style={styles.headerRow}>
                <Text style={[styles.title, { color: colors.text }]}>Scheduled tasks</Text>
                <Pressable
                  onPress={onOpenScheduleNew}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: colors.text }}>New</Text>
                </Pressable>
              </View>

              {Platform.OS === 'ios' && persistenceError ? (
                <View style={{ marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: isDark ? '#35242A' : '#FFF1F0', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="warning-outline" size={16} color="#D92D20" />
                  <Text accessibilityRole="alert" style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 12, color: colors.text }}>{persistenceError}</Text>
                  <Pressable onPress={() => { void retryPersistence(); }} accessibilityRole="button" accessibilityLabel="Retry saving scheduled tasks"><Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>Retry</Text></Pressable>
                </View>
              ) : null}
              <ScrollView style={{ maxHeight: 460 }}>
                {pending.length === 0 && history.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="alarm-outline" size={28} color={colors.textTertiary} />
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      {Platform.OS === 'ios'
                        ? <>No scheduled tasks yet. Tap &quot;New&quot; to schedule one. Gateway tasks run at the selected time; local reminder tasks are ready to run when you tap Play.</>
                        : <>No scheduled tasks yet. Tap &quot;New&quot; to set one up — a reminder-style prompt that runs whenever you open the app after its scheduled time.</>}
                    </Text>
                  </View>
                ) : (
                  <>
                    {pending.length > 0 && (
                      <>
                        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>Upcoming</Text>
                        {pending.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            isDark={isDark}
                            colors={colors}
                            onRun={() => onRunTask(task)}
                            onReschedule={() => setRescheduling(task)}
                            canReschedule={!task.jobId || !!onRescheduleRemote}
                            onDelete={() => confirmDelete(task)}
                          />
                        ))}
                      </>
                    )}
                    {history.length > 0 && (
                      <>
                        <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: pending.length ? 16 : 0 }]}>
                          History
                        </Text>
                        {history.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            isDark={isDark}
                            colors={colors}
                            onRun={() => onRunTask(task)}
                            onReschedule={() => setRescheduling(task)}
                            canReschedule={!task.jobId || !!onRescheduleRemote}
                            onDelete={() => confirmDelete(task)}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScheduleTaskSheet
        visible={!!rescheduling}
        isDark={isDark}
        colors={colors}
        initialPrompt={rescheduling?.prompt}
        initialTime={rescheduling ? Math.max(rescheduling.scheduledFor, Date.now() + 5 * 60 * 1000) : undefined}
        isRescheduling={!!rescheduling}
        onClose={() => setRescheduling(null)}
        onSchedule={async (prompt, scheduledFor) => {
          if (rescheduling) {
            if (Platform.OS !== 'ios') {
              if (rescheduling.jobId && onRescheduleRemote) {
                onRescheduleRemote(rescheduling, rescheduling.prompt, scheduledFor).catch(() => {});
              } else {
                void rescheduleTask(rescheduling.id, scheduledFor);
              }
              setRescheduling(null);
              return;
            }
            if (prompt.trim() !== rescheduling.prompt.trim()) {
              if (rescheduling.jobId && onReplaceRemoteTask) {
                await onReplaceRemoteTask(rescheduling, prompt.trim(), scheduledFor);
              } else {
                await rescheduleTask(rescheduling.id, scheduledFor, prompt.trim());
              }
            } else if (rescheduling.jobId && onRescheduleRemote) {
              await onRescheduleRemote(rescheduling, prompt, scheduledFor);
            } else {
              await rescheduleTask(rescheduling.id, scheduledFor);
            }
            setRescheduling(null);
          }
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  segmentOn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  segmentOnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12.5,
  },
  segmentOff: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  segmentOffText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12.5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 17,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    gap: 10,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  sectionLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 0.633,
  },
  rowPrompt: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    lineHeight: 19,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rowMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  resultPreview: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  rowActionBtn: {
    padding: 4,
  },
});
