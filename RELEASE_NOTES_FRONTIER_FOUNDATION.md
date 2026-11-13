# Expert AI Android — Frontier Foundation

## Included

## Version 42 / 1.3.8

- Stabilized foreground streaming and voice handoff, including stale callback fencing and partial-response recovery.
- Added accurate served-model attribution for live and durable responses, plus retry-generation fencing in the gateway.
- Improved daily-note navigation with a larger calendar, safer date creation confirmation, better placement, and refreshed visual treatment.
- Made workflow saves discoverable through Settings and hardened biometric lock state transitions.


- Durable, retryable generation jobs that survive app backgrounding and relaunch.
- Independent concurrent chat streams with conversation-scoped cancellation and serialized checkpoints.
- Scheduled jobs backed by the gateway job system.
- Account-console **Restore purchases** action that refreshes entitlement and quota state.
- Gateway sessions extended to 30 days while preserving immediate epoch-based revocation.
- Safer constant-time session signature validation.
- Lightweight thumbs-up/thumbs-down response feedback that never blocks chat delivery.
- Offline feedback outbox with bounded local retry on launch and foreground.
- Daily-note editor redesign with keyboard-safe scrolling, save state, and serialized persistence.
- Serialized persistence for scheduled tasks, projects, archives, saved documents, and active document editing.
- User-facing pause/resume control for durable background responses.
- Agent lifecycle surface for connecting, planning, tool execution, synthesis,
  reconnecting, pause, completion, and failure states.
- Conversation-scoped agent tool timeline with result status and duration.
- Cancellable, bounded MCP tool execution and collision-safe JSON-RPC request IDs.
- Served-model route attribution persisted with local conversation history.
- `/task` Agent Task mode for plans, sequential tool use, verification, and a
  completed/remaining checklist.
- `/research` Research Brief mode for source comparison, uncertainty, freshness,
  and cited conclusions.
- Structured response modes for checklists, memos, tables, and study guides.
- Actionable background-job inbox with retry for failed durable jobs.
- Explicit dead-letter handling after the gateway retry budget is exhausted;
  exhausted scheduled work is shown as a retry-limit state rather than an
  endlessly recoverable failure.
- Bounded local durable-job history for completed, failed, cancelled, and
  dead-lettered work, surfaced from the background-work status panel.
- Pause/resume workflow fencing and explicit retryability metadata from the
  gateway, preventing stale writes and unsafe retry loops.
- Gateway health diagnostics with startup self-check and safe support report.
- Explicit `/verify`, `/critique`, `/meeting`, and `/executive` workflows.
- Explicit `/doc`, `/nodoc`, `/fresh`, and `/recent N` context scopes.
- Personal memory review, editing, and destructive clear controls.
- Conversation branching and one-time MCP approval prompts for consequential tools.
- User-visible route reason labels for speed, depth, live data, privacy, or balanced routing.

## Verification

- `npx tsc --noEmit`
- `npx expo export --platform web`
- Local Android release build passed with the repository JDK 17 recipe.
- Final v42 AAB: `release-artifacts/v42/expert-ai-v42.aab` (versionCode 42, versionName 1.3.8, 99,223,149 bytes).
- SHA-256: `76243CD09DACC0AA7128391BB10A5A0BBE49EF7A18DBA2318EA6F9AC2D922029`.
- Final signed artifact: `release-artifacts/v36/expert-ai-v36.aab` (versionCode 36, 99,217,872 bytes).
- SHA-256: `9d0511ba72084f1d76483cf36d1fc81f1af25b07f0f5d06dc7344131fad115e3`.
- Version 48 includes the composer context-budget estimate and the
  corrected gateway health-check timeout options.
- Version 48 additionally preserves the durable job ID through notification
  taps and performs targeted reconciliation when opening a completed response.
- Version 49 adds the guarded “Prepare desktop handoff” action and mobile
  invite/consume API methods.
- Version 50 shows the Job ID alongside the copied invitation so the desktop
  importer can validate and inspect the exact durable run.
- Version 35 is the final Play-facing version code; the earlier 51 was only an
  internal iteration label and is not used for this release.
- The final build includes the biometric lock enablement fix: protected modes
  require a successful Face/Fingerprint verification before being saved.

## Source

