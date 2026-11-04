# Implementation reference for the Oderzhimye screens

Use these state contracts with the [target rules](../../../docs/product/README.md), not the current implementation. The mockups are static specimens. The numbered scenarios specify what changes on the two surfaces and which data must survive each change. The data names below describe semantics and do not prescribe API paths or payload shapes.

## 1. One party, one authoritative phase

| Phase | Shared laptop | Private phone | Transition gate |
| --- | --- | --- | --- |
| Preparation | Invite, agree territory, choose mode, permitted subsets and story. Five to twelve human players. | Join with room code and name. The organizer can join the same way. | Deal only after the initial roster and preparation are valid. |
| Reading | List recipients and readiness. Show retained assignments separately. A replacement resets readiness for the affected recipient only. | Personal assignment, hide/open, ready/withdraw. The hidden reading state still permits reopening. | Explicit start on the shared laptop. Readiness does not start a personal countdown. |
| Placement | Display the 45 s countdown in the room. New possessed leave, exorcists wait, retained groups stay. | Same deadline. Visible and hidden variants use the same assignment and phase. | Authoritative placement expiry starts exorcism once. No search reports during placement. |
| Exorcism | Display phase and remaining time in the room. Pause and early ritual call are separate operations. | Show personal instruction and permitted actions. Only an active eligible exorcist can be selected for capture. | Authoritative four-minute expiry or confirmed early recall. |
| Recall | Show who is expected at the table. Distinguish free, already returned and still in an unresolved group. | Free players return. Previously freed players remain at the table. Possessed and captured players stay in place. | Begin checking after the recall announcement. |
| Checking | Collect phone journals, explicitly resolve conflicts and absent reports, preview totals, confirm. | Show receipt, pending/failed upload, correction and result. No new physical successes may be performed here. | Seal the round exactly once. |
| Ritual and next deal | Present the committed ritual changes. Advance or skip playback. Deal only to free returners if the party continues. | Show the outcome and the currently open prophecies. Retained players keep the same assignment and place. | Resolve victory, seventh-round defeat or confirmed total possession before opening another deal. |
| Terminal | Distinct victory, seventh-check defeat, total possession and stopped outcome. History retains the final snapshot. | Recall everyone and display the same outcome. | A new party has a new identity. A completed party cannot continue scoring. |

Timer calculation belongs to the authoritative phase snapshot. A client projects the remaining time from the current deadline and a synchronized clock. Reaching zero locally does not grant phase actions. Hiding a card, opening help, entering full screen and reconnecting preserve the deadline. Pause stores the remaining duration, and resume establishes a deadline from that same duration. When the client lacks a current snapshot it shows unknown time and any offline report as preliminary. A restored party loads paused, with the same assignment identities, queued reports and confirmed ritual.

Acceptance cases include opening and hiding at 00:30 during placement, opening a long card during exorcism, pausing at 02:18, reconnecting before and after expiry and reopening help in each phase. Test each case on 320, 390 and 430 px and on the shared laptop. The countdown sits in the room at 1366×768 and 1440×900. Keyboard focus returns to the control that opened a dialog.

## 2. Preserve assignments and role visibility

A new deal is issued to the free returned subset in virtual table order. Alternate roles starting with an exorcist, including when the subset has one person. The starting admission minimum does not gate a later deal. The organizer occupies a human slot and the computer does not.

Keep an original assignment identity distinct from its current group membership. The group and physical location survive a round boundary. Capturing an exorcist appends them to the captor’s group and shares that group’s existing full card. Their original mission becomes ineligible for that assignment even after release. A group release unlocks all participating members at that location and credits the original assignment at most once.

Public room views show original roles, readiness and connection. Show current capture or release only on the private surface and at the authorized review stage. An eligible-target projection must be private and scoped to the current actor, role and phase. If a target changes after selection, explain and return to the refreshed list. Distinguish an empty list from a disconnected list. The latter uses the last known state only for a preliminary report.

## 3. Repeat round 2 and reconcile a delayed mission

The 12-person specimen begins round 2 with eight redealt and two retained groups of two. Round 1 scored four rescues. The ritual begins round 2 at 9/6/3 with 42 steps left. Open conditions are empty.

