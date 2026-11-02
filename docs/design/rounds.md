# Timed rounds and party lifecycle

Status: implemented. Timers coordinate physical play; [search actions and results](search-actions.md) extend these phases. Tutorial and difficulty progression are implemented; music remains future work. [Paused disk recovery](session-persistence.md) is implemented.

## Ownership and state

[createGame](../../src/server/game.ts) owns the authoritative phase, settings, round identity/version, deadlines, paused remainder, active roster, completed normal-round count, tutorial completion, frozen round plan, original progression horizon and private role history. It composes [dealing](../../src/server/dealing.ts), which owns cards/readiness but no independent phase. Lobby retains authorization, membership, command journals, sound ownership and room lifetime. Neither game nor dealing imports transport or bootstrap.

The lifecycle is lobby -> reading -> placement -> search -> return -> between_rounds or finished. Reading and breaks are untimed. Starting is always manual; automatic transitions only connect the three timed phases and their completion. A new deal and its start are separate actions. Canceling reading restores its preceding waiting phase without resetting party progress.

Defaults are five rounds and 45/180/45 seconds. Initial finite length accepts 1-99, or null for endless. Length/mode lock on the first start, even if that round is aborted. Durations accept integer seconds from 1 to 3600 and can change in lobby, reading or a break. They cannot change during an active or paused round. A finished finite party can extend its limit to completedRounds + 1; subsequent extensions may exceed the initial 99-round setting limit. An endless party finishes manually in a break.

Start requires a valid 4-12-player assignment composition and no replacement requests. Unready/offline members require explicit confirmation. The server rechecks these requirements independently of the UI. All-ready never starts a round. During timed play, including pause, card mutation, shuffle and cancel-deal commands are rejected. Completed/canceled round cards remain readable until the next deal; their readiness controls stay closed.

Normal return completion increments completedRounds exactly once. An early search finish starts the full return duration, including when search was paused. Abort stops the timer, announces return to base and enters a break without credit. The separate cancel-deal operation is available only during reading. New deals and finalization wait for the [offline synchronization barrier](offline-play.md).

At start the game freezes the active roster and original possessed IDs. Successful return completion updates only their private possessed-round history. A later deal shuffles IDs uniformly, then stably orders them by that history before selecting possessed players. Equal history therefore retains random tie selection; initial selection is uniform. Reading previews, reshuffles and aborts do not add history. Departed identities are revoked, and their history is released. No role totals or history are public.

## Pause, membership and time

Pause retains the phase and exact remaining milliseconds. Players stop actions and wait at a safe place. Resume is manual and uses the remainder rather than a new full phase duration.

Lobby pauses when the server detects loss of the last authorized organizer connection. Reauthorizing the same live panel does not disconnect it; another authorized panel prevents that automatic pause. Reconnection never automatically resumes. Heartbeat detection can delay the recognition of a lost network connection.

A new participant during reading receives an assignment as before. New arrivals during timed phases, including pause, or breaks wait for the next overall deal. Existing participants restore the same private assignment. An ordinary phone disconnect retains its slot/card and does not pause the game. Explicit departure/removal revokes only that player's assignment and keeps the round running. Round-only withdrawal retains membership and assignment until the next deal. Resume with a changed roster requires confirmation, even if the reduced composition is unsuitable for a new deal. An empty active roster cannot resume; search ends through the existing completion rule, or the organizer can abort. Removing a waiting participant does not pause the round.

Game receives an injectable GameClock with monotonic now, wallNow and a cancellable scheduler. Production uses performance.now, Date.now and setTimeout. One scheduled check runs at most one second later or at the phase deadline. The countdown is deadline-based; delayed callbacks do not subtract fixed ticks. Transitions start the next phase with its full duration.

A control gap over five seconds, or a wall/monotonic discrepancy over five seconds, pauses with the last healthy checked remainder. This handles suspended laptops without fast-forwarding through missed phases; a large system-clock adjustment conservatively pauses too. Commands synchronize the clock before acting, so a command arriving ahead of the overdue callback cannot bypass this rule. Timer callbacks carry an invalidation generation. Pause, room close and server disposal cancel timers and invalidate retained callbacks.

## Protocol and publication

[The protocol](../../src/shared/protocol.ts) owns GameSnapshot, GameSettings, GameCue and commands. Public game state contains phase, version, round ID/number, completed count, settings, pause reason, server clock/deadline, remainder and active participant IDs. These IDs indicate participation, not roles. Authorized player views still contain only their own assignment.

Organizer controls are game:configure, round:start/pause/resume/return/abort and party:finish/extend. Each carries roomId, gameVersion, roundId and requestId; start/resume also carry explicit warning confirmation. Runtime validation precedes mutation. Existing canonical SHA-256 request journals prevent repeated actions, with per-principal limits and stale version checks. Cached successful retries return the current projection without repeating a transition, completion or cue. Server clock checks and read-only lobby:sync do not consume journal entries.

