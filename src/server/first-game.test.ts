import { expect, it } from 'vitest';
import { controlledClock } from '../../tests/helpers/game-clock.js';
import { createGame } from './game.js';
import { createLobby } from './lobby.js';
import { stories } from './first-game-content.js';
import { shortAnswer } from './short-cards.js';
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
  expect(game.configureVenue({ base: 'База', zones: ['Кухня'], order: ids })).toBeUndefined();
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

it.each([[5, 2, 12], [7, 4, 18], [12, 10, 36]])('deals in table order for %i and starts the Ordinary candle budget', (count, candles, steps) => {
  const { game, ids, start, time } = fixture(count);
  expect(ids.map(id => game.personal(id)?.card.role)).toEqual(ids.map((_, i) => i % 2 ? 'possessed' : 'exorcist'));
  start();
  expect(game.publicState()).toMatchObject({ phase: 'search', remainingMs: 240000, ritual: { positions: [candles, 2, 2, 0], remainingSteps: steps } });
  time.advance(102000);
  expect(game.pause()).toBeUndefined();
  expect(game.publicState().remainingMs).toBe(138000);
});

it.each([5, 6, 7, 8, 9, 10, 11, 12])('opens the door for %i without missions after two failed rescues', count => {
  const { game, ids, start, check, settle, deal } = fixture(count);
  for (let round = 1; round <= 7; round++) {
    if (round > 1) deal();
    const exorcists = ids.filter(id => game.personal(id)?.card.role === 'exorcist');
    const missed = round === 2 || round === 4 ? ids.find(id => game.personal(id)?.card.role === 'possessed') : undefined;
    const rescuer = exorcists.at(-1)!;
    start();
    if (missed) expect(game.playAction(missed, 'infect', exorcists[0])).toBeUndefined();
    for (const [group] of game.personalPlay(rescuer)!.releaseGroups!) {
      if (group !== missed) expect(game.playAction(rescuer, 'release', undefined, undefined, undefined, [group])).toBeUndefined();
    }
    check(); settle();
    expect(game.publicState().results.at(-1)).toMatchObject({ rescuedGroups: Math.floor(count / 2) - Number(Boolean(missed)), missions: 0 });
  }
  expect(game.publicState()).toMatchObject({ phase: 'finished', completedRounds: 7,
    ritual: { outcome: 'won', remainingSteps: 0, cards: [{ revealed: true }, { revealed: true }, { revealed: true }] } });
});

it('keeps the original search deadline after the last group is released through the inbox', () => {
  const { game, start, time } = fixture(5);
  start();
  const { roundId, deadline } = game.publicState();
  expect(game.playAction('p0', 'release', undefined, undefined, undefined, ['p1'])).toBeUndefined();
  time.advance(1000);
  expect(game.syncEvents('p2', roundId!, [{
    id: 'last-release', clientId: 'offline-phone', sequence: 1, previousId: null, roundId: roundId!,
    phase: 'search', paused: false, estimatedServerTime: null, action: { kind: 'release', targetIds: ['p3'] },
  }])).toBeUndefined();
  expect(game.personalPlay('p3')?.status).toBe('released');
  expect(game.publicState()).toMatchObject({ phase: 'search', deadline, remainingMs: 239000 });
  expect(game.playAction('p4', 'mission', undefined, true)).toBeUndefined();
  time.advance(238999);
  expect(game.publicState().phase).toBe('search');
  time.advance(1);
  expect(game.publicState().phase).toBe('return');
  expect(game.beginReturn()).toBeUndefined();
  expect(game.publicState().results.at(-1)).toMatchObject({ rescuedGroups: 2, missions: 1 });
});

it.each([false, true])('recalls after the last active group leaves after an earlier rescue (paused: %s)', paused => {
  const { game, start } = fixture(5);
  start();
  expect(game.playAction('p0', 'release', undefined, undefined, undefined, ['p1'])).toBeUndefined();
  if (paused) expect(game.pause()).toBeUndefined();
  game.remove('p3');
  if (paused) {
    expect(game.publicState()).toMatchObject({ phase: 'search', paused: true });
    expect(game.resume(true)).toBeUndefined();
  }
  expect(game.publicState().phase).toBe('return');
});

