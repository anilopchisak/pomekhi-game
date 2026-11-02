import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileSessionStore } from './session-store.js';
import { expect, it } from 'vitest';
import { createLobby } from './lobby.js';
import { validateSession } from './session-format.js';
import { controlledClock } from '../../tests/helpers/game-clock.js';

function legacyFixture(phase: 'lobby' | 'reading' | 'placement' | 'between_rounds' | 'finished', infectionEnabled: boolean, capture = false) {
  const time = controlledClock(); let sequence = 0;
  const lobby = createLobby({ organizerCode: 'HOST', clock: time.clock });
  const value = (reply: ReturnType<typeof lobby.execute>) => { if (!reply.ok) throw new Error(reply.error); return reply.view; };
  value(lobby.execute('host', 'organizer:authorize', { code: 'HOST' })); value(lobby.execute('host', 'room:create', {}));
  const room = () => { const v = lobby.viewFor('host'); if (v?.kind !== 'organizer' || !v.room) throw new Error('No room'); return v.room; };
  const base = () => ({ roomId: room().id, gameVersion: room().game.version, roundId: room().game.roundId, requestId: `migration-${++sequence}` });
  value(lobby.execute('host', 'game:configure', { ...base(), settings: { ...room().game.settings, ritualEnabled: false, tutorialEnabled: false, maximumDifficulty: 1,
    roundLimit: phase === 'finished' ? 1 : 5, placementSeconds: 1, searchSeconds: 1, returnSeconds: 1, infectionMode: infectionEnabled ? 'on' : 'off' } }));
  for (let i = 1; i <= 7; i++) value(lobby.execute(`p${i}`, 'player:join', { roomCode: room().code, name: `Player ${i}`, resumeKey: String(i).repeat(64) }));
  if (phase !== 'lobby') value(lobby.execute('host', 'deal:create', { roomId: room().id, dealVersion: room().dealing.version, dealId: null, requestId: `migration-${++sequence}`, possessedCount: 3 }));
  if (phase !== 'lobby' && phase !== 'reading') value(lobby.execute('host', 'round:start', { ...base(), confirmWarnings: true }));
  if (phase === 'between_rounds' || phase === 'finished') {
    time.advance(1000);
    if (capture) {
      const phones = Array.from({ length: 7 }, (_, i) => ({ connection: `p${i + 1}`, view: lobby.viewFor(`p${i + 1}`) }));
      const root = phones.find(p => p.view?.kind === 'player' && p.view.assignment!.card.role === 'possessed')!;
      const target = phones.find(p => p.view?.kind === 'player' && p.view.assignment!.card.role === 'exorcist')!;
      if (root.view?.kind !== 'player' || target.view?.kind !== 'player') throw new Error('Missing player');
      value(lobby.execute(root.connection, 'play:infect', { ...base(), playVersion: root.view.play!.version, targetId: target.view.playerId }));
    }
    time.advance(2000);
  }
  const current = { schemaVersion: 2 as const, lobby: lobby.exportState() };
  // Recreate the published version-1 shape, without depending on the migrator.
  const legacy = JSON.parse(JSON.stringify(current));
  legacy.schemaVersion = 1;
  const game = legacy.lobby.room.game;
  const { roundLimit, placementSeconds, searchSeconds, returnSeconds } = game.settings;
  game.settings = { roundLimit, placementSeconds, searchSeconds, returnSeconds, infectionEnabled };
  delete game.tutorialCompleted; delete game.progressionRounds; delete game.roundPlan; delete game.dealing.difficulty;
  for (const row of game.results) { delete row.kind; delete row.difficulty; delete row.infectionEnabled; }
  lobby.dispose();
  return { current, legacy };
}

it.each(['lobby', 'reading', 'placement', 'between_rounds', 'finished'] as const)('migrates legacy %s without altering cards, scores, timing or successful request fingerprints', phase => {
  for (const enabled of [false, true]) {
    const { current, legacy } = legacyFixture(phase, enabled), original = structuredClone(legacy);
    const saved = validateSession(legacy), game = saved.lobby.room!.game;
    expect(saved.schemaVersion).toBe(4);
    expect(legacy).toEqual(original);
    expect(game.settings).toMatchObject({ tutorialEnabled: false, initialDifficulty: 1, maximumDifficulty: 1, infectionMode: enabled ? 'on' : 'off' });
    expect(game.dealing.assignments).toEqual(current.lobby.room!.game.dealing.assignments);
    expect(game.search).toEqual(current.lobby.room!.game.search);
    expect(game.remainingMs).toBe(current.lobby.room!.game.remainingMs);
    expect(saved.lobby.room!.requests).toEqual(current.lobby.room!.requests);
    expect(game.completedRounds).toBe(current.lobby.room!.game.completedRounds);
    if (phase !== 'lobby') expect(game.roundPlan).toMatchObject({ kind: 'regular', difficulty: 1, number: 1, infectionEnabled: enabled });
    expect(validateSession(saved)).toEqual(saved);
  }
});

it('migrates an empty version-1 save and rejects unsupported schemas and malformed legacy cards', () => {
  expect(validateSession({ schemaVersion: 1, lobby: { revision: 0, usedCodes: [], room: null } }).schemaVersion).toBe(4);
  const { legacy } = legacyFixture('reading', false);
  legacy.lobby.room.game.dealing.assignments[0][1].card.difficulty = 2;
  expect(() => validateSession(legacy)).toThrow();
  expect(() => validateSession({ schemaVersion: 99, lobby: null })).toThrow();
});

