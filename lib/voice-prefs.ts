// Shared preferences for both halves of on-device voice: TTS (read-aloud —
// which system voice, how fast) and STT (voice input — which language to
// listen for). Both are pure local device settings, no server involvement.
import * as SecureStore from 'expo-secure-store';

const TTS_KEY = 'expert-ai.tts-prefs';
const STT_LANG_KEY = 'expert-ai.stt-language';

export interface TtsPrefs {
  /** expo-speech voice identifier, or null for the platform default voice. */
  voiceId: string | null;
  /** 1.0 = normal. */
  rate: number;
}

const DEFAULT_TTS_PREFS: TtsPrefs = { voiceId: null, rate: 1.0 };

let cachedTts: TtsPrefs | null = null;

export async function getTtsPrefs(): Promise<TtsPrefs> {
  if (cachedTts) return cachedTts;
  let result: TtsPrefs;
  try {
    const raw = await SecureStore.getItemAsync(TTS_KEY);
    result = raw ? { ...DEFAULT_TTS_PREFS, ...JSON.parse(raw) } : DEFAULT_TTS_PREFS;
  } catch {
    result = DEFAULT_TTS_PREFS;
  }
  cachedTts = result;
  return result;
}

export async function setTtsPrefs(prefs: TtsPrefs): Promise<void> {
  cachedTts = prefs;
  try {
    await SecureStore.setItemAsync(TTS_KEY, JSON.stringify(prefs));
  } catch {
    /* best-effort */
  }
}

// A short, curated list rather than every BCP-47 code — covers the languages
// Android's on-device SpeechRecognizer commonly ships offline models for.
// "System default" (null) lets the recognizer just use the device's own
// input-language setting, which is the right choice for most users.
export const STT_LANGUAGE_OPTIONS: { code: string | null; label: string }[] = [
  { code: null, label: 'System default' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ru-RU', label: 'Russian' },
];

let cachedSttLang: string | null | undefined; // undefined = not loaded yet

export async function getSttLanguage(): Promise<string | null> {
  if (cachedSttLang !== undefined) return cachedSttLang;
  try {
    cachedSttLang = await SecureStore.getItemAsync(STT_LANG_KEY);
  } catch {
    cachedSttLang = null;
  }
  return cachedSttLang;
}

export async function setSttLanguage(code: string | null): Promise<void> {
  cachedSttLang = code;
  try {
    if (code) await SecureStore.setItemAsync(STT_LANG_KEY, code);
    else await SecureStore.deleteItemAsync(STT_LANG_KEY);
  } catch {
    /* best-effort */
  }
}
