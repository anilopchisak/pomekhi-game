import { afterEach, beforeEach, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createAppServer } from '../../src/server/app.js';
import { controlledClock } from '../helpers/game-clock.js';
import type { ClientToServerEvents, GameCue, LobbyCommand, LobbyInputs, LobbyReply, LobbyView, RoomSnapshot, ServerToClientEvents } from '../../src/shared/protocol.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let app: ReturnType<typeof createAppServer>, origin: string, timer: ReturnType<typeof controlledClock>, sequence: number;
const sockets: Client[] = [];
beforeEach(async () => {
  timer = controlledClock(); sequence = 0;
  app = createAppServer({ organizerCode: 'TESTHOSTCODE', clock: timer.clock });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { for (const socket of sockets.splice(0)) socket.disconnect(); await app.close(); });
async function connect() {
  const socket: Client = io(origin, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'] }); sockets.push(socket);
  const ready = new Promise<void>((resolve, reject) => { socket.once('server:ready', () => resolve()); socket.once('connect_error', reject); });
  socket.connect(); await ready; return socket;
}
function send<C extends LobbyCommand>(socket: Client, command: C, input: LobbyInputs[C]): Promise<LobbyReply> {
  return new Promise((resolve, reject) => {
    const emit = socket.timeout(2000).emit.bind(socket) as (event: C, data: LobbyInputs[C], ack: (error: Error | null, reply: LobbyReply) => void) => void;
    emit(command, input, (error, reply) => error ? reject(error) : resolve(reply));
  });
}
function value(reply: LobbyReply) { if (!reply.ok) throw new Error(reply.error); return reply.view; }
function roomOf(view: LobbyView): RoomSnapshot { if (view.kind === 'ended' || !view.room) throw new Error('Missing room'); return view.room; }
async function current(socket: Client) { return roomOf(value(await send(socket, 'lobby:sync', {}))); }
function base(room: RoomSnapshot) { return { roomId: room.id, gameVersion: room.game.version, roundId: room.game.roundId, requestId: `round-request-${++sequence}` }; }
function dealBase(room: RoomSnapshot) { return { roomId: room.id, dealVersion: room.dealing.version, dealId: room.dealing.dealId, requestId: `deal-request-${++sequence}` }; }
function state(socket: Client, predicate: (room: RoomSnapshot) => boolean) {
  return new Promise<RoomSnapshot>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('lobby:state', listener); reject(new Error('Expected game state was not published.')); }, 2000);
    function listener(view: LobbyView) {
      if (view.kind === 'ended' || !view.room || !predicate(view.room)) return;
      clearTimeout(timeout); socket.off('lobby:state', listener); resolve(view.room);
    }
    socket.on('lobby:state', listener);
  });
}
async function setup(tutorialEnabled = false) {
  const host = await connect(); value(await send(host, 'organizer:authorize', { code: 'TESTHOSTCODE' }));
  const room = roomOf(value(await send(host, 'room:create', {})));
  const phones = await Promise.all(Array.from({ length: 7 }, () => connect()));
  const sessions = phones.map((_, i) => ({ roomCode: room.code, name: `Player ${i}`, resumeKey: (i + 1).toString(16).padStart(64, '0') }));
  for (const [i, phone] of phones.entries()) value(await send(phone, 'player:join', sessions[i]));
  value(await send(host, 'game:configure', { ...base(await current(host)), settings: { ...room.game.settings, ritualEnabled: false, tutorialEnabled, roundLimit: 2, placementSeconds: 2, searchSeconds: 3, returnSeconds: 2 , infectionMode: 'off'} }));
  value(await send(host, 'deal:create', { ...dealBase(await current(host)), possessedCount: 3 }));
  return { host, room, phones, sessions };
}
async function start(host: Client) { return value(await send(host, 'round:start', { ...base(await current(host)), confirmWarnings: true })); }

