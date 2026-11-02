# Testing rules

## Current project tests

Vitest owns automated tests. `npm run test:ci` runs [startup configuration tests](../../src/server/config.test.ts), [Tuna launch-boundary tests](../../tests/tools/tuna.test.mjs) and [import-restriction tests](../../tests/tools/architecture.test.mjs) once. `npm run test:integration` runs [real transport and built-asset tests](../../tests/integration/server.test.ts) once and requires `npm run build` first. Interactive `npm test` is a watch command, not a gate.

Configuration tests reject invalid ports before side effects. Integration tests bind ephemeral loopback ports, use actual Express/Socket.IO composition and independent clients, fetch built HTML/JavaScript, verify API failure behavior and close their resources. Production-process cases verify the listening IPC signal and that a missing Tuna executable closes its owned application process. Public Internet connectivity remains a separate live acceptance check.

[Runtime tests](../../tests/integration/runtime.test.ts) verify shared start/stop promises, actual bound origins, independent instances, stop-before-start, cancellation during listening/DNS/bind failure, occupied ports, client disconnection and forced connection cleanup. [Bootstrap tests](../../tests/integration/bootstrap.test.ts) run the compiled entry: test-only preloads delay listening or hold a real HTTP request open, proving no late IPC readiness and the default two-second forced-stop/exit-code behavior. Those signal scenarios are POSIX checks and are skipped on Windows; other runtime checks remain enabled.

The bootstrap server-error regression holds an actual HTTP request open after readiness and injects two server error events. It verifies one bounded shutdown, a released port, exit code 1 and sanitized diagnostics. This exercises the event path used by Windows accept failures without exhausting operating-system resources; native Windows execution is not established by that injection. Its test-only IPC listener is unreferenced so it cannot keep the stopped child alive.

[HTTP error tests](../../tests/integration/http-errors.test.ts) use real Express requests for synchronous/asynchronous failures, standard 4xx messages, malformed statuses, reporter failures and headersSent delegation. The assembled application also verifies a missing client file returns a safe JSON 404. Diagnostic routes and fault preloads exist only in tests.

Import-restriction tests call ESLint.lintText against the real project configuration. They allow page interfaces, local styles, shared contract types and integration composition; they reject reversed ownership, page internals and browser/Node coupling. See [architecture](architecture.md) for the checks' static-specifier scope.

[Development proxy tests](../../tests/tools/dev-proxy.test.mjs) exercise the actual Vite configuration for IPv4, IPv6 and wildcard HOST values. The Python agent tests also cover command output and timeout cleanup through unchanged copies of the real Node/npm launchers: a descendant holds an ephemeral local port, and the test verifies that the port is released after timeout. This test requires permission to bind loopback ports, including in quick mode.

Lobby unit tests cover membership, authorization, deterministic IDs, capacity, names, retries, multi-tab presence, revoked keys and detached projections. Real Socket.IO lobby tests cover seven independent participants, reconnect, privacy, removal/leave, closing and process-state replacement. [Player form tests](../../tests/tools/player-recovery.test.mjs) render real React and the connection hook in happy-dom, control packet delivery and use the real lobby to protect saved credentials during manual recovery retries. happy-dom is a test-only dependency and does not establish browser layout or device behavior. Invitation URL validation has focused tests. Dealing rule tests cover initial/late role balance and uniqueness, readiness, replacement, shuffle and cancellation. Dealing transport tests cover personal projection isolation, offline members, replay/stale requests and bank exclusion from production assets/HTTP. Real Vite requests assert denial of server source/build files with and without raw; DOM tests cover card concealment and manual retries. Timed-round rule tests inject both clocks and a cancellable scheduler. Real Socket.IO round tests verify server-driven transitions, organizer loss, phone recovery, waiting newcomers, explicit departure, replay, sound ownership and disposal. DOM checks verify round controls, concealed restoration, offline labels and Web Audio activation/cue consumption. [Search rule tests](../../src/server/search.test.ts) cover capture chains, group release, dependency-aware undo, mission eligibility and frozen outcomes. Round integration and DOM tests also exercise these rules. There is no automated real-browser gate yet. Browser acceptance is separate: verify the built page at desktop and 320px widths, initial connection, loss of signal, reconnection, reload and socket cleanup. For new game rules inject clock and randomness; test transitions, release groups, stale commands, retries and recovery. For private projections add independent phone consumers to integration tests. Device acceptance remains separate.

## Establish expected behavior

Use the current requirement and owning product/API contracts before existing implementation. A test is evidence of behavior, not an independent product specification. State the risk protected by each new scenario; coverage alone is not an oracle.

## Choose the boundary

| Risk | Boundary and observations |
| --- | --- |
| Transformation/validation | Public pure function; partitions, limits and failure cases |
| API/cache/transaction | Real data-access orchestration; mock transport/database boundary as appropriate; verify mapping, invalidation and rollback |
| Race/cancellation/retry | Real coordinator; controlled clock and deferred operations; verify order, stale results, cleanup and repeat invocation |
| Interaction/accessibility | Real required providers/composition; observable semantics, focus, disabled/error states |
| Persistence/recovery | Simulated failure/restart and actual serialization boundary; verify ownership and convergence |
| Shared contract | Relevant consuming entry points; independent consumer instances where isolation matters |

Prefer the smallest boundary retaining the invariant. Keep internal modules real when their interaction is the behavior under test. Use a fresh mutable fixture/environment per case. Control clocks, randomness and asynchronous completion; avoid real sleeps as synchronization.

For a reproducible defect show that the test fails for the intended reason before the fix, then passes. If this cannot be shown, record the limitation. Check nearby scenarios for duplicates. Assertions should observe meaningful results rather than implementation calls alone.

Run the relevant targeted tests during development and the configured full gate before implementation delivery. Browser rendering, device APIs, permissions and production builds require the matching acceptance evidence; mocks cannot establish them.

Coverage thresholds/ratchets are project choices. Introduce one from a reliable baseline; keep its policy changes separate from ordinary fixes. The portable runner does not implement a coverage ratchet or registered-scenario execution ledger. Add project-owned check commands for those guarantees when needed.

Disk recovery uses [coordinator](../../src/server/session.test.ts) and [file adapter](../../src/server/session-store.test.ts) tests with isolated memory/temporary stores. [Crash tests](../../tests/integration/persistence.test.ts) kill and restart a compiled process, recover seven clients, preserve private cards and cached requests, and verify closure survives another restart. The bootstrap/launcher tests use test-only working-directory isolation so they never read the real party file. Vite tests also deny private data paths. Startup cancellation while loading remains a runtime regression.

Offline inbox and seven-client persistence tests cover reverse-order capture chains, stable retries, departures without pause, review, finalization barriers and sealed outcomes. Chromium/WebKit acceptance uses real IndexedDB and production offline shell reload; a viewport is not a physical phone. Follow the [device checklist](../testing/device-acceptance.md) for hotspot/LAN and native platforms.

Tutorial/progression tests cover separate scoring, repeated aborted attempts, finite/endless curves, fixed levels, effective infection and settings locks. Level-aware dealing tests cover up to 11 exorcists, simpler fallback, replacements and late membership. Legacy format tests exercise version-1 migration, while coordinator restart tests retain tutorial completion and later issued levels.

Ritual rule tests exhaust all supported roster/length budgets and cover reveal privacy, ordered steps, penalties, undo locks and outcomes. Game and real seven-client tests cover explicit confirmation, lost acknowledgements, legacy tutorial flags, file restart, early victory and separate freeplay. Browser acceptance must exercise the shared board on both pages, 320px, production/LAN and restart. The theoretical budget does not establish live-party balance.
