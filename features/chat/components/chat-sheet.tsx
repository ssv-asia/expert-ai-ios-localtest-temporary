import { useCallback, useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { usePathname, useRouter } from 'expo-router';
import { Settings, Server } from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useChatSessions } from '@expertai/client';
import { useChatStore } from '../store';
import { SessionSheetContent } from '@/features/navigation/components/session-sheet-content';

const SHEET_HEIGHT = 520;
const TIMING_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };

interface ChatSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function ChatSheet({ visible, onClose }: ChatSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDark = colorScheme === 'dark';
  const selectedSessionId = pathname.match(/\/chat\/([^/]+)/)?.[1] ?? null;

  const translateY = useSharedValue(SHEET_HEIGHT);
  const overlayOpacity = useSharedValue(0);
  const selectSession = useChatStore((s) => s.selectSession);

  const textPrimary = isDark ? '#fefdfd' : '#1a1a1a';
  const textMuted = isDark ? '#cdc8c5' : '#999999';

  const {
    sessions,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useChatSessions();

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, TIMING_CONFIG);
      overlayOpacity.value = withTiming(1, TIMING_CONFIG);
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, TIMING_CONFIG);
      overlayOpacity.value = withTiming(0, TIMING_CONFIG);
    }
  }, [visible, translateY, overlayOpacity]);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, TIMING_CONFIG);
    overlayOpacity.value = withTiming(0, TIMING_CONFIG, () => {
      runOnJS(onClose)();
    });
  }, [translateY, overlayOpacity, onClose]);

  const handleNewChat = useCallback(() => {
    selectSession(null);
    router.replace('/chat');
    dismiss();
  }, [selectSession, router, dismiss]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectSession(sessionId);
      router.replace({ pathname: '/chat/[sessionId]', params: { sessionId } });
      dismiss();
    },
    [selectSession, router, dismiss],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
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
    pointerEvents: overlayOpacity.value > 0 ? ('auto' as const) : ('none' as const),
  }));

  const footer = (
    <View style={[styles.footer, { borderTopColor: isDark ? '#2A2A2A' : '#EEEEEE' }]}>
      <Pressable
        onPress={() => { router.push('/servers'); dismiss(); }}
        style={({ pressed }) => [styles.footerItem, pressed && { opacity: 0.7 }]}
      >
        <Server size={16} color={textMuted} strokeWidth={1.8} />
        <Text style={[styles.footerText, { color: textPrimary }]}>Servers</Text>
      </Pressable>
      <Pressable
        onPress={() => { router.push('/settings'); dismiss(); }}
        style={({ pressed }) => [styles.footerItem, pressed && { opacity: 0.7 }]}
      >
        <Settings size={16} color={textMuted} strokeWidth={1.8} />
        <Text style={[styles.footerText, { color: textPrimary }]}>Settings</Text>
      </Pressable>
    </View>
  );

  return (
    <View
      {...(Platform.OS !== 'web'
        ? { pointerEvents: visible ? ('auto' as const) : ('none' as const) }
        : {})}
      style={[
        styles.root,
        Platform.OS === 'web' && { pointerEvents: visible ? 'auto' : 'none' },
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
            paddingBottom: insets.bottom + 16,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleBar}>
            <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />
          </View>
        </GestureDetector>

        <SessionSheetContent
          title="Chat Sessions"
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          isLoading={isLoading}
          isRefetching={isRefetching}
          hasNextPage={hasNextPage ?? false}
          isFetchingNextPage={isFetchingNextPage}
          newButtonLabel="New chat"
          emptyLabel="No chats yet"
          isDark={isDark}
          onNew={handleNewChat}
          onSelect={handleSelectSession}
          onRefresh={() => refetch()}
          onLoadMore={() => fetchNextPage()}
          footer={footer}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  overlay: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    height: SHEET_HEIGHT,
  },
  handleBar: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  footer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  footerText: {
    fontSize: 14,
    fontFamily: Fonts.sansMedium,
  },
});

