# Start Oderzhimye on another computer

Install the environment and build the game once. After that, open the launcher for your connection mode.

## 1. Copy the project

Copy the source folder `game_project` to the new computer, for example to `C:\Games\game_project`. The designer archive contains documents and screenshots; to run the game, you need the folder with `package.json`, `src` and `scripts`.

Skip `node_modules`, `.runtime`, `.agent-runtime`, `.agent-state`, `dist` and `.env`. Set up the new computer separately.

To move the saved party and edited card bank, first stop the game with Ctrl+C, then copy the `data` folder too. Without it, the game starts with the standard bank. The save contains private cards and player credentials. Keep it on the organizer's computer.

## 2. Install Node.js

Use Node.js 26.13.0 and npm 11.20.0, as pinned in `.nvmrc` and `package.json`. Open a new PowerShell window on Windows or Terminal on macOS and verify:

```sh
node -v
npm -v
```

## 3. Prepare the project

Open a terminal in `game_project`. On Windows, for the example path above:

```powershell
cd C:\Games\game_project
```

Run these commands in order:

```sh
npm ci
npm run env:check
npm run build
```

Initial setup needs Internet access. Ordinary play does not need Python or Graphify.

## 4. Quick launch

Run one of these commands from the project folder after setup. Stop any previous game server with Ctrl+C before switching modes.

**Phones via the Internet.** Install the Tuna CLI and sign in once on the computer running the game. See the [Tuna installation guide](https://tuna.am/docs/guides/install/install-cli/).

```sh
npm run tuna:login
```

For each party:

```sh
npm run start:public
```

The organizer panel opens and signs in as soon as the local server is ready. Click **Create room**. When Tuna connects, the invitation and QR appear automatically. Phones can join over Wi-Fi or mobile data. If Tuna reports `Account tunnel limit`, stop the other tunnel first.

**Phones on the same Wi-Fi or hotspot.** Connect the laptop and all phones to the same network.

```sh
npm run start:lan:auto
```

The organizer panel signs in and creates a room with a LAN link and QR. If a room already exists, it opens that room. Use `npm run start:lan` for the same sign-in and address setup with manual room creation.

**Laptop only.** Use this command to open the local panel and sign in automatically, then create a room manually.

```sh
npm start
```

| Mode | npm command | Windows launcher | macOS launcher |
| --- | --- | --- | --- |
| Laptop only | `npm start` | `start.cmd` | `start.command` |
| Phones via Tuna | `npm run start:public` | `start-public.cmd` | `start-public.command` |
| LAN with automatic room creation | `npm run start:lan:auto` | | |
| LAN with manual room creation | `npm run start:lan` | `start-lan.cmd` | `start-lan.command` |

If the browser cannot open automatically, use the organizer panel address and code printed in the terminal. Enter the Tuna or local player address in **Invitation** if needed. When several network interfaces are active, set `POMEKHI_LAN_ADDRESS` to the laptop IPv4 address reachable by the phones, or change the address in the invitation dialog. On Windows, allow Node.js through the firewall on the trusted network if prompted. Some hotspots and guest networks isolate devices.

Keep the launcher open and the laptop awake. Stop with Ctrl+C. Restart restores the saved room. An active timed round resumes after the organizer lifts the pause. Players keep their browser session on the same address and browser. A new address requires players to open the new invitation.
