import { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Circle, X } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTasksStore } from '../store';

const SHEET_HEIGHT = 400;
const TIMING_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };

interface TaskOutputSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function TaskOutputSheet({ visible, onClose }: TaskOutputSheetProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDark = colorScheme === 'dark';
  const textPrimary = isDark ? '#fefdfd' : '#1a1a1a';
  const textMuted = isDark ? '#cdc8c5' : colors.textTertiary;
  const borderColor = isDark ? '#3b3a39' : 'rgba(0,0,0,0.12)';
  const logBg = isDark ? '#1a1a1a' : '#F5F5F5';

  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const instances = useTasksStore((s) => s.instances);
  const logsById = useTasksStore((s) => s.logsById);
  const fetchLogs = useTasksStore((s) => s.fetchLogs);

  const selectedInstance = instances.find((i) => i.id === selectedTaskId);
  const selectedLogs = selectedTaskId ? logsById[selectedTaskId] ?? [] : [];

  const logScrollRef = useRef<ScrollView>(null);

  const translateY = useSharedValue(SHEET_HEIGHT);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, TIMING_CONFIG);
      overlayOpacity.value = withTiming(1, TIMING_CONFIG);
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, TIMING_CONFIG);
      overlayOpacity.value = withTiming(0, TIMING_CONFIG);
    }
  }, [visible, translateY, overlayOpacity]);

  useEffect(() => {
    if (selectedTaskId) {
      fetchLogs(selectedTaskId);
    }
  }, [selectedTaskId, fetchLogs]);

  useEffect(() => {
    if (selectedTaskId && logScrollRef.current) {
      setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [selectedTaskId, logsById]);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, TIMING_CONFIG);
    overlayOpacity.value = withTiming(0, TIMING_CONFIG, () => {
      runOnJS(onClose)();
    });
  }, [translateY, overlayOpacity, onClose]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withTiming(0, TIMING_CONFIG);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    pointerEvents:
      overlayOpacity.value > 0 ? ('auto' as const) : ('none' as const),
  }));

  const statusColor =
    selectedInstance?.status === 'running'
      ? '#34C759'
      : selectedInstance?.status === 'failed'
        ? '#FF3B30'
        : '#8E8E93';

  return (
    <View
      {...(Platform.OS !== 'web'
        ? { pointerEvents: visible ? ('auto' as const) : ('none' as const) }
        : {})}
      style={[
        styles.root,
        Platform.OS === 'web' && ({ pointerEvents: visible ? 'auto' : 'none' } as any),
      ]}
    >
      <Animated.View
        style={[styles.overlay, { backgroundColor: colors.overlay }, overlayStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: isDark ? '#1e1e1e' : '#FFFFFF',
            paddingBottom: insets.bottom,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleBar}>
            <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />
          </View>
        </GestureDetector>

        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <View style={styles.headerLeft}>
            {selectedInstance ? (
              <>
                <Circle size={8} color={statusColor} fill={statusColor} strokeWidth={0} />
                <Text style={[styles.headerLabel, { color: textPrimary }]} numberOfLines={1}>
                  {selectedInstance.label}
                </Text>
                <Text style={[styles.headerCmd, { color: textMuted }]} numberOfLines={1}>
                  {selectedInstance.command}
                </Text>
              </>
            ) : (
              <Text style={[styles.headerLabel, { color: textMuted }]}>Task Output</Text>
            )}
          </View>
          <Pressable onPress={dismiss} style={styles.closeBtn}>
            <X size={14} color={textMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          ref={logScrollRef}
          style={[styles.logContent, { backgroundColor: logBg }]}
          bounces={false}
        >
          {selectedLogs.length === 0 ? (
            <Text style={[styles.logLine, { color: textMuted }]}>
              {selectedInstance ? 'No output yet...' : 'Select a running task to view output'}
            </Text>
          ) : (
            selectedLogs.map((line, i) => (
              <Text key={i} style={[styles.logLine, { color: textPrimary }]} selectable>
                {line}
              </Text>
            ))
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: SHEET_HEIGHT,
    height: SHEET_HEIGHT,
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 0.633,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  headerLabel: {
    fontSize: 15,
    fontFamily: Fonts.sansSemiBold,
    fontWeight: '600',
  },
  headerCmd: {
    fontSize: 11,
    fontFamily: Fonts.mono,
    flex: 1,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logContent: {
    flex: 1,
    padding: 12,
  },
  logLine: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    lineHeight: 18,
  },
});
