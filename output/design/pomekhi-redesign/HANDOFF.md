# Pomekhi UX/UI redesign handoff

Design proposal, 2026-11-02. Source baseline: `b66f871`. This package does not implement runtime behavior or change saved sessions.

Figma: https://www.figma.com/design/ILsPo7txuQU0S96McIEWda/Pomekhi-UX-UI-Redesign

## Delivery status

The file contains three pages, semantic variables, eight shared text styles, 15 button variants and four supporting components. It now has 152 editable screen frames, 38 modal overlays and six scenario starting points. Twelve research boards cover the decisions, journeys, all 104 original states and all 90 card reviews. Construction was completed through the native Figma Plugin API in Safari after the MCP quota was reached.

The final node registry is `figma-state.json`. The 104-state table links to the current frame IDs. Browser verification found missing early frames; these were restored as native nodes and their navigation was rebuilt before final verification. Earlier construction captures can contain superseded node IDs and must not be replayed blindly.

## Locked product decisions

- One laptop room combines controls and shared presentation. Fullscreen preserves the workspace and exits with Escape.
- The laptop is not a player slot. The participating organizer joins with a phone.
- Initial roles become public after dealing. Card text, effective infection groups and current rescue progress remain private during active phases.
- Remove venue-name inputs. The physical meeting point remains the laptop. Players agree verbally about safe boundaries before play.
- Player replacement requests disappear. A laptop icon action replaces one assignment during reading and preserves its role. Replacement closes that card and clears only its recipient's readiness.
- Readiness never starts a timer. Reading is untimed. The organizer starts the round.
- Infection remains restricted to an active exorcist. Captured, released, withdrawn and absent-from-round targets are ineligible.
- Scoring, phase order, frozen denominators, ritual movement, tutorial exclusions and immutable outcomes remain unchanged.
- There is no individual ranking. Finite, endless, no-ritual and post-ritual freeplay remain distinct.

## Navigation and information hierarchy

### Laptop

The top bar contains room code, connection, help and settings. The left column contains participants, initial roles and readiness/presence. The center contains phase, one direct instruction, timer when applicable and the next primary action. The right column contains shared ritual progress and the explanation entry point. Detailed history and recovery information are disclosed on demand; blocking failures are immediately visible.

Before creation, use the four-step introduction: create, invite, configure, deal. After creation, show the QR, code and participant link directly in the empty room. Clicking the room code returns to QR/link, participant management, invitation connection mode and room closing. Do not automatically infer a tunnel address from a loopback URL.

The two separate top-bar actions open settings and instructions. Settings sections are party, time, sound and atmosphere. The catalog editor opens as a large dialog from settings. Help sections are overview, roles, phases, infection, missions and ritual. Editing the catalog must not accidentally reveal card text.

### Phone

The personal screen starts with the brand and connection status, followed by a compact room-code/settings/help bar, then phase, instruction, card scroll area and persistent actions. Only the card area scrolls when its text is long. The top navigation opens room/participation, personal settings and help. On narrow devices these destinations are full-screen dialogs with a visible return action.

The conceal action stays directly below the card, outside its scroll area and before readiness, unready or game actions. Concealing a ready card preserves readiness; P09C and PX15C demonstrate this for both roles. Before the round, show a persistent short notice explaining laptop replacement. Open state is transient: replacement, shuffle and refresh conceal; brief reconnection preserves reveal state. No bank or another player's task may enter the phone projection.

## State-dependent actions

| State | Main action | Secondary behavior |
| --- | --- | --- |
| Reading, card concealed | Reveal card | Readiness disabled until the card has been opened; this is a proposed presentation guard, not a server authorization change |
| Reading, card revealed | Mark ready / remove readiness | Organizer alone starts gameplay |
| Placement | Wait or take position | Infection and rescue disabled with phase explanation |
| Searching, possessed/captured | Confirm group release | Open eligible infection target selection |
| Searching, exorcist | Mark optional mission | Report received infection; contextual own undo remains available when valid |
| Released | Return to laptop | No new searching actions |
| Paused | Wait safely | New actions disabled; permitted bookkeeping undo remains available |
| Return | Return to laptop | An eligible mission may still be recorded |
| Provisional result | Check/complete eligible mission | Own valid undo until finalization |
| Final or aborted result | Read outcome | Actions cannot alter the result |
| Offline | Record permitted own actions locally | Show unconfirmed phase/clock and pending receipts |
| Late join during active round | Wait for next deal | Keep membership without an active task |

