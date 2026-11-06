import { MAX_CATALOG_BYTES, standardCatalog, validateCatalogFile } from './catalog.js';
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createFileSessionStore } from './session-store.js';
import { validateSession } from './session-format.js';
import { createLobby } from './lobby.js';
import { createSession } from './session.js';
import { controlledClock } from '../../tests/helpers/game-clock.js';

const empty = () => ({ schemaVersion: 5 as const, lobby: { catalog: standardCatalog(), revision: 0, usedCodes: [], room: null } });
it('rejects expansion on import and migrates a saved bank at the canonical byte limit', async () => {
  const file = standardCatalog().file;
  file.entries = Array.from({ length: 500 }, (_, index) => ({ enabled: index !== 0, card: {
    id: `custom-${index}`, title: index === 0 ? 'Обитель' : 'Задание', role: 'exorcist', difficulty: 3,
    mission: index === 0 ? 'X' : 'X'.repeat(900),
  } }));
  let fill = MAX_CATALOG_BYTES - Buffer.byteLength(JSON.stringify(validateCatalogFile(file)));
  for (const { card } of file.entries.slice(1)) {
    if (card.role !== 'exorcist') throw Error('Invalid boundary fixture.');
    const extra = Math.min(fill, 2000 - card.mission.length);
    card.mission += 'X'.repeat(extra);
    fill -= extra;
  }
  expect(Buffer.byteLength(JSON.stringify(validateCatalogFile(file)))).toBe(MAX_CATALOG_BYTES);

  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-catalog-limit-'));
  const makeSession = () => createSession({ organizerCode: 'HOST', firstGame: true, store: createFileSessionStore(dir, true) });
  let session = makeSession();
  try {
    await session.initialize();
    await session.execute('h', 'organizer:authorize', { code: 'HOST' });
    expect(await session.catalogExecute('h', { action: 'import', revision: 0, requestId: 'catalog-limit-import', file }))
      .toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(session.viewFor('h')?.persistence?.state).toBe('ready');
    await session.close();

    await rm(join(dir, 'party-v8.json'));
    const legacy = { schemaVersion: 7, lobby: { ...empty().lobby, catalog: { revision: 4, requests: [], file } } };
    const source = JSON.stringify(legacy);
    await writeFile(join(dir, 'party-v7.json'), source);
    for (let run = 0; run < 2; run++) {
      session = makeSession();
      await session.initialize();
      await session.execute('h', 'organizer:authorize', { code: 'HOST' });
      expect(session.viewFor('h')?.persistence?.state).toBe('ready');
      const result = await session.catalogExecute('h', { action: 'read' });
      if (!result.ok) throw Error(result.error);
      expect(result.catalog.revision).toBe(4);
      const migrated = validateCatalogFile(result.catalog.file);
      expect(migrated.entries).toHaveLength(500);
      expect(migrated.entries[0]).toMatchObject({ enabled: false, card: { id: 'custom-0', difficulty: 3, mission: 'Кивни.' } });
      expect(Buffer.byteLength(JSON.stringify(migrated))).toBe(MAX_CATALOG_BYTES);
      expect(migrated.entries.slice(1)).toEqual(file.entries.slice(1));
      await session.close();
    }
    expect(await readFile(join(dir, 'party-v7.json'), 'utf8')).toBe(source);
  } finally { await session.close(); await rm(dir, { recursive: true, force: true }); }
});
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
  const state = () => ({ schemaVersion: 5 as const, lobby: lobby.exportState() });
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

it('keeps the old room file, preserves catalog edits and revises only an unchanged standard mission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-upgrade-')), store = createFileSessionStore(dir, true);
  const lobby = createLobby({ organizerCode: 'ORGANIZER' });
  try {
    lobby.execute('h', 'organizer:authorize', { code: 'ORGANIZER' }); lobby.execute('h', 'room:create', {});
    const saved = { schemaVersion: 5, lobby: lobby.exportState() };
    const entries = saved.lobby.catalog!.file.entries;
    const old = entries.find(e => e.card.id === 'e11')!.card;
    const edited = entries.find(e => e.card.id === 'e12')!.card;
    if (old.role !== 'exorcist' || edited.role !== 'exorcist') throw Error('Invalid fixture.');
    old.mission = 'Придумайте на базе короткое название для самого запомнившегося вам эпизода поиска. Придумывать его во время помощи необязательно.';
    edited.mission = 'Моя версия миссии.';
    const legacyFile = join(dir, 'session.json'), legacyBytes = JSON.stringify(saved);
    await writeFile(legacyFile, legacyBytes);
    await store.acquire();
    const recovered = (await store.load())!;
    expect(recovered).toMatchObject({ schemaVersion: 8, lobby: { room: null } });
    expect(recovered.lobby.catalog!.file.entries.find(e => e.card.id === 'e11')?.card).toMatchObject({ mission: expect.stringContaining('До призыва') });
    expect(recovered.lobby.catalog!.file.entries.find(e => e.card.id === 'e12')?.card).toMatchObject({ mission: edited.mission });
    await store.write(recovered);
    expect(await readFile(legacyFile, 'utf8')).toBe(legacyBytes);
  } finally { lobby.dispose(); await store.close(); await rm(dir, { recursive: true, force: true }); }
});

