import { expect, it } from 'vitest';
import { createDealing } from './dealing.js';
import { createSearch } from './search.js';
import { createRoundSync, validateRoundSync } from './round-sync.js';
import type { OfflineAction, OfflineEvent } from '../shared/protocol.js';
function fixture() {
  let id = 0; const generateId = () => `identifier-${++id}`;
  const dealing = createDealing({ generateId, randomIndex: () => 0 });
  const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g']; dealing.deal(players, 3);
  const roster = new Map(players.map(p => [p, dealing.personal(p)!]));
  const roots = players.filter(p => roster.get(p)!.card.role === 'possessed'), exos = players.filter(p => !roots.includes(p));
  const baseline = createSearch('round-id', roster, generateId).exportState();
  const journal = createRoundSync({ base: baseline, entries: [], players, completed: [], revision: 0, closed: false }, generateId);
  const event = (actor: string, action: OfflineAction, previousId: string | null = null): OfflineEvent => ({ id: generateId(), clientId: `client-${actor}`, sequence: ++id, previousId, roundId: 'round-id', action, phase: 'search', paused: false, estimatedServerTime: 42 });
  return { journal, event, roots, exos, players, generateId };
}
it('reconciles reversed capture-chain delivery and a capture notice without double credit', () => {
  const { journal: j, event, roots: [a], exos: [b, c] } = fixture();
  const chain = event(b, { kind: 'infect', targetId: c });
  expect(j.ingest(b, [chain], () => true)).toBeUndefined(); expect(j.publicState().conflicts).toBe(1);
  const notice = event(b, { kind: 'captured', by: a }); j.ingest(b, [notice], () => true);
  const capture = event(a, { kind: 'infect', targetId: b }); j.ingest(a, [capture], () => true);
  expect(j.publicState().conflicts).toBe(0); expect(j.current().personal(c)?.status).toBe('captured');
  const state = j.exportState(); j.ingest(a, [capture], () => false); expect(j.exportState()).toEqual(state);
  expect(j.current().result(1, 'provisional', 0).infectedPlayers).toBe(2);
});
it('requires organizer review for late timing and keeps dependent undo causal', () => {
  const { journal: j, event, roots: [a], exos: [b] } = fixture();
  const capture = event(a, { kind: 'infect', targetId: b }); j.ingest(a, [capture], () => false);
  expect(j.current().personal(b)?.status).toBe('exorcist'); expect(j.publicState().conflicts).toBe(1);
  j.resolve(capture.id, 'accept'); expect(j.current().personal(b)?.status).toBe('captured');
  const release = event(b, { kind: 'release' }); j.ingest(b, [release], () => true);
  const undo = event(a, { kind: 'undo', actionId: capture.id }, capture.id); j.ingest(a, [undo], () => true);
  expect(j.personal(a)?.receipts.at(-1)).toMatchObject({ status: 'review', reason: 'UNDO_DEPENDENCY' });
  j.resolve(release.id, 'reject'); expect(j.current().personal(b)?.status).toBe('exorcist');
});
it('can reject a competing accepted capture and accept the intended group', () => {
  const { journal: j, event, roots: [a, other], exos: [b] } = fixture();
  const first = event(a, { kind: 'infect', targetId: b }), second = event(other, { kind: 'infect', targetId: b });
  j.ingest(a, [first], () => true); j.ingest(other, [second], () => true); expect(j.publicState().conflicts).toBe(1);
  j.resolve(first.id, 'reject'); j.resolve(second.id, 'accept');
  expect(j.current().personal(b)?.card).toEqual(j.current().personal(other)?.card);
  expect(j.current().result(1, 'provisional', 0).infectedPlayers).toBe(1);
});
it('retains group progress when its original leaves and persists receipt/undo state', () => {
  const { journal: j, event, roots: [a], exos: [b], generateId } = fixture();
  j.ingest(a, [event(a, { kind: 'infect', targetId: b })], () => true);
  j.ingest(b, [event(b, { kind: 'captured', by: a })], () => true);
  j.ingest(a, [event(a, { kind: 'withdraw' })], () => true); expect(j.personal(a)?.withdrawn).toBe(true);
  j.ingest(b, [event(b, { kind: 'release' })], () => true);
  const restored = createRoundSync(JSON.parse(JSON.stringify(j.exportState())), generateId);
  expect(restored.current().result(1, 'provisional', 0)).toMatchObject({ rescuedGroups: 1, infectedPlayers: 1, totalGroups: 3 });
  expect(restored.current().personal(b)?.undo?.available).toBe(true);
});
it('waits for everyone and explicitly rejects unreceived actions after force-close', () => {
  const { journal: j, event, players, exos: [a] } = fixture();
  for (const p of players) expect(j.complete(p, j.publicState().revision)).toBeUndefined(); expect(j.ready()).toBe(true);
  const mission = event(a, { kind: 'mission', completed: true }); j.ingest(a, [mission], () => true); expect(j.ready()).toBe(false);
  expect(j.complete(a, -1)).toBe('STALE_GAME');
  j.close(); const late = event(a, { kind: 'mission', completed: false }); j.ingest(a, [late], () => true);
  expect(j.personal(a)?.receipts.at(-1)).toMatchObject({ status: 'rejected', reason: 'results_closed' });
  expect(j.current().result(1, 'provisional', 0).missions).toBe(1);
});
it('rejects forged retries and independent sequence collisions', () => {
  const { journal: j, event, roots: [a] } = fixture(); const original = event(a, { kind: 'release' });
  j.ingest(a, [original], () => true);
  expect(j.ingest(a, [{ ...original, action: { kind: 'withdraw' } }], () => true)).toBe('INVALID_INPUT');
  expect(j.ingest(a, [{ ...original, id: 'different-event' }], () => true)).toBe('INVALID_INPUT');
  expect(j.ingest('stranger', [original], () => true)).toBe('FORBIDDEN');
  expect(j.personal('stranger')).toBeNull();
});