## Contract changes for the implementation stage

These are required future changes to `src/shared/protocol.ts` and its owners, not shipped APIs.

1. Add explicit original-role metadata to the public dealing projection, keyed by participant and assignment identity. Publish only role and existing readiness/presence, not card identity/title/body or effective captured/released state. Update privacy tests to allow exactly that disclosure. Replacement preserves the role; shuffle and late-reading joins refresh metadata atomically.
2. Add a private, actor-authorized eligible-target projection for possessed/captured phones. Include participant ID/name and a version tied to current play. Do not publish the list to the laptop or all players. Server validation remains mandatory when a target changes between display and submit.
3. Offline targeting uses the last confirmed private candidate snapshot and marks it stale. A locally saved infection is provisional, not a promise of acceptance. Reconciliation rechecks eligibility and competing events. Show an explicit rejection or review outcome; never silently retarget.
4. Stop exposing venue editing and venue strings in the product presentation. Keep legacy persisted venue data readable during migration; removing UI must not invalidate existing checkpoints or offline journals. Use generic meeting-point instructions in the new projection/copy.
5. Remove the player request action and its host start barrier only after dealing request compatibility is handled. Existing saved requests must be cleared by an explicit migration or compatible normalization. Do not strand a restored reading round behind an invisible request.
6. Merge host/display presentation without adding a second authoritative phase owner. Preserve organizer authorization and single-laptop sound ownership. Old display/editor links should route to the corresponding room view/dialog in the later implementation.

Read the owning dealing, rounds, offline, persistence, ritual and atmosphere documents before implementing these changes. Update those documents alongside code. Current runtime documentation is intentionally unchanged by this design-only delivery.

## Results and ritual

The result flow is receive phone actions, resolve disputes, confirm once, show candle movement, then offer the next deal. Waiting and conflicts visibly explain why confirmation is unavailable. Force-closing waiting is a separate destructive confirmation that explains exclusion of missing actions.

Use counts with denominators and a plain equation. Example: two original groups plus two eligible missions produce four candle steps. Captured members do not multiply group rescue credit. From the seven-player initial positions 7/2/3, four steps produce 3/6/3 and 24 steps remaining. These are demonstration values; production uses the authoritative projection.

Keep provisional and confirmed progress visually distinct. Never reveal a hidden prophecy from a forecast. Tutorial and aborted attempts cannot move candles. Results distinguish a round from party totals, preserve final outcomes during freeplay and explain victory, defeat and manual stopping separately.

## Dialog and focus behavior

- Trap keyboard focus inside a dialog and make the background inert. Move focus to its heading or first useful control; return it to the invoking control on close.
- Escape closes non-destructive dialogs. Unsaved editor changes invoke a discard/save decision. Closing an operation does not imply success.
- Keep headers and action footers visible while long content scrolls. Avoid nested modal stacks: replace the dialog body with the requested step and provide Back.
- Use explicit verbs in confirmations. Destructive actions do not receive default focus. Enter inside a multi-line editor inserts a newline.
- Use 48 px primary actions and at least 44 px icon targets. Replacement tooltip appears on hover and keyboard focus and has an accessible name.
- Keep input and draft contents during errors, stale revisions and transient reconnects. No automatic retry of organizer commands.

## Card content

`card-audit.json` contains every original and proposed final card, changed fields, editorial decision and rationale. `cards-proposed.json` is intentionally labeled as an unimported design proposal. Stable IDs, roles and levels are retained. Counts remain 60 possessed tasks and 30 exorcist missions.

