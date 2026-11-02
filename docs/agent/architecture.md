# Architecture and ownership

Status: runtime foundation, one locally saved room, private cards and timed rounds. Search actions and results are implemented; paused disk recovery is implemented as described in [product requirements](../product/README.md).

## Current modules

| Owner | Responsibility | Entry or contract |
| --- | --- | --- |
| Browser entry | Choose HostPage or PlayerPage, mount StrictMode and load document styles | [main.tsx](../../src/client/app/main.tsx) |
| Organizer page | Authorize, control membership and construct public invitations | [page interface](../../src/client/pages/host/index.ts) |
| Player page | Join, restore an identity and present authorized membership | [page interface](../../src/client/pages/player/index.ts) |
| Client connection | Own socket cleanup, bounded acknowledgements and fresh projections | [Shared API](../../src/client/shared/api/index.ts) |
| Shared shell | Render the common accessible dark screen with CSS Modules | [Shared UI](../../src/client/shared/ui/index.ts) |
| Lobby | Own the active room, identities, authorization, revocation and presence | [createLobby](../../src/server/lobby.ts) |
| Game session | Own phases, deadlines, settings, round roster/count, tutorial/progression and private role history; compose dealing | [createGame](../../src/server/game.ts) |
| Search ledger | Own infection groups, missions, causal undo and frozen round outcomes | [createSearch](../../src/server/search.ts) |
| Round inbox | Reconcile durable player events, receipts, review and completion barriers | [createRoundSync](../../src/server/round-sync.ts) |
| Player offline model | Persist own authorized view and queue; project provisional effects | [model](../../src/client/pages/player/model/useOfflinePlayer.ts) |
| Dealing | Own private assignments, readiness and replacements | [createDealing](../../src/server/dealing.ts) |
| Card bank | Keep original three-level cards on the server | [cards.ts](../../src/server/cards.ts) |
| Session coordinator | Serialize commands/timers and publish only after durable commit | [createSession](../../src/server/session.ts) |
| Session file | Validate private snapshots, claim one writer and atomically replace the local checkpoint | [store](../../src/server/session-store.ts), [format](../../src/server/session-format.ts) |
| Server factory | Compose lobby and transports; own bounded transport cleanup | [createAppServer](../../src/server/app.ts) |
| HTTP transport | Serve health/assets and normalize HTTP errors | [http.ts](../../src/server/transport/http.ts) |
| Socket.IO transport | Validate command delivery and publish authorized views | [socket.ts](../../src/server/transport/socket.ts) |
| Runtime | Start once, cancel startup, observe server errors and stop once | [createServerRuntime](../../src/server/runtime.ts) |
| Process entry | Read environment/build paths, generate the organizer code, handle signals and announce readiness | [index.ts](../../src/server/index.ts) |
| Startup configuration | Parse HOST/PORT and construct upstream origins for runtime, Vite and Tuna | [config.ts](../../src/server/config.ts) |
| Shared protocol | Health, typed commands, replies and explicitly public projections | [protocol.ts](../../src/shared/protocol.ts) |
| Public launch | Own local application and Tuna lifecycles | [launcher](../../scripts/start-public.mjs), [Tuna](../../scripts/tuna.mjs) |

## Dependency direction

Client and server may import the environment-neutral cross-runtime protocol in src/shared. That directory imports neither runtime side nor Node built-ins. Client code imports no server code or Node built-ins. Server code imports no browser implementation. Tests can compose these boundaries to observe integration.

App imports pages through their index.js interfaces. Page slices cannot import each other or App. Shared imports neither Pages nor App; pages use its API/UI index.js interfaces. Keep direct relative .js references and place one-consumer behavior inside its owner. Features, Entities and Widgets have no implemented responsibility yet.

Transport receives the session coordinator from App and cannot import app, runtime or the process entry. Lobby, game, search, round inbox, dealing and the bank import no transport, bootstrap, Express or Socket.IO. [ESLint](../../eslint.config.mjs) and [restriction tests](../../tests/tools/architecture.test.mjs) enforce written static imports and re-exports; they do not resolve aliases or inspect dynamic imports.

## State and lifecycle

App composes without listening; runtime owns start/stop without process globals; the entry owns signals, IPC and intentional local credential output. The factory closes HTTP/Socket.IO once within its deadline. See [runtime design](../design/runtime-foundation.md).

Each server has one independent lobby. Browser storage retains credentials and an origin-local own-view/action journal, while authoritative membership lives in server state with local checkpoints. Organizer actions require server-side authorization. Reconnect recovers identity and a complete projection; it does not create a new participant by name. See [lobby sessions](../design/lobby-sessions.md) for retries, revisions, multiple tabs and revoked credentials.

The client uses App, Pages and Shared because both pages now consume the same connection and shell. Pages own their workflows. Shared shell styles use a CSS Module; App owns document defaults. No router or global store is added. Dealing rules stay on the server.

The [game session](../design/rounds.md) owns one lifecycle and composes the [dealing owner](../design/dealing.md) inside each room; lobby retains authorization and membership. Client pages keep DealControls, GameControls, SoundControls and PersonalCardPanel local; Shared owns the common clock/status presentation. Server-driven transitions publish through the lobby subscription. Factory cleanup drains the session and cancels timers within the shared transport shutdown deadline. The [search ledger](../design/search-actions.md) owns infection groups, mission credit and undo dependencies; game owns result history and finalization. Inject time and randomness for rule tests. Validate incoming commands at runtime. Construct public/personal projections explicitly; task storage and organizer capabilities remain on the server. The session coordinator serializes commands and timers, commits private snapshots, then publishes. See [persistence design](../design/session-persistence.md) and [offline reconciliation](../design/offline-play.md).