it('keeps search running when the last active group is released after an earlier departure', () => {
  const { game, start } = fixture(5);
  start();
  const { deadline } = game.publicState();
  game.remove('p3');
  expect(game.playAction('p0', 'release', undefined, undefined, undefined, ['p1'])).toBeUndefined();
  expect(game.publicState()).toMatchObject({ phase: 'search', deadline });
});

it('keeps the mission window when all released players leave the room', () => {
  const { game, start, time } = fixture(5);
  start();
  const { deadline } = game.publicState();
  expect(game.playAction('p0', 'release', undefined, undefined, undefined, ['p1', 'p3'])).toBeUndefined();
  game.remove('p1');
  game.remove('p3');
  expect(game.publicState()).toMatchObject({ phase: 'search', deadline });
  expect(game.playAction('p2', 'mission', undefined, true)).toBeUndefined();
  time.advance(240000);
  expect(game.publicState().phase).toBe('return');
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

it('converts imported offerings and deals the local catalog without built-in offerings', () => {
  const catalog = createCatalog();
  const entries = catalog.snapshot(true).file.entries;
  const exorcist = entries.find(item => item.card.role === 'exorcist')!.card;
  expect(catalog.execute({ action: 'import', revision: 0, requestId: 'custom-offering-id', file: {
    format: 'pomekhi.cards', version: 1,
    entries: [{ enabled: true, card: { ...exorcist, id: 'E014', offering: true, harder: true, sets: ['outdoor'], requirements: ['twoZones'] } },
      { enabled: false, card: { ...exorcist, id: 'disabled', difficulty: 3, mission: 'Сходите к Обители.' } },
      ...entries],
  } }, true)).toBeUndefined();
  const imported = catalog.snapshot(true).file.entries;
  expect(imported.find(entry => entry.card.id === 'disabled')).toMatchObject({
    enabled: false, card: { difficulty: 3, title: 'Немой швейцар' },
  });
  const converted = imported.find(entry => entry.card.id === 'E014')?.card;
  expect(converted).toMatchObject({ harder: true, sets: ['outdoor'], requirements: ['twoZones'] });
  expect(converted).not.toHaveProperty('offering');
  const restored = createCatalog();
  restored.restore(catalog.exportState());
  const { game, ids } = fixture(5, restored.cards);
  const dealt = ids.map(id => game.personal(id)?.card);
  expect(dealt.every(card => card && !card.id.startsWith('dwelling:') && card.id !== 'E014')).toBe(true);
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
  expect(game.reviewPreview('mission-report', 'accept')).toMatchObject({ successes: 2, remainingSteps: 10, applied: true });
  expect(game.reviewPreview('mission-report', 'reject')).toMatchObject({ successes: 1, remainingSteps: 11, applied: true });
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
    const { id, title } = stories.at(-1)!;
    const story = { title, prologue: shortAnswer(id) };
    expect(initial.game.story).toEqual(story);
    expect(initial.game.venue).toMatchObject({
      storyId: id, mode: 'ordinary', bank: 'authored', harder: true, sets: ['indoor', 'contact', 'harder'], comedy: true,
    });
    expect(lobby.execute('host', 'room:create', {}).ok).toBe(true);
    const venue = { base: 'База', zones: ['Кухня'] };
    for (const [i, place] of ['Угол', 'У стены'].entries()) expect(lobby.execute('host', 'venue:configure', {
      roomId: initial.id, requestId: 'save-party-' + i, roundId: null, gameVersion: roomOf(lobby).game.version,
      venue: { ...venue, dwelling: { zone: 'Кухня', place }, storyId: 'S001', mode: 'first', bank: 'local', horror: true, features: ['mirror'] },
    }).ok).toBe(true);
    expect(roomOf(lobby).game.venue).toEqual({ ...venue,
      storyId: id, mode: 'ordinary', bank: 'authored', harder: true, sets: ['indoor', 'contact', 'harder'], comedy: true });
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
  expect(game.publicState().ritual).toMatchObject({ positions: [0, 9, 5, 0], cards: [{ revealed: true }, { revealed: false }, { revealed: false }] });
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
  expect(game.publicState().ritual).toMatchObject({ positions: [1, 8, 5, 0], cards: [{ revealed: true }, { revealed: false }, { revealed: false }] });
  expect(game.violations().at(-1)).toMatchObject({ status: 'applied' });
  expect(game.ritualAction('undoPenalty')).toBeUndefined();
  expect(game.violations().at(-1)).toMatchObject({ status: 'reversed' });
  expect(game.publicState().ritual?.positions.slice(0, 3)).toEqual([0, 9, 5]);
});


it('keeps confirmed total possession terminal if a personal success exhausts the last candle', () => {
  let sequence = 0;
  const ritual = newRitual(5, 7, () => 0, () => 'terminal-' + ++sequence, true, true);
  const row = (number: number, successes: number): RoundResult => ({
    roundId: 'ordinary-' + number, number, kind: 'regular', difficulty: 1, infectionEnabled: true, status: 'final',
    rescuedGroups: successes, totalGroups: successes, missions: 0, totalMissions: 0, infectedPlayers: 0, activeMs: 1000,
  });
  for (let n = 1; n <= 6; n++) expect(ritual.commit(row(n, 4))).toBeUndefined();
  expect(ritual.commit(row(7, 1))).toBeUndefined();
  expect(ritual.snapshot().outcome).toBe('won');
  ritual.stop('all_possessed');
  expect(ritual.snapshot().outcome).toBe('all_possessed');
  expect(() => validateRitual(ritual.exportState())).not.toThrow();
});

it.each<{ sets: string[]; comedy?: boolean; twoZones?: boolean }>([
  { sets: [], comedy: undefined },
  { sets: ['contact'], comedy: false },
  { sets: ['indoor', 'harder'], comedy: true },
  { sets: ['indoor', 'harder'], twoZones: true },
])('draws eligible missions for $sets, comedy $comedy and two locations $twoZones', ({ sets, comedy, twoZones }) => {
  const time = controlledClock();
  let sequence = 0;
  const make = () => createGame({ firstGame: true, generateId: () => 'authored-' + ++sequence, randomIndex: () => 0, clock: time.clock, onChange() {} });
  const game = make();
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4'];
  const zones = twoZones ? ['Кухня', 'Коридор'] : ['Кухня'];
  expect(game.configureVenue({ base: 'База', zones,
    sets, comedy, features: ['space', 'mirror'] })).toBeUndefined();
  const seen = new Map<string, PersonalCard>();
  // Canceled previews still consume cards. Walk through the pool via normal deals.
  for (let attempt = 0; attempt < 55; attempt++) {
    expect(game.deal(ids, 0, false)).toBeUndefined();
    for (const id of ids) {
      const card = game.personal(id)!.card;
      expect(seen.get(card.id) ?? card).toEqual(card);
      seen.set(card.id, card);
    }
    if (attempt < 54) expect(game.cancelDeal()).toBeUndefined();
  }
  const extra = [...seen.values()].filter(card => /^C[PE]/.test(card.id));
  expect(extra.filter(card => card.role === 'possessed')).toHaveLength(comedy !== false ? 24 : 0);
  expect(extra.filter(card => card.role === 'exorcist')).toHaveLength(comedy !== false ? 16 : 0);
  expect(seen.get('P001')).toMatchObject({ title: 'Колыбельная пустой комнаты', behavior: shortAnswer('P001'), brief: true });
  expect(seen.get('P007')?.title).toBe(sets.includes('harder') ? 'Запись из соседней жизни' : undefined);
  expect(seen.has('P003')).toBe(sets.includes('contact'));
  expect(seen.has('E040')).toBe(Boolean(twoZones));
  expect(seen.has('E038')).toBe(false);
  expect(seen.has('P030')).toBe(false);
  expect(seen.has('P026')).toBe(false);
  const restored = make();
  const saved = game.exportState();
  saved.venue!.features = ['space', 'mirror'];
  restored.restore(saved);
  expect(restored.publicState().venue).toMatchObject({ bank: 'authored', mode: 'ordinary' });
  expect(restored.publicState().venue).not.toHaveProperty('features');
  expect(restored.publicState().venue.comedy).toBe(comedy === false ? undefined : true);
  expect(ids.map(id => restored.personal(id))).toEqual(ids.map(id => game.personal(id)));
  expect(restored.start(ids.map(id => ({ id, online: true })), true)).toBeUndefined();
  expect(restored.exportState().ritual?.cards.map(card => card.id)).toEqual(['R001', 'R002', 'R011']);
});

it('keeps an issued historical card while removing the old horror setting from recovery', () => {
  const { game, make, ids } = fixture(5);
  const saved = game.exportState();
  const [playerId, assignment] = saved.dealing.assignments.find(([, item]) => item.card.role === 'possessed')!;
  assignment.card.title = 'Колыбельная снизу';
  saved.venue = { ...saved.venue!, horror: true, harder: true, sets: ['harder'] };

  const restored = make();
  restored.restore(saved);
  expect(restored.publicState().venue).not.toHaveProperty('horror');
  expect(restored.personal(playerId)).toEqual(assignment);
  expect(restored.cancelDeal()).toBeUndefined();
  const seen = new Map<string, string>();
  for (let attempt = 0; attempt < 55; attempt++) {
    expect(restored.deal(ids, 0, false)).toBeUndefined();
    for (const id of ids) {
      const { card } = restored.personal(id)!;
      seen.set(card.id, card.title);
    }
    expect(restored.cancelDeal()).toBeUndefined();
  }
  expect(seen.get('P007')).toBe('Запись из соседней жизни');
  expect([...seen.values()]).not.toContain('Колыбельная снизу');
});

it('applies saved timer durations and redraws roles within the balanced roster', () => {
  const time = controlledClock();
  let serial = 0;
  const game = createGame({ firstGame: true, generateId: () => `timer-${++serial}`,
    randomIndex: limit => limit - 1, clock: time.clock, onChange() {} });
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4'];
  expect(game.configureVenue({ base: 'База', zones: ['Кухня'] })).toBeUndefined();
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

it('starts a new party in the same room without revoking participants or redrawing on retry', () => {
  const lobby = createLobby({ organizerCode: 'ORGANIZER', firstGame: true, generateRoomCode: () => 'ROOM22', randomIndex: () => 0 });
  try {
    expect(lobby.execute('host', 'organizer:authorize', { code: 'ORGANIZER' }).ok).toBe(true);
    expect(lobby.execute('host', 'room:create', {}).ok).toBe(true);
    const before = lobby.exportState().room!;
    const resumeKey = 'f'.repeat(64);
    expect(lobby.execute('phone', 'player:join', { name: 'Медиум', roomCode: before.code, resumeKey }).ok).toBe(true);
    const player = lobby.viewFor('phone');
    const command = { roomId: before.id, roundId: null, gameVersion: before.game.version, requestId: 'restart-first' };
    expect(lobby.execute('phone', 'room:restart', command)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(lobby.execute('host', 'room:restart', command).ok).toBe(true);
    const after = lobby.exportState().room!;
    expect(after).toMatchObject({ id: before.id, code: before.code, partyId: expect.any(String),
      game: { phase: 'lobby', settings: before.game.settings, version: before.game.version + 1,
        dealing: { version: before.game.dealing.version + 1 } } });
    expect(after.game.venue?.storyId).not.toBe(before.game.venue?.storyId);
    expect(lobby.viewFor('phone')).toMatchObject({ kind: 'player', room: { id: before.id, partyId: after.partyId }, assignment: null, play: null });
    expect(lobby.execute('host', 'room:restart', command).ok).toBe(true);
    expect(lobby.exportState().room).toEqual(after);
    expect(lobby.execute('host', 'room:restart', { ...command, requestId: 'restart-stale' })).toEqual({ ok: false, error: 'STALE_GAME' });
    const resumed = lobby.execute('other-tab', 'player:resume', { roomCode: before.code, resumeKey });
    expect(resumed).toMatchObject({ ok: true, view: { kind: 'player', playerId: player?.kind === 'player' ? player.playerId : undefined } });
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
