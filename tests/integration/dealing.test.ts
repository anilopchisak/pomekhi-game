import { afterEach, beforeEach, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAppServer } from '../../src/server/app.js';
import { CARD_BANK } from '../../src/server/cards.js';
import type { ClientToServerEvents, LobbyCommand, LobbyInputs, LobbyReply, LobbyView, RoomSnapshot, ServerToClientEvents } from '../../src/shared/protocol.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let app: ReturnType<typeof createAppServer>, origin: string;
const sockets: Client[] = [];
let requestSequence = 0;
beforeEach(async () => {
  app = createAppServer({ organizerCode: 'TESTHOSTCODE', clientDirectory: resolve('dist/client') });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  origin = `http://127.0.0.1:${address.port}`; requestSequence = 0;
});
afterEach(async () => { for (const socket of sockets.splice(0)) socket.disconnect(); await app.close(); });
async function connect() {
  const socket: Client = io(origin, { autoConnect: false, forceNew: true, reconnection: false }); sockets.push(socket);
  const ready = new Promise<void>((resolve, reject) => { socket.once('server:ready', () => resolve()); socket.once('connect_error', reject); });
  socket.connect(); await ready; return socket;
}
function send<C extends LobbyCommand>(socket: Client, command: C, input: LobbyInputs[C]): Promise<LobbyReply> {
  return new Promise((resolve, reject) => {
    const emit = socket.timeout(2000).emit.bind(socket) as (command: C, input: LobbyInputs[C], ack: (error: Error | null, reply: LobbyReply) => void) => void;
    emit(command, input, (error, reply) => error ? reject(error) : resolve(reply));
  });
}
function value(reply: LobbyReply) { if (!reply.ok) throw new Error(reply.error); return reply.view; }
function base(room: RoomSnapshot) { return { roomId: room.id, requestId: `request-${++requestSequence}`, dealVersion: room.dealing.version, dealId: room.dealing.dealId }; }
async function hostRoom(n = 7) {
  const host = await connect(); value(await send(host, 'organizer:authorize', { code: 'TESTHOSTCODE' }));
  const view = value(await send(host, 'room:create', {})); if (view.kind !== 'organizer' || !view.room) throw new Error('Missing room');
  const phones = await Promise.all(Array.from({ length: n }, () => connect()));
  const sessions = phones.map((_, i) => ({ roomCode: view.room!.code, name: `Player ${i}`, resumeKey: (i + 1).toString(16).padStart(64, '0') }));
  for (const [i, phone] of phones.entries()) value(await send(phone, 'player:join', sessions[i]));
  return { host, room: view.room, phones, sessions };
}
async function player(socket: Client, session: LobbyInputs['player:resume']) {
  const view = value(await send(socket, 'player:resume', session)); if (view.kind !== 'player') throw new Error('Missing player'); return view;
}
function noCards(view: LobbyView) {
  const text = JSON.stringify(view);
  for (const card of CARD_BANK) expect(text).not.toContain(card.title);
  expect(text).not.toContain('"card"'); expect(text).not.toContain('"role"');
}

it('deals seven private cards with an offline member and projects no cards to the organizer', async () => {
  const { host, room, phones, sessions } = await hostRoom(); phones[6].disconnect();
  const dealt = value(await send(host, 'deal:create', { ...base(room), possessedCount: 3 })); noCards(dealt);
  const views = await Promise.all(phones.slice(0, 6).map((phone, i) => player(phone, sessions[i])));
  const reconnected = await connect(); views.push(await player(reconnected, sessions[6]));
  expect(views.filter(view => view.assignment!.card.role === 'possessed')).toHaveLength(3);
  expect(new Set(views.map(view => view.assignment!.card.id)).size).toBe(7);
  for (const own of views) {
    for (const other of views.filter(view => view.playerId !== own.playerId)) expect(JSON.stringify(own)).not.toContain(other.assignment!.card.title);
  }
  expect(await send(phones[0], 'deal:shuffle', { ...base(views[0].room), possessedCount: 3 })).toEqual({ ok: false, error: 'FORBIDDEN' });
  const anonymous = await connect();
  expect(await send(anonymous, 'card:ready', { ...base(views[0].room), assignmentId: views[0].assignment!.id, ready: true })).toEqual({ ok: false, error: 'FORBIDDEN' });
});

