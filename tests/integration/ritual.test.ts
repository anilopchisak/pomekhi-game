import { expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createServerRuntime } from '../../src/server/runtime.js';
import { createFileSessionStore } from '../../src/server/session-store.js';
import { prophecies } from '../../src/server/prophecies.js';
import { controlledClock } from '../helpers/game-clock.js';
import type { ClientToServerEvents, LobbyCommand, LobbyInputs, LobbyReply, ServerToClientEvents, RoomSnapshot } from '../../src/shared/protocol.js';
type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const value = (r: LobbyReply) => { if (!r.ok) throw new Error(r.error); return r.view; };
function send<C extends LobbyCommand>(s: Client, command: C, data: LobbyInputs[C]): Promise<LobbyReply> {
  return new Promise((resolve, reject) => {
    const emit = s.timeout(3000).emit.bind(s) as (c: C, d: LobbyInputs[C], ack: (e: Error | null, r: LobbyReply) => void) => void;
    emit(command, data, (e, r) => e ? reject(e) : resolve(r));
  });
}
it('reconciles seven phones, seals once after a lost acknowledgement, recovers penalties/victory and keeps freeplay separate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pomekhi-ritual-')), time = controlledClock(), sockets: Client[] = [];
  const makeRuntime = () => createServerRuntime({ organizerCode: 'RITUALHOST', sessionStore: createFileSessionStore(dir), clock: time.clock, config: { host: '127.0.0.1', port: 0 }, clientDirectory: resolve('dist/client') });
  let runtime = makeRuntime(), origin = (await runtime.start()).origin, sequence = 0;
  async function connect() { const s: Client = io(origin, { autoConnect: false, transports: ['websocket'], reconnection: false }); sockets.push(s); const ready = new Promise<void>((r, j) => { s.once('server:ready', () => r()); s.once('connect_error', j); }); s.connect(); await ready; return s; }
  let host = await connect(); const phones: Client[] = [];
  const current = async (): Promise<RoomSnapshot> => { const v = value(await send(host, 'lobby:sync', {})); if (v.kind !== 'organizer' || !v.room) throw new Error('No room'); return v.room; };
  const base = async () => { const r = await current(); return { roomId: r.id, roundId: r.game.roundId, gameVersion: r.game.version, requestId: `ritual-request-${++sequence}` }; };
  const own = async (s: Client) => { const v = value(await send(s, 'lobby:sync', {})); if (v.kind !== 'player') throw new Error('No player'); return v; };
  let code: string;
  async function restart() {
    await runtime.stop(); sockets.forEach(s => s.disconnect()); runtime = makeRuntime(); origin = (await runtime.start()).origin;
    host = await connect(); value(await send(host, 'organizer:authorize', { code: 'RITUALHOST' }));
    for (let i = 0; i < 7; i++) { phones[i] = await connect(); value(await send(phones[i], 'player:resume', { roomCode: code, resumeKey: String(i).padStart(64, '0') })); }
  }
  try {
    value(await send(host, 'organizer:authorize', { code: 'RITUALHOST' })); value(await send(host, 'room:create', {})); let r = await current(); code = r.code;
    value(await send(host, 'game:configure', { ...await base(), settings: { ...r.game.settings, tutorialEnabled: false, placementSeconds: 1, searchSeconds: 30, returnSeconds: 1 } }));
    for (let i = 0; i < 7; i++) { const p = await connect(); phones.push(p); value(await send(p, 'player:join', { roomCode: code, name: `Ritual ${i}`, resumeKey: String(i).padStart(64, '0') })); }
    for (let number = 1; number <= 4; number++) {
      r = await current(); value(await send(host, 'deal:create', { roomId: r.id, dealId: r.dealing.dealId, dealVersion: r.dealing.version, requestId: `ritual-request-${++sequence}`, possessedCount: 3 }));
      value(await send(host, 'round:start', { ...await base(), confirmWarnings: true })); time.advance(1000); await current();
      const views = await Promise.all(phones.map(own)); const late = number === 1 ? views.findIndex(v => v.assignment!.card.role === 'possessed') : -1;
      for (const [i, p] of phones.entries()) if (i !== late) {
        const v = await own(p), command = v.assignment!.card.role === 'possessed' ? 'play:release' : 'play:mission';
        value(await send(p, command, { ...await base(), playVersion: v.play!.version, completed: true }));
      }
      if ((await current()).game.phase === 'search') value(await send(host, 'round:return', await base()));
      time.advance(1000); r = await current(); expect(r.game.phase).toBe('between_rounds');
      expect(await send(host, 'results:finalize', await base())).toEqual({ ok: false, error: 'SYNC_PENDING' });
      if (late >= 0) {
        const event = { id: 'late-ritual-release', clientId: 'ritual-offline-client', sequence: 1, previousId: null, roundId: r.game.roundId!, action: { kind: 'release' } as const, phase: 'search' as const, paused: false, estimatedServerTime: null };
        value(await send(phones[late], 'play:sync', { roomId: r.id, roundId: event.roundId, events: [event] }));
        expect((await current()).game.ritual?.remainingSteps).toBe(28);
        value(await send(host, 'sync:resolve', { ...await base(), eventId: event.id, decision: 'accept' }));
      }
      r = await current(); for (const p of phones) value(await send(p, 'play:complete', { roomId: r.id, roundId: r.game.roundId!, syncRevision: r.game.synchronization!.revision }));
      expect((await current()).game.ritual?.preview?.successes).toBe(7);
      if (number === 1) { await restart(); expect((await current()).game.ritual?.remainingSteps).toBe(28); expect((await current()).game.ritual?.preview?.successes).toBe(7); }
      const finalize = await base(); host.emit('results:finalize', finalize, () => {}); await current();
      value(await send(host, 'results:finalize', finalize));
      expect((await current()).game.ritual?.remainingSteps).toBe(28 - 7 * number);
      if (number === 1) {
        expect(await send(phones[0], 'ritual:penalty', await base())).toEqual({ ok: false, error: 'FORBIDDEN' });
        value(await send(host, 'ritual:penalty', await base())); const checkpoint = (await current()).game.ritual;
        await restart(); expect((await current()).game.ritual).toEqual(checkpoint);
        value(await send(host, 'ritual:undo-penalty', await base())); expect((await current()).game.ritual?.remainingSteps).toBe(21);
        const view = value(await send(host, 'lobby:sync', {})); expect(JSON.stringify(view)).not.toContain('releaseCondition');
        const saved = JSON.parse(await readFile(join(dir, 'session.json'), 'utf8')); expect(saved.schemaVersion).toBe(5);
        const hidden = saved.lobby.room.game.ritual.cards[1].title; expect(JSON.stringify(view)).not.toContain(hidden);
      }
    }
    r = await current(); expect(r.game).toMatchObject({ phase: 'finished', completedRounds: 4, ritual: { outcome: 'won' } });
    const won = r.game.ritual; await restart(); expect((await current()).game.ritual).toEqual(won);
    value(await send(host, 'party:freeplay', await base())); r = await current(); expect(r.game).toMatchObject({ phase: 'between_rounds', freeplayFrom: 4, settings: { roundLimit: null, ritualEnabled: false } });
    value(await send(host, 'deal:create', { roomId: r.id, dealId: r.dealing.dealId, dealVersion: r.dealing.version, requestId: `ritual-request-${++sequence}`, possessedCount: 3 }));
    value(await send(host, 'round:start', { ...await base(), confirmWarnings: true })); time.advance(1000); await current(); await restart();
    expect((await current()).game).toMatchObject({ paused: true, ritual: won, freeplayFrom: 4 });
    const html = await (await fetch(origin)).text(), asset = html.match(/src="([^"]+\.js)"/)![1];
    const js = await (await fetch(origin + asset)).text(); for (const card of prophecies) expect(js).not.toContain(card.rule);
  } finally { sockets.forEach(s => s.disconnect()); await runtime.stop(); await rm(dir, { recursive: true, force: true }); }
});
