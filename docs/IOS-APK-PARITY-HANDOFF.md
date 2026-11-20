# Expert AI iOS / APK parity handoff

## Owner-confirmed repository scope — 15 November 2026

- This `expert-ai-ios-localtest-temporary` checkout is the editable iOS source
  and build target for this migration session. Do not edit the organization APK
  repository here.
- The organization repository is the APK codebase. Future APK work may use this
  iOS repository as a behavioral/reference source; Android-specific changes are
  handled in that separate session/repository.
- GitHub currently reports this iOS local-test repository as public. The owner
  has directed this session to edit this named repository; keep credentials,
  signing material, and private configuration out of commits. Confirm repository
  visibility with the owner before any change that depends on private source.

## Critical reliability issue reported by the owner

The APK has also shown intermittent stuck generation, but reopening it usually
clears the Stop state. On iOS, the owner reported that Stop and Pause did
nothing, the Stop button remained after creating a chat and relaunching, and
the composer then could not send. Scheduled work also showed an empty upstream
response, a queued job after pressing Play, and unrelated-looking failed
history. The background request and desktop handoff rows appeared without
working actions.

### iOS source changes made in this checkout

- Scope Stop, Pause/Resume, background status, and desktop handoff to the open
  conversation. An unrelated job no longer turns a fresh chat's Send button
  into a Stop button.
- Invalidate stale turn callbacks and release the foreground composer on Stop
  or chat switch, including work waiting on history preparation or Gateway
  polling. Retry queues can be stopped too.
- Serialize iOS Pause/Resume requests, disable the control while the Gateway is
  processing the operation, and use its returned job state instead of guessing
  locally. Device verification of Gateway pause/resume remains pending.
- Fence status polling and reconciliation with turn generations so a late
  response cannot resurrect a stopped job. A held retry remains retryable but
  no longer counts as active work for Stop/Pause visibility.
- If the session token is missing, keep accepted Gateway work visible and ask
  the user to sign in before Stop/Pause; do not hide a job that the Gateway
  could not be asked to cancel.
- For multiple jobs with mixed paused/running states, Resume now resumes all
  jobs in that conversation, matching the control label and converging state.
- Reattach live Gateway job state to controls immediately at job creation and
  refresh it while polling. Report failed pause/resume/cancel operations rather
  than swallowing them. The composer derives active/paused controls from the
  visible conversation's reconciled job ownership, and Stop preserves a
  retryable queued request while cancelling its automatic retry timer.
- Fence a send from the moment it is accepted, including during history
  compaction and Gateway job creation. Stop/New Chat invalidates that pending
  work; the accepted user turn is already visible and recoverable.
- If iOS Stop lands during pre-Gateway history preparation, show the assistant
  row as stopped and retryable instead of leaving a blank, non-actionable
  bubble. Android's established pre-send display behavior is unchanged.
- Persist assistant `failed`/`queued` state and mark an in-progress stream as
  interrupted in the device-local conversation snapshot. Restore interrupted
  streams as settled retryable turns, and persist the old transcript before
  iOS New Chat switches away. Stop and chat switching hold automatic retries
  until the user explicitly taps Retry, including on foreground return; an
  already accepted Gateway job remains queued in its original conversation.
- Make the open archive draft snapshot atomic with a temp file and backup,
  surface local write failures with a retry action, and fence startup hydration
  so an early user-opened file cannot be replaced by an older restored draft.
  Flush the debounced local snapshot when iOS leaves the active state.
- Serialize creation of today's daily note with note edits and appends, so a
  concurrent first-open cannot overwrite a just-saved note revision.
- Make Gateway tool execution and one-time approval waits observe the same
  cancellation signal. Stop no longer leaves a tool request running or lets a
  dismissed approval resume a cancelled turn. The network tool gets an abort
  signal, and local daily-note work checks turn ownership before updating UI.
- Route the live-stream-to-durable fallback into tracked job ownership,
  foreground polling, persisted conversation output, terminal job history,
  notification delivery, and normal reconciliation when its bounded polling
  window ends. Previously this fallback could record a job without exposing
  working controls or synchronizing its final response. An uncertain create
  response now reconciles its persisted idempotency key, and Stop during job
  creation cancels a job that wins the network race. A completed empty result
  keeps the original request available for an explicit fresh retry.
- Mark “new chat in project” as the loaded conversation before changing
  rendered state, and release only that screen’s foreground send lock while
  older Gateway jobs continue under their own conversation IDs.
- Apply the same pending-send invalidation, live-stream cancellation, queued
  retry hold, and transcript checkpoint when starting a project chat; previously
  this route only released the global composer lock and could leave stale work
  attached to the new project conversation.
- On iOS, starting a new standard or incognito chat also leaves already
  accepted Gateway jobs attached to their original conversation and keeps
  their recovery/polling state; only the foreground turn being interrupted is
  stopped. Port this distinction to Android with its composer lifecycle fix.
- Enforce first-run AI data disclosure before iOS chat sends, regenerated
  answers, queued retries, AI note actions, local task runs, or scheduled-job
  submissions. Existing pending Gateway tasks can still be opened and viewed.
  A separate iOS consent key makes users who accepted the earlier, shorter
  disclaimer review the expanded sharing notice once after this update.
- Make recovered scheduled-task insertion idempotent by Gateway job ID, so a
  local persistence retry cannot create duplicate task rows or reminders.
- Reconcile an empty completed job into an explicit retryable failure for a
  normal chat; scheduled tasks instead record an exhausted run and remain
  available through the scheduled-task restart flow.
