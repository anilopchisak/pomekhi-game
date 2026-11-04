# Target game rules

Accepted direction: reproduce the rules of Oderzhimye, replacing the human Great Master with the computer. The organizer remains a playing medium. [Current implementation](current-implementation.md) describes the implemented modes and the remaining differences. Technical [design documents](../design/README.md) describe that implementation until their mechanisms are changed.

The [player rulebook in Russian](../../output/player-rules/RULES-RU.md) explains these target rules in plain language. It is a target rulebook, not an instruction manual for the current build. For gameplay explanations, player documentation and rule changes, agents follow the [game rules workflow](../agent/game-rules.md) to select and verify the applicable ruleset.

## Authority and adaptation boundary

The reference is the supplied 16-page Russian Oderzhimye rulebook, also available through the [publisher's rules page](https://nizagams.ru/rules/oderzhimye/). Page references below identify that rulebook. The user's instruction of 2026-11-03 makes original-rule fidelity the target; previous custom mechanics do not remain requirements merely because they are implemented.

Preserve original preparation, roles, movement, mission conditions, capture, release, persistent possession, checking, candles, prophecies, victory and defeat. Change only what is needed to replace the Great Master with software and to record the same physical play through private phones. The computer is not a medium, does not occupy a player slot and cannot be captured.

Necessary computer adaptations are identified below. Unresolved interpretations are listed separately and must not be presented as original rules. Additional horror tiers, new mission families, branching stories, extra rituals and balance changes from the earlier audit are proposals, not accepted rules in this revision.

The user's later instruction of 2026-11-03 explicitly requires paper-free play. Physical mission cards, printed copies, paper tokens, drawing sheets and cardboard task props are therefore excluded. Phones retain private cards; a Dwelling offering becomes an on-site card-defined act plus an honest report. This is a user-authorized adaptation of the original physical deposit, not a quotation from the rulebook. The first-game variant includes authored on-site offering missions.

The user's subsequent instruction of 2026-11-03 also removes carried and pre-positioned task props. Play uses bodies, voices, phones and naturally available spaces. The Spirit Dwelling is an agreed empty place. Existing house mirrors are an explicit exception: the follower is released by actually seeing its own face; no mirror is brought, turned or staged. Object-dependent authored missions and trials are adapted explicitly rather than presented as unchanged original cards. Use the authored prop-free cards available for this variant.

The PDF contains examples, not every commercial card. Do not invent missing card text or claim the existing authored bank reproduces the original decks. Exact card-level alignment requires the corresponding original content; the game structure below is established by the rulebook.

## Participants and physical setup

All human participants are mediums; the organizer sets up the application and plays on the same terms as everyone else. A shared laptop hosts the computer Master and ritual display. Phones provide private cards and reports of physical actions. Computer administration must not turn the organizer into a separate acting Master.

The boxed game is advertised for 6-12 people including its human Master. With that role replaced, the direct equivalent is 5-11 human mediums plus the computer. The approved UX/UI design extends the target to 5-12 human mediums, including the organizer, with the computer taking no player slot. The twelve-human extension requires separate live balance validation; the current application's 4-12-human capacity is not a target balance guarantee. At twelve humans, the unchanged N+1/2/3 formula starts with 13/2/3 candles: 18 virtual candles and 46 forward steps before penalties. This capacity is implemented for the first-game variant.

Choose a familiar, safe playing area and agree its boundaries. Use approximately half as many locations as mediums; the rulebook suggests about 4-6 locations in typical play. Designate a ritual room with the ritual table, distinct from exploration locations (page 4).

Choose a remote or particularly unsettling place within a permitted location for the Spirit Dwelling and agree its position verbally. No vessel, marker or prepared item is placed there. The original puts three random exorcist mission cards inside the game box (pages 2 and 4); in the accepted prop-free adaptation those three mission records stay private and digital, associated with the agreed place. This provides no additional draw, point or reward. Original deposit-symbol missions become an on-site gesture or spoken address while the player retains their phone.

Each medium has an individual light source. Use dim phone screens by default; ordinary bright phone flashlights are excluded. The original permits alternative portable light sources with reduced brightness when phones cannot be used (page 2).

## Decks and ritual preparation

The original contains 75 possessed missions, 42 exorcist missions, 11 Master trials, 6 story cards, 11 prophecy cards including the final door card, and 17 candle tokens (page 3). Counts describe the source game, not the current digital bank.

Include all ordinary possessed cards. Add indoor, outdoor, physical-contact and harder-card subsets only when they fit the setting and the group's agreement. These subsets may be combined (page 6). There is no mandatory three-level difficulty progression and no automatic increase in horror intensity.

Prepare the ritual as follows (pages 5-6):

1. Shuffle exorcist missions and possessed missions separately. Maintain their separate discard piles.
2. Select two random ordinary prophecy cards for A and B, face down. Place the final door prophecy in C, face down. A/B/C are the protocol's labels for the three positions printed in the Russian rulebook.
3. For N human mediums, place N+1 candles on A, two on B and three on C. The computer replaces the Master and is not included in N. Seven human mediums therefore start with 8/2/3 candles, requiring 31 forward steps, before penalties.
4. Shuffle the Master trials and select seven for the party, one per round. Their computer adaptations preserve hidden conditions and effects; they are not ordinary exorcist missions.
5. Select one story fitting the environment, or choose randomly. Read its prologue before the first round. The original supplies opening stories, not a mandatory branching campaign.

The computer stores the chosen story, prophecy cards, trial order and issued mission content. Reloading must not reroll hidden information or undo earned progress.

## Seven rounds and three phases

The party has seven rounds. Each round consists of preparation, exorcism and checking (page 4). Digital reading, placement, recall and review screens are subdivisions of these phases; they do not change who may act or return.

### Preparation

Deal alternating exorcist and possessed mission cards in order around the ritual table, starting with an exorcist. Participants read privately and conceal their cards. Changing position at the table between rounds changes which role they receive (page 7). The computer uses an explicit virtual table order in place of a physical dealer; it must preserve this alternation rather than introduce fairness-weighted role selection.

Unreleased possessed and captured mediums remain in their locations and keep their mission. Only free mediums at the ritual table take part in the next deal. This returner-only dealing follows the combined instructions on pages 7, 9 and 14; the digital edge cases are made explicit below.

The computer selects the next hidden trial. Before the first exorcism it presents the selected story. It then tells exorcists to remain at the table while newly possessed mediums go to their chosen allowed locations. Exorcists may discuss strategy during preparation. The computer announces when they may leave to explore.

Reading is untimed. No person needs to expose a private card to the organizer to receive ordinary instructions. A request for accessibility, technical help or a stop is outside the fiction and is never a capture trigger or prophecy violation.

### Exorcism

Possessed mediums stay in their selected location, turn off their light source once positioned and perform their card. They cannot leave or return to the ritual room until released. Captured exorcists remain with their captor and copy the same mission (pages 8 and 14).

Exorcists move alone. Coalitions and joint exploration are forbidden, but brief conversation when participants meet is allowed. Their primary goal is to release possessed mediums; they may also attempt their private mission before checking. They keep their light source on unless a card specifically instructs otherwise. They cannot return to the ritual room before the ritual call unless an applicable mission or trial overrides that restriction (pages 8, 12 and 14).

The possessed performer judges physical release and capture. If an exorcist meets the release condition, the released medium thanks them, turns on their light and immediately returns to the ritual room without interacting with others. Release of a possessed or captured medium also releases mediums in that location performing the same mission (page 8).

If an exorcist meets a card's capture condition, the possessed performer tells them to turn off their light and repeat the behavior, then explains or shows that mission. The captured exorcist remains with the group until release. Possession and capture do not expire at a round boundary.

The original does not impose an exact exorcism duration; approximately four minutes is guidance. The Master decides when to call the ritual and must end exorcism immediately on observing excessive conversation or coalitions. Players must not set their own timers or alarms (page 9). The computer replaces the Master's timing decision with an authoritative clock and a clear global recall announcement. A participant report supplies facts the computer cannot observe. A fixed visible phone countdown is not an original requirement. The user-approved digital interface now shows placement and exorcism countdowns on the shared laptop and private phones. Design specimens use 45 seconds for placement and four minutes for exorcism; these are interface defaults, not exact durations imposed by the original. Reading and checking remain untimed. Pause freezes remaining time; a disconnected view shows unknown time until it receives an authoritative snapshot. The first-game runtime implements these timer defaults.

At the normal ritual call, free exorcists return immediately. Already released mediums remain at the table. Unreleased possessed and captured mediums stay in their existing locations. A global recall of everyone is reserved for party termination, an emergency stop or a technical interruption that requires regrouping.

### Checking

Returning mediums discard their completed assignment as appropriate and report their result. Checking records completed play; it is not extra time to perform a new mission at base (pages 8-9).

- Each released possessed mission contributes one success.
- Each exorcist who completed their mission and was not captured contributes one success.
- A captured exorcist contributes no success for that assignment even if their mission was completed before capture or they were subsequently released.
- The computer contributes the trial result required by that round's adapted Master card.

For digital accounting, each original possessed assignment can earn its rescue credit once, including when it survives into a later round. Captives copying that assignment do not create extra rescue credits. Reporting an action twice, reconnecting or confirming the same result again cannot award another success.

Reconcile physical reports and delayed phone records before sealing the result. Players may remain physically in their locations while reporting; synchronization does not require unreleased groups to return to the table. A missing phone acknowledgement is not evidence that its owner is possessed, free or absent.

Each success moves one candle one position to the right. Resolve the ritual and ending conditions before preparing another round.

## Persistent possession and the next deal

Retain each unresolved mission, its possessed/captured members and physical location between rounds. The next preparation neither clears these groups nor redeals their members. Members do not gain a new mission merely because a new numbered round begins.

Deal to the returning subset in virtual table order, starting with an exorcist. One returning medium therefore receives an exorcist card and can attempt to free retained groups. The minimum size for starting a party must not prevent a later deal to fewer returners. Do not force at least two exorcists or restore a global possessed/exorcist ratio by releasing or redealing unresolved groups.

For example, seven mediums begin with four exorcists and three possessed. If two possessed are released and the third captures an exorcist, five mediums are available at the table and two remain in one unresolved group. The next deal gives new cards only to those five. If later only one medium is free, that medium can continue as the sole newly dealt exorcist.

## Candles and prophecies

Always move candles from the leftmost nonempty prophecy position: A to B, then B to C, then C off the board. Empty A before moving from B, and empty B before moving from C. Reveal cleared prophecy cards in order during checking (pages 10-11).

Opened prophecy conditions apply to all mediums at the ritual table until the party ends. A and B accumulate. The computer, replacing the Master, is exempt. Its announcements and interface must explain the active conditions without exposing unopened cards.

When a medium ignores an active prophecy, call attention to the violation and apply the original one-step backward candle rule. Select the pile with the most candles, considering candles already off the board as described on page 11. A candle cannot be moved off the left edge from A. Do not silently replace this with a larger penalty, lost score, newly hidden prophecy or an invented tie rule. The remaining interpretation cases are listed below.

Mission and trial effects override conflicting base rules and prophecy effects, as in the original (page 12). Technical communication and an emergency stop must remain possible regardless of an in-fiction speech restriction.

## Victory and defeat

The team must reveal all three prophecy cards and remove all their candles no later than the end of round seven. If candles remain after the seventh check, the team loses. If no medium can return to the ritual table when called because everyone is possessed/captured, the team loses (pages 3 and 10).

Count already returned freed mediums when determining whether anyone remains available. Capturing every currently searching exorcist does not by itself establish total-party defeat. Disconnects, unreconciled events and unconfirmed return reports must not be converted automatically into captivity or defeat.

On victory, defeat or an explicit stop, clearly recall everyone and close the party. No new round or freeplay can revise its result. Endless play, extra scored rounds and continuing a lost party with reset roles are not part of the original-rules game.

## Computer Great Master

The computer owns administration formerly performed by the human Master: dealing, private trial selection, story delivery, start and recall announcements, checking, candle movement, prophecy revelation and ending adjudication.

Preserve these trial properties (pages 6 and 13):

- Seven selected trials provide the seven-round sequence.
- Trial instructions and scoring conditions remain hidden except for the specific instruction an affected medium must receive.
- Apply the card's appropriate outcome for zero/one versus two opened prophecies. Do not substitute a flat automatic bonus.
- Announce the trial result at checking without requiring the organizer to inspect private conditions.
- The computer is not captured, does not receive a normal medium mission and does not earn credit merely for issuing an announcement or playing a sound.

Use honest participant reports for physical facts the Master would observe. Affected players receive private instructions and report what happened; conflicting evidence stays subject to explicit review. The computer must not pretend to have heard speech, tracked locations or observed fear.

Preserve a feasible original trial directly. If a trial requires the Master to walk, follow or personally frighten someone, give it an individually documented computer adaptation preserving its instruction, hidden objective and result as closely as possible. Such adaptations must be identified as adaptations, not verbatim original cards. Removing the entire trial system would remove a game mechanic beyond the authorized replacement of the Master.

The computer provides card-specific explanations for ordinary interpretation questions. Original cases not resolved by the supplied material remain explicit questions for card-level review, rather than discretionary new scoring by the organizer.

A phone screen substitutes for a physical card; a private near-black view can substitute for concealing it during possession. Temporary access to a card or action must not change role or score. Browsers cannot guarantee an extinguished backlight, background sound delivery or physical location, so accessible presentation and participant confirmation are required.

For a prop-free Dwelling offering, the medium must actually reach the agreed empty place and perform the card's stated gesture or phrase. They retain their phone and leave no object. The application records an explicit participant report; the report is a physical claim, not verification by the computer. A remote report alone does not establish arrival. Do not introduce camera, location or proximity claims, additional card draws, points or rewards as substitutes. A trial formerly requiring the Dwelling to be carried is individually adapted as an on-site call, an explicitly permitted early return with a remembered fictional address, and a return visit. Its physical actions need reports; the computer does not hear or observe them.

## First game and permitted subsets

The original first-game variant lasts seven rounds but suppresses Master trial effects throughout. The selected trials only count rounds; the computer still manages dealing, announcements, prophecies and candles (page 12). It earns no replacement automatic success for a suppressed trial.

The optional harder, indoor, outdoor and physical-contact subsets remain available according to page 6. Agree the applicable subsets before preparing the deck. A brief explanation of phone controls is application onboarding, not an additional scored or obligatory tutorial round.

Pairs, endless mode, arbitrary round counts, global capture-off settings, escalating difficulty, horror-level progression, new plot mechanics and extra rituals are outside this original-rules target. Existing software options do not make them accepted default rules. Any later variant must be approved and labeled separately.

## Preserved technical requirements

Keep private cards, organizer authorization, durable own-phone reports, causal correction, explicit result review and paused restart recovery. The server remains authoritative for recorded state; participants judge physical actions. Technical recovery must restore the same assignment and unresolved possession without rerolling or replaying atmosphere events.

Retain local laptop hosting, free Tuna access or LAN access, no mandatory accounts and no paid runtime AI service. These deployment choices support the same physical game; they do not grant new game abilities.

The first-game executable writes a separate private save. Existing round-reset parties are not migrated; the editable author catalog can be preserved.

## Remaining source interpretation work

The following are implementation questions, not permission to change the rest of the rules:

- Obtain complete original card conditions before claiming complete deck fidelity; document each necessary Master-card adaptation individually.
- Confirm the original backward-penalty behavior for equal largest piles and the case where A alone is largest. The PDF prohibits removing a candle from A but does not provide a complete digital tie/fallback algorithm.
- Confirm exact timing for selecting a trial's prophecy-count branch and handling an original trial whose intended target becomes unavailable. Do not reroll after an outcome is known.
- Confirm any unusual same-mission/same-location case involving independent original assignments, while preserving the explicit group-release rule on page 8.
- Confirm whether a completed ritual ends immediately or is formally announced at the end of that check; do not require meaningless extra rounds after an established victory.

Returner-only dealing and once-only credit across rounds are explicit digital readings of the original persistence rules. Preserve their documented examples unless a more specific original ruling establishes otherwise.

## Implementation gaps and acceptance

The executable implements First Game and Ordinary with persistent possession, returner-only dealing, the original candle budget and the prop-free Dwelling. New rooms default to the authored set, with optional horror replacements. Both modes using the authored set draw from its 10 ordinary prophecies and final door. Ordinary also uses the 11 authored trials. The trial branch is frozen at entry to checking. Unavailable targets and insufficient evidence earn no bonus and cause no redraw; tied largest piles or a largest pile A close a penalty report without movement. These are explicit digital adaptation rules; full original-deck fidelity remains future work. Voice and recorded music remain unimplemented presentation work.

Future alignment must verify persistent groups across multiple checks; a sole returning rescuer; total capture with and without an already freed medium; once-only late rescue credit; invalid mission credit after capture; original candle setup plus trial outcomes; first-game suppression; retained private state through restart; and delayed-event reconciliation without forcing captive return. Validate actual movement, lighting, audibility and phone interruption on real devices separately from software tests.
