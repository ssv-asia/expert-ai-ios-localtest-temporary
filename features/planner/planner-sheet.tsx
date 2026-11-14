import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { localDayKey, type DailyNote } from '@/lib/daily-notes';
import { useScheduledTasksStore, type ScheduledTask } from '@/features/scheduled-tasks/store';
import { ScheduleTaskSheet } from '@/features/scheduled-tasks/components/schedule-task-sheet';
import { NoteMarkdown, notePaletteFrom } from '@/features/daily-notes/note-markdown';

/** Broad theme-colour shape (superset of what both panels need). */
interface ThemeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  background: string;
  sheetBackground: string;
  sheetHandle: string;
  border: string;
  surface: string;
  surfaceRaised: string;
  accent: string;
  successColor: string;
}

export type PlannerTab = 'notes' | 'scheduled';

interface PlannerSheetProps {
  visible: boolean;
  tab: PlannerTab;
  onChangeTab: (t: PlannerTab) => void;
  isDark: boolean;
  colors: ThemeColors;
  onClose: () => void;
  /** Called after the native iOS planner modal has fully dismissed. */
  onDismiss?: () => void;

  // Daily notes
  note: DailyNote | null;
  isViewingToday: boolean;
  streak: number;
  archive: DailyNote[];
  onChangeBody: (id: string, body: string) => void;
  onOpenArchived: (id: string) => void;
  onOpenDate: (id: string) => void;
  onOpenWriter: () => void;
  onBackToToday: () => void;
  onDeleteArchived: (id: string) => void;
  onAiInsights: () => void;
  onExtractTasks: () => void;
  onWeeklyDigest: () => void;
  onEndOfDayReview: () => void;
  onShareNote: () => void;

  // Scheduled
  onOpenScheduleNew: () => void;
  onRunTask: (task: ScheduledTask) => void;
  onRescheduleRemote?: (task: ScheduledTask, scheduledFor: number) => Promise<void>;
}

