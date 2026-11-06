import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, LobbyCommand, LobbyInputs, LobbyReply } from '../../src/shared/protocol.js';
import { createServerRuntime } from '../../src/server/runtime.js';
import { createFileSessionStore } from '../../src/server/session-store.js';
import type { SessionStore } from '../../src/server/session-store.js';
import { controlledClock } from '../helpers/game-clock.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
function value(reply: LobbyReply) { if (!reply.ok) throw new Error(reply.error); return reply.view; }
function send<C extends LobbyCommand>(socket: Client, event: C, input: LobbyInputs[C]): Promise<LobbyReply> {
  return new Promise((resolve, reject) => {
    const emit = socket.timeout(3000).emit.bind(socket) as (event: C, input: LobbyInputs[C], ack: (error: Error | null, reply: LobbyReply) => void) => void;
    emit(event, input, (error, reply) => error ? reject(error) : resolve(reply));
  });
}
async function processServer(directory: string) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../dist/server/index.js', import.meta.url))], {
    cwd: directory, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const exited = once(child, 'exit'); let output = '';
  child.stdout!.on('data', chunk => { output += String(chunk); }); child.stderr!.resume();
  const ready = new Promise<number>((resolve, reject) => {
    child.on('message', message => { const m = message as { type: string; port: number }; if (m.type === 'pomekhi:ready') resolve(m.port); });
    child.once('exit', () => reject(new Error('Process exited before readiness.')));
  });
  const port = await ready;
  const code = /Organizer code \(keep private\): (\w+)/.exec(output)?.[1];
  if (!code) { child.kill('SIGKILL'); await exited; throw new Error('No local organizer code.'); }
  return { child, exited, port, code };
}
async function connect(port: number) {
  const socket: Client = io(`http://127.0.0.1:${port}`, { autoConnect: false, transports: ['websocket'], reconnection: false });
  const ready = new Promise<void>((resolve, reject) => { socket.once('server:ready', () => resolve()); socket.once('connect_error', reject); });
  socket.connect(); await ready; return socket;
}

