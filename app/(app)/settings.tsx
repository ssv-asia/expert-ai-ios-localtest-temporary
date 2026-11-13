import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Palette,
  Bell,
  Shield,
  Info,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Trash2,
  MessageSquare,
} from 'lucide-react-native';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppSettingsStore, ThemeMode } from '@/features/settings/store';
import { SpeechSettings } from '@/features/speech/components/speech-settings';
import { AgentModesSection } from '@/features/settings/components/agent-modes-section';
import { useChatStore } from '@/features/chat/store';
import { sdk, unwrapApiData } from '@expertai/client';
import { checkGatewayHealth, GATEWAY_BASE_URL } from '@/lib/gateway-client';
import { getSession, getActiveToken } from '@/lib/auth';
import { fetchMemory, hasMemorySupport, saveMemory, MEMORY_MAX_CHARS } from '@/lib/memory';
import { deleteAutomationRecipe, listAutomationRecipes, type AutomationRecipe } from '@/lib/automation-recipes';
import * as Clipboard from 'expo-clipboard';
import { buildSafeDiagnosticText } from '@/lib/diagnostics';
const { version: getVersion } = sdk;

// â”€â”€â”€ Shared components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SettingsSection({
  title,
  icon: Icon,
  children,
  isDark,
  textPrimary,
}: {
  title: string;
  icon: React.ComponentType<any>;
  children: React.ReactNode;
  isDark: boolean;
  textPrimary: string;
}) {
  const borderColor = isDark ? '#2a2a2a' : 'rgba(0,0,0,0.08)';
  const cardBg = isDark ? '#1a1a1a' : '#FFFFFF';

  return (
    <View style={sectionStyles.container}>
      <View style={sectionStyles.header}>
        <Icon size={15} color={textPrimary} strokeWidth={1.8} />
        <Text style={[sectionStyles.title, { color: textPrimary }]}>{title}</Text>
      </View>
      <View style={[sectionStyles.card, { backgroundColor: cardBg, borderColor }]}>
        {children}
      </View>
    </View>
  );
}

function SettingsRow({
  label,
  description,
  isDark,
  right,
  onPress,
  isLast,
}: {
  label: string;
  description?: string;
  isDark: boolean;
  right?: React.ReactNode;
  onPress?: () => void;
  isLast?: boolean;
}) {
  const textPrimary = isDark ? '#fefdfd' : '#1a1a1a';
  const textMuted = isDark ? '#cdc8c5' : '#888';
  const borderColor = isDark ? '#2a2a2a' : 'rgba(0,0,0,0.06)';

  const content = (
    <View style={[rowStyles.row, !isLast && { borderBottomWidth: 0.633, borderBottomColor: borderColor }]}>
      <View style={rowStyles.textCol}>
        <Text style={[rowStyles.label, { color: textPrimary }]}>{label}</Text>
        {description && (
          <Text style={[rowStyles.desc, { color: textMuted }]}>{description}</Text>
        )}
      </View>
      {right ?? (
        onPress ? <ChevronRight size={16} color={textMuted} strokeWidth={1.8} /> : null
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        {content}
      </Pressable>
    );
  }
  return content;
}

// â”€â”€â”€ About Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AboutSection({
  isDark,
  textPrimary,
  textMuted,
}: {
  isDark: boolean;
  textPrimary: string;
  textMuted: string;
}) {
  const [serverVersion, setServerVersion] = useState<string>('');

  useEffect(() => {
    getVersion()
      .then((res) => {
        const data = unwrapApiData(res.data) as { version?: string } | undefined;
        if (data?.version) setServerVersion(data.version);
      })
      .catch(() => {});
  }, []);

  return (
    <SettingsSection title="About" icon={Info} isDark={isDark} textPrimary={textPrimary}>
      <SettingsRow
        label="Server Version"
        isDark={isDark}
        right={
          <Text style={[rowStyles.valueText, { color: textMuted }]}>
            {serverVersion || 'â€”'}
          </Text>
        }
        isLast
      />
    </SettingsSection>
  );
}

