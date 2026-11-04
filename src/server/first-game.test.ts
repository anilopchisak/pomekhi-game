import { expect, it } from 'vitest';
import { controlledClock } from '../../tests/helpers/game-clock.js';
import { createGame } from './game.js';
import { createCatalog } from './catalog.js';
import { createRitual, newRitual } from './ritual.js';
import type { PersonalCard, PhysicalStatus, RoundResult } from '../shared/protocol.js';

function fixture(count: number, getCards?: () => readonly PersonalCard[]) {
  const time = controlledClock(); let sequence = 0;
  const generateId = () => `id-first-game-${++sequence}`;
  const make = () => createGame({ firstGame: true, generateId, randomIndex: () => 0, clock: time.clock, getCards, onChange() {} });
  const game = make();
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, online: true }));
  const ids = players.map(p => p.id);
  expect(game.configureVenue({ base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' }, storyId: 'S001', harder: false, order: ids }, ids)).toBeUndefined();
  const deal = () => expect(game.deal(ids, 0, false)).toBeUndefined();
  const start = () => {
    expect(game.start(players, true)).toBeUndefined();
    time.advance(45000);
  };
  const check = () => {
    if (game.publicState().phase === 'search') expect(game.beginReturn()).toBeUndefined();
    expect(game.publicState()).toMatchObject({ phase: 'return', deadline: null });
    expect(game.beginReturn()).toBeUndefined();
  };
  const settle = (confirm: string[] = ids) => {
    for (const id of confirm) {
      const status = game.physicalStatus(id);
      if (status) expect(game.confirmPresence(id, status.expected)).toBeUndefined();
    }
    expect(game.closeSync()).toBeUndefined();
    expect(game.finalize()).toBeUndefined();
  };
  deal();
  return { game, time, make, ids, deal, start, check, settle };
}

it.each([[5, 6, 25], [7, 8, 31], [12, 13, 46]])('deals in table order for %i and starts the original candle budget', (count, candles, steps) => {
  const { game, ids, start, time } = fixture(count);
  expect(ids.map(id => game.personal(id)?.card.role)).toEqual(ids.map((_, i) => i % 2 ? 'possessed' : 'exorcist'));
  start();
  expect(game.publicState()).toMatchObject({ phase: 'search', remainingMs: 240000, ritual: { positions: [candles, 2, 3, 0], remainingSteps: steps } });
  time.advance(102000);
  expect(game.pause()).toBeUndefined();
  expect(game.publicState().remainingMs).toBe(138000);
});

it('deals valid imported cards whose IDs used to collide with a built-in offering', () => {
  const catalog = createCatalog();
  const card = catalog.cards().find(item => item.role === 'possessed')!;
  expect(catalog.execute({ action: 'import', revision: 0, requestId: 'custom-offering-id', file: {
    format: 'pomekhi.cards', version: 1,
    entries: [{ enabled: true, card }, { enabled: true, card: { ...card, id: 'E014', title: 'Imported possessed card' } }],
  } }, true)).toBeUndefined();
  const { game, ids } = fixture(5, catalog.cards);
  const dealt = ids.map(id => game.personal(id)?.card);
  expect(dealt).toContainEqual(expect.objectContaining({ id: 'E014', role: 'possessed', title: 'Imported possessed card' }));
  expect(dealt).toContainEqual(expect.objectContaining({ id: 'dwelling:E014', role: 'exorcist', offering: true }));
});

it('retains two members and their place across a five-returner deal, then credits the original once', () => {
  const { game, ids, make, time, start, check, settle, deal } = fixture(7);
  expect(game.start(ids.map(id => ({ id, online: true })), true)).toBeUndefined();
  expect(game.setLocation('p1', 'Кухня')).toBeUndefined();
  time.advance(45000);
  expect(game.playAction('p0', 'mission', undefined, true)).toBeUndefined();
  expect(game.playAction('p1', 'infect', 'p0')).toBeUndefined();
  expect(game.playAction('p3', 'release')).toBeUndefined();
  expect(game.playAction('p5', 'release')).toBeUndefined();
  const card = game.personalPlay('p0')!.card;
  check(); settle();
  expect(game.publicState().results.at(-1)).toMatchObject({ rescuedGroups: 2, missions: 0 });
  deal();
  expect(game.dealingState().assignments).toHaveLength(5);
  expect(game.personal('p0')).toBeNull();
  expect(game.personalPlay('p0')).toMatchObject({ status: 'captured', card, location: 'Кухня', retained: true });
  start();
  const copy = make(); copy.restore(game.exportState());
  expect(copy.personalPlay('p0')).toMatchObject({ card, status: 'captured', location: 'Кухня' });
  expect(copy.publicState()).toMatchObject({ paused: true, phase: 'search', remainingMs: 240000 });
  expect(game.playAction('p0', 'release')).toBeUndefined();
  expect(game.playAction('p1', 'release')).toBe('ACTION_UNAVAILABLE');
  expect(game.playAction('p0', 'mission', undefined, true)).toBe('ACTION_UNAVAILABLE');
  check(); settle();
  expect(game.publicState().results.at(-1)).toMatchObject({ rescuedGroups: 1, missions: 0 });
  deal();
  expect(game.dealingState().assignments.map(a => a.playerId)).toEqual(['p0', 'p1', 'p2', 'p4', 'p6']);
});

it.each([true, false])('recognizes confirmed full possession only without a returned medium (released=%s)', released => {
  const { game, start, check, settle, deal } = fixture(5);
  start();
  if (released) expect(game.playAction('p3', 'release')).toBeUndefined();
  for (const id of ['p0', 'p2', 'p4']) expect(game.playAction('p1', 'infect', id)).toBeUndefined();
  check();
  expect(game.closeSync()).toBeUndefined();
  expect(game.finalize()).toBe('PRESENCE_REQUIRED');
  settle();
  expect(game.publicState().ritual!.outcome).toBe(released ? 'playing' : 'all_possessed');
  if (released) {
    deal();
    expect(game.personal('p3')?.card.role).toBe('exorcist');
    expect(game.dealingState().assignments).toHaveLength(1);
  } else expect(game.freeplay()).toBe('INVALID_PHASE');
});

it('does not redeal an unconfirmed free medium and can stop before another round', () => {
  const { game, start, check, settle, deal } = fixture(5);
  start(); check(); settle(['p2']);
  deal(); expect(game.dealingState().assignments.map(a => a.playerId)).toEqual(['p2']);
  expect(game.finishParty()).toBeUndefined();
  expect(game.publicState()).toMatchObject({ phase: 'finished', ritual: { outcome: 'stopped' } });
});

function row(n: number, successes: number): RoundResult {
  return { roundId: `round-${n}`, number: n, kind: 'regular', difficulty: 3, status: 'final', infectionEnabled: true,
    rescuedGroups: successes, totalGroups: 12, missions: 0, totalMissions: 0, infectedPlayers: 0, activeMs: 0 };
}
it.each([3, 4])('commits the Pixso candle history and ends with %i last-round successes', final => {
  const ritual = newRitual(12, 7, () => 0, () => 'penalty', true);
  expect(ritual.commit(row(1, 4))).toBeUndefined();
  expect(ritual.snapshot({ ...row(2, 5), status: 'provisional' }).preview?.remainingSteps).toBe(37);
  expect(ritual.snapshot({ ...row(2, 6), status: 'provisional' }).preview?.remainingSteps).toBe(36);
  [6, 8, 8, 8, 8, final].forEach((points, i) => expect(ritual.commit(row(i + 2, points))).toBeUndefined());
  expect(ritual.snapshot()).toMatchObject({ outcome: final === 4 ? 'won' : 'lost', remainingSteps: 4 - final });
});
it('keeps an opened prophecy after the penalty and does not guess on a tied largest stack', () => {
  const ritual = newRitual(12, 7, () => 0, () => 'penalty', true);
  expect(ritual.commit(row(1, 12))).toBeUndefined();
  expect(ritual.commit(row(2, 1))).toBeUndefined();
  expect(ritual.snapshot().positions).toEqual([0, 15, 3, 0]);
  const preview = ritual.snapshot().penaltyPreview;
  expect(preview).toEqual({ source: 1, positions: [1, 14, 3, 0], remainingSteps: 34 });
  expect(ritual.penalty()).toBeUndefined();
  expect(ritual.snapshot()).toMatchObject({ positions: preview!.positions, remainingSteps: preview!.remainingSteps });
  expect(createRitual(ritual.exportState(), () => 'other').snapshot()).toMatchObject({ positions: [1, 14, 3, 0], remainingSteps: 34, cards: [{ revealed: true }, { revealed: false }, { revealed: false }] });
  const tie = newRitual(12, 7, () => 0, () => 'penalty', true);
  [12, 12, 12, 1].forEach((points, i) => expect(tie.commit(row(i + 1, points))).toBeUndefined());
  expect(tie.snapshot()).toMatchObject({ positions: [0, 0, 9, 9], canPenalize: false, penaltyDisputed: true, penaltyPreview: null });
  expect(tie.penalty()).toBeUndefined();
  expect(tie.snapshot()).toMatchObject({ positions: [0, 0, 9, 9], penaltyDisputed: true });
  expect(tie.exportState().events.at(-1)?.kind).toBe('dismissed_penalty');
});

it('allows verification to be corrected against an updated report', () => {
  const { game, start, check } = fixture(5);
  start(); check();
  expect(game.confirmPresence('p1', 'at_base' satisfies PhysicalStatus)).toBe('ACTION_UNAVAILABLE');
});

it.each(['return', 'between_rounds'] as const)('accepts a mission reported during %s from either phone path', phase => {
  const { game, start, check } = fixture(5);
  start();
  if (phase === 'between_rounds') check();
  else expect(game.beginReturn()).toBeUndefined();

  const roundId = game.publicState().roundId!;
  const action = { kind: 'mission', completed: true } as const;
  expect(game.syncEvents('p0', roundId, [{
    id: 'mission-report', roundId, clientId: 'phone', sequence: 1, previousId: null,
    action, phase, paused: false, estimatedServerTime: null,
  }])).toBeUndefined();
  expect(game.personalSync('p0')?.receipts).toEqual([{ id: 'mission-report', status: 'accepted', reason: null }]);
  expect(game.playAction('p2', 'mission', undefined, true)).toBeUndefined();
  expect(game.personalPlay('p0')?.missionCompleted).toBe(true);
  expect(game.personalPlay('p2')?.missionCompleted).toBe(true);
});

it('retains a group when its original member leaves and does not award a rescue for departure', () => {
  const { game, ids, start, check, settle, deal } = fixture(7);
  start();
  expect(game.playAction('p1', 'infect', 'p0')).toBeUndefined();
  const original = game.personalPlay('p0')!.card;
  game.remove('p1');
  check(); settle();
  expect(game.publicState().results.at(-1)?.rescuedGroups).toBe(0);
  deal();
  expect(game.personalPlay('p0')).toMatchObject({ retained: true, card: original });
  expect(game.personalPlay('p1')).toBeNull();
  expect(game.start(ids.filter(id => id !== 'p1').map(id => ({ id, online: true })), true)).toBeUndefined();
});
