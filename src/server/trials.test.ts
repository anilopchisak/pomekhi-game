import { expect, it } from 'vitest';
import type { PersonalPlay, TrialValue, Venue } from '../shared/protocol.js';
import { authoredTrials } from './authored-content.js';
import { beginTrial, personalTrial, selectTrials, submitTrial, trialBonus, trialReview, reviewTrialEvidence, validateTrials } from './trials.js';
import type { TrialRound } from './trials.js';

type Values = Record<string, TrialValue>;
const venue: Venue = { base: 'База', zones: ['Кухня', 'Двор'], harder: true, features: ['dimLight', 'scary'] };
const play = (status: PersonalPlay['status'], wasCaptured = false): PersonalPlay => ({
  status, wasCaptured, roundId: 'round', version: 0, cardKey: 'card', missionCompleted: false, missionEligible: false, undo: null,
  card: { id: 'e', role: 'exorcist', title: 'Миссия', mission: 'Миссия', difficulty: 1 },
});
const players = [
  { id: 'actor', name: 'Actor', play: play('exorcist'), returned: true },
  { id: 'one', name: 'One', play: play('possessed'), returned: false },
  { id: 'two', name: 'Two', play: play('possessed'), returned: false },
];
const card = (id: string) => authoredTrials.find(entry => entry.id === id)!;
const report = (playerId: string, values: Values) => ({ playerId, values, accepted: true });
function round(branch: TrialRound['branch'], a: Values, first?: Values, second?: Values): TrialRound {
  return { actor: 'actor', branch, eligibleTargets: ['one', 'two'], earlyReturn: false, replied: false,
    reports: [report('actor', a), ...(first ? [report('one', first)] : []), ...(second ? [report('two', second)] : [])] };
}

const descriptions = { height: 'Высокий', clothes: 'Серая одежда', motion: 'Хромает' };
const cases: [string, Values, Values, Values?, Values?][] = [
  ['T002', { target: 'one', other: 'two', first: true, second: true }, { did: true }, { did: false }, { did: true }],
  ['T005', { target: 'one', other: 'two', zone: 'Кухня', otherZone: 'Двор', answer: 'кивок', otherAnswer: 'да' }, { did: true }, { did: false }, { did: true }],
  ['T006', { target: 'one', zone: 'Кухня', did: true }, { noticed: true, speech: true, motion: false }, undefined, { noticed: true, speech: true, motion: true, breath: true }],
  ['T007', { target: 'one', did: true }, { noticed: true, look: false }, undefined, { noticed: true, look: true, back: true }],
  ['T008', { target: 'one', name: 'Элиас' }, { name: 'элиас' }, undefined, { saidName: 'Элиас' }],
  ['T009', { target: 'one', did: true, separate: true, first: true }, { did: true, separate: true, first: false }, undefined, { did: true, separate: true, first: true }],
  ['T010', { target: 'one', other: 'two', ...descriptions }, descriptions, { ...descriptions, height: 'Низкий' }, descriptions],
];
it.each(cases)('%s distinguishes both prophecy branches using independent reports', (id, a, one, two, lateEvidence) => {
  expect(trialBonus(card(id), round('early', a, one, two), players)).toBe(1);
  expect(trialBonus(card(id), round('late', a, one, two), players)).toBe(0);
  const late = two ? round('late', a, one, lateEvidence) : round('late', a, lateEvidence);
  expect(trialBonus(card(id), late, players)).toBe(1);
  expect(trialBonus(card(id), late, players.filter(player => player.id !== 'one'))).toBe(0);
});

it.each([
  ['T002', { first: true, second: false }],
  ['T005', { zone: 'Кухня', otherZone: 'Двор', answer: 'кивок' }],
] as [string, Values][])('%s does not use the second witness for an unnamed first encounter', (id, values) => {
  const wrongEncounter = round('early', { ...values, other: 'two' }, undefined, { did: true });
  expect(trialBonus(card(id), wrongEncounter, players)).toBe(0);
  const secondEncounter: Values = id === 'T002' ? { second: true } : { zone: 'Кухня', otherZone: 'Двор', otherAnswer: 'кивок' };
  expect(trialBonus(card(id), round('early', { ...secondEncounter, other: 'two' }, undefined, { did: true }), players)).toBe(1);
});