it('publishes a new party to the same sockets and invitation during an active round', async () => {
  const { host, phones, sessions } = await setup();
  const before = roomOf(await start(host));
  const offline = phones.at(-1)!;
  const player = value(await send(offline, 'lobby:sync', {}));
  offline.disconnect();
  const updates = phones.slice(0, -1).map(phone => state(phone, snapshot => snapshot.partyId !== before.partyId));
  const reset = base(before);
  const after = roomOf(value(await send(host, 'room:restart', reset)));
  expect(after).toMatchObject({ id: before.id, code: before.code, game: { phase: 'lobby', settings: before.game.settings } });
  expect(after.partyId).not.toBe(before.partyId);
  for (const update of await Promise.all(updates)) {
    expect(update).toMatchObject({ id: before.id, partyId: after.partyId, dealing: { assignments: [] } });
  }
  const reconnected = await connect();
  expect(value(await send(reconnected, 'player:resume', sessions.at(-1)!))).toMatchObject({
    kind: 'player', playerId: player.kind === 'player' ? player.playerId : undefined, assignment: null, play: null,
    room: { id: before.id, partyId: after.partyId },
  });
  expect(roomOf(value(await send(host, 'room:restart', reset))).partyId).toBe(after.partyId);
});

it.each([
  ['possessed', 'leave'], ['possessed', 'remove'], ['exorcist', 'leave'], ['exorcist', 'remove'],
] as const)('publishes return after the last %s departs through %s', async (role, method) => {
  const { host, phones, room } = await setup();
  const departing: { phone: Client; playerId: string }[] = [];
  for (const phone of phones) {
    const own = value(await send(phone, 'lobby:sync', {}));
    if (own.kind === 'player' && own.assignment?.card.role === role) departing.push({ phone, playerId: own.playerId });
  }
  await start(host);
  const search = state(host, snapshot => snapshot.game.phase === 'search'); timer.advance(2000); await search;
  const survivor = phones.find(phone => !departing.some(p => p.phone === phone))!;
  for (const [index, player] of departing.entries()) {
    const remaining = departing.length - index - 1;
    if (method === 'leave') value(await send(player.phone, 'player:leave', { roomId: room.id }));
    else value(await send(host, 'player:remove', { roomId: room.id, playerId: player.playerId }));
    expect((await current(survivor)).game).toMatchObject({ phase: remaining ? 'search' : 'return', paused: false });
  }
  expect((await current(host)).game).toMatchObject({ phase: 'return', remainingMs: 2000, completedRounds: 0 });
  const end = state(survivor, snapshot => snapshot.game.phase === 'between_rounds'); timer.advance(2000);
  expect((await end).game).toMatchObject({ completedRounds: 1, results: [{ totalGroups: 3, totalMissions: 4 }] });
});

it('broadcasts timed transitions to seven clients without further commands and credits only completed rounds', async () => {
  const { host, phones } = await setup();
  expect(await send(host, 'round:start', { ...base(await current(host)), confirmWarnings: false })).toEqual({ ok: false, error: 'START_WARNING' });
  const startInput = { ...base(await current(host)), confirmWarnings: true };
  const started = roomOf(value(await send(host, 'round:start', startInput)));
  const own = value(await send(phones[0], 'lobby:sync', {}));
  expect(value(await send(host, 'round:start', startInput))).toMatchObject({ room: { game: { roundId: started.game.roundId } } });
  const search = phones.map(phone => state(phone, room => room.game.phase === 'search')); timer.advance(2000); await Promise.all(search);
  const returning = state(host, room => room.game.phase === 'return'); timer.advance(3000); await returning;
  const ended = state(host, room => room.game.phase === 'between_rounds'); timer.advance(2000);
  expect((await ended).game).toMatchObject({ completedRounds: 1, deadline: null }); expect(timer.pending()).toBe(0);
  expect(value(await send(phones[0], 'lobby:sync', {}))).toMatchObject({ assignment: own.kind === 'player' ? own.assignment : null });
  const resumed = roomOf(value(await send(host, 'round:start', startInput)));
  expect(resumed.game.completedRounds).toBe(1); expect(resumed.game.phase).toBe('between_rounds');
  expect(await send(host, 'round:start', { ...startInput, requestId: 'stale-start-command' })).toEqual({ ok: false, error: 'STALE_GAME' });
  await complete(phones, host);
  value(await send(host, 'deal:create', { ...dealBase(await current(host)), possessedCount: 3 }));
  const expectedOrder = started.players.map(player => player.id).sort();
  for (const phone of phones) {
    const view = value(await send(phone, 'lobby:sync', {}));
    expect(roomOf(view).dealing.assignments.map(item => item.playerId)).toEqual(expectedOrder);
  }
  await start(host);
  const paused = state(host, room => room.game.phase === 'placement' && room.game.paused);
  timer.jump(60000); timer.callbacks()[0](); expect((await paused).game.pauseReason).toBe('clock_gap');
});

