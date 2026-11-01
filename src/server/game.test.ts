import { describe, expect, it, vi } from 'vitest';
import { createGame } from './game.js';
import { controlledClock } from '../../tests/helpers/game-clock.js';

function setup(roundLimit: number | null = 5) {
  const timer = controlledClock(); let id = 0;
  const onChange = vi.fn();
  const game = createGame({ generateId: () => `id-${++id}`, randomIndex: () => 0, clock: timer.clock, onChange });
  const players = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, online: true }));
  game.configure({ roundLimit, placementSeconds: 2, searchSeconds: 3, returnSeconds: 2 , infectionEnabled: false});
  function deal() { expect(game.deal(players.map(player => player.id), 3, false)).toBeUndefined(); }
  function start() { expect(game.start(players, true)).toBeUndefined(); }
  deal();
  return { game, players, ...timer, onChange, deal, start };
}

it('does not start from readiness; requires composition, replacements and explicit warning confirmation', () => {
  const { game, players, pending } = setup();
  expect(game.start(players, false)).toBe('START_WARNING');
  for (const player of players) game.change(player.id, game.personal(player.id)!.id, 'ready', true);
  expect(game.publicState().phase).toBe('reading'); expect(pending()).toBe(0);
  expect(game.start(players.map((player, i) => ({ ...player, online: i !== 0 })), false)).toBe('START_WARNING');
  game.change(players[0].id, game.personal(players[0].id)!.id, 'request', true);
  expect(game.start(players, true)).toBe('REPLACEMENT_PENDING');
  game.change(players[0].id, game.personal(players[0].id)!.id, 'request', false);
  game.remove(players[0].id);
  expect(game.start(players, true)).toBe('INVALID_COMPOSITION');
});

it('automatically advances three phases once and waits for a manual next deal and start', () => {
  const { game, advance, onChange, pending, start, deal } = setup(); start();
  const assignment = game.personal('p0');
  advance(2000); expect(game.publicState()).toMatchObject({ phase: 'search', completedRounds: 0 });
  advance(3000); expect(game.publicState().phase).toBe('return');
  advance(2000); expect(game.publicState()).toMatchObject({ phase: 'between_rounds', completedRounds: 1 });
  expect(onChange).toHaveBeenCalledTimes(3); expect(pending()).toBe(0);
  expect(game.personal('p0')).toEqual(assignment);
  advance(100000); expect(game.publicState().completedRounds).toBe(1);
  deal(); expect(game.publicState()).toMatchObject({ phase: 'reading', roundNumber: 2 });
  expect(pending()).toBe(0);
});

it('preserves the exact pause remainder and does not restart a phase', () => {
  const { game, start, advance, pending } = setup(); start(); advance(650);
  expect(game.pause()).toBeUndefined();
  expect(game.publicState()).toMatchObject({ phase: 'placement', paused: true, remainingMs: 1350, deadline: null });
  expect(pending()).toBe(0); advance(20000);
  expect(game.resume(false)).toBeUndefined();
  advance(1349); expect(game.publicState().phase).toBe('placement');
  advance(1); expect(game.publicState().phase).toBe('search');
  expect(game.resume(false)).toBe('INVALID_PHASE');
});

it('starts a full return timer from running or paused search and counts normal completion', () => {
  const { game, start, advance } = setup(); start(); advance(2500); game.pause();
  expect(game.beginReturn()).toBeUndefined();
  expect(game.publicState()).toMatchObject({ phase: 'return', paused: false, remainingMs: 2000 });
  advance(2000); expect(game.publicState().completedRounds).toBe(1);
});

it('aborts without credit, keeps cards and clears the timer; reading cancel preserves party progress', () => {
  const { game, start, advance, pending, deal } = setup(); start();
  const card = game.personal('p0'); game.abort();
  expect(game.publicState()).toMatchObject({ phase: 'between_rounds', completedRounds: 0, lastRoundAborted: true });
  expect(game.personal('p0')).toEqual(card); expect(pending()).toBe(0);
  advance(50000); deal(); game.cancelDeal();
  expect(game.publicState()).toMatchObject({ phase: 'between_rounds', completedRounds: 0 });
  expect(game.dealingState().assignments).toEqual([]);
});

it('finishes a finite party, extends it by one, and supports a manually finished endless party', () => {
  const finite = setup(1); finite.start(); finite.advance(7000);
  expect(finite.game.publicState()).toMatchObject({ phase: 'finished', completedRounds: 1 });
  expect(finite.game.deal(finite.players.map(p => p.id), 3, false)).toBe('INVALID_PHASE');
  finite.game.extend(); expect(finite.game.publicState().settings.roundLimit).toBe(2);
  finite.deal(); finite.start(); finite.advance(7000); expect(finite.game.publicState().phase).toBe('finished');
  const endless = setup(null); endless.start(); endless.advance(7000);
  expect(endless.game.publicState().phase).toBe('between_rounds');
  endless.game.finishParty(); expect(endless.game.publicState().phase).toBe('finished');
  expect(endless.game.extend()).toBe('INVALID_PHASE');
});

it('locks party length after the first start but allows duration changes before a later start', () => {
  const { game, start, advance } = setup(); start();
  const settings = game.publicState().settings;
  expect(game.configure(settings)).toBe('INVALID_PHASE'); game.pause(); expect(game.configure(settings)).toBe('INVALID_PHASE');
  game.resume(false); advance(7000);
  expect(game.configure({ ...settings, roundLimit: null })).toBe('SETTINGS_LOCKED');
  expect(game.configure({ ...settings, searchSeconds: 90 })).toBeUndefined();
  expect(game.configure({ ...settings, placementSeconds: 0 })).toBe('INVALID_INPUT');
  expect(game.configure({ ...settings, returnSeconds: 3601 })).toBe('INVALID_INPUT');
});

