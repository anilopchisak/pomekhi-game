# Game requirements and implementation status

Source: the user's game-planning decisions in this chat before the project setup request. These are intended rules, not claims that the scaffold implements them. Current requests can revise them explicitly.

## Implemented now

The browser provides an organizer panel and a phone lobby. One in-memory room supports up to 12 participants, code/name entry, HTTPS invitations with locally generated QR, separate organizer authorization, participant removal/leave and identity recovery after reconnect or refresh. The organizer joins from a phone; the laptop does not consume a slot. A full program restart invalidates the lobby and its credentials. HTTP health and Socket.IO readiness retain the foundation-stage contract; the authorized lobby snapshot establishes actual membership.

Private-card dealing and untimed reading are implemented with a 24-card introductory bank. Players reveal/hide cards, mark readiness and request replacements; the organizer replaces one card, reshuffles all roles/cards or cancels. Timed rounds, pause, finite/endless parties and short laptop signals are implemented. Release/infection, mission scoring, undo and team results are implemented. Editor, server persistence, music and voice remain future work. See [lobby design](../design/lobby-sessions.md) for current authorization and recovery behavior.

[The shared protocol](../../src/shared/protocol.ts) owns current wire shapes. Add game wire contracts with their implementation owner, rather than treating prose as an already published API.

## Participants and access

The organizer participates. The laptop provides the shared display and is the only place for dealing cards, starting rounds, pausing and changing stages. Phones provide private cards and game actions. Players join through a link/QR code, room code and name without accounts.

The agreed deployment is a local laptop server plus free Tuna access over mobile Internet. Windows and macOS are laptop targets; iOS Safari and Android Chrome are phone targets. No paid hosting or runtime AI service is required. The organizer's Tuna session stays in the system keyring, outside the game. ngrok is an optional manual fallback following the switch to Tuna.

## Roles and round lifecycle

Original possessed players receive private behavior, a clue, a release condition and an infection trigger when enabled. Exorcists receive a small optional private mission in addition to releasing possessed players. Initial role selection is uniform for a chosen possessed count. Later overall deals favor members with fewer completed possessed rounds, with random ties. Preview reshuffles and aborted rounds do not count as played rounds.

The laptop deals cards first. Reading is untimed. Readiness indicators never start the timer. A person then starts the round on the laptop. A configurable placement head start lets possessed players leave the base before exorcists. Search and return phases advance automatically.

Participants may walk alone or in pairs; solo search is preferred, not mandatory. Tasks require no running, stairs, binding, compulsory physical contact or special props. Search zones have editable names; the base is distinct from those zones.

Participants judge physical actions on trust. A possessed participant reports release or selects a exorcist to infect. The infected exorcist joins that original possessed player's group and receives its behavior. One successful release clears the group. Score the original possessed player at most once, regardless of group size.

Released participants return to base until search ends. End search early when all originals are released or no exorcist can continue. Infection resets after each round; nobody is eliminated from later rounds.

Exorcists report mission completion themselves. Count missions separately from rescues, without individual rankings. A mission performed during search can be reported before the next deal. Software does not judge live physical completion.

## Settings and progression

Five rounds are the default, with configurable count and endless mode. The tutorial can be disabled. Initial difficulty and maximum difficulty are configurable. Spread progression across the selected party length; the tutorial stays simple and infection-free. The standard five-round party introduces infection near the end.

In endless mode the opening five rounds provide progression, then the selected ceiling remains. A finite bank is reused after exhaustion; endless mode does not mean infinitely unique or AI-generated tasks. A finished finite party can continue with extra rounds.

Working defaults from the implementation plan: 45-second placement head start, three-minute search, 45-second return, tutorial enabled, low initial difficulty and high maximum difficulty. The primary party has seven players and three original possessed players. The current dealing range is 4-12 players, including offline members, with at least two exorcists and no more original possessed players than exorcists at an overall deal. Its default possessed count is min(3, floor(n/2)). Phase durations are implemented; see [timed-round design](../design/rounds.md). This initial balance does not constrain future infection.

The final summary shows team rescues, completed additional missions, results per round and active time excluding breaks. Do not introduce a personal leaderboard or mandatory victory threshold without a product decision.

## Current reading behavior

An overall deal randomly assigns the selected number of possessed and one unique introductory card per member. A full shuffle issues new cards to every member, resets readiness/requests and may change roles. An individual replacement preserves the role and resets only its recipient. Requests clear readiness; withdrawing a request does not restore it. All-ready never starts gameplay.

