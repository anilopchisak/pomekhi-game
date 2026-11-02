# Session persistence and paused recovery

Status: implemented. The executable uses one local data/session.json checkpoint. Factories default to memory unless a SessionStore is supplied. Supplied launchers select the project working directory. Keep the data directory on one local machine; network/shared filesystems are outside this contract.

## Owners and private format

[createSession](../../src/server/session.ts) coordinates the synchronous [lobby](../../src/server/lobby.ts), commands, disconnects and scheduled callbacks through one promise queue. Lobby owns authorization and identity, [game](../../src/server/game.ts) owns time/round history, [dealing](../../src/server/dealing.ts) owns assignments, and [search](../../src/server/search.ts) owns its frozen roster and action ledger. Each exports detached data and explicitly restores its own state. Domain owners import no filesystem adapter.

[SavedSession](../../src/server/session-format.ts) is a server-only versioned JSON contract, separate from the public protocol. Validation rejects incompatible schemas, malformed cards/settings, duplicated identities, invalid references and malformed request journals. The 16 MiB file ceiling bounds loading/writing; exceeding it stops saving visibly instead of truncating history. Schema changes require an explicit migration or the retained-file reset path.

The snapshot includes the room, normalized names, bearer keys, revoked keys, used room codes, all issued cards in full, readiness, replacements, waiting phase, phase/remainder, active time, frozen search roster, infection/release/mission/undo ledger, provisional/final/aborted results, role history and canonical successful-request fingerprints. Loading never reselects an issued card from the current bank.

Connections, presence, authorization, sound owner, cues and browser reveal state are transient. The organizer code is generated afresh per process and never saved. Only public persistence mode/state/recovered flags enter LobbyView; saved cards, keys and journals remain private. Production static files exclude data; Vite explicitly denies data paths, including raw requests. Local access to the save grants access to participant credentials. Files use restrictive creation modes; Windows ACLs follow the account's directory permissions.

## Commit ordering and clocks

A command or timer callback mutates the domain inside the queue. The coordinator captures its notifications, writes the complete snapshot, then publishes authorized projections and acknowledges success. Another queued operation cannot observe a partially written transaction. Healthy timer callbacks checkpoint the remainder and accumulated active time about once per second without journal entries or a version increment for each tick. Slow storage delays checks; existing control-gap detection conservatively pauses rather than skipping phases.

The [file adapter](../../src/server/session-store.ts) writes a unique temporary file in the same directory, syncs and closes it, renames it over session.json, and syncs the directory on POSIX. Windows uses the synced file plus rename; Node does not expose the same directory-sync contract there. An unfinished temporary file is ignored on load. No older automatic backup is selected, because it could resurrect a closed room or revoked credential. One retained checkpoint bounds the feature's scope.

The writer creates a unique PID/nonce claim in data/.writers before reading or writing. Any other live claim rejects startup, including another adapter in the same process. Simultaneous contenders may both fail safely and can retry. Cleanup removes only uniquely named claims of exited PIDs; it never removes a live writer's replacement claim. PID reuse fails conservatively. A crash automatically releases process liveness; the next startup reclaims stale claims. This is a local-process protocol, not distributed locking.

## Startup, restart and shutdown

[Runtime](../../src/server/runtime.ts) awaits initialization before listening. Lock/acquire failure aborts startup. A corrupt or unreadable save instead opens a recovery-only server: the organizer can authorize and retry/reset; game mutations and ambiguous phone recovery are blocked. Cancellation during loading prevents late listening/readiness. Closing drains the queue and writes one final checkpoint while closing transports, inside the existing two-second deadline. A timeout fails shutdown; an in-flight filesystem operation may finish later, so ownership is retained until that operation settles or the process exits.

Restoration advances projection/game/deal versions; inbox receipts and action IDs remain stable, while legacy play versions advance while preserving room, assignment, action and round IDs. Active phases restore paused with server_restarted and the last committed remainder/active time. Reading, breaks and finished states retain their phases. Fresh monotonic clock anchors exclude downtime. No timer runs until a manual resume; old cues are absent. All presence starts offline. Existing phone keys restore the same identity on the same browser/origin; the host must enter its new terminal code and reselect sound ownership.

Successful request IDs survive restart. Retry lookup still precedes stale-version checks and returns the current authorized view. An unsent old intent instead fails its version check. Room closure writes room:null and retains used codes, preventing resurrection of the closed party.

## Failure and recovery controls

A write failure withholds successful acknowledgement and publication. The coordinator reads back the primary file because rename may have committed before a later sync error. Otherwise it restores the last known committed checkpoint, reconciles live connections and freezes active play with storage_error. No new gameplay is permitted until recovery succeeds. The failure notification contains a generic public status, never filesystem contents or credentials.

Only an authorized organizer can use storage:retry or storage:reset. Retry loads/validates the primary and commits a freshly versioned paused state before clearing the error. Reset requires confirm:true and first preserves the original file as a diagnostic copy in data, then writes an empty room. A bad file is never replaced automatically. Browser recovery retains its key on STORAGE_UNAVAILABLE so temporary disk failure cannot strand a valid player. The status screen remains available even without an active room.

## Verification

[Coordinator tests](../../src/server/session.test.ts) cover each timed phase, reading/readiness/replacement, results, capture chains and causal undo, write-before-ack ordering, failed writes, post-rename failures, cached/stale requests, revocation and closure. [File tests](../../src/server/session-store.test.ts) use temporary directories for actual atomic replacement, incomplete temp files, writer exclusion, damaged/schema-invalid files and diagnostic retention. [Process tests](../../tests/integration/persistence.test.ts) kill/restart the compiled executable and restore seven independent Socket.IO clients; runtime loading cancellation is tested separately. Existing transport, proxy, launcher and browser behavior remains required. Native Windows/physical phone acceptance remains separate from macOS engine evidence.

## Progression format and legacy migration

Version 2 adds tutorial completion, the original progression horizon, frozen RoundPlan, dealing difficulty, progression settings and result metadata. Active phases restore the issued plan unchanged on pause; cards remain full snapshots and are never reselected from the bank. Validation accepts levels 1-3, requires a simple infection-free tutorial and counts only regular completed results against completedRounds. Tutorial success must agree with tutorialCompleted.

The file adapter upgrades version 1 through detached version-2 data into version 3 before validation. Existing parties retain tutorial disabled, initial/maximum level 1 and their previous manual infection flag as on/off. Cards, timing, scores, credentials and request fingerprints remain unchanged. An unstarted party can cancel its deal and configure progression; new rooms use new defaults. Legacy result infection settings use null because later break settings may have changed. A retained capture event proves infection was enabled for the retained deal, independently of the next-round mode. Successful initialization writes the migrated state through the existing atomic path. Invalid legacy data and unknown schemas retain the recovery-only/reset behavior.

Version 3 adds venue names, frozen review names, inbox entries/receipts, review decisions and completion confirmations. Version 2 receives default zones and an inbox baseline from its retained search without changing issued cards or sealed results. The current inbox is rebuilt and checked against the validated search ledger on load. See [offline reconciliation](offline-play.md).

[Format tests](../../src/server/session-format.test.ts) exercise legacy lobby, reading, active, break and finished snapshots. Coordinator recovery tests retain tutorial results and later level-3 issued cards across restarts.
