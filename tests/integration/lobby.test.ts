import { afterEach, beforeEach, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createAppServer } from '../../src/server/app.js';
import type { ClientToServerEvents, LobbyCommand, LobbyInputs, LobbyReply, LobbyView, RoomSnapshot, ServerToClientEvents } from '../../src/shared/protocol.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const organizerCode = 'ABCDEFGHJKLM';
const key = (n = 1) => n.toString(16).padStart(64, '0');
let app: ReturnType<typeof createAppServer>;
let origin: string;
const sockets: Client[] = [];
beforeEach(async () => {
  app = createAppServer({ organizerCode });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { for (const socket of sockets.splice(0)) socket.disconnect(); await app.close(); });
async function connect() {
  const socket: Client = io(origin, { autoConnect: false, forceNew: true, reconnection: false });
  sockets.push(socket);
  const ready = new Promise<void>((resolve, reject) => { socket.once('server:ready', () => resolve()); socket.once('connect_error', reject); });
  socket.connect(); await ready; return socket;
}
function send<C extends LobbyCommand>(socket: Client, command: C, input: LobbyInputs[C]): Promise<LobbyReply> {
  return new Promise((resolve, reject) => {
    const emit = socket.timeout(2000).emit.bind(socket) as (event: C, input: LobbyInputs[C], ack: (error: Error | null, reply: LobbyReply) => void) => void;
    emit(command, input, (error, reply) => error ? reject(error) : resolve(reply));
  });
}
function value(reply: LobbyReply) { if (!reply.ok) throw new Error(reply.error); return reply.view; }
async function hostRoom() {
  const host = await connect();
  value(await send(host, 'organizer:authorize', { code: organizerCode }));
  const view = value(await send(host, 'room:create', {}));
  if (view.kind !== 'organizer' || !view.room) throw new Error('No room');
  return { host, room: view.room };
}
function nextView(socket: Client, predicate: (view: LobbyView) => boolean) {
  return new Promise<LobbyView>(resolve => {
    const listener = (view: LobbyView) => { if (predicate(view)) { socket.off('lobby:state', listener); resolve(view); } };
    socket.on('lobby:state', listener);
  });
}
async function join(socket: Client, room: RoomSnapshot, n = 1) {
  return value(await send(socket, 'player:join', { roomCode: room.code, name: `Игрок ${n}`, resumeKey: key(n) }));
}

it('connects seven independent players, protects controls and sends no private keys', async () => {
  const { host, room } = await hostRoom();
  const anonymous = await connect();
  const anonymousViews: LobbyView[] = [];
  anonymous.on('lobby:state', view => anonymousViews.push(view));
  const roomFull = nextView(host, view => view.kind === 'organizer' && view.room?.players.length === 7);
  const phones = await Promise.all(Array.from({ length: 7 }, () => connect()));
  await Promise.all(phones.map((phone, index) => join(phone, room, index + 1)));
  const snapshot = await roomFull;
  expect(snapshot).toMatchObject({ room: { capacity: 12, players: expect.arrayContaining([{ id: expect.any(String), name: 'Игрок 7', online: true }]) } });
  expect(await send(phones[0], 'room:close', { roomId: room.id })).toEqual({ ok: false, error: 'FORBIDDEN' });
  expect(await send(anonymous, 'player:remove', { roomId: room.id, playerId: 'x' })).toEqual({ ok: false, error: 'FORBIDDEN' });
  expect(anonymousViews).toEqual([]);
  const serialized = JSON.stringify(snapshot);
  for (let n = 1; n <= 7; n++) expect(serialized).not.toContain(key(n));
  expect(serialized).not.toContain(organizerCode);
});

it('recovers a lost join acknowledgement and preserves identity across refresh and two tabs', async () => {
  const { host, room } = await hostRoom();
  const first = await connect();
  // Ignore the reply, then retry with the persisted pre-join key on a new connection.
  await send(first, 'player:join', { roomCode: room.code, name: 'Игрок 1', resumeKey: key() });
  const retry = await connect(); const retried = await join(retry, room);
  expect(retried).toMatchObject({ room: { players: [{ name: 'Игрок 1', online: true }] } });
  const tab = await connect();
  const resumed = value(await send(tab, 'player:resume', { roomCode: room.code, resumeKey: key() }));
  expect(resumed.kind === 'player' && resumed.playerId).toBe(retried.kind === 'player' && retried.playerId);
  first.disconnect(); retry.disconnect();
  const stillOnline = value(await send(host, 'room:create', {}));
  expect(stillOnline).toMatchObject({ room: { players: [{ online: true }] } });
  const offline = nextView(host, view => view.kind === 'organizer' && view.room?.players[0]?.online === false);
  tab.disconnect(); await offline;
  const refreshed = await connect();
  expect(value(await send(refreshed, 'player:resume', { roomCode: room.code, resumeKey: key() }))).toMatchObject({ room: { players: [{ online: true }] } });
  expect(await send(await connect(), 'player:join', { roomCode: room.code, name: 'ИГРОК 1', resumeKey: key(2) })).toEqual({ ok: false, error: 'NAME_TAKEN' });
});

it('revokes every tab on removal and leave, closes rooms and rejects an old close', async () => {
  const { host, room } = await hostRoom();
  const phone = await connect(), tab = await connect();
  const joined = await join(phone, room);
  if (joined.kind !== 'player') throw new Error('No player');
  value(await send(tab, 'player:resume', { roomCode: room.code, resumeKey: key() }));
  const removed = nextView(phone, view => view.kind === 'ended' && view.reason === 'removed');
  const tabRemoved = nextView(tab, view => view.kind === 'ended' && view.reason === 'removed');
  value(await send(host, 'player:remove', { roomId: room.id, playerId: joined.playerId }));
  await Promise.all([removed, tabRemoved]);
  expect(await send(phone, 'player:resume', { roomCode: room.code, resumeKey: key() })).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
  await join(phone, room, 2);
  value(await send(phone, 'player:leave', { roomId: room.id }));
  expect(await send(phone, 'player:resume', { roomCode: room.code, resumeKey: key(2) })).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
  await join(phone, room, 3);
  const closed = nextView(phone, view => view.kind === 'ended' && view.reason === 'closed');
  value(await send(host, 'room:close', { roomId: room.id })); await closed;
  const next = value(await send(host, 'room:create', {}));
  expect(next).not.toMatchObject({ room: { id: room.id } });
  expect(await send(host, 'room:close', { roomId: room.id })).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  expect(await send(phone, 'player:join', { roomCode: room.code, name: 'Снова', resumeKey: key(4) })).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
});

it('validates untyped network data and rejects old sessions after process state is lost', async () => {
  const { room } = await hostRoom(); const phone = await connect(); await join(phone, room);
  expect(await send(phone, 'player:join', null as unknown as LobbyInputs['player:join'])).toEqual({ ok: false, error: 'INVALID_INPUT' });
  await app.close();
  app = createAppServer({ organizerCode: 'NEWCODE23456' });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  origin = `http://127.0.0.1:${address.port}`;
  const refreshed = await connect();
  expect(await send(refreshed, 'player:resume', { roomCode: room.code, resumeKey: key() })).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
  expect(await send(refreshed, 'organizer:authorize', { code: organizerCode })).toEqual({ ok: false, error: 'INVALID_ORGANIZER_CODE' });
});
