# Build 30 stable release record

Build 30 restores the last stable non-minified Android release baseline after build 29 showed Expo native-module bridge failures in release: SecureStore option casting and Expo Winter fetch request-body casting.

Retained fixes:

- React Native XHR transport for non-streaming authentication requests.
- Native Android `adjustResize` keyboard layout with no JS keyboard-height padding.
- Archive targeted-edit and repository cache invalidation source fixes.

R8/resource shrinking is disabled for this build. Build 29 remains available in `release-artifacts/v29/` for comparison, and its mapping file is preserved.