it('assigns reading newcomers, waits timed newcomers, pauses on departure and permits explicit reduced-roster continuation', () => {
  const { game, players, start } = setup();
  game.add('late-reading'); expect(game.personal('late-reading')).not.toBeNull(); game.remove('late-reading');
  start(); game.add('late-running'); expect(game.personal('late-running')).toBeNull();
  game.remove(players[0].id);
  expect(game.publicState()).toMatchObject({ paused: true, pauseReason: 'participant_left', rosterChanged: true });
  expect(game.resume(false)).toBe('RESUME_WARNING'); expect(game.resume(true)).toBeUndefined();
  for (const player of players.slice(1)) game.remove(player.id);
  expect(game.resume(true)).toBe('INVALID_COMPOSITION');
  expect(game.abort()).toBeUndefined();
});

it('locks card and deal mutations throughout active phases and pauses', () => {
  const { game, players, start, advance } = setup(); const card = game.personal('p0')!; start();
  for (const paused of [false, true]) {
    if (paused) game.pause();
    expect(game.change('p0', card.id, 'request', true)).toBe('INVALID_PHASE');
    expect(game.change('p0', card.id, 'ready', false)).toBe('INVALID_PHASE');
    expect(game.change('p0', card.id, 'replace')).toBe('INVALID_PHASE');
    expect(game.deal(players.map(p => p.id), 3, true)).toBe('INVALID_PHASE');
    expect(game.cancelDeal()).toBe('INVALID_PHASE');
  }
  game.resume(false); advance(7000); expect(game.change('p0', card.id, 'ready', false)).toBe('INVALID_PHASE');
});

describe.each([false, true])('clock suspension with wall-only advancement = %s', wallOnly => {
  it('pauses at the last healthy remainder without replaying expired phases', () => {
    const { game, start, advance, jump, callbacks, pending } = setup(); start(); advance(1000);
    const wake = callbacks()[0]; jump(60000, wallOnly); wake();
    expect(game.publicState()).toMatchObject({ phase: 'placement', paused: true, pauseReason: 'clock_gap', remainingMs: 1000 });
    expect(pending()).toBe(0); game.resume(false); advance(1000); expect(game.publicState().phase).toBe('search');
  });
});

it('invalidates callbacks on disposal and leaves no timers or late publications', () => {
  const { game, start, callbacks, pending, onChange } = setup(); start(); const late = callbacks()[0];
  game.dispose(); late(); expect(pending()).toBe(0); expect(onChange).not.toHaveBeenCalled();
});

it('uses only completed possessed history for fairness, leaving canceled previews unplayed', () => {
  const { game, players, start, advance, deal } = setup();
  const possessed = () => players.filter(p => game.personal(p.id)?.card.role === 'possessed').map(p => p.id);
  const first = possessed();
  game.deal(players.map(p => p.id), 3, true); expect(possessed()).toEqual(first);
  start(); game.abort(); deal(); expect(possessed()).toEqual(first);
  start(); advance(7000); deal();
  expect(possessed().filter(id => first.includes(id))).toHaveLength(0);
  const publicJson = JSON.stringify(game.publicState()); expect(publicJson).not.toContain('history'); expect(publicJson).not.toContain('possessed');
});

it('keeps a provisional result editable after a failed next deal, then seals it on a successful deal', () => {
  const { game, players, start, advance } = setup(); start(); advance(7000);
  const exorcist = players.find(p => game.personal(p.id)!.card.role === 'exorcist')!.id;
  expect(game.deal(['too-few'], 1, false)).toBe('INVALID_COMPOSITION');
  expect(game.playAction(exorcist, 'mission', undefined, true)).toBeUndefined();
  expect(game.publicState().results[0]).toMatchObject({ status: 'provisional', missions: 1 });
  expect(game.deal(players.map(p => p.id), 3, false)).toBeUndefined();
  expect(game.publicState().results[0]).toMatchObject({ status: 'final', missions: 1 });
});
it('keeps infection off by default and includes only actual timed activity, excluding a pause', () => {
  const { game, players, start, advance } = setup(); start(); advance(2000);
  const root = players.find(p => game.personal(p.id)!.card.role === 'possessed')!.id;
  const exorcist = players.find(p => game.personal(p.id)!.card.role === 'exorcist')!.id;
  expect(game.playAction(root, 'infect', exorcist)).toBe('ACTION_UNAVAILABLE');
  game.pause(); advance(60000); expect(game.playAction(exorcist, 'mission', undefined, true)).toBe('INVALID_PHASE');
  game.resume(false); advance(5000);
  expect(game.publicState().results[0].activeMs).toBe(7000);
});
it('records aborted attempts separately and never permits their mission or undo edits', () => {
  const { game, players, start, advance } = setup(); start(); advance(2000);
  const root = players.find(p => game.personal(p.id)!.card.role === 'possessed')!.id;
  game.playAction(root, 'release'); const actionId = game.personalPlay(root)!.undo!.id;
  game.abort(); expect(game.publicState().results[0].status).toBe('aborted');
  expect(game.playAction(root, 'undo', actionId)).toBe('RESULTS_FINAL');
  expect(game.publicState().completedRounds).toBe(0);
});
