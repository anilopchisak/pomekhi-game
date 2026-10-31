import { expect, it } from 'vitest';
import { createLobby } from './lobby.js';

function readingRoom() {
  let id = 0, code = 0;
  const lobby = createLobby({
    organizerCode: 'HOST', generateId: () => `id-${++id}`,
    generateRoomCode: () => String.fromCharCode(65 + code++).repeat(6), randomIndex: () => 0,
  });
  lobby.execute('host', 'organizer:authorize', { code: 'HOST' });
  lobby.execute('host', 'room:create', {});
  const host = lobby.viewFor('host');
  if (host?.kind !== 'organizer' || !host.room) throw new Error('Missing room');
  const room = host.room;
  for (let i = 0; i < 4; i++) {
    const reply = lobby.execute(`p${i}`, 'player:join', {
      roomCode: room.code, name: `Player ${i}`, resumeKey: String(i + 1).repeat(64),
    });
    expect(reply.ok).toBe(true);
  }
  const create = { roomId: room.id, dealId: null, dealVersion: 0, requestId: 'initial-deal', possessedCount: 2 };
  expect(lobby.execute('host', 'deal:create', create).ok).toBe(true);
  const player = lobby.viewFor('p0');
  if (player?.kind !== 'player' || !player.assignment) throw new Error('Missing assignment');
  const ready = {
    roomId: room.id, dealId: player.room.dealing.dealId, dealVersion: player.room.dealing.version,
    assignmentId: player.assignment.id, requestId: 'first-ready', ready: true,
  };
  return { lobby, room, player, create, ready };
}

it('ignores unrelated payload fields in replay fingerprints and rejects changed command fields', () => {
  const { lobby, ready } = readingRoom();
  expect(lobby.execute('p0', 'card:ready', { ...ready, possessedCount: 'x'.repeat(12 * 1024) }).ok).toBe(true);
  const before = lobby.viewFor('p0');
  expect(lobby.execute('p0', 'card:ready', { ...ready, possessedCount: { unrelated: true } }).ok).toBe(true);
  expect(lobby.execute('p0', 'card:ready', { ...ready, ready: false })).toEqual({ ok: false, error: 'INVALID_INPUT' });
  expect(lobby.viewFor('p0')).toEqual(before);
});

it('caps a player journal before mutation while preserving retries across tabs and other principals', () => {
  const { lobby, room, player, ready } = readingRoom();
  expect(lobby.execute('p0', 'card:ready', ready).ok).toBe(true);
  for (let i = 1; i < 1024; i++) {
    expect(lobby.execute('p0', 'card:ready', { ...ready, requestId: `fill-ready-${i}`, ready: false }).ok).toBe(true);
  }
  const before = lobby.viewFor('p0');
  const overflow = { ...ready, requestId: 'overflow-ready' };
  expect(lobby.execute('p0', 'card:ready', overflow)).toEqual({ ok: false, error: 'REQUEST_LIMIT' });
  for (let i = 0; i < 20; i++) {
    expect(lobby.execute('p0', 'card:request', { ...ready, requestId: `overflow-request-${i}`, requested: true })).toEqual({ ok: false, error: 'REQUEST_LIMIT' });
  }
  expect(lobby.viewFor('p0')).toEqual(before);
  expect(lobby.execute('p0', 'card:ready', ready).ok).toBe(true);
  expect(lobby.viewFor('p0')).toEqual(before);
  expect(lobby.execute('tab', 'player:resume', { roomCode: room.code, resumeKey: '1'.repeat(64) }).ok).toBe(true);
  expect(lobby.execute('tab', 'card:ready', overflow)).toEqual({ ok: false, error: 'REQUEST_LIMIT' });
  expect(lobby.execute('tab', 'card:ready', ready).ok).toBe(true);
  const other = lobby.viewFor('p1');
  if (other?.kind !== 'player' || !other.assignment) throw new Error('Missing other player');
  expect(lobby.execute('p1', 'card:ready', { ...ready, assignmentId: other.assignment.id }).ok).toBe(true);
  expect(lobby.execute('host', 'deal:replace', { ...ready, playerId: player.playerId }).ok).toBe(true);
  const replaced = lobby.viewFor('p0');
  expect(lobby.execute('tab', 'card:ready', ready).ok).toBe(true);
  expect(lobby.viewFor('p0')).toEqual(replaced);
});

it('caps organizer requests without evicting old card changes and releases journals with the room', () => {
  const { lobby, room, player, create, ready } = readingRoom();
  const replace = { ...ready, playerId: player.playerId, requestId: 'replace-first' };
  expect(lobby.execute('host', 'deal:replace', replace).ok).toBe(true);
  for (let i = 2; i < 1024; i++) {
    const current = lobby.viewFor('p0');
    if (current?.kind !== 'player' || !current.assignment) throw new Error('Missing assignment');
    expect(lobby.execute('host', 'deal:replace', { ...replace, assignmentId: current.assignment.id, requestId: `replace-${i}` }).ok).toBe(true);
  }
  const before = lobby.viewFor('host');
  expect(lobby.execute('host', 'deal:cancel', { ...ready, requestId: 'cancel-overflow' })).toEqual({ ok: false, error: 'REQUEST_LIMIT' });
  expect(lobby.viewFor('host')).toEqual(before);
  expect(lobby.execute('panel', 'organizer:authorize', { code: 'HOST' }).ok).toBe(true);
  expect(lobby.execute('panel', 'deal:create', create).ok).toBe(true);
  expect(lobby.execute('panel', 'deal:replace', replace).ok).toBe(true);
  const after = lobby.viewFor('host');
  expect(after?.kind === 'organizer' && after.room?.dealing).toEqual(before?.kind === 'organizer' && before.room?.dealing);
  expect(lobby.execute('host', 'room:close', { roomId: room.id }).ok).toBe(true);
  expect(lobby.execute('host', 'room:create', {}).ok).toBe(true);
  const next = lobby.viewFor('host');
  if (next?.kind !== 'organizer' || !next.room) throw new Error('Missing next room');
  for (let i = 0; i < 4; i++) {
    expect(lobby.execute(`new${i}`, 'player:join', { roomCode: next.room.code, name: `Player ${i}`, resumeKey: String(i + 1).repeat(64) }).ok).toBe(true);
  }
  expect(lobby.execute('host', 'deal:create', { ...create, roomId: next.room.id }).ok).toBe(true);
});
