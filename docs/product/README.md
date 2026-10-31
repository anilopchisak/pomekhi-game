# Game requirements and implementation status

Source: the user's game-planning decisions in this chat before the project setup request. These are intended rules, not claims that the scaffold implements them. Current requests can revise them explicitly.

## Implemented now

The browser shows connecting, connected and disconnected states. HTTP health and Socket.IO readiness identify the foundation stage. The Node process serves built browser assets. There is no playable room, assignment, round, scoring, editor, authorization, persistence or audio system yet.

[The shared protocol](../../src/shared/protocol.ts) owns current wire shapes. Add game wire contracts with their implementation owner, rather than treating prose as an already published API.

## Participants and access

The organizer participates. The laptop provides the shared display and is the only place for dealing cards, starting rounds, pausing and changing stages. Phones provide private cards and game actions. Players join through a link/QR code, room code and name without accounts.

The agreed deployment is a local laptop server plus free Tuna access over mobile Internet. Windows and macOS are laptop targets; iOS Safari and Android Chrome are phone targets. No paid hosting or runtime AI service is required. The organizer's Tuna session stays in the system keyring, outside the game. ngrok is an optional manual fallback following the switch to Tuna.

## Roles and round lifecycle

Original possessed players receive private behavior, a clue, a release condition and an infection trigger when enabled. Seekers receive a small optional private mission in addition to releasing possessed players. Random assignment should distribute both roles fairly across a party.

The laptop deals cards first. Reading is untimed. Readiness indicators never start the timer. A person then starts the round on the laptop. A configurable placement head start lets possessed players leave the base before seekers. Search and return phases advance automatically.

Participants may walk alone or in pairs; solo search is preferred, not mandatory. Tasks require no running, stairs, binding, compulsory physical contact or special props. Search zones have editable names; the base is distinct from those zones.

Participants judge physical actions on trust. A possessed participant reports release or selects a seeker to infect. The infected seeker joins that original possessed player's group and receives its behavior. One successful release clears the group. Score the original possessed player at most once, regardless of group size.

Released participants return to base until search ends. End search early when all originals are released or no seeker can continue. Infection resets after each round; nobody is eliminated from later rounds.

Seekers report mission completion themselves. Count missions separately from rescues, without individual rankings. A mission performed during search can be reported before the next deal. Software does not judge live physical completion.

## Settings and progression

Five rounds are the default, with configurable count and endless mode. The tutorial can be disabled. Initial difficulty and maximum difficulty are configurable. Spread progression across the selected party length; the tutorial stays simple and infection-free. The standard five-round party introduces infection near the end.

In endless mode the opening five rounds provide progression, then the selected ceiling remains. A finite bank is reused after exhaustion; endless mode does not mean infinitely unique or AI-generated tasks. A finished finite party can continue with extra rounds.

Working defaults from the implementation plan: 45-second placement head start, three-minute search, 45-second return, tutorial enabled, low initial difficulty and high maximum difficulty. The primary party has seven players and three original possessed players. The planned configurable range is 4-12 players, with at least two seekers and no more possessed players than seekers. These are planned settings, not current code contracts.

The final summary shows team rescues, completed additional missions, results per round and active time excluding breaks. Do not introduce a personal leaderboard or mandatory victory threshold without a product decision.

## Task bank and editor

Ship original tasks rather than copying commercial card text. The planned bank has 60 possessed tasks and 30 seeker missions across three difficulty levels. Release conditions need actionable clues. Extra missions must not sabotage the main rescue goal.

A separate laptop editor adds, edits, disables, imports and exports tasks. Organizers can launch without opening the bank and spoiling themselves. Edits apply to later deals, not issued cards. Cards can be replaced before start. Participants may opt out during search; this is not a successful rescue, and the affected group returns to base until the next round.

## Atmosphere and recovery

The shared screen resembles an old television and a strange recording: readable text, restrained interference and short unsettling inserts. Phone instructions remain dark and readable without interference over text.

Search uses quiet suspense, whispers, knocks and interference without sharp volume jumps. Gathering may include mild unexpected visual inserts. Effects can be disabled. All sound plays on the laptop; phones stay silent. Voice commands duck the music and clearly announce placement, search and return.

The server owns phases, deadlines, assignments and results. Blocking or refreshing a phone restores its previous assignment and current phase, without re-dealing. Prevent duplicate state changes and scores. Stale commands and delayed scare events must not replay automatically after reconnecting.

Save state locally. After restart recover the last saved game on pause rather than replaying missed activity. Organizer controls require separate authorization. Public snapshots and client bundles must not contain the bank or other players' private conditions.

## Acceptance

Next implementation stages: room membership and private cards, authoritative rules, task bank/editor, atmosphere, persistence and recovery. Each stage adds actual tests and updates implementation status.

Required external scenarios include Windows/macOS startup, iOS/Android lock-and-return, dim-light readability, voice audibility in all zones, and actual mobile-carrier/Tuna access. Foundation integration tests do not establish these acceptance results.
