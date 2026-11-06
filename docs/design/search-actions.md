# Search actions, undo and round results

> The executable uses the [first-game design](first-game.md). Below, older round, dealing, scoring and schema behavior applies to compatibility fixtures; shared foundation behavior still applies.

Status: implemented. Players judge physical conditions on trust; software authorizes state changes, not physical performance. State is checkpointed locally by the [session coordinator](session-persistence.md).

## Owners and lifecycle

[createSearch](../../src/server/search.ts) owns one round's frozen assignments, infection groups, mission flags, departures and action dependencies. [createGame](../../src/server/game.ts) owns phases, clocks, completed-role history and result history. Lobby retains identities, validation, authorization and successful request fingerprints. Dealing retains original roles/cards; infection never overwrites those assignments.

At start, each original possessed identity creates one group. Any active member can capture a still-active exorcist into that group when infection is enabled. Captured players receive the group's card, stay in the same physical zone and can continue spreading capture. Any active group member can report release; it releases the entire group and credits that original group once. Released players return to base and cannot act again during that search.

GameSettings.infectionMode defaults to auto and remains editable before starts. Game resolves it into the issued RoundPlan.infectionEnabled; tutorial always disables infection, including when mode is on. All 60 possessed cards have original infection conditions, separate from release. Phones and server actions use the effective flag. Tutorial outcomes use the same ledger/finalization window but are excluded from normal team totals and role history.

Capture and release require unpaused search. Original exorcists can mark/unmark missions during unpaused search, return, or a provisional result period. Any effective capture invalidates their mission credit, even if completed earlier; later release does not restore credit. Undoing that capture can restore eligibility and the earlier mission flag.

Releasing the last group leaves the search timer running so free exorcists can finish missions. The remaining mission time survives the departure of already released players. Game starts the full return phase early if no active exorcist remains or the last active group loses its remaining members through departure. Released players at the base do not keep search open after that departure. Room leave/removal reevaluates the condition immediately after updating the ledger and active roster. A paused search stays paused until manual resume, which performs the same completion check. Undo never reopens a finished search. On pause, only bookkeeping undo is allowed; new captures, releases and mission reports are blocked.

## Dependency-aware undo

The round-local ledger records infection, release, mission and irreversible departure events. Each event has an ID and touched player/group keys. Rebuild occurs once per mutation; personal projections read detached current state. An infection touches its sender, target and group; a release touches the group and all its members. A departure touches the player and its group.

A player can undo its latest non-undone gameplay event only when no later effective event touches the same keys. Independent groups do not block undo. Related chains or later group release block it; undoing those dependent events first can make the earlier event reversible. There is no cascading player rollback. The post-return organizer review can explicitly accept, reject and reorder inbox entries through [reconciliation](offline-play.md). The client sends the expected action ID, while server authorization determines the actor. Undo itself is deduplicated by the existing request journal.

Reversing capture restores that player's original card and mission eligibility; the presentation key changes to close the card. Reversing release removes the group's rescue and restores its members' game state, while return/break instructions continue to take precedence over play state. Finalized and aborted attempts reject further edits. Departed identities cannot issue commands; their ledger events cannot be undone.

## Results, time and departures

At normal return completion game records a provisional RoundResult. It includes original group/exorcist denominators, rescued group count, valid mission count, distinct captured players and active milliseconds. Active time includes placement/search/return, excludes reading, breaks and pauses, and freezes at the last healthy check on a long clock gap.

Mission reports and permitted undos update a provisional row. Without a ritual, a successful next overall deal seals the previous row atomically after validating the new deal. With an active ritual, explicit results confirmation is required first. Failed deals leave it editable. Manual party finish or explicit results:finalize also seals it. Automatic finite-party completion leaves its last row provisional, so base-story missions can still be reported. Extend alone does not seal; the next deal does. Final rows are immutable. The [synchronization barrier](offline-play.md) blocks sealing and new deals until all frozen participants confirm or the organizer explicitly closes waiting.

Aborted attempts are retained as aborted rows, with no contribution to team totals or completed-role history. Result UI excludes them from scored denominators and active-time totals. Attempt IDs remain distinct even when the next attempt uses the same ordinal.

Departure retains frozen denominators, prior captures, mission flags and releases. Player departure, removal and round-only withdrawal do not pause. A group survives its original possessed player's departure when captured members remain; they can spread or release that group. An empty unresolved group yields no rescue. Connection loss alone is presence-only and preserves all game state.

## Protocol, privacy and recovery

[The shared protocol](../../src/shared/protocol.ts) defines PersonalPlay, RoundResult and play:infect/release/mission/undo plus results:finalize. Mutations carry roomId, roundId, gameVersion and requestId; player commands also carry playVersion. Canonical validated fields enter the bounded SHA-256 journal. Cached retries return the current authorized projection; conflicting IDs, stale intent and wrong-phase actions fail before mutation. Clock synchronization runs before command checks.

Public snapshots contain no current-round groups, effective statuses, action ledger, private cards or progress counters during placement, search or return. Only completed/aborted result rows become public. Prior final rows remain visible during subsequent rounds. The organizer has the same public result projection, not private player controls. Public roster names and original opaque assignment metadata do not reveal eligible capture targets: phones list all other current-round participants, and the server rejects ineligible choices generically.

A phone's PersonalPlay contains its own status, effective card, card presentation key, mission eligibility/flag and latest undo identity/availability. It contains no other group's cards or member roles. Reload/reconnect restores this full state through the existing bearer key; reveal remains local and starts closed. Browser storage retains credentials plus the own authorized view and journal in IndexedDB. Multiple tabs share durable sequence allocation. Stable journal events are automatically resent after identity recovery; organizer controls retain manual retry.

## Consumers and verification

Player-local PlayControls confirms named capture/release/mission/undo actions; PersonalCardPanel shows the effective card. Shared ResultsSummary renders aggregate history on both screens. Host-local GameControls owns the infection setting and result finalization. No new dependency, router or global store is required.

[Search rule tests](../../src/server/search.test.ts) verify chained capture, group release, mission loss/restoration, dependency undo, departures, detached projections and sealing. [Real transport tests](../../tests/integration/rounds.test.ts) verify recovery, private projections, replay, phase boundaries and provisional/final results with real Socket.IO. [DOM tests](../../tests/tools/cards-ui.test.mjs) exercise actual React, lobby and connection for card concealment, capture/release/undo and organizer finalization. Browser and public-Tuna evidence belongs under ignored artifacts/search. Desktop engine checks are separate from native Windows, physical phones, camera scanning and human audibility.

The [ritual](ritual.md) consumes confirmed rescuedGroups + missions once. It never changes search rules or publishes current search progress; full capture continues to mean return rather than party defeat. Closed ritual results and later freeplay are summarized separately.