function ServiceHealthSection({ isDark, textPrimary, textMuted }: { isDark: boolean; textPrimary: string; textMuted: string }) {
  const [health, setHealth] = useState<Awaited<ReturnType<typeof checkGatewayHealth>> | null>(null);
  const [checking, setChecking] = useState(false);
  const runCheck = useCallback(async () => {
    setChecking(true);
    setHealth(await checkGatewayHealth());
    setChecking(false);
  }, []);
  useEffect(() => { void runCheck(); }, [runCheck]);
  const label = checking ? 'Checking…' : health?.status === 'operational' ? 'Operational' : health?.status === 'unreachable' ? 'Unreachable' : health?.status === 'degraded' ? 'Degraded' : 'Not checked';
  const color = health?.status === 'operational' ? '#2e9d68' : health?.status === 'unreachable' ? '#d45757' : '#c48a2d';
  return (
    <SettingsSection title="Service health" icon={Shield} isDark={isDark} textPrimary={textPrimary}>
      <SettingsRow label="Expert AI gateway" description={health?.version ? `Release ${health.version}` : 'Transport and service reachability'} isDark={isDark} right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={[rowStyles.valueText, { color: checking ? textMuted : color }]}>{label}</Text><Pressable onPress={runCheck}><Text style={{ color: textMuted, fontSize: 12 }}>Check again</Text></Pressable></View>
      } isLast />
    </SettingsSection>
  );
}

function DiagnosticsSection({ isDark, textPrimary, textMuted }: { isDark: boolean; textPrimary: string; textMuted: string }) {
  const [working, setWorking] = useState(false);
  const copyDiagnostics = useCallback(async () => {
    setWorking(true);
    try {
      await Clipboard.setStringAsync(await buildSafeDiagnosticText());
      Alert.alert('Copied', 'The diagnostic report contains only safe health metadata and local error summaries—not chat content or secrets.');
    } finally {
      setWorking(false);
    }
  }, []);
  return (
    <SettingsSection title="Support diagnostics" icon={Info} isDark={isDark} textPrimary={textPrimary}>
      <SettingsRow label="Copy safe diagnostic report" description="Useful for support; excludes messages, tokens, and private documents." isDark={isDark} right={
        <Pressable onPress={copyDiagnostics} disabled={working}><Text style={{ color: textMuted, fontSize: 13 }}>{working ? 'Preparing…' : 'Copy'}</Text></Pressable>
      } isLast />
    </SettingsSection>
  );
}

function MemorySection({ isDark, textPrimary, textMuted }: { isDark: boolean; textPrimary: string; textMuted: string }) {
  const [value, setValue] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (!session || !hasMemorySupport(session)) { if (!cancelled) setSupported(false); return; }
      try {
        const memory = await fetchMemory(session);
        if (!cancelled) { setSupported(true); setValue(memory.text); setLoadedAt(memory.updated); }
      } catch { if (!cancelled) setSupported(true); }
    })();
    return () => { cancelled = true; };
  }, []);
  const save = useCallback(async (next: string) => {
    const session = await getSession();
    if (!session || !hasMemorySupport(session)) { Alert.alert('Memory unavailable', 'This sign-in method does not support personal memory yet.'); return; }
    setBusy(true);
    try { const result = await saveMemory(session, next); setValue(result.text); setLoadedAt(result.updated); Alert.alert('Saved', 'Your personal memory was updated.'); }
    catch (error) { Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }, []);
  if (supported === false) return null;
  return (
    <SettingsSection title="Personal memory" icon={Shield} isDark={isDark} textPrimary={textPrimary}>
      <View style={{ padding: 14 }}>
        <Text style={{ color: textMuted, fontSize: 12, lineHeight: 17, marginBottom: 9 }}>Review what Expert AI may remember across chats. Edit or clear it at any time.</Text>
        <TextInput value={value} onChangeText={setValue} editable={!busy} multiline maxLength={MEMORY_MAX_CHARS} placeholder="Nothing saved yet" placeholderTextColor={textMuted} style={{ minHeight: 90, maxHeight: 180, borderWidth: 1, borderColor: isDark ? '#333' : '#e4e4e4', borderRadius: 10, padding: 10, color: textPrimary, textAlignVertical: 'top', fontSize: 13 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <Text style={{ color: textMuted, fontSize: 11 }}>{value.length}/{MEMORY_MAX_CHARS}{loadedAt ? ' · synced' : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable onPress={() => Alert.alert('Clear personal memory?', 'This removes the saved memory used across future chats.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => void save('') }])} disabled={busy}><Text style={{ color: '#c95757', fontSize: 13 }}>Clear</Text></Pressable>
            <Pressable onPress={() => void save(value)} disabled={busy}><Text style={{ color: textPrimary, fontSize: 13 }}>{busy ? 'Saving…' : 'Save'}</Text></Pressable>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function RecipesSection({ isDark, textPrimary, textMuted }: { isDark: boolean; textPrimary: string; textMuted: string }) {
  const router = useRouter();
  const [recipes, setRecipes] = useState<AutomationRecipe[]>([]);
  const reload = useCallback(() => { listAutomationRecipes().then(setRecipes).catch(() => {}); }, []);
  useEffect(() => { reload(); }, [reload]);
  if (!recipes.length) return null;
  return (
    <SettingsSection title="Automation recipes" icon={MessageSquare} isDark={isDark} textPrimary={textPrimary}>
      {recipes.map((recipe, index) => (
        <View key={recipe.id} style={{ padding: 12, borderBottomWidth: index === recipes.length - 1 ? 0 : 0.6, borderBottomColor: isDark ? '#2a2a2a' : 'rgba(0,0,0,0.06)' }}>
          <Text style={{ color: textPrimary, fontSize: 14, fontWeight: '600' }}>{recipe.name}</Text>
          <Text numberOfLines={2} style={{ color: textMuted, fontSize: 12, marginTop: 3 }}>{recipe.prompt}</Text>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 8 }}>
            <Pressable onPress={() => router.push({ pathname: '/simple-chat', params: { recipePrompt: recipe.prompt } })}><Text style={{ color: textPrimary, fontSize: 12 }}>Run</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Delete recipe?', 'This removes the saved workflow from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAutomationRecipe(recipe.id); reload(); } }])}><Text style={{ color: '#c95757', fontSize: 12 }}>Delete</Text></Pressable>
          </View>
        </View>
      ))}
    </SettingsSection>
  );
}

