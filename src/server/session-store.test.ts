import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createFileSessionStore } from './session-store.js';
import { validateSession } from './session-format.js';
import { createLobby } from './lobby.js';

const empty = () => ({ schemaVersion: 3 as const, lobby: { revision: 0, usedCodes: [], room: null } });
it('atomically replaces the last checkpoint and ignores unfinished temporary files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-save-')), store = createFileSessionStore(dir);
  try {
    await store.acquire(); expect(await store.load()).toBeNull(); await store.write(empty());
    await writeFile(join(dir, 'session-crashed.tmp'), 'unfinished');
    const next = empty(); next.lobby.revision = 7; await store.write(next);
    expect(await store.load()).toEqual(next);
    expect(JSON.parse(await readFile(join(dir, 'session.json'), 'utf8'))).toEqual(next);
    expect((await readdir(dir)).filter(p => p.endsWith('.tmp'))).toEqual(['session-crashed.tmp']);
    await store.close();
    const restarted = createFileSessionStore(dir); await restarted.acquire();
    try { expect(await restarted.load()).toEqual(next); } finally { await restarted.close(); }
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
});
it('excludes another writer, including two stores in one process, and releases ownership', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-lock-')), first = createFileSessionStore(dir), other = createFileSessionStore(dir);
  try {
    await first.acquire(); await expect(other.acquire()).rejects.toThrow('Another process');
    await first.write(empty()); await first.close(); await other.acquire(); expect(await other.load()).toEqual(empty());
  } finally { await first.close(); await other.close(); await rm(dir, { recursive: true, force: true }); }
});
it('preserves damaged/incompatible files before an explicit reset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-bad-')), store = createFileSessionStore(dir);
  try {
    await store.acquire();
    for (const contents of ['{broken', '{"schemaVersion":99}']) {
      await writeFile(join(dir, 'session.json'), contents); await expect(store.load()).rejects.toThrow();
      expect(await readFile(join(dir, 'session.json'), 'utf8')).toBe(contents);
    }
    await store.preserve(); await store.write(empty());
    const copy = (await readdir(dir)).find(p => p.startsWith('session-before-reset-'))!;
    expect(await readFile(join(dir, copy), 'utf8')).toBe('{"schemaVersion":99}'); expect(await store.load()).toEqual(empty());
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
});
it('rejects incomplete state, duplicate identities, invalid cross-references and unsupported cards', () => {
  const lobby = createLobby({ organizerCode: 'ORGANIZER' });
  lobby.execute('h', 'organizer:authorize', { code: 'ORGANIZER' }); lobby.execute('h', 'room:create', {});
  const room = lobby.viewFor('h'); if (room?.kind !== 'organizer' || !room.room) throw new Error('No room');
  for (let i = 0; i < 4; i++) lobby.execute(`p${i}`, 'player:join', { roomCode: room.room.code, name: `Имя ${i}`, resumeKey: String(i).padStart(64, '0') });
  const state = () => ({ schemaVersion: 3 as const, lobby: lobby.exportState() });
  expect(validateSession(JSON.parse(JSON.stringify(state())))).toEqual(state());
  const duplicate = state(); duplicate.lobby.room!.players.push(duplicate.lobby.room!.players[0]);
  expect(() => validateSession(duplicate)).toThrow();
  const game = state(); game.lobby.room!.game.phase = 'search'; expect(() => validateSession(game)).toThrow();
  const requests = state(); requests.lobby.room!.requests = [['player:unknown', []]]; expect(() => validateSession(requests)).toThrow();
  for (const value of [null, {}, { schemaVersion: 2 }, { ...empty(), lobby: { ...empty().lobby, usedCodes: ['wrong'] } }]) expect(() => validateSession(value)).toThrow();
  const dealt = lobby.execute('h', 'deal:create', { roomId: room.room.id, requestId: 'validate-card-test', dealVersion: 0, dealId: null, possessedCount: 2 });
  expect(dealt.ok).toBe(true); const unsupported = state();
  Reflect.set(unsupported.lobby.room!.game.dealing.assignments[0][1].card, 'difficulty', 2);
  expect(() => validateSession(unsupported)).toThrow();
  lobby.dispose();
});
it('does not replace a valid file when the target cannot be atomically renamed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-write-')), store = createFileSessionStore(dir);
  try {
    await store.acquire(); await mkdir(join(dir, 'session.json'));
    await expect(store.write(empty())).rejects.toThrow();
    expect((await readdir(dir)).some(p => p.endsWith('.tmp'))).toBe(false);
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
});
