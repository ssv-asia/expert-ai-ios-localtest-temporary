# iOS TestFlight failure cause audit — 20 November 2026

This audit records source-confirmed causes and evidence gaps before and after
the corrective edits. Baseline: production iOS source at `fec71b08`; Gateway
baseline: committed `ea0ae2d` in the archived Gateway repo. No iPhone
diagnostic export or redacted failed-turn trace was available.

## Findings

### Trial reports `could not start trial (0)`

`lib/auth.ts` sends trial start through `XMLHttpRequest`. Its `readystatechange`
handler resolves every completed request as an `AuthResponse`, including
`xhr.status === 0`. A status of zero means the native request did not produce
an HTTP response; it is not an HTTP rejection from `/auth/trial`. Because
`fetchWithTimeout` falls back to another Gateway origin only when the request
throws, returning status zero bypasses origin failover and `startTrial()` then
formats that transport failure as `Couldn't start trial (0)`. The concrete
client defect is therefore transport failure misclassification and suppressed
origin failover. The underlying on-device transport reason (DNS, TLS, network,
or app transport policy) still requires the TestFlight device log to distinguish.

### `/note` and normal-chat daily-note edits fail or show raw JSON

The iOS client intentionally does not parse `/note`; it forwards the message to
the Gateway. The Gateway must inject a `daily_note` tool call. When received,
`app/simple-chat.tsx` executes `executeDailyNoteTool` locally and adds the JSON
result as a tool-role message before requesting a model follow-up. Two concrete
failure paths exist in this contract:

1. If the deployed Gateway does not emit `daily_note` (or emits a different
   schema/name), local note code never runs. That is a Gateway deployment or
   contract mismatch, not a note-storage failure.
2. `lib/gateway-client.ts` invokes `onToolCalls` without awaiting its Promise,
   while iOS's handler is asynchronous and owns note execution plus the follow-up
   completion. Consequently `streamChatCompletion` resolves before the tool and
   natural-language follow-up finish; the surrounding send lifecycle can release
   state while that work is still active. This is a client lifecycle defect that
   can leave an unfinished/raw intermediate tool result visible or allow a
   subsequent send to race it.

The source audit cannot determine which path occurred in a particular failed
TestFlight turn without a redacted Gateway trace showing the emitted tool name,
arguments, result, and follow-up response.

### Search-chat font appears stretched

The in-chat search `TextInput` explicitly uses `Fonts.sans`, which resolves to
the bundled `DMSans-Regular` face on iOS. The root layout registers and waits for
that font before rendering the application. The search field has no explicit
letter spacing or text transform. Therefore the current source does not support
the theory that a missing font registration or a deliberate wide-letter style
causes the report. The concrete visible distinction is that this field uses
DM Sans while native iOS search fields conventionally use the system font;
the precise visual cause cannot be confirmed without the affected TestFlight
screenshot/device settings. A focused correction should use the native system
font for the iOS search input and retain DM Sans for other platforms. This is a
narrow, reversible correction; the report remains visually unverified until
device QA.

### Daily-note toolbar remains under the keyboard

The editor is in `features/daily-notes/note-writer.tsx`. The safe-area spacer is
already removed when iOS keyboard events arrive, so that earlier proposed cause
is not present in the current `main` source. The toolbar instead remains an
ordinary sibling view below the `TextInput` inside `KeyboardAvoidingView`; it
depends on modal keyboard-frame calculations and JS keyboard-event state to be
repositioned. That mechanism is not a native input accessory and can fail to
track the keyboard edge in a full-screen modal. The actionable source-level
correction is to attach the formatting controls to the iOS `TextInput` using a
native `InputAccessoryView`, leaving the Android toolbar path unchanged. A
physical-device check is still needed to verify the iOS accessory placement.

## Release-critical billing finding

The owner confirmed cross-platform paid-plan access is a required product
behavior. iOS displays account plan/usage and existing paid entitlements, but
`simple-chat.tsx` explicitly says purchases and restore are unavailable. The
client implements only Google Play verification in
`lib/gateway-client.ts`; no StoreKit client or Apple transaction-verification
Gateway method exists. Apple guideline 3.1.3(b) permits multiplatform access to
previously acquired features only when those items are also available through
IAP in the app. This needs both App Store Connect products and server-side
Apple transaction verification; a UI-only purchase button would not be safe.

## Corrective work and outstanding evidence

- iOS trial XHR now rejects status zero on iOS, restoring Gateway origin
  failover. This fixes the source-confirmed client defect; it cannot establish
  whether TestFlight's underlying transport incident was DNS, TLS, or network
  policy without the original device diagnostic.
- iOS awaits the asynchronous local `daily_note` callback through the streamed
  turn lifecycle. The committed Gateway baseline already contains explicit
  slash-note routing, the tool contract, approval flow, result verification,
  and deterministic response intended to prevent raw JSON. Production health
  is reachable and reports `frontier-foundation`, but there is no authenticated
  failed-turn trace proving the deployed schema/result caused the reported
  occurrence. Do not attribute that report to a Gateway outage without such a
  trace.
- The chat search field now uses the native system font on iOS. Since baseline
  source loaded DM Sans correctly and had no stretched letter spacing, the
  visual complaint's precise cause remains unconfirmed without the reported
  device screenshot.
- The daily-note formatting toolbar now uses an iOS native input accessory;
  Android remains on its existing keyboard path. Still requires iPhone/iPad
  device verification.
- Added `expo-iap` StoreKit UI, localized StoreKit prices, eight reported
  weekly/monthly SKUs, restore, Gateway verification, account refresh before
  StoreKit transaction finish, and short verification retry behavior. The
  Gateway candidate verifies transaction/status signatures and notification
  certificate chains, deduplicates notification UUIDs, reconciles current
  renewals, and checks Apple ownership before revoking a plan. This is staged
  in an isolated Gateway checkout and has not been deployed or exercised with
  Apple Sandbox transactions/notifications. No real StoreKit sandbox purchase
  has been completed.
- Added native Sign in with Apple using a server-issued one-time nonce,
  Gateway-side signature/claim verification, and persistent Apple subject to
  Expert AI account mapping. The owner reports enabling the capability on the
  primary `com.ssvasia.expertai` App ID. The signed build and deployed Gateway
  route still need device testing. The optional Apple account-change
  notification endpoint remains unimplemented and should stay blank; the
  separate App Store subscription-notification route is unrelated.
- These source edits are not device acceptance or release approval. App Store
  products, the separate In-App Purchase API key, secure Gateway secrets,
  notification reconciliation, and a signed build remain outstanding.

## Not modified during this audit

Android source and behavior remain outside scope and are unchanged.
