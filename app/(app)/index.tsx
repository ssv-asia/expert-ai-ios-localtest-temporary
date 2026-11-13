import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useWorkspaceStore } from '@/features/workspace/store';
import { useServersStore } from '@/features/servers/store';
import { useAuthStore } from '@/features/auth/store';

export default function AppIndex() {
  const serversLoaded = useServersStore((s) => s.loaded);
  const authLoaded = useAuthStore((s) => s.loaded);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const selectedWorkspaceId = useWorkspaceStore((s) => s.selectedWorkspaceId);
  const workspaceLoading = useWorkspaceStore((s) => s.loading);
  const workspaceError = useWorkspaceStore((s) => s.error);
  const currentServerId = useWorkspaceStore((s) => s.currentServerId);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);

  // The entry gate must NEVER sit on a full-screen spinner forever. Local stores
  // (auth/servers) load fast; the only slow part is the network workspace fetch,
  // which is already timeout-bounded in the client — but this is a hard backstop:
  // after 12s we proceed with whatever we have (an empty workspace list simply
  // redirects to Settings) rather than blocking the whole app.
  const [gaveUp, setGaveUp] = useState(false);
  const stillWaiting = !serversLoaded || !authLoaded || workspaceLoading;
  useEffect(() => {
    if (!stillWaiting) {
      setGaveUp(false);
      return;
    }
    const t = setTimeout(() => setGaveUp(true), 12000);
    return () => clearTimeout(t);
  }, [stillWaiting]);

  if (stillWaiting && !gaveUp) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Timed out while a network fetch was still pending (or it errored): don't trap
  // the user — offer a retry and a way through to Settings.
  if ((gaveUp && workspaceLoading) || (workspaceError && !workspaces.length)) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn&apos;t load your workspaces</Text>
        <Text style={styles.body}>
          Check your connection and that Expert AI Agent is running on your computer.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.75 }]}
          onPress={() => {
            setGaveUp(false);
            fetchWorkspaces(currentServerId);
          }}
        >
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const targetId = selectedWorkspaceId ?? workspaces[0]?.id;
  if (targetId) {
    const lastSession = Platform.OS !== 'web'
      ? useWorkspaceStore.getState().getLastSession(targetId)
      : null;
    if (lastSession) {
      return <Redirect href={`/workspace/${targetId}/s/${lastSession}`} />;
    }
    return <Redirect href={`/workspace/${targetId}`} />;
  }

  return <Redirect href="/settings" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center', opacity: 0.7 },
  btn: {
    marginTop: 8,
    minWidth: 160,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  btnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
