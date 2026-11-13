# Expert AI Architecture (AGENTS.md)

## Project overview

Expert AI is a cross-platform (iOS, Android, Web) client for the pi coding agent.
Built with Expo SDK 54, React Native, and expo-router for file-based routing.

**Note:** This codebase uses the `@pi-ui/client` SDK internally (the backend communication layer). 
This is an implementation detail and not part of the user-facing Expert AI branding.

## Monorepo structure

```
expert-ai/
├── app/                    # Expo Router screens (file-based routing)
│   ├── _layout.tsx         # Root layout (fonts, providers)
│   └── (app)/              # Authenticated app group
│       ├── _layout.tsx     # PiClientProvider, AdaptiveNavigation
│       ├── settings.tsx
│       ├── chat/
│       └── workspace/
├── features/               # Feature modules (UI + app-specific state)
│   ├── agent/              # Agent message list, extension UI, store
│   ├── auth/               # Auth store (zustand + SecureStore)
│   ├── chat/               # Chat components, chat store
│   ├── navigation/         # Adaptive nav, header bars, sidebars
│   ├── servers/            # Server management
│   ├── settings/           # Settings components, custom models store
│   ├── speech/             # Voice input/output
│   ├── tasks/              # Task runner store + components
│   └── workspace/          # Workspace store, components, types
├── packages/
│   └── pi-client/          # @pi-ui/client — SDK + hooks (see below)
├── components/ui/          # Shared UI primitives
├── constants/              # Theme, colors, fonts
├── hooks/                  # App-level shared hooks
├── backend/                # Rust backend (cargo)
└── web-stubs/              # Web platform stubs for native-only modules
```

## @pi-ui/client package

All server communication lives in `packages/pi-client/`. The main app never
imports from generated SDK files directly.

```
packages/pi-client/src/
├── generated/          # Auto-generated from OpenAPI (do NOT edit)
│   ├── sdk.gen.ts      # Raw REST functions
│   ├── types.gen.ts    # All domain types
│   └── client.gen.ts   # Configured hey-api fetch client
├── core/
│   ├── api-client.ts   # ApiClient class — typed wrappers over every endpoint
│   ├── pi-client.ts    # PiClient — orchestrator (SSE + state + observables)
│   ├── stream-connection.ts
│   ├── event-source.ts
│   └── message-reducer.ts
├── hooks/              # React hooks (RxJS-based, no React Query)
│   ├── use-agent-session.ts
│   ├── use-agent-config.ts
│   ├── use-git-status.ts
│   ├── use-file-list.ts
│   ├── use-workspace-sessions.ts
│   ├── use-chat-sessions.ts
│   ├── use-package-status.ts
│   ├── use-custom-models.ts
│   └── ...
├── types/              # Hand-written types + re-exports from generated
├── utils/              # unwrapApiData, extractApiErrorMessage
└── index.ts            # Barrel — exports everything
```

### Regenerating the SDK

```sh
yarn api:generate          # runs from root, delegates to pi-client
# or directly:
cd packages/pi-client && yarn api:generate
```

Requires the backend running at `http://127.0.0.1:5454`.

## Key conventions

### Where API logic goes

| What | Where | Pattern |
|---|---|---|
| REST endpoint wrappers | `pi-client/core/api-client.ts` | `ApiClient` method |
| Hooks with state/polling/caching | `pi-client/hooks/` | RxJS `BehaviorSubject` + `useObservable` |
| Domain types | `pi-client/types/index.ts` | Re-export from `generated/types.gen.ts` |
| Raw SDK functions (for stores) | `import { sdk } from '@pi-ui/client'` | `sdk.functionName()` |
| hey-api client instance | `import { client } from '@pi-ui/client'` | Direct access for interceptors |
| Unwrap helpers | `import { unwrapApiData } from '@pi-ui/client'` | For stores using raw SDK |

### Hooks pattern (RxJS, not React Query)

All hooks in `@pi-ui/client` follow the same pattern:

```ts
const state$ = useRef(new BehaviorSubject<State>(INITIAL));
// fetch data in useEffect, push to state$.current.next(...)
return useObservable(state$.current, INITIAL);
```

Do **not** use `@tanstack/react-query` for new data-fetching hooks.
Existing React Query usage in the main app (slash commands, session invalidation)
is legacy and should not be extended.

### Stores (zustand)

Zustand stores live in `features/<name>/store/`. They manage UI state and call
API functions directly using the `sdk` namespace:

```ts
import { sdk, unwrapApiData } from '@pi-ui/client';
const { listTasks, startTask } = sdk;
```

Stores cannot use React hooks. They use raw SDK functions with the global
`client` instance configured by the auth store at boot.

### Components vs hooks vs stores

- **Components** (`features/<name>/components/`) — React Native views, import hooks
- **Hooks** — if it's reusable data logic, put it in `@pi-ui/client`. App-specific
  UI hooks (e.g., `use-stable-markdown`) stay in `features/`
- **Stores** — zustand, for app-level state that persists across screens

### Adding a new API endpoint

1. Add the endpoint to the backend
2. Run `yarn api:generate` to regenerate SDK
3. Add a typed method to `ApiClient` in `pi-client/core/api-client.ts`
4. If the UI needs reactive state: add a hook in `pi-client/hooks/`
5. If only a store needs it: use `sdk.newFunction()` directly
6. Re-export any new types from `pi-client/types/index.ts`

## Imports

- `@pi-ui/client` — all API, types, hooks, utilities
- `@/*` — path alias for project root (tsconfig paths)
- Relative imports within a feature module

## Build & run

```sh
yarn start              # Expo dev server
yarn web                # Web
yarn android            # Android
yarn ios                # iOS
yarn web:build          # Production web export
yarn backend:build      # Rust backend
yarn build:prod         # Both
```

## Tech stack

- **Framework:** Expo SDK 54, React Native 0.81, React 19
- **Routing:** expo-router (file-based)
- **State:** zustand (app state), RxJS (pi-client reactive state)
- **Styling:** React Native StyleSheet, no CSS-in-JS
- **Icons:** lucide-react-native
- **Fonts:** DM Sans, JetBrains Mono (via expo-google-fonts)
- **API client:** @hey-api/client-fetch (auto-generated)
- **Backend:** Rust (in `backend/`)
- **Package manager:** Yarn 4 (Berry) with workspaces
