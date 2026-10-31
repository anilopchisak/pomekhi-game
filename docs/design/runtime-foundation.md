# Runtime foundation

Status: implemented scaffold. This document describes current startup and transport ownership; it does not describe an implemented game engine.

## Composition

[createAppServer](../../src/server/app.ts) composes Express and Socket.IO around one HTTP server. Importing the factory does not listen on a port. [The process entry](../../src/server/index.ts) owns configuration, listening and signal handling. This separation lets integration tests obtain independent ephemeral ports and close the actual server.

[The protocol](../../src/shared/protocol.ts) is the common payload owner. HTTP GET /api/health and the server:ready event report app identity and the foundation stage. This stage deliberately does not assert that sessions, tasks or gameplay exist.

[The browser entry](../../src/client/app/main.tsx) mounts the public FoundationPage interface in StrictMode and loads document-wide CSS. [FoundationPage](../../src/client/pages/foundation/ui/FoundationPage.tsx) owns a connection-status projection. Its effect creates one socket and disconnects it on cleanup. Each new connection receives readiness from the server. Transport reconnection is not yet game-state recovery. Page-specific CSS is isolated in a CSS Module; moving the screen does not change the protocol or effect lifecycle. See [architecture](../agent/architecture.md) for client layer and import rules.

## Build and startup

Vite writes browser assets to dist/client. TypeScript writes server and shared modules to dist/server and dist/shared. Production startup serves the built browser assets from the API server. Development uses Vite's same-origin proxy for API and socket traffic. Vite and Tuna use the server configuration's getServerOrigin function to select their upstream: it preserves HOST and PORT, maps wildcard bindings to loopback and brackets IPv6 addresses. The Vite browser listener remains on IPv4 loopback.

The development launcher owns both child processes. On POSIX it terminates their process groups; on Windows it uses taskkill for the owned process trees. If either child exits, the other is stopped. The local production launcher starts the built server; the server closes Socket.IO and HTTP on termination. The public launcher additionally owns the Tuna process. The server reports a private process-IPC readiness message only after listening. The public launcher opens Tuna only after that message, preventing an unrelated service on an occupied port from being exposed. If either process fails, both are stopped. A startup timeout and forced-stop fallback bound cleanup. No game HTTP or Socket.IO contract is added by this internal IPC signal.

Tuna executable selection and command construction belong to scripts/tuna.mjs. It reuses server configuration, maps wildcard bindings to loopback upstreams and requires a positive fixed port. Standalone tunnel startup checks local app identity. Browser login delegates session storage to the OS keyring. Tunnel traffic-body inspection is disabled; project code does not read or forward authentication credentials.

## Development check lifecycle

The Python agent runner owns each configured check's process tree, including the Node launcher, npm and its workers. On POSIX it starts a separate session and kills that process group on timeout or interruption. On Windows it uses taskkill /T /F, with a direct-process fallback. A timeout forcefully stops the command tree before collecting output and returning code 124; successful commands retain their exit status and combined output. Checks must not detach workers from the owned tree.

## Boundaries and verification

No state store, room authorization or private assignment serialization exists at this stage. Introduce those mechanisms with their own explicit owner and design update rather than attributing them to Socket.IO recovery alone.

[Integration tests](../../tests/integration/server.test.ts) use the real server and built browser assets. [Startup tests](../../src/server/config.test.ts) establish input validation. The current tests do not prove native Windows process behavior, browser rendering, tunnel reachability or future game correctness.