Late participants during reading receive one role/card without changing existing assignments or readiness. Restore fewer than two exorcists first, then a missing possessed role; otherwise randomly select an allowed role, forcing exorcist when possessed are at least as numerous. Leave/removal deletes only the departing assignment. If the remaining composition is unsuitable, show a generic warning; keep everyone's cards until the organizer reshuffles or cancels. Cancel retains membership.

Cards are initially closed and become closed again after refresh, reconnect or replacement. Server-held card/readiness survive browser recovery through the existing participant key. Public metadata excludes roles, card content and changing actual role counts; the count setting applies to a new overall deal. See [dealing design](../design/dealing.md).

## Implemented round controls

The lifecycle is lobby, reading, placement, search, return, break and finished. Only the three timed phases advance automatically. Each new deal and start is manual. Defaults are five rounds and 45/180/45 seconds. Initial finite count accepts 1-99 or endless; length/mode lock at first start. Durations accept 1-3600 seconds and remain editable before later rounds. A finite finished party can add one extra round, while endless mode can finish manually in a break. The final display shows team rescues, missions, captured-player counts and active time.

Start requires valid assignments and no replacement requests; unready/offline members require confirmation. Pause freezes the phase and exact remainder, directing players to stop and wait safely. The last organizer-panel disconnect, explicit active-player departure and a long laptop clock/control gap pause automatically. Phone disconnect alone does not. Resume remains manual; a changed roster requires confirmation, and an empty active roster can only abort. Early search finish starts the full return timer. Return completion credits the round; confirmed abort enters a break without credit and instructs everyone to return to base.

New timed-phase arrivals wait for the next deal, including during pause. Existing participants restore their card/current phase. Card/readiness changes and reshuffles are available only during reading. Previous cards remain readable during breaks until new cards are dealt. Short quiet signals play only on an explicitly selected laptop panel with volume/mute; browser recovery does not replay them. Phones stay silent. Full restart still clears the party. See [round design](../design/rounds.md) for ownership and time recovery.

## Implemented search actions and results

Before each round, the organizer can manually enable infection (default off). Each possessed card has an original infection condition. Any active possessed/captured group member can capture a still-active exorcist, after selecting their name and confirming. Any group member can report group release. Released players return to base without acting again. Capture removes mission credit even if the mission was already completed; release does not restore it.

Players can undo their latest effective action only without dependent subsequent events. Undo never reopens search. All new gameplay stops on pause; bookkeeping undo remains possible. Search returns automatically when no active exorcist or no active possessed group remains. Public screens reveal no current progress before return finishes.

Return completion creates provisional team results with fixed starting denominators and time excluding pauses. Missions may be reported until a successful next deal, manual party finish or explicit result finalization seals the row. The last finite round stays provisional until sealed. Aborted attempts are displayed separately and excluded from team totals. Departures retain history/denominators, and remaining captured members can continue their group. See [search design](../design/search-actions.md).

## Task bank and editor

Ship original tasks rather than copying commercial card text. The current bank has 12 possessed cards and 12 exorcist missions at difficulty 1 with optional infection conditions. The target bank has 60 possessed tasks and 30 exorcist missions across three difficulty levels. Release conditions need actionable clues. Extra missions must not sabotage the main rescue goal.

A separate laptop editor adds, edits, disables, imports and exports tasks. Organizers can launch without opening the bank and spoiling themselves. Edits apply to later deals, not issued cards. Cards can be replaced before start. Participants may opt out during search; this is not a successful rescue, and the affected group returns to base until the next round.

## Atmosphere and recovery

The shared screen resembles an old television and a strange recording: readable text, restrained interference and short unsettling inserts. Phone instructions remain dark and readable without interference over text.

Search uses quiet suspense, whispers, knocks and interference without sharp volume jumps. Gathering may include mild unexpected visual inserts. Effects can be disabled. All sound plays on the laptop; phones stay silent. Voice commands duck the music and clearly announce placement, search and return.

The server owns phases, deadlines, assignments and results. Blocking or refreshing a phone restores its previous assignment and current phase, without re-dealing. Prevent duplicate state changes and scores. Stale commands and delayed scare events must not replay automatically after reconnecting.

Save state locally. After restart recover the last saved game on pause rather than replaying missed activity. Organizer controls require separate authorization. Public snapshots and client bundles must not contain the bank or other players' private conditions.

## Acceptance

Next implementation stages: expanded task bank/editor, atmosphere music/voice, persistence and gameplay recovery. Lobby membership, private cards, untimed reading, timed rounds and browser credential recovery are implemented. Each stage adds actual tests and updates implementation status.

Required external scenarios include Windows/macOS startup, iOS/Android lock-and-return, dim-light readability, voice audibility in all zones, and actual mobile-carrier/Tuna access. Foundation integration tests do not establish these acceptance results.
