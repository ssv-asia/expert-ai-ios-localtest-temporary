import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'app_settings';

export type ThemeMode = 'light' | 'dark' | 'system';
export type DiffViewMode = 'inline' | 'split';

interface AppSettings {
  themeMode: ThemeMode;
  pushNotifications: boolean;
  soundEffects: boolean;
  diffViewMode: DiffViewMode;
  diffPanelAutoOpen: boolean;
  /** Chat mode: prepend a "be brief, no filler" instruction to every request. */
  conciseAnswers: boolean;
  /** Chat mode: ask the model to cite sources / name the tools it used. */
  citeSources: boolean;
  /** Chat mode: always answer in English regardless of the question's language. */
  replyInEnglish: boolean;
  /** Global: play the small vibration on send / reply. */
  haptics: boolean;
}

interface AppSettingsState extends AppSettings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (settings: Partial<AppSettings>) => Promise<void>;
}

const DEFAULTS: AppSettings = {
  themeMode: 'system',
  pushNotifications: true,
  soundEffects: false,
  diffViewMode: 'inline',
  diffPanelAutoOpen: true,
  conciseAnswers: false,
  citeSources: false,
  replyInEnglish: false,
  haptics: true,
};

async function readFromStore(): Promise<Partial<AppSettings>> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    }
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeToStore(settings: AppSettings) {
  try {
    const json = JSON.stringify(settings);
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY, json);
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, json);
    }
  } catch {
    // silently fail
  }
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    const stored = await readFromStore();
    set({ ...DEFAULTS, ...stored, loaded: true });
  },

  update: async (partial) => {
    const current = get();
    const next: AppSettings = {
      themeMode: partial.themeMode ?? current.themeMode,
      pushNotifications: partial.pushNotifications ?? current.pushNotifications,
      soundEffects: partial.soundEffects ?? current.soundEffects,
      diffViewMode: partial.diffViewMode ?? current.diffViewMode,
      diffPanelAutoOpen: partial.diffPanelAutoOpen ?? current.diffPanelAutoOpen,
      conciseAnswers: partial.conciseAnswers ?? current.conciseAnswers,
      citeSources: partial.citeSources ?? current.citeSources,
      replyInEnglish: partial.replyInEnglish ?? current.replyInEnglish,
      haptics: partial.haptics ?? current.haptics,
    };
    set(next);
    await writeToStore(next);
  },
}));
