import { expect, it } from 'vitest';
import { createSession } from './session.js';
import type { SessionStore } from './session-store.js';
import type { SavedSession } from './session-format.js';
import { validateSession } from './session-format.js';
import type { LobbyReply, LobbyCommand, LobbyInputs } from '../shared/protocol.js';
import { controlledClock } from '../../tests/helpers/game-clock.js';

function memoryDisk() {
  let state: SavedSession | null = null, failure = false, afterWrite = false, corrupt = false, gate: Promise<void> | undefined;
  let writes = 0, preserved = 0;
  const store: SessionStore = {
    async acquire() {}, async close() {}, async preserve() { preserved++; },
    async load() { if (corrupt) throw new Error('private-disk-details'); return structuredClone(state); },
    async write(next) { if (gate) await gate; if (failure) throw new Error('private-disk-details'); state = structuredClone(validateSession(next)); writes++; if (afterWrite) throw new Error('after-rename'); },
  };
  return { store, read: () => structuredClone(state!), writes: () => writes, preserved: () => preserved,
    fail: (value = true) => { failure = value; }, after: (value = true) => { afterWrite = value; }, corrupt: (value = true) => { corrupt = value; }, gate: (value?: Promise<void>) => { gate = value; } };
}
function value(reply: LobbyReply) { if (!reply.ok) throw new Error(reply.error); return reply.view; }
const code = 'ABCDEFGHJKLM', key = (n: number) => n.toString(16).padStart(64, '0');
async function fixture(tutorialEnabled = false) {
  const disk = memoryDisk(), time = controlledClock();
  let session = createSession({ organizerCode: code, store: disk.store, clock: time.clock });
  let sequence = 0;
  const room = (who = 'host') => { const v = session.viewFor(who); if (!v || v.kind === 'ended' || !v.room) throw new Error('No room'); return v.room; };
  const send = <C extends LobbyCommand>(who: string, command: C, input: LobbyInputs[C]) => session.execute(who, command, input);
  const gameCommand = () => ({ roomId: room().id, gameVersion: room().game.version, roundId: room().game.roundId, requestId: `request-${++sequence}` });
  const dealCommand = () => ({ roomId: room().id, dealVersion: room().dealing.version, dealId: room().dealing.dealId, requestId: `request-${++sequence}` });
  const playCommand = (id: string) => { const v = session.viewFor(id); if (v?.kind !== 'player') throw new Error('No player'); return { ...gameCommand(), playVersion: v.play!.version }; };
  await session.initialize(); value(await send('host', 'organizer:authorize', { code })); value(await send('host', 'room:create', {}));
  for (let n = 1; n <= 7; n++) value(await send(`p${n}`, 'player:join', { roomCode: room().code, name: `Игрок ${n}`, resumeKey: key(n) }));
  value(await send('host', 'game:configure', { ...gameCommand(), settings: { ...room().game.settings, tutorialEnabled } }));
  const phones = Array.from({ length: 7 }, (_, i) => `p${i + 1}`);
  async function restart() {
    const roomCode = room().code;
    await session.close();
    session = createSession({ organizerCode: 'NEWCODEABCDE', store: disk.store, clock: time.clock });
    await session.initialize();
    expect(await send('host', 'organizer:authorize', { code })).toEqual({ ok: false, error: 'INVALID_ORGANIZER_CODE' });
    value(await send('host', 'organizer:authorize', { code: 'NEWCODEABCDE' }));
    for (let n = 1; n <= 7; n++) value(await send(`p${n}`, 'player:resume', { roomCode, resumeKey: key(n) }));
  }
  const deal = async () => value(await send('host', 'deal:create', { ...dealCommand(), possessedCount: 3 }));
  const start = async () => value(await send('host', 'round:start', { ...gameCommand(), confirmWarnings: true }));
  const advance = async (ms: number) => { while (ms > 0) { const step = Math.min(ms, 1000); time.advance(step); value(await send('host', 'lobby:sync', {})); ms -= step; } };
  return { disk, time, room, send, gameCommand, dealCommand, playCommand, phones, deal, start, advance, restart, view: (id: string) => session.viewFor(id), close: () => session.close() };
}

