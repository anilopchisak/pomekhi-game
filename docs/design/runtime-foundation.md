# Runtime foundation

Status: implemented scaffold. This document describes current startup and transport ownership; it does not describe an implemented game engine.

## Composition

[createAppServer](../../src/server/app.ts) builds one health response, passes it to the [HTTP](../../src/server/transport/http.ts) and [Socket.IO](../../src/server/transport/socket.ts) transports, and owns the resulting HTTP server and socket cleanup. Importing or constructing the factory does not listen on a port. Its existing server, io and close interface remains available to integration consumers. Optional reportError and shutdownTimeoutMs construction options support diagnostics and bounded-cleanup checks without environment settings.

[createServerRuntime](../../src/server/runtime.ts) receives parsed configuration and application options, exposing start and stop without process-global handlers. [The process entry](../../src/server/index.ts) alone reads environment/build paths, registers signals, prints lifecycle messages and sends IPC readiness. The shared configuration module remains at its original path because Vite and Tuna also consume its HOST/PORT and origin helpers.

[The protocol](../../src/shared/protocol.ts) is the common payload owner. HTTP GET /api/health and the server:ready event report app identity and the foundation stage. This stage deliberately does not assert that sessions, tasks or gameplay exist.

[The browser entry](../../src/client/app/main.tsx) selects public HostPage/PlayerPage interfaces in StrictMode. Shared API owns the typed socket lifecycle and Shared UI owns the common CSS Module; App owns document defaults. See [lobby design](lobby-sessions.md) for identity and projection recovery. Readiness retains its existing foundation-stage shape and is not a substitute for an authorized lobby snapshot.

## Build and startup

Vite writes browser assets to dist/client. TypeScript writes server and shared modules to dist/server and dist/shared. Production startup serves the built browser assets from the API server. Development uses Vite's same-origin proxy for API and socket traffic. Vite and Tuna use the server configuration's getServerOrigin function to select their upstream: it preserves HOST and PORT, maps wildcard bindings to loopback and brackets IPv6 addresses. The Vite browser listener remains on IPv4 loopback.

The development launcher owns both child processes. On POSIX it terminates their process groups; on Windows it uses taskkill for the owned process trees. If either child exits, the other is stopped. The local production launcher starts the built server; the server closes Socket.IO and HTTP on termination. The public launcher additionally owns the Tuna process. The server reports a private process-IPC readiness message only after listening. The public launcher opens Tuna only after that message, preventing an unrelated service on an occupied port from being exposed. If either process fails, both are stopped. A startup timeout and forced-stop fallback bound cleanup. No game HTTP or Socket.IO contract is added by this internal IPC signal.

## Server lifecycle

Runtime progresses from idle through starting/running to stopping/stopped. Repeated start calls reuse the same listening result while active. Repeated stop and factory close calls share their respective cleanup promises. A stopped runtime cannot be restarted; create a fresh instance. Port zero reports the actual port and a usable origin after listening. Startup failure cleans up created resources before rejecting.

Stopping while listen is pending aborts that startup using an AbortController. The listening promise rejects as AbortError and the entry suppresses readiness after a requested stop. Abort is used for startup cancellation only; normal running-server cleanup stays with the factory. No process signal handler is installed by importing or constructing the runtime.

The runtime retains a server error listener after startup and throughout cleanup. The first error while running starts bounded cleanup and synchronously notifies the optional onError callback; later errors during stopping do not start another shutdown or notification. The original stop promise retains any cleanup rejection for callers. The process entry reports a fixed transport-error message, sets exit code 1 and observes that shared stop promise through the same shutdown path used by signals. Error details are not printed. This also handles accept failures that Windows forwards as server errors; native Windows resource exhaustion remains a separate acceptance check.

The factory gives Socket.IO sole ownership of normal transport shutdown; io.close also closes its underlying HTTP server. It tolerates an HTTP server that was never started. The default cleanup deadline is 2000ms, shorter than the public launcher's 3000ms fallback. At the deadline it destroys tracked TCP connections, closes any remaining listener and rejects cleanup. Socket tracking includes upgraded connections. All completion paths clear the deadline. Normal process shutdown exits with code 0; startup or shutdown failure sets code 1. Repeated signals share one shutdown attempt.

## HTTP failures and diagnostics

HTTP health/readiness shapes and JSON 404 responses are unchanged. The last Express error middleware retains integer statuses from 400 through 499, using standard messages and the existing Not found wording for 404. Other failures become JSON status 500 with Internal server error. Exception messages, stacks and extra object fields are not serialized into responses. After headers have been sent, the middleware delegates to Express rather than attempting another response.

An optional reportError callback receives unexpected errors before the response is written. The default console message is fixed and does not dump request bodies, cards or credentials. A throwing reporter is contained and produces a fixed diagnostic; it does not replace the JSON response. Expected 4xx errors do not call this unexpected-error reporter. Signal/startup logs remain readable, without a new logging dependency or additional endpoints.

Tuna executable selection and command construction belong to scripts/tuna.mjs. It reuses server configuration, maps wildcard bindings to loopback upstreams and requires a positive fixed port. Standalone tunnel startup checks local app identity. Browser login delegates session storage to the OS keyring. Tunnel traffic-body inspection is disabled; project code does not read or forward authentication credentials.

## Development check lifecycle

The Python agent runner owns each configured check's process tree, including the Node launcher, npm and its workers. On POSIX it starts a separate session and kills that process group on timeout or interruption. On Windows it uses taskkill /T /F, with a direct-process fallback. A timeout forcefully stops the command tree before collecting output and returning code 124; successful commands retain their exit status and combined output. Checks must not detach workers from the owned tree.

## Boundaries and verification

In-memory room membership and authorization belong to the [lobby owner](lobby-sessions.md). App creates one instance and passes it to Socket.IO. The entry generates and intentionally prints the per-launch organizer code locally, alongside the panel URL; public readiness IPC remains credential-free. Private assignment projections are described in [dealing design](dealing.md); disk persistence remains future work.

[Integration tests](../../tests/integration/server.test.ts) use the real server and built browser assets. [Runtime](../../tests/integration/runtime.test.ts), [compiled-process](../../tests/integration/bootstrap.test.ts) and [HTTP-error](../../tests/integration/http-errors.test.ts) tests exercise lifecycle and failure behavior. [Startup tests](../../src/server/config.test.ts) establish input validation. These tests do not prove native Windows process behavior, browser rendering, tunnel reachability or future game correctness.