it('T001 distinguishes physical return from capture; T011 requires a real release for the late branch', () => {
  const early = round('early', { target: 'one', did: true, released: true }, { did: true, released: true, captured: false });
  const late = { ...early, branch: 'late' as const };
  expect(trialBonus(card('T001'), early, players)).toBe(1);
  expect(trialBonus(card('T001'), late, players)).toBe(0);
  expect(trialBonus(card('T001'), late, [{ ...players[0], play: play('released', true) }, ...players.slice(1)])).toBe(1);
  expect(trialBonus(card('T011'), early, players)).toBe(1);
  expect(trialBonus(card('T011'), late, players)).toBe(0);
  expect(trialBonus(card('T011'), late, [players[0], { ...players[1], play: play('released') }, players[2]])).toBe(1);
});

it.each(['T001', 'T011'])('%s hides target roles without awarding credit for a free target', id => {
  const c = card(id);
  const participants = [...players, { id: 'free', name: 'Free', play: play('exorcist'), returned: false }];
  const active = beginTrial(c, participants, () => 0);
  const form = personalTrial(c, active, 'actor', 'search', participants, venue, false, false);
  expect(form?.fields.find(field => field.id === 'target')?.choices?.map(choice => choice.id)).toEqual(['one', 'two', 'free']);
  expect(submitTrial(c, active, 'actor', { target: 'free', did: true }, 'search', participants, venue, false, false)).toBeUndefined();
  expect(submitTrial(c, active, 'free', { did: true, ...(id === 'T011' ? { captured: false } : {}) }, 'return', participants, venue, false, false)).toBeUndefined();
  expect(trialBonus(c, { ...active, branch: 'early' }, participants)).toBe(0);
});

it('T003 privately acknowledges an address and needs explicit evidence for silence', () => {
  const c = card('T003');
  const r = beginTrial(c, players, () => 0);
  expect(personalTrial(c, r, 'one', 'search', players, venue, false, false)).toBeUndefined();
  expect(submitTrial(c, r, 'actor', { did: true }, 'search', players, venue, false, false)).toBeUndefined();
  expect(personalTrial(c, r, 'actor', 'search', players, venue, false, false)?.message).toBe('Обращение принято. Разговор окончен.');
  expect(trialBonus(c, { ...r, branch: 'early' }, players)).toBe(1);
  expect(trialBonus(c, { ...r, branch: 'late' }, players)).toBe(0);
  const silent = beginTrial(c, players, () => 0);
  expect(trialBonus(c, { ...silent, branch: 'late' }, players)).toBe(0);
  expect(submitTrial(c, silent, 'actor', { did: false }, 'return', players, venue, false, false)).toBeUndefined();
  expect(trialBonus(c, { ...silent, branch: 'late' }, players)).toBe(1);
});

it('T004 enforces the private ordered visit and distinct negative branch', () => {
  const c = card('T004');
  const r = beginTrial(c, players, () => 0);
  const submit = (values: Values) => submitTrial(c, r, 'actor', values, 'search', players, venue, false, false);
  expect(submit({ returned: true })).toBe('ACTION_UNAVAILABLE');
  expect(submit({ visit: true, returned: true })).toBeUndefined();
  expect(personalTrial(c, r, 'actor', 'search', players, venue, false, false)?.message).toBe('Верни зов на место.');
  expect(submit({ repeat: true })).toBeUndefined();
  expect(trialBonus(c, { ...r, branch: 'early' }, players)).toBe(1);
  expect(trialBonus(c, { ...r, branch: 'late' }, players)).toBe(0);
  const missing = beginTrial(c, players, () => 0);
  expect(trialBonus(c, { ...missing, branch: 'late' }, players)).toBe(0);
  expect(submitTrial(c, missing, 'actor', { returned: false }, 'between_rounds', players, venue, false, false)).toBeUndefined();
  expect(trialBonus(c, { ...missing, branch: 'late' }, players)).toBe(1);
});

it('freezes seven eligible trials and never sends memory answers to a witness', () => {
  expect(selectTrials(venue, () => 0)?.deck).toHaveLength(7);
  const c = card('T010'), r = beginTrial(c, players, () => 0);
  const targets = { target: 'one', other: 'two' };
  const submit = (values: Values, phase: 'search' | 'return' = 'search') => submitTrial(c, r, 'actor', values, phase, players, venue, false, false);
  expect(submit({ ...targets, ...descriptions })).toBe('INVALID_INPUT');
  expect(submit(descriptions, 'return')).toBe('ACTION_UNAVAILABLE');
  expect(submit(descriptions)).toBeUndefined();
  expect(personalTrial(c, r, 'one', 'return', players, venue, false, false)).toBeUndefined();
  expect(submit({ ...targets, height: 'Подмена' }, 'return')).toBe('INVALID_INPUT');
  expect(submit(targets, 'return')).toBeUndefined();
  const witness = personalTrial(c, r, 'one', 'return', players, venue, false, false);
  expect(witness?.values).toEqual({});
  expect(JSON.stringify(witness)).not.toContain(descriptions.height);
  expect(submitTrial(c, r, 'one', descriptions, 'return', players, venue, false, false)).toBeUndefined();
  expect(submitTrial(c, r, 'one', descriptions, 'return', players, venue, false, false)).toBe('ACTION_UNAVAILABLE');
  expect(JSON.stringify(personalTrial(c, r, 'two', 'return', players, venue, false, false))).not.toContain(descriptions.height);
});

