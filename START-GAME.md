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

## 4. Verify local startup

```sh
npm start
```

Open the [organizer panel](http://localhost:3000/?screen=host). Enter the organizer code printed in the terminal and create a room. The invitation uses a separate room code for players. The [shared display](http://localhost:3000/?screen=display) opens in its own tab.

## 5. Connect phones

**Tuna.** Phones can use mobile data. Install Tuna CLI using its [Windows or macOS instructions](https://tuna.am/docs/guides/install/install-cli/). From the project folder, run `npm run tuna:login` and complete sign-in in the browser. Sign in separately on each computer that runs Tuna.

Stop the previous server with Ctrl+C, then run `npm run start:public`. In the organizer panel, enter the new organizer code and paste the HTTPS origin printed by Tuna into the invitation field. Share the generated link or show the QR code. If Tuna reports `Account tunnel limit`, stop the tunnel on the previous computer.

**Local network.** Connect the laptop and phones to the same network, such as a mobile hotspot. Stop the previous server and run `npm run start:lan`. Enable local connection in the organizer panel, paste the local player address printed in the terminal and generate the invitation.

If Windows prompts for firewall access, allow Node.js on the trusted network. Some hotspots prevent connected devices from reaching each other.

## 6. Start next time

| Mode | Windows | macOS |
| --- | --- | --- |
| Laptop only | `start.cmd` | `start.command` |
| Phones via Tuna | `start-public.cmd` | `start-public.command` |
| Phones on the same network | `start-lan.cmd` | `start-lan.command` |

Keep the launcher open and the laptop awake. Stop with Ctrl+C. On restart, the organizer gets a new code, the saved party returns, and active placement or exorcism resumes only after the organizer lifts the pause.

Players keep their browser session on the same address and browser. A new address does not transfer that session automatically.