it('retries acknowledged changes once and rejects stale intent, including after host reconnect', async () => {
  const { host, room, phones, sessions } = await hostRoom();
  const command = { ...base(room), possessedCount: 3 };
  const first = value(await send(host, 'deal:create', command));
  const reordered = Object.fromEntries(Object.entries(command).reverse()) as typeof command;
  expect(value(await send(host, 'deal:create', reordered))).toMatchObject({ room: { dealing: { dealId: first.kind === 'organizer' ? first.room!.dealing.dealId : undefined } } });
  const own = await player(phones[0], sessions[0]);
  const refreshedHost = await connect(); value(await send(refreshedHost, 'organizer:authorize', { code: 'TESTHOSTCODE' }));
  expect(value(await send(refreshedHost, 'deal:create', command))).toMatchObject({ room: { dealing: { dealId: own.room.dealing.dealId } } });
  const replacement = { ...base(own.room), playerId: own.playerId, assignmentId: own.assignment!.id };
  value(await send(host, 'deal:replace', replacement)); const replaced = await player(phones[0], sessions[0]);
  value(await send(refreshedHost, 'deal:replace', replacement));
  expect((await player(phones[0], sessions[0])).assignment).toEqual(replaced.assignment);
  expect(await send(host, 'deal:replace', { ...replacement, requestId: 'stale-replace' })).toEqual({ ok: false, error: 'STALE_CARD' });
  const shuffle = { ...base(own.room), possessedCount: 3 };
  const shuffled = value(await send(host, 'deal:shuffle', shuffle));
  value(await send(host, 'deal:shuffle', shuffle));
  const current = await player(phones[0], sessions[0]);
  expect(current.room.dealing.dealId).not.toBe(own.room.dealing.dealId);
  expect(shuffled).toMatchObject({ room: { dealing: { dealId: current.room.dealing.dealId } } });
  expect(await send(phones[0], 'card:ready', { ...base(own.room), assignmentId: own.assignment!.id, ready: true })).toEqual({ ok: false, error: 'STALE_DEAL' });
  expect(first.kind).toBe('organizer');
});

it('keeps per-player readiness and replacement requests through tabs and disconnects', async () => {
  const { host, room, phones, sessions } = await hostRoom();
  value(await send(host, 'deal:create', { ...base(room), possessedCount: 3 }));
  let own = await player(phones[0], sessions[0]); const other = await player(phones[1], sessions[1]);
  value(await send(phones[0], 'card:ready', { ...base(own.room), assignmentId: own.assignment!.id, ready: true }));
  value(await send(phones[1], 'card:ready', { ...base(other.room), assignmentId: other.assignment!.id, ready: true }));
  const tab = await connect(); own = await player(tab, sessions[0]); expect(own.assignment!.ready).toBe(true);
  expect(await send(tab, 'card:ready', { ...base(own.room), assignmentId: other.assignment!.id, ready: false })).toEqual({ ok: false, error: 'STALE_CARD' });
  const request = { ...base(own.room), assignmentId: own.assignment!.id, requested: true };
  value(await send(tab, 'card:request', request)); value(await send(tab, 'card:request', request));
  own = await player(phones[0], sessions[0]); expect(own.assignment).toMatchObject({ ready: false, replacementRequested: true });
  expect(await send(tab, 'card:ready', { ...base(own.room), assignmentId: own.assignment!.id, ready: true })).toEqual({ ok: false, error: 'REPLACEMENT_PENDING' });
  value(await send(host, 'deal:replace', { ...base(own.room), playerId: own.playerId, assignmentId: own.assignment!.id }));
  const replaced = await player(tab, sessions[0]); expect(replaced.assignment!.card.role).toBe(own.assignment!.card.role);
  expect(replaced.assignment!.card.id).not.toBe(own.assignment!.card.id);
  expect((await player(phones[1], sessions[1])).assignment).toEqual({ ...other.assignment, ready: true });
  phones[0].disconnect(); tab.disconnect();
  const restored = await player(await connect(), sessions[0]); expect(restored.assignment).toEqual(replaced.assignment);
});

