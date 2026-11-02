import { expect, it } from 'vitest';
import { createGame } from './game.js';
import { controlledClock } from '../../tests/helpers/game-clock.js';
function fixture(roundLimit = 7) {
  const time = controlledClock(); let id = 0;
  const game = createGame({ generateId: () => `ritual-game-${++id}`, randomIndex: () => 0, clock: time.clock, onChange() {} });
  const players = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, online: true }));
  game.configure({ ...game.publicState().settings, roundLimit, tutorialEnabled: false, placementSeconds: 1, searchSeconds: 10, returnSeconds: 1 });
  const deal = () => game.deal(players.map(p => p.id), 3, false);
  const start = () => { expect(deal()).toBeUndefined(); expect(game.start(players, true)).toBeUndefined(); time.advance(1000); };
  const finish = (score = false) => {
    if (score) for (const p of players) expect(game.playAction(p.id, game.personal(p.id)!.card.role === 'possessed' ? 'release' : 'mission', undefined, true)).toBeUndefined();
    if (game.publicState().phase === 'search') game.beginReturn(); time.advance(1000);
    const s = game.publicState(); for (const p of players) game.completeSync(p.id, s.roundId!, s.synchronization!.revision);
  };
  return { game, players, time, start, finish, deal };
}
it('waits for synchronization and explicit confirmation; preview and replay never advance twice', () => {
  const f = fixture(); try {
    f.start(); const root = f.players.find(p => f.game.personal(p.id)!.card.role === 'possessed')!.id; expect(f.game.playAction(root, 'release')).toBeUndefined(); f.game.beginReturn(); f.time.advance(1000);
    expect(f.game.finalize()).toBe('SYNC_PENDING');
    const s = f.game.publicState(); for (const p of f.players) f.game.completeSync(p.id, s.roundId!, s.synchronization!.revision);
    expect(f.deal()).toBe('RITUAL_REVIEW_PENDING'); expect(f.game.finishParty()).toBe('RITUAL_REVIEW_PENDING');
    expect(f.game.publicState().ritual?.remainingSteps).toBe(28); expect(f.game.publicState().ritual?.preview?.successes).toBe(1);
    expect(f.game.finalize()).toBeUndefined(); expect(f.game.publicState().ritual?.remainingSteps).toBe(27);
    f.game.finalize(); expect(f.game.publicState().ritual?.remainingSteps).toBe(27);
  } finally { f.game.dispose(); }
});
it('wins early, freezes original outcomes and continues with separate freeplay results', () => {
  const f = fixture(); try {
    for (let i = 0; i < 4; i++) { f.start(); f.finish(true); expect(f.game.finalize()).toBeUndefined(); }
    expect(f.game.publicState()).toMatchObject({ phase: 'finished', completedRounds: 4, ritual: { outcome: 'won', remainingSteps: 0 } });
    const ritual = f.game.publicState().ritual;
    expect(f.game.extend()).toBe('INVALID_PHASE'); expect(f.game.freeplay()).toBeUndefined();
    expect(f.game.publicState()).toMatchObject({ freeplayFrom: 4, settings: { ritualEnabled: false, roundLimit: null } });
    f.start(); f.finish(); expect(f.game.publicState().ritual).toEqual(ritual); expect(f.game.publicState().results).toHaveLength(5);
  } finally { f.game.dispose(); }
});
it('keeps the last return in review and declares loss only after finalization, preserving paused recovery', () => {
  const f = fixture(1); try {
    f.start(); const saved = f.game.exportState(); f.game.restore(saved); expect(f.game.publicState().paused).toBe(true); f.game.resume(false);
    f.finish(); expect(f.game.publicState()).toMatchObject({ phase: 'between_rounds', ritual: { outcome: 'playing' } });
    f.game.finalize(); expect(f.game.publicState()).toMatchObject({ phase: 'finished', ritual: { outcome: 'lost' } });
  } finally { f.game.dispose(); }
});
it('does not change a recovered legacy tutorial when only durations change', () => {
  const f = fixture(); try {
    const settings = { ...f.game.publicState().settings, tutorialEnabled: true }; f.game.configure(settings); f.deal();
    const saved = f.game.exportState(); saved.roundPlan!.infectionEnabled = false; f.game.restore(saved);
    f.game.configure({ ...settings, searchSeconds: 20 }); expect(f.game.publicState().roundPlan.infectionEnabled).toBe(false);
    f.game.configure({ ...settings, infectionMode: 'off' }); f.game.configure(settings); expect(f.game.publicState().roundPlan.infectionEnabled).toBe(true);
  } finally { f.game.dispose(); }
});
it('does not invalidate host control versions for empty journal handshakes or repeated completion votes', () => {
  const f = fixture(); try {
    f.start(); const before = f.game.publicState();
    for (const p of f.players) expect(f.game.syncEvents(p.id, before.roundId!, [])).toBeUndefined();
    expect(f.game.publicState().version).toBe(before.version);
    f.finish(); const after = f.game.publicState();
    for (const p of f.players) expect(f.game.completeSync(p.id, after.roundId!, after.synchronization!.revision)).toBeUndefined();
    expect(f.game.publicState().version).toBe(after.version);
  } finally { f.game.dispose(); }
});
it('full capture returns to base without ending the ritual or wiping its goal', () => {
  const f = fixture(); try {
    f.start(); const root = f.players.find(p => f.game.personal(p.id)!.card.role === 'possessed')!.id;
    for (const p of f.players.filter(p => f.game.personal(p.id)!.card.role === 'exorcist')) expect(f.game.playAction(root, 'infect', p.id)).toBeUndefined();
    expect(f.game.publicState().phase).toBe('return'); f.finish(); f.game.finalize();
    expect(f.game.publicState()).toMatchObject({ phase: 'between_rounds', ritual: { remainingSteps: 28, outcome: 'playing' } });
  } finally { f.game.dispose(); }
});
it('retains the original goal after an aborted attempt and a larger replacement roster', () => {
  const f = fixture(); try {
    f.start(); const original = f.game.exportState().ritual; f.game.abort(); f.game.closeSync();
    const players = [...f.players, { id: 'late-player', online: true }];
    expect(f.game.deal(players.map(p => p.id), 3, false)).toBeUndefined(); expect(f.game.start(players, true)).toBeUndefined();
    expect(f.game.publicState().ritual).toMatchObject({ players: 7, roundLimit: 7, target: 28 });
    expect(f.game.exportState().ritual!.cards).toEqual(original!.cards);
  } finally { f.game.dispose(); }
});
it('labels an early manual finish stopped and preserves it during continuation', () => {
  const f = fixture(); try {
    f.start(); f.finish(); f.game.finalize(); expect(f.game.finishParty()).toBeUndefined();
    expect(f.game.publicState()).toMatchObject({ phase: 'finished', ritual: { outcome: 'stopped', remainingSteps: 28 } });
    expect(f.game.freeplay()).toBeUndefined(); expect(f.game.publicState()).toMatchObject({ freeplayFrom: 1, ritual: { outcome: 'stopped' } });
  } finally { f.game.dispose(); }
});