1. The laptop calls free players, and the two retained groups stay in place. Opening checking does not redeal or move candles.
2. Four other original possessed assignments are released. Two eligible exorcists report their optional missions. Nikita’s mission record arrives late. Show a specific pending record, its claim and the dependent reports.
3. Accept the mission only if the group confirms the physical condition and the exorcist was never captured during that assignment. Accepting yields four rescues and two missions. Rejecting yields four rescues and one mission. The result preview is still uncommitted.
4. Confirmation seals the preview and the matching ritual snapshot as one authoritative result. Six successes yield 3/12/3 and 36 steps. Five yield 4/11/3 and 37 steps. Both branches retain the same four people and groups.
5. Playback moves one candle per accepted step. Closing, skipping, repeated confirmation, duplicated reports and reconnecting cannot award another success. After reconnect display the committed snapshot without replaying old audio or animation.
6. The next deal displays the corresponding snapshot. The eight returned players read new cards before placement. The four retained players see their original groups, place and conditions.

Use stable event identity for deduplication and assignment identity for rescue credit. Reconciliation accounts for explicit confirmation, offline/pending, rejected, disputed and dependent records. A network response and physical availability are separate dimensions. Do not infer captivity from a missing receipt. A captured searcher who was already freed and at the table prevents a false full-possession loss.

## 4. Penalty, reveal and recovery

The separate penalty specimen begins after round four checking. The first prophecy is open and the stacks are 0/15/3, with 33 steps left. A player reports a real violation at the ritual table. Review the active condition and precedence exceptions before confirming. If confirmed, the unique largest pile is B, so one candle returns to A. The snapshot is 1/14/3 with 34 steps left. The first prophecy remains open and active even though A now has a candle. Rejecting leaves the previous snapshot unchanged.

Store reveal state independently from the current candle count. Never infer that an open prophecy becomes closed when a penalty moves a candle back. The next deal, placement and exorcism in round five all carry 1/14/3 and the same open prophecy. A restored pause in round five also carries this snapshot and any retained groups. The phone’s ritual dialog opens only the one or two current conditions, and closing it returns to the same player state.

The source material does not establish a tie-breaking rule for equal largest piles or a fallback when A alone is largest. The UI shows that this penalty remains unresolved. Do not silently guess or offer a freeform candle edit.

## 5. Ending at the seventh check

The demonstration success branch reaches round seven with 0/0/4, four steps left and two revealed prophecies. Four confirmed rescues exhaust the last stack, open the final condition and end the party in victory. Three rescues leave 0/0/1 and end it in defeat after the seventh check. If the group is fully possessed, first reconcile actual physical availability, including already freed players at the table. Explicit stop is a different terminal outcome. Each terminal history retains the final round, progress, opened conditions and outcome.

## 6. Physical play, preparation and closed content

- First-game mode suppresses trial effects for all seven rounds. Ordinary mode selects seven trials without revealing their objectives. Private instructions and the associated report belong to the affected player. The computer can ask for a report and apply the approved card outcome, but cannot observe speech, location or fear.
- The ordinary trial design must distinguish zero/one open prophecy from two and preserve the card-specific scoring. A missing source rule or unavailable target stays on explicit review. It must not result in a replacement trial or automatic credit after the outcome is known.
- The Spirit Dwelling is an agreed empty place. Three digital mission records are private. Perform the card-defined gesture or phrase at the place, retain the phone and report honestly. The visit, permitted early return and repeat visit trial uses distinct records. No location inference or extra credit is attached to the report.
- Exorcists explore alone with their light on. Possessed and captured players turn theirs off. Use a dim phone screen or other reduced light when needed. The ordinary bright flashlight is excluded. A naturally available house mirror is the approved exception for the specified follower task. Do not supply or stage a mirror.
- A coalition or an excessive conversation report can trigger early recall of free players. Technical help, accessibility and emergency stop remain possible outside the fiction. Applicable mission and trial instructions can override in-fiction base and prophecy restrictions.
- Support indoor, outdoor, contact and harder subsets before the first deal. Preserve locked selections and current assignment identities after dealing. Story copy is read to everyone before the first deal.
- The 90 authored card records are proposals. Trial adaptations and sample story or offering text must be labeled. Release conditions, Master-card outcomes and original provenance require the corresponding original cards.

## 7. Motion states and verification

Use separate motion presentation state from confirmed game state. Show stable before and after snapshots. Play candle moves in order at 450 ms each. Reveal at 500 ms, local candle extinguishing and smoke, and phase guidance at 250–350 ms. Keep the final text and scores available when motion stops. Pausing stops decorative motion. Reduced motion uses a short fade. No full-screen flashes or text distortion. Skip and recovery converge on the same committed state.

Validate the four main paths first: same-phase card hide/open, round-two receipt to next deal, penalty to round-five recovery, and round-seven victory/defeat. Then validate lost connection, correction after a dependent report, single free player, all-player recall, 12 long participant names and reduced motion. The current design specimens demonstrate these states. Runtime, live device balance, clock synchronization and physical acceptance remain implementation verification.
