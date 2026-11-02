import { expect, it } from 'vitest';
import { createRitual, newRitual, ritualSetup, validateRitual } from './ritual.js';
import type { RoundResult } from '../shared/protocol.js';
const row = (number: number, successes = 7): RoundResult => ({ roundId: `round-${number}`, number, kind: 'regular', status: 'final', difficulty: 1, infectionEnabled: true, rescuedGroups: Math.min(3, successes), missions: Math.max(0, successes - 3), totalGroups: 3, totalMissions: 4, infectedPlayers: 0, activeMs: 1000 });
function fixture(players = 7, rounds = 7) { let id = 0; return newRitual(players, rounds, () => 0, () => `penalty-${++id}`); }
it('scales every supported composition/length to an attainable exact step budget', () => {
  for (let n = 4; n <= 12; n++) for (let r = 1; r <= 99; r++) {
    const { target, positions: [a, b, c, out] } = ritualSetup(n, r);
    expect(a).toBeGreaterThanOrEqual(1); expect(Math.min(b, c, out)).toBeGreaterThanOrEqual(0);
    expect(3 * a + 2 * b + c).toBe(target); expect(target).toBeLessThanOrEqual(n * r);
  }
  expect(ritualSetup(7, 7)).toEqual({ target: 28, positions: [7, 2, 3, 0] });
});
it('conceals selected rules, previews without revealing, advances in order and wins early', () => {
  const r = fixture(), closed = r.snapshot();
  expect(JSON.stringify(closed)).not.toContain('Имена стёрты');
  expect(r.snapshot({ ...row(1), status: 'provisional' }).preview?.remainingSteps).toBe(21);
  expect(r.snapshot().cards.every(c => !c.revealed)).toBe(true);
  for (let n = 1; n <= 4; n++) expect(r.commit(row(n))).toBeUndefined();
  expect(r.snapshot()).toMatchObject({ positions: [0, 0, 0, 12], outcome: 'won', remainingSteps: 0 });
  expect(r.snapshot().cards.every(c => c.revealed)).toBe(true);
  expect(r.penalty()).toBe('ACTION_UNAVAILABLE'); expect(r.commit(row(5))).toBe('RESULTS_FINAL');
});
it('moves the most-filled eligible pile back, retains revealed rules and bounds undo', () => {
  const r = fixture(); r.commit(row(1)); expect(r.penalty()).toBeUndefined();
  expect(r.snapshot()).toMatchObject({ positions: [1, 8, 3, 0], canUndoPenalty: true });
  expect(r.snapshot().cards[0].revealed).toBe(true); r.undoPenalty();
  expect(r.snapshot().positions).toEqual([0, 9, 3, 0]); expect(r.undoPenalty()).toBe('ACTION_UNAVAILABLE');
  r.penalty(); r.lock(); expect(r.undoPenalty()).toBe('ACTION_UNAVAILABLE');
  r.commit(row(2)); expect(r.snapshot().canUndoPenalty).toBe(false);
});
it('never opens empty later slots out of sequence, never creates debt and prioritizes victory on the last round', () => {
  const r = fixture(4, 1); expect(r.snapshot().cards.every(c => !c.revealed)).toBe(true);
  expect(r.penalty()).toBe('ACTION_UNAVAILABLE'); r.commit(row(1, 3)); expect(r.snapshot().outcome).toBe('won');
  const loss = fixture(4, 1); loss.commit(row(1, 2)); expect(loss.snapshot().outcome).toBe('lost');
});
it('does not count tutorial/aborted rows, rejects unsealed rows and deduplicates sealed rounds', () => {
  const r = fixture(); r.commit({ ...row(1), kind: 'tutorial', number: 0 }); r.commit({ ...row(1), status: 'aborted' });
  expect(r.snapshot().remainingSteps).toBe(28); expect(r.commit({ ...row(1), status: 'provisional' })).toBe('INVALID_INPUT');
  r.commit(row(1)); const before = r.exportState(); r.commit(row(1)); expect(r.exportState()).toEqual(before);
  expect(r.commit(row(1, 3))).toBe('INVALID_INPUT');
});
it('restores full issued rules, undo and closed outcomes; rejects malformed histories', () => {
  const r = fixture(); r.commit(row(1)); r.penalty();
  const saved = r.exportState(); expect(() => validateRitual(saved)).not.toThrow();
  const restored = createRitual(JSON.parse(JSON.stringify(saved)), () => 'next'); expect(restored.snapshot()).toEqual(r.snapshot());
  restored.undoPenalty(); restored.stop(); expect(() => validateRitual(restored.exportState())).not.toThrow();
  expect(restored.snapshot().outcome).toBe('stopped');
  const bad = structuredClone(saved); bad.events.push({ kind: 'round', id: 'bad', number: 9, successes: 99 });
  expect(() => validateRitual(bad)).toThrow();
});
it('breaks eligible-pile ties toward the exit and never creates penalty debt', () => {
  const r = fixture(); for (let n = 1; n <= 3; n++) r.commit(row(n)); r.commit(row(4, 1));
  expect(r.snapshot().positions).toEqual([0, 0, 6, 6]); r.penalty(); expect(r.snapshot().positions).toEqual([0, 0, 7, 5]);
  for (let n = 0; n < 100; n++) r.penalty();
  const stopped = r.snapshot(); expect(stopped.positions).toEqual([12, 0, 0, 0]); expect(stopped.canPenalize).toBe(false);
  expect(r.penalty()).toBe('ACTION_UNAVAILABLE'); expect(r.snapshot()).toEqual(stopped);
});
