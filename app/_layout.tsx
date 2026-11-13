import React, { useEffect } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { useFonts } from "expo-font";
import {
  DMSans_400Regular,
  DMSans_400Regular_Italic,
  DMSans_500Medium,
  DMSans_500Medium_Italic,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import "react-native-reanimated";

import { SafeAreaProvider } from "react-native-safe-area-context";

import * as Sentry from "@sentry/react-native";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import { installCrashHandler } from "@/lib/crash-log";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppSettingsStore } from "@/features/settings/store";
import { useAuthStore } from "@/features/auth/store";
import { useServersStore } from "@/features/servers/store";
import { useChatStore } from "@/features/chat/store";
import { checkGatewayHealth } from "@/lib/gateway-client";


SplashScreen.preventAutoHideAsync();

// Crash + error reporting. The DSN is a client-side value (safe to ship). Kept
// deliberately lean to stay well inside the free tier: no performance tracing,
// no session replay — just errors. Disabled in dev so local red-boxes don't
// burn quota. Native crash capture only becomes active after the next native
// build (this is a native module).
try {
  Sentry.init({
    dsn: "https://a9d0b0c9c2f566e47290b48c6070a85f@o4511990271442944.ingest.us.sentry.io/4511990318366720",
    enabled: !__DEV__,
    tracesSampleRate: 0,
    attachStacktrace: true,
  });
} catch (e) {
  // Crash reporting failing must never take the app down with it — degrade to
  // "no Sentry", the on-device crash log below still works.
  console.warn("[Sentry] init failed", e);
}

// Persist unhandled JS errors on-device so the founder Console can show them.
// No-op-safe, no network, chains the existing global handler. Independent of
// Sentry (works offline, and is visible in-app without leaving the device).
installCrashHandler();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export const unstable_settings = {
  anchor: "simple-chat",
};

// expo-router picks this up as the root route's error boundary — one bad render
// anywhere shows a "Reload" screen instead of a white screen.
export { AppErrorBoundary as ErrorBoundary };

