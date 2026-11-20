# iOS migration update — 15 November 2026

## Scope and source

- This update is in the iOS-only local test repository, on
  `codex/ios-platform-fixes-20261114`.
- The APK repository was not modified. Gateway routes and tool schemas remain
  Gateway-owned; the client does not hardcode slash-command tool names.
- Latest source commit before this update: `9808ae6` (`Refresh stale iOS
  handoff jobs`).

## Finished in this update

- Trial sign-in uses the shared Gateway `/auth/trial` → `/auth/poll` flow,
  validates the returned nonce/expiry/auth URL, only caches a session after
  secure persistence succeeds, retries an expired trial once, and gives a
  useful error for an incomplete Gateway response.
- The iOS trial button has progress feedback and blocks duplicate starts while
  the request is in flight. The button still requires device/Gateway acceptance
  testing; source checks do not prove the live trial contract works.
- iOS durable jobs now reconcile missing/expired Gateway jobs, recover task
  reruns, classify empty completed jobs as failures with an explicit retry,
  keep controls associated with the correct conversation, and reconcile a
  missing desktop-handoff job rather than leaving a stale action.
- iOS task reminders, push-token handling, notification-tap routing, local
  persistence recovery, `/doc` context/edit flow, and `/note` local daily-note
  behavior are documented in `IOS-APK-PARITY-HANDOFF.md`; these need physical
  device acceptance against the live Gateway/APNs setup.
- Latest recorded local static checks (before this documentation update):
  `npx tsc --noEmit`, `npx expo lint`, and Git whitespace checks passed. No
  native build or physical-device verification was run for those source
  changes.

## Build requested

The intended artifact is an unsigned, arm64 iOS test IPA from GitHub Actions,
bundle ID `com.local.expertai`, for signing/sideloading by the owner. It is not
an App Store signed build. The workflow must build the exact pushed commit and
the IPA must be downloaded and validated before being called ready to install.

The owner confirms Android Google OAuth is configured, and has now supplied an
iOS OAuth client ID for the test bundle `com.local.expertai`. This unsigned
test bundle does not require Apple Developer registration. The workflow uses
the provided Google iOS client ID (with the repository variable available to
override it) and verifies that the generated iOS URL scheme matches. The
production iOS bundle ID and production Google client remain separate release
configuration tasks. Do not reuse an Android OAuth client or add a client
secret to the repository.

GitHub run `43710206601` for commit `1746463c9fa0ec2dc3a597438859f9e9a228abbe`
failed at the missing-client precheck before installing dependencies; it
produced no IPA. Run `43710702384` for `71ac9a1` was cancelled after its
no-Google configuration had passed the initial build checks. A replacement
run `43711087685` with the owner's iOS client ID compiled successfully but
failed at the incorrectly ordered `lipo -verify_arch` invocation. Run
`43712887759` also compiled successfully but failed in package verification
after the app Info.plist passed; its logs did not identify which silent
assertion failed. Packaging checks now print the executable architectures and
raw `UIDeviceFamily`, and report precise failures. No artifact was uploaded by
either run. Record the diagnostic replacement run and artifact below.

## Still pending / release limits

- **Trial button:** test on an iPhone with the live Gateway; capture the actual
  `/auth/trial` response/status and confirm poll, secure session save, and
  subsequent authenticated request. If the Gateway contract differs, align
  the client to that contract; do not invent a route.
- **Google sign-in:** test account selection, callback scheme, Gateway token
  verification, and sign-out on device. Confirm production bundle registration
  and OAuth configuration separately.
- **GitHub sign-in:** the user reports provider setup exists; verify its
  iOS-specific callback/configuration and real Gateway exchange before release.
- **Apple sign-in and subscriptions:** Apple Developer membership/configuration
  is pending the owner. Do not claim App Store readiness. Implement Apple
  sign-in and StoreKit purchase/restore with Gateway receipt verification once
  the required Apple team, identifiers, products, and server contract are
  available.
- **Notifications and scheduled tasks:** validate local due reminders, remote
  completion push, permissions, cold/warm taps, task retry, and pause/stop on
  device. APNs/Gateway configuration and the earlier empty upstream generation
  report remain unverified.
- **Parity flows:** run the physical-device smoke checklist for chat, Stop/
  Pause/Resume, new chat, `/doc` open/edit/review/commit, `/note`, Gateway tool
  calls, scheduled conversational tasks, desktop handoff, attachments, voice,
  auth, and iPad layout. Compare expected behavior to the APK without editing
  its repository.
- **Store publication:** production bundle ID/team, signed archive, App Store
  Connect record, Apple sign-in, StoreKit, privacy-policy/data-retention
  reconciliation, account deletion, listing assets, and review remain open.

## Verified IPA artifact — 15 November 2026

- GitHub Actions run [43719193028](https://github.com/ssv-asia/expert-ai-ios-localtest-temporary/actions/runs/43719193028) succeeded on commit `7ded23df0c2ed66fb966d9ed769251873be31fd5`. Release compile, package validations, ZIP integrity check, and artifact upload all passed.
- Artifact: `ExpertAI-for-AltServer`, ID `14164127343`, 62,970,759-byte artifact ZIP, expires `2026-11-22T13:46:05Z`. GitHub artifact ZIP SHA-256: `58128f89e1aa945648f45ea9e846e0d7490b61f9650cdfc9ea3856c6c3b84aa0`.
- Downloaded ZIP: `/Users/macbook/Downloads/ExpertAI-for-AltServer-run-43719193028.zip`. Extracted IPA: `/Users/macbook/Downloads/ExpertAI-for-AltServer-run-43719193028.ipa` (63,316,831 bytes). IPA SHA-256: `70737092de9bffd27b5b4842f5584f043618ef3c19bb14b80e5a20a03ec0095d`, matching the checksum file inside the CI artifact.
- Verified with `unzip -tq`; app bundle `com.local.expertai`; Share Extension `com.local.expertai.share-extension`; version `1.5.3 (1)`; minimum iOS `16.0`; device family iPhone+iPad; architecture arm64. CI package checks also validated Sentry/app privacy manifests and embedded extension path.
- This is an **unsigned** IPA. It is ready for the owner's AltServer/AltStore signing/sideload flow, not directly installable as a signed App Store app. Device installation and runtime acceptance have not yet been reported.


## Packaging diagnostic result — run 43714653876

The diagnostic replacement run on `b562c4a6ae6a23fdb203b7aab3ac6ad089e045ac` passed Release compilation and the app checks for bundle `com.local.expertai`, version `1.5.3 (1)`, minimum iOS `16.0`, iPhone+iPad device families, arm64 executable, and privacy manifests. Packaging then failed because the embedded Share Extension bundle identifier was `com.local.expertai`, while its target is configured as `com.local.expertai.share-extension`. The workflow supplied `PRODUCT_BUNDLE_IDENTIFIER=com.local.expertai` as a global `xcodebuild` command-line override, which also overrode the extension target setting.

The global bundle-ID override has been removed; Expo-generated target-specific identifiers remain authoritative. The packaging gate continues to require the app bundle ID and the expected distinct Share Extension bundle ID. Run `43714653876` uploaded no IPA. Corrected commit `7ded23df0c2ed66fb966d9ed769251873be31fd5` is pushed; replacement run [43719193028](https://github.com/ssv-asia/expert-ai-ios-localtest-temporary/actions/runs/43719193028) succeeded. The uploaded artifact was downloaded, its SHA-256 matched the embedded CI checksum, its IPA ZIP integrity passed, and app/extension bundle identifiers were inspected. See the verified artifact section.
