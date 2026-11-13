# Frontier feature audit

This is the implementation ledger for the next release. A feature is only
marked **shipped** when it has source coverage, a recovery path, and a local
release verification check. Marketing language must stay aligned with what the
product actually does.

## Shipped foundations

1. Durable response jobs that survive app close, relaunch, and connectivity changes.
2. Idempotent sends so retrying does not duplicate a paid request.
3. Pause/resume controls for durable work.
4. Multi-chat streaming with independent connection state.
5. Agent activity status derived from the live stream: connecting, planning,
   tool work, synthesis, and completion.
6. Grounding disclosure and a compact tool timeline showing actual tool names,
   result state, and duration.
7. Background response reconciliation on foreground and relaunch.
8. Bounded automatic retry with an honest queued state.
9. Offline feedback outbox with serialized writes.
10. Daily notes with a real keyboard-safe, scrollable editor.
11. Restore Purchases in the account console.
12. Long-lived signed sessions with explicit sign-out.
13. Save answers to notes/documents and targeted document edits.
14. Scheduled tasks backed by durable jobs.
15. Voice input, image input, QR-connected agent mode, and chat search.
16. Bounded, cancellable tool execution so a stalled enrichment call cannot
    deadlock the assistant response.
17. Served-route attribution showing which upstream model answered a live turn,
    with a client-visible routing reason.
18. Research Brief mode via `/research`, using existing live tools to compare
    sources, state uncertainty, and produce a cited conclusion.
Agent Task mode via `/task` for explicit plans, sequential tool work, verification,
and a completed/remaining checklist.
Failed durable jobs are retryable directly from the background-work status surface.
Structured output prefixes (`/checklist`, `/memo`, `/table`, `/study`) provide
repeatable professional formats without adding a model or dependency.
Verification mode (`/verify`) requests live checking, source freshness labels,
assumptions, calibrated confidence, and a clear recheck recommendation.
Critique mode (`/critique`) challenges drafts and answers for assumptions,
counterarguments, evidence gaps, risks, and prioritized improvements. Meeting
brief (`/meeting`) and executive summary (`/executive`) formats are also
available for professional workflows.

## Product differentiators to implement and verify before the final AAB

19. Agent run timeline: expandable step history with tool name, duration,
    result state, retry, and cancellation controls.
20. “Leave it running” inbox: a single surface for completed, failed, paused,
    and waiting-for-user jobs.
21. One-tap handoff: continue a mobile run on the paired desktop agent without
    losing conversation or job identity.
22. Research brief mode: search, compare sources, identify uncertainty, and
    produce a cited brief instead of an opaque paragraph.
23. Source freshness labels and a “verify again” action for time-sensitive answers.
24. Answer actions: save to daily note, create task, schedule follow-up, export,
    and commit a document edit.
25. Structured output modes for checklist, decision memo, table, study guide,
    meeting brief, and executive summary.
26. User-visible model routing reason: speed, depth, live-data, or privacy mode.
27. Context controls: include/exclude document, recent chat, notes, and memory
    per request, with a compact context budget indicator.
28. Memory review and deletion controls with clear provenance for each fact.
29. Conversation branching: try an alternative answer without destroying the
    original path, then compare or merge branches.
30. Reliable long-form generation with checkpointed partial output and resume.
31. Safe tool permissions: read-only, write-to-document, external-action scopes,
    and an approval gate before consequential actions.
32. Personal automation recipes: turn a successful run into a reusable task.
33. Team-ready workspace sharing with least-privilege project access.
34. Quality controls: cite sources, ask for confidence/assumptions, and request
    a critique before accepting an answer.
35. Accessibility polish: screen-reader status announcements, large text-safe
    layouts, reduced motion, and haptic preferences.
36. Cost and quota transparency: show whether a retry is charged and why a
    route/model was selected.
37. Privacy controls: incognito chats, local retention controls, export, and
    account deletion remain easy to find.
38. Release health: startup self-check, gateway health classification, and a
   user-safe diagnostic bundle that excludes message content and secrets.

