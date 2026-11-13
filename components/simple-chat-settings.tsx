import React, { useEffect, useState } from 'react';
import {
  Modal,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeStore, type ThemePreset, type ThemeColors } from '@/lib/theme-store';
import { NotificationsService } from '@/lib/notifications-service';
import { useAppSettingsStore } from '@/features/settings/store';
import { AECKnowledgeSection } from '@/components/aec-knowledge-section';
import { getSession, type Session } from '@/lib/auth';
import { authenticate, canUseBiometricLock, getAppLockMode, setAppLockMode, type AppLockMode } from '@/lib/app-lock';
import { fetchMemory, hasMemorySupport, saveMemory, MEMORY_MAX_WORDS } from '@/lib/memory';
import { isMaterialYouSupported, getMaterialYouThemeColors } from '@/lib/material-you';
import { getAvailableVoices, speakText } from '@/lib/tts';
import { getSttLanguage, getTtsPrefs, setSttLanguage, setTtsPrefs, STT_LANGUAGE_OPTIONS, type TtsPrefs } from '@/lib/voice-prefs';
import type { Voice } from 'expo-speech';

interface SimpleChatSettingsProps {
  visible: boolean;
  onClose: () => void;
  onReplayOnboarding?: () => void;
}

export const SimpleChatSettings: React.FC<SimpleChatSettingsProps> = ({ visible, onClose, onReplayOnboarding }) => {
  const isDark = useColorScheme() === 'dark';
  const defaultColors = isDark ? Colors.dark : Colors.light;
  // useWindowDimensions (not Dimensions.get, which is only read once per
  // render and won't itself trigger a re-render) so this sheet's scroll
  // height actually updates if the device rotates while it's open.
  const { height: windowHeight } = useWindowDimensions();
  const { settings, setPreset, setFontSize, setCustomColors, getColors } = useThemeStore();
  const [customColorMode, setCustomColorMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [themeColors, setThemeColors] = useState(getColors());
  const [appLockMode, setAppLockModeState] = useState<AppLockMode>('off');
  const [biometricAvailable, setBiometricAvailable] = useState(true);
  const [ttsPrefs, setTtsPrefsState] = useState<TtsPrefs>({ voiceId: null, rate: 1.0 });
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);
  const [sttLang, setSttLangState] = useState<string | null>(null);
  const [memoryText, setMemoryText] = useState('');
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState<{ kind: 'ok' | 'err' | 'info'; message: string } | null>(null);

  const NOTIFICATIONS_STORAGE_KEY = 'simple_chat_notifications_enabled';

  // Update theme colors when settings change
  useEffect(() => {
    setThemeColors(getColors());
  }, [settings, getColors]);

  // Use theme colors from store, fallback to system colors
  const colors = themeColors || defaultColors;

  // Load notification setting and session on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (Platform.OS === 'web') {
          const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
          setNotificationsEnabled(stored === 'true');
        } else {
          const stored = await SecureStore.getItemAsync(NOTIFICATIONS_STORAGE_KEY);
          setNotificationsEnabled(stored === 'true');
        }
      } catch {
        setNotificationsEnabled(false);
      }
      setLoadingNotifications(false);
    };
    const loadSession = async () => {
      try {
        const currentSession = await getSession();
        setSession(currentSession);
      } catch {
        setSession(null);
      }
    };
    const loadAppLock = async () => {
      getAppLockMode().then(setAppLockModeState);
      canUseBiometricLock().then(setBiometricAvailable);
    };
    const loadVoicePrefs = async () => {
      getTtsPrefs().then(setTtsPrefsState);
      getSttLanguage().then(setSttLangState);
      getAvailableVoices().then(setAvailableVoices);
    };
    loadSettings();
    loadSession();
    loadAppLock();
    loadVoicePrefs();
  }, [visible]);

  const handleSetTtsVoice = async (voiceId: string | null) => {
    const next = { ...ttsPrefs, voiceId };
    setTtsPrefsState(next);
    await setTtsPrefs(next);
  };

  const handleSetTtsRate = async (rate: number) => {
    const next = { ...ttsPrefs, rate };
    setTtsPrefsState(next);
    await setTtsPrefs(next);
  };

  const handleSetSttLang = async (code: string | null) => {
    setSttLangState(code);
    await setSttLanguage(code);
  };

  const handleSetAppLockMode = async (mode: AppLockMode) => {
    if (mode === 'off') {
      setAppLockModeState(mode);
      await setAppLockMode(mode);
      return;
    }
    const available = await canUseBiometricLock();
    setBiometricAvailable(available);
    if (!available) {
      Alert.alert(
        'Biometric unlock unavailable',
        'Set up Face or Fingerprint unlock in your phone settings, then return here and try again.',
      );
      return;
    }
    const verified = await authenticate();
    if (!verified) {
      Alert.alert('Unlock not verified', 'Biometric lock was not enabled. Try again when you are ready.');
      return;
    }
    setAppLockModeState(mode);
    await setAppLockMode(mode);
  };

  // Load the current memory text once the session is known (loadSession above
  // already fires on `visible`; this waits for it rather than racing it).
  useEffect(() => {
    if (!visible || !session) return;
    if (!hasMemorySupport(session)) {
      setMemoryLoading(false);
      return;
    }
    let cancelled = false;
    setMemoryLoading(true);
    fetchMemory(session)
      .then((r) => { if (!cancelled) setMemoryText(r.text); })
      .catch((err) => { if (!cancelled) setMemoryStatus({ kind: 'err', message: err instanceof Error ? err.message : String(err) }); })
      .finally(() => { if (!cancelled) setMemoryLoading(false); });
    return () => { cancelled = true; };
  }, [visible, session]);

  const memoryWordCount = memoryText.trim() ? memoryText.trim().split(/\s+/).length : 0;
  const memoryOverLimit = memoryWordCount > MEMORY_MAX_WORDS;

  const handleSaveMemory = async () => {
    if (!session) return;
    setMemorySaving(true);
    setMemoryStatus(null);
    try {
      const result = await saveMemory(session, memoryText);
      setMemoryText(result.text);
      setMemoryStatus({ kind: 'ok', message: 'Saved.' });
    } catch (err) {
      setMemoryStatus({ kind: 'err', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setMemorySaving(false);
    }
  };

  const handleNotificationToggle = async (value: boolean) => {
    try {
      setNotificationsEnabled(value);
      if (Platform.OS === 'web') {
        localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(value));
      } else {
        await SecureStore.setItemAsync(NOTIFICATIONS_STORAGE_KEY, String(value));
      }
      // Schedule or cancel notifications
      await NotificationsService.scheduleByTheWayNotifications(value);
    } catch (err) {
      console.warn('[Settings] Failed to update notifications:', err);
      setNotificationsEnabled(!value);
    }
  };

  const conciseAnswers = useAppSettingsStore((s) => s.conciseAnswers);
  const citeSources = useAppSettingsStore((s) => s.citeSources);
  const replyInEnglish = useAppSettingsStore((s) => s.replyInEnglish);
  const haptics = useAppSettingsStore((s) => s.haptics);
  const updateAppSettings = useAppSettingsStore((s) => s.update);

  const materialYouSupported = isMaterialYouSupported();
  const themes: (Exclude<ThemePreset, 'custom'>)[] = materialYouSupported
    ? ['dark', 'expertAI', 'materialYou', 'light']
    : ['dark', 'expertAI', 'light'];

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(0.8, Math.min(1.2, settings.fontSize + delta));
    setFontSize(newSize);
  };

  // Material You's preview reflects the ACTUAL device palette (it's the whole
  // point — wallpaper-driven, different per device) rather than a fixed swatch.
  const materialYouPreview = materialYouSupported ? getMaterialYouThemeColors() : null;
  const themePreviewColors = {
    dark: { bg: '#161616', user: '#0A84FF', ai: '#2C2C2C' },
    expertAI: { bg: '#0F0F1E', user: '#7C3AED', ai: '#1A1A2E' },
    materialYou: {
      bg: materialYouPreview?.background ?? '#161616',
      user: materialYouPreview?.userBubble ?? '#0A84FF',
      ai: materialYouPreview?.aiBubble ?? '#2C2C2C',
    },
    light: { bg: '#F7F8FA', user: '#2563EB', ai: '#FFFFFF' },
  };

  const themeDisplayName: Record<Exclude<ThemePreset, 'custom'>, string> = {
    dark: 'Dark',
    expertAI: 'ExpertAI',
    materialYou: 'Material You',
    light: 'Light',
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Backdrop sits BEHIND the sheet as an absolute-fill sibling. Wrapping the
            ScrollView in a Pressable (the old structure) made that Pressable the touch
            responder on Android and stole scroll gestures everywhere except over the
            nested theme buttons — which is exactly the "only the theme area scrolls"
            bug. A plain View container + a sibling backdrop fixes it cleanly. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.container, { backgroundColor: colors.sheetBackground }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {onReplayOnboarding ? (
            <Pressable
              onPress={onReplayOnboarding}
              style={[styles.settingRow, { borderColor: colors.border, backgroundColor: colors.buttonBackground }]}
            >
              <View style={styles.settingRowCopy}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Replay Expert AI walkthrough</Text>
                <Text style={[styles.settingHint, { color: colors.textSecondary }]}>Review onboarding and the feature-by-feature tour</Text>
              </View>
              <Ionicons name="play-circle-outline" size={22} color={colors.accent} />
            </Pressable>
          ) : null}

          {/* Explicit numeric maxHeight bounds the ScrollView directly, so it scrolls
              no matter how the parent sheet's percentage height resolves. Relying on
              the parent's `maxHeight: '85%'` alone is the flaky case that oscillated
              between "not scrollable" (unbounded → clips) and "header only" (flex
              collapse). A definite pixel bound removes that dependency entirely. */}
          <ScrollView
            style={{ maxHeight: Math.round(windowHeight * 0.72) }}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {/* Theme Presets */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Theme</Text>
              <View style={styles.themeGrid}>
                {themes.map((theme) => {
                  const preview = themePreviewColors[theme];
                  const isSelected = settings.preset === theme;
                  return (
                    <Pressable
                      key={theme}
                      onPress={() => {
                        setPreset(theme);
                        setCustomColorMode(false);
                      }}
                      style={[
                        styles.themeButton,
                        {
                          width: themes.length === 4 ? '48%' : '31%',
                          borderColor: isSelected ? '#007AFF' : 'transparent',
                          borderWidth: isSelected ? 2 : 1,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.themePreview,
                          { backgroundColor: preview.bg, borderColor: colors.border },
                        ]}
                      >
                        <View
                          style={[
                            styles.bubblePreview,
                            { backgroundColor: preview.user, marginBottom: 4, marginLeft: 'auto', marginRight: 2 },
                          ]}
                        />
                        <View
                          style={[
                            styles.bubblePreview,
                            { backgroundColor: preview.ai, marginRight: 'auto', marginLeft: 2 },
                          ]}
                        />
                      </View>
                      <Text style={[styles.themeName, { color: colors.text }]}>
                        {themeDisplayName[theme]}
                      </Text>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color="#007AFF"
                          style={{ position: 'absolute', top: 4, right: 4 }}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>


            {/* Custom Colors */}
            {customColorMode && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Custom Colors</Text>
                <Text style={[styles.hint, { color: colors.textSecondary, marginBottom: 12 }]}>
                  Coming soon: Full color customization
                </Text>
              </View>
            )}

            {/* Notifications */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Notifications</Text>
              <View
                style={[styles.settingRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, justifyContent: 'space-between' }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 4 }]}>Helpful Tips & Facts</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
                    Occasional useful nudges through the day
                  </Text>
                </View>
                {!loadingNotifications && (
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={handleNotificationToggle}
                    trackColor={{ false: colors.border, true: '#34C759' }}
                    thumbColor={notificationsEnabled ? '#fff' : '#999'}
                  />
                )}
              </View>
              <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 12 }]}>
                Get research tips, use case ideas, and fascinating tech facts — or turn them off anytime
              </Text>
            </View>

            {/* Answer style — quick global toggles that shape every reply in chat mode. */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Answer style</Text>
              <View style={[styles.settingRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 4 }]}>Concise answers</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
                    Straight to the point — no preamble or filler
                  </Text>
                </View>
                <Switch
                  value={conciseAnswers}
                  onValueChange={(v) => updateAppSettings({ conciseAnswers: v })}
                  trackColor={{ false: colors.border, true: '#34C759' }}
                  thumbColor={conciseAnswers ? '#fff' : '#999'}
                />
              </View>
              <View style={[styles.settingRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 4 }]}>Always cite sources</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
                    Ask for links and named sources on factual answers
                  </Text>
                </View>
                <Switch
                  value={citeSources}
                  onValueChange={(v) => updateAppSettings({ citeSources: v })}
                  trackColor={{ false: colors.border, true: '#34C759' }}
                  thumbColor={citeSources ? '#fff' : '#999'}
                />
              </View>
              <View style={[styles.settingRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 4 }]}>Always reply in English</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
                    Answer in English even when you ask in another language
                  </Text>
                </View>
                <Switch
                  value={replyInEnglish}
                  onValueChange={(v) => updateAppSettings({ replyInEnglish: v })}
                  trackColor={{ false: colors.border, true: '#34C759' }}
                  thumbColor={replyInEnglish ? '#fff' : '#999'}
                />
              </View>
              <View style={[styles.settingRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 4 }]}>Haptic feedback</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
                    A small vibration on send and when a reply lands
                  </Text>
                </View>
                <Switch
                  value={haptics}
                  onValueChange={(v) => updateAppSettings({ haptics: v })}
                  trackColor={{ false: colors.border, true: '#34C759' }}
                  thumbColor={haptics ? '#fff' : '#999'}
                />
              </View>
            </View>

            {/* Privacy — biometric app lock. Off by default; the user has to
                deliberately opt in and choose what it protects. */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacy</Text>
              <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 8 }]}>
                Require Face/Fingerprint unlock for
              </Text>
              {!biometricAvailable ? (
                <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0, marginBottom: 8 }]}>
                  No Face/Fingerprint unlock is set up on this device — set one up in your phone&apos;s
                  settings first to use this.
                </Text>
              ) : null}
              <View style={{ gap: 8 }}>
                {([
                  ['off', 'Nothing (default)', 'Never require unlock'],
                  ['incognito', 'Incognito chats only', 'Unlock only when returning to an incognito chat'],
                  ['all', 'All chats', 'Unlock every time you open or return to the app'],
                ] as const).map(([mode, label, hint]) => {
                  const selected = appLockMode === mode;
                  // Keep the option tappable even when capability is currently
                  // unavailable so the user gets an actionable setup message
                  // instead of a dead-looking control.
                  const disabled = false;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => !disabled && handleSetAppLockMode(mode)}
                      disabled={disabled}
                      style={[
                        styles.settingRow,
                        {
                          backgroundColor: colors.surfaceRaised,
                          borderColor: selected ? '#007AFF' : colors.border,
                          borderWidth: selected ? 2 : 1,
                          opacity: disabled ? 0.4 : 1,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 2 }]}>{label}</Text>
                        <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>{hint}</Text>
                      </View>
                      {selected ? <Ionicons name="checkmark-circle" size={20} color="#007AFF" /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Voice — both halves of on-device voice: read-aloud (TTS: which
                voice, how fast) and voice input (STT: which language to
                listen for). Both fully on-device, no server involvement. */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Voice</Text>

              <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 6 }]}>Read-aloud speed</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => {
                  const selected = ttsPrefs.rate === rate;
                  return (
                    <Pressable
                      key={rate}
                      onPress={() => handleSetTtsRate(rate)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: selected ? '#007AFF' : colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: selected ? '#007AFF' : colors.border,
                      }}
                    >
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: selected ? '#fff' : colors.text }}>
                        {rate}×
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 6 }]}>Read-aloud voice</Text>
              <View style={{ maxHeight: 160, marginBottom: 8 }}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                  <Pressable
                    onPress={() => handleSetTtsVoice(null)}
                    style={[styles.settingRow, { backgroundColor: colors.surfaceRaised, borderColor: ttsPrefs.voiceId === null ? '#007AFF' : colors.border, borderWidth: ttsPrefs.voiceId === null ? 2 : 1, marginBottom: 6 }]}
                  >
                    <Text style={[styles.settingLabel, { color: colors.text }]}>System default</Text>
                  </Pressable>
                  {availableVoices.slice(0, 40).map((v) => {
                    const selected = ttsPrefs.voiceId === v.identifier;
                    return (
                      <Pressable
                        key={v.identifier}
                        onPress={() => handleSetTtsVoice(v.identifier)}
                        style={[styles.settingRow, { backgroundColor: colors.surfaceRaised, borderColor: selected ? '#007AFF' : colors.border, borderWidth: selected ? 2 : 1, marginBottom: 6 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>{v.name}</Text>
                          <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 2 }]}>{v.language}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <Pressable
                onPress={() => speakText("This is what Expert AI's read-aloud will sound like.")}
                style={{ alignSelf: 'flex-start', marginBottom: 16 }}
              >
                <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#007AFF' }}>▶ Test voice</Text>
              </Pressable>

              <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 6 }]}>Voice input language</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {STT_LANGUAGE_OPTIONS.map((opt) => {
                  const selected = sttLang === opt.code;
                  return (
                    <Pressable
                      key={opt.label}
                      onPress={() => handleSetSttLang(opt.code)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 16,
                        backgroundColor: selected ? '#007AFF' : colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: selected ? '#007AFF' : colors.border,
                      }}
                    >
                      <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: selected ? '#fff' : colors.text }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Memory — native mirror of ssv.asia/memo: one free-text field the
                assistant can draw on, same word limit and behavior as the web
                page. Not yet wired into actual chat completions — that's a
                separate backend step; this is just read/write on the same
                data the web page already edits. */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Memory</Text>
              <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0, marginBottom: 8 }]}>
                Tell Expert AI things worth remembering — your role, tone preferences, ongoing
                projects. Same memory as ssv.asia/memo.
              </Text>
              {!session ? (
                <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
                  Sign in to use memory.
                </Text>
              ) : !hasMemorySupport(session) ? (
                <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
                  Memory isn&apos;t available for this sign-in method yet.
                </Text>
              ) : memoryLoading ? (
                <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>Loading…</Text>
              ) : (
                <>
                  <TextInput
                    value={memoryText}
                    onChangeText={setMemoryText}
                    placeholder="e.g. I'm an architect in Chandigarh working in Revit. Prefer Indian codes (NBC/IS). Call me Sam. Keep answers concise and cite sources."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={{
                      minHeight: 100,
                      textAlignVertical: 'top',
                      fontFamily: Fonts.sans,
                      fontSize: 14,
                      color: colors.text,
                      backgroundColor: colors.surfaceRaised,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: 12,
                    }}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={[styles.hint, { marginTop: 0, color: memoryOverLimit ? '#FF3B30' : colors.textSecondary }]}>
                      {memoryWordCount} / {MEMORY_MAX_WORDS} words
                    </Text>
                    <Pressable
                      onPress={handleSaveMemory}
                      disabled={memorySaving}
                      style={({ pressed }) => [
                        { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#007AFF', opacity: memorySaving ? 0.5 : pressed ? 0.8 : 1 },
                      ]}
                    >
                      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#fff' }}>
                        {memorySaving ? 'Saving…' : 'Save memory'}
                      </Text>
                    </Pressable>
                  </View>
                  {memoryStatus ? (
                    <Text
                      style={[
                        styles.hint,
                        { marginTop: 8, color: memoryStatus.kind === 'err' ? '#FF3B30' : memoryStatus.kind === 'ok' ? '#34C759' : colors.textSecondary },
                      ]}
                    >
                      {memoryStatus.message}
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            {/* AEC Knowledge Section */}
            <AECKnowledgeSection session={session} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    // maxHeight alone bounds the inner ScrollView so it scrolls (same as the
    // Console sheet). `overflow: hidden` here previously clipped the overflow
    // instead of letting the ScrollView scroll, so the AEC / Wikipedia section
    // was unreachable.
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 18,
  },
  contentInner: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    marginBottom: 12,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  themeButton: {
    flex: 0,
    alignItems: 'center',
    borderRadius: 8,
    padding: 8,
  },
  themePreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 6,
    borderWidth: 1,
    padding: 8,
    justifyContent: 'center',
    marginBottom: 8,
  },
  bubblePreview: {
    height: 20,
    borderRadius: 10,
    width: '70%',
  },
  themeName: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 4,
  },
  fontSizeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  fontButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 20,
  },
  fontSizeValue: {
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 12,
  },
  settingRowCopy: {
    flex: 1,
  },
  settingLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  settingHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 8,
  },
});
