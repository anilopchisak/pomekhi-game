# Consumers and acceptance

## Current consumers

| Shared behavior | Producer / owner | Consumers and evidence |
| --- | --- | --- |
| Health/readiness | Server factory and [protocol](../../src/shared/protocol.ts) | HTTP callers, connection hook, transport and bootstrap tests; foundation stage does not claim playable rounds |
| Lobby commands and projections | [Lobby](../../src/server/lobby.ts) through Socket.IO | Organizer page, independent phone pages and [real-client tests](../../tests/integration/lobby.test.ts) |
| Private card and reading metadata | [Dealing](../../src/server/dealing.ts), [protocol](../../src/shared/protocol.ts) | One authorized player receives its own card; organizer and other players receive public readiness/request metadata |
| Round lifecycle and timing | [Game session](../../src/server/game.ts), [round design](../design/rounds.md) | Host controls, shared status/countdown, personal phase instructions and real-client timer tests |
| Tutorial and progression | Game session and frozen round plan | Host settings/briefing, phone guidance, level-aware dealing, result filtering and versioned recovery |
| Search actions and results | [Search ledger](../../src/server/search.ts), [search design](../design/search-actions.md) | Personal effective cards/actions/undo, public post-return team results and result finalization |
| Offline journal and participation | [Round inbox](../../src/server/round-sync.ts), player IndexedDB and [offline design](../design/offline-play.md) | Own pending/confirmed/review receipts, host review, durable replay and completion barrier |
| Shared ritual and freeplay | [Ritual](../../src/server/ritual.ts), game and shared protocol | Host review/penalty controls, phone board, sealed result split and schema-4 recovery |
| Live sound cues | Game transitions, lobby sound ownership and socket transport | One explicitly selected host panel; phones receive no cues, and recovery replays none |
| Original three-level bank | [Server bank](../../src/server/cards.ts) | Server dealing only; production bundle and Vite/HTTP privacy tests |
| Organizer authorization | Process-generated code and connection authorization in lobby | Laptop panel; sessionStorage recovery; the terminal intentionally displays the bootstrap code |
| Player credentials | Phone pre-join key and server membership | Reload, retry and multiple-tab recovery; browser storage is origin-scoped |
| Page interfaces | Host and Player index.js exports | [Browser entry](../../src/client/app/main.tsx); page internals remain local |
| Connection and common screen | Client Shared API/UI index.js exports | Both pages; hook owns sockets and the shell owns its CSS Module |
| Startup configuration | [config.ts](../../src/server/config.ts) | Runtime, Vite, Tuna and configuration tests |
| Start/stop and readiness | [Runtime](../../src/server/runtime.ts), [entry](../../src/server/index.ts) | Signals, public launcher, lifecycle and compiled-process tests |
| Safe HTTP errors | [HTTP transport](../../src/server/transport/http.ts) | HTTP consumers and real Express error tests |
| Durable session | [Coordinator](../../src/server/session.ts) and [private file adapter](../../src/server/session-store.ts) | Runtime initialization, organizer recovery controls, phone credentials and restart tests |
| Built client | Vite | Production HTTP server and real-asset checks |

## Future consumers

Private cards, timed phases and short laptop signals are implemented. Release/infection, dependency-aware undo and team results are implemented. Paused disk recovery is implemented; music/voice and the task editor remain planned. See [search design](../design/search-actions.md) for private/public consumers. Changes to game events must review laptop and personal projections together. The organizer participates from a phone while controls stay on the laptop. Rules are owned by [product requirements](../product/README.md).

## Verification boundaries

Unit tests cross the lobby interface. Integration uses real HTTP/Socket.IO and independent identities for authorization, membership, recovery and credential isolation. Existing startup, production assets, Vite proxy, Tuna launcher and HTTP error checks remain required.

Browser checks cover input/error states, 320px layout, seven phone sessions, panel/phone refresh, multiple tabs, disconnection/reconnect, removal, leave and closing. Browser profiles on macOS do not establish native iOS/Android behavior or Windows startup. QR camera scanning and carrier/Tuna access need actual devices and networks. Mark unperformed scenarios explicitly.
