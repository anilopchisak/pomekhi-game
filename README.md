# Oderzhimye

A cooperative horror party game with a shared laptop display and private phone assignments. Product copy is Russian; project and agent documentation is English.

The executable runs [First Game and Ordinary](docs/product/current-implementation.md) under the [accepted rules](docs/product/README.md): seven rounds, persistent possession and the original candle budget.

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
5. Stop with Ctrl+C. The program saves to data/party-v8.json and restores the room on restart; active phases return paused. Enter the new organizer code from the startup terminal. Organizer authorization lasts for its browser tab, while phones store their own recovery key locally. Keep the organizer code separate from the invitation.

The public origin field accepts HTTPS without credentials, additional paths, query parameters or fragments. It generates invitations only; it does not reconfigure Tuna. Browser storage must be available before entering. If clipboard copying is unavailable, select the invitation URL manually.

## Deal and read cards

Save the base, at least one permitted location and the optional mission categories. Once 5–12 participants have joined, deal from the laptop. The organizer participates from a phone. At later deals only confirmed returners receive new cards. Players still in groups keep their existing cards and location.

Phones open cards privately, mark readiness or request replacements. Readiness never starts the timer. Start the round from the laptop after the first story. Replacement retains the recipient's role and does not change anyone else's card.

## Run rounds

The laptop starts 45 seconds of placement followed by four minutes of exorcism. Exorcists explore individually. At ordinary or early recall, free players return and unreleased groups stay in their locations. Open checking from the laptop, confirm physical status independently from connectivity, settle delayed phone reports, then confirm the result. A sole returning medium can continue as the next exorcist.

Pause preserves the phase and remaining time. The laptop can stop the party and recall everyone. Victory, seventh-check defeat and confirmed full possession also recall everyone and close the party. Use the sound control on one laptop panel and test volume before play. See [first-game design](docs/design/first-game.md).

## Atmosphere and broadcast

Open the broadcast link from the organizer panel or visit `/?screen=display`. It uses the same private organizer code and shows the public timer, instructions, ritual and results without game controls. Select one sound panel, test the volume, and optionally enable fullscreen. Background, signals, effects, mute and CRT visuals have separate controls. Procedural sound works locally without audio downloads; voice remains future work.

Each player can explicitly enable and test rare phone effects. The default phone level is 15 percent, with a 30-percent maximum. A regular search of at least 40 seconds gives each already-enabled player a 50-percent chance of one short effect; tutorial has none. Hidden tabs, disconnect, pause or release cancel pending effects without replay. Re-enable after hiding or reconnecting. The organizer can disable phone effects globally; that switch is off after server recovery. See [atmosphere design](docs/design/atmosphere.md) and check actual speakers and phones before the party.

## Local connection and offline phones

Build, then run `npm run start:lan` (or start-lan.command / start-lan.cmd). Connect laptop and phones to the same hotspot. Copy the printed Local player address into the organizer panel with Local connection enabled; generate a separate link/QR. Allow Node through the Windows firewall on the private network if prompted. The laptop panel still opens on localhost. Reachability depends on hotspot client isolation and device limits. Choose Tuna or LAN before joining; changing origin does not transfer phone storage.

Open the HTTPS Tuna invitation while online and wait for the phone to confirm offline preparation. The installed production shell can reload offline. LAN HTTP and development support an already-open tab; offline reload is not guaranteed there. Each phone durably saves only its own card, authorized state and action queue in IndexedDB. Keep the same browser and address.

Release, capture, mission and undo can be recorded without a connection. For received infection, select the source and read its screen physically. Labels distinguish saved-on-phone, confirmed and review states. Reconnect sends the queue after restoring identity. At base, wait for all phones and resolve conflicts on the laptop; explicitly closing waiting discards missing/disputed records from scoring. Finalization and a new deal wait for this barrier. See [offline design](docs/design/offline-play.md) and the [device checklist](docs/testing/device-acceptance.md).

## Saved party and recovery

Normal development/production launch uses one private data/party-v8.json under the working directory (the supplied launchers use the project root). Keep data on local disk. Start one instance per directory; a second writer fails startup. A killed process leaves a uniquely named claim that a later launch removes after confirming its owner has exited. Do not copy data into a public directory or send it to players: it contains bearer keys and private cards. Programmatic test servers default to memory; disk tests use temporary directories.

After restarting, use the new organizer code printed in the terminal. Phones recover on the same address and browser. Active placement and exorcism restore paused; continue manually after checking everyone. Sound ownership must be selected again. Closing the room saves an empty checkpoint, so it stays closed after restart.

The laptop panel reports storage errors. Fix disk access/free space, then use the retry button. A damaged/incompatible save is retained; the confirmed reset button first keeps a diagnostic copy, then clears the party. No automatic fallback, cloud copy or save catalogue is provided. See [persistence design](docs/design/session-persistence.md) for commit and failure behavior.

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

If the server is already running, open a separate terminal and use `npm run tunnel`. This command verifies local Oderzhimye health first and exposes the configured HOST/PORT. A fixed positive PORT is required. Traffic-body inspection is disabled. The default Tuna region is Russia; the free plan supports the HTTP/WebSocket tunnel used by this app. A first-visit browser warning can appear before the application.

No automatic installer, account registration, API-key forwarding or subscription purchase is performed by project commands. ngrok remains an optional manually operated fallback, not the primary launcher. Organizer authorization, private cards and round controls stay on the local server; the public invitation grants player entry only.

For a machine-local Node, use `.runtime/node/bin/node scripts/project.mjs tuna:login` or `.runtime/node/bin/node scripts/project.mjs start:public` on macOS. Other machines should follow normal Node setup above.

## Shared ritual

New finite parties use candles A → B → C → out and six original base-only prophecies. Seven players/seven rounds need 28 successful steps; the goal scales and freezes at the first normal start. Tutorial and canceled rounds earn none. After returning, synchronize phones, resolve disputes, report base penalties and explicitly confirm the round. Only then do candles advance and rules open. Victory is immediate; an incomplete final ritual loses. Full capture only ends search. A confirmed continuation keeps the outcome and shows extra freeplay results separately. Existing saved parties retain their former settings with the ritual disabled. See [ritual design](docs/design/ritual.md).

## Edit and transfer cards

Open /?screen=editor from the laptop panel with the organizer code, then explicitly load the secret bank. Names and task text remain hidden until opened. Save edits or enable/disable cards in lobby, breaks, after the party or without a room. Reading/timed rounds are read-only. Export downloads the full bank JSON; import previews additions/changes/removals and replaces it after confirmation. Issued cards never change.

The edited bank survives room closure and restart. Each room has independent role/level deck cycles; all issued cards consume usage, even tutorial and canceled previews. Reuse starts after the admissible pool is exhausted, without prematurely lowering difficulty. Capacity errors ask you to enable more cards. A confirmed full corrupted-save reset restores the standard bank and retains the original file. See [catalog design](docs/design/card-catalog.md).