it('keeps phone disconnections separate from host loss, restores the same card and never auto-resumes', async () => {
  const { host, phones, sessions } = await setup(); await start(host); timer.advance(800);
  const own = value(await send(phones[0], 'lobby:sync', {}));
  const offline = state(host, room => !room.players.find(p => p.name === 'Player 0')!.online);
  phones[0].disconnect(); expect((await offline).game.paused).toBe(false);
  const second = await connect(); value(await send(second, 'organizer:authorize', { code: 'TESTHOSTCODE' }));
  host.disconnect(); expect((await current(second)).game.paused).toBe(false);
  value(await send(second, 'organizer:authorize', { code: 'TESTHOSTCODE' })); expect((await current(second)).game.paused).toBe(false);
  const paused = state(phones[1], room => room.game.paused); second.disconnect();
  expect((await paused).game).toMatchObject({ pauseReason: 'organizer_disconnected', remainingMs: 1200 });
  const replacement = await connect(); value(await send(replacement, 'organizer:authorize', { code: 'TESTHOSTCODE' }));
  expect((await current(replacement)).game.paused).toBe(true);
  const phone = await connect(); const restored = value(await send(phone, 'player:resume', sessions[0]));
  expect(restored).toMatchObject({ assignment: own.kind === 'player' ? own.assignment : null });
  value(await send(replacement, 'round:resume', { ...base(await current(replacement)), confirmWarnings: false }));
  const search = state(phone, room => room.game.phase === 'search'); timer.advance(1200); await search;
});

it('waits newcomers, locks card actions, continues after an active departure and deals the next roster manually', async () => {
  const { host, phones, room } = await setup(); await start(host);
  const first = value(await send(phones[0], 'lobby:sync', {})); if (first.kind !== 'player' || !first.assignment) throw new Error('Missing card');
  const late = await connect(); const session = { roomCode: room.code, name: 'Late', resumeKey: 'a'.repeat(64) };
  const joined = value(await send(late, 'player:join', session)); expect(joined).toMatchObject({ assignment: null });
  expect(await send(phones[0], 'card:request', { ...dealBase(await current(host)), assignmentId: first.assignment.id, requested: true })).toEqual({ ok: false, error: 'INVALID_PHASE' });
  expect(await send(host, 'deal:shuffle', { ...dealBase(await current(host)), possessedCount: 3 })).toEqual({ ok: false, error: 'INVALID_PHASE' });
  value(await send(phones[1], 'player:leave', { roomId: room.id }));
  expect((await current(host)).game).toMatchObject({ paused: false, pauseReason: null, activePlayerIds: expect.any(Array) });
  value(await send(host, 'round:pause', base(await current(host))));
  expect(await send(host, 'round:resume', { ...base(await current(host)), confirmWarnings: false })).toEqual({ ok: false, error: 'RESUME_WARNING' });
  value(await send(host, 'round:resume', { ...base(await current(host)), confirmWarnings: true }));
  const search = state(host, room => room.game.phase === 'search'); timer.advance(2000); await search;
  value(await send(host, 'round:pause', base(await current(host))));
  value(await send(host, 'round:return', base(await current(host))));
  const end = state(host, room => room.game.phase === 'between_rounds'); timer.advance(2000); await end;
  expect(value(await send(late, 'player:resume', session))).toMatchObject({ assignment: null });
  value(await send(host, 'sync:close', { ...base(await current(host)), confirm: true }));
  value(await send(host, 'deal:create', { ...dealBase(await current(host)), possessedCount: 3 }));
  expect(value(await send(late, 'player:resume', session))).toMatchObject({ assignment: { ready: false } });
});