it('restores full cards, readiness, pending requests and journal retries without using the bank', async () => {
  const f = await fixture();
  try {
    await f.deal(); const v = f.view('p1'); if (v?.kind !== 'player') throw new Error('No player');
    value(await f.send('p1', 'card:ready', { ...f.dealCommand(), assignmentId: v.assignment!.id, ready: true }));
    const p2 = f.view('p2'); if (p2?.kind !== 'player') throw new Error('No player');
    const request = { ...f.dealCommand(), assignmentId: p2.assignment!.id, requested: true };
    value(await f.send('p2', 'card:request', request));
    const before = f.room(), cards = f.phones.map(id => f.view(id));
    await f.restart();
    expect(f.room().game.phase).toBe('reading'); expect(f.room().dealing.version).toBeGreaterThan(before.dealing.version);
    for (let i = 0; i < 7; i++) { const v = f.view(f.phones[i]), old = cards[i]; if (v?.kind === 'player' && old?.kind === 'player') expect(v.assignment).toEqual(old.assignment); else throw new Error('Missing restored identity'); }
    expect(await f.send('p2', 'card:request', request)).toMatchObject({ ok: true });
    expect(await f.send('p2', 'card:request', { ...request, requestId: 'unreceived-old-request' })).toEqual({ ok: false, error: 'STALE_DEAL' });
    expect(JSON.stringify(f.view('host'))).not.toContain('releaseCondition');
    expect(JSON.stringify(f.disk.read())).not.toContain(code);
    expect(f.view('host')).toMatchObject({ audioEnabled: false, persistence: { state: 'ready', recovered: true } });
  } finally { await f.close(); }
});

it.each(['placement', 'search', 'return'] as const)('restores %s paused with its healthy checkpoint and accumulated active time', async phase => {
  const f = await fixture();
  try {
    await f.deal(); await f.start();
    if (phase !== 'placement') await f.advance(45000);
    if (phase === 'return') value(await f.send('host', 'round:return', f.gameCommand()));
    await f.advance(1000);
    const before = f.disk.read().lobby.room!.game;
    await f.restart(); f.time.jump(600000);
    const restored = f.room().game;
    expect(restored).toMatchObject({ phase, paused: true, pauseReason: 'server_restarted', remainingMs: before.remainingMs, deadline: null, roundId: before.roundId });
    expect(f.disk.read().lobby.room!.game.activeMs).toBe(before.activeMs);
    value(await f.send('host', 'round:resume', { ...f.gameCommand(), confirmWarnings: true }));
    await f.advance(1000); expect(f.room().game.remainingMs).toBe(before.remainingMs! - 1000);
  } finally { await f.close(); }
});

it('preserves capture chains, mission disqualification and causal undo across a restart', async () => {
  const f = await fixture();
  try {
    await f.deal(); value(await f.send('host', 'game:configure', { ...f.gameCommand(), settings: { ...f.room().game.settings, infectionMode: 'on' } }));
    await f.start(); await f.advance(45000);
    const roles = f.phones.map(id => ({ id, v: f.view(id) })).filter(x => x.v?.kind === 'player');
    const roots = roles.filter(x => x.v?.kind === 'player' && x.v.assignment?.card.role === 'possessed').map(x => x.id);
    const exorcists = roles.filter(x => x.v?.kind === 'player' && x.v.assignment?.card.role === 'exorcist').map(x => x.id);
    const targetId = (who: string) => { const v = f.view(who); if (v?.kind !== 'player') throw new Error('No player'); return v.playerId; };
    value(await f.send(exorcists[0], 'play:mission', { ...f.playCommand(exorcists[0]), completed: true }));
    const infection = { ...f.playCommand(roots[0]), targetId: targetId(exorcists[0]) };
    value(await f.send(roots[0], 'play:infect', infection));
    value(await f.send(exorcists[0], 'play:infect', { ...f.playCommand(exorcists[0]), targetId: targetId(exorcists[1]) }));
    const damaged = f.disk.read(); damaged.lobby.room!.game.search!.events[0].touches = [];
    expect(() => validateSession(damaged)).toThrow();
    const before = f.view(exorcists[0]); await f.restart();
    expect(f.view(exorcists[0])).toMatchObject({ play: { status: 'captured', missionCompleted: true, missionEligible: false } });
    const after = f.view(exorcists[0]); if (before?.kind === 'player' && after?.kind === 'player') expect(after.play!.card).toEqual(before.play!.card);
    expect(await f.send(roots[0], 'play:infect', infection)).toMatchObject({ ok: true });
    const root = f.view(roots[0]); if (root?.kind !== 'player') throw new Error('No player');
    expect(await f.send(roots[0], 'play:undo', { ...f.playCommand(roots[0]), actionId: root.play!.undo!.id })).toEqual({ ok: false, error: 'UNDO_DEPENDENCY' });
  } finally { await f.close(); }
});

