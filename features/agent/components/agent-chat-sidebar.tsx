import { useRef, useEffect, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePathname } from 'expo-router';
import { SquarePen, RefreshCw, Square } from 'lucide-react-native';

import { Fonts } from '@/constants/theme';
import { useChatSessions, usePiClient, useIsSessionActive } from '@expertai/client';
import type { SessionListItem } from '@expertai/client';
import { SessionActivityIndicator } from '@/features/workspace/components/session-activity-indicator';
import { AnimatedListItem } from '@/components/ui/animated-list-item';
import { useThemeStore } from '@/lib/theme-store';
import { agentThemeColors } from '@/features/agent/agent-colors';

interface ChatSidebarProps {
  onNewSession: () => void;
  onSelectSession: (sessionId: string, filePath: string, cwd: string) => void;
  title?: string;
  routePrefix?: 'chat' | 'agent-chat';
}

export function AgentChatSidebar({ onNewSession, onSelectSession, title = 'Chat', routePrefix = 'chat' }: ChatSidebarProps) {
  useThemeStore((s) => s.settings);
  const themeState = useThemeStore.getState();
  const agentColors = agentThemeColors(themeState.getColors(), themeState.settings.preset);
  const isDark = useThemeStore.getState().settings.preset !== 'light';

  const pathname = usePathname();
  const chatMatch = pathname.match(new RegExp(`^/${routePrefix}/([^/]+)`));
  const selectedSessionId = chatMatch?.[1] ?? null;

  const {
    sessions,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useChatSessions();

  const bg = agentColors.background;
  const borderColor = agentColors.border;
  const textPrimary = agentColors.text;
  const textMuted = agentColors.textSecondary;
  const btnBg = agentColors.surfaceRaised;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
          borderLeftColor: borderColor,
          borderTopColor: borderColor,
          height: '100%',
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
          <Pressable
            onPress={() => refetch()}
            disabled={isRefetching}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            {isRefetching ? (
              <ActivityIndicator size={13} color={textMuted} />
            ) : (
              <RefreshCw size={13} color={textMuted} strokeWidth={1.8} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onNewSession}
          style={({ pressed }) => [
            styles.newSessionButton,
            { backgroundColor: btnBg },
            pressed && { opacity: 0.8 },
          ]}
        >
          <SquarePen size={14} color={textPrimary} strokeWidth={1.8} />
          <Text style={[styles.newSessionText, { color: textPrimary }]}>
            New chat
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.sessionList}
        contentContainerStyle={styles.sessionListContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : sessions.length === 0 ? (
          <Text style={[styles.emptyText, { color: textMuted }]}>
            No chats yet
          </Text>
        ) : (
          <SessionList
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelect={onSelectSession}
            textPrimary={textPrimary}
            textMuted={textMuted}
            isDark={isDark}
          />
        )}
        {hasNextPage && (
          <Pressable
            onPress={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={({ pressed }) => [
              styles.loadMoreButton,
              { backgroundColor: btnBg },
              pressed && { opacity: 0.8 },
            ]}
          >
            {isFetchingNextPage ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text style={[styles.loadMoreText, { color: textMuted }]}>
                Load more
              </Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function SessionList({
  sessions,
  selectedSessionId,
  onSelect,
  textPrimary,
  textMuted,
  isDark,
}: {
  sessions: SessionListItem[];
  selectedSessionId: string | null;
  onSelect: (id: string, filePath: string, cwd: string) => void;
  textPrimary: string;
  textMuted: string;
  isDark: boolean;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {sessions.map((session) => (
        <AnimatedListItem key={session.id}>
          <SessionItem
            session={session}
            isSelected={session.id === selectedSessionId}
            onSelect={onSelect}
            textPrimary={textPrimary}
            textMuted={textMuted}
            isDark={isDark}
          />
        </AnimatedListItem>
      ))}
    </Animated.View>
  );
}

function SessionItem({
  session,
  isSelected,
  onSelect,
  textPrimary,
  textMuted,
  isDark,
}: {
  session: SessionListItem;
  isSelected: boolean;
  onSelect: (id: string, filePath: string, cwd: string) => void;
  textPrimary: string;
  textMuted: string;
  isDark: boolean;
}) {
  const client = usePiClient();
  const isActive = useIsSessionActive(session.id);
  const [hovered, setHovered] = useState(false);
  const [killing, setKilling] = useState(false);
  const title = session.display_name ?? session.id;
  const selectedBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const handleKill = useCallback(async () => {
    setKilling(true);
    try {
      await client.killSession(session.id);
    } finally {
      setKilling(false);
    }
  }, [client, session.id]);

  return (
    <Pressable
      onPress={() => onSelect(session.id, session.file_path, session.cwd)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.sessionItem,
        isSelected && { backgroundColor: selectedBg },
        pressed && { opacity: 0.7 },
      ]}
    >
      <SessionActivityIndicator sessionId={session.id} color={textMuted} />
      <Text
        style={[styles.sessionTitle, { color: textPrimary }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {hovered && isActive && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            handleKill();
          }}
          disabled={killing}
          style={({ pressed }) => [
            styles.killButton,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
            pressed && { opacity: 0.6 },
          ]}
        >
          {killing ? (
            <ActivityIndicator size={10} color={textMuted} />
          ) : (
            <Square size={12} color={isDark ? '#ef4444' : '#dc2626'} strokeWidth={2} fill={isDark ? '#ef4444' : '#dc2626'} />
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  header: {
    paddingLeft: 24,
    paddingRight: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.sansMedium,
    lineHeight: 21,
  },
  actions: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  iconButton: {
    padding: 6,
  },
  newSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 32,
    borderRadius: 6,
  },
  newSessionText: {
    fontSize: 14,
    fontFamily: Fonts.sansMedium,
  },
  sessionList: {
    flex: 1,
  },
  sessionListContent: {
    paddingHorizontal: 12,
    paddingTop: 24,
    gap: 4,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sessionTitle: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    flex: 1,
    lineHeight: 25.2,
  },
  killButton: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    textAlign: 'center',
    marginTop: 24,
  },
  loadMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    borderRadius: 6,
    marginTop: 8,
  },
  loadMoreText: {
    fontSize: 13,
    fontFamily: Fonts.sansMedium,
  },
});