Sixty-five entries are revised and 25 retained. All entries were reviewed for an actionable behavior, clue-to-release alignment, distinct infection condition, appropriate sequence complexity, no required props/contact/hazardous movement and no diversion from rescue. This is an editorial assessment; it does not prove balance, enjoyment or a target human win rate.

The optional-mission and safety captions in `card-audit.json` are part of the delivered copy. Display them with the shortened mission text rather than discarding their meaning. Physical actions remain judged by the participants. Instructions about speaking a suggestion must not become instructions to open windows, use stairs or handle props.

## Sound scenario

| Event or phase | Intended sound behavior |
| --- | --- |
| Gathering/reading | Quiet continuous atmosphere below conversation |
| Start/placement | Distinct start signal, then gently rising tension |
| Search | Stable suspense; no abrupt loud peaks |
| Return | Clear return cue audible over the background; calmer bed |
| Pause/storage failure/disconnect of sound owner | Pause cue if playback is available, then silence |
| Resume | Short distinct cue; no replay of missed events |
| Cancel | Distinct cancellation cue; do not use the victory sound |
| Confirmed ritual movement | Restrained progress accent, separate from rescue reporting |
| Victory/defeat/stopped | Distinct ending identities followed by silence |
| Phone effect | Explicit consent and sample; no phase cues on phones; cancel on pause, hidden tab, disconnect, release or opt-out |

Controls: background, signals and effects at the existing default levels 12/20/10%, mute and test. Phone consent defaults off, suggested 15%, maximum 30%. Reduced motion affects visuals, not the ability to receive essential phase information. Visual phase changes always work without audio. Specific recordings, license verification, purchases and runtime integration are out of scope.

## Research decisions

- Jackbox demonstrates one visible host lobby, a room code and phones as controllers: https://www.jackboxgames.com/how-to-play
- AirConsole explicitly recommends situation-dependent personalized controllers and large, function-labeled actions: https://documentation.airconsole.com/smartphones-as-controllers
- Hantise distributes the two role decks alternately and separates the groups during preparation while missions are read privately. This supports exposing initial role identity, not private task content: https://www.grrre-games.com/wp-content/uploads/2025/02/GG019_RULES_90x160_FR.pdf#page=1
- Pomekhi retains its own timing, infection chains, safe movement and group scoring. Do not import unrelated original-board-game rules or commercial task text.

## Acceptance and remaining verification

Required design sizes: 1440x900 and 1366x768 laptops; 320, 390 and 430 px phones. Keep the phase and primary action visible, permit card-only scrolling and preserve navigation. Stress with 12 players, a long participant name and 2000-character task fields. Test modal keyboard flow, stale eligibility, offline receipts, restore-on-pause and irreversible finalization.

The final geometry audit checks all 152 main frames, navigation destinations and action containment. Native PNG exports were inspected for the 1366x768 room, 320/430 px phones, a 12-person roster, a long assignment, settings, the editor and separate round/party results. Safari scenario checks are recorded in `safari-prototype-checks.json`; the detailed scope and remaining boundaries are in `QA.md`.

The prototype uses fixed sample data and classic Figma interactions supported by Starter. Text entry, file selection, download, QR invitation, sound and server events are represented by designed states rather than a running game. Right Arrow simulates an external event on designated phone states; placement and return advance after eight seconds for review. This demo timing does not change game durations. Copy invitation leads to a populated sample lobby. Card list entries share the p01 editor demonstration; the complete 90-card copy remains in the audit files.

The conceal-card action stays below and outside the card scroll area. Short confirmations use compact dialogs. Initial invitation is inline and omits participant removal and room closing; those actions remain in room information. Review decisions share a footer: reject first, then approve with a 12 px gap.

Real iPhone/Android touch behavior, dim-light reading, camera QR scanning, audio coverage, lock/background behavior, fullscreen on actual hardware and a seven-person balance rehearsal remain separate unverified acceptance scenarios.