- Persist every terminal durable-job result to its originating conversation,
  including when that conversation is currently open. Settle persisted message
  flags on terminal failure/cancellation and remove completed jobs from active
  controls; keep only retryable failures in the explicit retry queue.
- Treat an empty successful SSE/Gateway completion as a failed response, not a
  successful blank answer. Persist terminal durable output or the failure to
  its originating conversation and synchronize task status and job history.
- Keep task reminder IDs tied to their real task, route taps after cold or warm
  launch, consume cold-start responses once, preserve task rows when editing,
  and create a new transcript turn for each remote rerun. Completed remote tasks
  can start a fresh durable run from Play.
- If scheduling several tasks extracted from a daily note fails partway through,
  retain only unsaved selections in the sheet so retrying does not duplicate
  task rows or reminders already persisted.
- Initialize the Expo notification foreground handler and push-token listener
  from the root layout instead of waiting for Simple Chat to mount, so early
  foreground notifications and cold-start routes have notification plumbing
  installed at app startup.
- Rebuild a missing local scheduled-task row from a recovered durable create
  intent, so a Gateway-accepted task remains visible if the first local save
  failed.
- Preserve an iOS scheduled-task rerun intent and its appended transcript when
  the Gateway create response is uncertain; retry the same idempotency key and
  reconnect the result to the existing task row rather than dropping it or
  creating a duplicate. Start reconciliation as soon as a Gateway retry is
  accepted, even if saving its local pending state fails. Require sign-in when
  Play needs to restart a remote job.
- Run iOS Play for a local task through the durable job path, save its transcript
  before submission, and persist the scheduled-task ID and due time in its
  recovery intent. Link the accepted Gateway job to the existing task so Stop,
  notifications, terminal state, and cold-start recovery refer to the same run.
- When job creation has an uncertain result, persist a task-level checking state
  tied to the idempotency intent. Prevent Play/reschedule/delete from creating
  an orphan or duplicate until reconciliation resolves it. If Stop races the
  create response, retain the accepted job unless the Gateway confirms cancel.
- During restart reconciliation, distinguish a permanent Gateway request
  validation rejection from auth/conflict/throttle/network errors. A permanent
  rejection settles the chat and clears the task's uncertain Gateway link so
  its local reminder fallback remains runnable; transient or ambiguous errors
  stay in the idempotent outbox.
- iOS now creates the local task row before first-time Gateway scheduling and
  stores that row ID in the recovery intent. Definite Gateway rejection keeps
  the device reminder as a local fallback; Android submission order is intact.
- Classify a Gateway `completed` job with empty text as a failed user outcome in
  local job history; scheduled tasks become exhausted and can be restarted.
  The durable polling path records the outcome once rather than writing a
  duplicate history entry. TypeScript and static lint commands pass; native
  notification and Gateway acceptance still require device verification.
- Display exhausted tasks as “Needs restart” in both planner surfaces so the
  combined planner agrees with the dedicated task list.
- Keep Gateway tool execution response-driven: iOS does not map slash commands
  to local tool names; streamed Gateway tool calls execute through `/mcp`, with
  `daily_note` handled locally because note content is device-local. The shared
  chat screen retains the existing Android command routing.
- `/doc` and `/nodoc` remain editor-context controls from the Android baseline:
  they include or omit the selected Git file from chat context, while the
  original user message still goes to the Gateway. The iOS client does not
  intercept `/doc` to route or execute a command. Gateway-provided tool calls
  use the existing generic `/mcp` executor without hardcoded tool names. The
  document editor also applies a targeted `patchjson` response locally, and
  the patch applier validates each anchor against the complete file content
  before changing the draft. Verify the Gateway edit, local review, and Git
  commit flow together on an iPhone before release.
- On iOS, request notification permission only from contextual notification
  actions such as scheduling or enabling alerts. Ordinary chat sends only read
  the existing permission state, so they cannot trigger an unexpected prompt;
  cached Expo tokens are also rechecked against current permission.
- Keep the Expo push token separate from the native APNs/FCM token listener;
  invalidate and refetch the Expo token after native token rotation.
- Calculate the iOS keyboard lift against the active window size so a docked
  keyboard in iPad Split View/Stage Manager is handled without lifting the
  composer for a floating keyboard.
- Route cold-start and warm notification taps centrally, clear consumed cold
  responses, and de-duplicate a tap delivered through both paths.
- Limit and space iOS “Helpful Tips” notifications so they leave pending
  notification capacity for scheduled-task reminders; Android’s existing tip
  schedule is unchanged.
- Keep a local due-time notification for remote scheduled tasks, request
  notification permission when scheduling, and tell the user if iOS cannot
  create a device reminder.
- Tell the user separately when the due reminder exists but no Gateway push
  token was obtained, since that reminder cannot report task completion.
- Restore missing local reminders for already-pending iOS tasks when notification
  permission is later granted, including when returning from the iOS Settings app.
- Do not request notification permission when a response/task merely completes;
  request it from contextual scheduling or alert opt-in actions, and check the
  existing authorization before presenting a completion notification.
- Preserve the iOS local-only task fallback after a definitive Gateway
  rejection: clear its abandoned chat association and route Play through the
  local stream instead of retrying the rejected durable request.
- Apply Git commit responses only to the archive file that was submitted, and
  preserve newer edits made while that request was in flight. A successful
  commit advances the remote SHA and committed baseline without replacing the
  current draft.
- Keep scheduled-task prompts, completion names, and upstream failure text out
  of lock-screen notification copy; notification payloads retain only the task
  and conversation IDs needed for in-app routing.