it('allows retrying a failed legacy read without first committing the default bank', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-legacy-read-'));
  const legacyFile = join(dir, 'session.json');
  const session = createSession({ firstGame: true, organizerCode: 'ORGANIZER', store: createFileSessionStore(dir, true) });
  try {
    // A directory at the legacy path causes an I/O error without relying on file permissions.
    await mkdir(legacyFile);
    await session.initialize();
    expect(await session.execute('h', 'organizer:authorize', { code: 'ORGANIZER' })).toMatchObject({
      ok: true, view: { persistence: { state: 'load_error' } },
    });
    expect(await readdir(dir)).not.toContain('party-v8.json');

    await rm(legacyFile, { recursive: true });
    const saved = empty();
    saved.lobby.catalog.file.entries[0].card.title = 'Edited legacy card';
    await writeFile(legacyFile, JSON.stringify(saved));
    expect(await session.execute('h', 'storage:retry', {})).toMatchObject({ ok: true, view: { persistence: { state: 'ready' } } });
    expect(await session.catalogExecute('h', { action: 'read' })).toMatchObject({
      ok: true, catalog: { file: saved.lobby.catalog.file },
    });
    expect(await readdir(dir)).toContain('party-v8.json');
  } finally { await session.close(); await rm(dir, { recursive: true, force: true }); }
});

it('opens a v6 room at the same paused deadline without re-dealing or rewriting the v6 file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-v6-party-'));
  const file = join(dir, 'party-v6.json'), next = createFileSessionStore(dir, true);
  const time = controlledClock(), make = () => createLobby({ firstGame: true, organizerCode: 'ORGANIZER', clock: time.clock });
  const lobby = make(), recovered = make();
  try {
    const host = () => {
      const view = lobby.viewFor('host');
      if (view?.kind !== 'organizer' || !view.room) throw Error('No room');
      return view.room;
    };
    expect(lobby.execute('host', 'organizer:authorize', { code: 'ORGANIZER' }).ok).toBe(true);
    expect(lobby.execute('host', 'room:create', {}).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect(lobby.execute('phone-' + i, 'player:join', {
      roomCode: host().code, name: 'Игрок ' + i, resumeKey: String(i).repeat(64),
    }).ok).toBe(true);
    const order = host().players.map(player => player.id);
    const game = () => ({ roomId: host().id, roundId: host().game.roundId, gameVersion: host().game.version });
    expect(lobby.execute('host', 'venue:configure', { ...game(), requestId: 'prepare-v6', venue: { base: 'База',
      zones: ['Кухня'], storyId: 'S001', prologueRead: true, harder: false, order } }).ok).toBe(true);
    expect(lobby.execute('host', 'deal:create', { roomId: host().id, dealId: null, dealVersion: host().dealing.version,
      requestId: 'deal-room-v6', possessedCount: 0 }).ok).toBe(true);
    expect(lobby.execute('host', 'round:start', { ...game(), requestId: 'start-room-v6', confirmWarnings: true }).ok).toBe(true);
    time.advance(147000);
    const v6 = lobby.exportState();
    const venue = v6.room!.game.venue!;
    delete venue.mode; delete venue.bank; delete venue.sets; delete venue.features; delete venue.prologueRead;
    delete v6.room!.game.firstGame!.locations; delete v6.room!.game.firstGame!.violations;
    const original = JSON.stringify({ schemaVersion: 6, lobby: v6 });
    await writeFile(file, original);
    await next.acquire();
    const restored = await next.load();
    expect(restored).toMatchObject({ schemaVersion: 8, lobby: { room: { code: host().code } } });
    recovered.restore(restored!.lobby);
    expect(recovered.exportState().room?.game).toMatchObject({ phase: 'search', remainingMs: 138000, paused: true });
    expect(recovered.exportState().room?.game.dealing.assignments).toEqual(v6.room?.game.dealing.assignments);
    expect(recovered.exportState().room?.game.venue?.mode).toBeUndefined();
    await next.write(restored!);
    expect(await readFile(file, 'utf8')).toBe(original);
  } finally { recovered.dispose(); lobby.dispose(); await next.close(); await rm(dir, { recursive: true, force: true }); }
});
