# iOS App Store build status — 20 November 2026

## Current source and production identity

- Source/build repository: `ssv-asia/expert-ai-ios-localtest-temporary`, branch `codex/ios-platform-fixes-20261114`. Android's organization repository remains reference-only.
- Production bundle ID: `com.ssvasia.expertai`; the old `com.local.expertai` test identity is not used by the production build workflows.
- Expo prebuild generates `ios/ExpertAI.xcodeproj`; `ios/ExpertAI.xcworkspace` appears after `pod install`. Open the workspace for CocoaPods builds, not the `.xcodeproj` directly.
- Expo prebuild was run with the production bundle, production APNs entitlement, the owner's updated Google iOS OAuth client ID, and `group.com.ssvasia.expertai`. It generated app ID `com.ssvasia.expertai` and share extension ID `com.ssvasia.expertai.share-extension`.
- The owner's Google iOS OAuth client ID is a public client identifier and is configured in the production workflow. The app config adds its reversed callback scheme. Device sign-in on the production bundle still needs acceptance testing.

## Work completed from the 20 November device notes

- **Trial start:** On iOS, the sign-in sheet now dismisses before the separate trial terms modal opens. Previously both native modals were presented at once, matching the reported unresponsive trial button. Android's flow is unchanged. Verify the full `/auth/trial` → `/auth/poll` and SecureStore flow on a device.
- **Daily-note editor keyboard:** While iOS keyboard is visible, the editor no longer keeps the bottom safe-area spacer beneath its formatting toolbar. `KeyboardAvoidingView` can position the toolbar directly above the keyboard. Android's inset path is unchanged. Verify on iPhone and iPad with prediction row and floating/split keyboards.
- **Daily note in chat:** iOS matches the APK request contract: the Gateway injects tool schemas server-side, and iOS executes a returned `daily_note` call against device-local notes before returning the result for the model's follow-up. The client sends no tool list and does not parse slash commands; `/note` remains Gateway-owned. Verify the deployed Gateway emits `daily_note` and test read/add/replace on device.
- **Android image generation:** Recorded as an Android-only report; no Android source or package was changed in this iOS task.

## Build paths

