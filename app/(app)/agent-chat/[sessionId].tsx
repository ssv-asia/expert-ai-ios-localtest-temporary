import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAgentKeyboardPadding } from '@/hooks/use-agent-keyboard-padding';

import { MessageList } from '@/features/agent/components/message-list';
import { ChatShimmer } from '@/features/agent/components/message-list/chat-shimmer';
import { PromptInput } from '@/features/workspace/components/prompt-input';
import { ExtensionUiDialog } from '@/features/agent/components/extension-ui-dialog';
import { DiffPanelProvider } from '@/features/agent/components/diff-panel/context';
import { MobileDiffSheetProvider } from '@/features/agent/components/message-list/mobile-diff-sheet';
import { useAgentSession, useChatSessions, useConnection, usePiClient } from '@expertai/client';
import type { ImageContent } from '@expertai/client';
import { useChatStore } from '@/features/chat/store';
import { useWorkspaceStore } from '@/features/workspace/store';
import { useThemeStore } from '@/lib/theme-store';
import type { PendingExtensionUiRequest as LegacyPendingUiRequest } from '@/features/agent/extension-ui';
import type { Attachment } from '@/features/workspace/components/prompt-input/constants';
import { agentErrorMessage } from '@/features/agent/connection-error';

export default function ChatSessionScreen() {
  const { sessionId, workspaceId, sessionFile } = useLocalSearchParams<{
    sessionId: string;
    workspaceId?: string;
    sessionFile?: string;
  }>();
  useThemeStore((s) => s.settings);
  const colors = useThemeStore.getState().getColors();
  const isDark = useThemeStore.getState().settings.preset !== 'light';
  const keyboardPadding = useAgentKeyboardPadding();

  const selectSession = useChatStore((s) => s.selectSession);
  const registerSessionWorkspace = useWorkspaceStore((s) => s.registerSessionWorkspace);
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace);
  const rememberedWorkspaceId = useWorkspaceStore((s) =>
    sessionId ? s.getWorkspaceForSession(sessionId) : null,
  );
  const resolvedWorkspaceId = workspaceId ?? rememberedWorkspaceId ?? '__chat__';
  const { invalidate: invalidateChatSessions } = useChatSessions();
  const [alertMessage, setAlertMessage] = React.useState<string | null>(null);

  const session = useAgentSession(sessionId ?? null, {
    workspaceId: resolvedWorkspaceId === '__chat__' ? undefined : resolvedWorkspaceId,
    sessionFile: sessionFile || sessionId || '',
  });

  const client = usePiClient();
  const connection = useConnection();
  const inputBlocked = connection.status === 'reconnecting' || connection.status === 'disconnected';

  // "Loading forever" guard: if the session hasn't become ready and has no
  // messages after a while, stop showing an endless shimmer and offer a retry.
  // (The backend spawn is ~2.5s normally; 18s means something is actually wrong.)
  const stillLoading = !session.isReady && !session.messages.length && !!sessionId;
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (!stillLoading) {
      setSlowLoad(false);
      return;
    }
    const t = setTimeout(() => setSlowLoad(true), 18000);
    return () => clearTimeout(t);
  }, [stillLoading, sessionId]);

  const retryOpen = useCallback(() => {
    if (!sessionId) return;
    setSlowLoad(false);
    client.openSession(sessionId, {
      workspaceId: resolvedWorkspaceId === '__chat__' ? undefined : resolvedWorkspaceId,
      sessionFile: sessionFile || sessionId,
    });
  }, [client, sessionId, resolvedWorkspaceId, sessionFile]);

  useEffect(() => {
    if (!sessionId) return;
    selectSession(sessionId);
    registerSessionWorkspace(sessionId, resolvedWorkspaceId);
    if (resolvedWorkspaceId !== '__chat__') selectWorkspace(resolvedWorkspaceId);
  }, [sessionId, workspaceId, resolvedWorkspaceId, selectSession, registerSessionWorkspace, selectWorkspace]);

  const handleSend = useCallback(
    async (text: string, attachments: Attachment[], options?: { queueBehavior?: 'steer' | 'followUp' }) => {
      if (!sessionId || inputBlocked) return;
      setAlertMessage(null);

      let images: ImageContent[] | undefined;
      const imageAttachments = attachments.filter((a) => a.type === "image" && a.preview);
      if (imageAttachments.length > 0) {
        images = imageAttachments.map((a) => {
          const dataUrl = a.preview!;
          const commaIdx = dataUrl.indexOf(",");
          const meta = dataUrl.slice(0, commaIdx);
          const base64 = dataUrl.slice(commaIdx + 1);
          const mimeMatch = meta.match(/data:([^;]+)/);
          const mimeType = mimeMatch?.[1] ?? "image/png";
          return { type: "image" as const, data: base64, mimeType };
        });
      }

      const isFirst = !session.messages.length;
      const behavior = options?.queueBehavior ?? (session.isStreaming ? 'steer' : undefined);
      const sendFn = behavior === 'steer'
        ? session.steer
        : behavior === 'followUp'
          ? session.followUp
          : session.prompt;

      try {
        await sendFn(text, images ? { images } : undefined);
        if (isFirst) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => invalidateChatSessions(), 2000) as any;
        }
      } catch (error) {
        setAlertMessage(agentErrorMessage(error, 'Failed to send prompt'));
        throw error;
      }
    },
    [sessionId, inputBlocked, session, invalidateChatSessions],
  );

  const handleAbort = useCallback(() => {
    if (!sessionId) return;
    setAlertMessage(null);
    session.abort().catch((error) => {
      setAlertMessage(error instanceof Error ? error.message : 'Failed to abort');
    });
  }, [sessionId, session]);

  const clearAlert = useCallback(() => setAlertMessage(null), []);

  const editorBg = colors.background;
  const hasMessages = session.messages.length > 0;

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <DiffPanelProvider messages={session.messages as any[]}>
    <MobileDiffSheetProvider>
    <Animated.View
      style={[styles.container, { backgroundColor: colors.background, paddingBottom: keyboardPadding }]}
    >
      <View style={[styles.editorColumn, { backgroundColor: editorBg }]}>
        {inputBlocked && (
          <View style={[styles.connectionNotice, { backgroundColor: colors.errorBackground, borderColor: colors.border }]}>
            <Text style={[styles.connectionText, { color: colors.errorColor }]}>Connection to your computer was interrupted. Reconnecting…</Text>
            <Pressable onPress={retryOpen} accessibilityRole="button" accessibilityLabel="Retry agent connection"><Text style={[styles.connectionText, { color: colors.accent }]}>Retry</Text></Pressable>
          </View>
        )}
        {hasMessages && sessionId ? (
          <MessageList key={sessionId} sessionId={sessionId} />
        ) : slowLoad ? (
          <View style={styles.emptyCenter}>
            <Text style={[styles.slowTitle, { color: isDark ? '#fefdfd' : colors.text }]}>
              Still connecting…
            </Text>
            <Text style={[styles.slowBody, { color: isDark ? '#cdc8c5' : colors.textSecondary }]}>
              This is taking longer than usual. Make sure Expert AI Agent is running on your
              computer and you&apos;re on the same Wi‑Fi.
            </Text>
            <Pressable
              onPress={retryOpen}
              style={({ pressed }) => [
                styles.retryBtn,
                { backgroundColor: isDark ? '#fefdfd' : '#1a1a1a' },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={[styles.retryBtnText, { color: isDark ? '#1a1a1a' : '#fff' }]}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : stillLoading ? (
          Platform.OS === 'ios' ? (
            <View style={styles.emptyCenter}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <ChatShimmer />
          )
        ) : (
          <View style={styles.emptyCenter}>
            <Text style={[styles.slowBody, { color: isDark ? '#8a8a8a' : colors.textTertiary }]}>
              Type a message below to start.
            </Text>
          </View>
        )}
        <ExtensionUiDialog sessionId={sessionId} request={session.pendingExtensionUiRequest as LegacyPendingUiRequest | null} />
        <PromptInput
          sessionId={sessionId}
          onSend={handleSend}
          isStreaming={session.isStreaming}
          onAbort={handleAbort}
          sessionReady={session.isReady}
          disabled={inputBlocked || !session.isReady || !!session.pendingExtensionUiRequest}
          allowTypingWhileDisabled={!inputBlocked}
          stackedAbove={!!session.pendingExtensionUiRequest}
          errorMessage={alertMessage}
          onClearError={clearAlert}
        />
      </View>
    </Animated.View>
    </MobileDiffSheetProvider>
    </DiffPanelProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  editorColumn: { flex: 1 },
  connectionNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  connectionText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  emptyCenter: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, paddingHorizontal: 32, gap: 10 },
  slowTitle: { fontSize: 17, fontWeight: "600" as const, textAlign: "center" as const },
  slowBody: { fontSize: 14, lineHeight: 20, textAlign: "center" as const },
  retryBtn: { marginTop: 8, minWidth: 160, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12, alignItems: "center" as const },
  retryBtnText: { fontSize: 15, fontWeight: "600" as const },
});
