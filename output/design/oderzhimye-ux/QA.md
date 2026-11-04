# Oderzhimye design verification

Verified on 2026-11-03. This is acceptance evidence for editable Figma design and a simulated prototype. It is not runtime or live-party acceptance.

## File and structural evidence

- New file: https://www.figma.com/design/uv4SdpjWGNJORTyrInJa88. The source Pomekhi file and its nine existing Kamilla comments were preserved.
- Three pages: research/flows, components, screens/prototypes. Seventeen research boards document decisions, motion, contracts, content provenance and source-state coverage.
- The final native audit reports 364 screen/overlay/responsive/review frames, 4,196 component instances and 2,055 navigation references. These counts include variants and review aids, not 364 distinct game stages.
- Native text uses only Golos Text and IBM Plex Mono. No image fills replace editable UI. Semantic variables are bound to primitives; candles and invitation QR are vectors.
- `state-coverage.csv` maps all 152 source states: 140 reworked/merged, 12 removed/replaced. `cards-reference.json` preserves all 90 authored identifiers and provenance.
- `final-audit-result.json`: all registered action nodes exist and have hit areas at least 44px; no reported target-size issues. `bounds-audit-result.json`: all 364 frames checked, zero non-scroll container overflows. Deliberate private-card and dialog scroll contents are excluded from overflow failures.
- Laptop layouts include 1366×768 and 1440×900; phone variants use 320, 390 and 430px widths. The twelve-player list fits the shared screen. Long names truncate without displacing role, readiness or replacement.
- Five/seven-player layout specimens use 6/2/3 candles (25 steps) and 8/2/3 (31 steps). Twelve players use 13/2/3 (46 steps). These are design specimens, not separately tested seven-round multiplayer sessions.
- `contrast.json`: active text pairs range from 7.41:1 to 16.95:1; the active control border on the raised surface is 3.99:1. Focus and disabled variants are present. Actual browser keyboard/screen-reader behavior belongs to implementation.

## Safari prototype checks

The file was edited and the prototype exercised in Safari. `safari-checks.jsonl` records asserted scene destinations; `safari-motion.json` records live motion observations. Earlier manual checks and native exports supplement these logs.

| Scenario | Actual observed result |
| --- | --- |
| First launch and invitation | Create route → QR/code → participants → physical-boundary agreement → preparation → reading |
| Settings/help/editor | Separate entry points; large editor, validation/conflict specimens and dirty-close confirmation; cancel returns to the editor and discard returns to settings |
| Replacement | Selected Nikita replacement opens the matching dialog; only his readiness changes; re-read blocks start until ready |
| Start and recall | Start → placement → in-room phase demonstration → recall, without a visible countdown |
| Round reconciliation | Phone synchronization → conflict review → approved report → result confirmation → ritual |
| Four-success ritual | Sequential A01 → A02 → A03 → A04 → A05, ending at 9/6/3 and 42 remaining steps |
| Pause/resume | Paused A03P remains stable for 1.2 seconds; resume continues from that position and ends at A05 |
| Next deal | L14 → L43 → L47 retains 42 steps; eight new cards, four retained assignments/groups/locations |
| Sole returner | L15 → L44 → L46; Maria is the sole new exorcist, other assignments remain retained |
| Penalty example | A10B → A10: 0/15/3 becomes 1/14/3, 33 becomes 34, A stays revealed |
| Exorcist at 320px | Mission confirmation → persistent success → confirmed undo; capture → release → recall → continued participation |
| Possessed at 430px | Eligible target → Olga confirmation → recorded capture → return to the reporting player's own assignment |
| Conceal/readiness | Concealing an already-ready card preserves readiness; an explicit unready action changes it |
| Empty targets/recovery | Empty eligible list returns safely; paused recovery resumes to the room |
| Long assignment at 390px | Native scroll moves only the card contents; navigation, current instruction, conceal and report buttons remain fixed. Before/after window captures are saved |
| Reduced motion | Explicit A12 branch opened and inspected; this is a design alternative, not an operating-system preference integration |

One L44 click attempt did not navigate while Safari had lost foreground focus. The log is preserved; repeating the same click with the Safari window active reached L46. No mockup change was needed for that attempt.

The final multi-screen PNG export stalled and was closed. Existing native exports and actual Safari window captures provide visual evidence; the editable Figma file remains the deliverable. Images from earlier exports can precede the final participant-column polish. Prefer the current Figma file and the final Safari captures.

## Content and implementation limits

Original complete commercial cards, story, trial and prophecy texts were not supplied. Authored p03/e06 are full-text specimens with visible provenance. Other unavailable original content is marked as a template; it has not been represented as an audited original deck. Trial adaptations and unresolved original rulings require source review.

Prototype links show representative scenarios and responsive branches. They do not execute authoritative multiplayer state, arbitrary combinations of participant reports, real imports/exports or seven physical rounds. Some secondary demonstration routes return to a canonical specimen. Editable forms and screen transitions specify future behavior rather than implement production persistence.

Still required after implementation: a live twelve-human balance session; complete 5/7/12-human playthroughs; real iOS/Android touch and keyboard behavior; OS reduced motion; screen readers and focus restoration; LAN/offline synchronization, restart and simultaneous actions; browser sound permissions and licensed recordings. Figma's explicit pause/skip/recovery branches do not prove those platform properties.

## Repository verification

Runtime source, tests, shared protocol, saves and audio assets were not changed. The accepted brand and twelve-human design extension were recorded in `CONTEXT.md` and `docs/product/README.md`. Existing unrelated edits were preserved. Runtime design documents need no mechanism update because this stage changes design artifacts and intended capabilities only.

