import { expect, it } from 'vitest';
import { controlledClock } from '../../tests/helpers/game-clock.js';
import { createGame } from './game.js';
import { createLobby } from './lobby.js';
import { stories } from './first-game-content.js';
import { createCatalog } from './catalog.js';
import { createRitual, newRitual, validateRitual } from './ritual.js';
import type { PersonalCard, PhysicalStatus, RoundResult } from '../shared/protocol.js';

function fixture(count: number, getCards?: () => readonly PersonalCard[]) {
  const time = controlledClock(); let sequence = 0;
  const generateId = () => `id-first-game-${++sequence}`;
  const make = () => createGame({ firstGame: true, generateId, randomIndex: () => 0, clock: time.clock, getCards, onChange() {} });
  const game = make();
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, online: true }));
  const ids = players.map(p => p.id);
  expect(game.configureVenue({ base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' }, order: ids }, ids)).toBeUndefined();
  if (getCards) {
    const legacy = game.exportState();
    legacy.venue = { ...legacy.venue!, mode: 'first', bank: 'local' };
    legacy.firstGame!.locked = true;
    game.restore(legacy);
  }
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

it('does not unlock preparation when the first deal is canceled', () => {
  const { game, ids, deal } = fixture(5);
  const saved = game.publicState().venue;
  expect(game.cancelDeal()).toBeUndefined();
  expect(game.configureVenue({ ...saved, mode: 'ordinary', prologueRead: false }, ids)).toBe('SETTINGS_LOCKED');
  expect(game.publicState().venue).toEqual(saved);
  deal();
});

it('allows a replacement to restore the minimum roster after canceling the first deal', () => {
  const { game, ids, make } = fixture(5);
  game.remove(ids[4]);
  expect(game.add('replacement')).toBe('SETTINGS_LOCKED');
  expect(game.cancelDeal()).toBeUndefined();
  const restored = make();
  restored.restore(game.exportState());
  expect(restored.add('replacement')).toBeUndefined();
  expect(restored.add('sixth')).toBe('SETTINGS_LOCKED');
  const roster = [...ids.slice(0, 4), 'replacement'];
  expect(restored.publicState().venue.order).toEqual(roster);
  expect(restored.deal(roster, 0, false)).toBeUndefined();
  expect(restored.start(roster.map(id => ({ id, online: true })), true)).toBeUndefined();
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

it.each(['return', 'between_rounds'] as const)('reviews missions reported during %s from both phone paths', phase => {
  const { game, start, check } = fixture(5);
  start();
  if (phase === 'between_rounds') check();
  else expect(game.beginReturn()).toBeUndefined();

  const roundId = game.publicState().roundId!;
  const action = { kind: 'mission', completed: true } as const;
  expect(game.syncEvents('p0', roundId, [{
    id: 'mission-report', roundId, clientId: 'phone-client', sequence: 1, previousId: null,
    action, phase, paused: false, estimatedServerTime: null,
  }])).toBeUndefined();
  expect(game.personalSync('p0')?.receipts).toEqual([{ id: 'mission-report', status: 'review', reason: 'timing' }]);
  expect(game.playAction('p2', 'mission', undefined, true)).toBeUndefined();
  expect(game.personalPlay('p0')?.missionCompleted).toBe(false);
  expect(game.personalPlay('p2')?.missionCompleted).toBe(false);
  if (phase === 'return') check();
  const direct = game.review().find(row => row.actor === 'p2')!;
  expect(game.reviewPreview('mission-report', 'accept')).toMatchObject({ successes: 1, remainingSteps: 24, applied: true });
  expect(game.reviewPreview('mission-report', 'reject')).toMatchObject({ successes: 0, remainingSteps: 25, applied: true });
  expect(game.resolveSync('mission-report', 'accept')).toBeUndefined();
  expect(game.resolveSync(direct.id, 'reject')).toBeUndefined();
  expect(game.personalPlay('p0')?.missionCompleted).toBe(true);
  expect(game.personalPlay('p2')?.missionCompleted).toBe(false);
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


it('recovers a missing group place only after an organizer confirms it', () => {
  const { game, make, start, check, settle, deal } = fixture(5);
  start(); check();
  expect(game.setLocation('p1', 'Кухня')).toBeUndefined();
  expect(game.personalPlay('p1')?.location).toBeNull();
  expect(game.missingLocations()).toContainEqual({ memberId: 'p1', proposed: 'Кухня' });
  const restored = make();
  restored.restore(game.exportState());
  expect(restored.missingLocations()).toContainEqual({ memberId: 'p1', proposed: 'Кухня' });
  expect(game.setLocation('p1', 'Кухня', true)).toBeUndefined();
  expect(game.personalPlay('p1')?.location).toBe('Кухня');
  expect(game.physicalStatus('p1')?.confirmed).toBe(false);
  settle(); deal();
  expect(game.personalPlay('p1')).toMatchObject({ retained: true, location: 'Кухня' });
});

it('preserves accepted marks during pause and rejects actions recorded while paused', () => {
  const { game, start, check } = fixture(5);
  start();
  expect(game.playAction('p0', 'mission', undefined, true)).toBeUndefined();
  const undo = game.personalPlay('p0')!.undo!.id;
  expect(game.pause()).toBeUndefined();
  expect(game.playAction('p0', 'undo', undo)).toBe('INVALID_PHASE');
  const roundId = game.publicState().roundId!;
  const event = { id: 'paused-undo', roundId, clientId: 'phone-test', sequence: 1, previousId: null,
    action: { kind: 'undo' as const, actionId: undo }, phase: 'search' as const, paused: true, estimatedServerTime: null };
  expect(game.syncEvents('p0', roundId, [event])).toBeUndefined();
  expect(game.personalPlay('p0')?.missionCompleted).toBe(true);
  expect(game.personalSync('p0')?.receipts.at(-1)).toMatchObject({ status: 'rejected', reason: 'paused' });
  expect(game.resume(true)).toBeUndefined(); check();
  expect(game.resolveSync(event.id, 'accept')).toBe('ACTION_UNAVAILABLE');
});

it('keeps the chosen story when settings are saved before players join and the room is restored', () => {
  const selected: number[] = [];
  const make = () => createLobby({ firstGame: true, organizerCode: 'ORGANIZER',
    generateRoomCode: () => 'ROOM22', randomIndex: limit => { selected.push(limit); return limit - 1; } });
  const lobby = make(), restored = make();
  function roomOf(owner: typeof lobby) {
    const view = owner.viewFor('host');
    if (view?.kind !== 'organizer' || !view.room) throw Error('No organizer room');
    expect(view).not.toHaveProperty('stories');
    return view.room;
  }
  try {
    expect(lobby.execute('host', 'organizer:authorize', { code: 'ORGANIZER' }).ok).toBe(true);
    expect(lobby.execute('host', 'room:create', {}).ok).toBe(true);
    const initial = roomOf(lobby);
    const { id, ...story } = stories.at(-1)!;
    expect(initial.game.story).toEqual(story);
    expect(initial.game.venue).toMatchObject({ storyId: id, mode: 'ordinary', bank: 'authored' });
    expect(lobby.execute('host', 'room:create', {}).ok).toBe(true);
    const venue = { base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' }, order: [] };
    for (const [i, place] of ['Угол', 'У стены'].entries()) expect(lobby.execute('host', 'venue:configure', {
      roomId: initial.id, requestId: 'save-party-' + i, roundId: null, gameVersion: roomOf(lobby).game.version,
      venue: { ...venue, dwelling: { zone: 'Кухня', place }, storyId: 'S001', mode: 'first', bank: 'local', horror: true, features: ['mirror'] },
    }).ok).toBe(true);
    expect(roomOf(lobby).game.venue).toEqual({ ...venue, dwelling: { zone: 'Кухня', place: 'У стены' },
      storyId: id, mode: 'ordinary', bank: 'authored', harder: false, sets: [] });
    for (let i = 0; i < 5; i++) expect(lobby.execute('phone-' + i, 'player:join', {
      roomCode: initial.code, name: 'Медиум ' + i, resumeKey: String(i).repeat(64),
    }).ok).toBe(true);
    const joined = roomOf(lobby);
    expect(joined.game.venue.order).toEqual(joined.players.map(player => player.id));
    restored.restore(lobby.exportState());
    expect(restored.execute('host', 'organizer:authorize', { code: 'ORGANIZER' }).ok).toBe(true);
    const saved = roomOf(restored);
    expect(saved.game.story).toEqual(story);
    expect(selected).toEqual([stories.length]);
    expect(restored.execute('host', 'deal:create', {
      roomId: saved.id, dealId: null, dealVersion: saved.dealing.version, requestId: 'deal-party-1', possessedCount: 0,
    }).ok).toBe(true);
    const reading = roomOf(restored);
    expect(reading.game.phase).toBe('reading');
    expect(reading.game.story).toEqual(story);
    expect(restored.exportState().room?.game.firstGame?.trials?.deck).toHaveLength(7);
    const start = { roomId: saved.id, gameVersion: reading.game.version, roundId: null };
    expect(restored.execute('host', 'round:start', { ...start, requestId: 'start-party-1', confirmWarnings: false }))
      .toMatchObject({ ok: false, error: 'START_WARNING' });
    expect(restored.execute('host', 'round:start', { ...start, requestId: 'start-party-2', confirmWarnings: true }).ok).toBe(true);
  } finally { lobby.dispose(); restored.dispose(); }
});

it('reviews a prophecy report only once and leaves the revealed condition open', () => {
  const { game, ids, start, check, settle, deal } = fixture(12);
  start();
  for (const id of ids.filter((_, i) => i % 2 === 0)) expect(game.playAction(id, 'mission', undefined, true)).toBeUndefined();
  for (const id of ids.filter((_, i) => i % 2 === 1)) expect(game.playAction(id, 'release')).toBeUndefined();
  check(); settle(); deal(); start();
  expect(game.playAction('p0', 'mission', undefined, true)).toBeUndefined();
  check(); settle();
  expect(game.publicState().ritual).toMatchObject({ positions: [0, 15, 3, 0], cards: [{ revealed: true }, { revealed: false }, { revealed: false }] });
  deal();
  expect(game.reportViolation('p0', 'A', 'Нарушение', 'during-reading')).toBeUndefined();
  expect(game.reviewViolation('during-reading', false)).toBeUndefined();
  start(); check();
  expect(game.reportViolation('p0', 'A', 'Нарушение', 'before-confirming')).toBe('ACTION_UNAVAILABLE');
  expect(game.confirmPresence('p1', 'in_group')).toBeUndefined();
  expect(game.reportViolation('p1', 'A', 'Нарушение', 'in-group')).toBe('ACTION_UNAVAILABLE');
  expect(game.confirmPresence('p0', 'at_base')).toBeUndefined();
  expect(game.reportViolation('p0', 'B', 'Нарушение', 'closed-slot')).toBe('ACTION_UNAVAILABLE');
  expect(game.reportViolation('p0', 'A', 'Назвали настоящее имя на базе', 'reported-violation')).toBeUndefined();
  expect(game.finalize()).toBe('RITUAL_REVIEW_PENDING');
  expect(game.reviewViolation('reported-violation', true)).toBeUndefined();
  expect(game.reviewViolation('reported-violation', true)).toBeUndefined();
  expect(game.publicState().ritual).toMatchObject({ positions: [1, 14, 3, 0], cards: [{ revealed: true }, { revealed: false }, { revealed: false }] });
  expect(game.violations().at(-1)).toMatchObject({ status: 'applied' });
  expect(game.ritualAction('undoPenalty')).toBeUndefined();
  expect(game.violations().at(-1)).toMatchObject({ status: 'reversed' });
  expect(game.publicState().ritual?.positions.slice(0, 3)).toEqual([0, 15, 3]);
});


it('keeps confirmed total possession terminal if an ordinary trial would exhaust the last candle', () => {
  let sequence = 0;
  const ritual = newRitual(5, 7, () => 0, () => 'terminal-' + ++sequence, true, true);
  const row = (number: number, successes: number, trialBonus?: 0 | 1): RoundResult => ({
    roundId: 'ordinary-' + number, number, kind: 'regular', difficulty: 1, infectionEnabled: true, status: 'final',
    rescuedGroups: successes, totalGroups: successes, missions: 0, totalMissions: 0, trialBonus, infectedPlayers: 0, activeMs: 1000,
  });
  for (let n = 1; n <= 6; n++) expect(ritual.commit(row(n, 4))).toBeUndefined();
  expect(ritual.commit(row(7, 0, 1))).toBeUndefined();
  expect(ritual.snapshot().outcome).toBe('won');
  ritual.stop('all_possessed');
  expect(ritual.snapshot().outcome).toBe('all_possessed');
  expect(() => validateRitual(ritual.exportState())).not.toThrow();
});

it.each([{ sets: [] }, { sets: ['contact'] }, { sets: ['indoor', 'harder'] }])('draws only eligible base missions for $sets', ({ sets }) => {
  const time = controlledClock();
  let sequence = 0;
  const make = () => createGame({ firstGame: true, generateId: () => 'authored-' + ++sequence, randomIndex: () => 0, clock: time.clock, onChange() {} });
  const game = make();
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4'];
  expect(game.configureVenue({ base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' },
    order: ids, sets, horror: true, features: ['space', 'mirror'] }, ids)).toBeUndefined();
  const seen = new Map<string, PersonalCard>();
  // Canceled previews still consume cards. Walk through the pool via normal deals.
  for (let attempt = 0; attempt < 40; attempt++) {
    expect(game.deal(ids, 0, false)).toBeUndefined();
    for (const id of ids) {
      const card = game.personal(id)!.card;
      expect(seen.get(card.id) ?? card).toEqual(card);
      seen.set(card.id, card);
    }
    if (attempt < 39) expect(game.cancelDeal()).toBeUndefined();
  }
  expect(seen.get('P001')).toMatchObject({ title: 'Колыбельная пустой комнаты' });
  expect(seen.get('P007')?.title).toBe(sets.includes('harder') ? 'Запись из соседней жизни' : undefined);
  expect(seen.has('P003')).toBe(sets.includes('contact'));
  expect(seen.has('P030')).toBe(false);
  expect(seen.has('P026')).toBe(false);
  const restored = make();
  restored.restore(game.exportState());
  expect(restored.publicState().venue).toMatchObject({ bank: 'authored', mode: 'ordinary' });
  expect(restored.publicState().venue.horror).toBeUndefined();
  expect(ids.map(id => restored.personal(id))).toEqual(ids.map(id => game.personal(id)));
  expect(restored.start(ids.map(id => ({ id, online: true })), true)).toBeUndefined();
  expect(restored.exportState().ritual?.cards.map(card => card.id)).toEqual(['R001', 'R002', 'R011']);
  expect(restored.exportState().firstGame?.trials?.deck).toHaveLength(7);
});
