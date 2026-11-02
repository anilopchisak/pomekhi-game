import { afterEach, beforeEach, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createAppServer } from '../../src/server/app.js';
import { controlledClock } from '../helpers/game-clock.js';
import type { ClientToServerEvents, LobbyCommand, LobbyInputs, LobbyReply, LobbyView, PhoneScare, RoomSnapshot, ServerToClientEvents } from '../../src/shared/protocol.js';

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
async function start(host: Client) { return value(await send(host, 'round:start', { ...base(await current(host)), confirmWarnings: true })); }

async function advance(seconds: number, host: Client) { for (let i = 0; i < seconds; i++) { timer.advance(1000); await current(host); } }
it('delivers one personal effect to each opted-in player across seven real sockets and never to host/anonymous', async () => {
  const { host, phones } = await setup(); const anonymous = await connect();
  const all = new Map<Client, PhoneScare[]>();
  for (const socket of [host, anonymous, ...phones]) { const events: PhoneScare[] = []; all.set(socket, events); socket.on('player:scare', event => events.push(event)); }
  let room = await current(host);
  value(await send(host, 'game:configure', { ...base(room), settings: { ...room.game.settings, searchSeconds: 60, placementSeconds: 1 } }));
  for (const phone of phones) value(await send(phone, 'player:audio', { roomId: room.id, enabled: true }));
  expect(await send(anonymous, 'player:audio', { roomId: room.id, enabled: true })).toEqual({ ok: false, error: 'FORBIDDEN' });
  expect(await send(phones[0], 'organizer:atmosphere', { roomId: room.id, enabled: false })).toEqual({ ok: false, error: 'FORBIDDEN' });
  await start(host); await advance(21, host);
  for (const phone of phones) { await send(phone, 'lobby:sync', {}); expect(all.get(phone)).toHaveLength(1); expect(all.get(phone)![0]).toMatchObject({ roomId: room.id, roundId: (await current(host)).game.roundId }); }
  expect(all.get(host)).toEqual([]); expect(all.get(anonymous)).toEqual([]);
  await advance(5, host); room = await current(host);
  value(await send(host, 'round:pause', base(room))); value(await send(host, 'round:resume', { ...base(await current(host)), confirmWarnings: true }));
  await advance(5, host); for (const phone of phones) expect(all.get(phone)).toHaveLength(1);
});
it('cancels when the sound tab disconnects or the global switch changes, without retrying after resume', async () => {
  const { host, phones, sessions } = await setup(); let room = await current(host);
  value(await send(host, 'game:configure', { ...base(room), settings: { ...room.game.settings, searchSeconds: 60, placementSeconds: 1 } }));
  const events: PhoneScare[] = []; phones[0].on('player:scare', e => events.push(e));
  value(await send(phones[0], 'player:audio', { roomId: room.id, enabled: true }));
  const tab = await connect(); value(await send(tab, 'player:resume', sessions[0]));
  const tabEvents: PhoneScare[] = []; tab.on('player:scare', e => tabEvents.push(e));
  value(await send(tab, 'player:audio', { roomId: room.id, enabled: true }));
  expect(value(await send(phones[0], 'lobby:sync', {}))).toMatchObject({ audioEnabled: false });
  await start(host); await advance(1, host);
  value(await send(host, 'organizer:atmosphere', { roomId: room.id, enabled: false }));
  value(await send(host, 'organizer:atmosphere', { roomId: room.id, enabled: true }));
  await advance(21, host); expect(events).toEqual([]); expect(tabEvents).toEqual([]);
  tab.disconnect(); await current(host);
  value(await send(phones[0], 'player:audio', { roomId: room.id, enabled: true })); await advance(4, host); expect(events).toEqual([]);
  room = await current(host); const before = room.game.version;
  value(await send(phones[0], 'player:audio', { roomId: room.id, enabled: false })); expect((await current(host)).game.version).toBe(before);
});
