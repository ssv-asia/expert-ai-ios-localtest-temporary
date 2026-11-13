import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
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
import type { DailyNote } from '@/lib/daily-notes';

interface ThemeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  onTint: string;
  sheetBackground: string;
  sheetHandle: string;
  border: string;
  surface?: string;
}

interface DailyNotesSheetProps {
  visible: boolean;
  isDark: boolean;
  colors: ThemeColors;
  onClose: () => void;
  /** The note currently in the editor — today's, or an archived one being viewed. */
  note: DailyNote | null;
  isViewingToday: boolean;
  streak: number;
  /** All stored notes (newest first); the one open in the editor is filtered out. */
  archive: DailyNote[];
  /** Debounced-persisted by the parent. */
  onChangeBody: (id: string, body: string) => void;
  onOpenArchived: (id: string) => void;
  onBackToToday: () => void;
  onDeleteArchived: (id: string) => void;
  onAiInsights: () => void;
  onExtractTasks: () => void;
  onWeeklyDigest: () => void;
  onEndOfDayReview: () => void;
  onShareNote: () => void;
  onSwitchToTasks: () => void;
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function DailyNotesSheet({
  visible,
  isDark,
  colors,
  onClose,
  note,
  isViewingToday,
  streak,
  archive,
  onChangeBody,
  onOpenArchived,
  onBackToToday,
  onDeleteArchived,
  onAiInsights,
  onExtractTasks,
  onWeeklyDigest,
  onEndOfDayReview,
  onShareNote,
  onSwitchToTasks,
}: DailyNotesSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const editorMaxHeight = Math.max(160, Math.min(320, windowHeight * 0.34));

  const [text, setText] = useState(note?.body ?? '');
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNoteId = useRef<string | null>(null);

  // Reset the editor whenever the underlying note changes (open, or switch to an
  // archived day). Flush any pending save for the previous note first.
  useEffect(() => {
    if (note && note.id !== lastNoteId.current) {
      if (debounceRef.current && lastNoteId.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      lastNoteId.current = note.id;
      setText(note.body);
    }
  }, [note]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleChange = (next: string) => {
    setText(next);
    if (!note) return;
    const id = note.id;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeBody(id, next);
      debounceRef.current = null;
    }, 600);
  };

  const flush = () => {
    if (debounceRef.current && note) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      onChangeBody(note.id, text);
    }
  };

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

  const inputBg = colors.surface;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        flush();
        onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => {
            flush();
            onClose();
          }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%' }}>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.sheetBackground,
                  paddingBottom: Math.max(insets.bottom, 14) + 10,
                },
              ]}
            >
              <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />

              {/* Segmented "tabs" — Daily notes / Scheduled */}
              <View style={[styles.segment, { backgroundColor: inputBg }]}>
                <View style={[styles.segmentOn, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.segmentOnText, { color: colors.onTint }]}>
                    Daily notes
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    flush();
                    onSwitchToTasks();
                  }}
                  style={({ pressed }) => [styles.segmentOff, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.segmentOffText, { color: colors.text }]}>Scheduled</Text>
                </Pressable>
              </View>

              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {note?.title ?? 'Daily note'}
                  </Text>
                  <Text style={[styles.streak, { color: colors.textTertiary }]}>
                    {streak > 0
                      ? `🔥 ${streak}-day streak`
                      : 'Write a line today to start a streak'}
                  </Text>
                </View>
                {!isViewingToday ? (
                  <Pressable
                    onPress={() => {
                      flush();
                      onBackToToday();
                    }}
                    style={({ pressed }) => [styles.todayChip, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Ionicons name="arrow-back" size={13} color={colors.text} />
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: colors.text }}>
                      Today
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Actions kept ABOVE the editor so they stay reachable when the
                  keyboard is open (edge-to-edge: the modal window is not resized). */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.actionRow}
              >
                <ActionButton icon="sparkles-outline" label="AI insights" color={colors.text} onPress={() => { flush(); onAiInsights(); }} />
                <ActionButton icon="checkbox-outline" label="Extract tasks" color={colors.text} onPress={() => { flush(); onExtractTasks(); }} />
                <ActionButton icon="moon-outline" label="End of day" color={colors.text} onPress={() => { flush(); onEndOfDayReview(); }} />
                <ActionButton icon="calendar-outline" label="Weekly digest" color={colors.text} onPress={() => { flush(); onWeeklyDigest(); }} />
                <ActionButton icon="share-outline" label="Share" color={colors.text} onPress={() => { flush(); onShareNote(); }} />
              </ScrollView>

              <TextInput
                value={text}
                onChangeText={handleChange}
                onBlur={flush}
                multiline
                placeholder="Jot down your day…"
                placeholderTextColor={colors.textTertiary}
                style={[
                  styles.editor,
                  { color: colors.text, backgroundColor: inputBg, maxHeight: editorMaxHeight },
                ]}
                textAlignVertical="top"
                scrollEnabled
                blurOnSubmit={false}
                keyboardAppearance={isDark ? 'dark' : 'default'}
              />

              <View style={styles.archiveHeader}>
                <Text style={[styles.archiveTitle, { color: colors.textSecondary }]}>
                  Previous notes
                </Text>
                {archive.filter((n) => n.id !== note?.id).length > 0 ? (
                  <View style={[styles.search, { backgroundColor: inputBg }]}>
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

              <ScrollView style={{ maxHeight: 190 }} keyboardShouldPersistTaps="handled">
                {archived.length === 0 ? (
                  <Text style={[styles.emptyArchive, { color: colors.textTertiary }]}>
                    {query.trim() ? 'No notes match.' : 'Past days will collect here.'}
                  </Text>
                ) : (
                  archived.map((n) => (
                    <View key={n.id} style={[styles.archiveRow, { borderColor: colors.border }]}>
                      <Pressable
                        onPress={() => {
                          flush();
                          onOpenArchived(n.id);
                        }}
                        style={{ flex: 1 }}
                      >
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
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
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
  actionRow: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
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
  editor: {
    minHeight: 120,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 21,
  },
  archiveHeader: {
    marginTop: 16,
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
});
