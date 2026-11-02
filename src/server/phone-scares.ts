import { randomInt, randomUUID } from 'node:crypto';
import type { LobbyView, PhoneScare } from '../shared/protocol.js';
import { defaultClock } from './game.js';
import type { GameClock } from './game.js';

/** Ephemeral effects consume committed projections, never game mutations or checkpoints. */
export function createPhoneScares({ clock = defaultClock, randomIndex = randomInt, generateId = randomUUID, current, emit }: {
  clock?: GameClock; randomIndex?: (limit: number) => number; generateId?: () => string;
  current: () => Map<string, LobbyView>; emit: (connection: string, event: PhoneScare) => void;
}) {
  let roomId: string | undefined, roundId: string | null = null, seenSearch = false, disposed = false;
  const pending = new Map<string, { owner: string; cancel: () => void; token: object }>();
  function eligible(view: LobbyView): view is Extract<LobbyView, { kind: 'player' }> {
    return view.kind === 'player' && !!view.audioEnabled && view.room.phoneScaresEnabled
      && view.persistence?.state !== 'write_error' && view.persistence?.state !== 'load_error'
      && view.room.game.phase === 'search' && !view.room.game.paused
      && view.room.game.activePlayerIds.includes(view.playerId) && !!view.play && view.play.status !== 'released'
      && !view.synchronization?.withdrawn;
  }
  function cancelAll() { for (const item of pending.values()) item.cancel(); pending.clear(); }
  function update() {
    if (disposed) return;
    const views = current();
    const roomView = [...views.values()].find(v => v.kind !== 'ended' && v.room);
    const room = roomView && roomView.kind !== 'ended' ? roomView.room : null;
    if (room?.id !== roomId || room?.game.roundId !== roundId) {
      cancelAll(); roomId = room?.id; roundId = room?.game.roundId ?? null; seenSearch = false;
    }
    for (const [id, item] of pending) {
      const view = views.get(item.owner);
      if (!view || !eligible(view)) { item.cancel(); pending.delete(id); }
    }
    if (!room || room.game.phase !== 'search' || seenSearch) return;
    seenSearch = true;
    if (room.game.paused || room.game.roundPlan.kind === 'tutorial' || room.game.settings.searchSeconds < 40) return;
    // Do not start a new schedule from a recovered or late-joined search snapshot.
    const left = (room.game.deadline ?? 0) - clock.now();
    if (left < room.game.settings.searchSeconds * 1000 - 2000) return;
    const assigned = new Set<string>();
    for (const [owner, view] of views) {
      if (!eligible(view) || assigned.has(view.playerId)) continue;
      assigned.add(view.playerId);
      if (randomIndex(2) !== 0) continue;
      const expectedRoom = room.id, expectedRound = room.game.roundId!;
      const delay = 20000 + randomIndex(Math.max(1, Math.floor(left - 30000)));
      const id = view.playerId;
      const scheduledAt = clock.now() + delay;
      const token = {};
      const cancel = clock.schedule(() => {
        if (pending.get(id)?.token !== token) return;
        pending.delete(id);
        if (disposed || clock.now() - scheduledAt > 2000) return;
        const next = current().get(owner);
        if (!next || !eligible(next) || next.room.id !== expectedRoom || next.room.game.roundId !== expectedRound) return;
        if (clock.now() > (next.room.game.deadline ?? 0) - 10000) return;
        emit(owner, { id: generateId(), roomId: expectedRoom, roundId: expectedRound, serverNow: clock.now(), variant: randomIndex(3) as 0 | 1 | 2 });
      }, delay);
      pending.set(id, { owner, cancel, token });
    }
  }
  return { update, dispose() { disposed = true; cancelAll(); } };
}
