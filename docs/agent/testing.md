# Testing rules

## Current project tests

Vitest owns automated tests. `npm run test:ci` runs [startup configuration tests](../../src/server/config.test.ts), [Tuna launch-boundary tests](../../tests/tools/tuna.test.mjs) and [import-restriction tests](../../tests/tools/architecture.test.mjs) once. `npm run test:integration` runs [real transport and built-asset tests](../../tests/integration/server.test.ts) once and requires `npm run build` first. Interactive `npm test` is a watch command, not a gate.

Configuration tests reject invalid ports before side effects. Integration tests bind ephemeral loopback ports, use actual Express/Socket.IO composition and independent clients, fetch built HTML/JavaScript, verify API failure behavior and close their resources. Production-process cases verify the listening IPC signal and that a missing Tuna executable closes its owned application process. Public Internet connectivity remains a separate live acceptance check.

Import-restriction tests call ESLint.lintText against the real project configuration. They allow page interfaces, local styles, shared contract types and integration composition; they reject reversed ownership, page internals and browser/Node coupling. See [architecture](architecture.md) for the checks' static-specifier scope.

[Development proxy tests](../../tests/tools/dev-proxy.test.mjs) exercise the actual Vite configuration for IPv4, IPv6 and wildcard HOST values. The Python agent tests also cover command output and timeout cleanup through unchanged copies of the real Node/npm launchers: a descendant holds an ephemeral local port, and the test verifies that the port is released after timeout. This test requires permission to bind loopback ports, including in quick mode.

There is no automated game-rule or UI-rendering suite. Browser acceptance is separate: verify the built page at desktop and 320px widths, initial connection, loss of signal, reconnection, reload and socket cleanup. For new game rules inject clock and randomness; test transitions, release groups, stale commands, retries and recovery. For private projections add independent phone consumers to integration tests. Device acceptance remains separate.

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