it('replays stored unselected releases while rejecting new ones without blocking later reports', () => {
  const { journal, event, roots: [historical, actor], exos: [target], generateId } = fixture();
  const oldRelease = event(historical, { kind: 'release' });
  expect(journal.ingest(historical, [oldRelease], () => true)).toBeUndefined();
  const checkpoint = journal.exportState();
  validateRoundSync(checkpoint, 'round-id');
  const restored = createRoundSync(checkpoint, generateId);
  expect(restored.ingest(historical, [oldRelease], () => false, true)).toBeUndefined();
  expect(restored.exportState()).toEqual(checkpoint);
  expect(restored.current().personal(historical)?.status).toBe('released');

  const newRelease = event(actor, { kind: 'release' });
  const infection = event(actor, { kind: 'infect', targetId: target }, newRelease.id);
  expect(restored.ingest(actor, [newRelease, infection], () => true, true)).toBeUndefined();
  expect(restored.personal(actor)?.receipts).toEqual([
    { id: newRelease.id, status: 'rejected', reason: 'release_targets_required' },
    { id: infection.id, status: 'accepted', reason: null },
  ]);
  expect(restored.resolve(newRelease.id, 'reject')).toBe('ACTION_UNAVAILABLE');
  expect(restored.resolve(newRelease.id, 'accept')).toBe('ACTION_UNAVAILABLE');
  expect(restored.current().personal(actor)?.status).toBe('possessed');
  expect(restored.current().personal(target)?.status).toBe('captured');
  expect(restored.current().result(1, 'provisional', 0).rescuedGroups).toBe(1);
});

it('stores only canonical event fields and accepts a replay of an older padded checkpoint', () => {
  const { journal, event, exos: [actor], generateId } = fixture();
  const original = event(actor, { kind: 'mission', completed: true });
  const padded = { ...original, padding: 'x'.repeat(16000), action: { ...original.action, ignored: true } };
  expect(journal.ingest(actor, [padded], () => true)).toBeUndefined();
  expect(journal.exportState().entries[0].event).toEqual(original);
  const older = journal.exportState();
  older.entries[0].event = padded;
  const restored = createRoundSync(older, generateId);
  expect(restored.ingest(actor, [original], () => false)).toBeUndefined();
  expect(restored.exportState()).toEqual(journal.exportState());
});

it('keeps a full inbox valid and allows a participant to leave', () => {
  const { journal, event, exos: [actor], generateId } = fixture();
  const state = journal.exportState();
  state.entries = Array.from({ length: 12000 }, () => {
    const report = event(actor, { kind: 'mission', completed: true }, 'missing-report');
    return { actor, event: report, receipt: { id: report.id, status: 'review', reason: 'timing' }, approved: false };
  });
  const full = createRoundSync(state, generateId);
  expect(full.legacy(actor, { kind: 'mission', completed: true })).toBe('REQUEST_LIMIT');
  expect(full.legacy(actor, { kind: 'withdraw' })).toBeUndefined();
  expect(full.current().personal(actor)).toBeNull();
  expect(() => validateRoundSync(full.exportState(), state.base.roundId)).not.toThrow();
});

it('accepts a delayed capture notice after its source withdrew without dropping the group', () => {
  const { journal: j, event, roots: [a], exos: [b, c] } = fixture();
  j.ingest(a, [event(a, { kind: 'infect', targetId: b }), event(a, { kind: 'withdraw' })], () => true);
  j.ingest(b, [event(b, { kind: 'captured', by: a }), event(b, { kind: 'infect', targetId: c })], () => true);
  expect(j.publicState().conflicts).toBe(0); expect(j.current().personal(c)?.status).toBe('captured');
});
