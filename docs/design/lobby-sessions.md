# Lobby membership and recovery

Status: implemented in-memory lobby; no assignments or round lifecycle yet.

## Ownership and contract

[createLobby](../../src/server/lobby.ts) owns one active room, participant identities, revoked keys, organizer authorization and connection presence. App creates one instance per server and injects it into [Socket.IO](../../src/server/transport/socket.ts). Its interface is execute, disconnect and viewFor; it imports no transport or bootstrap. Identifier and room-code generators can be injected for deterministic tests. No database or repository abstraction is required.

[The protocol](../../src/shared/protocol.ts) defines seven acknowledged commands and the lobby:state event. Runtime validation happens inside the lobby before changes. Anonymous connections receive server:ready only. Authorized organizers and joined players receive explicitly constructed projections; snapshots contain IDs, names, presence, room code, capacity and a monotonic revision, never resume keys or organizer credentials. Snapshots are detached copies. There are no private cards in this stage.

Organizer authorization belongs to a connection and is checked on every control command. The process entry generates a random 12-character code for each launch, passes it into the server and intentionally prints it once in the local startup terminal. This bootstrap display is the sole credential-output exception; request/error diagnostics and the public readiness IPC contain no credentials. The panel stores its code in sessionStorage and authorizes again after each connection. A page URL alone grants no permissions. A new process invalidates the former code.

## Room and membership lifecycle

Creation returns the active room when one already exists. Capacity is 12, including offline participants; the shared laptop does not join automatically. Names use NFKC normalization, collapsed whitespace, a 1-24 Unicode-code-point limit and case-insensitive uniqueness. Control characters are rejected. There is no minimum membership requirement for an empty lobby.

Closing marks connected players as ended and drops the room. Organizer connections remain authorized and can create the next room. Room codes are six random unambiguous characters and are not reused within a process. Close, removal and leave commands identify the expected room so a stale command cannot affect a newer room.

The phone creates a cryptographically random 32-byte key and writes its room code, name, key and pending flag to localStorage before the first join. The server treats this key as a bearer credential. A repeated join with the same key returns the existing participant, even when its first acknowledgement was lost. Matching a name never recovers an identity. Once acknowledged, reconnect uses player:resume rather than creating membership. Automatic and manual retries for the same room retain the saved key: pending joins retry player:join, and acknowledged sessions retry player:resume. An uncertain response does not replace the credential.

Several tabs may attach to one participant. Presence stays online until its final connection disconnects; transport heartbeat detection can delay that update. Disconnection retains the slot. Leave and organizer removal delete membership, revoke its key for the room and notify every connected tab. A new manual join uses a new key. Closing a tab is not leaving the room.

## Client composition and failures

App chooses HostPage with ?screen=host, otherwise PlayerPage. A ?room=CODE invitation pre-fills the player form. Root-query navigation works with the existing production HTML route and Vite proxy; no router is installed. Pages own login/join and action presentation. Client Shared owns the typed connection hook and the common visual shell used by both pages; page slices do not import each other. Page and Shared segment interfaces are index.js exports.

The connection hook creates and cleans up one Socket.IO connection per mounted page, including React StrictMode cleanup. Reconnect requests authorization or player recovery and receives a complete projection. A connection epoch rejects old acknowledgements, and a monotonic revision prevents older snapshots from replacing newer ones. Actions have bounded acknowledgements and no automatic retries. An uncertain response asks the user to inspect the current room before repeating a control action.

Player recovery is scoped to the same browser and origin. A new process has no saved lobby and rejects old keys; the phone offers manual entry. Disabled or failed browser storage is reported before joining because an unpersisted key would strand a participant. This storage is a browser credential, not server persistence. Disk saves and paused gameplay recovery remain future work.

The organizer pastes a public HTTPS origin into the panel; credentials, paths, queries and fragments are rejected. The panel constructs a code-bearing invitation and generates its QR locally using qrcode. This address is presentation state and never changes server/Tuna configuration. Clipboard failure retains a selectable URL. The organizer can join that invitation on a phone without sharing the organizer credential.

## Verification

[Lobby rule tests](../../src/server/lobby.test.ts) cover authorization, normalization and capacity, idempotent joins, multiple tabs, revocation, stale room actions, isolated instances and credential-free detached projections. [Transport tests](../../tests/integration/lobby.test.ts) exercise independent real clients, seven participants, recovery, privacy, removal and replacement server state. [Player form tests](../../tests/tools/player-recovery.test.mjs) use React, DOM emulation, the real connection hook and lobby with controlled packet delivery to verify manual retries after a timeout retain the saved identity for both pending and acknowledged sessions. URL validation has focused tests. Browser evidence is recorded under ignored artifacts/lobby; native phones, QR camera scanning, Windows and mobile-carrier access require their actual environments.
