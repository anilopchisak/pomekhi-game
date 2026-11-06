import { expect, it } from 'vitest';
import { createSession } from './session.js';
import type { SessionStore } from './session-store.js';
import type { SavedSession } from './session-format.js';
import { validateSession } from './session-format.js';
import type { LobbyReply, LobbyCommand, LobbyInputs } from '../shared/protocol.js';
import { controlledClock } from '../../tests/helpers/game-clock.js';
import { stories } from './first-game-content.js';
import { authoredProphecies } from './authored-content.js';
import { createRitual } from './ritual.js';
import { createFileSessionStore } from './session-store.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function memoryDisk() {
  let state: SavedSession | null = null, failure = false, afterWrite = false, corrupt = false, gate: Promise<void> | undefined;
  let writes = 0, preserved = 0;
  const store: SessionStore = {
    async acquire() {}, async close() {}, async preserve() { preserved++; },
    async load() { if (corrupt) throw new Error('private-disk-details'); return structuredClone(state); },
    async write(next) { if (gate) await gate; if (failure) throw new Error('private-disk-details'); state = structuredClone(validateSession(next)); writes++; if (afterWrite) throw new Error('after-rename'); },
  };
  return { store, read: () => structuredClone(state!), writes: () => writes, preserved: () => preserved,
    fail: (value = true) => { failure = value; }, after: (value = true) => { afterWrite = value; }, corrupt: (value = true) => { corrupt = value; }, gate: (value?: Promise<void>) => { gate = value; } };
}
function value(reply: LobbyReply) { if (!reply.ok) throw new Error(reply.error); return reply.view; }
const code = 'ABCDEFGHJKLM', key = (n: number) => n.toString(16).padStart(64, '0');
async function fixture(tutorialEnabled = false, firstGame = false) {
  const disk = memoryDisk(), time = controlledClock();
  let session = createSession({ organizerCode: code, store: disk.store, clock: time.clock, firstGame,
    ...(firstGame ? { randomIndex: () => 0 } : {}) });
  let sequence = 0;
  const room = (who = 'host') => { const v = session.viewFor(who); if (!v || v.kind === 'ended' || !v.room) throw new Error('No room'); return v.room; };
  const send = <C extends LobbyCommand>(who: string, command: C, input: LobbyInputs[C]) => session.execute(who, command, input);
  const gameCommand = () => ({ roomId: room().id, gameVersion: room().game.version, roundId: room().game.roundId, requestId: `request-${++sequence}` });
  const dealCommand = () => ({ roomId: room().id, dealVersion: room().dealing.version, dealId: room().dealing.dealId, requestId: `request-${++sequence}` });
  const playCommand = (id: string) => { const v = session.viewFor(id); if (v?.kind !== 'player') throw new Error('No player'); return { ...gameCommand(), playVersion: v.play!.version }; };
  await session.initialize(); value(await send('host', 'organizer:authorize', { code })); value(await send('host', 'room:create', {}));
  for (let n = 1; n <= 7; n++) value(await send(`p${n}`, 'player:join', { roomCode: room().code, name: `Игрок ${n}`, resumeKey: key(n) }));
  if (firstGame) value(await send('host', 'venue:configure', { ...gameCommand(), venue: {
    base: 'База', zones: ['Кухня'],
  } }));
  const settings = { ...room().game.settings, ...(firstGame ? { placementSeconds: 1, offlineWaitSeconds: 2 } :
    { ritualEnabled: false, roundLimit: 5, infectionMode: 'auto' as const, tutorialEnabled }) };
  value(await send('host', 'game:configure', { ...gameCommand(), settings }));
  const phones = Array.from({ length: 7 }, (_, i) => `p${i + 1}`);
  async function restart() {
    const roomCode = room().code;
    await session.close();
    session = createSession({ organizerCode: 'NEWCODEABCDE', store: disk.store, clock: time.clock });
    await session.initialize();
    expect(await send('host', 'organizer:authorize', { code })).toEqual({ ok: false, error: 'INVALID_ORGANIZER_CODE' });
    value(await send('host', 'organizer:authorize', { code: 'NEWCODEABCDE' }));
    for (let n = 1; n <= 7; n++) value(await send(`p${n}`, 'player:resume', { roomCode, resumeKey: key(n) }));
  }
  async function settle() {
    const state = room().game;
    if (state.synchronization) for (const phone of phones) value(await send(phone, 'play:complete', { roomId: room().id, roundId: state.roundId!, syncRevision: state.synchronization.revision }));
  }
  const deal = async () => { await settle(); return value(await send('host', 'deal:create', { ...dealCommand(), possessedCount: 3 })); };
  const start = async () => value(await send('host', 'round:start', { ...gameCommand(), confirmWarnings: true }));
  const advance = async (ms: number) => { while (ms > 0) { const step = Math.min(ms, 1000); time.advance(step); value(await send('host', 'lobby:sync', {})); ms -= step; } };
  return { disk, time, room, send, gameCommand, dealCommand, playCommand, phones, deal, settle, start, advance, restart, view: (id: string) => session.viewFor(id),
    disconnect: (id: string) => session.disconnect(id), close: () => session.close() };
}