- Mobile source/build commits: `034507e` (structured gateway request IDs), `444ed5f` (gateway correlation capture), `9438524` (job-intent recovery), `1e06b8a` (notification tap recovery), `d7673b5` (session resilience), `6622a4c` (notification isolation), `c23b13d` (dead-letter state), `630cf33` (biometric lock)
- Gateway source commit: `5d6bede4-914d-4d6d-87e3-5ceb07c70f6c` (deployed build identifier)
- Gateway documentation commit: `5ba26e3`
- Gateway deployed versions include pause fencing and retryability metadata.
- Durable job reconciliation now consumes the gateway's persisted agent phase,
  so relaunches can show thinking, tool use, or synthesis instead of a generic
  loading state. Source commit: `c5993f0` (gateway contract: `c842da0`).
- Background-work status now displays the persisted agent phase directly,
  including queued, thinking, tool use, synthesis, and retry states. Source
  commit: `5936c2b`.
- Daily-note editing now uses platform-safe keyboard avoidance so the
  multiline editor and formatting toolbar remain accessible above the keyboard.
  Source commit: `c45c980`.
- Play-facing versionCode is now 36 / versionName 1.3.2. Source commit:
  `e76c377`.

## Explicitly deferred

## v37 reliability patch (2026-09-22)

- Mobile versionCode 37 / versionName 1.3.3. The local production AAB now accepts complete OpenAI-compatible fallback envelopes (`message.content`/legacy `text`) so valid answers are not shown as empty durable-job failures.
- Gateway deployed version `f771cd30-7a09-4988-8363-b515e1ecfbf7`; the same envelope fix is committed as `ce8341e`. Existing first-three-turn Nitro-fast routing is preserved.
- AAB: `release-artifacts/v37/expert-ai-v37.aab`, SHA-256 `5d04134a23643388936c6974bc6fb4c3131f5aa6d015c78ade2514d052402f71`, size 99,218,241 bytes.
- Post-v37 gateway hardening: complete upstream choices and unterminated final SSE frames are now consumed before durable jobs are classified as empty. Gateway commit `8da1e96`, deployment `e915e8ee-187f-4cee-aa79-9c472554b218`. The matching mobile parser is staged for v38 in commit `6d445bf`.

## v38 recovery release (2026-09-22)

- VersionCode 38 / versionName 1.3.4. Empty foreground completions now enter the existing retry path instead of being treated as successful blank responses.
- Greetings and short early questions remain foreground-only; durable/background status is reserved for deeper or substantial work. Empty-chat context usage and background cards are hidden until a conversation actually begins.
- Local AAB: `release-artifacts/v38/expert-ai-v38.aab`, SHA-256 `0048de3c232990e8e44af6cf89fee54f6fc4834366a240894244607bee3a03b8`, size 99,218,440 bytes. Source commits: `d71efb8`, `bdfdbff`, and metadata alignment `7623dc5`.

## v39 verified recovery release (2026-09-22)

- VersionCode 39 / versionName 1.3.5. This is the next Play-uploadable release after v38; no duplicate version code is being reused.
- Local AAB: `release-artifacts/v39/expert-ai-v39.aab`, SHA-256 `3026b1f3d103fc1b13831d853244124e70d3c4747736077afa05adfd6f5dbbd0`, size 99,218,450 bytes.

## v40 basic-chat recovery release (2026-09-22)

- VersionCode 40 / versionName 1.3.6. Ordinary chat now uses the foreground stream; durable jobs are only entered for explicit `/task` or `/research` agentic requests and scheduled work.
- Failed historical background jobs no longer create a persistent status card in normal chat. Context display is `Context estimate 0% / 1,000,000 tokens` and does not mention gateway internals.
- Local AAB: `release-artifacts/v40/expert-ai-v40.aab`, SHA-256 `00b104576f04966c6fcc2d3236d90fa1a64665f5242532edcda19888be1a6e85`, size 99,219,271 bytes.

## v41 daily-notes and stream-stability release (2026-09-22)

- VersionCode 41 / versionName 1.3.7. The centered composer status now shows `Context · 1M tokens` only after a conversation begins, with improved spacing above the toolbar.
- Terminal stream completion is fenced against late SSE/network callbacks, preventing a valid answer from later changing to “Couldn’t get a response”.
- Daily-note editor saves, chat appends, date creation, and deletes now share a serialized storage path; Save to Note verifies the persisted text and refreshes the note view. Added a current-month date picker to open or create notes for any selected day.
- Local AAB: `release-artifacts/v41/expert-ai-v41.aab`, SHA-256 `c8189b5d7f0ffaf443f328fa30cb3e1719a1721c7c7b6a28f62872387f57c0bd`, size 99,222,445 bytes.

- Direct mobile-to-desktop job handoff, branch comparison/merge, and team
  sharing remain deferred. The tested handoff invitation primitive is not yet
  exposed as a public endpoint because shared desktop identity exchange is not
  complete.
