# Game requirements and implementation status

Source: the user's game-planning decisions in this chat before the project setup request. These are intended rules, not claims that the scaffold implements them. Current requests can revise them explicitly.

## Implemented now

The browser provides an organizer panel and a phone lobby. One locally saved room supports up to 12 participants, code/name entry, HTTPS invitations with locally generated QR, separate organizer authorization, participant removal/leave and identity recovery after reconnect or refresh. The organizer joins from a phone; the laptop does not consume a slot. A full restart restores the last saved lobby and phone credentials; the organizer code changes. HTTP health and Socket.IO readiness retain the foundation-stage contract; the authorized lobby snapshot establishes actual membership.

Private-card dealing and untimed reading are implemented with a 90-card three-level bank. Players reveal/hide cards, mark readiness and request replacements; the organizer replaces one card, reshuffles all roles/cards or cancels. Timed rounds, pause, finite/endless parties and short laptop signals are implemented. Release/infection, mission scoring, undo and team results are implemented. Paused disk recovery, durable offline actions, synchronization review, named zones and local invitations are implemented. Shared candles, revealed prophecies and ritual victory/defeat are implemented. Editor, music and voice remain future work. See [lobby design](../design/lobby-sessions.md) for current authorization and recovery behavior.

[The shared protocol](../../src/shared/protocol.ts) owns current wire shapes. Add game wire contracts with their implementation owner, rather than treating prose as an already published API.

## Participants and access

The organizer participates. The laptop provides the shared display and is the only place for dealing cards, starting rounds, pausing and changing stages. Phones provide private cards and game actions. Players join through a link/QR code, room code and name without accounts.

The primary deployment is a local laptop server plus free Tuna access over mobile Internet. A separate LAN launch supports a shared hotspot without a tunnel when clients can reach the laptop. Windows and macOS are laptop targets; iOS Safari and Android Chrome are phone targets. No paid hosting or runtime AI service is required. The organizer's Tuna session stays in the system keyring, outside the game. ngrok is an optional manual fallback following the switch to Tuna.

## Roles and round lifecycle

Original possessed players receive private behavior, a clue, a release condition and an infection trigger when enabled. Exorcists receive a small optional private mission in addition to releasing possessed players. Initial role selection is uniform for a chosen possessed count. Later overall deals favor members with fewer completed possessed rounds, with random ties. Preview reshuffles and aborted rounds do not count as played rounds.

The laptop deals cards first. Reading is untimed. Readiness indicators never start the timer. A person then starts the round on the laptop. A configurable placement head start lets possessed players leave the base before exorcists. Search and return phases advance automatically.

Participants may walk alone or in pairs; solo search is preferred, not mandatory. Tasks require no running, stairs, binding, compulsory physical contact or special props. Search zones have editable names; the base is distinct from those zones.

Participants judge physical actions on trust. A possessed participant reports release or selects a exorcist to infect. The infected exorcist joins that original possessed player's group and receives its behavior. One successful release clears the group. Score the original possessed player at most once, regardless of group size.

Released participants return to base until search ends. End search early when all originals are released or no exorcist can continue. Infection resets after each round; nobody is eliminated from later rounds.

Exorcists report mission completion themselves. Count missions separately from rescues, without individual rankings. A mission performed during search can be reported before the next deal. Software does not judge live physical completion.

## Settings and progression

Seven normal rounds are the default, with configurable count and endless mode. An optional tutorial precedes these rounds, uses level 1 and enables infection in on mode. It includes role instructions and a full manually started practice round. Tutorial outcomes remain visible but contribute neither normal round count, team totals/active time nor possessed-role history. Aborted attempts repeat the same progression position.

Initial and maximum difficulty are configurable from 1 to 3, initially 1 and 3. For normal round i within the original horizon N, use initial + round((maximum - initial) * (i - 1) / (N - 1)); a one-round party starts at the initial level. Default levels are 1, 1, 2, 2, 2, 3, 3. Tutorial, difficulty range and length cannot change while cards are issued or after the first start. Before that start, cancel reading to reconfigure.

Infection defaults to on, including tutorial and the first normal round. Off disables it throughout. Auto is an explicit alternative: tutorial has no infection, then infection begins at normal round max(2, ceil(0.75 * N)), round six for seven rounds. The choice persists until changed. Infection mode and durations remain editable before starts; changing durations alone preserves an already issued effective infection flag.