Lobby exposes subscribe and dispose in addition to execute/disconnect/viewFor. Domain commands notify after mutation; the session coordinator holds notifications until the checkpoint commits. Automatic callbacks enter the same queue and publish without a network command. Socket transport subscribes once, publishes authorized projections and releases its subscription on engine close. The server factory drains/checkpoints the session and closes transports within its bounded close contract.

## Browser clocks and sound

Shared API derives an offset between server monotonic time and browser performance.now using acknowledgement midpoint samples. Push snapshots do not replace an established offset. Reconnection discards old offset/view/cues and recovers identity; visibility return and 30-second timed-phase polling request a fresh authorized state/time sample. Device wall clocks are not used. Shared RoundStatus owns its local countdown hook and renders the countdown, but never changes phase at zero. Offline timing is labeled unconfirmed and directs players to the shared screen.

Host-local GameControls owns settings drafts and confirmations. Unsaved settings block start. Player-local cards remain revealable while actions become read-only outside reading. No router, global store or new dependency is needed.

Organizer-only organizer:audio selects one connected sound panel, independently of game controls. Explicit enable/test clicks create/resume Web Audio. Round-control gestures also resume the selected context with a 250ms bound; a dialog can suspend Safari audio after its handler returns, so a still-current live cue can resume that context within its two-second freshness window. A superseded cue is canceled. SoundControls uses a quiet synthesized tone with gain ramps, volume and mute. Playback reads current volume/mute settings even when a live cue waits for audio resume. Phones never create audio contexts. A game:cue is an ephemeral event sent only to the selected panel after its state snapshot; it is not part of recovered state. Client connection epoch, room/version, two-second freshness and consumed-identity checks reject stale/repeated cues. Changing volume, mute or ownership does not replay a cue. Audio failure does not affect server timing. Closing the room clears sound ownership.

## Verification and limits

[Game rules](../../src/server/game.test.ts) use controlled monotonic/wall time and schedulers for phase boundaries, pauses, suspension, membership, fairness, abort/finish and callback disposal. [Real Socket.IO tests](../../tests/integration/rounds.test.ts) exercise independent clients, spontaneous publications, host/phone disconnections, recovery, waiting entrants, permissions, request replay and sound ownership. [DOM checks](../../tests/tools/cards-ui.test.mjs) retain real React/connection/lobby with controlled delivery, including audio API calls and lost acknowledgements.

Browser/Tuna evidence is kept under ignored artifacts/rounds. Desktop Chromium/WebKit and 320px layouts do not establish native Windows, physical iOS/Android, QR camera scanning, actual speaker audibility or separate carrier-network behavior. A full restart restores the last successful disk checkpoint. Active phases are paused with server_restarted; reading, breaks and finished states remain untimed. Downtime and old sound cues are excluded.

## Tutorial and progression

Game owns planRound and freezes a RoundPlan when dealing: kind, number (0 for tutorial, 1-based for normal rounds), target difficulty and effective infection. Shuffle, replacement and reading newcomers retain the level. Changing infection mode during reading updates only the effective infection flag; starts lock all timed-round settings. Public projections expose the frozen plan or the next plan when no deal exists, never another participant's role/card.

The default optional tutorial precedes five normal rounds. Shared status provides a briefing and role-specific practice guidance; phases, manual start, readiness and actions use their existing boundaries. Tutorial always uses level 1 without infection. Normal return completion marks tutorialCompleted without incrementing completedRounds or private role history. Its result is separately labeled and excluded from team totals and normal active time. Aborting either kind preserves progression position; aborted tutorial is retried.

Settings default to initialDifficulty=1, maximumDifficulty=3 and infectionMode=auto. The original finite length, or five for endless, is the progressionRounds horizon. Normal level is initial + round((maximum-initial)*(number-1)/(horizon-1)); the single-round case uses initial, and rounds after the horizon use maximum. Default levels are 1,2,2,3,3. Auto infection starts at max(2,ceil(0.75*horizon)). Persistent on/off overrides affect normal rounds only. Extension changes the round limit but never the horizon. Normal completion alone advances both progression and role history.

Progression settings lock while reading and after first start, including a tutorial start. Before first start, cancel reading to reconfigure. Durations and infection mode remain editable in existing waiting/reading phases. Server validation, not client controls, enforces these rules. Provisional tutorial results have the same mission/undo/finalization window as normal results.

[Progression tests](../../src/server/progression.test.ts) cover short/long/endless parties, fixed levels, aborted attempts, settings locks, infection overrides, extensions and frozen restoration. Real transport tests exercise a tutorial followed by normal rounds with seven independent phones.