it('keeps a late T004 visit separate through restore and either decision', () => {
  const c = card('T004'), active = beginTrial(c, players, () => 0);
  const late = (r: TrialRound, sealed = false) => submitTrial(c, r, 'actor', { repeat: true }, 'return', players, venue, false, sealed);
  expect(late(active)).not.toBeUndefined();
  expect(submitTrial(c, active, 'actor', { visit: true, returned: true }, 'search', players, venue, false, false)).toBeUndefined();
  expect(late(active, true)).toBe('ACTION_UNAVAILABLE');
  expect(late(active)).toBeUndefined();
  expect(late(active)).toBe('ACTION_UNAVAILABLE');

  const restored = { ...selectTrials(venue, () => 0)!, current: { ...active, branch: 'early' as const } };
  const checkpoint = JSON.parse(JSON.stringify(restored));
  validateTrials(checkpoint);
  expect(personalTrial(c, checkpoint.current!, 'actor', 'between_rounds', players, venue, false, false)?.lateVisit).toBe('review');
  expect(trialBonus(c, checkpoint.current!, players)).toBe(0);
  expect(reviewTrialEvidence(c, checkpoint.current!, 'actor', true, 'repeat')).toBeUndefined();
  expect(trialBonus(c, checkpoint.current!, players)).toBe(1);
  expect(trialBonus(c, { ...checkpoint.current!, branch: 'late' }, players)).toBe(0);
  expect(reviewTrialEvidence(c, restored.current, 'actor', false, 'repeat')).toBeUndefined();
  expect(restored.current.reports[0].values).toEqual({ visit: true, returned: true });
  expect(trialBonus(c, restored.current, players)).toBe(0);
});

it('allows a T006 witness to add a fact without rewriting prior evidence', () => {
  const c = card('T006'), r = round('early', { target: 'one', zone: 'Кухня', did: true });
  const submit = (values: Values, sealed = false) => submitTrial(c, r, 'one', values, 'between_rounds', players, venue, false, sealed);
  expect(submit({ noticed: true })).toBeUndefined();
  expect(trialBonus(c, r, players)).toBe(0);
  expect(submit({ noticed: false, speech: true })).toBe('ACTION_UNAVAILABLE');
  expect(submit({ speech: true }, true)).toBe('ACTION_UNAVAILABLE');
  expect(submit({ speech: true })).toBeUndefined();
  expect(personalTrial(c, r, 'one', 'between_rounds', players, venue, false, false)?.values).toEqual({ noticed: true, speech: true });
  expect(trialBonus(c, r, players)).toBe(1);
});

it('uses T010 equivalence per witness and trait only when both reports contain an answer', () => {
  const c = card('T010'), r = round('early', { target: 'one', other: 'two', ...descriptions, clothes: 'Серое пальто' },
    { ...descriptions, clothes: 'Пальто серое' }, { height: descriptions.height, clothes: 'Серое пальто' });
  expect(trialBonus(c, r, players)).toBe(0);
  expect(reviewTrialEvidence(c, r, 'two', true, 'motion')).toBe('ACTION_UNAVAILABLE');
  expect(trialReview(c, r, players, venue).traitComparisons).toEqual([
    { playerId: 'one', trait: 'clothes', label: 'Одежда', original: 'Серое пальто', answer: 'Пальто серое', equivalent: false },
  ]);
  expect(reviewTrialEvidence(c, r, 'one', true, 'clothes')).toBeUndefined();
  const restored = { ...selectTrials(venue, () => 0)!, current: r };
  const checkpoint = JSON.parse(JSON.stringify(restored));
  validateTrials(checkpoint);
  const saved = checkpoint.current!;
  expect(trialBonus(c, saved, players)).toBe(1);
  saved.branch = 'late';
  expect(trialBonus(c, saved, players)).toBe(0);
  expect(submitTrial(c, saved, 'two', { motion: descriptions.motion }, 'between_rounds', players, venue, false, false)).toBeUndefined();
  expect(trialBonus(c, saved, players)).toBe(1);
  expect(reviewTrialEvidence(c, saved, 'one', false, 'clothes')).toBeUndefined();
  expect(trialBonus(c, saved, players)).toBe(0);
});