export function PlannerSheet(props: PlannerSheetProps) {
  const {
    visible,
    tab,
    onChangeTab,
    isDark,
    colors,
    onClose,
    onDismiss,
    note,
    isViewingToday,
    streak,
    archive,
    onChangeBody,
    onOpenArchived,
    onOpenDate,
    onOpenWriter,
    onBackToToday,
    onDeleteArchived,
    onAiInsights,
    onExtractTasks,
    onWeeklyDigest,
    onEndOfDayReview,
    onShareNote,
    onOpenScheduleNew,
    onRunTask,
    onRescheduleRemote,
  } = props;

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // --- Keyboard (edge-to-edge: the modal window is NOT resized, lift in JS) ---
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const updateFrame = (e: { endCoordinates?: { height?: number } }) => setKeyboardHeight(e?.endCoordinates?.height ?? 0);
    const s = Keyboard.addListener(showEvt, updateFrame);
    const frame = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillChangeFrame', updateFrame) : null;
    const h = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      s.remove();
      frame?.remove();
      h.remove();
    };
  }, []);

  // Fixed sheet height keeps the size stable across tab switches (no jump), and
  // shrinks to fit above the keyboard when it's open.
  const avail = windowHeight - insets.top - keyboardHeight - 8;
  const sheetHeight = Platform.OS === 'ios'
    ? Math.max(0, Math.min(720, windowHeight * 0.86, avail))
    : Math.max(380, Math.min(720, windowHeight * 0.86, avail));

  // Snappy tab transition without ever unmounting the Modal (which is what caused
  // the fade-out/fade-in flicker between two separate sheets).
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 190,
      useNativeDriver: true,
    }).start();
  }, [tab, anim]);
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [tab === 'notes' ? -14 : 14, 0],
  });

  const inputBg = colors.surface;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.sheetBackground,
              height: sheetHeight,
              marginBottom: keyboardHeight,
              paddingBottom: keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 14) + 6,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />

          {/* Segmented tabs */}
          <View style={[styles.segment, { backgroundColor: inputBg }]}>
            <SegBtn
              label="Daily notes"
              active={tab === 'notes'}
              colors={colors}
              isDark={isDark}
              onPress={() => onChangeTab('notes')}
            />
            <SegBtn
              label="Scheduled"
              active={tab === 'scheduled'}
              colors={colors}
              isDark={isDark}
              onPress={() => onChangeTab('scheduled')}
            />
          </View>

          <Animated.View style={{ flex: 1, opacity: anim, transform: [{ translateX }] }}>
            {tab === 'notes' ? (
              <NotesPanel
                colors={colors}
                isDark={isDark}
                note={note}
                isViewingToday={isViewingToday}
                streak={streak}
                archive={archive}
                onChangeBody={onChangeBody}
                onOpenArchived={onOpenArchived}
                onOpenDate={onOpenDate}
                onOpenWriter={onOpenWriter}
                onBackToToday={onBackToToday}
                onDeleteArchived={onDeleteArchived}
                onAiInsights={onAiInsights}
                onExtractTasks={onExtractTasks}
                onWeeklyDigest={onWeeklyDigest}
                onEndOfDayReview={onEndOfDayReview}
                onShareNote={onShareNote}
              />
            ) : (
              <ScheduledPanel
                colors={colors}
                isDark={isDark}
                onOpenScheduleNew={onOpenScheduleNew}
                onRunTask={onRunTask}
                onRescheduleRemote={onRescheduleRemote}
              />
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function SegBtn({
  label,
  active,
  colors,
  isDark,
  onPress,
}: {
  label: string;
  active: boolean;
  colors: ThemeColors;
  isDark: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.segBtn,
        active && { backgroundColor: isDark ? '#E8E8E8' : colors.text },
        { opacity: pressed && !active ? 0.6 : 1 },
      ]}
    >
      <Text
        style={[
          styles.segText,
          { color: active ? (isDark ? '#1A1A1A' : colors.background) : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Daily notes panel
// ---------------------------------------------------------------------------
function NotesPanel({
  colors,
  isDark,
  note,
  isViewingToday,
  streak,
  archive,
  onChangeBody,
  onOpenArchived,
  onOpenDate,
  onOpenWriter,
  onBackToToday,
  onDeleteArchived,
  onAiInsights,
  onExtractTasks,
  onWeeklyDigest,
  onEndOfDayReview,
  onShareNote,
}: {
  colors: ThemeColors;
  isDark: boolean;
  note: DailyNote | null;
  isViewingToday: boolean;
  streak: number;
  archive: DailyNote[];
  onChangeBody: (id: string, body: string) => void;
  onOpenArchived: (id: string) => void;
  onOpenDate: (id: string) => void;
  onOpenWriter: () => void;
  onBackToToday: () => void;
  onDeleteArchived: (id: string) => void;
  onAiInsights: () => void;
  onExtractTasks: () => void;
  onWeeklyDigest: () => void;
  onEndOfDayReview: () => void;
  onShareNote: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const glanceMaxHeight = Math.max(150, Math.min(340, windowHeight * 0.34));
  const [query, setQuery] = useState('');
  const palette = useMemo(() => notePaletteFrom(colors), [colors]);
  const calendarDays = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, []);

  const archived = useMemo(() => {
    const list = archive.filter((n) => n.id !== note?.id);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const terms = q.split(/\s+/);
    return list.filter((n) => {
      const hay = (n.title + ' ' + n.body).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [archive, note?.id, query]);

  const handleChange = (next: string) => {
    if (note) onChangeBody(note.id, next);
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 12 }}
    >
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {note?.title ?? 'Daily note'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            {streak > 0 ? <Ionicons name="sparkles-outline" size={13} color={colors.accent} /> : null}
            <Text style={[styles.streak, { color: colors.textTertiary }]}>
              {streak > 0 ? `${streak}-day streak` : 'Write a line today to start a streak'}
            </Text>
          </View>
        </View>
        {!isViewingToday ? (
          <Pressable
            onPress={onBackToToday}
            style={({ pressed }) => [styles.todayChip, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="arrow-back" size={13} color={colors.text} />
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>Today</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Glance card — rendered note with tappable checkboxes. Tapping anywhere
          else opens the full-screen writer (the real writing surface). */}
      <Pressable
        onPress={onOpenWriter}
        style={({ pressed }) => [
          styles.glance,
          { backgroundColor: colors.surface, maxHeight: glanceMaxHeight, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        {note && note.body.trim() !== '' ? (
          <NoteMarkdown body={note.body} palette={palette} onToggleTask={handleChange} />
        ) : (
          <Text style={{ color: colors.textTertiary, fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22 }}>
            Tap to start today&apos;s note — headings, checklists, and free writing.
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={onOpenWriter}
        style={({ pressed }) => [
          styles.writeBtn,
          { backgroundColor: isDark ? '#E8E8E8' : colors.text, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="create-outline" size={17} color={isDark ? '#1A1A1A' : colors.background} />
        <Text style={[styles.writeBtnText, { color: isDark ? '#1A1A1A' : colors.background }]}>
          {note && note.body.trim() !== '' ? 'Open note' : 'Start writing'}
        </Text>
      </Pressable>

      {/* AI actions */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.actionRow}
      >
        <ActionButton icon="sparkles-outline" label="AI insights" color={colors.text} onPress={onAiInsights} />
        <ActionButton icon="checkbox-outline" label="Extract tasks" color={colors.text} onPress={onExtractTasks} />
        <ActionButton icon="moon-outline" label="End of day" color={colors.text} onPress={onEndOfDayReview} />
        <ActionButton icon="calendar-outline" label="Weekly digest" color={colors.text} onPress={onWeeklyDigest} />
        <ActionButton icon="share-outline" label="Share" color={colors.text} onPress={onShareNote} />
      </ScrollView>

      <View style={styles.archiveHeader}>
        <Text style={[styles.archiveTitle, { color: colors.textSecondary }]}>Previous notes</Text>
        {archive.filter((n) => n.id !== note?.id).length > 0 ? (
          <View style={[styles.search, { backgroundColor: colors.surface }]}>
            <Ionicons name="search" size={13} color={colors.textTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.textTertiary}
              style={{ flex: 1, paddingVertical: 4, fontFamily: Fonts.sans, fontSize: 13, color: colors.text }}
            />
          </View>
        ) : null}
      </View>

      <View style={[styles.calendarCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.calendarHeader}>
          <Ionicons name="calendar-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.archiveTitle, { color: colors.text }]}>Previous notes by day</Text>
            <Text style={[styles.calendarHint, { color: colors.textTertiary }]}>Tap a date to view it. New notes ask before they are created.</Text>
          </View>
        </View>
        <View style={styles.weekRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={[styles.weekLabel, { color: colors.textTertiary }]}>{day}</Text>)}
        </View>
        <View style={styles.calendarGrid}>
          {calendarDays.map((date) => {
            const id = localDayKey(date);
            const selected = id === note?.id;
            const hasNote = archive.some((item) => item.id === id) || selected;
            const now = new Date();
            const inMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            return (
              <Pressable key={id} onPress={() => onOpenDate(id)} style={[styles.calendarDay, selected && { backgroundColor: colors.accent }]}>
                <Text style={{ fontFamily: Fonts.sansMedium, fontSize: 13, color: selected ? colors.background : inMonth ? colors.text : colors.textTertiary }}>{date.getDate()}</Text>
                {hasNote ? <View style={[styles.noteDot, { backgroundColor: selected ? colors.background : colors.accent }]} /> : <View style={styles.noteDot} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      {archived.length === 0 ? (
        <Text style={[styles.emptyArchive, { color: colors.textTertiary }]}>
          {query.trim() ? 'No notes match.' : 'Past days will collect here.'}
        </Text>
      ) : (
        archived.map((n) => (
          <View key={n.id} style={[styles.archiveRow, { borderColor: colors.border }]}>
            <Pressable onPress={() => onOpenArchived(n.id)} style={{ flex: 1 }}>
              <Text style={[styles.archiveRowTitle, { color: colors.text }]} numberOfLines={1}>
                {n.title}
              </Text>
              <Text style={[styles.archiveRowPreview, { color: colors.textTertiary }]} numberOfLines={1}>
                {n.body.replace(/^#.*$/m, '').replace(/[#*\-[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Empty'}
              </Text>
            </Pressable>
            <Pressable onPress={() => onDeleteArchived(n.id)} hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="trash-outline" size={17} color={colors.textTertiary} />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Scheduled tasks panel
// ---------------------------------------------------------------------------
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

function ScheduledPanel({
  colors,
  isDark,
  onOpenScheduleNew,
  onRunTask,
  onRescheduleRemote,
}: {
  colors: ThemeColors;
  isDark: boolean;
  onOpenScheduleNew: () => void;
  onRunTask: (task: ScheduledTask) => void;
  onRescheduleRemote?: (task: ScheduledTask, scheduledFor: number) => Promise<void>;
}) {
  const { tasks, loaded, load, persistenceError, retryPersistence, rescheduleTask, removeTask } = useScheduledTasksStore();
  const [rescheduling, setRescheduling] = useState<ScheduledTask | null>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const pending = tasks.filter((t) => t.status === 'pending').sort((a, b) => a.scheduledFor - b.scheduledFor);
  const history = tasks.filter((t) => t.status !== 'pending').sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0));

  return (
    <>
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
        <View style={{ marginHorizontal: 2, marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: isDark ? '#35242A' : '#FFF1F0', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={16} color="#D92D20" />
          <Text style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 12, color: colors.text }}>{persistenceError}</Text>
          <Pressable onPress={() => { void retryPersistence(); }} accessibilityRole="button" accessibilityLabel="Retry saving scheduled tasks">
            <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.accent }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
        {pending.length === 0 && history.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="alarm-outline" size={28} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No scheduled tasks yet. Tap &quot;New&quot; to set one up — a reminder-style prompt that runs whenever you
              open the app after its scheduled time.
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
                    colors={colors}
                    onRun={() => onRunTask(task)}
                    onReschedule={() => setRescheduling(task)}
                    canReschedule={!task.jobId || !!onRescheduleRemote}
                    onDelete={() => removeTask(task.id)}
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
                    colors={colors}
                    onRun={() => onRunTask(task)}
                    onReschedule={() => setRescheduling(task)}
                    canReschedule={!task.jobId || !!onRescheduleRemote}
                    onDelete={() => removeTask(task.id)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <ScheduleTaskSheet
        visible={!!rescheduling}
        isDark={isDark}
        colors={colors}
        initialPrompt={rescheduling?.prompt}
        initialTime={rescheduling ? Math.max(rescheduling.scheduledFor, Date.now() + 5 * 60 * 1000) : undefined}
        onClose={() => setRescheduling(null)}
        onSchedule={(_, scheduledFor) => {
          if (rescheduling?.jobId && onRescheduleRemote) {
            onRescheduleRemote(rescheduling, scheduledFor).catch(() => {});
          } else if (rescheduling) {
            rescheduleTask(rescheduling.id, scheduledFor);
          }
          setRescheduling(null);
        }}
      />
    </>
  );
}

function TaskRow({
  task,
  colors,
  onRun,
  onReschedule,
  canReschedule,
  onDelete,
}: {
  task: ScheduledTask;
  colors: ThemeColors;
  onRun: () => void;
  onReschedule: () => void;
  canReschedule: boolean;
  onDelete: () => void;
}) {
  const isDue = task.status === 'pending' && task.scheduledFor <= Date.now();
  const badgeColor =
    task.status === 'completed' ? '#34C759' : task.status === 'failed' ? '#FF3B30' : isDue ? '#FF9500' : colors.textTertiary;
  const badgeLabel =
    task.status === 'completed' ? 'Done' : task.status === 'failed' ? 'Failed' : isDue ? 'Due now' : 'Scheduled';

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
            {task.status === 'pending' ? formatWhen(task.scheduledFor) : task.lastRunAt ? `Ran ${formatWhen(task.lastRunAt)}` : ''}
          </Text>
        </View>
        {task.lastResultPreview ? (
          <Text style={[styles.resultPreview, { color: colors.textSecondary }]} numberOfLines={2}>
            {task.lastResultPreview}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
        <Pressable onPress={onRun} hitSlop={8} style={styles.rowActionBtn}>
          <Ionicons name="play-circle-outline" size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={onReschedule} disabled={!canReschedule} hitSlop={8} style={styles.rowActionBtn}>
          <Ionicons name="time-outline" size={20} color={canReschedule ? colors.text : colors.textTertiary} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8} style={styles.rowActionBtn}>
          <Ionicons name="trash-outline" size={19} color="#FF3B30" />
        </Pressable>
      </View>
    </View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
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
  segBtn: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 999,
  },
  segText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
  },
  calendarCard: {
    borderRadius: 14,
    borderWidth: 0.633,
    padding: 14,
    marginTop: 10,
    marginBottom: 12,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  calendarHint: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    marginTop: 2,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 2,
  },
  weekLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontFamily: Fonts.sansMedium,
    fontSize: 10,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  noteDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
  streak: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  todayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 0.633,
  },
  glance: {
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    overflow: 'hidden',
  },
  writeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  writeBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14.5,
  },
  actionRow: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
    marginTop: 14,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 0.633,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  actionLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12.5,
  },
  archiveHeader: {
    marginTop: 18,
    marginBottom: 6,
    gap: 8,
  },
  archiveTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  emptyArchive: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    paddingVertical: 14,
    textAlign: 'center',
  },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 0.633,
  },
  archiveRowTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13.5,
  },
  archiveRowPreview: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  // Scheduled
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
