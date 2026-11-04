# Oderzhimye UX/UI handoff

## Deliverable and boundaries

[Editable Figma file](https://www.figma.com/design/uv4SdpjWGNJORTyrInJa88) · [Prototype preparation](https://www.figma.com/proto/uv4SdpjWGNJORTyrInJa88?node-id=3-346&starting-point-node-id=3-346&scaling=scale-down).

This is a target-rule design and a Figma prototype, not an application release. Runtime source, shared protocol, saves and audio recordings were not changed. The source Pomekhi file and its comments were not edited. All 152 source states have a disposition in [state-coverage.csv](state-coverage.csv). The approved twelve-human extension is recorded in [the target rules](../../../docs/product/README.md).

The file contains three pages: research and flows, components, and screens/prototypes. It contains 404 screen/overlay/responsive/review states, with 2,612 native navigation references, plus the research boards and component page. The screen page has separate sections for the shared laptop, personal phones, dialogs, ritual motion and review navigation. Responsive variants retain phone width through actions and confirmation windows. The review catalog is a design-review aid, not a game screen.

## Accepted game model

- Five to twelve human mediums; the organizer plays. The computer occupies no player slot.
- Seven rounds. First-game default suppresses trial effects throughout, with no automatic replacement success.
- Alternate roles in explicit table order, beginning with an exorcist. Deal only to free returned mediums. A sole returning medium receives an exorcist card.
- Preserve unresolved assignment, group and physical location across rounds. Concealment never changes role, readiness, assignment or eligibility.
- Exorcists explore alone. Release is primary; a private mission is optional. After capture, that exorcist mission cannot earn success, even after release.
- Normal ritual recall addresses free players. Unresolved groups remain. Endings and emergency stops recall everyone.
- One release success per original assignment, not per captive. Reconciled physical reports precede confirmation, scoring and motion.
- Twelve humans start with 13/2/3 candles: 18 virtual candles and 46 forward steps. Four confirmed successes produce 9/6/3 and 42 remaining steps. The rejected-report branch awards three successes and ends at 10/5/3 and 43 remaining steps. A separate valid penalty example moves 0/15/3 (33 steps) to 1/14/3 (34 steps); the emptied A prophecy remains revealed.
- Closed prophecy text and hidden trial objectives remain private. A free released medium already at the table prevents an incorrect all-captured defeat.

## Screens and controls

The laptop keeps original roles, connection/readiness, phase, control and ritual visible at 1366×768. Live hidden capture/release information is not broadcast. The approved follow-up adds visible placement (00:45) and round (04:00) countdowns in the laptop header and beside the role on phones. Reading and checking remain untimed. See [timer specification](TIMERS.md). A wider participant column keeps readiness clear of the 44px replacement control. Replacement is available before start, preserves role and resets only its recipient's readiness. The next-deal branch retains 42 steps and four existing assignments; eight returned players read new cards. A separate single-returner branch assigns Maria an exorcist mission.

Phones have brand/status, a settings icon, a centered room-name button and a circled-question help icon, current instruction, a separately scrolling complete task and actions outside that scroll. Concealment precedes readiness. Personal settings never expose party controls. Capture confirmation preserves the reporting possessed player's own task. Active assignments cannot be discarded through participation navigation.

Settings, how-to-play and the large task editor are separate dialogs. The editor includes provenance, full conditions, clue, import/export, validation and preserved-draft conflict states. Dirty-editor close routes through explicit discard confirmation. In implementation, Escape must use the same dismissal path, trap focus in the dialog and return focus to its trigger.

## Visual and component system

Semantic colors: canvas `#0D0B12`, surface `#17131F`, raised `#211B2D`, text `#F1EDF7`, muted `#B7AFC5`, action `#B9A1E8`, action text `#17131F`, focus `#D8C3FF`, danger `#E8A0AA`, candles `#D1B783`, interactive border `#877597`.

Golos Text is the reading face; IBM Plex Mono is used for codes and numbers. The file uses native editable text, vector candle/QR artwork, Auto Layout, component instances and semantic variables aliased to primitives. It includes button default/hover/focus/disabled/busy states, content-sized tags, compact participant rows, private cards, feedback, navigation, candle variants and replacement hover/focus states. No complete-UI bitmap is used as a design substitute.

Text contrast is at least 4.5:1 for the selected active text/background pairs. Hit targets are at least 44px. Labels accompany color. Disabled controls are visibly distinct and explain their blocking condition.

## Motion contract

| Event | Timing and result |
| --- | --- |
| Ambient flame | One animated candle per active scene; subtle 0.9/1.1-second transitions with 1.1/1.3-second holds. Static variants serve pause/reduced motion. |
| Forward or penalty step | Smart Animate, 450ms. Only the moving candle changes its slot; untouched candles stay in place. Sequential prototype frames hold 650ms before their next transition. |
| Final exit | Flame fades and a short smoke shape rises. Final count remains readable. |
| Prophecy reveal | 500ms after the position empties. Unknown original card text is explicitly a template. |
| Phase / recall | 250–350ms, followed by a stable instruction. |
| Action feedback | 180–250ms, with persistent text. |
| Pause | A separate retained-position state exists for every moving step. Resume continues from that position. |
| Skip / reduced motion | Settle on the already-confirmed final snapshot. No movement or flip; short fade only. |
| Reconnection | Restore the current paused snapshot; never replay historical scoring effects. |

A confirmed result is committed before presentation. Motion is a disposable visualization of a fixed result version, never a source of score. Skipping, pausing, reopening or reconnecting must not award success again. Production must honor `prefers-reduced-motion`; Figma demonstrates the explicit reduced-motion branch rather than reading operating-system preferences.

## Future interface capabilities

These are requirements, not new implemented wire shapes:

- Public initial roles and private full assignments with durable assignment/group identity.
- Explicit table order, returned/deal-eligible mediums and retained groups, including the one-free-medium case.
- A private eligible-active-exorcist target list, revalidated on confirmation. Offline choices remain provisional and use last-known data.
- Addressed recall/technical notices and private trial instructions/results. The computer cannot pretend to observe physical behavior.
- A synchronization barrier, causal conflict review, immutable confirmed result and ordered candle-presentation events.
- Versioned card editing with a recoverable draft on conflict; role-appropriate fields and explicit provenance. Do not alter an issued assignment by editing its catalog entry.
- Remove zone-name configuration while retaining physical agreement about boundaries, ritual room and the Spirit Dwelling.

## Content and source limits

[Card reference](cards-reference.json) preserves all 90 authored identifiers. It is not the original commercial deck. The prototype shows full authored p03/e06 specimens with visible source labels; no runtime import occurred. [Interface copy](interface-copy.json) and the Figma text layers supply screen copy.

The complete original story, prophecy and trial/card corpus is not available in the supplied rulebook. Those surfaces use explicitly identified templates. Every actor-dependent Master trial adaptation needs card-by-card source review. Unresolved penalty ties and original rulings are not invented. Original-deck content approval and a twelve-human live balance test remain separate acceptance steps.

UI/UX Pro Max and Game Design Principles were installed from their public source repositories and read. The UI search's generic landing-page palette was not adopted; the user-approved purple palette governs. The skills will be discoverable by the host on the next turn.

## Verification boundary

Figma prototype events simulate computer announcements and participant reports. The file is not a synchronized multiplayer system, editable production form, real import/export implementation or audio engine. Real-device backlight, touch/keyboard behavior, LAN/Tuna recovery, sound permissions, physical reports and twelve-player balance require implementation and a live party. See [QA.md](QA.md) for recorded checks and remaining conditions.

## Figma comments, 2026-11-03

All twelve user comments are mapped to implemented native Figma edits in [the comment review](comment-review-2026-11-03/REVIEW.md). The changes include the square scannable invitation, fullscreen in settings, descriptive and reopenable prophecy cards, continuous private-card surfaces, bold task subheadings, consistent infection wording, room-name navigation, inline code errors, distinct readiness actions, and the infecting group's complete assignment after infection. Pending, connection-error and concealment states preserve that assignment. See [updated copy snapshots](comment-review-2026-11-03/copy-updates.json).

The QR points to the phone-join Figma prototype for this design review; it is not a production room invitation. The original QR comment anchor remains hidden in place. Existing comment threads were preserved. Prophecy dialogs explicitly mark authored examples requiring source-deck review.
