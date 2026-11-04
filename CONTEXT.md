# Domain glossary

Pomekhi targets the rules of Oderzhimye with a computer replacing the Great Master. All humans, including the organizer, play mediums. The interface language is Russian; code identifiers and agent documents use English. [Target rules](docs/product/README.md) own game behavior; [current implementation](docs/product/current-implementation.md) records differences that this glossary does not claim are implemented.

The approved target interface brand is **Oderzhimye**. Pomekhi remains the repository/runtime identifier and the name of the preserved legacy design. The first-game screens use Oderzhimye; the runtime identifier and application entry points still use Pomekhi.

## Game terms

| Term | Meaning |
| --- | --- |
| Organizer | A participating person who configures the session on the laptop. This is not a separate acting game master. |
| Medium | Any human participant, playing an exorcist, a possessed medium or a captured exorcist. The computer Master is not a medium. |
| Computer Master | The replacement for the original Great Master: administrator, narrator and owner of hidden trials, exempt from medium roles and prophecy conditions. |
| Shared display | The laptop screen showing public phase, placement and exorcism countdowns, announcements, results and atmosphere. The computer owns the authoritative clock. Controls are located on the laptop. |
| Player screen | A browser on a phone showing only that participant's assignment and permitted actions. |
| Room | A logical multiplayer session. It is distinct from a physical zone in the house. |
| Base | The ritual room containing the laptop and ritual table; only free or released mediums gather there during ordinary checking. |
| Ritual table | The shared ritual position at base containing the prophecy cards and candles. |
| Zone | A named physical area used for possessed-player placement. |
| Spirit Dwelling | An agreed empty place in a permitted zone, associated with three private digital exorcist missions. It needs no receptacle or marker; some missions require an on-site gesture or address. |
| Offering | A card-defined gesture or spoken address performed at the agreed Spirit Dwelling place and reported for that mission. No physical card, token, vessel or other offering is left. |
| Round | One of seven preparation, exorcism and checking cycles. Unresolved possession can span several rounds. |
| Preparation | The phase for private dealing to free mediums at the table, reading, strategy and the departure of newly possessed mediums. |
| Reading phase | Untimed private reading within preparation. It does not start exorcism by itself. |
| Placement | The departure of newly possessed mediums to their chosen locations while exorcists remain at base. |
| Exorcism | The phase in which exorcists explore alone, attempt releases and perform private missions. |
| Search | The application's name for the exploration part of exorcism. |
| Ritual call | The Master's announcement ending exorcism and recalling free exorcists; unreleased possessed and captured mediums stay in their locations. |
| Return | A free medium's movement back to base after release or the ritual call. It does not free an unresolved group. |
| Checking | The phase for reporting completed actions, resolving trial outcomes and moving candles. |
| Returning medium | A free participant available at the ritual table for checking and the next alternating deal. |
| Table order | The order in which returning mediums receive alternating exorcist and possessed cards, starting with exorcist. |
| Pause | A suspension of play during which participants stop actions and wait safely; possession and earned results are retained. |
| Break | Waiting between rounds without clearing unresolved possession. |
| Possessed player | A medium performing a possessed mission in a location until released. |
| Exorcist | A participant who tries to release possessed players and has an optional private mission. |
| Original possessed player | A medium issued a possessed mission, distinct from exorcists captured into that mission. That assignment can earn one rescue credit when released. |
| Release | Freedom from possession after the card's physical condition is satisfied, judged by the possessed performer. |
| Task | A private possessed-player card. |
| Mission | A medium's private card objective; an exorcist's additional mission earns a success only if completed without capture. |
| Master trial | A hidden round-specific objective for the computer Master and affected mediums, with the original outcome tied to the applicable prophecy stage. |
| Story | The selected opening situation read before the first round, with an environment appropriate to the playing area. |
| First-game variant | Seven rounds without applying Master trial effects; trials serve only as the round counter. |
| Tutorial | Application instruction for using private cards and controls; a separate practice round is a legacy variant, not part of the target seven-round game. |
| Difficulty | Card complexity; the original permits an optional harder-card subset rather than mandatory numbered-round progression. |
| Card catalog | The editable local collection of enabled and disabled tasks, retained between rooms. |
| Deck cycle | A pass through an admissible collection before reusing its cards. |
| Foundation | The runtime transport foundation. Health/readiness retain this stage label even when a lobby exists; it does not assert playable rounds. |
| Lobby | The gathering state of one logical room before a deal; membership and presence continue during reading. |
| Captured player | An original exorcist currently following a possessed group card; capture removes mission credit. |
| Infection group | A possessed mission and its captured exorcists in the same location; unresolved possession persists until release across round boundaries. |
| Capture | An exorcist becoming possessed after meeting a card's capture condition. The approved Russian interface consistently calls this infection; capture remains a technical alias rather than a second mechanic. |
| Provisional result | A completed round outcome that accepts mission reports and valid undo until sealed. |
| Final result | An immutable scored round outcome. |
| Ritual | The shared candle objective advanced by eligible releases, exorcist missions and Master trial results. |
| Prophecy | A card revealed when its candle position is cleared; ordinary conditions accumulate at the ritual table, and the final card closes the ritual. |
| Ritual outcome | Immutable won, lost or stopped result; freeplay cannot reopen it. |
| Total-party capture | No medium remains free to return to the ritual table; it causes defeat, unlike capture of all currently searching exorcists when another medium is already free at base. |

## Legacy variant terms

These names describe existing options outside the original-rules target.

| Term | Meaning |
| --- | --- |
| Infection mode | The existing auto, on or off capture setting; it is not the original card-defined capture rule. |
| Endless mode | Continued rounds beyond the target seven-round party, using a finite reusable task bank. |
| Freeplay continuation | Additional rounds after a closed ritual, with separate results and the former outcome retained. |

## Technical support terms

| Term | Meaning |
| --- | --- |
| Checkpoint | A complete private server snapshot committed before publication; timed phases checkpoint about once per second. |
| Restart recovery | Loading the last checkpoint with fresh organizer authorization and active play paused; downtime is excluded. |
| Round withdrawal | A confirmed opt-out from the current round that retains room membership, prior achievements and group continuity. |
| Offline event | A durable own-phone action envelope with stable identity and local ordering, pending authoritative reconciliation. |
| Reconciliation | Server replay and explicit organizer review of disputed actions before sealing a result. |
| Synchronization barrier | Waiting for every frozen participant to confirm a drained journal, unless the organizer explicitly closes waiting. |
| Resume key | A private bearer credential saved on a phone before joining; it recovers that participant, independently of name and socket ID. |

See [target rules](docs/product/README.md) and [current implementation](docs/product/current-implementation.md) separately. [The shared protocol](src/shared/protocol.ts) owns current HTTP/event payload shapes; domain terms alone do not create wire contracts.