it.skipIf(process.platform === 'win32')('recovers seven real clients after a killed process with private cards and durable request replay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-crash-')), sockets: Client[] = [];
  let running: Awaited<ReturnType<typeof processServer>> | undefined;
  try {
    running = await processServer(dir); let host = await connect(running.port); sockets.push(host);
    value(await send(host, 'organizer:authorize', { code: running.code }));
    const created = value(await send(host, 'room:create', {})); if (created.kind !== 'organizer' || !created.room) throw new Error('No room');
    const room = created.room;
    for (let n = 1; n <= 7; n++) { const p = await connect(running.port); sockets.push(p); value(await send(p, 'player:join', { roomCode: room.code, name: `Телефон ${n}`, resumeKey: String(n).padStart(64, '0') })); }
    const joined = value(await send(host, 'lobby:sync', {})); if (joined.kind !== 'organizer' || !joined.room) throw new Error('No room');
    value(await send(host, 'venue:configure', { roomId: room.id, requestId: 'durable-venue-request', gameVersion: joined.room.game.version, roundId: null,
      venue: { base: 'База', zones: ['Дальняя комната'], storyId: 'S001', prologueRead: true, harder: false, order: joined.room.players.map(p => p.id) } }));
    const dealIntent = { roomId: room.id, requestId: 'durable-deal-request', dealVersion: room.dealing.version, dealId: null, possessedCount: 3 };
    const dealt = value(await send(host, 'deal:create', dealIntent)); if (dealt.kind !== 'organizer' || !dealt.room) throw new Error('No deal');
    const cards = await Promise.all(sockets.slice(1).map(async p => value(await send(p, 'lobby:sync', {}))));
    const startIntent = { roomId: room.id, requestId: 'durable-start-request', gameVersion: dealt.room.game.version, roundId: null, confirmWarnings: true };
    const started = value(await send(host, 'round:start', startIntent)); if (started.kind !== 'organizer' || !started.room) throw new Error('No round');
    // The successful replies above are deliberately not used as the client's retry journal.
    const firstCode = running.code, roundId = started.room.game.roundId;
    running.child.kill('SIGKILL'); await running.exited; sockets.splice(0).forEach(p => p.disconnect());
    running = await processServer(dir); expect(running.code !== firstCode).toBe(true);
    host = await connect(running.port); sockets.push(host);
    const restored = value(await send(host, 'organizer:authorize', { code: running.code }));
    expect(restored).toMatchObject({ kind: 'organizer', audioEnabled: false, persistence: { mode: 'disk', state: 'ready', recovered: true }, room: { id: room.id, game: { phase: 'placement', paused: true, pauseReason: 'server_restarted', roundId } } });
    expect(JSON.stringify(restored)).not.toContain('releaseCondition');
    const cues: unknown[] = []; host.on('game:cue', c => cues.push(c));
    for (let n = 1; n <= 7; n++) {
      const p = await connect(running.port); sockets.push(p);
      const view = value(await send(p, 'player:resume', { roomCode: room.code, resumeKey: String(n).padStart(64, '0') })), old = cards[n - 1];
      if (view.kind !== 'player' || old.kind !== 'player') throw new Error('Missing player');
      expect(view.assignment).toEqual(old.assignment); expect(view.playerId).toBe(old.playerId);
      expect(JSON.stringify(view)).not.toContain(String(n === 7 ? 1 : n + 1).padStart(64, '0'));
    }
    expect(value(await send(host, 'round:start', startIntent))).toMatchObject({ room: { game: { roundId, paused: true } } });
    expect(value(await send(host, 'deal:create', dealIntent))).toMatchObject({ room: { game: { roundId } } });
    expect(await send(host, 'round:start', { ...startIntent, requestId: 'old-unreceived-intent' })).toEqual({ ok: false, error: 'STALE_GAME' });
    expect(cues).toEqual([]);
    const persisted = await readFile(join(dir, 'data/party-v8.json'), 'utf8'); expect(persisted.includes(running.code)).toBe(false);
    value(await send(host, 'room:close', { roomId: room.id }));
    running.child.kill('SIGTERM'); await running.exited; sockets.splice(0).forEach(p => p.disconnect());
    running = await processServer(dir); host = await connect(running.port); sockets.push(host);
    expect(value(await send(host, 'organizer:authorize', { code: running.code }))).toMatchObject({ room: null });
    expect((await readdir(join(dir, 'data/.writers'))).length).toBe(1);
  } finally {
    sockets.forEach(p => p.disconnect());
    if (running && running.child.exitCode === null && running.child.signalCode === null) { running.child.kill('SIGTERM'); await running.exited; }
    await rm(dir, { recursive: true, force: true });
  }
});

it('cancels startup during loading without opening a late port and releases the store', async () => {
  let release!: () => void, entered!: () => void, closed = false;
  const pending = new Promise<void>(r => { release = r; }), loading = new Promise<void>(r => { entered = r; });
  const store: SessionStore = { async acquire() {}, async load() { entered(); await pending; return null; }, async write() {}, async preserve() {}, async close() { closed = true; } };
  const runtime = createServerRuntime({ config: { host: '127.0.0.1', port: 0 }, sessionStore: store });
  const start = runtime.start(), rejected = expect(start).rejects.toMatchObject({ name: 'AbortError' });
  await loading; const stop = runtime.stop(); release(); await stop; await rejected; expect(closed).toBe(true);
});

