import { expect, it } from 'vitest';
import { projectOffline } from '../../src/client/pages/player/model/offline-store.js';
import { createLobby } from '../../src/server/lobby.js';
function fixture(status) {
  const lobby = createLobby({ organizerCode: 'TEST' });
  lobby.execute('h', 'organizer:authorize', { code: 'TEST' }); lobby.execute('h', 'room:create', {});
  const h = lobby.viewFor('h'); if (h?.kind !== 'organizer' || !h.room) throw new Error('No room');
  for (let i = 0; i < 4; i++) lobby.execute(`p${i}`, 'player:join', { roomCode: h.room.code, name: `Player ${i}`, resumeKey: String(i).padStart(64, '0') });
  const host = lobby.viewFor('h'); if (host?.kind !== 'organizer' || !host.room) throw new Error('No room');
  lobby.execute('h', 'deal:create', { roomId: h.room.id, requestId: 'test-deal-id', dealId: null, dealVersion: 0, possessedCount: 2 });
  const room = lobby.exportState().room;
  lobby.execute('h', 'round:start', { roomId: h.room.id, requestId: 'test-start-id', gameVersion: room.game.version, roundId: null, confirmWarnings: true });
  const views = Array.from({ length: 4 }, (_, i) => lobby.viewFor(`p${i}`));
  const view = status ? views.find(item => item.play.status === status) : views[0];
  const event = (action, id) => ({ event: { id, clientId: 'offline-client', sequence: 1, previousId: null, action, roundId: view.room.game.roundId, phase: 'search', paused: false, estimatedServerTime: null }, before: globalThis.structuredClone(view.play) });
  lobby.dispose(); return { view, event };
}
it('projects only this player and labels a captured notice without claiming to have received another card', () => {
  const { view, event } = fixture('exorcist'), copy = globalThis.structuredClone(view);
  const projected = projectOffline(view, [event({ kind: 'captured', by: 'someone' }, 'captured-event')]);
  expect(projected.play).toMatchObject({ status: 'captured', wasCaptured: true, missionEligible: false, undo: null });
  expect(projected.play.card).toEqual(view.play.card); expect(view).toEqual(copy); expect(projected.room.players).toEqual(view.room.players);
});
it('reverses a pending local action and excludes rejected/other-round events', () => {
  const { view, event } = fixture();
  const action = event({ kind: 'release' }, 'release-event'), undo = event({ kind: 'undo', actionId: action.event.id }, 'undo-event');
  expect(projectOffline(view, [action]).play.status).toBe('released');
  expect(projectOffline(view, [action, undo]).play).toEqual(view.play);
  action.receipt = { id: action.event.id, status: 'rejected', reason: 'organizer' };
  expect(projectOffline(view, [action]).play).toEqual(view.play);
  action.receipt = undefined; action.event.roundId = 'other-round'; expect(projectOffline(view, [action]).play).toEqual(view.play);
});

it('preserves a confirmed release while a delayed capture notice awaits review', () => {
  const { view, event } = fixture('exorcist');
  const capture = event({ kind: 'captured', by: 'someone' }, 'capture-notice');
  view.play.status = 'released';
  view.play.wasCaptured = true;
  view.play.missionEligible = false;
  for (const receipt of [undefined, { id: capture.event.id, status: 'review', reason: 'timing' }]) {
    capture.receipt = receipt;
    expect(projectOffline(view, [capture]).play).toEqual(view.play);
  }
});
it('withdraws only the current player without altering the shared roster or score', () => {
  const { view, event } = fixture(); const projected = projectOffline(view, [event({ kind: 'withdraw' }, 'withdraw-event')]);
  expect(projected.play).toBeNull(); expect(projected.synchronization?.withdrawn).toBe(true); expect(projected.room).toEqual(view.room);
});

it('does not restore participation through an achievement undo after withdrawal', () => {
  const { view, event } = fixture();
  const mission = event({ kind: 'mission', completed: true }, 'mission-event');
  const withdrawn = event({ kind: 'withdraw' }, 'withdraw-event');
  const undo = event({ kind: 'undo', actionId: mission.event.id }, 'undo-event');
  const projected = projectOffline(view, [mission, withdrawn, undo]);
  expect(projected.play).toBeNull(); expect(projected.synchronization.withdrawn).toBe(true);
});

it('keeps gameplay intact while an explicit undo request is queued for the organizer', () => {
  const { view, event } = fixture();
  const release = event({ kind: 'release' }, 'release-event');
  const request = event({ kind: 'undo', actionId: release.event.id, requestReview: true }, 'review-request');
  const projected = projectOffline(view, [release, request]);
  expect(projected.play.status).toBe('released');
  expect(projected.synchronization.undoRequests).toEqual([{ id: request.event.id, actionId: release.event.id, status: 'queued' }]);
});

it('lists cached group members for a pending release and removes the entry on local undo', () => {
  const { view, event } = fixture('exorcist');
  view.room.game.firstGame = true;
  view.play.releaseGroups = [['holder', 'captured'], ['other']];
  const release = event({ kind: 'release', targetIds: ['holder'] }, 'release-event');
  const undo = event({ kind: 'undo', actionId: release.event.id }, 'undo-event');
  const projected = projectOffline(view, [release]);
  expect(projected.play.releases).toEqual([{ id: release.event.id, memberIds: ['holder', 'captured'], available: true, pending: true }]);
  expect(projectOffline(view, [release, undo]).play).toEqual(view.play);
  expect(view.play.releases).toBeUndefined();
});

it('keeps the recorded group members when a fresh recall snapshot no longer lists release options', () => {
  const { view, event } = fixture('exorcist');
  view.room.game.firstGame = true;
  view.play.releaseGroups = [['holder', 'captured']];
  const release = event({ kind: 'release', targetIds: ['holder'] }, 'release-event');
  release.receipt = { id: release.event.id, status: 'review', reason: 'timing' };
  view.room.game.phase = 'return';
  delete view.play.releaseGroups;

  expect(projectOffline(view, [release]).play.releases).toEqual([
    { id: release.event.id, memberIds: ['holder', 'captured'], available: true, pending: true },
  ]);
});

it('preserves a fresh personal snapshot when replaying an offline release and its undo', () => {
  const { view, event } = fixture('exorcist');
  view.room.game.firstGame = true;
  view.play.releaseGroups = [['holder', 'captured']];
  const release = event({ kind: 'release', targetIds: ['holder'] }, 'release-event');
  const undo = event({ kind: 'undo', actionId: release.event.id }, 'undo-event');
  const { view: captured } = fixture('possessed');
  view.play = { ...captured.play, status: 'captured', wasCaptured: true, version: view.play.version + 1 };

  expect(projectOffline(view, [release, undo]).play).toEqual(view.play);
});

it('keeps the accepted release row when the live snapshot arrives before the journal receipt', () => {
  const { view, event } = fixture('exorcist');
  view.room.game.firstGame = true;
  const release = event({ kind: 'release', targetIds: ['holder'] }, 'release-event');
  view.play.releases = [{ id: release.event.id, memberIds: ['holder', 'captured'], available: false, canRequestReview: true }];
  view.play.undo = { id: 'later-action', label: 'Отметка миссии', available: true };

  expect(projectOffline(view, [release]).play).toEqual(view.play);
});
