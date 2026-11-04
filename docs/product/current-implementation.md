# Current implementation

The executable launches the **first-game** variant of [Oderzhimye with a computer Master](README.md). The organizer participates from a phone. The laptop admits five to twelve humans, hosts one room, delivers the prologue and phase calls, and shows the common ritual. The seven-round variant has no trial effects, trial scoring, practice round or postgame continuation.

## Prepare, deal and play

- Create a room, invite phones with its code or the LAN/Tuna link and QR, and save the base, permitted locations, empty Spirit Dwelling, story and virtual table order. The current author bank remains editable; the optional harder switch includes only explicitly marked cards. Three existing author missions concern an on-site offering. Reporting it counts only toward the assigned mission.
- Only existing identities can reconnect after the first deal. New assignments alternate exorcist and possessed in table order. At later deals only people confirmed at the base get cards. A sole returning medium is an exorcist. Reading is untimed; readiness does not start the round. The laptop can replace one card without changing its role or other assignments.
- The laptop starts a 45-second placement deadline. Newly possessed report a permitted location on their phone. Retained groups stay in place. A four-minute exorcism follows; exorcists explore individually. The server can end exorcism at the deadline, when a side can no longer act, or on the laptop's early call. At ordinary recall only free people return; the laptop opens untimed checking separately.
- Possessed and captured players follow the same private group card. Physical actions are participant reports. Group assignments, membership and reported places can survive a round boundary, and so can a group whose original holder leaves. Capturing and later releasing an exorcist never restores credit for that assignment's optional mission.

## Check and finish

Phones upload durable capture, release, mission and correction reports. Late or conflicting entries can be resolved on the laptop before the result is sealed. Physical status is a separate confirmation from a participant's phone or the laptop; connection loss is not evidence of captivity or return. Unconfirmed free people miss the next deal and can be confirmed at a subsequent check. The organizer can explicitly close waiting for missing journals; closed results are immutable.

The original candle formula is N+1 / 2 / 3. Each confirmed rescue of an original assignment or eligible mission moves one candle. Prophecies open in order and stay open after a backward step. A penalty selects the unique largest pile including candles off the board; if it is A or there is a tie, close the report without a move. The four endings are victory, seventh-check defeat, confirmed total possession, and stop. In all four endings everyone returns; a new party has a new room identity.

## Connection, display and saved state

The laptop shows initial roles and readiness. Current physical status is personal or appears during authorized recall/checking; other cards, the bank and unopened prophecies are never sent to the room. A phone can hide its card while keeping its phase and deadline. Disconnected timers are unknown. The laptop can skip candle playback; animation never changes saved state.

The executable saves the party in private data/party-v6.json. On upgrade it can recover the editable bank from data/session.json without restoring or replacing that old party. Restart restores active placement/exorcism paused and keeps untimed recall or checking at the same step with its reports and decisions. On the same origin, phones keep their own cached view and IndexedDB journal. LAN HTTP supports the open tab; production HTTPS or localhost can install the offline app shell.

See [first-game design](../design/first-game.md) for ownership, contracts and acceptance. The author bank is not an original-deck transcription. Ordinary mode with active computer trials, a full original bank, and real-device and physical balance acceptance remain separate work.