// â”€â”€â”€ Main Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDark = colorScheme === 'dark';

  const textPrimary = isDark ? '#fefdfd' : colors.text;
  const textMuted = isDark ? '#cdc8c5' : colors.textTertiary;
  const bg = isDark ? '#121212' : colors.background;

  const { themeMode, pushNotifications, soundEffects, diffPanelAutoOpen, loaded, load, update } =
    useAppSettingsStore();

  const chatNoTools = useChatStore((s) => s.noTools);
  const setChatNoTools = useChatStore((s) => s.setNoTools);
  const chatLoaded = useChatStore((s) => s.loaded);
  const loadChat = useChatStore((s) => s.load);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    if (!chatLoaded) loadChat();
  }, [chatLoaded, loadChat]);

  const themes: { key: ThemeMode; icon: React.ComponentType<any>; label: string }[] = [
    { key: 'light', icon: Sun, label: 'Light' },
    { key: 'dark', icon: Moon, label: 'Dark' },
    { key: 'system', icon: Monitor, label: 'System' },
  ];

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const session = await getSession();
              const token = getActiveToken(session);

              if (!token) {
                Alert.alert('Error', 'You must be signed in to delete your account.');
                return;
              }

              const response = await fetch(`${GATEWAY_BASE_URL}/account/delete`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                Alert.alert('Account Deleted', 'Your account has been successfully deleted.', [
                  {
                    text: 'OK',
                    onPress: () => {
                      update({ themeMode: 'system', pushNotifications: true, soundEffects: false });
                    },
                  },
                ]);
              } else {
                Alert.alert('Error', 'Failed to delete account. Please try again.');
              }
            } catch (error) {
              Alert.alert('Error', 'An error occurred while deleting your account.');
            }
          },
        },
      ]
    );
  }, [update]);

  return (
    <View style={[styles.outerContainer, { backgroundColor: bg }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: textPrimary }]}>Settings</Text>
          <Text style={[styles.description, { color: textMuted }]}>
            Configure your workspace and preferences.
          </Text>
        </View>

        {/* Agent Modes */}
        <AgentModesSection isDark={isDark} />

        {/* Chat */}
        <SettingsSection title="Chat" icon={MessageSquare} isDark={isDark} textPrimary={textPrimary}>
          <SettingsRow
            label="Enable Tools"
            description="Allow the model to use tools (read, write, bash, etc.) in chat sessions"
            isDark={isDark}
            right={
              <Switch
                value={!chatNoTools}
                onValueChange={(v) => setChatNoTools(!v)}
                trackColor={{ false: isDark ? '#3b3a39' : '#E0E0E0', true: '#D71921' }}
              />
            }
          />
          <SettingsRow
            label="Auto-open Diff Panel"
            description="Automatically show file changes in the sidebar when the agent edits or writes files"
            isDark={isDark}
            right={
              <Switch
                value={diffPanelAutoOpen}
                onValueChange={(v) => update({ diffPanelAutoOpen: v })}
                trackColor={{ false: isDark ? '#3b3a39' : '#E0E0E0', true: '#D71921' }}
              />
            }
            isLast
          />
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection title="Appearance" icon={Palette} isDark={isDark} textPrimary={textPrimary}>
          <View style={[rowStyles.row, Platform.OS === 'web' && rowStyles.webThemeRow]}>
            <View style={rowStyles.textCol}>
              <Text style={[rowStyles.label, { color: textPrimary }]}>Theme</Text>
              <Text style={[rowStyles.desc, { color: textMuted }]}>
                {themeMode === 'system' ? 'Following system' : themeMode === 'dark' ? 'Dark mode' : 'Light mode'}
              </Text>
            </View>
            <View style={[rowStyles.themeIcons, Platform.OS === 'web' && rowStyles.webThemeIcons]}>
              {themes.map(({ key, icon: Icon }) => {
                const isActive = themeMode === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => update({ themeMode: key })}
                    style={[
                      rowStyles.themeBtn,
                      Platform.OS === 'web' && rowStyles.webThemeBtn,
                      isActive && {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      },
                    ]}
                  >
                    <Icon
                      size={14}
                      color={isActive ? textPrimary : textMuted}
                      strokeWidth={1.8}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </SettingsSection>

        {/* Speech */}
        <SpeechSettings />

        {/* Notifications */}
        <SettingsSection title="Notifications" icon={Bell} isDark={isDark} textPrimary={textPrimary}>
          <SettingsRow
            label="Push Notifications"
            description="Receive alerts for session updates"
            isDark={isDark}
            right={
              <Switch
                value={pushNotifications}
                onValueChange={(v) => update({ pushNotifications: v })}
                trackColor={{ false: isDark ? '#3b3a39' : '#E0E0E0', true: '#D71921' }}
              />
            }
          />
          <SettingsRow
            label="Sound Effects"
            description="Play sounds for actions and alerts"
            isDark={isDark}
            right={
              <Switch
                value={soundEffects}
                onValueChange={(v) => update({ soundEffects: v })}
                trackColor={{ false: isDark ? '#3b3a39' : '#E0E0E0', true: '#D71921' }}
              />
            }
            isLast
          />
        </SettingsSection>

        {/* Data */}
        <SettingsSection title="Data" icon={Shield} isDark={isDark} textPrimary={textPrimary}>
          <SettingsRow
            label="Clear Local Data"
            description="Remove cached data and preferences"
            isDark={isDark}
            onPress={() => {
              update({ themeMode: 'system', pushNotifications: true, soundEffects: false });
            }}
            right={<Trash2 size={16} color={textMuted} strokeWidth={1.8} />}
          />
          <SettingsRow
            label="Delete Account"
            description="Permanently delete your account and all data"
            isDark={isDark}
            onPress={handleDeleteAccount}
            right={<Trash2 size={16} color="#D32F2F" strokeWidth={1.8} />}
            isLast
          />
        </SettingsSection>

        {/* AI Model Information */}
        <SettingsSection title="AI Model" icon={Info} isDark={isDark} textPrimary={textPrimary}>
          <SettingsRow
            label="Powered by"
            isDark={isDark}
            right={
              <Text style={[rowStyles.valueText, { color: textMuted }]}>
                OpenRouter
              </Text>
            }
          />
          <SettingsRow
            label="AI Disclosure"
            description="Learn about AI-generated content"
            isDark={isDark}
            onPress={() => {
              Alert.alert(
                'ðŸ¤– About AI-Generated Responses',
                'This app uses artificial intelligence to generate responses. AI responses may be inaccurate or outdated and should not be considered professional advice.\n\nDo not rely on this app for medical, legal, or financial decisions.',
                [{ text: 'Got it', style: 'default' }]
              );
            }}
            isLast
          />
        </SettingsSection>

        {/* About */}
        <AboutSection isDark={isDark} textPrimary={textPrimary} textMuted={textMuted} />
        <ServiceHealthSection isDark={isDark} textPrimary={textPrimary} textMuted={textMuted} />
        <DiagnosticsSection isDark={isDark} textPrimary={textPrimary} textMuted={textMuted} />
        <MemorySection isDark={isDark} textPrimary={textPrimary} textMuted={textMuted} />
        <RecipesSection isDark={isDark} textPrimary={textPrimary} textMuted={textMuted} />
      </ScrollView>
    </View>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 20,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: Fonts.sansBold,
  },
  description: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
});

const sectionStyles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: Fonts.sansSemiBold,
  },
  card: {
    borderRadius: 12,
    borderWidth: 0.633,
    overflow: 'hidden',
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  desc: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    marginTop: 2,
  },
  valueText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  themeIcons: {
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0,
  },
  webThemeRow: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 10,
  },
  webThemeIcons: {
    width: '100%',
    gap: 8,
  },
  themeBtn: {
    width: 32,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  webThemeBtn: {
    flex: 1,
    width: undefined,
    height: 42,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.28)',
    flexDirection: 'row',
    gap: 8,
  },
});

const updateStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statusText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  infoCol: {
    flex: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: Fonts.sansSemiBold,
  },
  upToDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
  },
  upToDateText: {
    fontSize: 11,
    fontFamily: Fonts.sansMedium,
    color: '#34C759',
  },
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  messageText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    flex: 1,
  },
});

