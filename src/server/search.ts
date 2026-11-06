import type { Assignment, LobbyError, PersonalPlay, PresenceCorrection, RoundResult } from '../shared/protocol.js';

type Action = { kind: 'infect'; actor: string; target: string; group: string }
  | { kind: 'release'; actor: string; group: string; targetIds?: string[] }
  | { kind: 'presence_correction'; actor: string; correction: PresenceCorrection; groupMemberId?: string; group?: string }
  | { kind: 'mission'; actor: string; completed: boolean }
  | { kind: 'depart'; actor: string };
interface Event { id: string; action: Action; touches: Set<string>; undone: boolean }
interface State { group: string | null; released: boolean; left: boolean; captured: boolean; unknownGroup: boolean; mission: boolean; cardKey: string }
export interface RetainedGroup {
  id: string; origin: string; assignment: Assignment; location: string | null;
  members: [string, Assignment][];
}
export interface SavedSearch {
  roundId: string; roster: [string, Assignment][]; events: { id: string; action: Action; touches: string[]; undone: boolean }[];
  version: number; finalized: boolean; retained?: RetainedGroup[]; unassigned?: string[]; locations?: [string, string][];
}

/** A round-local action ledger. Rebuild once per mutation; projections are detached reads. */
export function createSearch(roundId: string, initial: ReadonlyMap<string, Assignment>, generateId: () => string, retained?: RetainedGroup[], unassigned: string[] = []) {
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
  // Once no active group remains, only a release leaves time for missions.
  let lastGroupExitWasRelease = false;
  let version = 0, finalized = false;

  function rebuild() {
    states = new Map([...roster].map(([id, a]) => {
      const carried = inheritedMembers.get(id);
      return [id, { group: carried?.id ?? initialGroups.get(id) ?? null,
        released: false, left: false, captured: unassigned.includes(id) || !!carried && carried.origin !== id, unknownGroup: unassigned.includes(id), mission: false, cardKey: carried?.id ?? a.id }];
    }));
    released = new Set();
    lastGroupExitWasRelease = false;
    for (const event of events) {
      if (event.undone) continue;
      const action = event.action, player = states.get(action.actor)!;
      if (action.kind === 'depart') {
        if (player.group && !player.released) lastGroupExitWasRelease = false;
        player.left = true;
      }
      else if (action.kind === 'mission') player.mission = action.completed;
      else if (action.kind === 'infect') {
        const target = states.get(action.target)!;
        target.group = action.group; target.captured = true; target.cardKey = event.id;
      } else if (action.kind === 'presence_correction' && (action.correction !== 'released' || !action.group)) {
        if (action.correction === 'infected') { player.captured = true; player.unknownGroup = true; }
        else if (action.correction === 'assign') { player.group = action.group!; player.unknownGroup = false; player.cardKey = event.id; }
        else { player.released = true; player.unknownGroup = false; }
      } else {
        const freed = [...event.touches].filter(key => key.startsWith('g:')).map(key => key.slice(2));
        for (const group of freed) released.add(group);
        for (const state of states.values()) if (state.group && freed.includes(state.group)) {
          if (!state.left && !state.released) lastGroupExitWasRelease = true;
          state.released = true;
        }
      }
    }
  }
  rebuild();
  function append(action: Action, touches: string[]) {
    events.push({ id: generateId(), action, touches: new Set(touches), undone: false }); version++; rebuild();
  }
  function latest(playerId: string) { return events.findLast(event => !event.undone && event.action.actor === playerId && event.action.kind !== 'depart' && event.action.kind !== 'presence_correction'); }
  function dependencies(event: Event) {
    const infection = retained && event.action.kind === 'infect' ? event.action : null;
    return events.slice(events.indexOf(event) + 1).filter(next => {
      if (next.undone) return false;
      if (infection && next.action.kind === 'infect') return next.touches.has(`p:${infection.target}`);
      return [...next.touches].some(key => event.touches.has(key));
    });
  }
  function ownedAction(actor: string, actionId: string) {
    return events.find(event => event.id === actionId && event.action.actor === actor && !event.undone && event.action.kind !== 'depart' && event.action.kind !== 'presence_correction');
  }
  function undoBlockers(actor: string, actionId: string) {
    const event = ownedAction(actor, actionId);
    if (!event) return [];
    const blockers = new Set(dependencies(event).map(item => item.id));
    const newest = latest(actor);
    if (newest && newest !== event && !(retained && event.action.kind === 'infect')) blockers.add(newest.id);
    return [...blockers];
  }
  function personal(playerId: string): PersonalPlay | null {
    const state = states.get(playerId), assignment = roster.get(playerId);
    if (!state || state.left || !assignment) return null;
    const event = latest(playerId);
    const cardVersion = versionForCard(playerId);
    const cardKey = retained
      ? state.group ?? (cardVersion ? `${assignment.id}:${cardVersion}` : assignment.id)
      : `${state.cardKey}:${cardVersion}`;
    return { roundId, version, ...(state.unknownGroup ? { unknownGroup: true } : {}), status: state.released ? 'released' : state.captured ? 'captured' : state.group ? 'possessed' : 'exorcist',
      card: structuredClone(state.group ? groups.get(state.group)!.assignment.card : assignment.card), cardKey,
      ...(retained ? { location: state.group ? locations.get(state.group) ?? null : null, retained: inheritedMembers.has(playerId) } : {}),
      wasCaptured: state.captured, missionCompleted: state.mission, missionEligible: assignment.card.role === 'exorcist' && !state.captured,
      ...(retained ? { infections: events.flatMap(entry => {
        const action = entry.action;
        if (entry.undone || action.kind !== 'infect' || action.actor !== playerId) return [];
        const blocked = dependencies(entry).length > 0;
        return [{ id: entry.id, targetId: action.target, available: !finalized && !blocked, canRequestReview: !finalized && blocked }];
      }) } : {}),
      ...(retained ? { releases: events.flatMap(entry => {
        const action = entry.action;
        if (entry.undone || action.kind !== 'release' || action.actor !== playerId || !action.targetIds) return [];
        const error = undoError(playerId, entry.id);
        return [{ id: entry.id, memberIds: [...entry.touches].filter(key => key.startsWith('p:') && key !== `p:${playerId}`).map(key => key.slice(2)),
          available: !error, canRequestReview: error === 'UNDO_DEPENDENCY' }];
      }) } : {}),
      undo: event ? { id: event.id, label: event.action.kind === 'infect' ? 'Заражение' : event.action.kind === 'release' ? 'Освобождение группы' : 'Отметка миссии', available: !finalized && dependencies(event).length === 0, ...(!finalized && (event.action.kind === 'infect' || event.action.kind === 'release') && dependencies(event).length > 0 ? { canRequestReview: true } : {}) } : null };
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
        if (!other || other.left || other.group || other.unknownGroup || other.released || target === actor) return 'ACTION_UNAVAILABLE';
        append({ kind, actor, target: target!, group: player.group }, [`p:${actor}`, `p:${target}`, `g:${player.group}`]);
      } else {
        releaseGroups(actor, [player.group]);
      }
    }
  }
  function releaseGroups(actor: string, selected: string[], targetIds?: string[], correction?: 'released') {
    const matching = [...groups].filter(([id, group]) => !released.has(id) && selected.some(source => id === source ||
      retained && locations.has(id) && locations.get(id) === locations.get(source) &&
      group.assignment.card.id === groups.get(source)!.assignment.card.id)).map(([id]) => id);
    const members = [...states].filter(([, state]) => state.group && matching.includes(state.group)).map(([id]) => `p:${id}`);
    const touches = [...matching.map(id => `g:${id}`), ...members];
    if (targetIds || correction) touches.push(`p:${actor}`);
    append(correction ? { kind: 'presence_correction', actor, correction, group: selected[0] } :
      { kind: 'release', actor, group: selected[0], ...(targetIds ? { targetIds: [...targetIds] } : {}) }, [...new Set(touches)]);
  }

  function releaseSelected(actor: string, targetIds: string[]): LobbyError | undefined {
    if (finalized) return 'RESULTS_FINAL';
    const player = states.get(actor);
    if (!retained || !player || player.left || player.group || player.unknownGroup || player.released || targetIds.length === 0) return 'ACTION_UNAVAILABLE';
    const selected: string[] = [];
    for (const id of targetIds) {
      const target = states.get(id);
      if (!target?.group || target.left || target.released) return 'ACTION_UNAVAILABLE';
      if (!selected.includes(target.group)) selected.push(target.group);
    }
    releaseGroups(actor, selected, targetIds);
  }

  function reconcile(actor: string, correction: PresenceCorrection, groupMemberId?: string): LobbyError | undefined {
    if (finalized) return 'RESULTS_FINAL';
    const player = states.get(actor);
    if (!retained || !player || player.left || player.released) return 'ACTION_UNAVAILABLE';
    if (correction === 'infected' && !player.group && !player.captured) {
      append({ kind: 'presence_correction', actor, correction }, [`p:${actor}`]);
    } else if (correction === 'released' && (player.group || player.unknownGroup)) {
      if (player.group) releaseGroups(actor, [player.group], undefined, correction);
      else append({ kind: 'presence_correction', actor, correction }, [`p:${actor}`]);
    } else if (correction === 'assign' && player.unknownGroup) {
      const member = states.get(groupMemberId!);
      if (!member?.group || member.released || member.left) return 'ACTION_UNAVAILABLE';
      append({ kind: 'presence_correction', actor, correction, groupMemberId, group: member.group },
        [`p:${actor}`, `p:${groupMemberId}`, `g:${member.group}`]);
    } else return 'ACTION_UNAVAILABLE';
  }

  function undoError(actor: string, actionId: string): LobbyError | undefined {
    if (finalized) return 'RESULTS_FINAL';
    const event = ownedAction(actor, actionId);
    if (!event || !(retained && event.action.kind === 'infect') && event !== latest(actor) || states.get(actor)?.left) return 'ACTION_UNAVAILABLE';
    if (dependencies(event).length) return 'UNDO_DEPENDENCY';
  }
  function undo(actor: string, actionId: string): LobbyError | undefined {
    const error = undoError(actor, actionId);
    if (error) return error;
    const event = ownedAction(actor, actionId)!;
    event.undone = true; version++; rebuild();
  }
  function depart(playerId: string) {
    const state = states.get(playerId);
    if (state && !state.left && !finalized) append({ kind: 'depart', actor: playerId }, [`p:${playerId}`, ...(state.group ? [`g:${state.group}`] : [])]);
  }
  function canSearch() {
    const live = [...states.values()].filter(s => !s.left);
    return live.some(s => !s.group && !s.unknownGroup && !s.released) &&
      (lastGroupExitWasRelease || live.some(s => s.group && !s.released));
  }
  function result(number: number, status: RoundResult['status'], activeMs: number): Omit<RoundResult, 'kind' | 'difficulty' | 'infectionEnabled'> {
    return { roundId, number, status, activeMs, rescuedGroups: released.size, totalGroups: groups.size,
      missions: [...states].filter(([id, s]) => roster.get(id)!.card.role === 'exorcist' && s.mission && !s.captured).length,
      totalMissions: [...roster].filter(([id, a]) => a.card.role === 'exorcist' && !inheritedMembers.has(id) && !unassigned.includes(id)).length,
      infectedPlayers: [...states].filter(([id, s]) => s.captured && !inheritedMembers.has(id) && !unassigned.includes(id)).length };
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
  function releaseOptions() {
    const members = new Map<string, string[]>();
    for (const [id, state] of states) {
      if (!state.group || state.left || state.released) continue;
      const group = members.get(state.group) ?? [];
      if (groups.get(state.group)?.origin === id) group.unshift(id);
      else group.push(id);
      members.set(state.group, group);
    }
    return [...members.values()];
  }
  function exportState(): SavedSearch { return structuredClone({ roundId, roster: [...roster], events: events.map(e => ({ ...e, touches: [...e.touches] })), version, finalized,
    ...(retained ? { retained: inherited, locations: [...locations] } : {}), ...(unassigned.length ? { unassigned } : {}) }); }
  function restore(state: SavedSearch, bump = true) {
    events.splice(0, events.length, ...structuredClone(state.events).map(e => ({ ...e, touches: new Set(e.touches) })));
    locations = new Map(state.locations ?? []); version = state.version + Number(bump); finalized = state.finalized; rebuild();
  }
  return { group: (playerId: string) => states.get(playerId)?.group ?? null, personal, act, releaseSelected, releaseOptions, reconcile,
    unassigned: () => [...roster].filter(([id]) => states.get(id)?.unknownGroup && !states.get(id)?.left),
    undo, undoError, undoBlockers, depart, canSearch, result, carry, place,
    targets: () => [...states].filter(([, s]) => !s.group && !s.unknownGroup && !s.released && !s.left).map(([id]) => id),
    exportState, restore, seal: () => { finalized = true; }, version: () => version };
}
