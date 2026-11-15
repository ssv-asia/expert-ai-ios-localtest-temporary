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

## Artifact status

No IPA from the latest source is verified or available at the time this note was
written. Update this section only after checking the GitHub run, commit SHA,
artifact contents, IPA checksum, metadata, and download location. An unsigned
IPA requires a compatible signing/sideloading flow; it cannot be installed by
itself as a signed App Store package.