In endless mode the opening seven rounds provide progression, then the selected ceiling remains. A finite bank is reused after exhaustion; endless mode does not mean infinitely unique or AI-generated tasks. A finished finite party can continue with extra rounds at its selected ceiling, without recalculating the original horizon.

Implemented defaults: 45-second placement head start, three-minute search, 45-second return, tutorial enabled, low initial difficulty and high maximum difficulty. The primary party has seven players and three original possessed players. The current dealing range is 4-12 players, including offline members, with at least two exorcists and no more original possessed players than exorcists at an overall deal. Its default possessed count is min(3, floor(n/2)). Phase durations are implemented; see [timed-round design](../design/rounds.md). This initial balance does not constrain future infection.

The final summary shows team rescues, completed additional missions, results per round and active time excluding breaks. There is no personal leaderboard. The confirmed ritual adds a shared victory/defeat objective for new finite parties.

## Current reading behavior

An overall deal randomly assigns the selected number of possessed and one unique card per member at the round difficulty or a simpler fallback. A full shuffle issues new cards to every member, resets readiness/requests and may change roles. An individual replacement preserves the role and resets only its recipient. Requests clear readiness; withdrawing a request does not restore it. All-ready never starts gameplay.

Late participants during reading receive one role/card without changing existing assignments or readiness. Restore fewer than two exorcists first, then a missing possessed role; otherwise randomly select an allowed role, forcing exorcist when possessed are at least as numerous. Leave/removal deletes only the departing assignment. If the remaining composition is unsuitable, show a generic warning; keep everyone's cards until the organizer reshuffles or cancels. Cancel retains membership.

Cards are initially closed and become closed again after refresh or replacement. Brief reconnection retains the open screen. Server-held card/readiness survive browser recovery through the existing participant key. Public metadata excludes roles, card content and changing actual role counts; the count setting applies to a new overall deal. See [dealing design](../design/dealing.md).

## Implemented round controls

The lifecycle is lobby, reading, placement, search, return, break and finished. Only the three timed phases advance automatically. Each new deal and start is manual. Defaults are seven rounds and 45/180/45 seconds. Initial finite count accepts 1-99 or endless; length/mode lock at first start. Durations accept 1-3600 seconds and remain editable before later rounds. A finite finished party can add one extra round, while endless mode can finish manually in a break. The final display shows team rescues, missions, captured-player counts and active time.

Start requires valid assignments and no replacement requests; unready/offline members require confirmation. Pause freezes the phase and exact remainder, directing players to stop and wait safely. The last organizer-panel disconnect, a storage failure and a long laptop clock/control gap pause automatically. Player departure, removal, withdrawal and phone disconnect do not pause. Resume remains manual; a changed roster requires confirmation, and an empty active roster can only abort. Early search finish starts the full return timer. Return completion credits the round; confirmed abort enters a break without credit and instructs everyone to return to base.

New timed-phase arrivals wait for the next deal, including during pause. Existing participants restore their card/current phase. Card/readiness changes and reshuffles are available only during reading. Previous cards remain readable during breaks until new cards are dealt. Short quiet signals play only on an explicitly selected laptop panel with volume/mute; browser recovery does not replay them. Phones stay silent. Full restart restores the party and pauses active phases. See [round design](../design/rounds.md) for ownership and time recovery.

## Implemented search actions and results

Before each start, the organizer can choose automatic, on or off infection mode; the issued round exposes its effective infection flag. Each possessed card has an original infection condition. Any active possessed/captured group member can capture a still-active exorcist, after selecting their name and confirming. Any group member can report group release. Released players return to base without acting again. Capture removes mission credit even if the mission was already completed; release does not restore it.

Players can undo their latest effective action only without dependent subsequent events. Undo never reopens search. All new gameplay stops on pause; bookkeeping undo remains possible. Search returns automatically when no active exorcist or no active possessed group remains. Public screens reveal no current progress before return finishes.

Return completion creates provisional team results with fixed starting denominators and time excluding pauses. Missions may be reported until a successful next deal, manual party finish or explicit result finalization seals the row. The last finite round stays provisional until sealed. Aborted attempts are displayed separately and excluded from team totals. Departures retain history/denominators, and remaining captured members can continue their group. See [search design](../design/search-actions.md).

