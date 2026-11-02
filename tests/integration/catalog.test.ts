import { afterEach, beforeEach, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createAppServer } from '../../src/server/app.js';
import { controlledClock } from '../helpers/game-clock.js';
import type { ClientToServerEvents, LobbyCommand, LobbyInputs, LobbyReply, CatalogInput, CatalogReply, LobbyView, RoomSnapshot, ServerToClientEvents } from '../../src/shared/protocol.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let app: ReturnType<typeof createAppServer>, origin: string, timer: ReturnType<typeof controlledClock>, sequence: number;
const sockets: Client[] = [];
beforeEach(async () => {
  timer = controlledClock(); sequence = 0;
  app = createAppServer({ organizerCode: 'TESTHOSTCODE', clock: timer.clock, scareRandomIndex: () => 0 });
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

function catalog(socket: Client, input: CatalogInput): Promise<CatalogReply> { return new Promise((resolve, reject) => socket.timeout(2000).emit('catalog:command', input, (error, reply) => error ? reject(error) : resolve(reply))); }
it.each(['catalog:command', 'lobby:sync'])('rejects unserializable raw %s packets and keeps serving clients', async command => {
  const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`);
  // Send encoded JSON directly: Socket.IO's client encoder would overflow before delivery.
  const nested = '{"toJSON":null,"a":'.repeat(12000) + '0' + '}'.repeat(12000);
  const packet = `420[${JSON.stringify(command)},{"action":"read","extra":${nested}}]`;
  try {
    const reply = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Missing invalid-payload acknowledgment')), 2000);
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebSocket failed')); });
      socket.addEventListener('message', event => {
        const data = String(event.data);
        if (data.startsWith('0')) socket.send('40');
        else if (data.startsWith('40')) socket.send(packet);
        else if (data === '2') socket.send('3');
        else if (data.startsWith('430')) { clearTimeout(timeout); resolve(JSON.parse(data.slice(3))[0]); }
      });
    });
    expect(reply).toEqual({ ok: false, error: 'INVALID_INPUT' });
    const host = await connect();
    expect(await send(host, 'organizer:authorize', { code: 'TESTHOSTCODE' })).toMatchObject({ ok: true });
  } finally { socket.close(); }
});
it('isolates the private bank, imports over 16 KiB, deduplicates and enforces phase/revision locks', async () => {
  const { host, phones } = await setup(); const other = await connect(), anonymous = await connect();
  value(await send(other, 'organizer:authorize', { code: 'TESTHOSTCODE' }));
  expect(await catalog(anonymous, { action: 'read' })).toEqual({ ok: false, error: 'FORBIDDEN' });
  expect(await catalog(phones[0], { action: 'read' })).toEqual({ ok: false, error: 'FORBIDDEN' });
  let read = await catalog(host, { action: 'read' }); if (!read.ok) throw Error();
  expect(read.catalog.file.entries).toHaveLength(90); expect(read.catalog.editable).toBe(false);
  const entry = { ...read.catalog.file.entries[0], enabled: false };
  expect(await catalog(host, { action: 'save', revision: 0, requestId: 'locked-save-command', entry })).toEqual({ ok: false, error: 'CATALOG_LOCKED' });
  const room = await current(host);
  value(await send(host, 'deal:cancel', dealBase(room)));
  read = await catalog(host, { action: 'read' }); if (!read.ok) throw Error();
  const command = { action: 'import', revision: read.catalog.revision, requestId: 'large-import-command', file: read.catalog.file } as const;
  expect(Buffer.byteLength(JSON.stringify(command))).toBeGreaterThan(16384);
  expect(await catalog(host, command)).toMatchObject({ ok: true, catalog: { revision: 1 } });
  expect(await catalog(host, command)).toMatchObject({ ok: true, catalog: { revision: 1 } });
  expect(await catalog(other, { action: 'save', revision: 0, requestId: 'stale-save-command', entry })).toEqual({ ok: false, error: 'STALE_CATALOG' });
  expect(await catalog(host, { action: 'save', revision: 1, requestId: 'disable-save-command', entry })).toMatchObject({ ok: true, catalog: { revision: 2 } });
  for (const phone of phones) { const v = value(await send(phone, 'lobby:sync', {})); expect(JSON.stringify(v)).not.toContain('pomekhi.cards'); }
  const snapshot = value(await send(host, 'lobby:sync', {})); expect(JSON.stringify(snapshot)).not.toContain('pomekhi.cards');
  const oversized = { roomId: room.id, extra: 'x'.repeat(20000) };
  expect(await send(host, 'room:close', oversized)).toEqual({ ok: false, error: 'INVALID_INPUT' });
  value(await send(host, 'room:close', { roomId: room.id })); value(await send(host, 'room:create', {}));
  const after = await catalog(other, { action: 'read' }); expect(after).toMatchObject({ ok: true, catalog: { revision: 2 } });
});
it('rejects impossible late admission without a slot, assignment or history mutation', async () => {
  const { host, phones, room } = await setup();
  value(await send(host, 'deal:cancel', dealBase(await current(host))));
  const read = await catalog(host, { action: 'read' }); if (!read.ok) throw Error();
  // Exactly four exorcists and three possessed plus one spare of each role.
  const used = new Map<string, number>();
  const entries = read.catalog.file.entries.map(entry => {
    const limit = entry.card.role === 'possessed' ? 4 : 5, key = entry.card.role;
    const count = used.get(key) ?? 0; const enabled = entry.card.difficulty === 1 && count < limit;
    if (enabled) used.set(key, count + 1); return { ...entry, enabled };
  });
  expect((await catalog(host, { action: 'import', revision: 0, requestId: 'limited-bank-import', file: { ...read.catalog.file, entries } })).ok).toBe(true);
  value(await send(host, 'deal:create', { ...dealBase(await current(host)), possessedCount: 3 }));
  const before = await current(host), own = value(await send(phones[0], 'lobby:sync', {}));
  const late = await connect(); expect(await send(late, 'player:join', { roomCode: room.code, name: 'Late', resumeKey: 'a'.repeat(64) })).toEqual({ ok: false, error: 'CARD_POOL_INSUFFICIENT' });
  const after = await current(host); expect(after.players).toEqual(before.players); expect(after.dealing).toEqual(before.dealing);
  expect(value(await send(phones[0], 'lobby:sync', {}))).toEqual(own);
});
