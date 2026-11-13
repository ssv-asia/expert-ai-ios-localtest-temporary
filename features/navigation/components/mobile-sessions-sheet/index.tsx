import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
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

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePiClient } from '@expertai/client';
import { useWorkspaceStore } from '@/features/workspace/store';
import { useWorkspaceSessions as useSessions } from '@expertai/client';
import { requestBrowserNotificationPermission } from '@/features/agent/browser-notifications';
import { SessionSheetContent } from '../session-sheet-content';

const SHEET_HEIGHT = 420;
const TIMING_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };

interface MobileSessionsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function MobileSessionsSheet({ visible, onClose }: MobileSessionsSheetProps) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const translateY = useSharedValue(SHEET_HEIGHT);
  const overlayOpacity = useSharedValue(0);

  const router = useRouter();
  const piClient = usePiClient();
  const [createPending, setCreatePending] = useState(false);
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId);
  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === s.selectedWorkspaceId),
  );

  const {
    sessions,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useSessions(selectedWorkspaceId);

  const selectedSessionId = pathname.match(/\/workspace\/[^/]+\/s\/([^/]+)/)?.[1] ?? null;

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

  const handleNewSession = useCallback(async () => {
    if (!selectedWorkspaceId || createPending) return;
    setCreatePending(true);
    requestBrowserNotificationPermission();
    try {
      const info = await piClient.createAgentSession({ workspaceId: selectedWorkspaceId });
      router.navigate(`/workspace/${selectedWorkspaceId}/s/${info.session_id}`);
      dismiss();
    } catch {
    } finally {
      setCreatePending(false);
    }
  }, [selectedWorkspaceId, createPending, piClient, router, dismiss]);

  const panGesture = Gesture.Pan()
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
      <Animated.View style={[styles.overlay, { backgroundColor: colors.overlay }, overlayStyle]}>
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
          title="Sessions"
          subtitle={workspace?.title.toLowerCase().replace(/\s+/g, '-')}
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          isLoading={isLoading}
          isRefetching={isRefetching}
          hasNextPage={hasNextPage ?? false}
          isFetchingNextPage={isFetchingNextPage}
          createPending={createPending}
          newButtonLabel="New session"
          emptyLabel="No sessions yet"
          isDark={isDark}
          onNew={handleNewSession}
          onSelect={(id) => {
            if (selectedWorkspaceId) {
              router.navigate(`/workspace/${selectedWorkspaceId}/s/${id}`);
            }
            dismiss();
          }}
          onRefresh={() => refetch()}
          onLoadMore={() => fetchNextPage()}
        />
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
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});