## Shared ritual

New finite parties enable the ritual by default; it can be disabled before the first deal. Endless mode is freeplay without a ritual. At the first normal start freeze the goal using the actual roster, including offline players. Seven players/seven rounds start with 7/2/3 candles on A/B/C, requiring 28 steps. Other lengths and rosters use the scaling formula in [ritual design](../design/ritual.md). This initial balance requires a live rehearsal.

One confirmed rescued original group or eligible mission moves one candle one position: A, then B, then C, then out. The program opens two distinct original base-only prophecy rules and a final release card in order. Open rules accumulate and remain open after penalties. Players report violations at base; an authorized panel applies one backward step from the largest eligible pile, breaking ties toward the farthest. The latest penalty can be corrected until another start or confirmation. Required announcements, rules, technical recovery and safety communication are exempt.

After return, synchronize phones and resolve conflicts or force-close waiting. Then explicitly confirm the round before a new deal or party finish. Preview reveals no hidden prophecy. Confirmation seals the result, advances once and checks immediate victory before last-round defeat. Tutorial/aborted attempts earn no progress. Full capture does not end the party. Early manual finish is stopped. A confirmed continuation allows separate freeplay results while retaining the immutable ritual outcome. See [ritual design](../design/ritual.md).

## Task bank and editor

Ship original tasks rather than copying commercial card text. The implemented bank has 60 possessed tasks (20 at each level) and 30 exorcist missions (12 at level 1, 9 at level 2, 9 at level 3). Existing card IDs remain stable. Selection prefers the current level, then the nearest simpler level, so 11 exorcists can receive unique cards. Level 1 uses a simple action; level 2 uses linked actions; level 3 uses short sequences or memory. Possessed cards include optional infection conditions. Release conditions need actionable clues. Extra missions must not sabotage the main rescue goal.

A separate laptop editor adds, edits, disables, imports and exports tasks. Organizers can launch without opening the bank and spoiling themselves. Edits apply to later deals, not issued cards. Cards can be replaced before start. Participants may opt out of their own round without leaving the room. This is not a rescue; other group members continue and prior achievements remain.

## Atmosphere and recovery

The shared screen resembles an old television and a strange recording: readable text, restrained interference and short unsettling inserts. Phone instructions remain dark and readable without interference over text.

Search uses quiet suspense, whispers, knocks and interference without sharp volume jumps. Gathering may include mild unexpected visual inserts. Effects can be disabled. All sound plays on the laptop; phones stay silent. Voice commands duck the music and clearly announce placement, search and return.

The server owns phases, deadlines, assignments and results. Blocking or refreshing a phone restores its previous assignment and current phase, without re-dealing. Prevent duplicate state changes and scores. Organizer commands and delayed scare events must not replay automatically after reconnecting. Stable player journal entries are resent and reconciled explicitly.

Save state locally. After restart recover the last saved game on pause rather than replaying missed activity. Organizer controls require separate authorization. Public snapshots and client bundles must not contain the bank or other players' private conditions.

## Offline participation and synchronization

Players can record release, infection, received-infection notices, missions, withdrawal and causal undo without a connection. IndexedDB commits before showing a provisional effect. The phone keeps its own authorized view only; other participants and the timer are marked unconfirmed. Read a source card physically after a received infection; the full new card arrives after synchronization. Reconnect restores identity before sending stable event IDs and obtaining receipts.

After return all frozen participants, including withdrawn members, must confirm synchronization before the next deal or finalization. Conflicts go to organizer review without card content. The organizer may explicitly close waiting with a warning; later actions cannot change a closed score. The server persists accepted events, review decisions and waiting confirmations in schema version 4. See [offline design](../design/offline-play.md) for timing, ordering and recovery rules.

## Acceptance

Next implementation stages: task editor, atmosphere music/voice and the optional spirit-box extension. Lobby membership, private cards, untimed reading, timed rounds and browser credential recovery are implemented. Each stage adds actual tests and updates implementation status.

Required external scenarios include Windows/macOS startup, iOS/Android lock-and-return, dim-light readability, voice audibility in all zones, and actual mobile-carrier/Tuna access. Foundation integration tests do not establish these acceptance results.
