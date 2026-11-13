// Derives a dark ThemeColors palette from the device's actual Material You
// system colors (Android 12+, wallpaper-driven) instead of a fixed hardcoded
// theme. This app is dark-mode-only by design (see theme-store.ts's own
// "migrate old light theme to dark" comment), so this always builds a DARK
// palette tinted by the wallpaper's accent hue — the same idea as Android's
// own dynamic dark theme, not a light/dark toggle.
//
// Shade-index caveat, stated plainly: each returned array mirrors Android's
// `system_accent1_0`..`system_accent1_1000` resource family (13 stops: 0, 10,
// 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000), where index 0 is the
// near-white end and index 12 is the near-black end — indices below are
// chosen on that basis. This cannot be visually verified without a real
// device with dynamic color enabled; if the result looks off on a real phone,
// the fix is adjusting these indices, not the overall approach.
import type { ThemeColors } from './theme-store';

export function isMaterialYouSupported(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MaterialYou = require('react-native-material-you-colors').default;
    return !!MaterialYou.isSupported;
  } catch {
    return false;
  }
}

export function getMaterialYouThemeColors(): ThemeColors | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MaterialYou = require('react-native-material-you-colors').default;
    if (!MaterialYou.isSupported) return null;
    const p = MaterialYou.getMaterialYouPalette();
    const accent = p.system_accent1;
    const neutral = p.system_neutral1;

    return {
      background: neutral[11], // near-black, tinted by the wallpaper's neutral tone
      text: neutral[1],
      textSecondary: neutral[3],
      textTertiary: neutral[5],
      userBubble: accent[4],
      userBubbleText: accent[11],
      aiBubble: neutral[9],
      aiBubbleText: neutral[1],
      accent: accent[4],
      onTint: accent[11],
      border: neutral[8],
      sheetBackground: neutral[10],
      surfaceRaised: neutral[9],
      surface: neutral[9],
      buttonBackground: neutral[9],
      errorBackground: '#3a0a0a',
      errorColor: '#FF3B30',
      successColor: '#34C759',
      copied: accent[3],
      sheetHandle: neutral[6],
    };
  } catch {
    return null;
  }
}
