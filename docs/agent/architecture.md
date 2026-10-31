# Architecture and ownership

Status: implemented runtime foundation. The game requirements in [the product document](../product/README.md) are the next implementation target, not existing modules.

## Current modules

| Owner | Responsibility | Entry or contract |
| --- | --- | --- |
| Browser entry | Mount the page in StrictMode and load document styles | [main.tsx](../../src/client/app/main.tsx) |
| Foundation page | Render connection states; create and clean up its socket | [public interface](../../src/client/pages/foundation/index.ts), [FoundationPage](../../src/client/pages/foundation/ui/FoundationPage.tsx) |
| Server factory | Build shared health, compose transports and own bounded transport cleanup | [createAppServer](../../src/server/app.ts) |
| HTTP transport | Serve health/assets and normalize HTTP errors | [http.ts](../../src/server/transport/http.ts) |
| Socket.IO transport | Attach typed sockets and send readiness | [socket.ts](../../src/server/transport/socket.ts) |
| Runtime | Start once, report the bound address, cancel startup and stop once | [createServerRuntime](../../src/server/runtime.ts) |
| Process entry | Read environment/build paths, handle signals, log and announce IPC readiness | [index.ts](../../src/server/index.ts) |
| Startup validation | Parse HOST and PORT before listening | [getServerConfig](../../src/server/config.ts) |
| Shared protocol | App identity, health response and typed readiness event | [protocol.ts](../../src/shared/protocol.ts) |
| Tool launchers | Select the pinned runtime and execute project/agent commands | [runtime.mjs](../../scripts/runtime.mjs) |
| Public launch | Own local application and Tuna lifecycles; expose only after readiness | [start-public.mjs](../../scripts/start-public.mjs), [tuna.mjs](../../scripts/tuna.mjs) |

## Dependency direction

Client and server may import shared protocol definitions. Shared production code is environment-neutral and imports neither client, server nor Node.js built-ins. Client production code imports neither server code nor Node.js built-ins; server production code does not import browser modules. Tests may compose these boundaries to observe integration. Tooling may inspect configuration and source but is not imported into production modules.

[ESLint](../../eslint.config.mjs) enforces these directions for static imports and re-exports. Within the client it also rejects Pages-to-App imports and App imports of page internals. Server transport modules receive dependencies and cannot import app, runtime or index. [Restriction tests](../../tests/tools/architecture.test.mjs) exercise the actual configuration, including inherited restrictions in scoped overrides. The checks inspect written module specifiers; they do not resolve a complete dependency graph or inspect dynamic imports. Update rules and their tests when introducing aliases, layers or slices.

## Client organization

The client applies Feature-Sliced Design with two populated layers. App owns bootstrap and [global document styles](../../src/client/app/global.css). Pages owns the complete foundation screen, including its socket effect and connection presentation. App imports FoundationPage through the slice's index.js interface; that interface exports only FoundationPage. Within the slice use direct relative imports. Keep the existing .js extension convention for TypeScript module references.

Page appearance belongs to its [CSS Module](../../src/client/pages/foundation/ui/FoundationPage.module.css). Document defaults belong to App. A local connection effect does not require a separate model, provider or store at this size.

Add Features, Entities, Widgets or client Shared only when an implemented responsibility needs that owner. Keep single-page behavior inside its page until a real extraction is justified. The existing src/shared directory is the cross-runtime protocol owner, outside the client's FSD layers; it is not a browser utility directory. Game rules and private data retain their server owner.

## State and lifecycle

The current browser owns connection presentation only. The server owns live transport connections. App composes transports without listening; runtime owns the listening lifecycle without reading process globals. The process entry owns signals, environment and IPC. See [runtime foundation design](../design/runtime-foundation.md) for cancellation, bounded cleanup and HTTP error behavior.

One process is intended to host one active party, with later parties started sequentially. Keep runtime instances independent for tests. There is no game state, task bank, authorization model or persistence implementation yet; add their modules with their first implemented behavior.

For gameplay, introduce one authoritative server owner for phase transitions, assignments, deadlines, infection groups and scoring. Randomness and time must be injectable at the pure-rule boundary. HTTP and Socket.IO call that module's interface. Validate incoming commands at runtime before changing state; TypeScript payload types do not validate network input.

Build public and personal projections explicitly. Keep private task storage and organizer capability validation server-side. Shared types describe payloads; importing shared code must not deliver the task database to the browser. Implement local saves, paused restart recovery and duplicate-command protection with the behavior they protect. Keep one-consumer logic local until a real second consumer needs it; add storage interfaces when implemented access needs them.
