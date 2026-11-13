import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAgentKeyboardPadding } from '@/hooks/use-agent-keyboard-padding';

import { Fonts } from '@/constants/theme';
import { PromptInput } from '@/features/workspace/components/prompt-input';
import { useChatSessions, useConnection, usePiClient } from '@expertai/client';
import { useChatStore } from '@/features/chat/store';
import { useWorkspaceStore } from '@/features/workspace/store';
import { useThemeStore } from '@/lib/theme-store';
import { FolderOpen, MessageSquare } from 'lucide-react-native';
import { agentErrorMessage } from '@/features/agent/connection-error';
import { agentThemeColors } from '@/features/agent/agent-colors';

type PreparedChatSession = {
  sessionId: string;
  sessionFile: string;
  workspaceId: string | null | undefined;
};

export default function AgentChatScreen() {
  useThemeStore((s) => s.settings);
  const themeState = useThemeStore.getState();
  const colors = agentThemeColors(themeState.getColors(), themeState.settings.preset);
  const keyboardPadding = useAgentKeyboardPadding();
  const router = useRouter();
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  const client = usePiClient();
  const connection = useConnection();
  const runtimeReady = connection.status === 'connected';

  const noTools = useChatStore((s) => s.noTools);
  const systemPrompt = useChatStore((s) => s.systemPrompt);
  const selectSession = useChatStore((s) => s.selectSession);
  const registerSessionWorkspace = useWorkspaceStore((s) => s.registerSessionWorkspace);
  const { invalidate: invalidateChatSessions } = useChatSessions();

  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [preSessionId, setPreSessionId] = useState<string | null>(null);
  const [preSessionFile, setPreSessionFile] = useState<string | null>(null);
  const [preSessionWorkspaceId, setPreSessionWorkspaceId] = useState<string | null>(null);
  const pendingRef = useRef<Promise<PreparedChatSession> | null>(null);
  const preparedSessionRef = useRef<PreparedChatSession | null>(null);
  const connectionLabel = runtimeReady && preSessionId
    ? 'Computer ready'
    : runtimeReady && alertMessage
      ? 'Tap send to retry agent setup'
      : runtimeReady
        ? 'Preparing agent…'
        : connection.status === 'reconnecting'
          ? 'Reconnecting to your computer…'
          : connection.status === 'disconnected'
            ? 'Computer offline'
            : 'Connecting to your computer…';
  useEffect(() => {
    setPreSessionId(null);
    setPreSessionFile(null);
    setPreSessionWorkspaceId(null);
    setAlertMessage(null);
    setSending(false);
    pendingRef.current = null;
    preparedSessionRef.current = null;
  }, [draft]);

  const ensureSession = useCallback(async (): Promise<PreparedChatSession | null> => {
    if (preparedSessionRef.current) return preparedSessionRef.current;
    if (preSessionId && preSessionFile) {
      return { sessionId: preSessionId, sessionFile: preSessionFile, workspaceId: preSessionWorkspaceId };
    }
    if (!runtimeReady) return null;
    if (pendingRef.current) return pendingRef.current;

    const promise = client.createChatSession({
      noTools,
      systemPrompt: systemPrompt ?? undefined,
    }).then((info) => {
      const prepared: PreparedChatSession = {
        sessionId: info.session_id,
        sessionFile: info.session_file,
        workspaceId: info.workspace_id,
      };
      preparedSessionRef.current = prepared;
      registerSessionWorkspace(info.session_id, info.workspace_id ?? '__chat__');
      setPreSessionId(info.session_id);
      setPreSessionFile(info.session_file);
      setPreSessionWorkspaceId(info.workspace_id);
      return prepared;
    });
    pendingRef.current = promise;

    try {
      return await promise;
    } catch (e) {
      setAlertMessage(agentErrorMessage(e, 'Failed to create chat session'));
      throw e;
    } finally {
      pendingRef.current = null;
    }
  }, [preSessionId, preSessionFile, preSessionWorkspaceId, runtimeReady, noTools, systemPrompt, client, registerSessionWorkspace]);

  // Prepare the paired agent as soon as Agent Chat opens. Session creation is
  // idempotent through ensureSession; once the ID arrives PromptInput starts
  // loading model/config state and slash commands while the user composes.
  // This keeps session startup and model discovery off the first-send path.
  useEffect(() => {
    if (runtimeReady) void ensureSession().catch(() => undefined);
  }, [ensureSession, runtimeReady]);

  const handleSend = useCallback(
    async (text: string) => {
      if (sending) return;
      setAlertMessage(null);
      setSending(true);

      try {
        const prepared = await ensureSession();
        if (!prepared) { setSending(false); throw new Error('Failed to create chat session'); }
        const sid = prepared.sessionId;

        await client.prompt(sid, text);
        selectSession(sid);
        invalidateChatSessions();
        router.replace({
          pathname: '/agent-chat/[sessionId]',
          params: {
            sessionId: sid,
            sessionFile: prepared.sessionFile,
            workspaceId: prepared.workspaceId && prepared.workspaceId !== '__chat__' ? prepared.workspaceId : undefined,
          },
        });
      } catch (e) {
        const message = agentErrorMessage(e, 'Failed to send prompt');
        setAlertMessage(message);
        setSending(false);
        throw e;
      }
    },
    [sending, ensureSession, client, selectSession, invalidateChatSessions, router],
  );

  const clearAlert = useCallback(() => setAlertMessage(null), []);

  const editorBg = colors.background;
  // Edge-to-edge keyboard handling: under app.json `edgeToEdgeEnabled: true`, Android
  // does NOT resize the window for the IME, so we lift the composer by the keyboard's
  // real height ourselves. See simple-chat.tsx for the full explanation.

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background, paddingBottom: keyboardPadding }]}>
      <View style={[styles.editorColumn, { backgroundColor: editorBg }]}>
        {sending ? (
          <View style={styles.sendingContainer}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.sendingText, { color: colors.textSecondary }]}>Connecting to your computer…</Text>
          </View>
        ) : (
          <View style={styles.hero}>
            <Image source={require('@/assets/images/expert-ai-owl-transparent.png')} style={styles.heroMark} resizeMode="contain" accessibilityLabel="Expert AI owl" />
            <Text style={[styles.eyebrow, { color: colors.accent }]}>EXPERT AI AGENT</Text>
            <Text style={[styles.heroTitle, { color: colors.text }]}>What should your computer do?</Text>
            <Text style={[styles.heroBody, { color: colors.textSecondary }]}>Work with files, research, and code on your paired computer. Tell the agent what you need; you can follow along here.</Text>
            <View style={styles.heroCapabilities}>
              <View style={[styles.capability, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><FolderOpen size={13} color={colors.accent} /><Text style={[styles.capabilityText, { color: colors.textSecondary }]}>Work with files</Text></View>
              <View style={[styles.capability, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><MessageSquare size={13} color={colors.accent} /><Text style={[styles.capabilityText, { color: colors.textSecondary }]}>Keep the conversation</Text></View>
            </View>
            <Text accessibilityLiveRegion="polite" style={[styles.connectionStatus, { color: runtimeReady ? colors.successColor : colors.textSecondary }]}>{connectionLabel}</Text>
          </View>
        )}
        <PromptInput
          sessionId={preSessionId}
          onSend={handleSend}
          disabled={sending}
          readyToSend={runtimeReady && (!!preSessionId || !!alertMessage)}
          sessionReady={!!preSessionId}
          errorMessage={alertMessage}
          onClearError={clearAlert}
          onFirstFocus={() => {
            // Warm the backend session while the user types their first message,
            // so the send isn't blocked on a cold ~2.5s spawn. ensureSession is
            // idempotent, so firing this on every focus is safe.
            ensureSession().catch((e) => console.warn('[Agent Chat] Prewarm session error:', e));
          }}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  editorColumn: { flex: 1 },
  sendingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sendingText: { fontSize: 14, fontFamily: Fonts.sansMedium },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  heroMark: { width: 112, height: 112, marginBottom: 10 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.sansSemiBold, letterSpacing: 2 },
  heroTitle: { fontSize: 30, fontFamily: Fonts.sansSemiBold, textAlign: 'center', letterSpacing: -0.7 },
  heroBody: { maxWidth: 410, fontSize: 15, lineHeight: 23, fontFamily: Fonts.sans, textAlign: 'center' },
  heroCapabilities: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
  capability: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderRadius: 999 },
  capabilityText: { fontSize: 12, fontFamily: Fonts.sansMedium },
  connectionStatus: { fontSize: 12, fontFamily: Fonts.sansMedium, marginTop: 4 },
});
