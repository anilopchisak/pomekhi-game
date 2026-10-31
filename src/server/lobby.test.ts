import { describe, expect, it } from 'vitest';
import { createLobby, generateOrganizerCode } from './lobby.js';
import type { LobbyReply, LobbyView } from '../shared/protocol.js';

const organizerCode = 'ABCDEFGHJKLM';
const key = (value = 1) => value.toString(16).padStart(64, '0');
function value(reply: LobbyReply): LobbyView {
  if (!reply.ok) throw new Error(reply.error);
  return reply.view;
}
function setup() {
  let id = 0, code = 0;
  const lobby = createLobby({ organizerCode, generateId: () => `id-${++id}`, generateRoomCode: () => String.fromCharCode(65 + code++).repeat(6) });
  value(lobby.execute('host', 'organizer:authorize', { code: organizerCode }));
  const view = value(lobby.execute('host', 'room:create', {}));
  if (view.kind !== 'organizer' || !view.room) throw new Error('Missing room');
  const room = view.room;
  const join = (connection = 'phone', name = 'Полина', resumeKey = key()) => lobby.execute(connection, 'player:join', { roomCode: room.code, name, resumeKey });
  return { lobby, room, join };
}

describe('authoritative lobby', () => {
  it('generates a 12-character organizer credential', () => {
    expect(generateOrganizerCode()).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    expect(generateOrganizerCode()).not.toBe(generateOrganizerCode());
  });
  it('requires organizer authorization for every control command', () => {
    const { lobby, room, join } = setup(); join();
    for (const connection of ['anonymous', 'phone']) {
      expect(lobby.execute(connection, 'room:create', {})).toEqual({ ok: false, error: 'FORBIDDEN' });
      expect(lobby.execute(connection, 'room:close', { roomId: room.id })).toEqual({ ok: false, error: 'FORBIDDEN' });
      expect(lobby.execute(connection, 'player:remove', { roomId: room.id, playerId: 'x' })).toEqual({ ok: false, error: 'FORBIDDEN' });
    }
    expect(lobby.execute('other', 'organizer:authorize', { code: 'WRONGWRONG12' })).toEqual({ ok: false, error: 'INVALID_ORGANIZER_CODE' });
    expect(lobby.viewFor('other')).toBeUndefined();
  });
  it('creates once, starts a distinct later room and rejects stale commands and keys', () => {
    const { lobby, room, join } = setup(); join();
    expect(value(lobby.execute('host', 'room:create', {}))).toMatchObject({ room: { id: room.id } });
    value(lobby.execute('host', 'room:close', { roomId: room.id }));
    expect(lobby.viewFor('phone')).toMatchObject({ kind: 'ended', reason: 'closed' });
    const next = value(lobby.execute('host', 'room:create', {}));
    expect(next).not.toMatchObject({ room: { id: room.id } });
    expect(next).not.toMatchObject({ room: { code: room.code } });
    expect(lobby.execute('host', 'room:close', { roomId: room.id })).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(lobby.execute('new', 'player:resume', { roomCode: room.code, resumeKey: key() })).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
  });
  it('normalizes names, rejects case-insensitive duplicates and preserves Unicode limits', () => {
    const { join } = setup();
    expect(value(join('a', '  Анна   Мария  ', key(1)))).toMatchObject({ room: { players: [{ name: 'Анна Мария' }] } });
    expect(join('b', 'анна мария', key(2))).toEqual({ ok: false, error: 'NAME_TAKEN' });
    expect(join('b', '👻'.repeat(24), key(2)).ok).toBe(true);
    expect(join('c', '👻'.repeat(25), key(3))).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
  it.each(['', '   ', 'a'.repeat(25), 'bad\u0000name'])('rejects invalid name %j', name => {
    expect(setup().join('a', name)).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
  it('retains offline slots, caps membership at 12 and releases a removed slot', () => {
    const { lobby, room, join } = setup();
    for (let n = 1; n <= 12; n++) { value(join(`p${n}`, `Игрок ${n}`, key(n))); lobby.disconnect(`p${n}`); }
    expect(join('extra', 'Лишний', key(13))).toEqual({ ok: false, error: 'ROOM_FULL' });
    const host = lobby.viewFor('host');
    if (host?.kind !== 'organizer') throw new Error('Missing host');
    value(lobby.execute('host', 'player:remove', { roomId: room.id, playerId: host.room!.players[0].id }));
    expect(join('extra', 'Замена', key(13)).ok).toBe(true);
    expect(join('old', 'Игрок 1', key(1))).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
  });
  it('retries a lost join acknowledgement without duplicating membership', () => {
    const { lobby, join } = setup();
    const first = value(join());
    const second = value(join('retry', 'Другое имя'));
    expect(second).toMatchObject({ playerId: first.kind === 'player' ? first.playerId : undefined, room: { players: [{ name: 'Полина' }] } });
    expect(lobby.viewFor('host')).toMatchObject({ room: { players: [{ online: true }] } });
  });
  it('resumes one identity, tracks all tabs and revokes every tab on leave', () => {
    const { lobby, room, join } = setup();
    const joined = value(join());
    const resumed = value(lobby.execute('tab', 'player:resume', { roomCode: room.code, resumeKey: key() }));
    expect(resumed.kind === 'player' && joined.kind === 'player' && resumed.playerId).toBe(joined.kind === 'player' && joined.playerId);
    lobby.disconnect('phone');
    expect(lobby.viewFor('host')).toMatchObject({ room: { players: [{ online: true }] } });
    lobby.disconnect('tab');
    expect(lobby.viewFor('host')).toMatchObject({ room: { players: [{ online: false }] } });
    value(lobby.execute('tab', 'player:resume', { roomCode: room.code, resumeKey: key() }));
    value(lobby.execute('tab', 'player:leave', { roomId: room.id }));
    expect(lobby.viewFor('host')).toMatchObject({ room: { players: [] } });
    expect(lobby.execute('phone', 'player:resume', { roomCode: room.code, resumeKey: key() })).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
  });
  it('does not resume an identity by name or across server instances', () => {
    const first = setup(), second = setup(); first.join();
    expect(first.join('impostor', 'Полина', key(2))).toEqual({ ok: false, error: 'NAME_TAKEN' });
    expect(second.lobby.execute('phone', 'player:resume', { roomCode: first.room.code, resumeKey: key() })).toEqual({ ok: false, error: 'SESSION_EXPIRED' });
    expect(second.lobby.viewFor('host')).toMatchObject({ room: { players: [] } });
  });
  it('builds detached explicit projections with no credentials', () => {
    const { lobby, join } = setup(); join();
    const view = lobby.viewFor('host')!;
    const encoded = JSON.stringify(view);
    expect(encoded).not.toContain(key()); expect(encoded).not.toContain(organizerCode);
    expect(encoded).not.toContain('connections'); expect(lobby.viewFor('unknown')).toBeUndefined();
    if (view.kind === 'organizer') view.room!.players[0].name = 'tampered';
    expect(lobby.viewFor('host')).toMatchObject({ room: { players: [{ name: 'Полина' }] } });
  });
  it.each([null, [], 'bad', {}, { roomCode: 'AAAAAA', resumeKey: 'short' }, { roomCode: 123, resumeKey: key() }])('rejects malformed join input %j', payload => {
    expect(setup().lobby.execute('x', 'player:join', payload)).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});
