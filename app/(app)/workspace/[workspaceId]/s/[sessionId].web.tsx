import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Redirect } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import { useResponsiveLayout } from "@/features/navigation/hooks/use-responsive-layout";
import { PromptInput } from "@/features/workspace/components/prompt-input";
import { WorkspaceSidebar } from "@/features/workspace/components/workspace-sidebar";
import { WorkspaceRightPane } from "@/features/preview/components/workspace-right-pane";
import { useWorkspaceStore } from "@/features/workspace/store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MessageList } from "@/features/agent/components/message-list";
import { ChatShimmer } from "@/features/agent/components/message-list/chat-shimmer";
import { ExtensionUiDialog } from "@/features/agent/components/extension-ui-dialog";
import { DiffPanelProvider } from "@/features/agent/components/diff-panel/context";
import { DiffSidebar } from "@/features/agent/components/diff-panel";
import { MobileDiffSheetProvider } from "@/features/agent/components/message-list/mobile-diff-sheet";
import { useAgentSession, useConnection, useWorkspaceSessions as useSessions } from "@expertai/client";
import type { ImageContent } from "@expertai/client";
import { requestBrowserNotificationPermission } from "@/features/agent/browser-notifications";
import type { PendingExtensionUiRequest as LegacyPendingUiRequest } from "@/features/agent/extension-ui";
import type { ChatMessage } from "@/features/agent/types";
import type { Attachment } from "@/features/workspace/components/prompt-input/constants";

function LegacySessionScreen() {
  const { workspaceId, sessionId } = useLocalSearchParams<{
    workspaceId: string;
    sessionId: string;
  }>();
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { isWideScreen } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace);
  const clearWorkspaceNotification = useWorkspaceStore(
    (s) => s.clearWorkspaceNotification,
  );
  const setLastSession = useWorkspaceStore((s) => s.setLastSession);

  useEffect(() => {
    if (!workspaceId) return;
    selectWorkspace(workspaceId);
    clearWorkspaceNotification(workspaceId);
  }, [workspaceId, selectWorkspace, clearWorkspaceNotification]);

  useEffect(() => {
    if (workspaceId && sessionId) {
      setLastSession(workspaceId, sessionId);
    }
  }, [workspaceId, sessionId, setLastSession]);

  const { sessions } = useSessions(workspaceId ?? null);
  const session = (sessions as { id: string; file_path: string }[])?.find(
    (s) => s.id === sessionId,
  );
  const sessionFile = session?.file_path || sessionId || "";

  const agentSession = useAgentSession(sessionId ?? null, {
    workspaceId: workspaceId ?? "",
    sessionFile,
  });

  const messages = agentSession.messages as ChatMessage[];

  const connection = useConnection();
  const inputBlockedByConnection =
    connection.status === "reconnecting" || connection.status === "disconnected";

  const handleSend = useCallback(
    async (
      text: string,
      attachments: Attachment[],
      options?: { queueBehavior?: "steer" | "followUp" },
    ) => {
      if (!sessionId || inputBlockedByConnection) return;
      setAlertMessage(null);
      requestBrowserNotificationPermission();

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

      const behavior = options?.queueBehavior ?? (agentSession.isStreaming ? "steer" : undefined);
      const sendFn = behavior === "steer"
        ? agentSession.steer
        : behavior === "followUp"
          ? agentSession.followUp
          : agentSession.prompt;

      try {
        await sendFn(text, images ? { images } : undefined);
      } catch (error) {
        setAlertMessage(
          error instanceof Error ? error.message : "Failed to send prompt",
        );
        throw error;
      }
    },
    [inputBlockedByConnection, sessionId, agentSession],
  );

  const handleAbort = useCallback(() => {
    if (!sessionId) return;
    setAlertMessage(null);
    agentSession.abort().catch((error) => {
      setAlertMessage(
        error instanceof Error ? error.message : "Failed to abort",
      );
    });
  }, [sessionId, agentSession]);

  const clearAlert = useCallback(() => setAlertMessage(null), []);

  const isDark = colorScheme === "dark";
  const editorBg = isDark ? "#151515" : "#FAFAFA";


  const hasMessages = messages.length > 0;

  return (
    <DiffPanelProvider messages={messages}>
      <MobileDiffSheetProvider>
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? "#121212" : colors.background,
            paddingBottom: isWideScreen ? 0 : insets.bottom,
          },
        ]}
      >
        <View style={styles.upperRow}>
          <View style={[styles.editorColumn, { backgroundColor: editorBg }]}>
            {hasMessages && sessionId ? (
              <MessageList key={sessionId} sessionId={sessionId} />
            ) : agentSession.isLoading || (!agentSession.isReady && sessionId) ? (
              Platform.OS === "ios" ? (
                <View style={styles.emptyCenter}>
                  <ActivityIndicator size="small" />
                </View>
              ) : (
                <ChatShimmer />
              )
            ) : (
              <View style={styles.emptyCenter} />
            )}
            <ExtensionUiDialog
              sessionId={sessionId}
              request={agentSession.pendingExtensionUiRequest as LegacyPendingUiRequest | null}
            />
            <PromptInput
              sessionId={sessionId}
              onSend={handleSend}
              isStreaming={agentSession.isStreaming}
              onAbort={handleAbort}
              sessionReady={agentSession.isReady}
              disabled={
                inputBlockedByConnection ||
                !agentSession.isReady ||
                !!agentSession.pendingExtensionUiRequest
              }
              allowTypingWhileDisabled={!inputBlockedByConnection}
              stackedAbove={!!agentSession.pendingExtensionUiRequest}
              errorMessage={alertMessage}
              onClearError={clearAlert}
            />
          </View>

          {isWideScreen && (
            <>
              <DiffSidebar messages={messages} />
              <WorkspaceSidebar>
                <View style={{ flex: 1, backgroundColor: editorBg }}>
                  <WorkspaceRightPane sessionId={sessionId ?? null} />
                </View>
              </WorkspaceSidebar>
            </>
          )}
        </View>
      </Animated.View>
      </MobileDiffSheetProvider>
    </DiffPanelProvider>
  );
}

export default function SessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  if (Platform.OS === 'web') return <LegacySessionScreen />;
  if (!sessionId) return <Redirect href="/agent-chat" />;
  return <Redirect href={{ pathname: '/agent-chat/[sessionId]', params: { sessionId } }} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  upperRow: {
    flex: 1,
    flexDirection: "row",
  },
  editorColumn: {
    flex: 1,
  },
  emptyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
