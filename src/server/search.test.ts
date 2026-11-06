import { expect, it } from 'vitest';
import { createSearch } from './search.js';
import { createDealing } from './dealing.js';

function setup() {
  let seq = 0; const id = () => `event-${++seq}`;
  const dealing = createDealing({ generateId: id, randomIndex: () => 0 });
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']; dealing.deal(ids, 3);
  const initial = new Map(ids.map(id => [id, dealing.personal(id)!]));
  const roots = ids.filter(id => initial.get(id)!.card.role === 'possessed'), exorcists = ids.filter(id => !roots.includes(id));
  const play = createSearch('round-id', initial, id);
  return { play, roots, exorcists, initial };
}
it('supports chained capture, shared cards and one rescue for a whole group', () => {
  const { play, roots: [root], exorcists: [a, b] } = setup();
  expect(play.act(root, 'infect', a)).toBeUndefined(); expect(play.act(a, 'infect', b)).toBeUndefined();
  expect(play.personal(a)).toMatchObject({ status: 'captured', missionEligible: false });
  expect(play.personal(b)!.card).toEqual(play.personal(root)!.card);
  expect(play.act(b, 'release')).toBeUndefined();
  for (const id of [root, a, b]) expect(play.personal(id)!.status).toBe('released');
  expect(play.result(1, 'provisional', 0)).toMatchObject({ rescuedGroups: 1, totalGroups: 3, infectedPlayers: 2 });
  expect(play.act(root, 'release')).toBe('ACTION_UNAVAILABLE');
});
it('rejects invalid capture targets without changing state', () => {
  const { play, roots, exorcists: [a] } = setup();
  for (const target of [roots[0], roots[1], 'missing']) expect(play.act(roots[0], 'infect', target)).toBe('ACTION_UNAVAILABLE');
  play.act(roots[0], 'infect', a); expect(play.act(roots[1], 'infect', a)).toBe('ACTION_UNAVAILABLE');
  play.act(a, 'release'); expect(play.act(a, 'infect', roots[1])).toBe('ACTION_UNAVAILABLE');
});
it('loses mission credit on capture and restores it only by an allowed capture undo', () => {
  const { play, roots: [root], exorcists: [a] } = setup();
  play.act(a, 'mission', undefined, true); expect(play.result(1, 'provisional', 0).missions).toBe(1);
  const key = play.personal(a)!.cardKey;
  play.act(root, 'infect', a); expect(play.result(1, 'provisional', 0).missions).toBe(0);
  expect(play.act(a, 'mission', undefined, true)).toBe('ACTION_UNAVAILABLE');
  expect(play.undo(root, play.personal(root)!.undo!.id)).toBeUndefined();
  expect(play.personal(a)).toMatchObject({ status: 'exorcist', missionEligible: true, missionCompleted: true });
  expect(play.personal(a)!.cardKey).not.toBe(key);
  expect(play.result(1, 'provisional', 0).missions).toBe(1);
});
it('blocks dependent undo while allowing independent group actions', () => {
  const { play, roots: [root, other], exorcists: [a, b] } = setup();
  play.act(root, 'infect', a); const first = play.personal(root)!.undo!.id;
  play.act(a, 'infect', b); expect(play.undo(root, first)).toBe('UNDO_DEPENDENCY');
  play.act(other, 'release');
  expect(play.undo(a, play.personal(a)!.undo!.id)).toBeUndefined();
  expect(play.undo(root, first)).toBeUndefined();
  expect(play.personal(a)!.status).toBe('exorcist'); expect(play.result(1, 'provisional', 0).rescuedGroups).toBe(1);
});
it('release depends on all captures; undoing it restores the group without granting mission credit', () => {
  const { play, roots: [root], exorcists: [a] } = setup(); play.act(root, 'infect', a);
  const capture = play.personal(root)!.undo!.id; play.act(a, 'release');
  expect(play.undo(root, capture)).toBe('UNDO_DEPENDENCY');
  play.undo(a, play.personal(a)!.undo!.id);
  expect(play.personal(a)).toMatchObject({ status: 'captured', missionEligible: false });
  expect(play.result(1, 'provisional', 0).rescuedGroups).toBe(0);
});
it('retains denominators, cards and outcomes after departure, and preserves a group without its root', () => {
  const { play, roots: [root], exorcists: [a, b] } = setup();
  play.act(b, 'mission', undefined, true); play.act(root, 'infect', a); play.depart(root); play.depart(b);
  expect(play.personal(root)).toBeNull(); expect(play.personal(a)!.card.role).toBe('possessed');
  play.act(a, 'release');
  expect(play.result(1, 'provisional', 0)).toMatchObject({ rescuedGroups: 1, totalGroups: 3, totalMissions: 4, missions: 1 });
});
it('ends search when all group members leave or no exorcists remain; projections are detached', () => {
  const { play, roots, exorcists } = setup(); expect(play.canSearch()).toBe(true);
  const view = play.personal(roots[0])!; view.card.title = 'mutated'; expect(play.personal(roots[0])!.card.title).not.toBe('mutated');
  for (const id of exorcists) play.act(roots[0], 'infect', id);
  expect(play.canSearch()).toBe(false);
  const other = setup(); other.roots.forEach(id => other.play.depart(id)); expect(other.play.canSearch()).toBe(false);
});
it('seals all edits and undos without losing results', () => {
  const { play, roots: [root] } = setup(); play.act(root, 'release'); const event = play.personal(root)!.undo!;
  play.seal(); expect(play.undo(root, event.id)).toBe('RESULTS_FINAL');
  expect(play.act(root, 'release')).toBe('RESULTS_FINAL'); expect(play.personal(root)!.undo!.available).toBe(false);
});