it('rejects a competing executable before it can listen or replace the session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-competing-'));
  let first: Awaited<ReturnType<typeof processServer>> | undefined;
  try {
    first = await processServer(dir);
    const before = await readFile(join(dir, 'data/party-v8.json'), 'utf8');
    const other = spawn(process.execPath, [fileURLToPath(new URL('../../dist/server/index.js', import.meta.url))], {
      cwd: dir, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const messages: unknown[] = []; other.on('message', m => messages.push(m)); other.stderr!.resume();
    const [exitCode] = await once(other, 'exit'); expect(exitCode).toBe(1); expect(messages).toEqual([]);
    expect(await readFile(join(dir, 'data/party-v8.json'), 'utf8')).toBe(before);
    expect((await fetch(`http://127.0.0.1:${first.port}/api/health`)).status).toBe(200);
  } finally {
    if (first && first.child.exitCode === null && first.child.signalCode === null) { first.child.kill('SIGTERM'); await first.exited; }
    await rm(dir, { recursive: true, force: true });
  }
});

it('bounds stop during a stalled load and never starts listening when that load finishes later', async () => {
  let release!: () => void, entered!: () => void, closed = false;
  const pending = new Promise<void>(r => { release = r; }), loading = new Promise<void>(r => { entered = r; });
  const store: SessionStore = { async acquire() {}, async load() { entered(); await pending; return null; }, async write() { throw new Error('Cancelled startup must not write.'); }, async preserve() {}, async close() { closed = true; } };
  const runtime = createServerRuntime({ config: { host: '127.0.0.1', port: 0 }, sessionStore: store, shutdownTimeoutMs: 30 });
  const start = runtime.start(), rejected = expect(start).rejects.toBeInstanceOf(AggregateError);
  await loading;
  try { await expect(runtime.stop()).rejects.toThrow('shutdown exceeded'); await rejected; }
  finally { release(); }
  await expect.poll(() => closed).toBe(true);
  await expect(runtime.start()).rejects.toMatchObject({ name: 'AbortError' });
});