it('authorizes every control, canonicalizes retries and does not charge clock synchronization to the request journal', async () => {
  const { host, phones } = await setup(); const room = await current(host);
  const command = { ...base(room), settings: { ...room.game.settings, searchSeconds: 10 } };
  expect(await send(phones[0], 'game:configure', command)).toEqual({ ok: false, error: 'FORBIDDEN' });
  const anonymous = await connect(); expect(await send(anonymous, 'lobby:sync', {})).toEqual({ ok: false, error: 'FORBIDDEN' });
  value(await send(host, 'game:configure', command));
  value(await send(host, 'game:configure', { ...command, settings: { ...command.settings, infectionMode: 'off', returnSeconds: 2, searchSeconds: 10, placementSeconds: 2, roundLimit: 2 } }));
  expect(await send(host, 'game:configure', { ...command, settings: { ...command.settings, searchSeconds: 11 } })).toEqual({ ok: false, error: 'INVALID_INPUT' });
  for (let i = 0; i < 1030; i++) value(await send(host, 'lobby:sync', {}));
  await start(host); expect((await current(host)).game.phase).toBe('placement');
  expect(JSON.stringify(await current(host))).not.toMatch(/"(card|role|history|originalPossessed)"/);
});

it('selects one live sound panel and never replays cues after authorization or a sync', async () => {
  const { host } = await setup(); const second = await connect(); value(await send(second, 'organizer:authorize', { code: 'TESTHOSTCODE' }));
  const firstCues: GameCue[] = [], secondCues: GameCue[] = [];
  host.on('game:cue', cue => firstCues.push(cue)); second.on('game:cue', cue => secondCues.push(cue));
  value(await send(host, 'organizer:audio', { enabled: true }));
  const firstCue = new Promise<GameCue>(resolve => host.once('game:cue', resolve)); await start(host); expect((await firstCue).kind).toBe('start');
  value(await send(second, 'organizer:audio', { enabled: true }));
  const secondCue = new Promise<GameCue>(resolve => second.once('game:cue', resolve));
  value(await send(host, 'round:pause', base(await current(host)))); expect((await secondCue).kind).toBe('pause');
  expect(firstCues).toHaveLength(1); expect(secondCues).toHaveLength(1);
  value(await send(second, 'organizer:authorize', { code: 'TESTHOSTCODE' })); await current(second);
  expect(secondCues).toHaveLength(1);
});

it('closes a timed room and its server without leaving callbacks or publishing into a new room', async () => {
  const { host } = await setup(); await start(host); const lateCallback = timer.callbacks()[0];
  value(await send(host, 'room:close', { roomId: (await current(host)).id })); expect(timer.pending()).toBe(0);
  const room = roomOf(value(await send(host, 'room:create', {}))); lateCallback();
  expect((await current(host)).game).toMatchObject({ phase: 'lobby', completedRounds: 0 });
  expect((await current(host)).id).toBe(room.id); await app.close(); expect(timer.pending()).toBe(0);
});

