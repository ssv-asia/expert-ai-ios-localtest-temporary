import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, FolderOpen, History, Monitor, Plus, Settings2, X } from 'lucide-react-native';

import { Fonts } from '@/constants/theme';
import { AgentChatSidebar } from '@/features/agent/components/agent-chat-sidebar';
import { useAuthStore } from '@/features/auth/store';
import { useServersStore } from '@/features/servers/store';
import { useThemeStore, type ThemeColors } from '@/lib/theme-store';
import { agentThemeColors } from '@/features/agent/agent-colors';
import { useDraftStore } from '@/features/workspace/components/prompt-input/draft-store';
import { useWorkspaceStore } from '@/features/workspace/store';
import { NewWorkspaceDialog } from '@/features/workspace/components/new-workspace-dialog';
import { useChatSessions, useConnection, usePiClient } from '@expertai/client';
import { useChatStore } from '@/features/chat/store';

function AgentConnectionChip({ colors }: { colors: ThemeColors }) {
  const connection = useConnection();
  const connected = connection.status === 'connected';
  const pending = connection.status === 'idle' || connection.status === 'connecting';
  const label = connected ? 'Ready' : connection.status === 'reconnecting' ? 'Reconnecting' : pending ? 'Connecting' : 'Offline';
  return (
    <Pressable onPress={connected ? undefined : connection.reconnect} accessibilityLabel={`Computer ${label}${connected ? '' : ', tap to retry'}`} style={[styles.statusChip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.statusDot, { backgroundColor: connected ? colors.successColor : pending ? colors.textTertiary : colors.errorColor }]} />
      <Text style={[styles.statusText, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

export default function AgentChatLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 0 : insets.top;
  const { width } = useWindowDimensions();
  const isWide = width >= 800;
  const [showHistory, setShowHistory] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const pathname = usePathname();
  useThemeStore((s) => s.settings);
  const themeState = useThemeStore.getState();
  const agentColors = agentThemeColors(themeState.getColors(), themeState.settings.preset);
  const authLoaded = useAuthStore((s) => s.loaded);
  const activeServerId = useAuthStore((s) => s.activeServerId);
  const accessToken = useAuthStore((s) => activeServerId ? s.tokens[activeServerId]?.accessToken : null);
  const serversLoaded = useServersStore((s) => s.loaded);
  const server = useServersStore((s) => s.servers.find((item) => item.id === activeServerId));
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace);
  const registerSessionWorkspace = useWorkspaceStore((s) => s.registerSessionWorkspace);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);
  const workspaceError = useWorkspaceStore((s) => s.error);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const client = usePiClient();
  const selectSession = useChatStore((s) => s.selectSession);
  const { invalidate: invalidateChatSessions } = useChatSessions();
  const [openingWorkspaceId, setOpeningWorkspaceId] = useState<string | null>(null);
  const [workspaceOpenError, setWorkspaceOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pathname.endsWith('/settings')) { router.back(); return true; }
      if (showNewWorkspace) { setShowNewWorkspace(false); return true; }
      if (showWorkspaces) { setShowWorkspaces(false); return true; }
      if (showHistory) { setShowHistory(false); return true; }
      // Servers is a sibling of the Agent Chat stack. dismissTo only searches
      // the current nested stack and could skip this screen on Android.
      router.replace('/servers');
      return true;
    });
    return () => subscription.remove();
  }, [pathname, router, showHistory, showNewWorkspace, showWorkspaces]);

  useEffect(() => {
    if (showWorkspaces && activeServerId && accessToken) void fetchWorkspaces(activeServerId);
  }, [showWorkspaces, activeServerId, accessToken, fetchWorkspaces]);

  const newChat = useCallback(() => {
    setShowHistory(false);
    useDraftStore.getState().clearDraft('__new__');
    if (pathname === '/agent-chat') {
      router.replace({ pathname: '/agent-chat', params: { draft: String(Date.now()) } });
    } else {
      router.replace('/agent-chat');
    }
  }, [router, pathname]);

  const openSession = useCallback(async (sessionId: string, sessionFile?: string, cwd?: string) => {
    setShowHistory(false);
    const workspaceStore = useWorkspaceStore.getState();
    let workspaceId = workspaceStore.getWorkspaceForSession(sessionId);
    const normalizePath = (value: string) => value.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLocaleLowerCase();
    const findWorkspace = () => cwd
      ? useWorkspaceStore.getState().workspaces.find((workspace) => normalizePath(workspace.path) === normalizePath(cwd))?.id
      : undefined;
    if (!workspaceId && cwd) {
      workspaceId = findWorkspace() ?? null;
      if (!workspaceId && activeServerId && accessToken) {
        // Workspace history is loaded lazily. Resolve the session's cwd before
        // mounting it so prompts carry the correct workspace and file context.
        await fetchWorkspaces(activeServerId);
        workspaceId = findWorkspace() ?? null;
      }
      if (workspaceId) workspaceStore.registerSessionWorkspace(sessionId, workspaceId);
    }
    router.replace({
      pathname: '/agent-chat/[sessionId]',
      params: {
        sessionId,
        sessionFile: sessionFile || undefined,
        workspaceId: workspaceId && workspaceId !== '__chat__' ? workspaceId : undefined,
      },
    });
  }, [router, activeServerId, accessToken, fetchWorkspaces]);

  const openWorkspaceChat = useCallback(async (workspaceId: string) => {
    if (openingWorkspaceId) return;
    setOpeningWorkspaceId(workspaceId);
    setWorkspaceOpenError(null);
    try {
      selectWorkspace(workspaceId);
      const info = await client.createAgentSession({ workspaceId });
      selectSession(info.session_id);
      registerSessionWorkspace(info.session_id, workspaceId);
      setShowWorkspaces(false);
      invalidateChatSessions();
      router.replace({ pathname: '/agent-chat/[sessionId]', params: { sessionId: info.session_id, sessionFile: info.session_file, workspaceId } });
    } catch (error) {
      setWorkspaceOpenError(error instanceof Error ? error.message : 'Could not open this workspace in Agent Chat.');
    } finally {
      setOpeningWorkspaceId(null);
    }
  }, [openingWorkspaceId, selectWorkspace, client, selectSession, registerSessionWorkspace, invalidateChatSessions, router]);

  const background = agentColors.background;
  const border = agentColors.border;
  const foreground = agentColors.text;
  const muted = agentColors.textSecondary;

  if (!authLoaded || !serversLoaded) {
    return <View style={[styles.center, { backgroundColor: background }]}><ActivityIndicator /></View>;
  }

  if (!server || !accessToken) {
    return (
      <View style={[styles.center, { backgroundColor: background }]}>
        <Monitor size={32} color={muted} />
        <Text style={[styles.emptyTitle, { color: foreground }]}>Connect your computer</Text>
        <Text style={[styles.emptyText, { color: muted }]}>Pair Expert AI Agent to use Agent Chat.</Text>
        <Pressable onPress={() => router.replace('/servers')} style={styles.primaryButton}>
          <Text style={styles.primaryText}>Open connections</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <View style={[styles.header, { borderBottomColor: border, backgroundColor: agentColors.surfaceRaised, paddingTop: topInset, minHeight: 64 + topInset }]}>
        <Pressable onPress={() => pathname.endsWith('/settings') ? router.back() : router.replace('/servers')} style={styles.headerButton} accessibilityLabel={pathname.endsWith('/settings') ? 'Back to Agent Chat' : 'Back to your computers'}>
          <ArrowLeft size={18} color={foreground} />
          {isWide && <Text style={[styles.headerLink, { color: foreground }]}>Your computers</Text>}
        </Pressable>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: foreground }]}>Expert AI <Text style={{ color: agentColors.accent }}>Agent</Text></Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: muted }]}>{server.name} · Your computer</Text>
        </View>
        {isWide && <AgentConnectionChip colors={agentColors} />}
        <Pressable onPress={() => router.push('/servers')} style={styles.headerButton} accessibilityLabel="Connections">
          <Monitor size={18} color={foreground} />
        </Pressable>
        <Pressable onPress={() => setShowWorkspaces(true)} style={styles.headerButton} accessibilityLabel="Computer workspaces and files">
          <FolderOpen size={18} color={foreground} />
        </Pressable>
        <Pressable onPress={() => router.push('/agent-chat/settings')} style={styles.headerButton} accessibilityLabel="Agent settings">
          <Settings2 size={18} color={foreground} />
        </Pressable>
        {!isWide && (
          <Pressable onPress={() => setShowHistory((value) => !value)} style={styles.headerButton} accessibilityLabel="Agent chat history">
            <History size={18} color={foreground} />
          </Pressable>
        )}
        <Pressable onPress={newChat} style={styles.headerButton} accessibilityLabel="New agent chat">
          <Plus size={20} color={foreground} />
        </Pressable>
      </View>
      <View style={styles.body}>
        {isWide && (
          <View style={[styles.sidebar, { borderRightColor: border }]}>
            <AgentChatSidebar title="Agent chats" routePrefix="agent-chat" onNewSession={newChat} onSelectSession={openSession} />
          </View>
        )}
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
        </View>
        {!isWide && showHistory && (
          <View style={[styles.mobileSidebar, { backgroundColor: background }]}>
            <AgentChatSidebar title="Agent chats" routePrefix="agent-chat" onNewSession={newChat} onSelectSession={openSession} />
          </View>
        )}
      </View>
      <Modal visible={showWorkspaces} transparent animationType="fade" onRequestClose={() => setShowWorkspaces(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.workspaceCard, { backgroundColor: agentColors.sheetBackground, borderColor: border }]}>
            <View style={styles.workspaceHeader}>
              <View style={{ flex: 1 }}><Text style={[styles.workspaceTitle, { color: foreground }]}>Computer workspaces</Text><Text style={[styles.workspaceHint, { color: muted }]}>Choose a folder to chat and browse files on {server.name}.</Text></View>
              <Pressable onPress={() => setShowWorkspaces(false)} accessibilityLabel="Close workspaces"><X size={20} color={foreground} /></Pressable>
            </View>
            <ScrollView style={styles.workspaceList}>
              {workspaceLoading && <ActivityIndicator color={agentColors.accent} />}
              {!!workspaceError && <Text style={[styles.workspaceHint, { color: agentColors.errorColor }]}>{workspaceError}</Text>}
              {!!workspaceOpenError && <Text style={[styles.workspaceHint, { color: agentColors.errorColor }]}>{workspaceOpenError}</Text>}
              {!workspaceLoading && !workspaceError && workspaces.length === 0 && <Text style={[styles.workspaceHint, { color: muted }]}>No workspaces yet. Add a computer folder to begin.</Text>}
              {workspaces.map((workspace) => <Pressable key={workspace.id} onPress={() => void openWorkspaceChat(workspace.id)} disabled={!!openingWorkspaceId} style={[styles.workspaceRow, { borderColor: border, opacity: openingWorkspaceId && openingWorkspaceId !== workspace.id ? 0.55 : 1 }]}>{openingWorkspaceId === workspace.id ? <ActivityIndicator size="small" color={agentColors.accent} /> : <FolderOpen size={18} color={agentColors.accent} />}<View style={{ flex: 1 }}><Text style={[styles.workspaceName, { color: foreground }]}>{workspace.title}</Text><Text numberOfLines={1} style={[styles.workspaceHint, { color: muted }]}>{workspace.path}</Text></View></Pressable>)}
            </ScrollView>
            <Pressable onPress={() => { setShowWorkspaces(false); setShowNewWorkspace(true); }} style={[styles.workspaceAdd, { backgroundColor: agentColors.accent }]}><Plus size={17} color={agentColors.onTint} /><Text style={{ color: agentColors.onTint, fontFamily: Fonts.sansSemiBold }}>Add workspace</Text></Pressable>
          </View>
        </View>
      </Modal>
      <NewWorkspaceDialog visible={showNewWorkspace} onClose={() => { setShowNewWorkspace(false); if (activeServerId) void fetchWorkspaces(activeServerId); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.62)', padding: 16 },
  workspaceCard: { width: '100%', maxWidth: 480, maxHeight: '75%', borderWidth: 1, borderRadius: 18, padding: 20, gap: 16 },
  workspaceHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  workspaceTitle: { fontSize: 19, fontFamily: Fonts.sansSemiBold },
  workspaceHint: { fontSize: 12, fontFamily: Fonts.sans, marginTop: 4 },
  workspaceList: { minHeight: 60, maxHeight: 350 },
  workspaceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, paddingVertical: 12 },
  workspaceName: { fontSize: 14, fontFamily: Fonts.sansMedium },
  workspaceAdd: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  header: { minHeight: 64, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: Fonts.sansMedium },
  headerButton: { minWidth: 40, minHeight: 40, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerLink: { fontSize: 14, fontFamily: Fonts.sansMedium },
  heading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontFamily: Fonts.sansSemiBold },
  subtitle: { fontSize: 12, fontFamily: Fonts.sans, maxWidth: 220 },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  sidebar: { width: 270, borderRightWidth: 1 },
  mobileSidebar: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  content: { flex: 1, minWidth: 0 },
  emptyTitle: { fontSize: 20, fontFamily: Fonts.sansSemiBold },
  emptyText: { fontSize: 14, fontFamily: Fonts.sans, textAlign: 'center' },
  primaryButton: { marginTop: 8, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#1a1a1a' },
  primaryText: { color: '#fff', fontSize: 14, fontFamily: Fonts.sansSemiBold },
});
