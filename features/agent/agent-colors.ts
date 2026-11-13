import type { ThemeColors, ThemePreset } from '@/lib/theme-store';

// Keep the chosen Chat theme's surfaces and typography, while giving the Agent
// route its own purple identity. Custom themes retain their chosen accent.
export function agentThemeColors(colors: ThemeColors, preset: ThemePreset): ThemeColors {
  if (preset === 'custom' || preset === 'expertAI' || preset === 'materialYou') return colors;
  const purple = preset === 'light' ? '#6D28D9' : '#9B6DFF';
  return { ...colors, accent: purple, userBubble: purple, userBubbleText: '#FFFFFF', onTint: '#FFFFFF' };
}
