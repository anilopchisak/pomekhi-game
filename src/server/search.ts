import type { Assignment, LobbyError, PersonalPlay, RoundResult } from '../shared/protocol.js';

type Action = { kind: 'infect'; actor: string; target: string; group: string }
  | { kind: 'release'; actor: string; group: string }
  | { kind: 'mission'; actor: string; completed: boolean }
  | { kind: 'depart'; actor: string };
interface Event { id: string; action: Action; touches: Set<string>; undone: boolean }
interface State { group: string | null; released: boolean; left: boolean; captured: boolean; mission: boolean; cardKey: string }
export interface RetainedGroup {
  id: string; origin: string; assignment: Assignment; location: string | null;
  members: [string, Assignment][];
}
export interface SavedSearch {
  roundId: string; roster: [string, Assignment][]; events: { id: string; action: Action; touches: string[]; undone: boolean }[];
  version: number; finalized: boolean; retained?: RetainedGroup[]; locations?: [string, string][];
}

/** A round-local action ledger. Rebuild once per mutation; projections are detached reads. */
export function createSearch(roundId: string, initial: ReadonlyMap<string, Assignment>, generateId: () => string, retained?: RetainedGroup[]) {
  const roster = new Map([...initial].map(([id, assignment]) => [id, structuredClone(assignment)]));
  const inherited = structuredClone(retained ?? []);
  const inheritedMembers = new Map(inherited.flatMap(group => group.members.map(([id]) => [id, group] as const)));
  const groups = new Map(inherited.map(group => [group.id, { origin: group.origin, assignment: group.assignment }]));
  for (const [id, assignment] of roster) if (assignment.card.role === 'possessed' && !inheritedMembers.has(id))
    groups.set(retained ? assignment.id : id, { origin: id, assignment });
  const initialGroups = new Map([...groups].filter(([id]) => !inherited.some(g => g.id === id)).map(([id, group]) => [group.origin, id]));
  let locations = new Map(inherited.flatMap(g => g.location === null ? [] : [[g.id, g.location] as const]));
  const events: Event[] = [];
  let states = new Map<string, State>();
  let released = new Set<string>();
  let version = 0, finalized = false;

  function rebuild() {
    states = new Map([...roster].map(([id, a]) => {
      const carried = inheritedMembers.get(id);
      return [id, { group: carried?.id ?? initialGroups.get(id) ?? null,
        released: false, left: false, captured: !!carried && carried.origin !== id, mission: false, cardKey: carried?.id ?? a.id }];
    }));
    released = new Set();
    for (const event of events) {
      if (event.undone) continue;
      const action = event.action, player = states.get(action.actor)!;
      if (action.kind === 'depart') player.left = true;
      else if (action.kind === 'mission') player.mission = action.completed;
      else if (action.kind === 'infect') {
        const target = states.get(action.target)!;
        target.group = action.group; target.captured = true; target.cardKey = event.id;
      } else {
        const freed = [...event.touches].filter(key => key.startsWith('g:')).map(key => key.slice(2));
        for (const group of freed) released.add(group);
        for (const state of states.values()) if (state.group && freed.includes(state.group)) state.released = true;
      }
    }
  }
  rebuild();
  function append(action: Action, touches: string[]) {
    events.push({ id: generateId(), action, touches: new Set(touches), undone: false }); version++; rebuild();
  }
  function latest(playerId: string) { return events.findLast(event => !event.undone && event.action.actor === playerId && event.action.kind !== 'depart'); }
  function dependent(event: Event) {
    return events.slice(events.indexOf(event) + 1).some(next => !next.undone && [...next.touches].some(key => event.touches.has(key)));
  }
  function personal(playerId: string): PersonalPlay | null {
    const state = states.get(playerId), assignment = roster.get(playerId);
    if (!state || state.left || !assignment) return null;
    const event = latest(playerId);
    const cardVersion = versionForCard(playerId);
    const cardKey = retained
      ? state.group ?? (cardVersion ? `${assignment.id}:${cardVersion}` : assignment.id)
      : `${state.cardKey}:${cardVersion}`;
    return { roundId, version, status: state.released ? 'released' : state.captured ? 'captured' : state.group ? 'possessed' : 'exorcist',
      card: structuredClone(state.group ? groups.get(state.group)!.assignment.card : assignment.card), cardKey,
      ...(retained ? { location: state.group ? locations.get(state.group) ?? null : null, retained: inheritedMembers.has(playerId) } : {}),
      wasCaptured: state.captured, missionCompleted: state.mission, missionEligible: assignment.card.role === 'exorcist' && !state.captured,
      undo: event ? { id: event.id, label: event.action.kind === 'infect' ? 'Заражение' : event.action.kind === 'release' ? 'Освобождение группы' : 'Отметка миссии', available: !finalized && !dependent(event) } : null };
  }
  // Undoing capture also closes a previously revealed card, without closing unrelated cards.
  function versionForCard(playerId: string) { return events.filter(e => e.action.kind === 'infect' && e.action.target === playerId).map(e => `${e.id}:${e.undone}`).join(','); }
  function act(actor: string, kind: 'infect' | 'release' | 'mission', target?: string, completed?: boolean): LobbyError | undefined {
    if (finalized) return 'RESULTS_FINAL';
    const player = states.get(actor);
    if (!player || player.left) return 'ACTION_UNAVAILABLE';
    if (kind === 'mission') {
      if (roster.get(actor)!.card.role !== 'exorcist' || player.captured) return 'ACTION_UNAVAILABLE';
      append({ kind, actor, completed: completed! }, [`p:${actor}`]);
    } else {
      if (!player.group || player.released) return 'ACTION_UNAVAILABLE';
      if (kind === 'infect') {
        const other = states.get(target!);
        if (!other || other.left || other.group || other.released || target === actor) return 'ACTION_UNAVAILABLE';
        append({ kind, actor, target: target!, group: player.group }, [`p:${actor}`, `p:${target}`, `g:${player.group}`]);
      } else {
        const matching = [...groups].filter(([id, group]) => id === player.group || retained && !released.has(id) && locations.has(id) &&
          locations.get(id) === locations.get(player.group!) && group.assignment.card.id === groups.get(player.group!)!.assignment.card.id)
          .map(([id]) => id);
        const members = [...states].filter(([, state]) => state.group && matching.includes(state.group)).map(([id]) => `p:${id}`);
        append({ kind, actor, group: player.group }, [...matching.map(id => `g:${id}`), ...members]);
      }
    }
  }
  function undo(actor: string, actionId: string): LobbyError | undefined {
    if (finalized) return 'RESULTS_FINAL';
    const event = latest(actor);
    if (!event || event.id !== actionId || states.get(actor)?.left) return 'ACTION_UNAVAILABLE';
    if (dependent(event)) return 'UNDO_DEPENDENCY';
    event.undone = true; version++; rebuild();
  }
  function depart(playerId: string) {
    const state = states.get(playerId);
    if (state && !state.left && !finalized) append({ kind: 'depart', actor: playerId }, [`p:${playerId}`, ...(state.group ? [`g:${state.group}`] : [])]);
  }
  function canSearch() {
    const live = [...states.values()].filter(s => !s.left);
    return live.some(s => !s.group && !s.released) && live.some(s => s.group && !s.released);
  }
  function result(number: number, status: RoundResult['status'], activeMs: number): Omit<RoundResult, 'kind' | 'difficulty' | 'infectionEnabled'> {
    return { roundId, number, status, activeMs, rescuedGroups: released.size, totalGroups: groups.size,
      missions: [...states].filter(([id, s]) => roster.get(id)!.card.role === 'exorcist' && s.mission && !s.captured).length,
      totalMissions: [...roster].filter(([id, a]) => a.card.role === 'exorcist' && !inheritedMembers.has(id)).length,
      infectedPlayers: [...states].filter(([id, s]) => s.captured && !inheritedMembers.has(id)).length };
  }
  function carry(eligible: ReadonlySet<string>): RetainedGroup[] {
    return [...groups].filter(([id]) => !released.has(id)).flatMap(([id, group]) => {
      const members = [...roster].filter(([playerId]) => eligible.has(playerId) && states.get(playerId)?.group === id && !states.get(playerId)?.left);
      return members.length ? [{ id, ...group, members, location: locations.get(id) ?? null }] : [];
    });
  }
  function place(actor: string, zone: string) {
    const id = initialGroups.get(actor);
    if (!id || states.get(actor)?.left || finalized) return 'ACTION_UNAVAILABLE';
    locations.set(id, zone);
  }
  function exportState(): SavedSearch { return structuredClone({ roundId, roster: [...roster], events: events.map(e => ({ ...e, touches: [...e.touches] })), version, finalized,
    ...(retained ? { retained: inherited, locations: [...locations] } : {}) }); }
  function restore(state: SavedSearch, bump = true) {
    events.splice(0, events.length, ...structuredClone(state.events).map(e => ({ ...e, touches: new Set(e.touches) })));
    locations = new Map(state.locations ?? []); version = state.version + Number(bump); finalized = state.finalized; rebuild();
  }
  return { group: (playerId: string) => states.get(playerId)?.group ?? null, personal, act, undo, depart, canSearch, result, carry, place,
    targets: () => [...states].filter(([, s]) => !s.group && !s.released && !s.left).map(([id]) => id),
    exportState, restore, seal: () => { finalized = true; }, version: () => version };
}
