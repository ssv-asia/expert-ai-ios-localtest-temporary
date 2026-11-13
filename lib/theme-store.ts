import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getMaterialYouThemeColors } from './material-you';

const STORAGE_KEY = 'simple_chat_theme';
const AI_DISCLAIMER_KEY = 'ai_disclaimer_seen_v1';

export type ThemePreset = 'dark' | 'expertAI' | 'materialYou' | 'light' | 'custom';

export interface ThemeColors {
  background: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  userBubble: string;
  userBubbleText: string;
  aiBubble: string;
  aiBubbleText: string;
  accent: string;
  /** Text/icon color for content drawn on top of `accent` (e.g. a selected tab
   *  pill) — NOT always white; must be picked per-theme for contrast. */
  onTint: string;
  border: string;
  sheetBackground: string;
  surfaceRaised: string;
  surface: string;
  buttonBackground: string;
  errorBackground: string;
  errorColor: string;
  successColor: string;
  copied: string;
  sheetHandle: string;
}

export interface ThemeSettings {
  preset: ThemePreset;
  fontSize: number; // 0.8 to 1.2 multiplier
  colors?: ThemeColors; // only set for custom
}

const THEME_PRESETS: Record<Exclude<ThemePreset, 'custom'>, ThemeColors> = {
  dark: {
    background: '#161616',
    text: '#E8E8E8',
    textSecondary: '#999999',
    textTertiary: '#666666',
    userBubble: '#0A84FF',
    userBubbleText: '#FFFFFF',
    aiBubble: '#2C2C2C',
    aiBubbleText: '#E8E8E8',
    accent: '#0A84FF',
    onTint: '#FFFFFF',
    border: 'rgba(255,255,255,0.1)',
    sheetBackground: '#1E1E1E',
    surfaceRaised: '#1E1E1E',
    surface: '#2a2a2a',
    buttonBackground: '#1E1E1E',
    errorBackground: '#3a0a0a',
    errorColor: '#FF3B30',
    successColor: '#34C759',
    copied: '#34C759',
    sheetHandle: '#555555',
  },
  expertAI: {
    background: '#0F0F1E',
    text: '#E0D5FF',
    textSecondary: '#A99FBF',
    textTertiary: '#8B7FA0',
    userBubble: '#7C3AED',
    userBubbleText: '#FFFFFF',
    aiBubble: '#1A1A2E',
    aiBubbleText: '#FFD700',
    accent: '#7C3AED',
    // Batman-purple-and-gold: gold reads clearly on the purple accent, where
    // white washes out against the theme's lighter purple tones.
    onTint: '#FFD700',
    border: 'rgba(124, 58, 237, 0.2)',
    sheetBackground: '#1A1A2E',
    surfaceRaised: '#252540',
    surface: '#1F1F35',
    buttonBackground: '#252540',
    errorBackground: '#4a1a1a',
    errorColor: '#FF9500',
    successColor: '#FFD700',
    copied: '#FFD700',
    sheetHandle: '#8B7FA0',
  },
  // Static fallback only — used when the device doesn't support Material You
  // (Android <12, or the native call fails for any reason). The real
  // materialYou experience comes from getMaterialYouThemeColors() in
  // getColors() below, computed live from the device's actual wallpaper.
  materialYou: {
    background: '#161616',
    text: '#E8E8E8',
    textSecondary: '#999999',
    textTertiary: '#666666',
    userBubble: '#0A84FF',
    userBubbleText: '#FFFFFF',
    aiBubble: '#2C2C2C',
    aiBubbleText: '#E8E8E8',
    accent: '#0A84FF',
    onTint: '#FFFFFF',
    border: 'rgba(255,255,255,0.1)',
    sheetBackground: '#1E1E1E',
    surfaceRaised: '#1E1E1E',
    surface: '#2a2a2a',
    buttonBackground: '#1E1E1E',
    errorBackground: '#3a0a0a',
    errorColor: '#FF3B30',
    successColor: '#34C759',
    copied: '#34C759',
    sheetHandle: '#555555',
  },
  light: {
    background: '#F7F8FA',
    text: '#1F2937',
    textSecondary: '#475467',
    textTertiary: '#667085',
    userBubble: '#2563EB',
    userBubbleText: '#FFFFFF',
    aiBubble: '#FFFFFF',
    aiBubbleText: '#1F2937',
    accent: '#2563EB',
    onTint: '#FFFFFF',
    border: '#D9DEE8',
    sheetBackground: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surface: '#EEF1F5',
    buttonBackground: '#EEF1F5',
    errorBackground: '#FDECEC',
    errorColor: '#B42318',
    successColor: '#18794E',
    copied: '#18794E',
    sheetHandle: '#AAB2BF',
  },
};