- `.github/workflows/ios-production-build.yml` builds an unsigned Release IPA for `com.ssvasia.expertai` on GitHub's `xcode-27` runner. It validates the production app and share extension IDs, APNs entitlement, app group, Google callback, arm64, iOS 16 minimum, and IPA ZIP integrity. This is a compile/package proof only; an unsigned IPA cannot be uploaded to App Store Connect.
- The first production run, `44652059778` on commit `5a60133`, used Xcode 27.1 and passed prebuild, dependency installation, and production identity checks. The native build stopped because older third-party Pods declared iOS 9–12.4, below Xcode 27's supported deployment-target range. A new iOS Podfile config plugin raises only pod targets below the app's iOS 16 minimum to 16.0. The corrected run and result are recorded below.
- `.github/workflows/ios-app-store-signed.yml` is the signed path. It uses Xcode automatic distribution signing authenticated through an App Store Connect team API key, then exports a signed App Store IPA. The account owner must add `APPLE_TEAM_ID` as a GitHub Actions variable and `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, and `APP_STORE_CONNECT_PRIVATE_KEY` as Actions secrets. The private key must stay in GitHub Secrets; do not paste it into chat or commit it.
- With Xcode automatic signing, a separately hand-created Apple Distribution certificate and provisioning profile are not necessary for this workflow. Xcode manages distribution signing through the team API key. The App ID must have the capabilities used by the app: App Groups (`group.com.ssvasia.expertai`), Push Notifications, and Associated Domains (`applinks:ssv.asia`). The share-extension App ID/profile must also be provisioned.
- Remote notification delivery has a separate credential path from App Store signing: the Expo/EAS project must have an APNs authentication key configured, and the Gateway must submit the app's Expo push token to Expo Push Service. The app's `aps-environment` entitlement and local task reminders do not prove remote push delivery. See [Expo push notification setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) and [sending notifications with Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/).
- Local machine check: Xcode 15.2 / iOS 17.2 SDK, no signing identity installed, and no CocoaPods executable detected. This local toolchain cannot make the required current App Store archive. GitHub Xcode 27 is the build route.
- The signed workflow currently produces a signed IPA artifact for manual upload. It does not yet create an App Store Connect record, upload the IPA, configure TestFlight groups, or publish store metadata/assets.

## Release blockers still open

1. The App Store Connect team API key ID, issuer ID, and private-key secrets have been added to repository Actions secrets and their names verified (20 November 2026). Still add `APPLE_TEAM_ID` as an Actions variable, merge draft PR #1 so GitHub registers the signed workflow on `main`, then run it and verify the exported IPA signature and bundle IDs.
2. Confirm the production App ID capabilities and app group above are active in the same Apple Developer team; confirm the share-extension identifier is available to automatic signing.
3. Create/verify the App Store Connect app record for `com.ssvasia.expertai`, upload the signed IPA, and wait for processing before TestFlight testing.
4. **Sign in with Apple is a release gate.** The app uses Google sign-in to authenticate the primary Expert AI account, so Apple Guideline 4.8 requires an equivalent login option unless the app qualifies for a listed exception. No Apple token-verification Gateway contract was found in the accessible source. Do not add a decorative button; confirm the Gateway contract, then implement and device-test the complete token exchange. See Apple's [current Login Services guideline](https://developer.apple.com/app-store/review/guidelines/#login-services).
5. StoreKit is not implemented. If the iOS listing or app offers paid digital plans consumed in the app, implement Apple In-App Purchase and server verification or remove that purchase offer from iOS before review.
6. Configure and verify the APNs auth key in EAS for project `d4ca480b-2d64-4e54-aa5c-dba69f13d0b6`, then test Expo-token registration and Gateway completion push on a physical iPhone. The production entitlement and local reminder path alone do not verify remote notifications.
7. Reconcile the published Privacy Policy's mobile notice before submission: it labels itself Android-only and describes Android Secure Storage and an Agent-mode deletion path, while iOS stores local data differently and offers deletion in Simple Chat. Add an accurate iOS disclosure covering local notes/tasks, Google authentication, Sentry, Expo/Gateway notifications, AI-provider processing/retention, and deletion scope; then align App Store Privacy answers with that notice. The in-app trial age was corrected from 13+ to 18+ to match the current Terms/Privacy policy.
8. Complete the archive checklist: account deletion verification, support/review access, age rating, export compliance, screenshots/store metadata, and physical iPhone/iPad acceptance. iPhone Duo layout acceptance remains open.

## Verification in this update

- Production `expo prebuild --platform ios --clean --no-install` completed.
- `expo config --type public --json` resolved bundle `com.ssvasia.expertai`, Google client `1093163336745-1m9gq2ka957532pd75mr339kltu8muop.apps.googleusercontent.com`, reversed callback scheme `com.googleusercontent.apps.1093163336745-1m9gq2ka957532pd75mr339kltu8muop`, production APNs mode, extension ID, and app group.
- The pod deployment-target config plugin was added and regenerated into the ignored iOS Podfile; it leaves the app's supported minimum at iOS 16.0.
- A production Xcode compile and unsigned IPA packaging have completed; no signed IPA has completed. Record the signed build's signature, checksum, and App Store Connect processing result after the signed workflow runs.

## Production CI result — 20 November 2026

- Source SHA: `a3c8bbdee9d8c118a6c7b3ad4e3a473c9767a4c9` (`Raise iOS pod targets for Xcode 27`).
- GitHub Actions run [44652994910](https://github.com/ssv-asia/expert-ai-ios-localtest-temporary/actions/runs/44652994910) completed successfully on Xcode 27.1. Expo prebuild, production identity/capability checks, CocoaPods installation, native Release compilation, IPA packaging, and upload-artifact all passed.
- Artifact: `ExpertAI-production-unsigned` (artifact ID `14592732422`, 62,894,139 bytes, expires 27 November 2026). GitHub reports artifact digest `sha256:b086de60cae04c8ad52d673adc84728f6f0c8fea3eea481fda36d4360870b29a` for the uploaded artifact archive.
- The artifact contains an **unsigned** production IPA; it is a successful compile/package proof and cannot be uploaded to App Store Connect or installed as a normal signed app. The seven-day artifact is downloadable from the run page above.
- Next: add the missing `APPLE_TEAM_ID` variable, merge draft PR #1, run `.github/workflows/ios-app-store-signed.yml`, verify the exported App Store signature and embedded app/extension profiles, then upload/validate the build in App Store Connect. Physical-device, Gateway-tool, OAuth, and Apple-review checks remain open as listed above.

## Gateway parity build — 20 November 2026

- Source SHA: `f60357bcf1cda4e02e1d3124fd740bd6d85ae783` (`Preserve Gateway tool catalogue on iOS`). This commit removed the iOS-only client-supplied `tools` list so the Gateway can inject its full server-side tool catalogue, matching the APK request contract. The iOS app still executes Gateway-returned `daily_note` calls locally.
- GitHub Actions run [44657768664](https://github.com/ssv-asia/expert-ai-ios-localtest-temporary/actions/runs/44657768664) completed successfully after Xcode compilation, packaging, and artifact upload. Artifact `ExpertAI-production-unsigned`, ID `14595111498`, size 62,891,345 bytes, expires 27 November 2026; GitHub artifact digest `sha256:2ae55c102c5e5a9722f03525ae8d4f0f5fd864e19dbe5add660b89ebe92402ef`.
- Downloaded IPA: `ExpertAI-production-unsigned.ipa`, SHA-256 `2ebe7cd9befb7a3334b8b65978120b72745c6916dd08c272f639c10cb3516775`. ZIP integrity passed. Embedded app ID is `com.ssvasia.expertai`, version `1.5.3 (1)`, and share extension ID is `com.ssvasia.expertai.share-extension`.
- This IPA is unsigned: it has no embedded provisioning profile or code-signature resources. It is not installable on a normal device and cannot be uploaded to App Store Connect. A signed App Store IPA is still outstanding.
- A replacement build, run [44660079330](https://github.com/ssv-asia/expert-ai-ios-localtest-temporary/actions/runs/44660079330), was also dispatched on the same SHA because the first run temporarily appeared stalled. It is redundant; run 44657768664 later completed successfully. Check the replacement's state before cancelling or using it.
- Signed build remains dependent on the owner adding `APPLE_TEAM_ID` and the three `APP_STORE_CONNECT_*` values to GitHub Actions, then dispatching the signed workflow. Device acceptance and the other release blockers above are still open.
- The unsigned build workflow now ignores documentation-only and workflow-file-only pushes on this branch, preventing lengthy native builds for handoff edits. `workflow_dispatch` remains available when an intentional unsigned compile is needed; the signed workflow remains separately manual.
- The owner-provided App Store Connect `.p8` key was validated locally without printing its contents. GitHub Actions now has `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, and `APP_STORE_CONNECT_PRIVATE_KEY` set; secret values are not retrievable for inspection. `APPLE_TEAM_ID` remains unset, and no signing workflow has run yet.
