import { expect, it } from 'vitest';
import { createGame, planRound } from './game.js';
import type { Difficulty } from '../shared/protocol.js';
import { controlledClock } from '../../tests/helpers/game-clock.js';

function fixture() {
  const time = controlledClock(); let id = 0;
  const game = createGame({ generateId: () => `progress-${++id}`, randomIndex: () => 0, clock: time.clock, onChange() {} });
  const players = Array.from({ length: 7 }, (_, i) => ({ id: `player-${i}`, online: true }));
  const configure = (changes: Partial<ReturnType<typeof game.publicState>['settings']>) => game.configure({ ...game.publicState().settings, ...changes });
  expect(configure({ placementSeconds: 1, searchSeconds: 1, returnSeconds: 1 })).toBeUndefined();
  const deal = () => {
    const state = game.publicState();
    if (state.synchronization) for (const player of players) expect(game.completeSync(player.id, state.roundId!, state.synchronization.revision)).toBeUndefined();
    expect(game.deal(players.map(p => p.id), 3, false)).toBeUndefined();
  };
  const start = () => expect(game.start(players, true)).toBeUndefined();
  const complete = () => { start(); time.advance(3000); };
  return { game, time, players, configure, deal, start, complete };
}

it('opens with a separate tutorial, then progresses through five scored rounds and infection', () => {
  const f = fixture();
  try {
    expect(f.game.publicState().settings).toMatchObject({ tutorialEnabled: true, initialDifficulty: 1, maximumDifficulty: 3, infectionMode: 'auto' });
    f.deal(); expect(f.game.publicState().roundPlan).toEqual({ kind: 'tutorial', number: 0, difficulty: 1, infectionEnabled: false });
    f.complete();
    expect(f.game.publicState()).toMatchObject({ phase: 'between_rounds', completedRounds: 0, tutorialCompleted: true });
    expect(f.game.exportState().history).toEqual([]);
    for (const [index, difficulty] of [1, 2, 2, 3, 3].entries()) {
      f.deal();
      expect(f.game.publicState().roundPlan).toEqual({ kind: 'regular', number: index + 1, difficulty, infectionEnabled: index >= 3 });
      f.complete();
    }
    expect(f.game.publicState()).toMatchObject({ phase: 'finished', completedRounds: 5 });
    expect(f.game.publicState().results.map(r => r.kind)).toEqual(['tutorial', ...Array(5).fill('regular')]);
    expect(f.game.exportState().history.reduce((total, [, count]) => total + count, 0)).toBe(15);
  } finally { f.game.dispose(); }
});

it('retries aborted tutorials and rounds without advancing progress and refuses tutorial infection even in on mode', () => {
  const f = fixture();
  try {
    expect(f.configure({ infectionMode: 'on' })).toBeUndefined(); f.deal(); f.start(); f.time.advance(1000);
    const root = f.players.find(p => f.game.personal(p.id)!.card.role === 'possessed')!.id;
    const target = f.players.find(p => f.game.personal(p.id)!.card.role === 'exorcist')!.id;
    expect(f.game.playAction(root, 'infect', target)).toBe('ACTION_UNAVAILABLE');
    expect(f.game.abort()).toBeUndefined(); f.deal();
    expect(f.game.publicState().roundPlan.kind).toBe('tutorial'); f.complete();
    f.deal(); const plan = f.game.publicState().roundPlan; f.start(); f.game.abort(); f.deal();
    expect(f.game.publicState().roundPlan).toEqual(plan);
    expect(f.game.publicState().results.map(r => [r.kind, r.status])).toEqual([['tutorial', 'aborted'], ['tutorial', 'final'], ['regular', 'aborted']]);
  } finally { f.game.dispose(); }
});

it.each([1, 2, 5, 99, null])('keeps progression monotonic and bounded for a horizon of %s', roundLimit => {
  const f = fixture();
  try {
    const settings = { ...f.game.publicState().settings, tutorialEnabled: false, roundLimit };
    const horizon = roundLimit ?? 5;
    const plans = Array.from({ length: horizon + 2 }, (_, i) => planRound(settings, i, false, horizon));
    expect(plans[0].difficulty).toBe(1);
    expect(plans.at(-1)!.difficulty).toBe(3);
    expect(plans.every((p, i) => p.difficulty >= (plans[i - 1]?.difficulty ?? 1) && p.difficulty <= 3)).toBe(true);
    expect(plans.find(p => p.infectionEnabled)!.number).toBe(Math.max(2, Math.ceil(0.75 * horizon)));
    if (horizon === 2) expect(plans.slice(0, 2).map(p => p.difficulty)).toEqual([1, 3]);
    if (horizon === 99) expect(plans[98].difficulty).toBe(3);
  } finally { f.game.dispose(); }
});