export interface ThemeStoreState {
  settings: ThemeSettings;
  loaded: boolean;
  aiDisclaimerSeen: boolean;
  load: () => Promise<void>;
  setPreset: (preset: ThemePreset) => Promise<void>;
  setFontSize: (size: number) => Promise<void>;
  setCustomColors: (colors: Partial<ThemeColors>) => Promise<void>;
  getColors: () => ThemeColors;
  reset: () => Promise<void>;
  getAiDisclaimerSeen: () => Promise<boolean>;
  setAiDisclaimerSeen: (seen: boolean) => Promise<void>;
}

async function readFromStore(): Promise<ThemeSettings> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw
        ? JSON.parse(raw)
        : { preset: 'dark', fontSize: 1 };
    }
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    return raw
      ? JSON.parse(raw)
      : { preset: 'dark', fontSize: 1 };
  } catch {
    return { preset: 'dark', fontSize: 1 };
  }
}

async function writeToStore(settings: ThemeSettings) {
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

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  settings: { preset: 'dark', fontSize: 1 },
  loaded: false,
  aiDisclaimerSeen: false,

  load: async () => {
    const settings = await readFromStore();
    set({ settings, loaded: true });
  },

  getAiDisclaimerSeen: async () => {
    try {
      if (Platform.OS === 'web') {
        const seen = localStorage.getItem(AI_DISCLAIMER_KEY) === 'true';
        return seen;
      }
      const seen = await SecureStore.getItemAsync(AI_DISCLAIMER_KEY);
      return seen === 'true';
    } catch {
      return false;
    }
  },

  setAiDisclaimerSeen: async (seen) => {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(AI_DISCLAIMER_KEY, seen ? 'true' : 'false');
      } else {
        await SecureStore.setItemAsync(AI_DISCLAIMER_KEY, seen ? 'true' : 'false');
      }
      set({ aiDisclaimerSeen: seen });
    } catch (err) {
      console.warn('[ThemeStore] Failed to save AI disclaimer:', err);
    }
  },

  setPreset: async (preset) => {
    const settings = { ...get().settings, preset };
    set({ settings });
    await writeToStore(settings);
  },

  setFontSize: async (fontSize) => {
    const clamped = Math.max(0.8, Math.min(1.2, fontSize));
    const settings = { ...get().settings, fontSize: clamped };
    set({ settings });
    await writeToStore(settings);
  },

  setCustomColors: async (colors) => {
    const current = get().settings;
    const baseColors = current.preset === 'custom' && current.colors
      ? current.colors
      : THEME_PRESETS[current.preset as Exclude<ThemePreset, 'custom'>];

    const settings = {
      ...current,
      preset: 'custom' as const,
      colors: { ...baseColors, ...colors },
    };
    set({ settings });
    await writeToStore(settings);
  },

  getColors: () => {
    const { preset, colors } = get().settings;
    if (preset === 'custom' && colors) {
      // `onTint` was added after custom themes already existed on some
      // devices — a custom theme saved before that has no such field in its
      // persisted JSON, which would otherwise render text invisible/default
      // wherever onTint is used (e.g. the workspace panel's active tab,
      // document commit button). Backfill it rather than let it be undefined.
      return colors.onTint ? colors : { ...colors, onTint: THEME_PRESETS.dark.onTint };
    }
    if (preset === 'materialYou') {
      return getMaterialYouThemeColors() ?? THEME_PRESETS.materialYou;
    }
    return THEME_PRESETS[preset as Exclude<ThemePreset, 'custom' | 'materialYou'>];
  },

  reset: async () => {
    const settings = { preset: 'dark' as const, fontSize: 1 };
    set({ settings });
    await writeToStore(settings);
  },
}));
