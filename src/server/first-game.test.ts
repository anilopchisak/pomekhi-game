import { expect, it } from 'vitest';
import { controlledClock } from '../../tests/helpers/game-clock.js';
import { createGame } from './game.js';
import { createLobby } from './lobby.js';
import { stories } from './first-game-content.js';
import { createCatalog } from './catalog.js';
import { createRitual, newRitual, validateRitual } from './ritual.js';
import type { PersonalCard, PhysicalStatus, RoundResult } from '../shared/protocol.js';

function fixture(count: number, getCards?: () => readonly PersonalCard[], online?: Set<string>) {
  const time = controlledClock(); let sequence = 0;
  const generateId = () => `id-first-game-${++sequence}`;
  const make = () => createGame({ firstGame: true, generateId, randomIndex: () => 0, clock: time.clock, getCards, onlinePlayers: online ? () => online : undefined, onChange() {} });
  const game = make();
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, online: true }));
  const ids = players.map(p => p.id);
  expect(game.configureVenue({ base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' }, order: ids })).toBeUndefined();
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
  const { game, deal } = fixture(5);
  const saved = game.publicState().venue;
  expect(game.cancelDeal()).toBeUndefined();
  expect(game.configureVenue({ ...saved, mode: 'ordinary', prologueRead: false })).toBe('SETTINGS_LOCKED');
  expect(game.publicState().venue).toEqual(saved);
  deal();
});

it('allows a replacement to restore the minimum roster after canceling the first deal', () => {
  const { game, ids, make } = fixture(5);
  game.remove(ids[4]);
  expect(game.add('replacement', 4)).toBe('SETTINGS_LOCKED');
  expect(game.cancelDeal()).toBeUndefined();
  const restored = make();
  restored.restore(game.exportState());
  expect(restored.add('replacement', 4)).toBeUndefined();
  expect(restored.add('sixth', 5)).toBe('SETTINGS_LOCKED');
  const roster = [...ids.slice(0, 4), 'replacement'];
  expect(restored.publicState().venue.order).toBeUndefined();
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

it.each(['return', 'between_rounds'] as const)('applies online missions and reviews offline missions during %s', phase => {
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
  expect(game.personalPlay('p2')?.missionCompleted).toBe(true);
  if (phase === 'return') check();
  expect(game.review().filter(row => row.status === 'review').map(row => row.actor)).toEqual(['p0']);
  expect(game.reviewPreview('mission-report', 'accept')).toMatchObject({ successes: 2, remainingSteps: 23, applied: true });
  expect(game.reviewPreview('mission-report', 'reject')).toMatchObject({ successes: 1, remainingSteps: 24, applied: true });
  expect(game.resolveSync('mission-report', 'accept')).toBeUndefined();
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
    const venue = { base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' } };
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
    expect(joined.game.venue.order).toBeUndefined();
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
    order: ids, sets, horror: true, features: ['space', 'mirror'] })).toBeUndefined();
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

it('applies saved timer durations and redraws roles within the balanced roster', () => {
  const time = controlledClock();
  let serial = 0;
  const game = createGame({ firstGame: true, generateId: () => `timer-${++serial}`,
    randomIndex: limit => limit - 1, clock: time.clock, onChange() {} });
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4'];
  expect(game.configureVenue({ base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' } })).toBeUndefined();
  const settings = { ...game.publicState().settings, placementSeconds: 2, searchSeconds: 3 };
  expect(game.configure({ ...settings, searchSeconds: 0 })).toBe('INVALID_INPUT');
  expect(game.configure(settings)).toBeUndefined();
  expect(game.deal(ids, 0, false)).toBeUndefined();
  const possessed = ids.filter(id => game.personal(id)?.card.role === 'possessed');
  expect(possessed).toHaveLength(2);
  expect(possessed).not.toEqual(['p1', 'p3']);
  expect(game.start(ids.map(id => ({ id, online: true })), true)).toBeUndefined();
  expect(game.configure(settings)).toBe('INVALID_PHASE');
  time.advance(2000);
  expect(game.publicState()).toMatchObject({ phase: 'search', remainingMs: 3000 });
  time.advance(3000);
  expect(game.publicState()).toMatchObject({ phase: 'return', deadline: null });
  game.dispose();
});

it('replaces a room once, leaving the previous players and invitations closed', () => {
  let serial = 0;
  const codes = ['ROOM22', 'ROOM33'];
  const lobby = createLobby({ organizerCode: 'ORGANIZER', firstGame: true, generateRoomCode: () => codes[serial++] });
  try {
    expect(lobby.execute('host', 'organizer:authorize', { code: 'ORGANIZER' }).ok).toBe(true);
    expect(lobby.execute('host', 'room:create', {}).ok).toBe(true);
    const roomId = lobby.exportState().room!.id;
    const resumeKey = 'f'.repeat(64);
    expect(lobby.execute('phone', 'player:join', { name: 'Медиум', roomCode: codes[0], resumeKey }).ok).toBe(true);
    expect(lobby.execute('host', 'room:restart', { roomId }).ok).toBe(true);
    expect(lobby.viewFor('phone')).toMatchObject({ kind: 'ended', reason: 'closed' });
    expect(lobby.execute('host', 'room:restart', { roomId })).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(lobby.exportState()).toMatchObject({ usedCodes: codes, room: { code: codes[1], players: [],
      game: { settings: { placementSeconds: 45, searchSeconds: 240 }, firstGame: { story: { title: expect.any(String) } } } } });
    expect(lobby.execute('phone', 'player:resume', { roomCode: codes[0], resumeKey })).toMatchObject({ ok: false, error: 'SESSION_EXPIRED' });
  } finally { lobby.dispose(); }
});

it('undoes an earlier independent infection and releases selected groups once', () => {
  const { game, start, make, check } = fixture(9);
  start();
  expect(game.playAction('p1', 'infect', 'p0')).toBeUndefined();
  expect(game.playAction('p1', 'infect', 'p2')).toBeUndefined();
  const [earlier, later] = game.personalPlay('p1')!.infections!;
  expect([earlier.targetId, later.targetId]).toEqual(['p0', 'p2']);
  expect(game.personalPlay('p4')!.infections).toEqual([]);
  expect(game.playAction('p1', 'undo', earlier.id)).toBeUndefined();
  expect(game.personalPlay('p0')!.status).toBe('exorcist');
  expect(game.personalPlay('p2')!.status).toBe('captured');
  expect(game.playAction('p2', 'release', undefined, undefined, undefined, ['p1'])).toBe('ACTION_UNAVAILABLE');
  expect(game.playAction('p4', 'release', undefined, undefined, undefined, ['p1', 'p6'])).toBe('ACTION_UNAVAILABLE');
  expect(game.personalPlay('p1')!.status).toBe('possessed');

  expect(game.playAction('p4', 'release', undefined, undefined, undefined, ['p1', 'p2', 'p3'])).toBeUndefined();
  expect(game.personalPlay('p4')!.status).toBe('exorcist');
  for (const id of ['p1', 'p2', 'p3']) expect(game.personalPlay(id)!.status).toBe('released');
  expect(game.personalPlay('p1')!.infections).toEqual([expect.objectContaining({ id: later.id, available: false, canRequestReview: true })]);
  expect(game.playAction('p1', 'undo', later.id)).toBe('UNDO_DEPENDENCY');
  check();
  expect(game.publicState().results.at(-1)?.rescuedGroups).toBe(2);
  const restored = make();
  restored.restore(game.exportState());
  expect(restored.publicState().results.at(-1)?.rescuedGroups).toBe(2);
  expect(restored.personalPlay('p2')!.status).toBe('released');
});

it('reviews a late offline release selection as one journal record', () => {
  const { game, start, check } = fixture(7);
  start();
  const roundId = game.publicState().roundId!;
  check();
  const release = {
    id: 'offline-release', clientId: 'offline-phone', sequence: 1, previousId: null, roundId,
    phase: 'search' as const, paused: false, estimatedServerTime: null,
    action: { kind: 'release' as const, targetIds: ['p1', 'p3'] },
  };
  expect(game.syncEvents('p0', roundId, [release])).toBeUndefined();
  expect(game.syncEvents('p0', roundId, [release])).toBeUndefined();
  expect(game.review().filter(row => row.id === release.id)).toEqual([expect.objectContaining({ status: 'review', action: release.action })]);
  expect(game.publicState().results.at(-1)?.rescuedGroups).toBe(0);
  expect(game.resolveSync(release.id, 'accept')).toBeUndefined();
  expect(game.publicState().results.at(-1)?.rescuedGroups).toBe(2);
});

function recallFixture() {
  const online = new Set(['p0', 'p1', 'p2', 'p3', 'p4']);
  const fixtureGame = fixture(5, undefined, online);
  const { game, start } = fixtureGame;
  expect(game.configure({ ...game.publicState().settings, offlineWaitSeconds: 2 })).toBeUndefined();
  start();
  expect(game.playAction('p1', 'infect', 'p2')).toBeUndefined();
  expect(game.playAction('p1', 'infect', 'p4')).toBeUndefined();
  online.delete('p0');
  expect(game.beginReturn()).toBeUndefined();
  game.reconcileRecall();
  return { ...fixtureGame, online };
}

it('starts waiting at recall and restores the remaining time before committing defeat once', () => {
  const { game, time, make } = recallFixture();
  expect(game.physicalStatus('p2')).toMatchObject({ status: 'captured', confirmed: true });
  expect(game.physicalStatus('p0')).toMatchObject({ status: 'exorcist', confirmed: false });
  time.advance(750);
  const saved = game.exportState();
  expect(saved.firstGame?.recallWait?.remainingMs).toBe(1250);
  game.dispose();
  time.advance(90000);
  const restored = make();
  restored.restore(saved);
  time.advance(1249);
  expect(restored.publicState().phase).toBe('return');
  time.advance(1);
  restored.reconcileRecall();
  expect(restored.publicState()).toMatchObject({ phase: 'finished', ritual: { outcome: 'no_return' },
    results: [{ lossReason: 'no_return', status: 'final', infectedPlayers: 2 }] });
  const version = restored.publicState().version;
  restored.reconcileRecall();
  expect(restored.publicState().version).toBe(version);
  expect(restored.exportState().ritual?.events.filter(event => event.kind === 'no_return')).toHaveLength(1);
});

it.each(['manual', 'reconnect', 'all_offline'] as const)('does not declare defeat on %s', scenario => {
  const { game, time, online } = recallFixture();
  if (scenario === 'manual') expect(game.confirmPresence('p0', 'at_base')).toBeUndefined();
  if (scenario === 'reconnect') { online.add('p0'); game.reconcileRecall(); online.delete('p0'); }
  if (scenario === 'all_offline') online.clear();
  time.advance(2000);
  expect(game.publicState().phase).toBe('return');
  expect(game.physicalStatus('p0')?.confirmed).toBe(scenario !== 'all_offline');
});

it.each(['accept', 'reject'] as const)('waits for a disputed liberation and reevaluates when the organizer chooses %s', decision => {
  const { game, time } = recallFixture();
  const roundId = game.publicState().roundId!;
  const event = { id: 'late-liberation', clientId: 'offline-rescuer', sequence: 1, previousId: null, roundId,
    action: { kind: 'release' as const, targetIds: ['p1'] }, phase: 'search' as const, paused: false, estimatedServerTime: null };
  expect(game.syncEvents('p0', roundId, [event])).toBeUndefined();
  time.advance(2000);
  expect(game.publicState()).toMatchObject({ phase: 'between_rounds', offlineWait: { awaitingReview: true } });
  expect(game.closeSync()).toBe('PRESENCE_REQUIRED');
  expect(game.resolveSync(event.id, decision)).toBeUndefined();
  game.reconcileRecall();
  expect(game.publicState().phase).toBe(decision === 'accept' ? 'between_rounds' : 'finished');
  if (decision === 'accept') expect(game.physicalStatus('p1')).toMatchObject({ status: 'released', confirmed: true });
});

it('records an unassigned infection without credit and later links the participant to a group', () => {
  const online = new Set(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  const { game, start, check, deal, time } = fixture(7, undefined, online);
  start();
  expect(game.playAction('p0', 'mission', undefined, true)).toBeUndefined();
  online.delete('p0');
  online.delete('p5');
  check();
  expect(game.reconcilePresence('p0', 'infected')).toBeUndefined();
  expect(game.personalPlay('p0')).toMatchObject({ status: 'captured', unknownGroup: true, missionEligible: false });
  expect(game.reconcilePresence('p5', 'released')).toBeUndefined();
  expect(game.reconcilePresence('p5', 'released')).toBe('ACTION_UNAVAILABLE');
  expect(game.publicState().results.at(-1)).toMatchObject({ missions: 0, rescuedGroups: 1 });
  game.reconcileRecall();
  expect(game.closeSync()).toBeUndefined();
  expect(game.finalize()).toBeUndefined();
  deal();
  expect(game.personal('p0')).toBeNull();
  expect(game.personalPlay('p0')?.unknownGroup).toBe(true);
  expect(game.start([...online, 'p0', 'p5'].map(id => ({ id, online: online.has(id) })), true)).toBeUndefined();
  expect(game.personalPlay('p0')?.unknownGroup).toBe(true);
  time.advance(45000);
  check();
  const group = ['p1', 'p3'].find(id => game.personalPlay(id)?.status === 'possessed')!;
  expect(game.reconcilePresence('p0', 'assign', group)).toBeUndefined();
  expect(game.personalPlay('p0')!.card).toEqual(game.personalPlay(group)!.card);
  expect(game.personalPlay('p0')?.unknownGroup).toBeUndefined();
});

it.each(['offline', 'reconnected'])('can clear an unknown-group infection without release credit for a %s player', connection => {
  const online = new Set(['p1', 'p2', 'p3', 'p4']);
  const { game, start, check } = fixture(5, undefined, online);
  start(); check();
  expect(game.reconcilePresence('p0', 'infected')).toBeUndefined();
  if (connection === 'reconnected') {
    online.add('p0');
    expect(game.reconcilePresence('p1', 'released')).toBe('ACTION_UNAVAILABLE');
  }
  expect(game.reconcilePresence('p0', 'released')).toBeUndefined();
  expect(game.physicalStatus('p0')).toMatchObject({ expected: 'at_base', status: 'released', confirmed: true });
  expect(game.publicState().results.at(-1)).toMatchObject({ rescuedGroups: 0, infectedPlayers: 1 });
});
