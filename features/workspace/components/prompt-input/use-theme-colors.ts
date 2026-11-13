import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePathname } from 'expo-router';
import { useThemeStore } from '@/lib/theme-store';
import { agentThemeColors } from '@/features/agent/agent-colors';

export function usePromptTheme() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDark = colorScheme === 'dark';
  const pathname = usePathname();
  useThemeStore((state) => state.settings);
  const themeState = useThemeStore.getState();
  const agentColors = agentThemeColors(themeState.getColors(), themeState.settings.preset);
  if (pathname.startsWith('/agent-chat')) {
    return {
      isDark: useThemeStore.getState().settings.preset !== 'light',
      colors,
      cardBg: agentColors.surfaceRaised,
      cardBorder: agentColors.border,
      toolbarBg: agentColors.surface,
      toolbarBorder: agentColors.border,
      textPrimary: agentColors.text,
      textMuted: agentColors.textTertiary,
      textSecondary: agentColors.textSecondary,
      dropdownBg: agentColors.sheetBackground,
      dropdownBorder: agentColors.border,
      hoverBg: agentColors.surface,
      selectedBg: agentColors.surfaceRaised,
      sectionColor: agentColors.textTertiary,
      accentColor: agentColors.accent,
    };
  }

  return {
    isDark,
    colors,
    cardBg: isDark ? '#121212' : '#FFFFFF',
    cardBorder: isDark ? '#3b3a39' : 'rgba(0,0,0,0.15)',
    toolbarBg: isDark ? '#1a1a1a' : '#F6F6F6',
    toolbarBorder: isDark ? '#3b3a39' : 'rgba(0,0,0,0.12)',
    textPrimary: isDark ? '#fefdfd' : colors.text,
    textMuted: isDark ? '#cdc8c5' : colors.textTertiary,
    textSecondary: isDark ? '#f1ece8' : colors.textSecondary,
    dropdownBg: isDark ? '#1e1e1e' : '#FFFFFF',
    dropdownBorder: isDark ? '#3b3a39' : 'rgba(0,0,0,0.12)',
    hoverBg: isDark ? '#2a2a2a' : '#F0F0F0',
    selectedBg: isDark ? '#333' : '#E8E8E8',
    sectionColor: isDark ? '#888' : '#999',
    accentColor: isDark ? '#6cb6ff' : '#0969da',
  };
}
