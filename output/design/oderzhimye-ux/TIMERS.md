# Placement and round timers

This design follow-up supersedes the earlier decision to hide the public countdown. It changes the Figma file and intended interface only; runtime code, protocol and saved parties are unchanged.

## Appearance and coverage

- Shared laptop: a 216×48 timer inside the existing top navigation, beside connection status. Participants, room controls, phase and ritual retain their positions.
- Phone: a 136×32 compact timer beside the role/phase chip. The full assignment keeps its independent scroll; conceal, readiness and reporting actions remain outside it. Variants cover 320, 390 and 430px widths.
- Placement starts at 00:45; exorcism starts at 04:00. These design defaults can be revised without changing the original rulebook's approximate timing guidance. Reading, reconciliation, results and ritual motion have no countdown.
- Running, paused, disconnected and elapsed variants use existing semantic colors, Golos Text and IBM Plex Mono. The clock never flashes or shakes. Labels accompany the digits; display-only clocks are not buttons.
- Countdown variants tick once per second. Each size supports 04:00 through 00:00, plus paused and disconnected examples. The main placement demo changes to exorcism after 45 seconds; its exorcism demo recalls players after 240 seconds. A placement pause returns to placement rather than accidentally entering exorcism.
- Paused round examples retain 02:18; placement pause examples retain 00:45. Disconnected examples replace digits with `--:--` and a visible connection label.

## Future implementation contract

The server owns the phase deadline and paused remaining duration. Every device renders the same authorized deadline using a synchronized clock offset; display ticks must not send game actions. No personal alarm is created.

Pause freezes both the phase deadline and decorative motion. Resume uses the saved remaining duration. A page reload, card concealment, modal, participant report or navigation must not reset the clock. Reconnection restores the current authoritative phase and remaining duration; it does not restart a full interval or replay old phase changes. When disconnected, retain the assignment but show unknown remaining time until a fresh snapshot arrives.

At placement expiry, start exorcism and its clock. At round expiry, announce the recall and stop the clock. Existing addressed recall rules still apply: free mediums return, unresolved groups stay. The transition must be committed once; competing ticks or restored connections cannot end a phase twice.

Screen readers should announce meaningful phase changes, pause/resume and expiry. Do not announce every second. Reduced motion keeps discrete digit changes and removes decorative transitions. Audio cues remain part of the separate audio specification.

## Prototype boundary

Figma uses native component variants for the one-second countdown. Prototype scenes are representative snapshots: navigation between scenes or a pause/resume example can reset an interactive component to that scene's specified value. They do not capture arbitrary live pause time or synchronize laptop and phone instances. Continuous clock identity across navigation and reconnect is an application acceptance requirement, not a property proved by these design examples.

The timer component set and showcase are on the Components page. The main file remains https://www.figma.com/design/uv4SdpjWGNJORTyrInJa88.
