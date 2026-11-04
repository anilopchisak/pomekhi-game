# Figma comment implementation

Source: twelve unresolved comments by pokasich in the Oderzhimye UX/UI file, read directly from the visible Safari comment panel. Exact Russian feedback is preserved in comments.json. The source Pomekhi file was not changed. Comment threads were not answered, deleted or resolved automatically.

| Comment | Change | Main evidence |
| --- | --- | --- |
| 1 | Replace the horizontally stretched invitation code with a centered 216px square, pure black/white modules and a four-module quiet zone. Keep the old vector anchor hidden for the comment. | L03; invitation.svg; qr-decoded.txt |
| 2 | Remove fullscreen controls from the room workspace and place enter/exit controls in party settings. Keep pause in the fullscreen room. | M02, M02F, L35 |
| 3 | Replace positional letters with the first prophecy, second prophecy and final door; show example titles after reveal. | Shared ritual and motion views |
| 4 | Make revealed prophecy cards open their full condition. Keep closed conditions hidden; previously revealed cards stay accessible after a backward candle step. | M40-M43, M44 variants, A09, A10, L16 |
| 5 | Give the independent task-scroll region a continuous rounded card surface and boundary extending to the bottom of its allotted block. | Personal task views at all three widths |
| 6 | Use bold task subheadings while preserving the complete authored conditions. | Exorcist and possessed p03/e06 examples |
| 7 and 11 | Use infection wording consistently instead of captivity wording. Preserve capture as a technical protocol alias. | Player/report/help/result views; CONTEXT.md |
| 8 | Place a settings icon on the left, the named room button in the center and a circled-question help icon on the right. Show the joining code in room information and invitation. | All personal navigation views; M01P family |
| 9 | Add an error-colored code field, invalid example and adjacent corrective message. | P04 family |
| 10 | Keep reading confirmation purple; style withdrawal of readiness as a secondary outlined amber action. | Reading and ready states |
| 12 | Show an infected exorcist the same complete possessed task as the infecting player. Hide the former exorcist mission; preserve the group through concealment. Add pending/error/retry states when the group card is unavailable. | P15/P16, P56/P57/P58, M27 families |

The sample room is named Old House in the Russian UI and still uses code ODR427. The sample infected player follows Mikhail's p03 assignment. Exact text equality against the possessed phone's task was checked for 320/390/430px; the former e06 assignment does not appear in the infected task. These are prototype specimens, not hardcoded application behavior.

Prophecy detail examples use the existing authored runtime collection: no-names, formal and door. The dialogs explicitly label their provenance and the need for original-deck review. Their existence in a design file does not make their text an approved commercial-deck reproduction. Closed-state prototype links open only a closed-information dialog.

## Future implementation requirements

- Deliver the actual infecting group's assignment ID, version, full content and permitted actions through the infected player's authorized projection. Do not choose an arbitrary possessed task or retain the old exorcist mission as a fallback.
- A report confirmed without connection is stored locally and remains provisional until authoritative reconciliation. Withhold the group card until association is confirmed. Retry restores the same assignment and clock rather than dealing again.
- Card concealment changes visibility only. It must not change group, role, readiness, mission eligibility or deadline.
- Use accessible Russian names for icon-only settings/help controls and room information. Their hit areas are 48px; provide visible keyboard focus and dialog focus restoration in implementation.
- Expose only revealed prophecy content. A backward candle move does not revoke an earlier reveal. Opening or closing a condition is informational and cannot score an event again.
- Fullscreen changes display mode in place and must preserve the current phase, participants, ritual and clock. Figma scene links demonstrate representative layouts; they do not invoke the browser fullscreen API.

No runtime source, shared protocol, saved party, task bank or audio file was changed. Existing runtime design documents therefore need no mechanism rewrite. The glossary records only the agreed UI terminology. The future group-card projection and accessibility behavior require implementation and real-device acceptance.

## Verification evidence

The native audit covered 404 roots and found no missing registered actions or targets below 44px. The bounds audit found zero non-scroll overflows. Text uses Golos Text and IBM Plex Mono; no raster fills replace editable UI. A focused follow-up removed three empty spacers above newly added infected-player cards; each task region then occupied the remaining workspace without overflow.

Safari inspection exposed black fallback paint values on token-bound labels and card strokes. Those values were aligned to their bound semantic variables without changing bindings; the post-fix captures show readable prophecy names and card boundaries. The broad infection-wording query matched only the substring in the unrelated word VSTUPLENIE, not a remaining captivity instruction. All six P15/P16 specimens match the possessed p03 task exactly and omit the former exorcist mission.

The actual invitation screenshot was decoded with macOS Vision to the exact phone-join prototype URL. The QR is a design-review link, not a live room credential. Safari window captures and asserted transitions are saved alongside this review and in ../safari-checks.jsonl. This is prototype acceptance; production networking, full-screen API continuity, accessibility and real phones remain separate implementation checks.

The phone prototype check found that newly created prophecy dialogs used the 390px specimen height at other widths. Their 320px variants now use 740px height and 430px variants use 932px. All twelve changed roots have their close/done controls within the frame; the 320px route and dismissal were exercised again in Safari. The full assignment regions remain independently scrollable while the card boundary and actions stay fixed.