it('restores full cards, readiness, pending requests and journal retries without using the bank', async () => {
  const f = await fixture();
  try {
    await f.deal(); const v = f.view('p1'); if (v?.kind !== 'player') throw new Error('No player');
    value(await f.send('p1', 'card:ready', { ...f.dealCommand(), assignmentId: v.assignment!.id, ready: true }));
    const p2 = f.view('p2'); if (p2?.kind !== 'player') throw new Error('No player');
    const request = { ...f.dealCommand(), assignmentId: p2.assignment!.id, requested: true };
    value(await f.send('p2', 'card:request', request));
    const before = f.room(), cards = f.phones.map(id => f.view(id));
    await f.restart();
    expect(f.room().game.phase).toBe('reading'); expect(f.room().dealing.version).toBeGreaterThan(before.dealing.version);
    for (let i = 0; i < 7; i++) { const v = f.view(f.phones[i]), old = cards[i]; if (v?.kind === 'player' && old?.kind === 'player') expect(v.assignment).toEqual(old.assignment); else throw new Error('Missing restored identity'); }
    expect(await f.send('p2', 'card:request', request)).toMatchObject({ ok: true });
    expect(await f.send('p2', 'card:request', { ...request, requestId: 'unreceived-old-request' })).toEqual({ ok: false, error: 'STALE_DEAL' });
    expect(JSON.stringify(f.view('host'))).not.toContain('releaseCondition');
    expect(JSON.stringify(f.disk.read())).not.toContain(code);
    expect(f.view('host')).toMatchObject({ audioEnabled: false, persistence: { state: 'ready', recovered: true } });
  } finally { await f.close(); }
});

it.each(['placement', 'search', 'return'] as const)('restores %s paused with its healthy checkpoint and accumulated active time', async phase => {
  const f = await fixture();
  try {
    await f.deal(); await f.start();
    if (phase !== 'placement') await f.advance(45000);
    if (phase === 'return') value(await f.send('host', 'round:return', f.gameCommand()));
    await f.advance(1000);
    const before = f.disk.read().lobby.room!.game;
    await f.restart(); f.time.jump(600000);
    const restored = f.room().game;
    expect(restored).toMatchObject({ phase, paused: true, pauseReason: 'server_restarted', remainingMs: before.remainingMs, deadline: null, roundId: before.roundId });
    expect(f.disk.read().lobby.room!.game.activeMs).toBe(before.activeMs);
    value(await f.send('host', 'round:resume', { ...f.gameCommand(), confirmWarnings: true }));
    await f.advance(1000); expect(f.room().game.remainingMs).toBe(before.remainingMs! - 1000);
  } finally { await f.close(); }
});

