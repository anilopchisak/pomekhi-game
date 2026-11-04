# Behind Your Back: horror revisions

This user-requested collection supplies 38 frightening entries of the authored original-rule adaptation: 26 possessed cards and 12 exorcist missions. It is content for review and future implementation, not a change to the current game. All game-facing text is Russian; author metadata is English. Active missions require no paper, printed token or cardboard task prop.

Open [index.html](index.html). The offline catalog has deck/requirement filters, ID/action search and outcome concealment. Its print stylesheet is an optional author-review capability, never a requirement for play. Fear is the purpose of the collection. HP011, HP012, HP025 and HE005 are marked harder for reflection reasoning or optical placement; being frightening alone does not add that mark.

The domestic revision retains 27 core variants, adapts nine and replaces HP009/HP017. The [complete decision register](../revision-audit.json), [human-source registry](../fiction-sources.json) and [research](../research.md) document the intention and physical causal chain for every variant. All six primary opening stories freely mix with this selection. Props are ordinary already-owned objects, not a special kit; scenes with two-hand actions need a stable nearby place for the lit phone. Captives can repeat shared-prop scenes with empty hands.

## Deliverables

| File | Purpose |
| --- | --- |
| [cards.json](cards.json) | 38 authoritative horror entries and their baseCard references |
| [merged-selection.json](merged-selection.json) | Detached 147-card editorial selection with all 38 one-for-one replacements applied |
| [index.html](index.html) | Complete offline author catalog with a replacement table |
| [editorial-review.json](editorial-review.json) | Individual actor/outcome review of all 38 cards and similarity checks |
| [validation.json](validation.json) | Structural checks, replacement counts and input hashes |
| [build.py](build.py) | Standard-library validator, selection builder and HTML renderer |
| [verification report](../../../artifacts/prop-free-20261103/verification.md) | Current browser/repository checks and acceptance limits |

The adjacent [primary set](../README.md) remains authoritative for its 147 original authored entries. Rebuilding this supplement requires that primary cards.json and index.html remain alongside it. The generated horror HTML embeds its stylesheet and needs no server, remote fonts, audio assets or account.

```sh
python3 output/cards/horror/build.py
```

The command checks the recorded base hash before producing a detached selection. It never writes to the primary files, source bank, saved session or runtime catalog. The current importer still requires its legacy clue field and format; neither file here is presented as a current-game import, and no placeholder helper is inserted.

## No task props

The user now excludes pre-positioned objects as well as carried equipment. The collection uses body, voice, empty-hand pantomime, phone and naturally available space. No household prop kit is prepared. The Dwelling is an agreed empty place with no vessel or marker.

The user explicitly keeps ordinary existing house mirrors: HP025 releases upon actual self-view without carrying or turning a mirror. HP006 uses a naturally available mirror with a human body interrupting its sightline. Corresponding admission requirements are explicit. Earlier material contracts and their later authorized overrides are retained in the amendment register.

## Selection and mechanics

Choose any horror revisions before dealing. For each chosen baseCard, remove that original card and use the horror entry instead. Do not append both entries of the same mission. Selecting all 38 still yields 147 cards with 75 possessed, 42 exorcist, 11 trial, 11 prophecy, six story and two reference cards. The two new requested behaviors, HP025 and HP026, share the same current physical edition as primary P026 and P030; they belong to both collections rather than introducing a second different solution. No trial, prophecy, ritual currency or phase is added.

Original optional categories remain available: indoor, outdoor, agreed physical contact and harder. Venue/contact labels are cumulative. Most old harder marks are deliberately removed from these versions when their actual action is simple; fear comes from pacing, gaze, voice, touch or anticipation. These are author revisions of the prior authored set, not newly recovered commercial card text.

Every possessed card has an observable behavior, a particular capture action and a distinct release action. Captives copy the group card. Unreleased groups stay in their location between rounds; a rescue credits the original assignment once. A captured exorcist cannot recover personal mission credit merely by being released later. No helper text or generic failed-attempt capture rule is present.

Staging follows each card's stated movement. The new follower moves only inside its location, only outside a free exorcist's gaze, and keeps two ordinary steps of distance. The spinner turns slowly with pauses; its outside orbit and all group positions must be clear. Nobody surprise-touches, blocks doors, impersonates real emergencies or approaches during a covered-screen interval. Contact is negotiated and never overrides withdrawal. A genuine stop, rule question, technical request or involuntary reaction cannot capture. HE010 fear credit requires the affected participant's explicit report.

Dwelling offerings use an actual visit to the agreed empty place and the card's gesture or address. All hand-framed shapes, coverings and offered things are imagined; no fabric, container or token exists. The shared edition of the spinner still needs an already-free route, and the follower stays in its own location. Existing surroundings are used without moving furniture or preparing scenery.

## Verification boundary

The local builder checks 38 complete entries, unique role-matching base IDs, a preserved 147-card composition, absent helper and paper requirements, distinct playable text and admission prerequisites. Review records explain completed-action distinctions, consent boundaries, shared editions and sole-rescuer feasibility. The merged selection preserves all nonselected card objects verbatim. These checks do not prove actual fear or discoverability.

Actual fear, discoverability, practical balance, dim-screen optical effects, audibility, native phone behavior and physical network play still require acceptance with participants. The game source, public protocol, state owners and persistence have not changed, so no runtime design document is rewritten for this content-only supplement.
