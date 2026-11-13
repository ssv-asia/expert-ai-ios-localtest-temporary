# CLAUDE.md — Expert AI APK (expert-ai)

**Accepted release baseline:** Version 34 / 1.3.1 is the verified official baseline.
Read `STABLE-RELEASE-BASELINE-V34.md` before changing keyboard behavior, release
configuration, authentication transport, or GitHub archive operations. The full
cross-session handoff is maintained at:
`C:\Users\Win 11\Documents\Obsidian Vaults\archive.ssv.asia\ssv\web\Expert AI\APK\CURRENT-STABLE-BASELINE-V34.md`.

This file is the authoritative orientation doc for Claude Code sessions working in this
repo. Read it before making changes. It exists because this codebase has **two parallel
UIs that look similar but are entirely separate code paths** — the single most common
source of wasted work in this project is fixing the wrong one.

Project root: `C:\expert-ai-apk\expert-ai`
Package name: `expert-ai` (Expo Router app, yarn workspaces monorepo)

## 0. THE #0 RULE: Two SEPARATE PROJECT FOLDERS. Know which one you're in.

`C:\expert-ai-apk\` contains multiple sibling project folders that are easy to confuse:

- **`C:\expert-ai-apk\pico-upstream`** (package name `pi-ui`) — the **development /
  testing build**. This is where active feature development and bug-fixing happens.
  **Do not modify this folder unless explicitly asked to.**
- **`C:\expert-ai-apk\expert-ai`** (package name `expert-ai`, this repo) — a **copied
  and rebranded fork of `pico-upstream`**, created specifically as the **Google Play
  Store submission build**. It is intended to be fully compliant with Play Store
  requirements (see §8) and is the artifact that actually gets built into an APK/AAB
  for release and testing before submission.
- **`C:\expert-ai-apk\pocket-pi-upstream`** — a third sibling folder in the same parent
  directory; not otherwise documented here yet. Do not assume it's interchangeable with
  either of the above.

Because `expert-ai` was created by copying `pico-upstream` at some point in the past and
then rebranding it, **the two folders can drift out of sync** — a fix made in one does
not automatically exist in the other. When asked to build, test, or fix "the app" for
Play Store purposes, work in `expert-ai`. When asked to iterate on a feature under
active development (not yet ready for release), confirm which folder the user means
before touching anything — do not assume.

**Known state (2026-08-26):** `expert-ai`'s `node_modules` was missing entirely (never
`yarn install`ed after the copy/rebrand), which is why Android Studio/Gradle failed to
find `com.facebook.react.settings` — that plugin is loaded from
`node_modules/@react-native/gradle-plugin` via `includeBuild` in
[android/settings.gradle](android/settings.gradle), so a missing `node_modules` makes
the plugin lookup fail outright. `pico-upstream`'s `node_modules` was present and intact.
This is an environment/setup gap from the copy, not a code bug — running `yarn install`
in `expert-ai` (with corepack providing the pinned `yarn@4.9.2`) resolves it.

---

A mirrored, human-readable copy of this file is kept at:
`C:\Users\Win 11\Documents\Obsidian Vaults\archive.ssv.asia\ssv\dom\Expert AI\APK\Development Documents\CLAUDE.md`
**Whenever this file changes, update that copy too, and vice versa.** Treat the two as
one document with two save locations, not two documents.

---

## 1. THE #1 RULE: Two UIs. Know which one you're touching.

This app ships two independent chat experiences. They share almost no code. Before
editing anything chat-related, **confirm which UI the user is actually using** —
ask if unclear, or check which screen is reachable from the app's default entry route.

### Chat mode (the primary, default UI — most user reports are about this one)
- Entry screen: [app/simple-chat.tsx](app/simple-chat.tsx) — this is the Expo Router
  **anchor route** (`anchor: "simple-chat"` in `app/_layout.tsx`), i.e. what the app
  opens to by default.
- Markdown rendering: [lib/markdown-renderer.tsx](lib/markdown-renderer.tsx)
  (`LowDataRenderer` / `lowDataMarkdownRenderer`), used via the **stock** `useMarkdown`
  hook from `react-native-marked`.
- LLM streaming: [lib/gateway-client.ts](lib/gateway-client.ts) —
  `streamChatCompletion()`.
- MCP tool execution: [lib/mcp-tool-executor.ts](lib/mcp-tool-executor.ts) —
  `executeMcpToolOnGateway()`.
- AEC keyword routing + settings state: [lib/aec-knowledge-service.ts](lib/aec-knowledge-service.ts),
  [components/aec-knowledge-section.tsx](components/aec-knowledge-section.tsx).
- Settings sheet: [components/simple-chat-settings.tsx](components/simple-chat-settings.tsx).

### Agent mode ("Pico workspace" — reached via the top-bar Chat/Agent switch)
- Entry screens: `app/(app)/servers`, `app/(app)/workspace/[workspaceId]/...`,
  `app/(app)/chat/[sessionId].tsx`.
- Speaks to the real Pico backend (`packages/pi-client`, Rust `backend/`), not the
  Cloudflare gateway directly.
- Markdown rendering: [features/agent/hooks/use-stable-markdown.tsx](features/agent/hooks/use-stable-markdown.tsx)
  (`StableRenderer`), used via a custom `useStableMarkdown` hook.
- Message UI: `features/agent/components/message-list/*` (e.g. `assistant-message.tsx`,
  `tool-call.tsx`, `ToolCallGroup`).

**If you fix a rendering/scroll/table bug in one and the user says "still broken,"
the first thing to check is whether you fixed the other one by mistake.** This has
already happened once in this project's history (2026-08-26 session: table-overflow and
scroll-stuck fixes were applied to `features/agent/` while the user was testing
`app/simple-chat.tsx` the whole time — two full rounds of "fixes" had zero effect
because they targeted dead code for that user flow).

---

## 2. Backend architecture

### The gateway (Cloudflare Worker + Durable Objects)
Source lives OUTSIDE this repo, at:
`C:\Users\Win 11\Downloads\deep\expert-ai-gateway-serper\v0.2.0-oauth\worker\src\index.js`

Base URL used by the app: `https://expert-ai-gateway.arthouse.workers.dev`
(`GATEWAY_BASE_URL` in [lib/gateway-client.ts](lib/gateway-client.ts)).

**This is the single gateway for both the LLM (OpenRouter proxy) and MCP (AEC knowledge
base). They are not separate services** — same Worker, same Durable Objects, same
session token. Do not assume a client-side split between "the LLM gateway" and "the MCP
gateway"; there isn't one.

Key endpoints (verify against the actual worker source before relying on any endpoint —
it changes; do not assume a route exists because an old plan/doc mentions it):
- `POST /v1/chat/completions` — OpenAI-compatible chat completions, SSE streaming.
  For the `unlimited` router (the APK's only model), the worker **already injects MCP
  tool schemas server-side** (`tools: mcpToolsFor(env, sess), tool_choice: "auto"`,
  see `worker/src/index.js` ~line 2717). The client does **not** need to fetch or
  declare tool schemas itself — they arrive automatically once signed in.
- `POST /mcp` — JSON-RPC 2.0 MCP endpoint (`tools/list`, `tools/call`, `initialize`,
  `ping`). Auth: standard `Authorization: Bearer <token>` header OR `?k=`/`?token=`
  query param (see `mcpToken()` in the worker) — **the same session token used for
  `/v1/chat/completions` works here too.** No separate MCP-specific token is required
  for the in-app LLM tool-calling path.
- `POST /mcp/me`, `POST /mcp/activate` — per-user MCP link provisioning (used by the
  Settings-tab "Architecture & Construction Wikipedia" feature — a *separate* concern
  from LLM tool-calling; this mints a long-lived personal MCP URL for external clients).
  **Auth (as of 2026-08-26): `Authorization: Bearer <session.token>` header only** — the
  worker derives email + Ghost member `uuid` from the signed token payload itself
  (`readSession`). Do **not** reintroduce a client-supplied `email`/`uuid` JSON body for
  these two routes — that was the original design and it's a dead end (see §5): the
  app's magic-link login (`/auth/start` → `/auth/poll`) never had a Ghost uuid to send in
  the first place, so `verified` could never be true. The uuid now only exists inside the
  session token, minted once at login by `issueSession(env, email, tier, ttlSec, uuid)`.
  A session token issued **before** this change has no uuid claim and will get
  `verified: false, link: null` back — the user must sign out and back in once to get a
  new token.
- `GET /balance` — current-pass-only usage (`used: {foundation, free, pro, opus}`).
  **These counters reset to zero on every new pass/monthly-period start** (see
  `startPass()` in the worker) — they are NOT all-time totals. All-time totals only
  exist via the founder-only `/admin/member` endpoint.
- `POST /admin/*` — founder-only (gated by `ADMIN_SECRET` or a session whose email is
  in `FOUNDER_EMAIL`). Used by the in-app admin console (`lib/admin-client.ts`).

### Known gateway facts worth remembering
- `MCP_TOOLS` includes `aec`, `aec_balance`, `aec_folders`; founder sessions also get
  `SSV_TOOL`. See `mcpToolsFor()` / `mcpCallTool()` in the worker.
- The `unlimited` router streams raw OpenRouter SSE straight through
  (`orResp.body.tee()` piped to the client via `injectNoticeSSE`) — it does **not**
  intercept or pre-process `tool_calls` server-side. Tool-call interception and
  execution is entirely the client's job (see §3).
- 6-hour passes and 30-day monthly subscriptions share the same `used` counters and the
  same zero-on-new-pass behavior — a monthly sub's usage does NOT persist past its own
  30-day window either.

---

## 2.5 Desktop pairing & the relay tunnel (Agent mode phone ↔ PC)

**This spans THREE repos. All three must stay in agreement — a change to the frame
protocol or the QR shape in one breaks the others.**

| Component | Folder | Role |
|---|---|---|
| **APK** (this repo) | `C:\expert-ai-apk\expert-ai` | Phone. Scans the QR, pairs, runs Agent-mode chat against the paired server address. |
| **Agent tray** | `C:\Users\Win 11\Downloads\desktop app\expert-ai-agent` | Electron tray on the PC. Spawns `pi-server.exe` (the real Pico backend, port 5454), generates the QR, holds ONE outbound WebSocket to the relay. See that folder's `CLAUDE.md`. |
| **Relay Worker** | `C:\Users\Win 11\Downloads\Desktop App\expert-ai-link` | Cloudflare Worker at `link.ssv.asia`. Pure rendezvous + HTTP tunnel between phone and desktop. Never talks to pi-server directly. See that folder's `CLAUDE.md`. |

### The QR
`pi://connect?ips=<csv>&port=5454&qr_id=<uuid>&server_id=<uuid>&relay=https://link.ssv.asia/tunnel/<CODE>`

- Parsed by [features/servers/utils/parse-connect-url.ts](features/servers/utils/parse-connect-url.ts).
  A QR with **empty `ips` + a `relay`** is valid and is the normal case.
- **The tray emits a RELAY-ONLY QR (no `ips` at all) whenever its relay socket is
  confirmed registered.** It only falls back to a single LAN IP when the relay is not
  confirmed.

### Why the QR carries no `ips` — the `connect.tsx` trap (⚠️ do not regress)
The app has **two scan entry points** and they behave differently:
- **In-app camera** → [features/servers/components/qr-scanner/index.tsx](features/servers/components/qr-scanner/index.tsx)
  `doPair()` — walks `ips` (4 s timeout each) then falls through to `params.relay`
  (15 s). Has fallback + timeouts. Safe.
- **The phone's native camera / QR app** opens the `pi://` link as an **OS deep link**
  → [app/connect.tsx](app/connect.tsx) `DirectConnectScreen` → `resolveBaseUrl()`
  returns `params.ips[0]` and only uses `params.relay` **when `ips` is empty**
  (`if (!preferredHost && params.relay) return params.relay`). **NO timeout. NO
  fallback.** Any `ips` entry the phone can't reach (AP/client isolation, different
  subnet, firewall) ⇒ `pairWithServer` hangs forever ⇒ permanent "Waiting for CLI
  approval". This was a multi-day debugging sink in Aug 2026.
- `resolveBaseUrl` also **literally prefers an `ips` entry equal to `"localhost"`**
  (`params.ips.find(e => e === "localhost")`) — the tray must never put `localhost` in
  the QR.

**Current mitigation is tray-side (relay-only QR).** The real fix still owed here (needs
an APK rebuild): give `DirectConnectScreen` a bounded timeout on the LAN attempt and a
relay fallback, so a stale LAN IP can never hang it. Until then, keep the tray's
relay-only behaviour intact.

### Pairing request
`POST {base}/api/auth/pair` body `{ "qr_id": "<uuid>" }` — `base` is either the relay
tunnel URL or `http://<lan-ip>:5454`. pi-server prints a `PAIRING REQUEST` box and the
tray auto-approves it in ~500 ms via a pre-armed `y\n` on pi-server's stdin (no human
action). Response: `{ access_token, refresh_token, ... }`.

### The relay tunnel frame protocol (Worker DO ↔ tray desktop WS)
Phone HTTP → `link.ssv.asia/tunnel/<CODE>/<path>` → Worker → `tunnel_request` frame to
the desktop `{ id, method, path, headers, body, stream: true }`. Desktop answers with
**one of two shapes**:
- **one-shot** (bounded body — has `Content-Length`): `{ type:"tunnel_response", id, status, headers, body }`
  — used for pairing, `/api/auth/session`, workspace list, etc.
- **streaming** (SSE `text/event-stream`, or chunked, or no `Content-Length`):
  `{ type:"tunnel_head", id, status, headers }` → N × `{ type:"tunnel_chunk", id, data:<base64> }`
  → `{ type:"tunnel_end", id }` (or `{ type:"tunnel_error", id, message }`).
  — this is what makes **Agent-mode chat SSE work over the relay** (added Aug 2026;
  before it, the tunnel buffered and hit a 15 s cap, so no token ever arrived).

Client side, nothing special is needed: `res.json()` / `EventSource` see a normal
response either way. But **do not assume** the live session can use a WebSocket through
the relay — the tunnel is HTTP request/response + SSE streaming only. If a future
pi-server feature needs a phone↔desktop WebSocket, it must go over the `/pair/ws`
message channel, not `/tunnel/`.

### If Agent chat shows a red "Retrying" bar after pairing
The saved server address is the relay tunnel URL and the SSE stream isn't getting
through. Check, in order: tray terminal shows `[relay] registration confirmed`; the QR
was `mode: RELAY-ONLY`; the phone re-scanned a fresh QR after the tray restarted (old
cached address); the relay Worker is the deployed streaming version (frame types
`tunnel_head`/`tunnel_chunk`/`tunnel_end` in its source).

---

## 3. Account deletion (Google Play compliance feature)

**Implementation status:** ✅ In-app button added, ⏳ backend endpoint pending.

### Client-side (in-app)
- File: [app/(app)/settings.tsx](app/(app)/settings.tsx)
- UI: "Delete Account" button in Settings → Data section (red destructive styling)
- Handler: `handleDeleteAccount()` — shows confirmation alert, POSTs to `/account/delete` with bearer token
- Endpoint called: `${process.env.EXPO_PUBLIC_API_URL}/account/delete`
- Expected response: `200 OK` on success; client shows "Account Deleted" confirmation
- On success: clears local settings (theme, notifications) and redirects to login

### Web-based deletion (no app required)
- URL: `https://ssv.asia/account-deletion/` (to be hosted on ssv.asia)
- Flow: email → verification code → confirmation → backend deletion
- Endpoint called: same `/account/delete` backend handler as in-app (or a variant accepting email + verification code)
- Response: confirmation page showing deletion completed

### Backend implementation needed
- Endpoint: `POST /account/delete`
- Input: `Authorization: Bearer <session.token>` header (or email + verification code for web flow)
- Action: delete all user data from backend (workspaces, sessions, usage records)
- Response: `{ ok: true }` on success
- Note: "Deletion" per privacy policy means removal within 30 days; backups may retain data up to 90 days

---

## 4. MCP tool-calling flow (client-side, "Option A" pattern)

Implemented across three files — do not reintroduce the old broken pattern (see §6).

1. **`streamChatCompletion`** ([lib/gateway-client.ts](lib/gateway-client.ts)) parses
   the SSE stream and accumulates `delta.tool_calls` fragments (OpenAI-style: id/name
   arrive once, `arguments` arrives in pieces across multiple chunks, keyed by
   `delta.tool_calls[].index`). When `finish_reason === "tool_calls"`, it calls
   `onToolCalls(toolCalls)` instead of `onDone()`.
2. **`app/simple-chat.tsx`**'s `runCompletion` → inner `runStream()` closure handles
   `onToolCalls`: shows a visible "🔍 Looking that up (...)" status in the bubble,
   executes each tool via `executeMcpToolOnGateway()`, appends the assistant
   tool-call message + `role: "tool"` result messages to history, clears the
   placeholder text, and recurses into `runStream(nextHistory)` for the final answer.
3. **`lib/mcp-tool-executor.ts`**'s `executeMcpToolOnGateway(name, args, token)` POSTs
   JSON-RPC 2.0 to `${GATEWAY_BASE_URL}/mcp` with the user's own session bearer token.

Separately, **keyword-based AEC routing** (typing `aec ...` at the start of a message)
bypasses the LLM entirely and queries MCP directly via
`AECKnowledgeService.queryMCP()` in [lib/aec-knowledge-service.ts](lib/aec-knowledge-service.ts),
using the user's *personal* MCP link (from Settings → "Architecture & Construction
Wikipedia" → Enable). This is a different, independent code path from the LLM
tool-calling flow above — both can be active at once, and both are correct as
designed. Don't conflate them when debugging.

---

## 4. Enforced conventions (read before writing code here)

- **Never fetch or declare MCP tool schemas client-side for the `unlimited` router** —
  the gateway already injects them. Re-adding client-side schema fetching is the exact
  mistake made and reverted earlier in this project (calling nonexistent
  `/mcp/tools/list` / `/mcp/tools/call` REST routes — see §6).
- **Any tool-calling UI change must include a visible status update in the message
  bubble.** A silent `console.log` during tool execution is not acceptable — the user
  cannot see console output in a built APK. Match the existing pattern
  (`🔍 Querying...` / `🔍 Looking that up...`).
- **When streaming text into a message bubble via `flushPending`, remember it
  *appends* to `m.text`.** If you change what a bubble should show (e.g. clearing a
  placeholder before a new phase of streaming begins), you must explicitly reset both
  the local `fullText` accumulator AND the message's `text` field — appending onto a
  stale placeholder produces glued-together garbage text. This is a recurring class of
  bug in this file; check for it any time you touch `runCompletion`.
- **Table/markdown rendering fixes belong in [lib/markdown-renderer.tsx](lib/markdown-renderer.tsx)
  for Chat mode.** Do not assume `react-native-marked`'s default `Renderer.table()` or
  `getTableWidthArr()` behave sanely — they don't (see §6 pitfall list). Any override
  must compute column width from the *actual* available render width (see the
  padding-chain comment in that file: FlatList content padding → bubble's `maxWidth`
  percentage → bubble's own internal padding), never from raw
  `Dimensions.get('window').width`.
- **`FlatList`s that sit above a composer/input row in a flex column must have an
  explicit `style={{ flex: 1 }}`.** Omitting it — especially when the parent container
  has an *animated* `paddingBottom` (keyboard avoidance) — causes the list to misjudge
  its own height against sibling elements, producing a "can't scroll to the very end /
  input overlaps the last message" bug that looks like a scroll bug but is a layout bug.
- **Do not add `removeClippedSubviews` to a `FlatList` rendering markdown/variable-height
  content on Android.** It is a known, confirmed source of "scroll gets stuck before the
  real end" symptoms with dynamic content. If a perf optimization is needed, look at
  `windowSize` / `maxToRenderPerBatch` / `initialNumToRender` instead (already tuned in
  `app/simple-chat.tsx`).
- **Settings toggles must reflect the actual local on/off state, not just whether a
  feature was ever provisioned.** `AECKnowledgeState.activated` means "this account has
  ever been granted an MCP link" (permanent, server-side) — it is NOT the same as
  `enabled` (the local per-device switch in `AECKnowledgeService.isEnabled()`/`enable()`/
  `disable()`). A UI that shows "Connected ✓" purely off `activated` will look broken
  the moment a user toggles the switch off.
- **`/balance`'s `used.*` fields are current-period, not all-time.** Do not build an
  "all-time tokens used" display by reading `/balance` — those counters zero out on
  every new pass. If an all-time total is genuinely needed client-side, that requires a
  new gateway endpoint (there isn't one yet as of this writing); summing `/balance`'s
  buckets only ever gives "used in the currently active pass/subscription period."
- **Never assume a gateway endpoint exists because a plan, prior chat message, or a
  stale `.md` doc in this repo describes it.** Verify against the actual worker source
  before wiring a client call to it. Two `.md` files in repo root
  (`IMPLEMENTATION-COMPLETE.md`, `TIER-3-IMPLEMENTATION.md`) describe real, already-built
  features (Tier 1-3: themes, notifications, AEC keyword routing) — they are accurate as
  of their date, but treat any doc as a claim to verify, not a source of truth, since the
  gateway evolves independently of this repo.
- **TypeScript override quirk**: `react-native-marked`'s `Renderer` class declares
  `windowWidth` as `private` in its `.d.ts`, but it's a plain runtime property (no actual
  JS privacy). Subclasses that need to correct it (see `use-stable-markdown.tsx`) must
  go through an `as unknown as { windowWidth: number }` cast — a direct
  `this.windowWidth = ...` assignment fails to compile under this repo's `tsconfig`.

---

## 5. Enforced conventions (read before writing code here)

- **Do not hardcode auth tokens or API URLs in the client.** Use `process.env.EXPO_PUBLIC_*` variables from `.env.local`.
- **Account deletion must delete ALL user data.** Not just deactivation or anonymization — the privacy policy guarantees complete deletion within 30 days. Verify the backend handler actually removes workspaces, sessions, and usage records.

---

## 6. Pitfall log — bugs already found and fixed once; don't reintroduce them

| Bug | Root cause | Fix location |
|---|---|---|
| MCP tool calls silently did nothing | Client called nonexistent `/mcp/tools/list` / `/mcp/tools/call` REST routes instead of the real `POST /mcp` JSON-RPC endpoint | [lib/mcp-tool-executor.ts](lib/mcp-tool-executor.ts) |
| MCP tool calls still did nothing after endpoint fix | Used a second non-streaming fetch to `/v1/chat/completions`, incompatible with the worker's SSE-only pass-through (`orResp.body.tee()` assumes a streaming body) | [lib/gateway-client.ts](lib/gateway-client.ts) — moved to in-stream `delta.tool_calls` accumulation |
| Settings toggle showed "Connected ✓" even when switched off | UI read `state.activated` (permanent provisioning flag) instead of `enabled` (local toggle) | [components/aec-knowledge-section.tsx](components/aec-knowledge-section.tsx) |
| Tool-call execution appeared invisible to the user | No UI feedback during LLM-triggered tool calls (only `console.log`, which isn't visible in a built APK) | `runCompletion` in [app/simple-chat.tsx](app/simple-chat.tsx) |
| Fixing the above caused glued-together text ("🔍 Looking that up...42 credits") | `flushPending` appends to existing `m.text`; placeholder wasn't cleared before the follow-up stream began | `runCompletion` in [app/simple-chat.tsx](app/simple-chat.tsx) |
| Chat scroll "stuck" before reaching the real end, input overlapping last message | `FlatList` above the composer had no explicit `style={{flex:1}}`, combined with parent's *animated* `paddingBottom` for keyboard avoidance | [app/simple-chat.tsx](app/simple-chat.tsx) |
| `removeClippedSubviews` on the chat `FlatList` | Known Android RN bug with variable-height markdown content — miscalculates clipped bounds | Removed in [app/simple-chat.tsx](app/simple-chat.tsx) |
| Tables always overflowed the message bubble, no matter what CSS was applied | Two independent library bugs in `react-native-marked`'s default `table()`: (1) `getTableWidthArr()` gives *every* column `windowWidth × 1.3/3` regardless of column count (3 columns = 130% of window width by construction); (2) `table()` never forwards `tableStyle` to `<MDTable>` — only extracts `borderWidth`/`borderColor` from it, silently dropping `maxWidth`/`overflow` | Rewrote `table()` entirely in [lib/markdown-renderer.tsx](lib/markdown-renderer.tsx) (Chat mode) and in `StableRenderer` in [features/agent/hooks/use-stable-markdown.tsx](features/agent/hooks/use-stable-markdown.tsx) (Agent mode) with real proportional column-width math |
| Two rounds of table/scroll "fixes" that visibly changed nothing | Fixes were applied to `features/agent/` (Agent mode) while the user was testing `app/simple-chat.tsx` (Chat mode) the whole time — see §1 | N/A — process failure, not a code bug. **Always confirm which UI before fixing chat-rendering issues.** |
| "All-time tokens used" showed a wrong/placeholder-looking number | `/balance`'s `used.*` fields reset every new pass/monthly period; there is no all-time counter exposed to non-founder sessions | Documented as a known limitation in [app/simple-chat.tsx](app/simple-chat.tsx)'s `freeModelDescription` — do not re-attempt an all-time display without a new gateway endpoint |
| `aec ...` keyword queries silently answered from general LLM knowledge, never hit MCP — Settings showed "Connected" (`activated: true`) with no error, so it looked wired correctly | Two-layer bug. (1) Client-side: [app/simple-chat.tsx](app/simple-chat.tsx)'s AEC routing check (`aecIsEnabled && aecState?.link`) fell through to Claude with **zero UI feedback** whenever `link` was missing — even though `activated` showed true. (2) Root cause of the missing link: `AECKnowledgeService.checkStatus`/`activate` sent `session.token` as the `uuid` param to `/mcp/me`/`/mcp/activate`, but the worker's `verified` check needs the **Ghost member's uuid**, which the app's magic-link login flow (`/auth/start`→`/auth/poll`) never received or stored anywhere — `session.token` was never a stand-in for it. So `verified` was always `false` server-side, `link` was always `null`, yet the client blindly cached `activated: true` anyway since the server still returned `ok: true` | Worker: `issueSession()` now embeds the Ghost uuid in the signed token at login (`AuthFlow.confirm/consume` threads it through); `/mcp/me` and `/mcp/activate` now authenticate via `Authorization: Bearer <token>` and read email+uuid from the verified token payload instead of a trusted client-supplied body (see §2). Client: [lib/aec-knowledge-service.ts](lib/aec-knowledge-service.ts)'s `checkStatus`/`activate` send the bearer header and refuse to cache `activated: true` unless the server both verified the session **and** returned a link; [app/simple-chat.tsx](app/simple-chat.tsx) now shows a visible "⚠️ AEC Knowledge isn't connected" notice instead of silently falling back to Claude. **Anyone with a session token issued before this fix must sign out and back in once** — the old token has no uuid claim. |
| `aec`/`aec_folders` tools return "Knowledge base temporarily unavailable" / "Folder list temporarily unavailable" — even with a fully correct auth/uuid setup, and `aec_balance` still works fine | These two tools go through `mcpVaultSearch()`/`aecListFolders()` in the worker, which hit an external **Supabase** project (`ssv-asia-archive`, id `vxwsvmwrqtubnablkvil`) for the actual vault search; `aec_balance` doesn't touch Supabase at all (it's Durable-Object-only), which is why it can work while the other two don't. The Supabase free tier **auto-pauses the project after a period of inactivity** — a paused project makes every `fetch()` to `${SUPABASE_URL}/rest/v1/rpc/...` fail, which the worker correctly treats as an upstream error and returns the generic "temporarily unavailable" message (see `mcpVaultSearch`/`aecListFolders`, worker `index.js` ~line 2254). **Don't mistake this for the uuid/auth bug above** — check `aec_balance` first: if that works but `aec`/`aec_folders` don't, it's almost certainly this, not auth. | Check project status via Supabase MCP (`list_projects` / `get_project`, id `vxwsvmwrqtubnablkvil`) — `status: "INACTIVE"` confirms it. Fix: `restore_project` with that id (takes 1-3 min to come back, reports `COMING_UP` in the meantime). If this keeps recurring, consider upgrading off the free tier to avoid auto-pause entirely. |

---

## 7. Build & environment notes

- Android build requires `ANDROID_HOME` / Android SDK + `adb` on PATH — not present in
  every dev environment this project has been worked in. If `expo run:android` fails
  with "Failed to resolve the Android SDK path," that's an environment issue, not a
  code issue — don't chase it as a bug.
- Package manager is **yarn** (`yarn@4.9.2`, workspaces) — do not use `npm install` in
  this repo.
- `backend/` is a Rust crate (Cargo) powering **Agent mode**'s real backend
  (`packages/pi-client` talks to it) — unrelated to the Cloudflare gateway that Chat
  mode uses.

---

## 8. Google Play Store Submission (August 2026)

**Status:** READY FOR BUILD AND SUBMISSION ✅

### Compliance Documents Created
- `GOOGLE-PLAY-DATA-SAFETY-FORM.md` — Complete data collection disclosure
- `GOOGLE-PLAY-PERMISSIONS-DECLARATION.md` — Justified permission usage
- `GOOGLE-PLAY-IARC-QUESTIONNAIRE.md` — Content rating answers (PEGI 7)
- `GOOGLE-PLAY-REVIEWER-NOTES.md` — Testing instructions for Google reviewers
- `GOOGLE-PLAY-STORE-LISTING.md` — App description, screenshots guidance, copy-paste ready
- `GOOGLE-PLAY-FINAL-SUBMISSION-CHECKLIST.md` — Step-by-step submission walkthrough

### Implementation Complete
✅ Phase 1: AI Disclosure (first-launch modal, badges, settings, privacy policy)
✅ Phase 2: Payment Removal (free app, "Premium features coming soon")
✅ Phase 3: Compliance Documentation (all Play Console forms prepared)

### Ready for
1. Build APK/AAB via Android Studio (~25 minutes)
2. Pre-launch testing on device (~20 minutes)
3. Upload to Google Play Console (~2 hours)
4. Wait for Google review (3-5 business days)
5. Live on Play Store (expected Sept 1-2, 2026)

**All documentation is in repo root directory. Copy-paste ready for Play Console submission.**

---

## 9. Before you start any chat-related task, checklist

1. Which UI is the user actually using — Chat mode or Agent mode? (§1)
2. If it's a gateway/MCP question, have you verified the endpoint against the actual
   worker source, not a doc or a memory of a prior plan? (§2, §4)
3. If it's a rendering bug, are you editing `lib/markdown-renderer.tsx` (Chat) or
   `features/agent/hooks/use-stable-markdown.tsx` (Agent) — the one that matches #1?
4. If you're changing what a streaming message bubble displays, did you account for
   `flushPending`'s append-only behavior? (§4)
5. Does the fix need a visible UI status, not just a console.log? (§4)
6. Check §6 before re-deriving a fix from scratch — it may already be documented here.
