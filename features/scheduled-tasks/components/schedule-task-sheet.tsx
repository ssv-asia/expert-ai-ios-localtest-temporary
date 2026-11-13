import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';

interface ThemeColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  sheetBackground: string;
  sheetHandle: string;
  border: string;
}

interface ScheduleTaskSheetProps {
  visible: boolean;
  isDark: boolean;
  colors: ThemeColors;
  /** Pre-filled when rescheduling an existing task; omitted for a brand new one. */
  initialPrompt?: string;
  initialTime?: number;
  onClose: () => void;
  onSchedule: (prompt: string, scheduledFor: number) => void;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dayLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const QUICK_PRESETS: { label: string; getTime: () => Date }[] = [
  { label: 'In 1 hour', getTime: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: 'In 3 hours', getTime: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  {
    label: 'Tonight, 7 PM',
    getTime: () => {
      const d = new Date();
      d.setHours(19, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    label: 'Tomorrow, 9 AM',
    getTime: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

export function ScheduleTaskSheet({
  visible,
  isDark,
  colors,
  initialPrompt,
  initialTime,
  onClose,
  onSchedule,
}: ScheduleTaskSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Cap the scrollable body so the header + confirm button always stay visible
  // above the keyboard, even on short screens.
  const scrollMaxHeight = Math.max(220, Math.min(480, windowHeight * 0.5));
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [customOpen, setCustomOpen] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [hour12, setHour12] = useState(9); // 1-12
  const [minute, setMinute] = useState(0); // 0-59, stepped by 5
  const [isPM, setIsPM] = useState(false);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPrompt(initialPrompt ?? '');
    const base = initialTime ? new Date(initialTime) : null;
    if (base) {
      setSelectedTime(base);
      const today = startOfDay(new Date());
      setDayOffset(Math.round((startOfDay(base).getTime() - today.getTime()) / 86400000));
      const h = base.getHours();
      setIsPM(h >= 12);
      setHour12(h % 12 === 0 ? 12 : h % 12);
      setMinute(base.getMinutes());
      setCustomOpen(true);
    } else {
      setSelectedTime(null);
      setCustomOpen(false);
      setDayOffset(0);
      setHour12(9);
      setMinute(0);
      setIsPM(false);
    }
  }, [visible, initialPrompt, initialTime]);

  const customTime = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    let h = hour12 % 12;
    if (isPM) h += 12;
    d.setHours(h, minute, 0, 0);
    return d;
  }, [dayOffset, hour12, minute, isPM]);

  const effectiveTime = customOpen ? customTime : selectedTime;
  const canSchedule = prompt.trim().length > 0 && !!effectiveTime && effectiveTime.getTime() > Date.now();

  const handlePickPreset = (getTime: () => Date) => {
    setSelectedTime(getTime());
    setCustomOpen(false);
  };

  const handleConfirm = () => {
    if (!canSchedule || !effectiveTime) return;
    onSchedule(prompt.trim(), effectiveTime.getTime());
  };

  const stepHour = (delta: number) => {
    setHour12((h) => {
      const next = h + delta;
      if (next > 12) return 1;
      if (next < 1) return 12;
      return next;
    });
    setSelectedTime(null);
  };
  const stepMinute = (delta: number) => {
    setMinute((m) => {
      const next = m + delta;
      if (next >= 60) return 0;
      if (next < 0) return 55;
      return next;
    });
    setSelectedTime(null);
  };

  const inputBg = isDark ? '#1E1E1E' : '#F6F6F6';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%' }}>
            <View
              style={[
                styles.sheet,
                { backgroundColor: colors.sheetBackground, paddingBottom: Math.max(insets.bottom, 16) + 12 },
              ]}
            >
            <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.text }]}>
                {initialPrompt !== undefined ? 'Reschedule task' : 'Schedule a task'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: scrollMaxHeight }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>What should it do?</Text>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="e.g. Summarize today's top AI news"
                placeholderTextColor={colors.textTertiary}
                multiline
                style={[styles.promptInput, { color: colors.text, backgroundColor: inputBg }]}
              />

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 18 }]}>When?</Text>
              <View style={styles.presetGrid}>
                {QUICK_PRESETS.map((preset) => {
                  const active =
                    !customOpen && selectedTime && preset.label && selectedTime.getTime() === preset.getTime().getTime();
                  return (
                    <Pressable
                      key={preset.label}
                      onPress={() => handlePickPreset(preset.getTime)}
                      style={({ pressed }) => [
                        styles.presetChip,
                        { borderColor: colors.border, backgroundColor: active ? (isDark ? '#333' : '#1A1A1A') : inputBg },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          { color: active ? '#fff' : colors.text },
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setCustomOpen((v) => !v)}
                  style={({ pressed }) => [
                    styles.presetChip,
                    { borderColor: colors.border, backgroundColor: customOpen ? (isDark ? '#333' : '#1A1A1A') : inputBg },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.presetChipText, { color: customOpen ? '#fff' : colors.text }]}>
                    Custom…
                  </Text>
                </Pressable>
              </View>

              {customOpen && (
                <View style={styles.customBlock}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {Array.from({ length: 8 }, (_, i) => i).map((offset) => (
                      <Pressable
                        key={offset}
                        onPress={() => setDayOffset(offset)}
                        style={({ pressed }) => [
                          styles.dayChip,
                          { borderColor: colors.border, backgroundColor: dayOffset === offset ? (isDark ? '#333' : '#1A1A1A') : inputBg },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: dayOffset === offset ? '#fff' : colors.text }}>
                          {dayLabel(offset)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <View style={styles.timeRow}>
                    <View style={styles.stepperCol}>
                      <Pressable onPress={() => stepHour(1)} hitSlop={10} style={styles.stepBtn}>
                        <Ionicons name="chevron-up" size={20} color={colors.text} />
                      </Pressable>
                      <Text style={[styles.stepperValue, { color: colors.text }]}>{String(hour12).padStart(2, '0')}</Text>
                      <Pressable onPress={() => stepHour(-1)} hitSlop={10} style={styles.stepBtn}>
                        <Ionicons name="chevron-down" size={20} color={colors.text} />
                      </Pressable>
                    </View>
                    <Text style={[styles.timeColon, { color: colors.text }]}>:</Text>
                    <View style={styles.stepperCol}>
                      <Pressable onPress={() => stepMinute(5)} hitSlop={10} style={styles.stepBtn}>
                        <Ionicons name="chevron-up" size={20} color={colors.text} />
                      </Pressable>
                      <Text style={[styles.stepperValue, { color: colors.text }]}>{String(minute).padStart(2, '0')}</Text>
                      <Pressable onPress={() => stepMinute(-5)} hitSlop={10} style={styles.stepBtn}>
                        <Ionicons name="chevron-down" size={20} color={colors.text} />
                      </Pressable>
                    </View>
                    <View style={styles.ampmCol}>
                      <Pressable
                        onPress={() => { setIsPM(false); setSelectedTime(null); }}
                        style={[styles.ampmBtn, { backgroundColor: !isPM ? (isDark ? '#333' : '#1A1A1A') : 'transparent', borderColor: colors.border }]}
                      >
                        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: !isPM ? '#fff' : colors.textSecondary }}>AM</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { setIsPM(true); setSelectedTime(null); }}
                        style={[styles.ampmBtn, { backgroundColor: isPM ? (isDark ? '#333' : '#1A1A1A') : 'transparent', borderColor: colors.border }]}
                      >
                        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: isPM ? '#fff' : colors.textSecondary }}>PM</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}

              {effectiveTime && (
                <Text style={[styles.previewText, { color: colors.textSecondary }]}>
                  {effectiveTime.getTime() > Date.now()
                    ? `Scheduled for ${effectiveTime.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                    : 'Pick a time in the future'}
                </Text>
              )}
            </ScrollView>

            <Pressable
              onPress={handleConfirm}
              disabled={!canSchedule}
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: isDark ? '#E8E8E8' : '#1A1A1A', opacity: !canSchedule ? 0.4 : pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 15, color: isDark ? '#1A1A1A' : '#FFFFFF' }}>
                {initialPrompt !== undefined ? 'Reschedule' : 'Schedule'}
              </Text>
            </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 17,
  },
  label: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  promptInput: {
    minHeight: 72,
    borderRadius: 12,
    padding: 14,
    fontFamily: Fonts.sans,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 0.633,
  },
  presetChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  customBlock: {
    marginTop: 14,
    gap: 14,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 0.633,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stepperCol: {
    alignItems: 'center',
    gap: 2,
  },
  stepBtn: {
    padding: 8,
  },
  stepperValue: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 28,
    minWidth: 48,
    textAlign: 'center',
  },
  timeColon: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 28,
  },
  ampmCol: {
    marginLeft: 8,
    gap: 6,
  },
  ampmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 0.633,
    alignItems: 'center',
  },
  previewText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },
  confirmBtn: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
