import type { Assignment, LobbyError, PersonalPlay, RoundResult } from '../shared/protocol.js';

type Action = { kind: 'infect'; actor: string; target: string; group: string }
  | { kind: 'release'; actor: string; group: string }
  | { kind: 'mission'; actor: string; completed: boolean }
  | { kind: 'depart'; actor: string };
interface Event { id: string; action: Action; touches: Set<string>; undone: boolean }
interface State { group: string | null; released: boolean; left: boolean; captured: boolean; mission: boolean; cardKey: string }

/** A round-local action ledger. Rebuild once per mutation; projections are detached reads. */
export function createSearch(roundId: string, initial: ReadonlyMap<string, Assignment>, generateId: () => string) {
  const roster = new Map([...initial].map(([id, assignment]) => [id, structuredClone(assignment)]));
  const groups = [...roster].filter(([, a]) => a.card.role === 'possessed').map(([id]) => id);
  const events: Event[] = [];
  let states = new Map<string, State>();
  let released = new Set<string>();
  let version = 0, finalized = false;

  function rebuild() {
    states = new Map([...roster].map(([id, a]) => [id, { group: a.card.role === 'possessed' ? id : null,
      released: false, left: false, captured: false, mission: false, cardKey: a.id }]));
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
        released.add(action.group);
        for (const state of states.values()) if (state.group === action.group) state.released = true;
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
    return { roundId, version, status: state.released ? 'released' : state.captured ? 'captured' : state.group ? 'possessed' : 'exorcist',
      card: structuredClone(state.group ? roster.get(state.group)!.card : assignment.card), cardKey: `${state.cardKey}:${versionForCard(playerId)}`,
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
        const members = [...states].filter(([, state]) => state.group === player.group).map(([id]) => `p:${id}`);
        append({ kind, actor, group: player.group }, [`g:${player.group}`, ...members]);
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
  function result(number: number, status: RoundResult['status'], activeMs: number): RoundResult {
    return { roundId, number, status, activeMs, rescuedGroups: released.size, totalGroups: groups.length,
      missions: [...states].filter(([id, s]) => roster.get(id)!.card.role === 'exorcist' && s.mission && !s.captured).length,
      totalMissions: roster.size - groups.length, infectedPlayers: [...states.values()].filter(s => s.captured).length };
  }
  return { personal, act, undo, depart, canSearch, result, seal: () => { finalized = true; }, version: () => version };
}