async function action(socket: Client, command: 'play:infect' | 'play:release' | 'play:mission' | 'play:undo', extra: Record<string, unknown> = {}) {
  const own = value(await send(socket, 'lobby:sync', {}));
  if (own.kind !== 'player' || !own.play) throw new Error('Missing personal play');
  return send(socket, command, { ...base(own.room), playVersion: own.play.version, ...extra } as LobbyInputs[typeof command]);
}
async function searching() {
  const fixture = await setup();
  const settings = (await current(fixture.host)).game.settings;
  value(await send(fixture.host, 'game:configure', { ...base(await current(fixture.host)), settings: { ...settings, infectionMode: 'on' } }));
  await start(fixture.host);
  const views = await Promise.all(fixture.phones.map(async socket => { const own = value(await send(socket, 'lobby:sync', {})); if (own.kind !== 'player') throw new Error('Missing player'); return { socket, own }; }));
  timer.advance(2000);
  return { ...fixture, roots: views.filter(v => v.own.assignment!.card.role === 'possessed'), exorcists: views.filter(v => v.own.assignment!.card.role === 'exorcist') };
}
it('runs chained infections, group rescue, late missions and final results without exposing live progress', async () => {
  const { host, roots, exorcists } = await searching();
  value(await action(exorcists[0].socket, 'play:mission', { completed: true }));
  value(await action(roots[0].socket, 'play:infect', { targetId: exorcists[0].own.playerId }));
  const captured = value(await send(exorcists[0].socket, 'lobby:sync', {}));
  expect(captured).toMatchObject({ play: { status: 'captured', missionEligible: false } });
  value(await action(exorcists[0].socket, 'play:infect', { targetId: exorcists[1].own.playerId }));
  const root = value(await send(roots[0].socket, 'lobby:sync', {})); if (root.kind !== 'player') throw new Error('Missing root');
  expect(await action(roots[0].socket, 'play:undo', { actionId: root.play!.undo!.id })).toEqual({ ok: false, error: 'UNDO_DEPENDENCY' });
  const shared = await current(host); expect(shared.game.results).toEqual([]);
  expect(JSON.stringify(shared)).not.toMatch(/"(captured|missionCompleted|rescuedGroups|infectionCondition|cardKey)"/);
  value(await action(exorcists[1].socket, 'play:release'));
  value(await action(roots[1].socket, 'play:release')); value(await action(roots[2].socket, 'play:release'));
  expect((await current(host)).game).toMatchObject({ phase: 'search', remainingMs: 3000, results: [] });
  timer.advance(3000);
  expect((await current(host)).game).toMatchObject({ phase: 'return', results: [] });
  timer.advance(2000);
  expect((await current(host)).game.results[0]).toMatchObject({ status: 'provisional', rescuedGroups: 3, totalGroups: 3, missions: 0, totalMissions: 4, infectedPlayers: 2, activeMs: 7000 });
  value(await action(exorcists[2].socket, 'play:mission', { completed: true }));
  const released = value(await send(roots[2].socket, 'lobby:sync', {})); if (released.kind !== 'player') throw new Error('Missing release');
  value(await action(roots[2].socket, 'play:undo', { actionId: released.play!.undo!.id }));
  expect((await current(host)).game).toMatchObject({ phase: 'between_rounds', results: [{ rescuedGroups: 2, missions: 1 }] });
  await complete([...roots, ...exorcists].map(v => v.socket), host);
  value(await send(host, 'results:finalize', base(await current(host))));
  expect(await action(exorcists[2].socket, 'play:mission', { completed: false })).toEqual({ ok: false, error: 'RESULTS_FINAL' });
  expect((await current(host)).game.results[0].status).toBe('final');
});
it('restores effective cards across tabs and deduplicates lost acknowledgements and stale commands', async () => {
  const { host, roots, exorcists, sessions } = await searching();
  const own = value(await send(roots[0].socket, 'lobby:sync', {})); if (own.kind !== 'player') throw new Error('Missing root');
  const input = { ...base(own.room), playVersion: own.play!.version, targetId: exorcists[0].own.playerId };
  value(await send(roots[0].socket, 'play:infect', input));
  const captured = value(await send(exorcists[0].socket, 'lobby:sync', {})); if (captured.kind !== 'player') throw new Error('Missing captured');
  const index = Number(exorcists[0].own.room.players.find(p => p.id === captured.playerId)!.name.split(' ')[1]);
  const tab = await connect(); const restored = value(await send(tab, 'player:resume', sessions[index]));
  expect(restored).toMatchObject({ play: captured.play });
  const extended = { ...input, extraIgnored: 'not retained' };
  value(await send(roots[0].socket, 'play:infect', extended));
  expect((value(await send(tab, 'lobby:sync', {})) as typeof captured).play).toEqual(captured.play);
  expect(await send(roots[0].socket, 'play:infect', { ...input, requestId: 'late-capture-intent' })).toEqual({ ok: false, error: 'STALE_GAME' });
  expect(await send(host, 'play:infect', input)).toEqual({ ok: false, error: 'FORBIDDEN' });
  value(await send(host, 'round:pause', base(await current(host))));
  expect(await action(tab, 'play:release')).toEqual({ ok: false, error: 'INVALID_PHASE' });
  const currentRoot = value(await send(roots[0].socket, 'lobby:sync', {})); if (currentRoot.kind !== 'player') throw new Error('Missing root');
  value(await action(roots[0].socket, 'play:undo', { actionId: currentRoot.play!.undo!.id }));
  expect(value(await send(tab, 'lobby:sync', {}))).toMatchObject({ play: { status: 'exorcist', missionEligible: true } });
});
it('automatically returns on the last capture and never reopens after undo', async () => {
  const { host, roots, exorcists } = await searching();
  for (const target of exorcists) value(await action(roots[0].socket, 'play:infect', { targetId: target.own.playerId }));
  expect((await current(host)).game.phase).toBe('return');
  const own = value(await send(roots[0].socket, 'lobby:sync', {})); if (own.kind !== 'player') throw new Error('Missing root');
  value(await action(roots[0].socket, 'play:undo', { actionId: own.play!.undo!.id }));
  expect((await current(host)).game.phase).toBe('return');
});

