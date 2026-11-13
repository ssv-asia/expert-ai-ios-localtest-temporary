# Build 29 rollback record

Build 29 keeps the version-28 R8/resource-shrinking configuration enabled.

Changes in this build:

- Authentication HTTP requests use React Native XMLHttpRequest instead of Expo Winter fetch, avoiding the release-only native `request.start` body type failure during Google token exchange.
- Android keyboard layout is restored to native `resize`; the JS measured IME-height padding path is removed from chat composers to prevent the full-screen/double-lift regression.
- No gateway or OAuth credentials were changed.

Rollback target: the version-28 source/artifacts in `release-artifacts/v28/`. Do not reuse version code 28 in Play Console; this record is for source comparison only.