it('rejects a forged tutorial, round number or result plan in a version-2 checkpoint', () => {
  const { current } = legacyFixture('reading', false);
  const tutorial = structuredClone(current);
  tutorial.lobby.room!.game.roundPlan = { kind: 'tutorial', number: 0, difficulty: 1, infectionEnabled: false };
  expect(() => validateSession(tutorial)).toThrow();
  const number = structuredClone(current); number.lobby.room!.game.roundPlan!.number = 2;
  expect(() => validateSession(number)).toThrow();
  const { current: finished } = legacyFixture('finished', false);
  finished.lobby.room!.game.results[0].difficulty = 3;
  expect(() => validateSession(finished)).toThrow();
});

it('loads a legacy file through the real store and commits version 3 without losing issued cards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pomekhi-upgrade-')), store = createFileSessionStore(directory);
  const { legacy, current } = legacyFixture('reading', true);
  try {
    await writeFile(join(directory, 'session.json'), JSON.stringify(legacy));
    await store.acquire(); const migrated = await store.load();
    expect(migrated!.lobby.room!.game.dealing.assignments).toEqual(current.lobby.room!.game.dealing.assignments);
    expect(JSON.parse(await readFile(join(directory, 'session.json'), 'utf8')).schemaVersion).toBe(1);
    await store.write(migrated!);
    expect(JSON.parse(await readFile(join(directory, 'session.json'), 'utf8')).schemaVersion).toBe(4);
    const lobby = createLobby({ organizerCode: 'NEWCODE' });
    try {
      lobby.restore(migrated!.lobby);
      expect(lobby.exportState().room!.game.settings).toMatchObject({ ritualEnabled: false, tutorialEnabled: false, maximumDifficulty: 1, infectionMode: 'on' });
      expect(lobby.exportState().room!.game.dealing.assignments).toEqual(current.lobby.room!.game.dealing.assignments);
    } finally { lobby.dispose(); }
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
});

it('migrates a legacy capture result when infection was disabled later in the break', () => {
  const { legacy } = legacyFixture('between_rounds', true, true);
  legacy.lobby.room.game.settings.infectionEnabled = false;
  const migrated = validateSession(legacy), game = migrated.lobby.room!.game;
  expect(game.settings.infectionMode).toBe('off');
  expect(game.results[0]).toMatchObject({ infectedPlayers: 1, infectionEnabled: null });
  expect(game.roundPlan!.infectionEnabled).toBe(true);
});

it.each(['reading', 'placement', 'between_rounds', 'finished'] as const)('upgrades version 2 %s to an offline-ready format without changing issued data', phase => {
  const { current } = legacyFixture(phase, true, phase === 'between_rounds');
  const previous = JSON.parse(JSON.stringify(current));
  delete previous.lobby.room.game.roundSync; delete previous.lobby.room.game.venue; delete previous.lobby.room.game.playerNames;
  const saved = validateSession(previous), original = current.lobby.room!.game;
  expect(saved.schemaVersion).toBe(4); expect(saved.lobby.room!.game.venue).toEqual({ base: 'База', zones: [] });
  expect(saved.lobby.room!.game.search).toEqual(original.search); expect(saved.lobby.room!.game.results).toEqual(original.results);
  const restored = createLobby({ organizerCode: 'NEWCODE' });
  try { restored.restore(saved.lobby); expect(() => validateSession({ schemaVersion: 4, lobby: restored.exportState() })).not.toThrow(); }
  finally { restored.dispose(); }
});

it('migrates a version-3 tutorial without enabling infection or a ritual, including a later duration edit', () => {
  const { current } = legacyFixture('reading', true);
  const previous = JSON.parse(JSON.stringify(current)); previous.schemaVersion = 3;
  const g = previous.lobby.room.game; delete g.settings.ritualEnabled; delete g.ritual; delete g.freeplayFrom;
  g.settings.tutorialEnabled = true; g.roundPlan = { kind: 'tutorial', number: 0, difficulty: 1, infectionEnabled: false };
  const saved = validateSession(previous), lobby = createLobby({ organizerCode: 'HOST' });
  try {
    lobby.restore(saved.lobby); lobby.execute('h', 'organizer:authorize', { code: 'HOST' });
    const v = lobby.viewFor('h'); if (v?.kind !== 'organizer' || !v.room) throw new Error('No room');
    const before = v.room;
    expect(lobby.execute('h', 'game:configure', { roomId: before.id, roundId: null, requestId: 'legacy-duration-edit', gameVersion: before.game.version, settings: { ...before.game.settings, searchSeconds: 10 } })).toMatchObject({ ok: true });
    const after = lobby.exportState().room!.game;
    expect(after.settings).toMatchObject({ roundLimit: 5, infectionMode: 'on', ritualEnabled: false });
    expect(after.roundPlan!.infectionEnabled).toBe(false); expect(after.dealing.assignments).toEqual(current.lobby.room!.game.dealing.assignments);
    expect(() => validateSession({ schemaVersion: 4, lobby: lobby.exportState() })).not.toThrow();
  } finally { lobby.dispose(); }
});