it('preserves capture chains, mission disqualification and causal undo across a restart', async () => {
  const f = await fixture();
  try {
    await f.deal(); value(await f.send('host', 'game:configure', { ...f.gameCommand(), settings: { ...f.room().game.settings, infectionMode: 'on' } }));
    await f.start(); await f.advance(45000);
    const roles = f.phones.map(id => ({ id, v: f.view(id) })).filter(x => x.v?.kind === 'player');
    const roots = roles.filter(x => x.v?.kind === 'player' && x.v.assignment?.card.role === 'possessed').map(x => x.id);
    const exorcists = roles.filter(x => x.v?.kind === 'player' && x.v.assignment?.card.role === 'exorcist').map(x => x.id);
    const targetId = (who: string) => { const v = f.view(who); if (v?.kind !== 'player') throw new Error('No player'); return v.playerId; };
    value(await f.send(exorcists[0], 'play:mission', { ...f.playCommand(exorcists[0]), completed: true }));
    const infection = { ...f.playCommand(roots[0]), targetId: targetId(exorcists[0]) };
    value(await f.send(roots[0], 'play:infect', infection));
    value(await f.send(exorcists[0], 'play:infect', { ...f.playCommand(exorcists[0]), targetId: targetId(exorcists[1]) }));
    const damaged = f.disk.read(); damaged.lobby.room!.game.search!.events[0].touches = [];
    expect(() => validateSession(damaged)).toThrow();
    const before = f.view(exorcists[0]); await f.restart();
    expect(f.view(exorcists[0])).toMatchObject({ play: { status: 'captured', missionCompleted: true, missionEligible: false } });
    const after = f.view(exorcists[0]); if (before?.kind === 'player' && after?.kind === 'player') expect(after.play!.card).toEqual(before.play!.card);
    expect(await f.send(roots[0], 'play:infect', infection)).toMatchObject({ ok: true });
    const root = f.view(roots[0]); if (root?.kind !== 'player') throw new Error('No player');
    expect(await f.send(roots[0], 'play:undo', { ...f.playCommand(roots[0]), actionId: root.play!.undo!.id })).toEqual({ ok: false, error: 'UNDO_DEPENDENCY' });
  } finally { await f.close(); }
});

it('keeps provisional/final results, role history, mission changes and break/finished phases', async () => {
  const f = await fixture();
  try {
    await f.deal(); await f.start(); await f.advance(45000);
    value(await f.send('host', 'round:return', f.gameCommand())); await f.advance(45000);
    expect(f.room().game.phase).toBe('between_rounds'); const result = f.room().game.results;
    await f.restart(); expect(f.room().game.results).toEqual(result); expect(f.room().game.paused).toBe(false);
    await f.settle(); value(await f.send('host', 'party:finish', f.gameCommand()));
    const final = f.room().game.results; expect(final[0].status).toBe('final');
    await f.restart(); expect(f.room().game).toMatchObject({ phase: 'finished', results: final });
    expect(f.disk.read().lobby.room!.game.history.some(([, count]) => count === 1)).toBe(true);
  } finally { await f.close(); }
});

it('saves before publishing/acknowledging and serializes concurrent actions', async () => {
  const f = await fixture();
  try {
    let release!: () => void; f.disk.gate(new Promise(resolve => { release = resolve; }));
    let resolved = false;
    const request = f.send('host', 'deal:create', { ...f.dealCommand(), possessedCount: 3 }).then(r => { resolved = true; return r; });
    const second = f.send('host', 'lobby:sync', {});
    await new Promise<void>(resolve => setTimeout(resolve, 0)); expect(resolved).toBe(false);
    expect(f.disk.read().lobby.room!.game.phase).toBe('lobby');
    expect(f.room().game.phase).toBe('lobby');
    release(); value(await request); expect(value(await second)).toMatchObject({ room: { game: { phase: 'reading' } } });
    expect(f.disk.read().lobby.room!.game.phase).toBe('reading');
  } finally { f.disk.gate(); await f.close(); }
});