- When a durable job reaches a terminal state during reconciliation, send a
  task-specific completion/failure notification if it belongs to a scheduled
  task; ordinary chat failures use generic response copy. Do not surface raw
  Gateway errors in notification bodies.
- Preserve the last in-memory scheduled task list on a failed iOS read/write,
  roll back failed local mutations, and expose retry/error state in both
  planner surfaces. Surface local project, archive, document, chat-history,
  theme, notification-preference, and canvas storage errors rather than
  silently replacing saved data with an empty list or reporting success.
- Make iOS archive, project, saved-document, and automation-recipe snapshots
  atomic with a temporary file and a last-known-good backup. Recover a valid
  backup when the primary JSON is damaged, preserve the last in-memory value
  on write failure, serialize read-modify-write operations to prevent concurrent
  updates overwriting one another, and surface recipe load/save/delete errors.
  These recovery writes are iOS-only; Android retains its existing persistence
  behavior.
- Move the iOS scheduled-task list off SecureStore's small per-item size limit
  using an atomic file snapshot, backup recovery, and one-time migration from
  the existing SecureStore key; Android and web retain their existing storage.
- Keep conversational scheduling Gateway-owned. The iOS client does not parse
  scheduling language or invent tool names; streamed tool calls requested by
  the Gateway are executed through the existing `/mcp` path and their results
  are returned to the Gateway. This supports scheduling when the Gateway emits
  a compatible tool call. Verify the resulting task appears in the task UI,
  retains its Gateway identity, and produces the expected reminder/completion
  notification. `/task` remains its separate durable-agent mode.
- A read-only review of the APK repository's current `app/simple-chat.tsx`
  confirms the same response-driven Gateway tool flow: streamed tool calls are
  executed through generic `/mcp`, with only `daily_note` handled locally. The
  reviewed APK chat source contains no client-side scheduling-tool name or
  schema. The deployed Gateway schema and task-list synchronization still need
  authenticated end-to-end verification; do not hardcode a guessed command.

These changes are source-level only so far. Static TypeScript/lint checks and
targeted document-edit/config checks pass, but they still need a native iPhone
run with Gateway jobs and notification permission states before they can be
called device-verified. APNs delivery also needs the deployed Gateway/APNs
configuration and a correctly signed build; local notifications do not prove
remote push delivery. A due-time local reminder is a fallback prompt to open
and run the task; it does not run background generation by itself.

The new approval/tool cancellation and durable-fallback lifecycle paths are
iOS-gated in the shared screen; Android keeps its existing parallel tool-call
and fallback behavior in this checkout. Android parity follow-up remains in the
separate checklist below.

## APK follow-up (do not change APK source in this migration checkout)

1. Port the conversation-scoped composer state and cancellation generation
   guard to the APK client. Standard, incognito, project, and history chat
   switches must all invalidate pending setup and abort only the foreground
   stream. A new chat must always accept a message even when a previous
   conversation has a running/queued job.
2. Ensure Stop cancels foreground streams, durable Gateway jobs, and retry
   timers; make cancellation failure visible and preserve reconciliation state.
3. Ensure Pause/Resume operates on the job IDs for the visible conversation,
   reports Gateway errors, and refreshes authoritative state.
4. Verify scheduled-task execution and manual retry update the same task row,
   conversation, and job-history entry. Preserve upstream error details when
   response text is empty.
5. Confirm Android local notification permission/channel setup and remote push
   delivery independently; a scheduled task should disclose when reminders are
   unavailable.
6. Match error visibility for local history, scheduled tasks, notes, projects,
   archives, documents and preferences. Failed reads must not become empty
   collections that a later write can overwrite.
7. Add regression coverage for: stop before request setup completes; stop while
   streaming; stop during durable polling; switch/new chat during generation;
   cold relaunch with an active job; pause/resume failure; task retry; terminal
   empty response; and notification denied/token unavailable.
8. Check that background status and desktop handoff buttons are only shown for
   an actionable job and that they copy/submit the exact invitation for that
   job.

## Full parity audit inventory

This checklist is intentionally broad. “In review” means the feature still
needs an Android-reference comparison and iOS end-to-end confirmation; it is
not a claim of parity.

## Source documentation requiring correction

- `IMPLEMENTATION-COMPLETE.md` says APK/IPA builds and all-feature iOS device
  testing are complete, but its own checklist still leaves build, iOS device,
  tablet/foldable, offline, payment, AEC, themes, and notifications unchecked.
  Treat this document as historical implementation notes, not release approval.
- `CLAUDE.md` is the APK-specific reference and records account-deletion
  backend support as pending. The iOS client currently calls the Gateway
  deletion route; its copy is scoped to the server account and explicitly says
  device-local data remains. Verify the deployed Gateway deletion behavior and
  update the APK client separately if that endpoint is now supported.
- `FRONTIER_FEATURE_AUDIT.md` is the more current release ledger; its explicit
  deferrals and acceptance rule still require a verification note or a reasoned
  deferral for each differentiator before claiming release readiness.
