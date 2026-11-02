# Atmosphere and broadcast

Status: implemented. Atmosphere consumes committed game state and never controls phases, scoring or persistence.

## Ownership and public contracts

The organizer page has control and broadcast modes. App selects broadcast at `/?screen=display`; both modes use the same organizer authentication and connection hook. Broadcast renders phase, countdown, public ritual and post-return results, with sound, fullscreen and visual preferences. It renders no game mutation, membership or conflict-review forms. It is an authorized organizer connection, so the last-panel-disconnect pause includes it. Opening broadcast never sends the organizer code in its URL; same-origin opener sessionStorage or manual authorization provides the existing credential.

Lobby owns transient organizer audio ownership, one sound connection per player and the public phoneScaresEnabled flag. Commands organizer:atmosphere and player:audio validate principal, room and boolean input; like organizer:audio they set an idempotent capability and do not consume the durable gameplay command journal. New rooms enable phone effects globally. Restart/recovery disables them until the organizer opts in. Owners, consent and the global flag are absent from schema-4 checkpoints. Storage-error rollback preserves live capabilities while the unavailable-storage projection suppresses sound. Explicit storage retry clears organizer and phone sound owners even when their live connections remain authorized; playback requires a new source selection.

Socket transport feeds only committed Session projections into createPhoneScares. The injected clock and randomness make scheduling testable without game mutation. Each regular search of at least 40 seconds gets one independent 50 percent draw per eligible player who already has a sound owner. Selected events occur between 20 seconds and the final 10 seconds. Players entering or enabling sound later get no replacement draw. Pause, disconnect, owner transfer, global disable, withdrawal, release and phase changes cancel pending events. Resume never schedules replacements in the same search. Late callbacks over two seconds are discarded. Room change and server closure cancel timers.

The player:scare event contains an event ID, room/round IDs, server time and one of three procedural variants. It reaches only the selected connection, never the organizer or another tab. Events are ephemeral and never recovered. The connection hook and phone component reject mismatched, duplicate, hidden, stale or ineligible events. Hidden/pagehide cancels consent; returning requires explicit enable. Audio errors never affect offline actions or private-card recovery.

## Client audio lifecycle

Shared procedural audio owns AudioContext nodes, envelopes, compressor and local ambient timers; pages own consent and networking. Explicit buttons unlock audio. Phone consent plays a sample, defaults to 15 percent and clamps at 30 percent. The phone creates no ambient drone and receives no host cue. A host panel creates a low drone and phase-dependent levels; reading/breaks are quiet, search adds soft knocks every 30-60 seconds, pause and finish fade to silence. Signals duck the drone and distinguish return, pause, resume and terminal outcome. Master compression and ramps limit peaks; actual speaker comfort remains a device check.

Host levels default to background 12 percent, signals 20 percent and effects 10 percent, with a shared mute. Levels persist in sessionStorage but do not authorize playback. Ownership loss and connection/storage failure stop nodes and timers. Recovery requires a new audio-source selection. Live host cues retain existing timestamp/version deduplication; settings changes never replay them. Disposal is idempotent, including React StrictMode cleanup. The server is the sole phase clock.

WebKit may suspend an already unlocked idle phone context between phases or after native confirmation dialogs. While consent and ownership remain valid, phase changes and user clicks attempt to resume that context without replaying an effect. The explicit phone test button provides a gesture fallback. Hidden/disconnected consent is never restored by this path.

## Visuals and acceptance

Host-only scan lines, edge shading and phase copy never cover or move instructions. Visual effects can be disabled; reduced-motion removes animation and decorative noise. Phone cards keep their existing readable appearance. Fullscreen is an explicit gesture with ordinary-window fallback; connecting an old television is an external hardware task.

Tests cover private delivery, one draw/event, cancellation, authorization, restart reset, duplicate/expired events and audio-node cleanup over ten simulated minutes. Browser acceptance covers actual Web Audio activation, two organizer tabs, seven players, 320 pixels, reduced motion, LAN/Tuna and disk restart. Native Windows/iOS/Android, silent-mode behavior, physical speaker output and room audibility require actual devices. Voice, downloaded music and visual jump scares are outside this stage.