it('rolls back a failed mutation, freezes timers, preserves keys and allows authorized retry', async () => {
  const f = await fixture();
  try {
    await f.deal(); await f.start(); await f.advance(1000);
    const checkpoint = f.disk.read(); f.disk.fail();
    expect(await f.send('host', 'round:abort', f.gameCommand())).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    expect(f.room().game).toMatchObject({ phase: 'placement', paused: true, pauseReason: 'storage_error', remainingMs: checkpoint.lobby.room!.game.remainingMs });
    expect(f.time.pending()).toBe(0); expect(f.view('p1')).toMatchObject({ kind: 'player', persistence: { state: 'write_error' } });
    expect(await f.send('p1', 'storage:retry', {})).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await f.send('host', 'round:resume', { ...f.gameCommand(), confirmWarnings: true })).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    f.disk.fail(false); value(await f.send('host', 'storage:retry', {}));
    expect(f.room().game).toMatchObject({ phase: 'placement', paused: true, pauseReason: 'server_restarted' });
    value(await f.send('host', 'round:resume', { ...f.gameCommand(), confirmWarnings: true }));
  } finally { f.disk.fail(false); await f.close(); }
});

it('recognizes a commit even when the write reports an error after rename', async () => {
  const f = await fixture();
  try {
    const intent = { ...f.dealCommand(), possessedCount: 3 }; f.disk.after();
    expect(await f.send('host', 'deal:create', intent)).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    f.disk.after(false); value(await f.send('host', 'storage:retry', {}));
    const deal = f.room().dealing.dealId;
    value(await f.send('host', 'deal:create', intent)); expect(f.room().dealing.dealId).toBe(deal);
  } finally { f.disk.after(false); await f.close(); }
});

it('retains a damaged file, denies game mutations and requires an explicit authorized reset', async () => {
  const disk = memoryDisk(); disk.corrupt();
  const session = createSession({ organizerCode: code, store: disk.store });
  try {
    await session.initialize(); expect(disk.writes()).toBe(0);
    expect(await session.execute('x', 'storage:reset', { confirm: true })).toEqual({ ok: false, error: 'FORBIDDEN' });
    value(await session.execute('h', 'organizer:authorize', { code }));
    expect(session.viewFor('h')).toMatchObject({ persistence: { state: 'load_error' }, room: null });
    expect(await session.execute('h', 'room:create', {})).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    expect(await session.execute('h', 'storage:reset', {})).toEqual({ ok: false, error: 'INVALID_INPUT' });
    value(await session.execute('h', 'storage:reset', { confirm: true }));
    expect(disk.preserved()).toBe(1); expect(disk.read().lobby.room).toBeNull();
  } finally { await session.close(); }
});

it('persists revocation and room closure instead of resurrecting a closed game', async () => {
  const f = await fixture();
  try {
    const code = f.room().code, id = f.room().players[0].id;
    value(await f.send('host', 'player:remove', { roomId: f.room().id, playerId: id }));
    expect(f.disk.read().lobby.room!.revoked).toContain(key(1));
    value(await f.send('host', 'room:close', { roomId: f.room().id }));
    expect(f.disk.read().lobby.room).toBeNull();
    const restored = createSession({ organizerCode: 'OTHER', store: f.disk.store });
    await f.close(); await restored.initialize();
    try { expect(await restored.execute('p1', 'player:resume', { roomCode: code, resumeKey: key(1) })).toEqual({ ok: false, error: 'SESSION_EXPIRED' }); }
    finally { await restored.close(); }
  } finally { await f.close(); }
});