it('joins late once, preserves others on departure and cancels without removing membership', async () => {
  const { host, room, phones, sessions } = await hostRoom(4);
  value(await send(host, 'deal:create', { ...base(room), possessedCount: 2 }));
  const before = await Promise.all(phones.map((phone, i) => player(phone, sessions[i])));
  const late = await connect(); const session = { roomCode: room.code, name: 'Late', resumeKey: 'f'.repeat(64) };
  const joined = value(await send(late, 'player:join', session));
  expect(joined).toMatchObject({ assignment: { card: { role: 'exorcist' }, ready: false } });
  const repeated = value(await send(late, 'player:join', session)); expect(repeated).toMatchObject({ assignment: joined.kind === 'player' ? joined.assignment : undefined });
  for (let i = 0; i < 4; i++) expect((await player(phones[i], sessions[i])).assignment).toEqual(before[i].assignment);
  value(await send(phones[0], 'player:leave', { roomId: room.id }));
  for (let i = 1; i < 4; i++) expect((await player(phones[i], sessions[i])).assignment).toEqual(before[i].assignment);
  const current = await player(late, session);
  const cancelled = value(await send(host, 'deal:cancel', base(current.room)));
  expect(cancelled).toMatchObject({ room: { players: expect.any(Array), dealing: { phase: 'lobby', assignments: [] } } });
  expect((await player(late, session)).assignment).toBeNull();
  expect(await send(phones[0], 'player:resume', sessions[0])).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
});

it('rejects invalid or conflicting commands without changing the deal', async () => {
  const { host, room } = await hostRoom(); const command = { ...base(room), possessedCount: 3 };
  expect(await send(host, 'deal:create', { ...command, possessedCount: 4 })).toEqual({ ok: false, error: 'INVALID_COMPOSITION' });
  const good = value(await send(host, 'deal:create', command));
  expect(await send(host, 'deal:create', { ...command, possessedCount: 2 })).toEqual({ ok: false, error: 'INVALID_INPUT' });
  expect(await send(host, 'deal:cancel', null as unknown as LobbyInputs['deal:cancel'])).toEqual({ ok: false, error: 'INVALID_INPUT' });
  noCards(good);
});

it('ignores unrelated fields in a delivered command without replaying an earlier readiness choice', async () => {
  const { host, room, phones, sessions } = await hostRoom(4);
  value(await send(host, 'deal:create', { ...base(room), possessedCount: 2 }));
  const own = await player(phones[0], sessions[0]);
  const ready = { ...base(own.room), assignmentId: own.assignment!.id, ready: true };
  const extended = { ...ready, possessedCount: 'x'.repeat(12 * 1024) };
  value(await send(phones[0], 'card:ready', extended));
  const changed = value(await send(phones[0], 'card:ready', { ...ready, requestId: 'later-ready', ready: false }));
  expect(value(await send(phones[0], 'card:ready', ready))).toEqual(changed);
  expect(await send(phones[0], 'card:ready', { ...ready, ready: false })).toEqual({ ok: false, error: 'INVALID_INPUT' });
});

it('keeps the card bank out of browser assets and production HTTP', async () => {
  const files = await readdir('dist/client/assets');
  const browserAssets = (await Promise.all(files.filter(path => path.endsWith('.js') || path.endsWith('.map')).map(path => readFile(`dist/client/assets/${path}`, 'utf8')))).join('\n');
  for (const card of CARD_BANK) expect(browserAssets).not.toContain(card.title);
  for (const path of ['/src/server/cards.ts', '/dist/server/cards.js', '/@fs/' + resolve('src/server/cards.ts') + '?raw']) {
    const response = await fetch(origin + path); expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  }
});