it('keeps provisional/final results, role history, mission changes and break/finished phases', async () => {
  const f = await fixture();
  try {
    await f.deal(); await f.start(); await f.advance(45000);
    value(await f.send('host', 'round:return', f.gameCommand())); await f.advance(45000);
    expect(f.room().game.phase).toBe('between_rounds'); const result = f.room().game.results;
    await f.restart(); expect(f.room().game.results).toEqual(result); expect(f.room().game.paused).toBe(false);
    value(await f.send('host', 'party:finish', f.gameCommand()));
    const final = f.room().game.results; expect(final[0].status).toBe('final');
    await f.restart(); expect(f.room().game).toMatchObject({ phase: 'finished', results: final });
    expect(f.disk.read().lobby.room!.game.history.some(([, count]) => count === 1)).toBe(true);
  } finally { await f.close(); }
});

it('saves before publishing/acknowledging and serializes concurrent actions', async () => {
  const f = await fixture();
  try {
    let release!: () => void; f.disk.gate(new Promise(resolve => { release = resolve; }));
    let resolved = false;
    const request = f.send('host', 'deal:create', { ...f.dealCommand(), possessedCount: 3 }).then(r => { resolved = true; return r; });
    const second = f.send('host', 'lobby:sync', {});
    await new Promise<void>(resolve => setTimeout(resolve, 0)); expect(resolved).toBe(false);
    expect(f.disk.read().lobby.room!.game.phase).toBe('lobby');
    expect(f.room().game.phase).toBe('lobby');
    release(); value(await request); expect(value(await second)).toMatchObject({ room: { game: { phase: 'reading' } } });
    expect(f.disk.read().lobby.room!.game.phase).toBe('reading');
  } finally { f.disk.gate(); await f.close(); }
});

it('rolls back a failed mutation, freezes timers, preserves keys and allows authorized retry', async () => {
  const f = await fixture();
  try {
    await f.deal(); await f.start(); await f.advance(1000);
    const checkpoint = f.disk.read(); f.disk.fail();
    expect(await f.send('host', 'round:abort', f.gameCommand())).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    expect(f.room().game).toMatchObject({ phase: 'placement', paused: true, pauseReason: 'storage_error', remainingMs: checkpoint.lobby.room!.game.remainingMs });
    expect(f.time.pending()).toBe(0); expect(f.view('p1')).toMatchObject({ kind: 'player', persistence: { state: 'write_error' } });
    expect(await f.send('p1', 'storage:retry', {})).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await f.send('host', 'round:resume', { ...f.gameCommand(), confirmWarnings: true })).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    f.disk.fail(false); value(await f.send('host', 'storage:retry', {}));
    expect(f.room().game).toMatchObject({ phase: 'placement', paused: true, pauseReason: 'server_restarted' });
    value(await f.send('host', 'round:resume', { ...f.gameCommand(), confirmWarnings: true }));
  } finally { f.disk.fail(false); await f.close(); }
});

it('recognizes a commit even when the write reports an error after rename', async () => {
  const f = await fixture();
  try {
    const intent = { ...f.dealCommand(), possessedCount: 3 }; f.disk.after();
    expect(await f.send('host', 'deal:create', intent)).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    f.disk.after(false); value(await f.send('host', 'storage:retry', {}));
    const deal = f.room().dealing.dealId;
    value(await f.send('host', 'deal:create', intent)); expect(f.room().dealing.dealId).toBe(deal);
  } finally { f.disk.after(false); await f.close(); }
});

it('retains a damaged file, denies game mutations and requires an explicit authorized reset', async () => {
  const disk = memoryDisk(); disk.corrupt();
  const session = createSession({ organizerCode: code, store: disk.store });
  try {
    await session.initialize(); expect(disk.writes()).toBe(0);
    expect(await session.execute('x', 'storage:reset', { confirm: true })).toEqual({ ok: false, error: 'FORBIDDEN' });
    value(await session.execute('h', 'organizer:authorize', { code }));
    expect(session.viewFor('h')).toMatchObject({ persistence: { state: 'load_error' }, room: null });
    expect(await session.execute('h', 'room:create', {})).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    expect(await session.execute('h', 'storage:reset', {})).toEqual({ ok: false, error: 'INVALID_INPUT' });
    value(await session.execute('h', 'storage:reset', { confirm: true }));
    expect(disk.preserved()).toBe(1); expect(disk.read().lobby.room).toBeNull();
  } finally { await session.close(); }
});

it('persists revocation and room closure instead of resurrecting a closed game', async () => {
  const f = await fixture();
  try {
    const code = f.room().code, id = f.room().players[0].id;
    value(await f.send('host', 'player:remove', { roomId: f.room().id, playerId: id }));
    expect(f.disk.read().lobby.room!.revoked).toContain(key(1));
    value(await f.send('host', 'room:close', { roomId: f.room().id }));
    expect(f.disk.read().lobby.room).toBeNull();
    const restored = createSession({ organizerCode: 'OTHER', store: f.disk.store });
    await f.close(); await restored.initialize();
    try { expect(await restored.execute('p1', 'player:resume', { roomCode: code, resumeKey: key(1) })).toEqual({ ok: false, error: 'SESSION_EXPIRED' }); }
    finally { await restored.close(); }
  } finally { await f.close(); }
});