it('cycles every authored deck across new parties and preserves its progress on disk', async () => {
  const disk = memoryDisk(), time = controlledClock();
  const make = () => createSession({ organizerCode: code, store: disk.store, clock: time.clock, firstGame: true, randomIndex: () => 0 });
  let session = make(), sequence = 0;
  const room = () => {
    const view = session.viewFor('host');
    if (view?.kind !== 'organizer' || !view.room) throw new Error('Missing room');
    expect(view).not.toHaveProperty('deckHistory');
    return view.room;
  };
  const authorize = async () => {
    await session.initialize();
    value(await session.execute('host', 'organizer:authorize', { code }));
  };
  const gameCommand = () => ({ roomId: room().id, gameVersion: room().game.version, roundId: room().game.roundId, requestId: `deck-test-${++sequence}` });
  const venue = { base: 'База', zones: ['Кухня', 'Зал'],
    harder: true };
  const storyIds: string[] = [], prophecyIds: string[] = [], missionIds: string[] = [];
  try {
    await authorize();
    for (let party = 0; party <= stories.length; party++) {
      value(await session.execute('host', party === 0 || party === 3 ? 'room:create' : 'room:restart',
        party === 0 || party === 3 ? {} : { roomId: room().id }));
      storyIds.push(room().game.venue.storyId!);
      for (let n = 1; n <= 5; n++) value(await session.execute(`p${n}`, 'player:join', {
        roomCode: room().code, name: `Игрок ${n}`, resumeKey: key(n),
      }));
      value(await session.execute('host', 'venue:configure', { ...gameCommand(), venue }));
      value(await session.execute('host', 'deal:create', {
        ...gameCommand(), dealId: null, dealVersion: room().dealing.version, possessedCount: 0,
      }));
      value(await session.execute('host', 'round:start', { ...gameCommand(), confirmWarnings: true }));
      const game = disk.read().lobby.room!.game;
      if (party < 2) {
        missionIds.push(...game.dealing.assignments.map(([, assignment]) => assignment.card.id));
      }
      prophecyIds.push(...game.ritual!.cards.slice(0, 2).map(card => card.id));
      if (party === 0 || party === 2) {
        if (party === 2) value(await session.execute('host', 'room:close', { roomId: room().id }));
        await session.close();
        if (party === 0) {
          const legacy = disk.read();
          delete legacy.lobby.deckHistory;
          await disk.store.write(legacy);
        }
        session = make();
        await authorize();
        if (party === 0) expect(room().game.venue.storyId).toBe(storyIds[0]);
      }
    }
    expect(new Set(storyIds.slice(0, stories.length))).toEqual(new Set(stories.map(card => card.id)));
    expect(storyIds[stories.length]).not.toBe(storyIds[stories.length - 1]);
    const prophecies = authoredProphecies.filter(card => !card.final).map(card => card.id);
    expect(new Set(prophecyIds.slice(0, prophecies.length))).toEqual(new Set(prophecies));
    expect(new Set(missionIds).size).toBe(missionIds.length);
  } finally { await session.close(); }
});