it('runs tutorial and progression for seven independent phones with private cards and stable retries', async () => {
  const { host, phones } = await setup(true);
  for (const [index, kind, difficulty] of [[0, 'tutorial', 1], [1, 'regular', 1], [2, 'regular', 3]] as const) {
    if (index) value(await send(host, 'deal:create', { ...dealBase(await current(host)), possessedCount: 3 }));
    const room = await current(host);
    expect(room.game.roundPlan).toMatchObject({ kind, number: index, difficulty, infectionEnabled: index === 2 });
    const views = await Promise.all(phones.map(async phone => value(await send(phone, 'lobby:sync', {}))));
    for (const view of views) {
      if (view.kind !== 'player') throw new Error('Missing player');
      expect(view.assignment!.card.difficulty).toBe(difficulty);
      expect(JSON.stringify(view.room)).not.toMatch(/releaseCondition|infectionCondition|"card"/);
      const others = views.filter(v => v.kind === 'player' && v.playerId !== view.playerId);
      for (const other of others) if (other.kind === 'player') expect(JSON.stringify(view)).not.toContain(other.assignment!.card.title);
    }
    if (!index) {
      const rootIndex = views.findIndex(v => v.kind === 'player' && v.assignment!.card.role === 'possessed');
      const target = views.find(v => v.kind === 'player' && v.assignment!.card.role === 'exorcist');
      value(await send(host, 'game:configure', { ...base(await current(host)), settings: { ...room.game.settings, infectionMode: 'on' } }));
      expect((await current(host)).game.roundPlan.infectionEnabled).toBe(true);
      await start(host);
      const search = state(host, r => r.game.phase === 'search'); timer.advance(2000); await search;
      expect(await action(phones[rootIndex], 'play:infect', { targetId: target?.kind === 'player' ? target.playerId : '' })).toMatchObject({ ok: true });
    } else {
      value(await send(host, 'game:configure', { ...base(await current(host)), settings: { ...(await current(host)).game.settings, infectionMode: 'auto' } }));
      await start(host);
      const search = state(host, r => r.game.phase === 'search'); timer.advance(2000); await search;
    }
    const returning = state(host, r => r.game.phase === 'return'); timer.advance(3000); await returning;
    const expected = index === 2 ? 'finished' : 'between_rounds';
    const end = state(host, r => r.game.phase === expected); timer.advance(2000);
    expect((await end).game.completedRounds).toBe(index);
    await complete(phones, host);
    if (!index) value(await send(host, 'game:configure', { ...base(await current(host)), settings: { ...(await current(host)).game.settings, infectionMode: 'auto' } }));
  }
  expect((await current(host)).game.results.map(r => r.kind)).toEqual(['tutorial', 'regular', 'regular']);
});

async function complete(phones: Client[], host: Client) {
  const room = await current(host);
  for (const phone of phones) value(await send(phone, 'play:complete', { roomId: room.id, roundId: room.game.roundId!, syncRevision: room.game.synchronization!.revision }));
}
