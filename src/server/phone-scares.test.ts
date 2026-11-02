import { expect, it, vi } from 'vitest';
import type { LobbyView, PhoneScare } from '../shared/protocol.js';
import { createLobby } from './lobby.js';
import { createPhoneScares } from './phone-scares.js';
import { controlledClock } from '../../tests/helpers/game-clock.js';

function fixture({ tutorial = false, duration = 180, draw = 0 } = {}) {
  const timer = controlledClock(), emit = vi.fn<(id: string, event: PhoneScare) => void>();
  const lobby = createLobby({ organizerCode: 'HOST', clock: timer.clock });
  lobby.execute('host', 'organizer:authorize', { code: 'HOST' }); lobby.execute('host', 'room:create', {});
  const host = () => { const v = lobby.viewFor('host'); if (v?.kind !== 'organizer' || !v.room) throw Error('Missing room'); return v.room; };
  for (let i = 0; i < 7; i++) {
    lobby.execute(`p${i}`, 'player:join', { roomCode: host().code, name: `P${i}`, resumeKey: String(i + 1).repeat(64) });
    lobby.execute(`p${i}`, 'player:audio', { roomId: host().id, enabled: true });
  }
  const views = () => new Map([...lobby.liveState().actors.keys()].map(id => [id, lobby.viewFor(id)!]));
  let seq = 0;
  const command = () => ({ roomId: host().id, roundId: host().game.roundId, gameVersion: host().game.version, requestId: `request-${++seq}` });
  lobby.execute('host', 'game:configure', { ...command(), settings: { ...host().game.settings, tutorialEnabled: tutorial, searchSeconds: duration, placementSeconds: 1 } });
  const scheduler = createPhoneScares({ clock: timer.clock, current: views, emit, randomIndex: () => draw, generateId: () => `scare-${++seq}` });
  const stop = lobby.subscribe(scheduler.update);
  lobby.execute('host', 'deal:create', { roomId: host().id, dealId: null, dealVersion: host().dealing.version, requestId: `deal-request-${++seq}`, possessedCount: 3 });
  lobby.execute('host', 'round:start', { ...command(), confirmWarnings: true }); timer.advance(1000);
  return { timer, emit, lobby, host, command, scheduler, close() { stop(); scheduler.dispose(); lobby.dispose(); } };
}
it('sends one private event per selected owner and never reschedules after repeated updates', () => {
  const f = fixture(); f.timer.advance(20000); expect(f.emit).toHaveBeenCalledTimes(7);
  for (const [id, event] of f.emit.mock.calls) { expect(id).toMatch(/^p/); expect(event).toMatchObject({ roomId: f.host().id, roundId: f.host().game.roundId, serverNow: 21000 }); }
  for (let i = 0; i < 5; i++) f.scheduler.update(); f.timer.advance(5000); expect(f.emit).toHaveBeenCalledTimes(7); f.close(); expect(f.timer.pending()).toBe(0);
});
it.each([{ tutorial: true }, { duration: 39 }, { draw: 1 }])('skips ineligible searches: %j', options => {
  const f = fixture(options); f.timer.advance(25000); expect(f.emit).not.toHaveBeenCalled(); f.close();
});
it('cancels on pause and never reassigns on resume', () => {
  const f = fixture(); f.lobby.execute('host', 'round:pause', f.command());
  f.lobby.execute('host', 'round:resume', { ...f.command(), confirmWarnings: true }); f.timer.advance(25000);
  expect(f.emit).not.toHaveBeenCalled(); f.close();
});
it.each(['disable', 'disconnect', 'release', 'withdraw', 'transfer'] as const)('cancels a player effect on %s', kind => {
  const f = fixture(); const own = f.lobby.viewFor('p0'); if (own?.kind !== 'player' || !own.play) throw Error('Missing player');
  if (kind === 'disable') f.lobby.execute('p0', 'player:audio', { roomId: f.host().id, enabled: false });
  if (kind === 'disconnect') f.lobby.disconnect('p0');
  if (kind === 'release') {
    const root = [...f.lobby.liveState().actors.keys()].find(id => { const v = f.lobby.viewFor(id); return v?.kind === 'player' && v.play?.status === 'possessed'; })!;
    const v = f.lobby.viewFor(root) as Extract<LobbyView, { kind: 'player' }>;
    f.lobby.execute(root, 'play:release', { ...f.command(), playVersion: v.play!.version });
    const released = f.lobby.viewFor(root) as Extract<LobbyView, { kind: 'player' }>;
    f.timer.advance(20000); expect(f.emit.mock.calls.map(c => c[0])).not.toContain(root); expect(released.play?.status).toBe('released'); f.close(); return;
  }
  if (kind === 'withdraw') f.lobby.execute('p0', 'play:withdraw', { ...f.command(), playVersion: own.play.version });
  if (kind === 'transfer') {
    f.lobby.execute('other', 'player:resume', { roomCode: f.host().code, resumeKey: '1'.repeat(64) });
    f.lobby.execute('other', 'player:audio', { roomId: f.host().id, enabled: true });
  }
  f.timer.advance(20000); expect(f.emit.mock.calls.map(c => c[0])).not.toContain('p0'); expect(f.emit.mock.calls.map(c => c[0])).not.toContain('other'); f.close();
});
it('does not expose sound capabilities to anonymous clients or retain them on restart', () => {
  const f = fixture();
  expect(f.lobby.execute('p0', 'organizer:atmosphere', { roomId: f.host().id, enabled: false })).toEqual({ ok: false, error: 'FORBIDDEN' });
  expect(f.lobby.execute('host', 'player:audio', { roomId: f.host().id, enabled: true })).toEqual({ ok: false, error: 'FORBIDDEN' });
  const saved = f.lobby.exportState(); expect(JSON.stringify(saved)).not.toContain('phoneScares');
  f.lobby.restore(saved); f.lobby.execute('host', 'organizer:authorize', { code: 'HOST' });
  expect(f.host().phoneScaresEnabled).toBe(false); f.timer.advance(25000); expect(f.emit).not.toHaveBeenCalled(); f.close();
});
it('ignores a cancelled callback after the same player enters a later search', () => {
  const f = fixture(); const late = f.timer.callbacks()[1];
  expect(f.lobby.execute('host', 'round:abort', f.command()).ok).toBe(true);
  expect(f.lobby.execute('host', 'sync:close', { ...f.command(), confirm: true }).ok).toBe(true);
  const room = f.host();
  expect(f.lobby.execute('host', 'deal:create', { roomId: room.id, dealId: room.dealing.dealId, dealVersion: room.dealing.version, requestId: 'replacement-deal', possessedCount: 3 }).ok).toBe(true);
  expect(f.lobby.execute('host', 'round:start', { ...f.command(), confirmWarnings: true }).ok).toBe(true);
  f.timer.advance(1000); late(); f.timer.advance(20000);
  expect(f.emit).toHaveBeenCalledTimes(7); f.close();
});