function RootLayout() {
  const colorScheme = useColorScheme();
  const settingsLoaded = useAppSettingsStore((s) => s.loaded);
  const loadSettings = useAppSettingsStore((s) => s.load);
  const authLoaded = useAuthStore((s) => s.loaded);
  const loadAuth = useAuthStore((s) => s.load);
  const serversLoaded = useServersStore((s) => s.loaded);
  const loadServers = useServersStore((s) => s.load);
  const chatLoaded = useChatStore((s) => s.loaded);
  const loadChat = useChatStore((s) => s.load);

  useEffect(() => {
    if (!settingsLoaded) loadSettings();
  }, [settingsLoaded, loadSettings]);

  useEffect(() => {
    if (!chatLoaded) loadChat();
  }, [chatLoaded, loadChat]);

  useEffect(() => {
    if (!authLoaded) loadAuth();
  }, [authLoaded, loadAuth]);

  useEffect(() => {
    if (!serversLoaded) loadServers();
  }, [serversLoaded, loadServers]);

  // Non-blocking startup self-check. It never gates login or splash: its only
  // purpose is to classify an immediately unreachable gateway for diagnostics
  // before the user starts a request.
  useEffect(() => {
    let active = true;
    void checkGatewayHealth().then((health) => {
      if (!active) return;
      console.log(`[gateway health] ${health.status}${health.version ? ` (${health.version})` : ''}`);
      try { Sentry.addBreadcrumb({ category: 'gateway', message: `startup:${health.status}`, level: health.status === 'operational' ? 'info' : 'warning' }); } catch { /* best effort */ }
    });
    return () => { active = false; };
  }, []);

  const [fontsLoaded] = useFonts({
    "DMSans-Regular": DMSans_400Regular,
    "DMSans-Italic": DMSans_400Regular_Italic,
    "DMSans-Medium": DMSans_500Medium,
    "DMSans-MediumItalic": DMSans_500Medium_Italic,
    "DMSans-SemiBold": DMSans_600SemiBold,
    "DMSans-Bold": DMSans_700Bold,
    "JetBrainsMono-Regular": JetBrainsMono_400Regular,
    ...Ionicons.font,
    ...MaterialIcons.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.getElementById('expert-ai-boot')?.remove();
      }
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'expert-ai-web-icon-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = '/icon-fonts.css';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.title = 'Expert AI Terminal';
    const tags: Record<string, string> = {
      description: 'Expert AI Terminal — an AI workspace for chat, research, voice input, tasks, and connected archives.',
      'og:title': 'Expert AI Terminal',
      'og:description': 'Use Expert AI Terminal in your browser for AI chat, research, voice input, tasks, and connected archives.',
      'og:url': 'https://app.ssv.asia/chat',
      'twitter:title': 'Expert AI Terminal',
      'twitter:description': 'Expert AI Terminal — AI chat and productivity tools in your browser.',
    };
    for (const [name, content] of Object.entries(tags)) {
      const property = name.startsWith('og:') || name.startsWith('twitter:') ? 'property' : 'name';
      let tag = document.head.querySelector(`meta[${property}="${name}"]`) as HTMLMetaElement | null;
      if (!tag) { tag = document.createElement('meta'); tag.setAttribute(property, name); document.head.appendChild(tag); }
      tag.content = content;
    }
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = 'https://app.ssv.asia/chat';
  }, []);

  // Tapping a "scheduled task is due" notification opens Chat and runs that task.
  // Covers both a warm tap (listener) and a cold start (last response).
  useEffect(() => {
    const route = (data: unknown) => {
      const d = data as { kind?: string; type?: string; taskId?: string; conversationId?: string; jobId?: string } | undefined;
      if (d?.kind === "scheduled_task" && d.taskId) {
        router.navigate({ pathname: "/simple-chat", params: { runTaskId: d.taskId } });
      } else if (d?.type === "response_ready" && d.conversationId) {
        router.navigate({ pathname: "/simple-chat", params: { openConversationId: d.conversationId, openJobId: d.jobId || undefined } });
      }
    };
    Notifications.getLastNotificationResponseAsync()
      .then((resp) => route(resp?.notification.request.content.data))
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((resp) =>
      route(resp.notification.request.content.data),
    );
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    if (Platform.OS === 'web') {
      return (
        <View style={bootStyles.container}>
          <Image source={{ uri: '/expert-ai-owl-splash.png' }} style={bootStyles.logo} resizeMode="contain" />
          <Text style={bootStyles.wordmark}>expert <Text style={bootStyles.wordmarkLight}>ai</Text></Text>
        </View>
      );
    }
    return null;
  }

  return (
    <AppErrorBoundary scope="root">
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack>
            <Stack.Screen
              name="simple-chat"
              options={{ headerShown: false, animation: "none" }}
            />
            <Stack.Screen
              name="(app)"
              options={{ headerShown: false, animation: "none" }}
            />
            <Stack.Screen
              name="connect"
              options={{ headerShown: false, animation: "none" }}
            />
            <Stack.Screen
              name="modal"
              options={{ presentation: "modal", title: "Modal" }}
            />
          </Stack>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
    </AppErrorBoundary>
  );
}

// Sentry.wrap adds the native error boundary + touch/navigation breadcrumbs.
// It does not replace AppErrorBoundary (our recoverable UI) — it sits outside it.
// Guarded: if wrapping ever throws, ship the plain layout rather than no app.
let RootExport: React.ComponentType = RootLayout;
try {
  RootExport = Sentry.wrap(RootLayout) as React.ComponentType;
} catch (e) {
  console.warn("[Sentry] wrap failed", e);
}
export default RootExport;

const bootStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15121C' },
  logo: { width: 112, height: 112, marginBottom: 14 },
  wordmark: { fontFamily: 'DMSans-Bold', fontSize: 22, color: '#F8F6FB', letterSpacing: -0.5 },
  wordmarkLight: { fontFamily: 'DMSans-Regular', color: '#C7B7FF' },
});
