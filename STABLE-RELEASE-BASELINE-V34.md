# Expert AI Stable Release Baseline — v34

The authoritative cross-session handoff is maintained in the Obsidian APK vault:

`C:\Users\Win 11\Documents\Obsidian Vaults\archive.ssv.asia\ssv\web\Expert AI\APK\CURRENT-STABLE-BASELINE-V34.md`

Version 34 / 1.3.1 is the accepted production baseline. Read that document before making changes. The most important rule is that the Android keyboard solution is **manifest `adjustNothing` plus one JS `Animated.Value` keyboard offset**, not `adjustPan`, `adjustResize`, `KeyboardAvoidingView`, or a second IME-inset hook.

The next Play upload must use version code 35 or higher. R8 and resource shrinking remain disabled for stability; do not re-enable them without a separate release-artifact test matrix. Keep authentication on the React Native XHR path. Preserve GitHub archive cache invalidation, forced refresh, file/folder creation, rename, recursive deletion, and commit history behavior.
