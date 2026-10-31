# Pomekhi

A cooperative horror party game with a shared laptop display and private phone assignments. Product copy is Russian; project and agent documentation is English.

**Current status: runtime foundation.** The page shows a real Socket.IO connection state. HTTP health, production bundling, tests and agent tooling are configured. Rooms, private assignments, round timing, infection, task editing, persistence and atmosphere audio are planned rather than implemented. See [product requirements](docs/product/README.md).

The client uses App and Pages layers from Feature-Sliced Design. The foundation screen exposes one public interface, with page-local behavior and CSS Modules. The server and cross-runtime protocol remain separate. See [architecture](docs/agent/architecture.md) for placement and ESLint import restrictions.

## Application setup

Install the Node.js version in [.nvmrc](.nvmrc), including its bundled npm. Then, from this directory:

```sh
npm ci
npm run env:check
npm run dev
```

Open `http://localhost:5173`. The API/socket server uses port 3000; Vite proxies requests to it. Optional local overrides go in .env using [.env.example](.env.example).

For a production-mode foundation:

```sh
npm run build
npm start
```

Open `http://localhost:3000`. Stop the processes with Ctrl+C. `dev.command` / `start.command` are macOS launchers; `dev.cmd` / `start.cmd` are Windows launchers. They require installed dependencies and the pinned Node runtime. Start requires an existing build. These local-only launchers do not start a tunnel. For a shared Internet link use start-public.command on macOS or start-public.cmd on Windows after Tuna login.

If this machine has ignored `.runtime/node`, the project command wrapper can select that local Node without changing global installations:

```sh
.runtime/node/bin/node scripts/project.mjs dev
.runtime/node/bin/node scripts/project.mjs build
.runtime/node/bin/node scripts/project.mjs start
```

The `.runtime` directory is machine-specific; Windows users should install Node normally or provide `.runtime/node/node.exe` from the official portable distribution.

## Checks

```sh
npm run lint
npm run typecheck
npm run test:ci
npm run build
npm run test:integration
```

Integration tests require the build and use real local HTTP/Socket.IO connections. No game API key, ngrok account or external server is required for tests.

## Agent tools

Create the separate Graphify environment using [the runbook](docs/agent/graphify.md), then run:

```sh
npm run agent:doctor
npm run agent:quick
npm run agent:graph:sync
npm run agent:graph:eval
npm run agent:check
npm run agent:report
```

Sync can return `semantic-required` with exit code 2. The current agent must finish the returned document jobs and repeat sync. It is not a successful graph refresh until that work is complete. See [AGENTS.md](AGENTS.md) and [GUIDES.md](GUIDES.md).

## Public access with Tuna

Tuna is the primary public-tunnel provider. It is an external CLI, not an npm or browser dependency. Install it using the [official instructions](https://tuna.am/docs/guides/install/install-cli/), or put its official executable at .runtime/tuna/tuna on macOS or .runtime/tuna/tuna.exe on Windows. The current Mac has the signed CLI in that ignored local directory. Set TUNA_BIN in .env only when using a different executable path.

Log in once through the browser; Tuna owns the session in the operating-system keyring. Keep credentials out of project files and chat:

```sh
npm run tuna:login
```

Build and start the server plus tunnel together:

```sh
npm run build
npm run start:public
```

The double-click equivalents are start-public.command and start-public.cmd. The launcher opens the tunnel only after its own application process reports listening. It stops the owned server and Tuna process together on termination or a process failure. Share the HTTPS URL/QR code printed by Tuna. The laptop must remain online and awake. Set TUNA_SUBDOMAIN in .env to the exact free name assigned to your account if you want the URL to survive tunnel restarts; do not choose an arbitrary paid name.

If the server is already running, open a separate terminal and use `npm run tunnel`. This command verifies local Pomekhi health first and exposes the configured HOST/PORT. A fixed positive PORT is required. Traffic-body inspection is disabled. The default Tuna region is Russia; the free plan supports the HTTP/WebSocket tunnel used by this app. A first-visit browser warning can appear before the application.

No automatic installer, account registration, API-key forwarding or subscription purchase is performed by project commands. ngrok remains an optional manually operated fallback, not the primary launcher. Game rooms and organizer authorization are still future implementation, so this foundation is a connectivity preview.

For a machine-local Node, use `.runtime/node/bin/node scripts/project.mjs tuna:login` or `.runtime/node/bin/node scripts/project.mjs start:public` on macOS. Other machines should follow normal Node setup above.
