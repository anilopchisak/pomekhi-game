# Domain glossary

Pomekhi is a cooperative horror party game. The organizer participates while software coordinates private assignments, round timing and shared atmosphere. The interface language is Russian; code identifiers and agent documents use English.

| Term | Meaning |
| --- | --- |
| Organizer | A participating person who configures the session on the laptop. This is not a separate acting game master. |
| Shared display | The laptop screen showing public phase, timing, results and atmosphere. Controls are located on the laptop. |
| Player screen | A browser on a phone showing only that participant's assignment and permitted actions. |
| Room | A logical multiplayer session. It is distinct from a physical zone in the house. |
| Base | The physical gathering location containing the laptop. |
| Zone | A named physical area used for possessed-player placement. |
| Round | One assignment and search cycle; it includes a placement head start and return phase. |
| Reading phase | Untimed access to private dealt cards and readiness before a manual round start; readiness never starts it. |
| Placement | A timed head start: possessed players take places while exorcists wait at base. |
| Search | The timed phase for finding and helping possessed players. |
| Return | A timed instruction for everyone to return to base; its normal completion credits the round. |
| Pause | The current timed phase with frozen remaining time; participants stop actions and wait safely. |
| Break | Untimed waiting between rounds; the next deal and start are manual. |
| Possessed player | A participant with a behavior, clue, release condition and optional infection trigger. |
| Exorcist | A participant who tries to release possessed players and has an optional private mission. |
| Original possessed player | A player assigned possession at the initial round deal; this defines the rescue-score denominator. |
| Release | A trusted participant report that the condition was physically satisfied. Software does not judge the live action. |
| Task | A private possessed-player card. |
| Mission | A exorcist's additional task; its completion contributes to a separate team count. |
| Tutorial | An optional simple opening round without infection; separate from normal difficulty progression. |
| Endless mode | Continued rounds from a finite reusable task bank, not runtime AI generation. |
| Foundation | The runtime transport foundation. Health/readiness retain this stage label even when a lobby exists; it does not assert playable rounds. |
| Lobby | The gathering state of one logical room before a deal; membership and presence continue during reading. |
| Captured player | An original exorcist currently following a possessed group card; capture removes mission credit. |
| Infection group | A round-local original possessed identity and its captured exorcists; any member can spread capture or release the group. |
| Provisional result | A completed round outcome that accepts mission reports and valid undo until sealed. |
| Final result | An immutable scored round outcome. |
| Resume key | A private bearer credential saved on a phone before joining; it recovers that participant, independently of name and socket ID. |

See [product requirements](docs/product/README.md) for rules and implementation status. [The shared protocol](src/shared/protocol.ts) owns current HTTP/event payload shapes; domain terms alone do not create wire contracts.
