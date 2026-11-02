import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createServerRuntime } from '../../src/server/runtime.js';
import { createFileSessionStore } from '../../src/server/session-store.js';
import { controlledClock } from '../helpers/game-clock.js';
import type { ClientToServerEvents, LobbyCommand, LobbyInputs, LobbyReply, OfflineAction, OfflineEvent, RoomSnapshot, ServerToClientEvents } from '../../src/shared/protocol.js';
type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const sockets: Client[] = [];
afterEach(() => sockets.splice(0).forEach(s => s.disconnect()));
function value(reply: LobbyReply) { if (!reply.ok) throw new Error(reply.error); return reply.view; }
function send<C extends LobbyCommand>(socket: Client, command: C, input: LobbyInputs[C]): Promise<LobbyReply> {
  return new Promise((resolve, reject) => {
    const emit = socket.timeout(3000).emit.bind(socket) as (event: C, data: LobbyInputs[C], ack: (error: Error | null, reply: LobbyReply) => void) => void;
    emit(command, input, (error, reply) => error ? reject(error) : resolve(reply));
  });
}
it('persists seven-client offline reconciliation, group departure, review, completion and closed-result rejection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-offline-')), time = controlledClock();
  let runtime = createServerRuntime({ config: { host: '127.0.0.1', port: 0 }, organizerCode: 'TESTHOSTCODE', sessionStore: createFileSessionStore(dir), clock: time.clock });
  let port = (await runtime.start()).port, host: Client; const phones: Client[] = []; let sequence = 0;
  const connect = async () => { const s: Client = io(`http://127.0.0.1:${port}`, { autoConnect: false, transports: ['websocket'], reconnection: false }); sockets.push(s); const ready = new Promise<void>((resolve, reject) => { s.once('server:ready', () => resolve()); s.once('connect_error', reject); }); s.connect(); await ready; return s; };
  const current = async (): Promise<RoomSnapshot> => { const v = value(await send(host, 'lobby:sync', {})); if (v.kind !== 'organizer' || !v.room) throw new Error('No room'); return v.room; };
  const base = async () => { const r = await current(); return { roomId: r.id, roundId: r.game.roundId, gameVersion: r.game.version, requestId: `offline-request-${++sequence}` }; };
  const personal = async (p: Client) => { const v = value(await send(p, 'lobby:sync', {})); if (v.kind !== 'player') throw new Error('No player'); return v; };
  const event = (actor: string, roundId: string, action: OfflineAction): OfflineEvent => ({ id: `offline-event-${++sequence}`, clientId: `offline-client-${actor}`, sequence, previousId: null, roundId, action, phase: 'search', paused: false, estimatedServerTime: 1 });
  try {
    host = await connect(); value(await send(host, 'organizer:authorize', { code: 'TESTHOSTCODE' })); value(await send(host, 'room:create', {})); let room = await current();
    value(await send(host, 'venue:configure', { ...await base(), venue: { base: 'Гостиная', zones: ['Кухня', 'Коридор'] } }));
    value(await send(host, 'game:configure', { ...await base(), settings: { ...room.game.settings, ritualEnabled: false, tutorialEnabled: false, roundLimit: 1, placementSeconds: 1, searchSeconds: 120, returnSeconds: 1, infectionMode: 'on' } }));
    for (let i = 1; i <= 7; i++) { const p = await connect(); phones.push(p); value(await send(p, 'player:join', { roomCode: room.code, name: `Offline ${i}`, resumeKey: String(i).padStart(64, '0') })); }
    room = await current(); value(await send(host, 'deal:create', { roomId: room.id, dealId: room.dealing.dealId, dealVersion: room.dealing.version, requestId: `offline-request-${++sequence}`, possessedCount: 3 }));
    value(await send(host, 'round:start', { ...await base(), confirmWarnings: true })); time.advance(1000); room = await current(); const roundId = room.game.roundId!;
    for (const p of phones) value(await send(p, 'play:sync', { roomId: room.id, roundId, events: [] }));
    const views = await Promise.all(phones.map(personal)), roots = phones.filter((_, i) => views[i].assignment!.card.role === 'possessed'), exos = phones.filter((_, i) => views[i].assignment!.card.role === 'exorcist');
    const root = roots[0], captive = exos[0], target = exos[1], ids = new Map(phones.map((p, i) => [p, views[i].playerId]));
    const first = event(ids.get(root)!, roundId, { kind: 'infect', targetId: ids.get(captive)! });
    const chain = event(ids.get(captive)!, roundId, { kind: 'infect', targetId: ids.get(target)! });
    value(await send(captive, 'play:sync', { roomId: room.id, roundId, events: [chain] }));
    expect((await personal(captive)).synchronization!.receipts[0].status).toBe('review');
    value(await send(root, 'play:sync', { roomId: room.id, roundId, events: [first] })); expect((await personal(target)).play!.status).toBe('captured');
    expect(value(await send(host, 'lobby:sync', {}))).toMatchObject({ review: [] });
    expect(await send(captive, 'sync:close', { ...await base(), confirm: true })).toEqual({ ok: false, error: 'FORBIDDEN' });
    const withdraw = event(ids.get(root)!, roundId, { kind: 'withdraw' }); value(await send(root, 'play:sync', { roomId: room.id, roundId, events: [withdraw] }));
    expect((await current()).game).toMatchObject({ phase: 'search', paused: false });
    const before = await personal(target);
    await runtime.stop(); sockets.forEach(p => p.disconnect());
    runtime = createServerRuntime({ config: { host: '127.0.0.1', port: 0 }, organizerCode: 'SECONDHOST', sessionStore: createFileSessionStore(dir), clock: time.clock });
    port = (await runtime.start()).port; host = await connect(); value(await send(host, 'organizer:authorize', { code: 'SECONDHOST' }));
    for (let i = 0; i < phones.length; i++) { phones[i] = await connect(); value(await send(phones[i], 'player:resume', { roomCode: room.code, resumeKey: String(i + 1).padStart(64, '0') })); }
    const restoredTarget = phones[views.findIndex(v => v.playerId === ids.get(target))], restoredRoot = phones[views.findIndex(v => v.playerId === ids.get(root))];
    expect((await personal(restoredTarget)).play?.card).toEqual(before.play?.card); expect((await personal(restoredRoot)).synchronization?.withdrawn).toBe(true);
    expect((await current()).game.venue).toEqual({ base: 'Гостиная', zones: ['Кухня', 'Коридор'] });
    value(await send(host, 'round:resume', { ...await base(), confirmWarnings: true }));
    value(await send(restoredRoot, 'play:sync', { roomId: room.id, roundId, events: [first] }));
    const release = event(ids.get(target)!, roundId, { kind: 'release' }); value(await send(restoredTarget, 'play:sync', { roomId: room.id, roundId, events: [release] }));
    value(await send(host, 'round:return', await base())); time.advance(1000); room = await current();
    expect(room.game.results.at(-1)).toMatchObject({ rescuedGroups: 1, infectedPlayers: 2, status: 'provisional' });
    expect(await send(host, 'results:finalize', await base())).toEqual({ ok: false, error: 'SYNC_PENDING' });
    const lateRootIndex = views.findIndex(v => v.playerId === ids.get(roots[1])), late = event(ids.get(roots[1])!, roundId, { kind: 'release' });
    value(await send(phones[lateRootIndex], 'play:sync', { roomId: room.id, roundId, events: [late] }));
    expect((await current()).game.synchronization?.conflicts).toBe(1);
    value(await send(host, 'sync:resolve', { ...await base(), eventId: late.id, decision: 'accept' }));
    expect((await current()).game.results.at(-1)?.rescuedGroups).toBe(2);
    const revision = (await current()).game.synchronization!.revision;
    for (const p of phones) value(await send(p, 'play:complete', { roomId: room.id, roundId, syncRevision: revision }));
    value(await send(host, 'results:finalize', await base()));
    const afterClose = event(ids.get(roots[2])!, roundId, { kind: 'release' });
    value(await send(phones[views.findIndex(v => v.playerId === ids.get(roots[2]))], 'play:sync', { roomId: room.id, roundId, events: [afterClose] }));
    expect((await current()).game.results.at(-1)).toMatchObject({ status: 'final', rescuedGroups: 2 });
    expect(JSON.parse(await readFile(join(dir, 'session.json'), 'utf8')).schemaVersion).toBe(4);
    expect(JSON.stringify(value(await send(host, 'lobby:sync', {})))).not.toContain('releaseCondition');
  } finally { await runtime.stop(); await rm(dir, { recursive: true, force: true }); }
});
