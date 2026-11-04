# Pixso mechanics audit repair

The editable work is on page `03 · Screens & prototypes` in the [Pixso file](https://pixso.net/app/design/PvAwgT1U6s5Oj8tX7ShmIA?icon_type=1&page-id=3%3A3). Sections 06–11 contain the new state specimens. The [scenario map](https://pixso.net/app/design/PvAwgT1U6s5Oj8tX7ShmIA?icon_type=1&page-id=0%3A1&item-id=11%3A18664) indexes them. [Implementation reference](IMPLEMENTATION.md) defines the phase, assignment, reporting and ritual invariants. The existing Figma files were outside this edit scope.

| Section | Content | Native nodes |
| --- | --- | --- |
| 06 · Аудит · карточка и фаза | Hidden reading for both roles, visible and hidden placement, hidden offline assignment at 320, 390 and 430 px | 5:14027 |
| 07 · Аудит · повторный раунд и история ритуала | Round 2 recall, receipt, review and confirmation. Round 3 and post-penalty deal. Four terminal histories. | 7:14143 |
| 08 · Аудит · испытания, сверка и подготовка | Mode, private trial and report, offering, violation review, phone ritual overviews, preparation, early recall, recovery and causal correction | 7:16309 |
| 09 · Аудит · непрерывность партии | Resume at 02:18, rounds 4–7 and seventh-round loss with one candle | 7:16658 |
| 10 · Передача · раунд, сверка и восстановление | Both round 2 outcomes, next reading and placement, round 5 preserved penalty state, paused and resumed 02:18, seventh-round preview outcomes | 11:15418 |
| 11 · Передача · развилки и адаптивные окна | Delayed report review, unknown physical status, saved preparation, trial review, retained group and responsive dialogs | 11:18073 |

Existing screen copy was updated for the empty Dwelling, phone-only mission records, on-site offering, the players’ light sources, retained groups and the technical-help exception. Edited Golos Text layers use Inter with the original size and line height because Pixso reports the imported Golos Text font as missing. Numeric layers continue to use IBM Plex Mono.

## Scenario mapping

The sections are static design states, as requested on November 4. Some imported links were updated earlier. They are incidental to this handoff. Frame labels and the mapping below establish the intended scenario. The clocks are visual specimens of authoritative remaining time.

| Audit | Intended route and invariant |
| --- | --- |
| F01 | Reading E/P visible ↔ PX59/PX60 at the same width. Readiness is an explicit action. Ready hidden → open ready, withdraw readiness → hidden reading. No automatic ready-to-placement delay. Host start → placement. P13 ↔ PX61 and P14 ↔ PX62 while placement remains active. Expiry at 45 s advances to the matching visible/hidden active state. P24 ↔ PX63 preserves offline status, cached assignment and unknown time. Pause preserves assignment and rejects gameplay reports. |
| F02 | L20 → L01 with remaining 02:18 → L09 at expiry. L48 → round 2 resume (7:16661) → round 2 recall (7:14144). Normal round 2 L45 expires after 240 s to the same recall. Sole-free L46 needs a contextual recall and review; count any already returned person. Recovery enters a paused snapshot with the same remaining time. |
| F03 | Round 2 recall → 7:14370 receipt → 7:14586 review → S13 delayed mission. Accept gives 7:14802 → S01 → S04–S06 at 36 steps. Reject gives S02 → S03 → S04B at 37 steps. A10 → 7:15197 → S07–S10B keeps 1/14/3, 34 steps and the open first prophecy. Skipping motion or reconnecting presents the committed snapshot. |
| F04 | T01 ordinary mode → T02 private arrival instruction → T03 early return to table → T04 return visit report → T05 reconciliation. T06 is the unavailable-target branch. Keep the seven selected trials private. Apply the card-specific 0–1 versus 2 open-prophecy outcome. Source interpretation still owns the exact condition, branch timing and unresolved target outcome. |
| F05 | L05 → D03 three private mission records. Assigned phone D01 → perform the on-site gesture or phrase → D02 report. No object or phone is left at the location. No extra points for issuing the report. |
| F06 | Open prophecy at the table → V01 violation report → V02 review. Reject returns to the unchanged ledger. Confirm once → A10B/A10 playback or skip → 7:15197. V03 covers unresolved largest-pile cases. |
| F07 | Room information or help → V04 at one open prophecy, V05 at two. Open only the corresponding M40P/M41P condition dialogs. Closing information returns to the same active phone state and does not restart its clock. |
| F08 | Preparation → C01 allowed subsets, C02 reorder, C03 story, T01 mode. Apply returns to preparation. After assignments are issued use C04 locked copy. The story options are authored specimens. |
| F09 | Active round → R01 observation of coalition or excessive conversation → early recall of free players → same round checking. An emergency stop calls everyone. Use card-specific precedence and the out-of-fiction technical-help exception. |
| F10 | Reported capture/release → E01/E02 correction. If subsequent records depend on it, E03 routes to host reconciliation. Mission reported → captured → released → E04, with no credit for that mission. Credit a released assignment once. |
| F11 | Round 7 preview S11 or S12 → commit → victory and 7:15413 history, or one candle remaining in 7:17697 and 7:15637 history. Confirmed total possession → L18 → 7:15861 history. Explicit stop → L19 → 7:16085 history. R03 illustrates the already-free exception. A terminal history cannot continue that party. |
| F12 | Original cards remain a source dependency. T02–T04 are labeled adaptations, D01 and C03 authored examples. The 90 authored cards are not a transcription of the original set. |

## Candle continuity specimen

For 12 players, the mock first-game sequence begins with 18 candles at 13/2/3 and 46 steps remaining. The table shows one demonstration result per round. The weighted count is three times A plus twice B plus C. Only reconciled records move candles. Eight returning players receive new cards in this specimen, while two groups comprising four players retain assignments and locations.

| Round confirmed | Rescue credits | Mission credits | Position after confirmation | Steps left | Newly opened |
| --- | ---: | ---: | --- | ---: | --- |
| 1 | 4 | 0 | 9/6/3 | 42 | — |
| 2 | 4 | 2 | 3/12/3 | 36 | — |
| 3 | 4 | 4 | 0/10/8 | 28 | A |
| 4 | 4 | 4 | 0/2/16 | 20 | — |
| 5 | 4 | 4 | 0/0/12 | 12 | B |
| 6 | 4 | 4 | 0/0/4 | 4 | — |
| 7 | 4 | 0 | 0/0/0 | 0 | C |
| 7, alternative | 3 | 0 | 0/0/1 | 1 | — |

The independent penalty specimen moves 0/15/3 to 1/14/3. The first prophecy stays open. Its next-deal state belongs to round 5 and keeps 34 steps. The starting round and scoring figures are illustrative and do not establish balance.

## Evidence and remaining checks

Pixso MCP verified the section IDs, 12 shared views in the first handoff batch, 29 new dialogs, and the arithmetic and open-condition counts on all 12 shared views. A second pass added the paused-to-running 02:18 state and the 37-step next-reading branch. Screenshots sampled the committed round 2 result, round 5 recovery, both laptop dimensions and open-prophecy dialogs at 320 and 430 px. The earlier screenshot at 390 px and the current 320 px reading specimen complete the sampled phone sizes. All sampled views retain the principal actions and the ritual data within the intended viewport.

The imported Golos Text font was unavailable to Pixso. Changed text uses Inter with preserved typographic sizing. IBM Plex Mono remains the numeric face. The application did not change, so no runtime gates were run for this design delivery. Live timers, event ordering under failure, keyboard and screen reader behavior, physical play balance and original card content remain implementation acceptance items.
