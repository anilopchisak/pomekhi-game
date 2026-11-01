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
import type { SessionStore } from '../../src/server/session-store.js';

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
    const persisted = await readFile(join(dir, 'data/session.json'), 'utf8'); expect(persisted.includes(running.code)).toBe(false);
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
    const before = await readFile(join(dir, 'data/session.json'), 'utf8');
    const other = spawn(process.execPath, [fileURLToPath(new URL('../../dist/server/index.js', import.meta.url))], {
      cwd: dir, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const messages: unknown[] = []; other.on('message', m => messages.push(m)); other.stderr!.resume();
    const [exitCode] = await once(other, 'exit'); expect(exitCode).toBe(1); expect(messages).toEqual([]);
    expect(await readFile(join(dir, 'data/session.json'), 'utf8')).toBe(before);
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
