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
- **Daily note in chat:** iOS now advertises its local `daily_note` tool schema in chat requests, and the existing on-device executor performs read/list/create/append/replace and returns the result to the model for its follow-up. The `/note` command is still forwarded untouched for Gateway handling; the app does not parse or hardcode slash commands. Verify the deployed Gateway forwards the client tool declaration and test read/add/replace on device.
- **Android image generation:** Recorded as an Android-only report; no Android source or package was changed in this iOS task.

## Build paths

- `.github/workflows/ios-production-build.yml` builds an unsigned Release IPA for `com.ssvasia.expertai` on GitHub's `xcode-27` runner. It validates the production app and share extension IDs, APNs entitlement, app group, Google callback, arm64, iOS 16 minimum, and IPA ZIP integrity. This is a compile/package proof only; an unsigned IPA cannot be uploaded to App Store Connect.
- The first production run, `44652059778` on commit `5a60133`, used Xcode 27.1 and passed prebuild, dependency installation, and production identity checks. The native build stopped because older third-party Pods declared iOS 9–12.4, below Xcode 27's supported deployment-target range. A new iOS Podfile config plugin raises only pod targets below the app's iOS 16 minimum to 16.0; a corrected CI run is pending.
- `.github/workflows/ios-app-store-signed.yml` is the signed path. It uses Xcode automatic distribution signing authenticated through an App Store Connect team API key, then exports a signed App Store IPA. The account owner must add `APPLE_TEAM_ID` as a GitHub Actions variable and `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, and `APP_STORE_CONNECT_PRIVATE_KEY` as Actions secrets. The private key must stay in GitHub Secrets; do not paste it into chat or commit it.
- With Xcode automatic signing, a separately hand-created Apple Distribution certificate and provisioning profile are not necessary for this workflow. Xcode manages distribution signing through the team API key. The App ID must have the capabilities used by the app: App Groups (`group.com.ssvasia.expertai`), Push Notifications, and Associated Domains (`applinks:ssv.asia`). The share-extension App ID/profile must also be provisioned.
- Local machine check: Xcode 15.2 / iOS 17.2 SDK, no signing identity installed, and no CocoaPods executable detected. This local toolchain cannot make the required current App Store archive. GitHub Xcode 27 is the build route.
- The signed workflow currently produces a signed IPA artifact for manual upload. It does not yet create an App Store Connect record, upload the IPA, configure TestFlight groups, or publish store metadata/assets.

## Release blockers still open

1. Add the team App Store Connect API key and team ID to GitHub Actions, with a Developer-or-higher role that can perform Xcode automatic signing. Then run the signed workflow and verify the exported IPA signature and bundle IDs.
2. Confirm the production App ID capabilities and app group above are active in the same Apple Developer team; confirm the share-extension identifier is available to automatic signing.
3. Create/verify the App Store Connect app record for `com.ssvasia.expertai`, upload the signed IPA, and wait for processing before TestFlight testing.
4. The archive's Apple requirements audit flags Google social sign-in without a verified Sign in with Apple equivalent as a possible Guideline 4.8 issue. No Apple token-verification Gateway contract was confirmed in this source review. Do not add an unverified/decorative Apple button; resolve the server contract and implement the full flow before public release.
5. StoreKit is not implemented. If the iOS listing or app offers paid digital plans consumed in the app, implement Apple In-App Purchase and server verification or remove that purchase offer from iOS before review.
6. Complete the archive checklist: privacy policy/data-retention reconciliation, App Privacy responses, account deletion verification, support/review access, age rating, export compliance, screenshots/store metadata, and physical iPhone/iPad acceptance. iPhone Duo layout acceptance remains open.

## Verification in this update

- Production `expo prebuild --platform ios --clean --no-install` completed.
- `expo config --type public --json` resolved bundle `com.ssvasia.expertai`, Google client `1093163336745-1m9gq2ka957532pd75mr339kltu8muop.apps.googleusercontent.com`, reversed callback scheme `com.googleusercontent.apps.1093163336745-1m9gq2ka957532pd75mr339kltu8muop`, production APNs mode, extension ID, and app group.
- The pod deployment-target config plugin was added and regenerated into the ignored iOS Podfile; it leaves the app's supported minimum at iOS 16.0.
- No production Xcode build or signed IPA has completed yet. Record the exact source SHA, Actions run URL, artifact ID, signature, checksum, and App Store Connect processing result after the workflows run.