The initial quick gate passed environment, TypeScript and unit tests. It failed on existing Russian `START-GAME.md`, a sandbox loopback restriction in the agent-tool shutdown test and two unused variables in construction scripts. The two introduced lint findings were fixed; the standalone lint rerun passed. The first full run passed all checks except documentation. It also caught Cyrillic in the newly added brand sentence in `CONTEXT.md`; that sentence was corrected to English transliteration. A focused documentation rerun now reports only the existing Russian `START-GAME.md`. The final graph/full verification is recorded in the repository's latest agent report.

The final semantic generation is `6687b293bdb338b79e593dfe3ff08d1fc2addd2633c0b90d9161710260ca088f-6a3e183a`, containing 1,238 nodes and 2,556 directed edges. All 61 glossary concepts and 41 relations were checked against the immutable current-source snapshot before publication.

## Timer follow-up, 2026-11-03

The user requested visible placement and round countdowns, superseding the earlier hidden-clock decision. See [TIMERS.md](TIMERS.md). The file now has 366 screen/overlay/responsive/review frames, including two placement-pause snapshots. Timers were added to 119 states using native components with existing tokens and typography. The focused layout audit reports 2,155 scene navigation references, 4,353 instances and no action-size failures. The post-fix bounds audit found zero non-scroll overflows.

Safari captures show the round countdown moving from 04:00 to 03:58, placement at 00:43 with its phase label preserved, and the 320px phone countdown at 03:58 beside the role. The placement pause route L08 → L51 → L08 was clicked and its destinations asserted. The pause is a representative frozen snapshot, not capture of arbitrary live elapsed time. Both timers run inside their existing screens. No four-minute real-device/synchronized multiplayer deadline test is claimed. The future clock-authority and continuity requirements are in TIMERS.md.

The narrow-phone review also exposed a pre-existing fixed-width text override inside the card. Text widths now follow the card's padded interior; full conditions scroll vertically while actions stay fixed. Runtime and test source remain unchanged. Quick verification passed environment, agent tools, lint, types and unit tests; its aggregate status is FAIL solely because the existing START-GAME.md is Russian. Graph generation after the timer requirement is ffd0961fe2120edbc4fdd6515d56691da9a7d657f6156cb11975bc37dac18433-f4141b25. Final full status is recorded in the latest repository agent report.

The autonomous placement transition was also observed: L08 reached L42 when inspected after approximately 53 seconds, with a configured 45-second deadline. `timer-safari-expiry.json` records the destination; no exact renderer timing precision is asserted. The post-fix 320px Safari capture confirms that the assignment text wraps inside the card and the timer/actions remain visible.

## User-comment pass, 2026-11-03

[Twelve comments](comment-review-2026-11-03/comments.json) were read from Safari and implemented as native editable changes. The [review matrix](comment-review-2026-11-03/REVIEW.md) maps every comment to screens and future requirements. Threads were not replied to, deleted or resolved. The original Pomekhi file was preserved.

The structural audit covers 404 roots, 4,530 instances and 2,612 navigation references. Registered action targets pass the 44px minimum and no raster fills replace UI. All 404 roots passed the non-scroll overflow check. Subsequent focused checks cover removal of three empty infected-card spacers and resizing twelve new prophecy dialogs to their matching 320/430px phone heights; close/done controls remain in bounds.

Actual Safari checks in this pass include:

- The invitation is a centered square. macOS Vision decoded the actual Safari screenshot to the phone-join Figma prototype URL. This is a prototype invitation rather than a live room link.
- Settings open from the shared room; their fullscreen action navigates to L35; L35 settings contain the exit action returning to L01. No fullscreen action remains in the room phase controls. The browser fullscreen API itself is not executed by Figma.
- P01W320 infection confirmation leads to P15W320 with the full p03 assignment. Concealment reaches P58W320 and reopening reaches P16W320. All six infected/group-card specimens match the possessed task exactly and omit the exorcist mission.
- Offline confirmation reaches P56W320, then its timed demonstration reaches the P57W320 connection warning. Retry reaches P15W320. This simulates future networking behavior and does not test an actual network failure.
- P08W320 reading confirmation reaches P10W320. Immediate screenshots distinguish the purple reading action from the outlined amber readiness withdrawal. The prototype later advances automatically to demonstrate round start.
- P04W320 shows the invalid code border and corrective error immediately beside the field.
- After the penalty in A10, the first prophecy opens its full condition. The second opens only the closed-information dialog. No hidden rule is exposed.
- From P36W320, room information opens the revealed-card overview and then the first condition. A post-fix capture shows the complete phone-height dialog and visible close/done controls. Close returns to P36W320.

The post-fix captures in comment-review-2026-11-03 are the visual authority for this pass. Earlier captures with black fallback labels, an empty infected-card spacer or a clipped phone dialog are retained as diagnostic history. Semantic paint fallbacks were corrected while preserving variable bindings. The broad captivity search produced only a false substring match inside the word VSTUPLENIE.

Original-deck review is still required for explicitly labeled authored prophecy examples. Runtime source, tests, protocol, saved sessions, audio and the 90-card bank were unchanged. The glossary records the approved infection UI wording; existing runtime design documents need no rewrite. Real-device accessibility, synchronization and live-party acceptance remain unverified.

Doctor passed. Quick checks passed environment, agent tools, lint, types and unit tests; the aggregate failed because the pre-existing START-GAME.md is Russian. The ready semantic graph generation is 77978c71722d1f1935fa90e3d63e5ccd68551dcf0c20d97203d398d1d53edac6-764e3ac9, with 1,245 nodes and 2,572 directed edges; all 30 golden checks passed. Final full status and freshness are recorded in the latest agent report after these artifacts are saved.