it('recovers an already paused phase and an aborted attempt without crediting another round', async () => {
  const f = await fixture();
  try {
    await f.deal(); await f.start(); await f.advance(1000);
    value(await f.send('host', 'round:pause', f.gameCommand())); const remaining = f.room().game.remainingMs;
    await f.restart(); expect(f.room().game).toMatchObject({ paused: true, remainingMs: remaining, completedRounds: 0 });
    value(await f.send('host', 'round:abort', f.gameCommand()));
    await f.restart(); expect(f.room().game).toMatchObject({ phase: 'between_rounds', lastRoundAborted: true, completedRounds: 0, results: [{ status: 'aborted' }] });
    await f.deal(); value(await f.send('host', 'deal:cancel', f.dealCommand()));
    expect(f.room().game.phase).toBe('between_rounds');
  } finally { await f.close(); }
});

it('freezes a failed timer checkpoint at the previous durable remainder without skipping phases', async () => {
  const f = await fixture();
  try {
    await f.deal(); await f.start(); await f.advance(1000); const before = f.disk.read().lobby.room!.game;
    f.disk.fail(); f.time.advance(1000); value(await f.send('host', 'lobby:sync', {}));
    expect(f.room().game).toMatchObject({ phase: before.phase, remainingMs: before.remainingMs, paused: true, pauseReason: 'storage_error' });
    expect(f.disk.read().lobby.room!.game.activeMs).toBe(before.activeMs);
    f.disk.fail(false); value(await f.send('host', 'storage:retry', {})); expect(f.time.pending()).toBe(0);
  } finally { f.disk.fail(false); await f.close(); }
});

it('does not announce an unsaved reset or clear player identities when its write fails', async () => {
  const f = await fixture();
  try {
    await f.deal(); f.disk.fail();
    expect(await f.send('host', 'deal:shuffle', { ...f.dealCommand(), possessedCount: 3 })).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    expect(await f.send('host', 'storage:reset', { confirm: true })).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    expect(f.view('p1')).toMatchObject({ kind: 'player' }); expect(f.disk.read().lobby.room!.players).toHaveLength(7);
    f.disk.fail(false); value(await f.send('host', 'storage:retry', {})); expect(f.room().players).toHaveLength(7);
  } finally { f.disk.fail(false); await f.close(); }
});

it('recovers tutorial and normal progression through the durable boundary without counting training', async () => {
  const f = await fixture(true);
  try {
    value(await f.send('host', 'game:configure', { ...f.gameCommand(), settings: { ...f.room().game.settings,
      roundLimit: 2, placementSeconds: 1, searchSeconds: 1, returnSeconds: 1, infectionMode: 'on' } }));
    await f.deal(); const tutorial = f.room().game.roundPlan;
    await f.restart(); expect(f.room().game.roundPlan).toEqual(tutorial);
    await f.start(); await f.advance(1000);
    await f.restart(); expect(f.room().game).toMatchObject({ paused: true, roundPlan: tutorial, tutorialCompleted: false });
    value(await f.send('host', 'round:resume', { ...f.gameCommand(), confirmWarnings: true }));
    await f.advance(2000); expect(f.room().game).toMatchObject({ tutorialCompleted: true, completedRounds: 0 });
    expect(f.disk.read().lobby.room!.game.history).toEqual([]);
    await f.restart(); await f.deal(); expect(f.room().game.roundPlan).toMatchObject({ kind: 'regular', number: 1, difficulty: 1, infectionEnabled: true });
    await f.start(); await f.advance(3000); await f.deal();
    expect(f.room().game.roundPlan).toMatchObject({ kind: 'regular', number: 2, difficulty: 3 });
    const cards = f.phones.map(id => f.view(id)); await f.restart();
    for (const [index, id] of f.phones.entries()) {
      const before = cards[index], after = f.view(id);
      if (before?.kind !== 'player' || after?.kind !== 'player') throw new Error('Missing phone');
      expect(after.assignment).toEqual(before.assignment);
    }
    await f.start(); await f.advance(3000);
    expect(f.room().game).toMatchObject({ phase: 'finished', completedRounds: 2 });
    expect(f.room().game.results.map(r => r.kind)).toEqual(['tutorial', 'regular', 'regular']);
    await f.restart(); expect(f.room().game.results.map(r => r.kind)).toEqual(['tutorial', 'regular', 'regular']);
  } finally { await f.close(); }
});