it('reconciles delayed phone reports and restores retained groups with the current disk store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-first-game-')), clients: Client[] = [];
  const time = controlledClock();
  const make = () => createServerRuntime({ firstGame: true, config: { host: '127.0.0.1', port: 0 }, organizerCode: 'FIRSTGAME',
    randomIndex: limit => limit > 11 ? limit - 1 : 0, sessionStore: createFileSessionStore(dir, true), clock: time.clock });
  let runtime = make(), sequence = 0;
  let port = (await runtime.start()).port;
  const newClient = async () => { const client = await connect(port); clients.push(client); return client; };
  let host = await newClient(), phones: Client[] = [];
  const roomView = async () => {
    const view = value(await send(host, 'lobby:sync', {}));
    if (view.kind !== 'organizer' || !view.room) throw Error('No room.');
    return { ...view, room: view.room };
  };
  const current = async () => (await roomView()).room;
  const base = async () => {
    const room = await current();
    return { roomId: room.id, roundId: room.game.roundId, gameVersion: room.game.version, requestId: `first-game-request-${++sequence}` };
  };
  const deal = async () => {
    const room = await current();
    return value(await send(host, 'deal:create', { roomId: room.id, requestId: `first-game-request-${++sequence}`, dealId: room.dealing.dealId, dealVersion: room.dealing.version, possessedCount: 0 }));
  };
  const personal = async (index: number) => {
    const v = value(await send(phones[index], 'lobby:sync', {})); if (v.kind !== 'player') throw Error('No player.'); return v;
  };
  try {
    value(await send(host, 'organizer:authorize', { code: 'FIRSTGAME' })); value(await send(host, 'room:create', {}));
    const { id: roomId, code: roomCode } = await current();
    const enter = async (resume = false) => {
      phones = [];
      for (let i = 0; i < 7; i++) {
        const p = await newClient(); phones.push(p);
        const resumeKey = String(i + 1).padStart(64, '0');
        value(await send(p, resume ? 'player:resume' : 'player:join', { roomCode, resumeKey, name: `Медиум ${i}` }));
      }
    };
    await enter(); const ids = (await current()).players.map(p => p.id);
    value(await send(host, 'venue:configure', { ...await base(), venue: { base: 'База', zones: ['Кухня'], comedy: true } }));
    await deal();
    expect((await roomView()).roles?.[ids[1]]).toBe('possessed');
    expect((await current()).game.venue).not.toHaveProperty('dwelling');
    expect((await personal(0)).assignment?.card).toMatchObject({ id: 'CE016', mission: expect.stringContaining('встречном') });
    expect((await personal(0)).assignment?.card).not.toHaveProperty('offering');
    expect((await personal(1)).assignment?.card).toMatchObject({ id: 'CP024' });
    expect(JSON.stringify(await roomView())).not.toContain('Дух застрял на репетиции выхода');
    expect((await personal(0)).room.dealing.assignments.map(a => a.playerId)).toEqual([ids[0]]);
    value(await send(host, 'round:start', { ...await base(), confirmWarnings: true }));
    value(await send(phones[1], 'play:location', { ...await base(), zone: 'Кухня' }));
    for (let i = 0; i < 45; i++) { time.advance(1000); await current(); }
    expect((await current()).game.phase).toBe('search');
    const play = async (i: number) => ({ ...await base(), playVersion: (await personal(i)).play!.version });
    value(await send(phones[1], 'play:infect', { ...await play(1), targetId: ids[0] }));
    const retained = (await personal(0)).play!.card;
    value(await send(phones[3], 'play:infect', { ...await play(3), targetId: ids[4] }));
    const blocked = (await personal(3)).play!.undo!;
    expect(await send(phones[4], 'play:release', { ...await play(4), targetIds: [ids[3]] })).toEqual({ ok: false, error: 'ACTION_UNAVAILABLE' });
    expect(await send(phones[2], 'play:release', { ...await play(2), targetIds: [ids[3], ids[6]] })).toEqual({ ok: false, error: 'ACTION_UNAVAILABLE' });
    expect((await personal(4)).play?.status).toBe('captured');
    const release = { ...await play(2), targetIds: [ids[3], ids[4]] };
    value(await send(phones[2], 'play:release', release));
    value(await send(phones[2], 'play:release', release));
    expect((await personal(3)).play?.undo).toMatchObject({ id: blocked.id, canRequestReview: true });
    const request = { ...await play(3), actionId: blocked.id, requestReview: true as const };
    value(await send(phones[3], 'play:undo', request));
    value(await send(phones[3], 'play:undo', request));
    expect((await personal(4)).play).toMatchObject({ status: 'released', wasCaptured: true });
    const undoRequest = (await personal(3)).synchronization!.undoRequests![0];
    expect(undoRequest).toMatchObject({ status: 'review' });
    expect((await personal(4)).synchronization?.undoRequests).toBeUndefined();
    value(await send(phones[2], 'play:release', { ...await play(2), targetIds: [ids[5]] }));
    value(await send(host, 'round:return', await base())); value(await send(host, 'round:return', await base()));
    const roundId = (await current()).game.roundId!;
    const hostRow = (await roomView()).review!.find(row => row.id === undoRequest.id)!;
    expect(hostRow.blockers).toHaveLength(1);
    const preview = await send(host, 'sync:preview', { ...await base(), eventId: undoRequest.id, decision: 'accept' });
    expect(preview).toMatchObject({ ok: true, reviewPreview: { applied: false, remainingSteps: 16 } });
    expect(await send(host, 'sync:resolve', { ...await base(), eventId: undoRequest.id, decision: 'accept' }))
      .toEqual({ ok: false, error: 'UNDO_DEPENDENCY' });
    const late = { id: 'first-game-mission', roundId, clientId: 'first-game-phone', sequence: 1, previousId: null,
      action: { kind: 'mission' as const, completed: true }, phase: 'search' as const, paused: false, estimatedServerTime: null };
    const upload = { roomId, roundId, events: [late] };
    value(await send(phones[2], 'play:sync', upload));
    expect((await roomView()).review?.find(e => e.id === late.id)?.status).toBe('review');
    value(await send(host, 'sync:resolve', { ...await base(), eventId: late.id, decision: 'accept' }));
    expect((await current()).game.ritual?.preview?.remainingSteps).toBe(15);
    value(await send(host, 'sync:resolve', { ...await base(), eventId: late.id, decision: 'reject' }));
    expect((await current()).game.ritual?.preview?.remainingSteps).toBe(16);
    await runtime.stop(); clients.splice(0).forEach(client => client.disconnect());
    runtime = make(); port = (await runtime.start()).port; host = await newClient();
    value(await send(host, 'organizer:authorize', { code: 'FIRSTGAME' })); await enter(true);
    expect((await current()).game.ritual).toMatchObject({ target: 18, remainingSteps: 18, preview: { remainingSteps: 16 } });
    expect((await current()).game.venue.comedy).toBe(true);
    expect((await personal(0)).play?.card).toEqual(retained);
    expect((await roomView()).review?.find(e => e.id === late.id)?.status).toBe('rejected');
    expect((await personal(3)).synchronization?.undoRequests).toEqual([undoRequest]);
    const duplicate = { id: 'duplicate-undo-request', clientId: 'offline-undo-request', sequence: 1, previousId: null, roundId,
      action: { kind: 'undo' as const, actionId: blocked.id, requestReview: true as const },
      phase: 'between_rounds' as const, paused: false, estimatedServerTime: null };
    value(await send(phones[3], 'play:sync', { roomId, roundId, events: [duplicate] }));
    expect((await personal(3)).synchronization?.undoRequests).toEqual([undoRequest]);
    value(await send(host, 'sync:resolve', { ...await base(), eventId: hostRow.blockers![0], decision: 'reject' }));
    expect(await send(host, 'sync:preview', { ...await base(), eventId: undoRequest.id, decision: 'accept' }))
      .toMatchObject({ ok: true, reviewPreview: { applied: true } });
    value(await send(host, 'sync:resolve', { ...await base(), eventId: undoRequest.id, decision: 'accept' }));
    expect((await personal(3)).synchronization?.undoRequests).toMatchObject([{ id: undoRequest.id, status: 'accepted' }]);
    expect((await personal(4)).play).toMatchObject({ status: 'exorcist', wasCaptured: false });
    const correction = { ...late, id: 'late-group-release', clientId: 'late-release-phone', action: { kind: 'release' as const, targetIds: [ids[3]] } };
    value(await send(phones[4], 'play:sync', { roomId, roundId, events: [correction] }));
    value(await send(host, 'sync:resolve', { ...await base(), eventId: correction.id, decision: 'accept' }));
    for (const [i, id] of ids.entries()) value(await send(phones[i], 'play:presence', { ...await base(), status: (await roomView()).presence!.find(p => p.playerId === id)!.expected }));
    value(await send(host, 'sync:close', { ...await base(), confirm: true }));
    const confirm = await base();
    value(await send(host, 'results:finalize', confirm)); value(await send(host, 'results:finalize', confirm));
    expect((await current()).game.ritual?.remainingSteps).toBe(16);
    expect((await personal(0)).play).toMatchObject({ status: 'captured', location: 'Кухня', card: retained });
    await deal();
    expect((await current()).dealing.assignments).toHaveLength(5);
    expect((await personal(0)).assignment).toBeNull();
    expect((await personal(0)).play).toMatchObject({ retained: true, card: retained });
    value(await send(host, 'round:start', { ...await base(), confirmWarnings: true }));
    expect((await personal(0)).play).toMatchObject({ retained: true, card: retained, location: 'Кухня' });
    expect(JSON.parse(await readFile(join(dir, 'party-v8.json'), 'utf8')).schemaVersion).toBe(8);
  } finally { clients.forEach(client => client.disconnect()); await runtime.stop(); await rm(dir, { recursive: true, force: true }); }
});
