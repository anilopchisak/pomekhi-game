# Shared ritual and confirmed outcomes

> The executable uses the [first-game design](first-game.md). Below, older round, dealing, scoring and schema behavior applies to compatibility fixtures; shared foundation behavior still applies.

Status: implemented. The game remains cooperative without a separate human master. [Product requirements](../product/README.md) own intended rules; [the protocol](../../src/shared/protocol.ts) owns public wire shapes.

## Owners and interface

[createRitual](../../src/server/ritual.ts) owns candle positions, revealed rules, penalties and immutable ritual outcomes. It consumes confirmed round results and exposes snapshots, penalty/undo, a start lock, stop and detached checkpoints. [createGame](../../src/server/game.ts) owns all lifecycle phases and composes the ritual. The existing [session coordinator](../../src/server/session.ts) commits ritual mutations together with the room and request fingerprints before publishing or acknowledging them. No second phase machine, repository abstraction or dependency is introduced.

[The server prophecy bank](../../src/server/prophecies.ts) contains six original, compatible base-only constraints and one final release text. Two different random rules are selected for A/B; C gets the final text. Randomness and IDs are injected. Selected cards are saved in full and never reselected on restore. Public projections omit IDs, titles and text of unrevealed cards. Production assets and development file restrictions keep the whole bank private.

## Defaults and setup

New parties default to seven normal rounds, an optional level-1 tutorial, infectionMode=on and a ritual in finite mode. On enables infection in tutorial and normal rounds; off disables it. Auto retains an infection-free tutorial and normal infection from max(2,ceil(0.75*horizon)). Default levels are 1,1,2,2,2,3,3. The default endless progression horizon is seven, without a ritual. Existing saved horizons and issued effective infection flags remain intact; duration-only edits do not recompute an issued plan.

Ritual enablement locks with the other progression settings at the first deal/start. Endless configuration requires ritualEnabled=false. Initialization occurs at the first normal start, including offline participants, and survives aborted attempts. A stop before normal play creates only a terminal stopped ritual from the last roster. Later arrivals and withdrawals never rescale the goal.

For N initial normal participants and R selected rounds, target T=max(3,round((3*N+7)*R/7)). B=min(round(2*R/7),floor((T-3)/2)); A=max(1,floor((T-2*B-round(3*R/7))/3)); C=T-3*A-2*B. Initial out=0. Seven players/seven rounds yield A=7,B=2,C=3 and 28 required steps. All supported 4-12/1-99 combinations have nonnegative piles and an attainable theoretical budget. This is an initial balance hypothesis, not evidence of live difficulty or win rate.

## Progress and penalties

Each confirmed original-group rescue and eligible exorcist mission advances one candle one position: A to B, B to C, C to out. Always process the leftmost nonempty pile. Captured members add no rescue bonus and a virtual master earns no points. Excess successes are discarded at completion. Tutorial and aborted results never advance the real ritual.

After positive confirmation reveal empty slots in A/B/C order only when all preceding positions are also empty. Empty later slots never reveal independently. Revealed rules remain active after backward movement. Their constraints stack on the physical base only; private tasks, movement and timers are unchanged. Required announcements, rule clarification, technical recovery and safety communication are exempt. Players report violations honestly at base; the program does not infer speech or location.

Each authorized base-phase penalty moves one candle backward from the largest eligible pile B/C/out. Ties choose the farthest pile. A is a floor, and unavailable movement creates no debt. Penalties never reveal cards. Only the last non-undone penalty can be reversed, before another start or confirmation. The event history retains undo and lock evidence, so reload cannot restore an expired undo opportunity.

## Review, end and freeplay

During play the public board contains only previously confirmed progress. After return a separate preview shows provisional successes/remaining steps without revealing hidden rules or declaring a terminal outcome. The last timed phase enters between_rounds even at the selected limit when a ritual is active.

Next dealing and manual party finish reject RITUAL_REVIEW_PENDING until the provisional result is explicitly confirmed. The existing synchronization barrier still comes first: every frozen phone confirms its journal or the host force-closes waiting and resolves conflicts. Results confirmation then seals the ledger, applies its normal round exactly once, reveals rules and checks victory before round-limit defeat. Tutorial results also need confirmation but earn no ritual credit. Failed/repeated/stale commands and lost acknowledgements cannot advance twice.

Zero remaining steps wins immediately, including on the last round. Otherwise the final confirmed round loses. Full capture only ends search and never erases previous achievements or ends the party. Manual finish after review produces stopped, not lost. Aborted rounds retain no credit. Existing result invariants, role fairness and pause/recovery remain owned by their current modules.

After won/lost/stopped, the organizer may confirm party:freeplay. It preserves the terminal ritual, records freeplayFrom as an index into the full result history, disables ritual settings and switches to endless continuation with the original progression horizon and eventual ceiling. The main summary counts only pre-continuation normal rows; extra results are labeled separately. A freeplay finish cannot reopen or extend the closed ritual.

## Protocol, recovery and verification

GameSettings adds ritualEnabled. GameSnapshot adds ritual and freeplayFrom. Existing results:finalize performs explicit review; ritual:penalty, ritual:undo-penalty and party:freeplay use existing organizer authorization, room/round/version checks and successful request IDs. Phones receive the compact board but no new mandatory controls. Offline personal journals and organizer manual retry policies remain unchanged.

Schema version 4 adds private ritual setup, complete selected cards, replayable rounds/penalties/locks, and the freeplay boundary. Versions 1-3 upgrade with ritual disabled, keeping original lengths, infection modes, cards, keys, sealed results and request fingerprints. Historical five-round migration defaults remain five. Validation replays ritual events, cross-checks credited rounds with sealed results and rejects incompatible outcomes rather than replacing a file. Active server recovery remains paused; closed ritual outcomes survive restart.

[Ritual tests](../../src/server/ritual.test.ts) exhaust the supported budget range and cover ordering, concealment, preview, penalties, reveal persistence, undo locks and terminal states. [Game tests](../../src/server/game-ritual.test.ts) cover explicit confirmation, repeated finalization, last-round review, preserved legacy tutorial and freeplay. [Seven-client integration](../../tests/integration/ritual.test.ts) exercises late review, lost acknowledgement, file recovery, private bank exclusion and terminal continuation. Browser acceptance covers production, LAN, 320px and real IndexedDB; physical Windows/mobile/hotspot and live balance remain separate acceptance boundaries.