- The published [Privacy Policy](https://ssv.asia/privacy-policy/) was reviewed
  on 15 November 2026. Its 2 October 2026 mobile notice explicitly covers the
  Android package, not iOS. It says production includes Sentry and prompts are
  processed for live requests, while older main-policy text says no crash SDK is
  used and describes seven-day prompt-log retention. Deletion and backup
  statements also differ. Update the policy to cover the iOS app and reconcile
  it with actual Gateway/provider retention and shipped SDK configuration
  before finalizing App Store privacy answers.
- Apple sign-in cannot be implemented end to end from this client contract: the
  iOS source and checked-in Gateway schema contain no Apple identity-token
  exchange. On 2026-11-15 the deployed Gateway health endpoint responded, but
  `/openapi.json`, `/auth/apple/verify`, and `/auth/native/apple/start` returned
  404. Do not add a client-only Apple button or guess a token-exchange route;
  the Gateway owner must publish/confirm its Apple verification contract first.
  Apple Guideline 4.8 currently requires an equivalent qualifying login when a
  third-party login such as Google authenticates the app's primary account;
  Guideline 5.1.2(i) requires disclosure of third-party AI sharing and explicit
  permission before transmission. The current iOS first-run notice names the
  published AI/search/retrieval providers and gates iOS requests on agreement.
  Confirm the Gateway/provider inventory and account-deletion behavior before
  claiming review compliance. See Apple's [Login Services](https://developer.apple.com/app-store/review/guidelines/#login-services),
  [Data Use and Sharing](https://developer.apple.com/app-store/review/guidelines/#privacy),
  and [Account Sign-In](https://developer.apple.com/app-store/review/guidelines/#account-sign-in) rules.

| Area | Audit scope | State |
|---|---|---|
| Sign-in and account | Email/code, Google, Apple, session restore, sign-out, account deletion, server validation | Email and server-verified Google exchange paths exist; public and local-test iOS builds select separate OAuth client registrations. Apple exchange is absent from checked-in code/schema and the tested deployed route candidates returned 404; Gateway contract/implementation required. Account deletion endpoint is still marked pending in APK docs. |
| Simple chat | Send, stream, retry, regenerate, edit, new chat, history, incognito, search, stop, background jobs | Source fixes cover pending-send cancellation, per-conversation stop state, retry queues and recovered durable work. iOS forwards Gateway-owned slash commands without local mode rewriting; native verification pending |
| Chat tools | Gateway tool calls, approval, error/result display, cancellation, local-only tools | In review |
| Plain-chat scheduling | Gateway-emitted task tools, task-list visibility, and notifications | iOS runs compatible Gateway tool calls through `/mcp` without local scheduling-language parsing or command hardcoding; verify the Gateway-created task is visible and its lifecycle/notifications work end to end |
| Scheduled tasks | Gateway execution, local fallback, notifications, retries, pause/cancel, reschedule/delete, history | iOS local Play now uses durable job tracking and stores task identity in recovery intent; empty terminal output is recorded as failure. Both planner surfaces show local persistence errors and retry; native delivery and Gateway acceptance pending |
| Daily notes | Local storage, date navigation, autosave/flush, AI actions, extracted tasks | Serialized note creation prevents concurrent write loss; save-loss guards remain in source. Device lifecycle verification pending |
| Archives and `/doc` | Git repository navigation, open/edit/patch/commit, conflict and error handling | The original `/doc` message reaches Gateway with the selected file context; compatible Gateway tool calls execute through the generic `/mcp` path, and targeted `patchjson` replies update the local draft. Verify the end-to-end edit/review/commit flow on iPhone. Provider, repository and native verification also remain pending |
| Workspace and files | Pairing, browse/read/write, transfer, git changes, terminal, preview, sessions | In review |
| Desktop agent | QR and account discovery, pairing, reconnect, tools, VNC, handoff | In review; iPhone and iPad layouts pending |
| Voice and media | Speech input/output, camera/gallery, image analysis, share-in to chat | Share extension enabled; media handling still under review |
| Billing and plans | Android Play flow comparison, iOS StoreKit, restore/history, server entitlements | Android submission notes say purchases were removed and the app is free; iOS also has no purchase action. StoreKit is a release blocker only if this release sells or unlocks paid digital access. Confirm the intended commercial model and App Store account entitlement setup before submission. |
| Notifications | Local schedule reminders, foreground banners, push completion, tap routing, denied permission | Source now handles contextual permission, reminder restoration, local reminder fallbacks and cold/warm tap routing. Requires real-device checks, APNs credentials, and deployed Gateway/provider verification |
| Settings and privacy | Theme, memory, app lock, data clearing, deletion disclosures, support links, third-party AI consent | First-run AI data disclosure and explicit iOS acknowledgement added; provider/retention inventory and deletion endpoint verification remain pending |
| Navigation and accessibility | iPhone/iPad layouts, keyboard, safe areas, VoiceOver labels, hardware back | In review |
| Release readiness | Bundle ID, signing, privacy manifests, App Store disclosures, clean build and install | Source declares linked account email/user ID, push device token, and submitted text/media in the app privacy manifest, without tracking; the workflow validates it and the Sentry CocoaPod manifest in the final app. Final App Store privacy disclosures still need the complete provider/retention inventory. Clean prebuild also confirmed production APNs config, one associated-domain entry, iPhone/iPad targets, and the share-extension privacy manifest. Pods archive, SDK signatures, signing, and device acceptance remain pending |

## Frontier release ledger cross-check (items 19–38)

| Item | iOS evidence in source | Remaining proof or work |
|---|---|---|
| 19. Agent run timeline | Durable job state, phase and tool activity appear in chat status; history records terminal jobs. | The full expandable per-step timeline with retry/cancel per step is not complete; verify Gateway event coverage on device. |
| 20. Leave-it-running inbox | Chat exposes active job status and recent job history. | A unified inbox for completed, failed, paused, and waiting jobs is not implemented. |
| 21. Desktop handoff | Short-lived Gateway invite is copied with job ID; paired desktop has consume/continue flow. | Verify pairing, expiry, wrong-owner rejection, and continuation on physical iPhone and desktop. |
| 22. Research brief | `/research` selects durable research mode and existing live tools. | Verify actual tool/source behavior and final cited brief with the deployed Gateway. |
| 23. Freshness and verify again | `/verify` and “Verify again” are present. | Structured citation dates/IDs and reliable one-tap replay remain deferred by the source ledger. |
| 24. Answer actions | Save to note/document, schedule follow-up, share/export, and document commit paths exist. | Exercise each action and confirm local/Git persistence and errors on iOS. |
| 25. Structured output | `/checklist`, `/memo`, `/table`, `/study`, `/meeting`, and `/executive` formats exist. | Review prompt behavior and layout with long/table responses on iPhone and iPad. |
| 26. Routing reason | Served model and a client-readable routing reason are rendered. | The reason is heuristic until the Gateway provides an authoritative reason; verify fallback routes. |
| 27. Context controls | `/doc` and `/nodoc` bridge the open local document into the iOS request; context estimate is shown. | iOS no longer applies `/fresh` or `/recent N` locally; confirm the Gateway owns these commands. Per-request notes/memory scopes and a real token budget remain absent; estimate is not enforcement. |
| 28. Memory controls | User can review, edit, save, and clear memory. | Per-fact provenance is absent; verify privacy, failure, and stale-session behavior. |
| 29. Branching | Branching duplicates a conversation with independent IDs. | Compare/merge and ancestry are deferred in the source ledger. |
| 30. Long-form generation | Stream checkpointing, queued retry, and durable job recovery exist. | Verify process kill, app relaunch, long output, and partial recovery on physical hardware. |
| 31. Tool permissions | Mobile uses a conservative allowlist and approval for writes/unknown tools. | Verify each Gateway tool category and cancellation/error rendering; no exhaustive device matrix yet. |
| 32. Recipes | Reusable recipes are stored locally and editable/removable. | Verify storage recovery, privacy disclosures, and import/export expectations. |
| 33. Team sharing | No shared-data authority is implemented. | Explicitly deferred in the source ledger; no team-sharing claim should ship. |
| 34. Quality controls | Citation preference, `/verify`, and `/critique` are available. | Citation metadata, confidence quality, and source correctness require live Gateway review. |
| 35. Accessibility | Several controls have accessibility labels/live status text. | Full VoiceOver, Dynamic Type, reduced-motion, contrast, and keyboard audit remains. |
| 36. Cost/quota | Account balance, plan, and retry `notCharged` states exist. | Per-run cost transparency and routing cost explanation are incomplete; validate billing on iOS. |
| 37. Privacy | Incognito chats and local retention/data-clearing controls exist. | Verify account deletion end-to-end; APK docs say its backend endpoint is pending. Review final privacy disclosures. |
| 38. Release health | Startup health check, Settings recheck, and redacted diagnostics exist. | Confirm redaction, offline states, and support workflow on device; do not infer release health from TypeScript. |

## Release blockers outside this source audit

- Google iOS OAuth client ID and matching URL scheme / provider configuration.
  The unsigned local-test IPA overrides its bundle ID to `com.local.expertai`,
  so its Google OAuth registration must match that ID; the public app needs its
  own registration for `com.ssvasia.expertai`. Configure the GitHub repository
  variable `EXPO_PUBLIC_GOOGLE_IOS_LOCALTEST_CLIENT_ID` for local-test builds;
  configure `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` separately for public/EAS builds.
  Expo config selects the matching client ID and reversed URL scheme based on
  `EXPERT_AI_LOCALTEST_BUILD`; the client ID is public configuration, not a secret.
  The local-test GitHub workflow is manual-only and fails early until its
  `EXPO_PUBLIC_GOOGLE_IOS_LOCALTEST_CLIENT_ID` repository variable is configured.
- Apple Sign in client, native capability, and Gateway token validation support.
  Because Google is offered for the primary Expert AI account on iOS once its
  OAuth client is configured, review App Store Guideline 4.8 and complete the
  equivalent sign-in requirement (Apple is the intended option) before public
  submission. Apple’s current [login-services rule](https://developer.apple.com/app-store/review/guidelines/#login-services)
  applies when third-party sign-in is used for the primary account; email sign-in
  remains available, but Google is also offered. Apple identity-token exchange
  cannot be safely completed without Gateway-side Apple token validation.
- Explicit third-party AI data consent. The first-run AI notice now explains
  that prompts, included conversation context, and chosen attachments go to the
  Gateway and relevant AI/search/knowledge providers; iOS users must tap
  “Agree and continue” to dismiss it. Confirm this copy against the final
  provider inventory and [Apple privacy guideline 5.1.2(i)](https://developer.apple.com/app-store/review/guidelines/#privacy).
- StoreKit purchase flow and server-side receipt/transaction validation only
  become blockers if this release sells or unlocks paid digital access. The
  Android Play submission notes say billing was removed and premium features
  are coming later; iOS likewise does not initiate purchases. If monetization
  changes, Apple's current
  [In-App Purchase rule](https://developer.apple.com/app-store/review/guidelines/#payments)
  requires Apple's purchase mechanism unless a specific exception or regional
  entitlement applies.
- Account deletion endpoint verification (APK documentation still marks the backend as pending).
- Signing credentials, StoreKit products and
  server-side purchase validation.
- Gateway APNs/push provider configuration and signed-build push delivery
  verification. The app submits a push token when creating a Gateway job, but
  this client has no operation to attach a newly available token to an already
  accepted job; confirm the Gateway contract before claiming permission changes
  can restore push delivery for in-flight jobs. Local reminders are separate.
- Local Xcode is 15.2, below React Native 0.81's Xcode 16.1 minimum; use a
  compatible Xcode before attempting a local native build. The GitHub workflow
  now explicitly selects Xcode 16.4 on `macos-15`, whose current runner image
  includes that version; the workflow still needs to run against this source.
  See the official [macos-15 runner image inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md).
- The unsigned iOS workflow now checks the generated Google callback URL
  scheme, Share Extension target dependency/embed phase, extension bundle ID
  and app-group entitlement. It builds the CocoaPods workspace with one
  DerivedData path and checks the final IPA for an arm64 executable and the
  embedded `.appex`. Physical-device sign-in and share-sheet testing are still
  required after sideloading; this workflow change has not yet run on GitHub.
- Production iOS EAS configuration now fails if the production Google iOS OAuth
  client ID is absent, preventing an iOS build that silently omits the configured
  Google sign-in option. The dynamic config checks EAS's target platform so this
  iOS OAuth/APNs requirement does not block an Android production build.
- The Expo push-token cache now keeps the Gateway-facing Expo token distinct
  from the native APNs/FCM token emitted on token rotation. Device delivery
  still needs APNs credentials, Gateway delivery, and a signed-device check.
- The iOS build workflow checks Sentry Cocoa's privacy manifest both in the
  installed pod source and in the final app resource bundle. This verifies its
  Crash Data, Performance Data, and Other Diagnostic Data declarations survive
  CocoaPods packaging; it does not replace the App Store privacy review.
- Public privacy/support URLs and final App Privacy disclosures.
- Native iPhone/iPad acceptance for notifications, sharing, keyboard, login,
  pairing and background job recovery.

## Verification completed in this checkout

- `npx tsc --noEmit` and focused ESLint checks pass after the current source
  changes.
- The first-launch AI disclosure now names the Gateway and relevant third-party
  AI/search/knowledge providers, and iOS requires the explicit agreement button
  before dismissal. The wording still needs final review against the complete
  provider and retention inventory before submission.
- Expo config introspection was checked for both `com.ssvasia.expertai` with
  the public OAuth client and `com.local.expertai` with the separate local-test
  client; each generated the matching reversed Google URL scheme.
- Workflow YAML parsing and `git diff --check` pass.
- Targeted `lib/document-agent.ts` runtime checks passed for exact replace,
  duplicate/missing anchors, overlapping operations, insertion and append.
- A clean Expo iOS prebuild was generated outside the checkout and inspected
  for production APNs entitlement, associated domain, iPhone/iPad device
  families and share-extension privacy manifest. A CocoaPods archive and
  merged SDK privacy manifests were not verified.
- Repeated a clean Expo prebuild in a temporary copy for both the public
  configuration and the local-test configuration (using a syntactically valid
  dummy Google client ID). Verified the local bundle ID, reversed Google
  callback URL scheme, Share Extension bundle ID/app group, four generated
  Quick Actions and AppDelegate routes, privacy manifest, and iOS 16.0
  deployment target. Separate config assertions verified production selects
  the public bundle ID and production APNs entitlement, local-test selects its
  own bundle ID and development APNs entitlement, and invalid production/test
  combinations fail. These checks prove config generation only; they do not
  verify the owner's real Google OAuth registration, compile native code, or
  exercise the app on a device.
- Parsed the current unsigned IPA workflow YAML and confirmed its manual
  dispatch job is present. The workflow has not run against this worktree.
- `npx expo install --check` reported the dependencies as up to date using
  Expo's bundled native-module map; network access was disabled, so this is not
  a current remote compatibility check.
- Inspected the connected repository's actual workflow history: run 7 completed
  and uploaded an unsigned IPA artifact for commit
  `1431940213382abc3616182c7c8f810c8d084362`; that artifact is an older source
  snapshot and is not the current worktree. Run 8, for commit
  `87cf3614682153b642ffe816463959f026e0cc78`, was cancelled during CocoaPods
  compilation before the app archive or IPA packaging steps. Neither run
  verifies the current local changes. No new workflow was dispatched because
  the release audit is not complete.
- The checkout was fast-forwarded to `87cf3614682153b642ffe816463959f026e0cc78`
  on `codex/ios-platform-fixes-20261114`, and the saved local work was restored
  with overlapping changes reconciled. The original stash remains as a recovery
  copy. These merged changes are still uncommitted and have not been pushed or
  built; review the diff and rerun validation before any release workflow.
- No IPA for the current worktree was built. The previously successful
  uploaded IPA is the historical artifact identified above. Local Xcode 15.2
  is below the Xcode 16.1 minimum for this React Native version, CocoaPods is
  unavailable locally, and product/provider release configuration remains
  unresolved.

## Current continuation status — 15 November 2026

### Follow-up source audit

- The consent text no longer names specific downstream providers that this
  client cannot verify. It states that Expert AI's Gateway may use models and
  other services required by requested features; the published policy still
  needs an owner-reviewed iOS provider and retention inventory.
- Hardened the shared trial/sign-in persistence path: native in-memory auth
  state is published only after SecureStore succeeds. The `/auth/trial`
  response is validated for the nonce, expiry, and browser URL when required,
  so an incomplete Gateway reply returns a clear error rather than failing
  later in the polling flow. The trial flow still requires live Gateway and
  device verification; the user's previous iOS test reported that this button
  did not complete successfully.
- `npx tsc --noEmit`, `npx expo lint`, `git -c core.whitespace=cr-at-eol diff
  HEAD --check`, and the no-Android-path diff check pass for this follow-up.
- The follow-up source changes are included in pushed commit `62d4814`.
  No build has been started. The local-test Google OAuth variable, Gateway
  trial behavior, and device acceptance remain release gates.

### Trial and task follow-up — 15 November 2026

- Compared `lib/auth.ts` in the APK repository (`expert-terminal/expert-ai-mobile`)
  with this iOS checkout. The Gateway trial flow has the same `/auth/trial` →
  `/auth/poll` contract in both clients; the iOS-specific change is to publish
  the session only after Keychain/SecureStore persistence succeeds and to
  validate the trial start response. This source comparison cannot establish
  that the deployed Gateway currently satisfies that contract.
- A read-only request to `https://api.ssv.asia/openapi.json` returned HTTP 404;
  the Gateway exposes no contract at that path. No live trial account was
  created. The user's report that trial did not complete remains unverified
  against the deployed route and needs device/Gateway evidence.
- Re-reviewed iOS scheduled-job submission, idempotent recovery, task row
  association, retries, and local due reminders. The client marks empty durable
  completions as failed and preserves retry/restart paths. This cannot fix or
  prove upstream model generation or APNs delivery; no failing job ID or device
  notification trace was available in this audit.
- Added iOS-only trial-start progress feedback and an in-flight guard against
  duplicate taps creating multiple synthetic trial identities. Android trial
  button rendering and request behavior remain unchanged. TypeScript, Expo lint,
  whitespace, and no-Android-path checks pass for the local change; it has not
  yet been built or exercised on an iPhone.
- Fixed iOS durable-job reconciliation for Gateway `404` and expired nonterminal
  job records. These were retained in the local outbox indefinitely and could
  leave a restored response/task linked to a job the Gateway no longer had.
  iOS now settles the message as retryable, clears active poll/control state,
  writes failure history, and unlinks affected scheduled tasks while retaining
  their local reminder and conversation so Play can start a fresh run. If local
  task storage fails, the recovery intent is requeued. Terminal reconciliation
  also cancels a competing foreground poll to prevent stale controls and
  duplicate terminal notifications. When a bounded foreground poll ends with
  work still active, iOS now releases the finished poll handle but retains the
  job association and queued UI so Stop/Pause still control the Gateway job.
  Android behavior is gated unchanged.
- The durable-job recovery changes pass `npx tsc --noEmit`, `npx expo lint`,
  whitespace checks, and the no-Android-path diff check. No iOS native build,
  Gateway job replay, or physical-device notification test has verified them.
- Account and commerce audit confirms that iOS currently shows an explicit
  “Plan purchases and subscription restore are not available” message. The
  repository contains Google Play verification only (`verifyGooglePlaySubscription`);
  it has no StoreKit purchase implementation or Apple transaction-validation
  Gateway method. This is a public-release gap, not a client-only button fix.
  Apple’s current [3.1.1/3.1.2 and 3.1.3(b) rules](https://developer.apple.com/app-store/review/guidelines/)
  generally require IAP for digital subscriptions/features and require a
  multiplatform service to offer IAP in the app when it also lets users access
  purchases from other platforms. Region-specific entitlements may change the
  allowed purchase flow; owner/App Store Connect configuration is required.
- The same current Apple guideline page says an app using Google as a primary
  sign-in option must offer an equivalent qualifying privacy-preserving login
  unless an enumerated exception applies. The app is not email-only, so Apple
  sign-in remains a submission gate; Gateway identity-token validation is not
  present in this client contract.

The owner confirmed that this local-test repository is the iOS edit/build target
and the organization repository is the APK codebase. The APK repository was
reviewed read-only for parity; it was not modified. Future Android sessions can
use this iOS repository as a behavioral reference.

- Latest pushed iOS commit before this follow-up: `76c3686` on
  `codex/ios-platform-fixes-20261114`. The reviewed continuation changes are
  committed and pushed.
- This continuation makes iOS archive, project, document, and automation-recipe
  file snapshots recoverable through primary, backup, and completed temporary
  JSON files; it serializes read-modify-write operations to prevent concurrent
  edits from overwriting each other. Recipe load/save/delete errors are shown
  on iOS. Android persistence behavior is preserved in the shared files.
- Account deletion now avoids automatic retry on iOS because a timed-out
  destructive POST may already have succeeded. Android retains its previous
  retry count.
- The APK's `app/simple-chat.tsx` was fetched from the private organization repo
  through read-only GitHub access. It also executes Gateway tool calls through
  generic `/mcp` and handles only `daily_note` locally. That source contains no
  client-side scheduling tool name/schema; the deployed Gateway scheduling
  contract and local task-list synchronization remain unverified.
- `npx tsc --noEmit`, `npx expo lint`, whitespace checks, and the no-Android-path
  diff check pass for the current local edits. No native build or physical
  device run has tested these changes.
- GitHub reports the selected local-test repository as public. The user has
  confirmed it as the iOS target; do not commit secrets or signing material.
  The local `gh` token is invalid. The IPA workflow is still
  `workflow_dispatch`-only, requires repository variable
  `EXPO_PUBLIC_GOOGLE_IOS_LOCALTEST_CLIENT_ID`, and its presence could not be
  verified through the connected GitHub read-only tools. A path-only scan found
  no common GitHub/AWS/private-key/Expo/Sentry credential formats and no tracked
  `.env` or signing-certificate files; a generic scanner hit in Yarn's bundled
  release code was excluded as a false positive.
- GitHub Actions history currently ends at run 8 for old commit
  `87cf3614682153b642ffe816463959f026e0cc78` (cancelled during CocoaPods) and
  run 7 for older commit `1431940213382abc3616182c7c8f810c8d084362` (successful
  IPA upload). There is no run for `6ae9df3`; no build is active or pending.
- No build is running. No IPA for current source exists. Remaining external
  requirements include the real Google iOS OAuth registration/configuration,
  Gateway Apple identity-token validation before an Apple sign-in client can be
  safely added, the iOS-complete privacy/provider-retention policy, and
  physical-device acceptance for notifications, task scheduling, auth, archives,
  share extension, keyboard, and iPad layouts.

### Production bundle, local notes, and App Store build path — 20 November 2026

- The owner registered the production App ID `com.ssvasia.expertai` and updated
  the Google iOS OAuth client for this bundle. The production Expo config now
  generates app ID `com.ssvasia.expertai`, share extension ID
  `com.ssvasia.expertai.share-extension`, app group
  `group.com.ssvasia.expertai`, production APNs entitlement, and the reversed
  Google OAuth callback scheme. The local-test ID is no longer used on push
  builds.
- iOS chat uses the same `{model, messages, stream}` request shape as the APK;
  the Gateway injects its tool schemas server-side. The app handles returned
  `daily_note` calls on-device against local note storage and returns the result
  for the model's follow-up. `/note` remains Gateway-owned and the client does
  not send a tool list or parse slash commands. Verify that the deployed Gateway
  emits `daily_note` and run read/list/append/replace on device.
- Fixed two reported iOS UI issues: trial start dismisses the sign-in Modal
  before presenting the separate terms Modal, and the note editor removes its
  safe-area spacer while the iOS keyboard is visible so the toolbar sits above
  the keyboard. Android paths remain unchanged. TypeScript and ESLint checks
  pass; these interactions still need a device build and acceptance.
- Added `.github/workflows/ios-production-build.yml` for unsigned production
  bundle compile/package validation on GitHub `xcode-27`. Added
  `.github/workflows/ios-app-store-signed.yml` for Xcode automatic distribution
  signing authenticated with an App Store Connect team API key. It produces a
  signed IPA artifact; App Store Connect upload, TestFlight setup, and listing
  metadata are not automated by this workflow.
- First production CI run `44652059778` (commit `5a60133`) passed Expo prebuild,
  OAuth/bundle/capability checks, and CocoaPods installation, then failed at
  Xcode build because several third-party Pod targets were below Xcode 27's
  minimum supported iOS deployment target. Added an iOS Podfile config plugin
  to raise only outdated Pod targets to the app's iOS 16.0 minimum. Rebuild the
  next commit and keep this failure/result in the release record.
- The generated `ios/ExpertAI.xcodeproj` exists after Expo prebuild. The
  `ios/ExpertAI.xcworkspace` is generated only after `pod install`; CocoaPods is
  not installed on this Mac. Local Xcode 15.2 cannot build the current App Store
  SDK target. GitHub Xcode 27 is the build route.
- The owner-provided App Store Connect Team API key is now stored in GitHub
  Actions secrets under `APP_STORE_CONNECT_KEY_ID`,
  `APP_STORE_CONNECT_ISSUER_ID`, and `APP_STORE_CONNECT_PRIVATE_KEY`; the key
  was validated locally without exposing its contents. `APPLE_TEAM_ID` is still
  needed as a repository variable, and draft PR #1 must be merged before GitHub
  can dispatch the signed workflow from `main`. Xcode can manage distribution
  signing automatically; a hand-created Apple Distribution certificate/profile
  is not needed for that workflow. The production App ID and group must have
  App Groups, Push Notifications, and Associated Domains configured; automatic signing must
  provision both app and extension targets.
- Archive release blockers remain: validate production Google login, resolve
  the Sign in with Apple/Guideline 4.8 contract, implement StoreKit if paid
  digital access is offered in iOS, reconcile privacy/data-retention policy,
  verify deletion, prepare App Store listing/screenshots/reviewer access, create
  the App Store Connect record, and complete physical iPhone/iPad acceptance.
  A production Xcode compile and unsigned IPA have completed; no signed IPA has
  completed yet.

## Verified Gateway-parity production build — 20 November 2026

- Source SHA `f60357bcf1cda4e02e1d3124fd740bd6d85ae783` removes the client
  `tools` list from iOS Gateway chat requests, matching the APK contract and
  leaving full tool injection to the Gateway. The app still executes returned
  `daily_note` calls locally.
- GitHub Actions run
  [44657768664](https://github.com/ssv-asia/expert-ai-ios-localtest-temporary/actions/runs/44657768664)
  completed successfully. Artifact `ExpertAI-production-unsigned`, ID
  `14595111498`, expires 27 November 2026; artifact digest
  `sha256:2ae55c102c5e5a9722f03525ae8d4f0f5fd864e19dbe5add660b89ebe92402ef`.
- Downloaded IPA SHA-256:
  `2ebe7cd9befb7a3334b8b65978120b72745c6916dd08c272f639c10cb3516775`.
  ZIP integrity passed. Bundle IDs are `com.ssvasia.expertai` and
  `com.ssvasia.expertai.share-extension` (version 1.5.3, build 1).
- The artifact is unsigned, has no embedded provisioning profile or code
  signature, and cannot be installed normally or submitted to App Store Connect.
  The signed workflow still requires the owner's App Store Connect API key and
  team ID as GitHub Actions configuration. Run 44660079330 was dispatched as a
  replacement while the above build appeared stalled; it is redundant now that
  run 44657768664 succeeded.
- The unsigned workflow's push trigger now skips documentation-only and
  workflow-file-only updates, avoiding expensive native compiles for handoff
  changes. Use its manual dispatch only when an unsigned compile is useful.