**Status update:** Item 38 is now shipped for the user-facing diagnostic path:
the gateway exposes a dependency-free `/health` contract, Settings shows
operational/degraded/unreachable state with a manual recheck, and users can copy
a redacted diagnostic report containing no message content, tokens, or secrets.
The app also performs a non-blocking startup self-check and records a redacted
gateway breadcrumb for support; rollback is removing the settings surface,
startup check, and `/health` route, with no data migration required.

Item 26 now has a user-visible first version: completed replies show the served
route plus an understandable reason (speed, depth, live data, privacy, or
balanced routing), derived from the actual served model and tool usage. A future
gateway-provided reason can replace the heuristic without changing the UI.

Items 23 and 34 now have a first workflow implementation through `/verify`,
including a one-tap “Verify again” action on the latest assistant response.
Automatic source-date extraction remains planned until the MCP response contract
persists structured citation metadata.

Item 27 now has explicit document context controls: `/doc` forces the open
document into the request and `/nodoc` excludes it, overriding the default
intent heuristic. Recent-chat and memory scopes remain separately planned.
Recent-chat scope is now also explicit: `/fresh` sends only the current turn,
while `/recent N` limits the request to the most recent N exchanges (bounded to
20). The composer labels the active scope before send.

Item 28 now has a user-facing memory review, edit, save, and destructive-clear
surface in Settings. Memory remains bounded by the existing 4,000-character
gateway limit; per-fact provenance labels remain a future data-model upgrade.

Item 31 now has a conservative mobile permission gate: the current allowlist is
read-only, document-like tools are classified as write-to-document, and unknown
or external-action tools fail closed with `approval_required`; the UI now asks
for one-time approval and displays the requested scope before execution.
Existing gateway tools are unchanged.

Item 29 now has a first branch workflow: the Chats surface can duplicate a
conversation into an independent branch with its own id and subsequent edits,
while preserving the original transcript. Compare/merge remains a later
enhancement.

Item 24 now includes a direct “Schedule follow-up” answer action that opens the
durable scheduled-task flow prefilled from the selected response. It remains
subject to the existing review-before-schedule step.

Item 32 now has a device-local recipe workflow: save an assistant response as a
bounded reusable recipe, review/delete it in Settings, and run it back into the
composer. Recipes intentionally remain local until a synced/team recipe model
is designed.

The composer now shows a lightweight context-budget estimate before send. It is
explicitly labelled as an estimate and leaves final enforcement to the gateway,
but gives long-running agent and research requests an early warning rather than
silently surprising the user with truncation.

Desktop handoff now has a guarded end-to-end slice: mobile requests a short-lived
gateway invitation for an active durable job; the paired desktop consumes it for
the same authenticated owner, inspects the durable state, and can continue the
imported result through an existing local Pi agent session. The continuation
requires an explicit local session ID and instruction, never copies the
invitation token into the local prompt, and does not claim to transfer an
unavailable transcript stream.

## Explicit deferrals for this phase

- **One-tap desktop handoff (21):** the authenticated invite/consume protocol
  and guarded desktop continuation are implemented. A fully automatic session
  selection and live transcript migration remain deferred because the gateway
  job and local Pi session are distinct authorities. User impact: the user
  supplies the destination session and continuation instruction.
- **Source recheck action (23):** deferred because the current MCP response
  contract does not persist source identifiers/freshness metadata. User impact:
  `/verify` still requests freshness and a recheck recommendation, but cannot
  perform a one-tap replay. Rollback: no migration; add structured citations to
  the response schema later.
- **Branch compare/merge (29):** deferred because branches are device-local
  transcripts and do not yet carry a structured diff/ancestry model. User
  impact: branches can be explored independently, but not merged automatically.
  Rollback: branch copies remain valid and can be deleted independently.
- **Team sharing (33):** deferred to avoid inventing a shared-data authority or
  adding paid storage/bindings on the Cloudflare free plan. User impact: sharing
  remains explicit export/share-sheet behavior. Rollback: no shared data has
  been created.

These deferrals are intentional phase boundaries, not claims of completion.

## Acceptance rule

The final AAB is not ready until each item above is either shipped with a
verification note or explicitly deferred with the reason, user impact, and
rollback plan. This prevents a visually impressive build from hiding an
unrecoverable workflow or an untestable claim.
