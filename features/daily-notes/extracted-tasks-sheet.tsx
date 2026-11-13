import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Fonts } from '@/constants/theme';

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

interface ExtractedTasksSheetProps {
  visible: boolean;
  isDark: boolean;
  colors: ThemeColors;
  /** Candidate task strings pulled from the note (checkbox lines + AI suggestions). */
  candidates: string[];
  onClose: () => void;
  /** Fires once with every selected task and the chosen fire time (epoch ms). */
  onSchedule: (tasks: string[], whenMs: number) => void;
}

const WHEN_PRESETS: { label: string; getMs: () => number }[] = [
  { label: 'In 1 hour', getMs: () => Date.now() + 60 * 60 * 1000 },
  {
    label: 'Today, 6 PM',
    getMs: () => {
      const d = new Date();
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      return d.getTime();
    },
  },
  {
    label: 'Tomorrow, 9 AM',
    getMs: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    },
  },
  {
    label: 'Tonight, 8 PM',
    getMs: () => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      return d.getTime();
    },
  },
];

export function ExtractedTasksSheet({
  visible,
  isDark,
  colors,
  candidates,
  onClose,
  onSchedule,
}: ExtractedTasksSheetProps) {
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [presetIdx, setPresetIdx] = useState(1);

  useEffect(() => {
    if (visible) {
      // Default: everything checked.
      const next: Record<number, boolean> = {};
      candidates.forEach((_, i) => {
        next[i] = true;
      });
      setSelected(next);
      setPresetIdx(1);
    }
  }, [visible, candidates]);

  const chosen = useMemo(
    () => candidates.filter((_, i) => selected[i]),
    [candidates, selected],
  );

  const inputBg = colors.surface;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%' }}>
          <View style={[styles.sheet, { backgroundColor: colors.sheetBackground }]}>
            <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />
            <Text style={[styles.title, { color: colors.text }]}>Schedule from note</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {candidates.length === 0
                ? 'No actionable items found in this note.'
                : 'Pick the items to turn into reminder tasks, and when they should run.'}
            </Text>

            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {candidates.map((c, i) => (
                <Pressable
                  key={`${i}-${c}`}
                  onPress={() => setSelected((s) => ({ ...s, [i]: !s[i] }))}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Ionicons
                    name={selected[i] ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selected[i] ? colors.accent : colors.textTertiary}
                  />
                  <Text style={[styles.rowText, { color: colors.text }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {candidates.length > 0 && (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>When?</Text>
                <View style={styles.presetGrid}>
                  {WHEN_PRESETS.map((p, i) => {
                    const active = presetIdx === i;
                    return (
                      <Pressable
                        key={p.label}
                        onPress={() => setPresetIdx(i)}
                        style={({ pressed }) => [
                          styles.presetChip,
                          {
                            borderColor: colors.border,
                            backgroundColor: active
                              ? colors.accent
                              : inputBg,
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            { color: active ? colors.onTint : colors.text },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Pressable
              onPress={() => {
                if (chosen.length === 0) return;
                onSchedule(chosen, WHEN_PRESETS[presetIdx].getMs());
              }}
              disabled={chosen.length === 0}
              style={({ pressed }) => [
                styles.confirmBtn,
                {
                  backgroundColor: colors.accent,
                  opacity: chosen.length === 0 ? 0.4 : pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={{
                  fontFamily: Fonts.sansSemiBold,
                  fontSize: 15,
                  color: colors.onTint,
                }}
              >
                {chosen.length === 0
                  ? 'Select at least one'
                  : `Schedule ${chosen.length} task${chosen.length === 1 ? '' : 's'}`}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 17,
  },
  sub: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 0.633,
  },
  rowText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 19,
  },
  label: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 8,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 0.633,
  },
  presetChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  confirmBtn: {
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
