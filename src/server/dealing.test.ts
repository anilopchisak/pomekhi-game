import { describe, expect, it } from 'vitest';
import { createDealing } from './dealing.js';
import { CARD_BANK } from './cards.js';

function setup(n = 7, count = 3) {
  let sequence = 0;
  const dealing = createDealing({ generateId: () => `generated-${++sequence}`, randomIndex: () => 0 });
  const players = Array.from({ length: n }, (_, i) => `p${i}`);
  expect(dealing.deal(players, count)).toBeUndefined();
  return { dealing, players };
}
function issued(dealing: ReturnType<typeof createDealing>) {
  return dealing.publicState().assignments.map(item => ({ playerId: item.playerId, ...dealing.personal(item.playerId)! }));
}

it('ships 12 original introductory cards for each role with complete fields', () => {
  expect(CARD_BANK).toHaveLength(24);
  expect(new Set(CARD_BANK.map(card => card.id)).size).toBe(24);
  expect(new Set(CARD_BANK.map(card => card.title)).size).toBe(24);
  for (const role of ['possessed', 'exorcist']) expect(CARD_BANK.filter(card => card.role === role)).toHaveLength(12);
  for (const card of CARD_BANK) {
    expect(card.difficulty).toBe(1);
    const fields = card.role === 'possessed' ? [card.behavior, card.clue, card.releaseCondition] : [card.mission];
    for (const field of fields) expect(field.trim().length).toBeGreaterThan(10);
    expect(card).not.toHaveProperty('infectionTrigger');
  }
});

describe('dealing rules', () => {
  const sizes = Array.from({ length: 9 }, (_, i) => i + 4).flatMap(n => Array.from({ length: Math.floor(n / 2) }, (_, i) => [n, i + 1]));
  it.each(sizes)('deals %i participants with %i possessed and no duplicate cards', (n, count) => {
    const { dealing } = setup(n, count);
    const cards = issued(dealing);
    expect(cards.filter(item => item.card.role === 'possessed')).toHaveLength(count);
    expect(new Set(cards.map(item => item.card.id)).size).toBe(n);
    expect(dealing.publicState()).toMatchObject({ phase: 'reading', compositionValid: true });
  });
  it('rejects invalid composition without discarding an existing deal', () => {
    const { dealing } = setup(); const before = issued(dealing);
    for (const [n, count] of [[3, 1], [13, 1], [7, 0], [7, 4], [7, 1.5]]) {
      expect(dealing.deal(Array.from({ length: n }, (_, i) => `x${i}`), count)).toBe('INVALID_COMPOSITION');
      expect(issued(dealing)).toEqual(before);
    }
  });
  it('replaces one card preserving role and resets only its status', () => {
    const { dealing, players } = setup();
    for (const player of players) dealing.change(player, dealing.personal(player)!.id, 'ready', true);
    const before = issued(dealing); const original = dealing.personal(players[0])!;
    dealing.change(players[0], original.id, 'request', true);
    expect(dealing.personal(players[0])).toMatchObject({ ready: false, replacementRequested: true });
    expect(dealing.change(players[0], original.id, 'ready', true)).toBe('REPLACEMENT_PENDING');
    expect(dealing.change(players[0], original.id, 'replace')).toBeUndefined();
    const replacement = dealing.personal(players[0])!;
    expect(replacement.card.role).toBe(original.card.role);
    expect(replacement.card.id).not.toBe(original.card.id);
    expect(replacement).toMatchObject({ ready: false, replacementRequested: false });
    for (const previous of before.filter(item => item.playerId !== players[0])) expect(dealing.personal(previous.playerId)).toEqual({ id: previous.id, card: previous.card, ready: true, replacementRequested: false });
    expect(dealing.change(players[0], original.id, 'ready', true)).toBe('STALE_CARD');
  });
  it('cancels a request without restoring readiness; projections do not mutate state', () => {
    const { dealing, players } = setup(); const player = players[0];
    const card = dealing.personal(player)!;
    dealing.change(player, card.id, 'ready', true); dealing.change(player, card.id, 'request', true); dealing.change(player, card.id, 'request', false);
    expect(dealing.personal(player)).toMatchObject({ ready: false, replacementRequested: false });
    card.card.title = 'tampered';
    const state = dealing.publicState(); state.assignments[0].ready = true;
    expect(dealing.personal(player)!.card.title).not.toBe('tampered');
    expect(dealing.personal(player)!.ready).toBe(false);
  });
  it('reshuffles every card, changes deal identity and resets status', () => {
    const { dealing, players } = setup(12, 1);
    const before = issued(dealing); const state = dealing.publicState();
    for (const player of players) dealing.change(player, dealing.personal(player)!.id, 'ready', true);
    expect(dealing.deal(players, 1)).toBeUndefined();
    expect(dealing.publicState().dealId).not.toBe(state.dealId);
    expect(dealing.publicState().version).toBe(state.version + 1);
    for (const previous of before) {
      const current = dealing.personal(previous.playerId)!;
      expect(current.card.id).not.toBe(previous.card.id);
      expect(current.id).not.toBe(previous.id);
      expect(current.ready).toBe(false);
    }
  });
  it('adds late participants without changing existing cards or readiness', () => {
    const { dealing } = setup(4, 2);
    const first = issued(dealing)[0]; dealing.change(first.playerId, first.id, 'ready', true);
    const before = issued(dealing); const version = dealing.publicState().version;
    dealing.add('late');
    expect(dealing.personal('late')!.card.role).toBe('exorcist');
    for (const item of before) expect(dealing.personal(item.playerId)).toEqual({ id: item.id, card: item.card, ready: item.ready, replacementRequested: item.replacementRequested });
    const stable = dealing.personal('late'); dealing.add('late'); expect(dealing.personal('late')).toEqual(stable);
    dealing.add('later'); expect(dealing.personal('later')!.card.role).toBe('possessed');
    expect(dealing.publicState().version).toBe(version);
  });
  it('repairs missing roles after departures and retains a spare card at capacity', () => {
    const { dealing } = setup(12, 1);
    for (const item of issued(dealing).filter(item => item.card.role === 'possessed')) dealing.remove(item.playerId);
    dealing.add('replacement'); expect(dealing.personal('replacement')!.card.role).toBe('possessed');
    for (const item of issued(dealing)) expect(dealing.change(item.playerId, item.id, 'replace')).toBeUndefined();
    for (const item of issued(dealing).filter(item => item.card.role === 'exorcist')) dealing.remove(item.playerId);
    const remaining = issued(dealing);
    expect(dealing.publicState().compositionValid).toBe(false);
    dealing.add('first-exorcist'); dealing.add('second-exorcist');
    expect(dealing.personal('first-exorcist')!.card.role).toBe('exorcist');
    expect(dealing.personal('second-exorcist')!.card.role).toBe('exorcist');
    expect(dealing.personal(remaining[0].playerId)!.id).toBe(remaining[0].id);
  });
  it('exposes no roles or content publicly and clears all assignments on cancellation', () => {
    const { dealing, players } = setup();
    const state = JSON.stringify(dealing.publicState());
    for (const card of CARD_BANK) { expect(state).not.toContain(card.id); expect(state).not.toContain(card.title); }
    expect(state).not.toContain('role'); expect(state).not.toContain('exorcists');
    const version = dealing.publicState().version;
    dealing.cancel();
    expect(dealing.publicState()).toMatchObject({ phase: 'lobby', dealId: null, version: version + 1, assignments: [] });
    for (const player of players) expect(dealing.personal(player)).toBeNull();
    dealing.add('late'); expect(dealing.personal('late')).toBeNull();
  });
});
