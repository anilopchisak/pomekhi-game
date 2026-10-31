# Consumers and acceptance

## Current consumers

| Shared behavior | Producer / owner | Consumers and evidence |
| --- | --- | --- |
| Health/readiness payload | [server factory](../../src/server/app.ts), [protocol](../../src/shared/protocol.ts) | HTTP health callers, [FoundationPage](../../src/client/pages/foundation/ui/FoundationPage.tsx), [integration tests](../../tests/integration/server.test.ts) |
| Foundation screen interface | [page index](../../src/client/pages/foundation/index.ts) | [Browser entry](../../src/client/app/main.tsx); page internals remain local |
| Startup options and upstream URL | [configuration parser](../../src/server/config.ts) | Process entry, runtime, Vite, Tuna and their configuration tests |
| Start/stop lifecycle | [runtime](../../src/server/runtime.ts), [server factory](../../src/server/app.ts) | Process signals and [real lifecycle tests](../../tests/integration/runtime.test.ts) |
| Process readiness and exit codes | [process entry](../../src/server/index.ts) | Public launcher and [compiled-process tests](../../tests/integration/bootstrap.test.ts) |
| Safe HTTP errors | [HTTP transport](../../src/server/transport/http.ts) | HTTP clients and [Express error tests](../../tests/integration/http-errors.test.ts); optional reporter receives unexpected errors |
| Built browser bundle | Vite build | Production server and real-asset integration test |
| Tool runtime selection | [runtime helper](../../scripts/runtime.mjs) | npm check launcher, Python agent launcher, development and production launchers |

## Future consumers

The shared laptop display, organizer controls, private phone screens and task editor are separate future consumers. Changes to game events must review all of them. Organizer controls belong only on the laptop. User-facing ownership and rules are specified in [product requirements](../product/README.md).

## Verification boundaries

Integration tests use a real local HTTP/Socket.IO server, independent client connections and the actual built HTML/JavaScript asset. They establish foundation connectivity, not game isolation or phase recovery.

For browser/client changes check loading, connection loss, reconnect and cleanup. Check the client placement and import rules in [architecture](architecture.md). Real-device acceptance additionally checks iOS Safari and Android Chrome after locking/unlocking a phone, readability in dim light and the shared display's audio controls. For launchers check both native operating systems. Remote access requires Tuna and the mobile carriers used at the venue.

Review relevant consumers through the graph and current source before choosing tests. A shared-file unit test does not establish successful composition. Record unperformed native, device and remote scenarios explicitly.