it.each([1, 2, 3] as Difficulty[])('supports a fixed difficulty %s and rejects invalid settings', difficulty => {
  const f = fixture();
  try {
    expect(f.configure({ tutorialEnabled: false, initialDifficulty: difficulty, maximumDifficulty: difficulty })).toBeUndefined();
    for (let i = 0; i < 5; i++) { f.deal(); expect(f.game.publicState().roundPlan.difficulty).toBe(difficulty); f.complete(); }
    expect(f.configure({ initialDifficulty: 3, maximumDifficulty: 1 })).toBe('INVALID_PHASE');
    expect(f.game.publicState().settings.initialDifficulty).toBe(difficulty);
  } finally { f.game.dispose(); }
});

it('locks progression on issued cards and on first start while keeping durations and infection editable before starts', () => {
  const f = fixture();
  try {
    expect(f.configure({ initialDifficulty: 3, maximumDifficulty: 1 })).toBe('INVALID_INPUT');
    expect(f.configure({ maximumDifficulty: 4 as Difficulty })).toBe('INVALID_INPUT');
    f.deal();
    for (const changes of [{ tutorialEnabled: false }, { roundLimit: 2 }, { initialDifficulty: 2 }, { maximumDifficulty: 2 }] as const)
      expect(f.configure(changes)).toBe('SETTINGS_LOCKED');
    expect(f.configure({ infectionMode: 'on', searchSeconds: 2 })).toBeUndefined();
    expect(f.game.publicState().roundPlan.infectionEnabled).toBe(false);
    f.game.cancelDeal(); expect(f.configure({ tutorialEnabled: false, roundLimit: 2 })).toBeUndefined();
    f.deal(); expect(f.game.publicState().roundPlan.infectionEnabled).toBe(true);
    f.start(); expect(f.configure({ infectionMode: 'off' })).toBe('INVALID_PHASE');
    f.time.advance(4000);
    expect(f.configure({ roundLimit: 5 })).toBe('SETTINGS_LOCKED');
    expect(f.configure({ infectionMode: 'off', searchSeconds: 1 })).toBeUndefined(); f.deal();
    expect(f.game.publicState().roundPlan.infectionEnabled).toBe(false); f.complete();
    expect(f.game.extend()).toBeUndefined(); f.deal(); expect(f.game.publicState().roundPlan.infectionEnabled).toBe(false);
  } finally { f.game.dispose(); }
});

it('retains the original progression horizon after extensions and keeps endless rounds at the ceiling', () => {
  for (const roundLimit of [2, null]) {
    const f = fixture();
    try {
      expect(f.configure({ tutorialEnabled: false, roundLimit })).toBeUndefined();
      const count = roundLimit ?? 7;
      for (let i = 0; i < count; i++) { f.deal(); f.complete(); }
      if (roundLimit !== null) expect(f.game.extend()).toBeUndefined();
      f.deal(); expect(f.game.publicState().roundPlan).toMatchObject({ difficulty: 3, infectionEnabled: true });
      expect(f.game.exportState().progressionRounds).toBe(roundLimit ?? 5);
    } finally { f.game.dispose(); }
  }
});

it('keeps a late reader, replacement and shuffle on the issued level and restores the frozen plan', () => {
  const f = fixture();
  try {
    f.configure({ tutorialEnabled: false, initialDifficulty: 2 }); f.deal();
    const plan = f.game.publicState().roundPlan;
    f.game.add('late'); expect(f.game.personal('late')!.card.difficulty).toBe(2); f.game.remove('late');
    const card = f.game.personal(f.players[0].id)!;
    expect(f.game.change(f.players[0].id, card.id, 'replace')).toBeUndefined();
    expect(f.game.personal(f.players[0].id)!.card.difficulty).toBe(2);
    expect(f.game.deal(f.players.map(p => p.id), 3, true)).toBeUndefined();
    expect(f.game.publicState().roundPlan).toEqual(plan);
    f.start(); f.time.advance(500); const saved = f.game.exportState();
    f.game.restore(saved);
    expect(f.game.publicState()).toMatchObject({ roundPlan: plan, paused: true, remainingMs: saved.remainingMs });
  } finally { f.game.dispose(); }
});
