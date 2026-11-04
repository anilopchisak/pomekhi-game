# Pomekhi design review package

Figma: https://www.figma.com/design/ILsPo7txuQU0S96McIEWda/Pomekhi-UX-UI-Redesign

Open `index.html` for the review gallery, all 104 state mappings and searchable original/final copy for all 90 cards. The Figma file contains 152 editable screen frames, 38 modal overlays, six prototype starting points and 12 research boards across three pages. It was completed and checked through Safari.

Comment revision dated 2026-11-03 applies all nine Kamilla comments. The decision table is `revisions/2026-11-03-comments/comments-reviewed.json`.

## Delivery files

| Artifact | Purpose |
| --- | --- |
| `HANDOFF.md` | Product decisions, contracts for future implementation, interaction behavior, sound scenario and acceptance boundaries |
| `QA.md` | Actual verification scope and remaining device/runtime checks |
| `state-coverage.csv` / `.json` | All 104 source states with current native Figma destinations |
| `card-audit.csv` / `.json` | All 90 editorial decisions; JSON contains complete before/after copy |
| `cards-proposed.json` | Final text proposal, not imported into the running game |
| `figma-state.json` | Authoritative page, component, screen, action and overlay registry |
| `revisions/2026-11-03-comments/audit-result.json` | Final native geometry and destination audit |
| `browser-action-geometry.json` | Current visible action bounds and native reactions |
| `safari-prototype-checks.json` | Browser traversal log; includes intermediate attempts and successful reruns |
| `*-preview.png` | Native exports, including compact room, phones, editor, results and stress examples |

No game source, settings, saved session, runtime bank or audio file was changed. The existing `START-GAME.md` and original designer brief were preserved. The handoff describes future contract changes; those changes are not implemented here.

## Rebuild local review material

```sh
node output/design/pomekhi-redesign/build-content.mjs
node output/design/pomekhi-redesign/build-review.mjs
```

The first command regenerates editorial files from the local standard card source. The second rebuilds the local review gallery. Neither command contacts Figma or changes game state.

The `.js.txt` files are construction captures for Figma's Plugin API, not application JavaScript. Some older captures refer to superseded node IDs. Do not replay them blindly or use `build-resume.mjs` as a delivery command. The current file state is defined by `figma-state.json` and the final audit, not by historical scripts.

The prototype demonstrates fixed sample data. Arrow Right represents external phone/server events on designated states; placement and return use an eight-second review delay. File dialogs, downloads, text input, invitation URLs and audio playback remain implementation work. Physical phone and live-party acceptance remain unverified.
