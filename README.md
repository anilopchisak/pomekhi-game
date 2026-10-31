# Pomekhi

A cooperative horror party game with a shared laptop display and private phone assignments. Product copy is Russian; project and agent documentation is English.

**Current status: runtime, lobby, private cards and timed rounds.** One in-memory room supports organizer authorization, invitations with QR, up to 12 participants and browser identity recovery. Private cards, readiness, individual replacement and overall reshuffle/cancellation are implemented. Timed placement/search/return, pause and short laptop signals are implemented. Release/infection, results, task editing, server persistence and atmosphere music remain planned. See [product requirements](docs/product/README.md).

The client uses App, Pages and Shared layers from Feature-Sliced Design. Organizer and player pages expose public interfaces; Shared owns their common connection and CSS Module shell. The server and cross-runtime protocol remain separate. See [architecture](docs/agent/architecture.md) for placement and ESLint import restrictions.

## Application setup

Install the Node.js version in [.nvmrc](.nvmrc), including its bundled npm. Then, from this directory:

```sh
npm ci
npm run env:check
npm run dev
```

Open `http://localhost:5173`. The API/socket server uses port 3000; Vite proxies requests to it. Optional local overrides go in .env using [.env.example](.env.example).

For production mode:

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

## Open the lobby

1. Start the application. Its terminal prints an organizer panel URL and a private 12-character organizer code. In development the panel uses port 5173; production uses the actual bound application port.
2. Open the panel on the laptop, enter that code and create a room. The laptop does not count as a participant.
3. For remote phones, start Tuna as described below and paste its public HTTPS origin into the panel. Use the generated invitation link or QR; a manually opened player page asks for the six-character room code and a name.
4. Join from one phone per participant, including the organizer. Refresh/reconnect retains membership in the same browser and origin. Closing a tab retains its slot; explicit leave or organizer removal releases it.
5. Stop with Ctrl+C. This stage stores the room only in memory: restarting requires a new room and invalidates previous credentials. Organizer authorization lasts for its browser tab, while phones store their own recovery key locally. Keep the organizer code separate from the invitation.

The public origin field accepts HTTPS without credentials, additional paths, query parameters or fragments. It generates invitations only; it does not reconfigure Tuna. Browser storage must be available before entering. If clipboard copying is unavailable, select the invitation URL manually.

## Deal and read cards

After 4-12 participants join, select the possessed count on the laptop (default three, limited to half the roster) and deal. Offline participants also receive cards. Phones open cards privately, mark readiness and request replacement; only the organizer can issue a different card. Readiness never starts a timer.

A single replacement preserves its role and all other participants. A full confirmed reshuffle redistributes roles/cards and clears readiness/requests. Late joiners during reading get one assignment without affecting existing cards. During timed phases they wait for the next deal. Departure removes only that participant; the laptop warns about an unsuitable composition. Cancel restores the previous waiting phase without removing membership or completed-round progress. Phones recover the same card and readiness on refresh/reconnect, initially concealed. The original 24 introductory cards contain no infection.

If a command times out, inspect current state before using the visible manual retry. The retry retains its original identity and cannot issue a second card change. A complete server restart still clears all room/card state. The task-bank editor and release/infection actions remain future work.

## Run rounds

Open the round settings on the laptop. Defaults are five rounds, 45-second placement, 180-second search and 45-second return; endless mode is available. Save changes, deal cards, then manually start. Unready/offline members require confirmation; replacement requests and an unsuitable composition block start. Readiness never starts the timer.

The server advances placement, search and return automatically, then waits for a manual next deal/start. Pause preserves the phase/remainder and instructs players to stop safely. Loss of the last organizer panel or explicit active-player departure pauses; a phone connection loss does not. Resume stays manual. Early search finish starts return; abort returns everyone to base without credit. A finished finite party can add another round.

Use the explicit sound button to select one laptop panel, then test volume before play. Phones remain silent. Refresh restores current phase/card; laptop sleep causes a conservative pause rather than replaying missed phases. Full program restart still loses state. See [round design](docs/design/rounds.md).

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

No automatic installer, account registration, API-key forwarding or subscription purchase is performed by project commands. ngrok remains an optional manually operated fallback, not the primary launcher. Organizer authorization, private cards and round controls stay on the local server; the public invitation grants player entry only.

For a machine-local Node, use `.runtime/node/bin/node scripts/project.mjs tuna:login` or `.runtime/node/bin/node scripts/project.mjs start:public` on macOS. Other machines should follow normal Node setup above.
