# Pomekhi editorial card set

This package contains 147 fully authored Russian cards without helper text: 75 possessed missions, 42 exorcist missions, 11 computer-Master trials, 10 ordinary prophecies plus one final door, six opening stories and two references. It is content for review and future integration, not an installed game update.

Open [index.html](index.html) locally. It works offline without a server, remote assets or an account. Search by title, action or ID, filter a deck or an optional subset, and use the outcome toggle to conceal or show scoring conditions. Source records and all 45 ordinary-prophecy pairs are included below the cards. Printing uses the current card filter; outcomes remain printed even if concealed on screen.

## Domestic-horror revision

The approved primary decisions are 31 retained possessed cores, 18 adaptations and 26 replacements; exorcists have 20 retained cores, 14 adaptations and eight replacements. The 38 horror entries have 27 retained cores, nine adaptations and two replacements. These decision counts describe the first domestic revision. The later prop-free instruction explicitly supersedes object-dependent outcomes and preparation, while retaining the two requested movement behaviors. Current overrides are shown in the comparison register. The comparison register is available inside the HTML under “Домашний хоррор”.

The six independent openings are now a private apartment/house and its adjacent yard or garden: an extra household place, an unvacated apartment, borrowed sleeping voices, an arrival from the yard, a garden presence entering the house, and a double on the property. Each is 900–1400 characters. No cast, plot branch, exact assignment, actual special room or physical story prop is required. The existing 11 prophecy mechanics are unchanged.

Each revision distinguishes an entity intention, an observable human performance, a specific capture act and a causal release. Source motifs are not supernatural factual rules or recovered commercial cards. Author-only rationale lives in the revision register; it is not a player assistance field. Fiction links identify inspirations separately from historical card provenance.

## Files and ownership

| File | Purpose |
| --- | --- |
| [cards.json](cards.json) | Authoritative authored texts, stable IDs, subset labels, prerequisites, provenance and integration notes |
| [source-audit.json](source-audit.json) | 270 source decisions: 147 fan-PDF cards, 90 existing personal cards, seven existing prophecies, 19 original examples and seven user requests |
| [source-audit.csv](source-audit.csv) | The same decisions and source observations, with a UTF-8 BOM for spreadsheet applications |
| [fiction-sources.json](fiction-sources.json) | Twelve human-created works, verified observations and explicit adaptation boundaries |
| [research.md](research.md) | Primary-text study and separately labelled design inferences |
| [revision-audit.json](revision-audit.json) / [CSV](revision-audit.csv) | All 185 primary/variant decisions, individual entity intentions, causal links and preserved-contract hashes |
| [editorial-review.json](editorial-review.json) | Individual review of 75 possessed mechanisms, similarity groups and rule walkthroughs |
| [prophecy-pairs.json](prophecy-pairs.json) | All 45 ordinary pairs, each with five executable-model witness scenarios |
| [validation.json](validation.json) | Actual content-validation result and hashes of the authored inputs |
| [build.py](build.py) | Standard-library-only validation and offline catalog generator |
| [INTEGRATION.md](INTEGRATION.md) | Separate future integration proposal; no implementation is included |
| [verification report](../../artifacts/prop-free-20261103/verification.md) | Current domestic-revision checks, gate results and physical-play limits |

Edit the authored JSON inputs, then run this command from the project root:

```sh
python3 output/cards/build.py
```

It validates content, references and deck counts, then rebuilds HTML, CSV, prophecy witnesses and the content-validation report. It never reads a live session, edits the runtime catalog, connects to the application or modifies the original PDFs. The authored source observations are already recorded; rebuilding needs no PDF libraries or access to Downloads.

## Source boundary

The supplied 16-page Oderzhimye rulebook owns the mechanics. It contains examples rather than the full commercial decks. Original IDs are cited only for visible material; partially obscured examples 01.25 and 04.04 are explicitly marked as partial. Added capture conditions are authored adaptations. In particular, original trial 03.08 concerns addressing the accompanying Master, not pronouncing the word ritual.

The supplied 22-page fan PDF owns none of the target rules. Its generic failed-attempt capture, alternative score budget, timed revelation schedule, attempt limits, compulsory captive recall and helper commands are excluded. Current server content is compared but never installed or overwritten. Source-file hashes and local paths are recorded in source-audit.json.

The pack uses the original optional categories: indoor, outdoor, physical contact and harder. An empty sets array means ordinary. Multiple labels are cumulative. For possessed cards the labels follow the original selection concept; venue prerequisites on other authored card types are editorial admission metadata, not a claim that those marks appeared on every commercial deck. No mandatory difficulty progression or additional horror-level taxonomy is introduced.

The only ritual ending card is R011. Captured exorcists copy their group card; they do not form another deck. A rescue credits the original assignment once. Captured exorcists cannot earn personal mission credit even after release. All trial effects are suppressed in the original first-game variant.

## No task props

The user's latest instruction removes both carried and pre-positioned equipment. No cups, coins, cords, cloth, containers, toys, markers or prepared objects are needed. All required actions use body, voice, empty-hand pantomime, phone and naturally available space. Any bed, covering or offering in a performance is explicitly imagined; its completion is a visible human gesture, not manipulation of a hidden object.

An ordinary existing house mirror is the explicit exception. P026/HP025 release as soon as the actor actually sees their own face in it. No one brings, turns or touches the mirror; the starting position must not already provide self-view. P039/HP006 also use an existing fixed mirror, but their release is a person interrupting the actor's reflected sightline. These are authored game conditions, not recovered source solutions. If no suitable existing feature is available, do not admit the corresponding card.

The Spirit Dwelling is an agreed empty place in a permitted location. No receptacle or marker is placed there. Its three initial mission records remain digital. T004's formerly material delivery is now an explicitly reported call/name/early-return/return-visit sequence; T007 observes a voluntary gaze response. Neither transports any object. The latest user-authorized overrides retain earlier baseline hashes in the amendment history instead of pretending the old material contracts were unchanged.

Choose already-free places for movement. Existing safe walls, floors, interior doors and trees can supply ordinary spatial features; they are not installed as equipment. Lighting tasks require a genuinely visible effect from the normal dim phone screen. Contact remains negotiated. Actors rest between repeated poses, and a real stop immediately ends performance. The two user-requested movement scenes retain their watched/unwatched following and slow arms-out rotation.

## Verification boundary

The build checks exact counts, complete fields, prohibited helper fields and commands, exact duplicate text, source coverage, trial evidence/branches and the finite prophecy compatibility model. Editorial review distinguishes recurring building blocks from noun-swapped duplicate objectives. It is an authoring-agent review, not a claimed human playtest.

Every ordinary-prophecy pair has witnesses for ordinary speech, answering, responding to the trigger word, arrival and a completed candle batch. The witness model does not understand arbitrary Russian sentences or prove accessibility at every physical table. Fixed appeals address the spirit; formal address applies to other mediums. A hand can be raised first and then used to cover the mouth. These clarifications avoid actual pair conflicts without adding a precedence between prophecies.

Live discoverability without extra assistance, fear response, practical success rates, the seven-round candle budget, lighting, audio, physical phone behavior and networking remain unverified. The original candle-penalty tie cases and trial branch timing still need a source ruling before runtime alignment. The pack states its walkthrough convention openly; it does not silently settle those questions for the application.

## No runtime design change

No source bank, protocol, validator, editor, game phase, save, catalog revision or issued assignment is changed. The existing design documents remain descriptions of the implemented application. This is why no mechanism-design document is rewritten for this content-only delivery. Preserve the user's existing documentation, START-GAME.md and design output separately.