it('replaces issued Dwelling cards on disk without changing mission receipts or replaying credit', async () => {
  const f = await fixture(false, true);
  const directory = await mkdtemp(join(tmpdir(), 'pomekhi-retired-missions-'));
  const file = join(directory, 'party-v8.json');
  const restored = createSession({ organizerCode: code, store: createFileSessionStore(directory, true), clock: f.time.clock, firstGame: true });
  try {
    await f.deal(); await f.start(); await f.advance(1000);
    const completed = f.view('p1'), pending = f.view('p3');
    if (completed?.kind !== 'player' || pending?.kind !== 'player') throw Error('Missing exorcists');
    value(await f.send('p1', 'play:mission', { ...f.playCommand('p1'), completed: true }));
    value(await f.send('host', 'round:return', f.gameCommand()));
    value(await f.send('host', 'round:return', f.gameCommand()));
    const roundId = f.room().game.roundId!;
    const upload = { roomId: f.room().id, roundId, events: [{
      id: 'legacy-mission-01', roundId, clientId: 'legacy-phone-01', sequence: 1, previousId: null,
      action: { kind: 'mission' as const, completed: true }, phase: 'search' as const, paused: false, estimatedServerTime: null,
    }] };
    value(await f.send('p3', 'play:sync', upload));
    const state = f.disk.read(), game = state.lobby.room!.game;
    expect(game.results.at(-1)?.missions).toBe(1);
    expect(game.roundSync!.entries.find(entry => entry.event.id === upload.events[0].id)?.receipt.status).toBe('review');
    game.venue!.dwelling = { zone: 'Кухня', place: 'Угол' };
    for (const [playerId, assignment] of [...game.dealing.assignments, ...game.search!.roster, ...game.roundSync!.base.roster]) {
      if (playerId === completed.playerId || playerId === pending.playerId) {
        assignment.card = { id: playerId === completed.playerId ? 'E001' : 'dwelling:E014',
          title: 'У Обители', difficulty: 1, role: 'exorcist', mission: 'Дойдите до Обители.' };
        Reflect.set(assignment.card, 'offering', true);
      }
    }
    await writeFile(file, JSON.stringify(state));

    await restored.initialize();
    value(await restored.execute('host', 'organizer:authorize', { code }));
    for (const index of [1, 3]) value(await restored.execute(`p${index}`, 'player:resume', { roomCode: f.room().code, resumeKey: key(index) }));
    expect(restored.viewFor('p1')).toMatchObject({
      assignment: { id: completed.assignment!.id, card: { id: 'E001', mission: expect.stringContaining('Я здесь живу') } },
      play: { missionCompleted: true },
    });
    expect(restored.viewFor('p3')).toMatchObject({
      assignment: { id: pending.assignment!.id, card: { title: 'Немой швейцар' } },
      play: { card: { title: 'Немой швейцар' }, missionCompleted: false },
    });
    const host = () => {
      const view = restored.viewFor('host');
      if (view?.kind !== 'organizer' || !view.room) throw Error('Missing restored room');
      return view.room;
    };
    expect(host().game.venue).not.toHaveProperty('dwelling');
    const onDisk = JSON.parse(await readFile(file, 'utf8')) as SavedSession;
    expect(JSON.stringify(onDisk.lobby.room!.game)).not.toMatch(/Обител[ьи]|"offering"/i);
    expect(onDisk.lobby.room!.game.roundSync!.entries).toEqual(game.roundSync!.entries);
    value(await restored.execute('p3', 'play:sync', upload));
    expect(host().game.results.at(-1)?.missions).toBe(1);
    value(await restored.execute('host', 'sync:resolve', {
      roomId: host().id, gameVersion: host().game.version, roundId, requestId: 'legacy-mission-accept',
      eventId: upload.events[0].id, decision: 'accept',
    }));
    value(await restored.execute('p3', 'play:sync', upload));
    expect(host().game.results.at(-1)?.missions).toBe(2);
  } finally {
    await restored.close(); await f.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(['provisional', 'final'] as const)('migrates a v7 %s round without exposing its retired report', async status => {
  const f = await fixture(false, true);
  const directory = await mkdtemp(join(tmpdir(), 'pomekhi-v7-'));
  const previous = join(directory, 'party-v7.json'), current = join(directory, 'party-v8.json');
  const make = () => createSession({ organizerCode: code, store: createFileSessionStore(directory, true), clock: f.time.clock, firstGame: true });
  let restored = make();
  try {
    await f.deal(); await f.start(); await f.advance(1000);
    const players = f.phones.map(connection => {
      const view = f.view(connection);
      if (view?.kind !== 'player') throw Error('Missing player');
      return { connection, id: view.playerId, role: view.play?.status };
    });
    const exorcists = players.filter(row => row.role === 'exorcist');
    const possessed = players.filter(row => row.role === 'possessed');
    for (const { connection } of exorcists) value(await f.send(connection, 'play:mission', { ...f.playCommand(connection), completed: true }));
    const actor = exorcists[0].connection;
    value(await f.send(actor, 'play:release', { ...f.playCommand(actor), targetIds: possessed.map(row => row.id) }));
    value(await f.send('host', 'round:return', f.gameCommand()));
    await f.settle();
    if (status === 'final') value(await f.send('host', 'results:finalize', f.gameCommand()));
    const { lobby } = f.disk.read();
    const savedRoom = lobby.room!, game = savedRoom.game, round = game.results.at(-1)!;
    expect(round).toMatchObject({ status, rescuedGroups: 3, missions: 4 });
    Reflect.set(game.firstGame!, 'trials', { current: { lateVisit: 'review' } });
    Reflect.set(lobby.deckHistory!, 'trials', ['T004']);
    Reflect.set(round, 'trialBonus', 1);
    const ritual = game.ritual!;
    if (status === 'final') {
      const last = ritual.events.at(-1);
      if (last?.kind !== 'round') throw Error('Missing committed round');
      last.successes++;
    }
    const expected = createRitual(ritual, () => 'unused').snapshot();
    if (status === 'final') expect(expected.cards[0].revealed).toBe(true);
    const source = JSON.stringify({ schemaVersion: 7, lobby });
    await writeFile(previous, source);

    await restored.initialize();
    value(await restored.execute('host', 'organizer:authorize', { code }));
    const host = () => {
      const view = restored.viewFor('host');
      if (view?.kind !== 'organizer' || !view.room) throw Error('Missing restored room');
      expect(view).not.toHaveProperty('trialReview');
      return view.room;
    };
    expect(host().game).toMatchObject({ phase: 'between_rounds', ritual: {
      positions: expected.positions, cards: expected.cards, outcome: expected.outcome,
      preview: status === 'provisional' ? { successes: 7 } : null,
    } });
    expect(host().game.results.at(-1)).not.toHaveProperty('trialBonus');
    const upgraded = JSON.parse(await readFile(current, 'utf8'));
    expect(upgraded.schemaVersion).toBe(8);
    expect(upgraded.lobby.room.game.firstGame).not.toHaveProperty('trials');
    expect(upgraded.lobby.deckHistory).not.toHaveProperty('trials');
    expect(await readFile(previous, 'utf8')).toBe(source);
    if (status === 'provisional') {
      for (const [index, player] of players.entries()) value(await restored.execute(player.connection, 'player:resume', { roomCode: savedRoom.code, resumeKey: key(index + 1) }));
      const room = host();
      value(await restored.execute('host', 'results:finalize', { roomId: room.id, gameVersion: room.game.version, roundId: room.game.roundId, requestId: 'migrated-finalize' }));
      expect(host().game.ritual?.cards[0].revealed).toBe(false);
      expect(host().game.ritual?.positions[0]).toBe(1);
    } else {
      expect(upgraded.lobby.room.game.ritual.legacyCredits).toEqual([round.roundId]);
    }
    const board = host().game.ritual;
    await restored.close();
    restored = make();
    await restored.initialize();
    value(await restored.execute('host', 'organizer:authorize', { code }));
    expect(host().game.ritual).toEqual(board);
  } finally { await restored.close(); await f.close(); await rm(directory, { recursive: true, force: true }); }
});

it('recovers an already paused phase and an aborted attempt without crediting another round', async () => {
  const f = await fixture();
  try {
    await f.deal(); await f.start(); await f.advance(1000);
    value(await f.send('host', 'round:pause', f.gameCommand())); const remaining = f.room().game.remainingMs;
    await f.restart(); expect(f.room().game).toMatchObject({ paused: true, remainingMs: remaining, completedRounds: 0 });
    value(await f.send('host', 'round:abort', f.gameCommand()));
    await f.restart(); expect(f.room().game).toMatchObject({ phase: 'between_rounds', lastRoundAborted: true, completedRounds: 0, results: [{ status: 'aborted' }] });
    await f.deal(); value(await f.send('host', 'deal:cancel', f.dealCommand()));
    expect(f.room().game.phase).toBe('between_rounds');
  } finally { await f.close(); }
});

it('freezes a failed timer checkpoint at the previous durable remainder without skipping phases', async () => {
  const f = await fixture();
  try {
    await f.deal(); await f.start(); await f.advance(1000); const before = f.disk.read().lobby.room!.game;
    f.disk.fail(); f.time.advance(1000); value(await f.send('host', 'lobby:sync', {}));
    expect(f.room().game).toMatchObject({ phase: before.phase, remainingMs: before.remainingMs, paused: true, pauseReason: 'storage_error' });
    expect(f.disk.read().lobby.room!.game.activeMs).toBe(before.activeMs);
    f.disk.fail(false); value(await f.send('host', 'storage:retry', {})); expect(f.time.pending()).toBe(0);
  } finally { f.disk.fail(false); await f.close(); }
});

it('keeps recall in the last committed phase during recovery-only connection changes', async () => {
  const f = await fixture(false, true);
  try {
    await f.deal(); await f.start(); await f.advance(1000);
    const exorcists = f.phones.filter(id => {
      const view = f.view(id);
      return view?.kind === 'player' && view.play?.status === 'exorcist';
    });
    expect(exorcists).toHaveLength(4);
    for (const id of exorcists) await f.disconnect(id);
    value(await f.send('host', 'round:return', f.gameCommand()));
    expect(f.room().game.phase).toBe('return');
    const checkpoint = f.disk.read();
    f.disk.fail();
    expect(await f.send('host', 'round:return', f.gameCommand())).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    f.time.advance(3000);

    value(await f.send('second-host', 'organizer:authorize', { code }));
    expect(f.view('second-host')).toMatchObject({ persistence: { state: 'write_error' }, room: { game: { phase: 'return', results: [] } } });
    const phone = exorcists[0];
    const resumed = value(await f.send(phone, 'player:resume', { roomCode: f.room().code, resumeKey: key(Number(phone.slice(1))) }));
    expect(resumed).toMatchObject({ presence: { expected: 'at_base', confirmed: false } });
    await f.disconnect(phone);
    expect(f.room().game).toMatchObject({ phase: 'return', results: [] });
    expect(f.disk.read()).toEqual(checkpoint);

    f.disk.fail(false);
    value(await f.send('host', 'storage:retry', {}));
    await f.advance(2000);
    expect(f.room().game).toMatchObject({ phase: 'finished', ritual: { outcome: 'no_return' } });
    expect(f.disk.read().lobby.room?.game.results).toMatchObject([{ status: 'final', lossReason: 'no_return' }]);
  } finally { f.disk.fail(false); await f.close(); }
});

it('does not announce an unsaved reset or clear player identities when its write fails', async () => {
  const f = await fixture();
  try {
    await f.deal(); f.disk.fail();
    expect(await f.send('host', 'deal:shuffle', { ...f.dealCommand(), possessedCount: 3 })).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    expect(await f.send('host', 'storage:reset', { confirm: true })).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    expect(f.view('p1')).toMatchObject({ kind: 'player' }); expect(f.disk.read().lobby.room!.players).toHaveLength(7);
    f.disk.fail(false); value(await f.send('host', 'storage:retry', {})); expect(f.room().players).toHaveLength(7);
  } finally { f.disk.fail(false); await f.close(); }
});

it('recovers tutorial and normal progression through the durable boundary without counting training', async () => {
  const f = await fixture(true);
  try {
    value(await f.send('host', 'game:configure', { ...f.gameCommand(), settings: { ...f.room().game.settings,
      roundLimit: 2, placementSeconds: 1, searchSeconds: 1, returnSeconds: 1, infectionMode: 'on' } }));
    await f.deal(); const tutorial = f.room().game.roundPlan;
    await f.restart(); expect(f.room().game.roundPlan).toEqual(tutorial);
    await f.start(); await f.advance(1000);
    await f.restart(); expect(f.room().game).toMatchObject({ paused: true, roundPlan: tutorial, tutorialCompleted: false });
    value(await f.send('host', 'round:resume', { ...f.gameCommand(), confirmWarnings: true }));
    await f.advance(2000); expect(f.room().game).toMatchObject({ tutorialCompleted: true, completedRounds: 0 });
    expect(f.disk.read().lobby.room!.game.history).toEqual([]);
    await f.restart(); await f.deal(); expect(f.room().game.roundPlan).toMatchObject({ kind: 'regular', number: 1, difficulty: 1, infectionEnabled: true });
    await f.start(); await f.advance(3000); await f.deal();
    expect(f.room().game.roundPlan).toMatchObject({ kind: 'regular', number: 2, difficulty: 3 });
    const cards = f.phones.map(id => f.view(id)); await f.restart();
    for (const [index, id] of f.phones.entries()) {
      const before = cards[index], after = f.view(id);
      if (before?.kind !== 'player' || after?.kind !== 'player') throw new Error('Missing phone');
      expect(after.assignment).toEqual(before.assignment);
    }
    await f.start(); await f.advance(3000);
    expect(f.room().game).toMatchObject({ phase: 'finished', completedRounds: 2 });
    expect(f.room().game.results.map(r => r.kind)).toEqual(['tutorial', 'regular', 'regular']);
    await f.restart(); expect(f.room().game.results.map(r => r.kind)).toEqual(['tutorial', 'regular', 'regular']);
  } finally { await f.close(); }
});
