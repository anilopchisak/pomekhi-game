# Stack and runtime

## Sources of versions

[.nvmrc](../../.nvmrc) pins Node.js. [package.json](../../package.json) pins the bundled npm version and direct dependencies; package-lock.json locks the installed npm tree. Use `npm ci` after obtaining the pinned Node distribution. A machine-local portable Node may live in ignored `.runtime/node`; it is not a portable dependency cache to distribute.

The project uses React, Vite, TypeScript, Express and Socket.IO. TypeScript stays on the 6.0 line because the selected typescript-eslint version does not support TypeScript 7. Upgrades must check peer compatibility rather than blindly choosing every latest tag.

## Commands and mechanisms

See [README](../../README.md) for setup and current script names. `dev` runs the TypeScript server and Vite with same-origin API/socket proxies. `build` compiles server/shared code and writes the client bundle to dist/client. `start` serves the built client and API from one Node process.

[scripts/runtime.mjs](../../scripts/runtime.mjs) resolves local or installed Node and prepends the matching runtime directory. npm commands are launched through npm-cli.js rather than executing npm.cmd without a shell. This keeps the agent command arrays portable.

The API factory uses Express; [shared protocol](../../src/shared/protocol.ts) defines health and Socket.IO readiness payloads. No game command protocol or data-access abstraction exists yet. Vite handles page CSS Modules and App's global CSS without an additional styling dependency. Client placement and static import checks are defined in [architecture](architecture.md).

## Tool environment

The Python runner needs Python 3.9+; Graphify needs Python 3.10+ and the version pinned in [requirements-graphify.txt](../../tools/agentkit/requirements-graphify.txt). Create ignored .agent-runtime as described in [the Graphify runbook](graphify.md). The npm agent launcher selects its platform-specific Python path and exposes it as `python` to the unchanged adapter.

Python and graph tooling are development dependencies only. Players and a laptop running the built application do not require Python.

## Environment and exposure

[.env.example](../../.env.example) documents HOST and PORT; real .env files are ignored. Loopback is the default binding. Port zero is supported for isolated tests; a party/tunnel needs a stable positive port.

Tuna is the primary external exposure tool, not an application dependency. scripts/tuna.mjs selects a project-local CLI, TUNA_BIN override or PATH installation. The tuna:login command uses browser login and system keyring storage. start:public coordinates the compiled server and a Tuna HTTP/WebSocket tunnel; tunnel exposes an already-running healthy server. Both use the server configuration parser, require a positive port and disable traffic-body inspection. Credentials stay inside the CLI boundary, outside client bundles, project files and application logs. ngrok remains a manual fallback. The scaffold does not implement game rooms or organizer authorization.

Windows/macOS launchers are provided. Native Windows execution, iOS/Android behavior and carrier/Tuna reachability need their actual environments; local tests cannot establish those results. No CI provider or deployment pipeline has been selected.
