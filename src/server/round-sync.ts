import type { EventReceipt, LobbyError, OfflineAction, OfflineEvent, ReviewEvent } from '../shared/protocol.js';
import { createSearch } from './search.js';
import type { SavedSearch } from './search.js';

interface Entry { event: OfflineEvent; actor: string; receipt: EventReceipt; approved: boolean }
export interface SavedRoundSync {
  base: SavedSearch; entries: Entry[]; players: string[]; completed: string[]; closed: boolean; revision: number; sealed?: boolean;
}
export function validOfflineEvent(value: unknown): value is OfflineEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as OfflineEvent, a = e.action;
  const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(v);
  return id(e.id) && id(e.clientId) && Number.isSafeInteger(e.sequence) && e.sequence > 0 && (e.previousId === null || id(e.previousId))
    && typeof e.roundId === 'string' && e.roundId.length > 0 && e.roundId.length <= 256 && ['placement', 'search', 'return', 'between_rounds', 'finished'].includes(e.phase)
    && typeof e.paused === 'boolean' && (e.estimatedServerTime === null || typeof e.estimatedServerTime === 'number' && Number.isFinite(e.estimatedServerTime))
    && Boolean(a && typeof a === 'object' && (a.kind === 'release' || a.kind === 'withdraw' || a.kind === 'mission' && typeof a.completed === 'boolean'
      || a.kind === 'infect' && typeof a.targetId === 'string' && a.targetId.length <= 256 || a.kind === 'captured' && typeof a.by === 'string' && a.by.length <= 256 || a.kind === 'undo' && typeof a.actionId === 'string' && a.actionId.length <= 256));
}

/** Round-local durable inbox. Arrival order is never treated as proof of physical chronology. */
export function createRoundSync(saved: SavedRoundSync, generateId: () => string) {
  const state = structuredClone(saved);
  let search = createSearch(state.base.roundId, new Map(state.base.roster), generateId, state.base.retained);
  let actionId = '';
  function apply(actor: string, action: OfflineAction): LobbyError | undefined {
    if (action.kind === 'withdraw') { if (!search.personal(actor)) return 'ACTION_UNAVAILABLE'; search.depart(actor); return; }
    if (action.kind === 'undo') return search.undo(actor, action.actionId);
    if (action.kind === 'captured') {
      const player = search.personal(actor), group = search.group(actor);
      if (player && group && search.group(action.by) === group) return;
      return 'ACTION_UNAVAILABLE';
    }
    if (action.kind === 'infect') {
      const target = search.personal(action.targetId), source = search.personal(actor);
      if (target?.status === 'captured' && source && search.group(actor) === search.group(action.targetId)) return;
    }
    return search.act(actor, action.kind, action.kind === 'infect' ? action.targetId : undefined, action.kind === 'mission' ? action.completed : undefined);
  }
  function rebuild() {
    search = createSearch(state.base.roundId, new Map(state.base.roster), () => actionId, state.base.retained);
    search.restore(state.base, false);
    const pending = state.entries.filter(e => e.receipt.status !== 'rejected');
    const done = new Set(state.entries.filter(e => e.receipt.status === 'rejected').map(e => e.event.id));
    for (let pass = 0; pass <= pending.length; pass++) {
      let progressed = false;
      for (const entry of pending) {
        if (done.has(entry.event.id)) continue;
        if (entry.receipt.reason === 'timing' && !entry.approved) continue;
        if (entry.event.previousId && !done.has(entry.event.previousId)) { entry.receipt.status = 'review'; entry.receipt.reason = 'dependency'; continue; }
        actionId = entry.event.id;
        const error = apply(entry.actor, entry.event.action);
        if (error) { entry.receipt.status = 'review'; entry.receipt.reason = error; continue; }
        entry.receipt.status = 'accepted'; entry.receipt.reason = null; done.add(entry.event.id); progressed = true;
      }
      if (!progressed) break;
    }
    const snapshot = search.exportState(); snapshot.version = state.base.version + state.revision + state.entries.length;
    search.restore(snapshot, false);
    if (state.sealed) search.seal();
  }
  rebuild();
  function ingest(actor: string, events: OfflineEvent[], timing: (event: OfflineEvent) => boolean): LobbyError | undefined {
    if (!state.players.includes(actor)) return 'FORBIDDEN';
    if (state.entries.length + events.filter(e => !state.entries.some(old => old.event.id === e.id)).length > 12000) return 'REQUEST_LIMIT';
    const incoming = new Map<string, OfflineEvent>();
    for (const event of events) {
      const repeated = incoming.get(event.id);
      if (repeated && JSON.stringify(repeated) !== JSON.stringify(event)) return 'INVALID_INPUT';
      if ([...incoming.values()].some(e => e.clientId === event.clientId && e.sequence === event.sequence && e.id !== event.id)) return 'INVALID_INPUT';
      incoming.set(event.id, event);
      if (state.entries.some(e => e.event.clientId === event.clientId && e.actor !== actor)) return 'INVALID_INPUT';
      if (event.action.kind === 'infect' && !state.players.includes(event.action.targetId) || event.action.kind === 'captured' && !state.players.includes(event.action.by)) return 'INVALID_INPUT';
      const old = state.entries.find(e => e.event.id === event.id);
      if (old && (old.actor !== actor || JSON.stringify(old.event) !== JSON.stringify(event))) return 'INVALID_INPUT';
      if (state.entries.some(e => e.event.clientId === event.clientId && e.event.sequence === event.sequence && e.event.id !== event.id)) return 'INVALID_INPUT';
    }
    let changed = false;
    for (const event of events) {
      if (state.entries.some(e => e.event.id === event.id)) continue;
      const rejected = state.closed;
      state.entries.push({ actor, event: structuredClone(event), approved: false,
        receipt: { id: event.id, status: rejected ? 'rejected' : 'review', reason: rejected ? 'results_closed' : timing(event) ? null : 'timing' } });
      if (!state.closed) state.completed = [];
      changed = true;
    }
    if (changed) { state.revision++; rebuild(); }
  }
  function legacy(actor: string, action: OfflineAction): LobbyError | undefined {
    if (state.closed || state.sealed) return 'RESULTS_FINAL';
    actionId = generateId();
    const error = apply(actor, action); if (error) return error;
    state.entries.push({ actor, event: { id: actionId, roundId: state.base.roundId, clientId: 'server_direct', sequence: state.entries.length + 1,
      previousId: null, action, phase: 'search', paused: false, estimatedServerTime: null }, approved: true,
      receipt: { id: actionId, status: 'accepted', reason: null } });
    state.revision++; state.completed = []; rebuild();
  }
  function resolve(id: string, decision: 'accept' | 'reject', beforeId?: string): LobbyError | undefined {
    if (state.closed || state.sealed) return 'RESULTS_FINAL';
    const index = state.entries.findIndex(e => e.event.id === id); if (index < 0) return 'INVALID_INPUT';
    const entry = state.entries[index];
    if (beforeId) {
      const before = state.entries.findIndex(e => e.event.id === beforeId); if (before < 0 || before === index) return 'INVALID_INPUT';
      state.entries.splice(index, 1); state.entries.splice(state.entries.findIndex(e => e.event.id === beforeId), 0, entry);
    }
    entry.approved = true; entry.receipt.status = decision === 'reject' ? 'rejected' : 'review'; entry.receipt.reason = decision === 'reject' ? 'organizer' : null;
    state.revision++; state.completed = []; rebuild();
  }
  function complete(actor: string, revision: number): LobbyError | undefined {
    if (!state.players.includes(actor)) return 'FORBIDDEN';
    if (revision !== state.revision) return 'STALE_GAME';
    if (!state.completed.includes(actor)) state.completed.push(actor);
  }
  function publicState() { return { revision: state.revision, waitingPlayerIds: state.closed ? [] : state.players.filter(id => !state.completed.includes(id)), conflicts: state.entries.filter(e => e.receipt.status === 'review').length, closed: state.closed }; }
  function place(actor: string, zone: string) {
    const error = search.place(actor, zone);
    if (!error) state.base.locations = search.exportState().locations;
    return error;
  }
  return { seal: () => { state.sealed = true; search.seal(); }, current: () => search, ingest, legacy, resolve, complete, publicState, place,
    personal: (actor: string) => state.players.includes(actor) ? {
      roundId: state.base.roundId,
      receipts: state.entries.filter(e => e.actor === actor).map(e => ({ ...e.receipt })),
      complete: state.completed.includes(actor),
      withdrawn: search.personal(actor) === null,
    } : null,
    review: (): ReviewEvent[] => state.entries.map(e => ({ ...e.receipt, actor: e.actor, dependsOn: [...new Set([e.event.previousId, e.event.action.kind === 'undo' ? e.event.action.actionId : null].filter((id): id is string => id !== null))], action: structuredClone(e.event.action) })),
    close: () => { if (state.closed) return; state.closed = true; for (const entry of state.entries) if (entry.receipt.status === 'review') { entry.receipt.status = 'rejected'; entry.receipt.reason = 'results_closed'; } state.revision++; rebuild(); },
    ready: () => state.closed || state.players.every(id => state.completed.includes(id)) && !state.entries.some(e => e.receipt.status === 'review'),
    exportState: (): SavedRoundSync => structuredClone(state) };
}

export function validateRoundSync(value: unknown, roundId: unknown): asserts value is SavedRoundSync {
  const s = value as SavedRoundSync;
  const assert = (ok: unknown) => { if (!ok) throw new Error('Invalid round synchronization checkpoint.'); };
  assert(s && typeof s === 'object' && s.base?.roundId === roundId && Array.isArray(s.base?.roster) && Array.isArray(s.base?.events));
  assert(Array.isArray(s.entries) && s.entries.length <= 12000 && Array.isArray(s.players) && s.players.length <= 12 && new Set(s.players).size === s.players.length);
  assert(Number.isSafeInteger(s.base.version) && s.base.version >= 0 && typeof s.base.finalized === 'boolean');
  assert(s.base.roster.length >= (s.base.retained ? 1 : 4) && s.base.roster.length <= 12 && new Set(s.base.roster.map(([id]) => id)).size === s.base.roster.length);
  for (const [id, assignment] of s.base.roster) {
    const card = assignment?.card;
    assert(typeof id === 'string' && typeof assignment?.id === 'string' && typeof assignment.ready === 'boolean' && typeof assignment.replacementRequested === 'boolean');
    assert(card && typeof card.id === 'string' && typeof card.title === 'string' && [1, 2, 3].includes(card.difficulty));
    assert(card.role === 'possessed' ? [card.behavior, card.clue, card.releaseCondition, card.infectionCondition].every(v => typeof v === 'string' && v.length > 0 && v.length <= 10000) : card.role === 'exorcist' && typeof card.mission === 'string');
  }
  for (const event of s.base.events) {
    assert(event && typeof event.id === 'string' && typeof event.undone === 'boolean' && Array.isArray(event.touches) && event.touches.every(k => typeof k === 'string'));
    assert(event.action && s.base.roster.some(([id]) => id === event.action.actor));
    assert(['infect', 'release', 'mission', 'depart'].includes(event.action.kind));
    if (event.action.kind === 'infect') assert(s.base.roster.some(([id]) => event.action.kind === 'infect' && id === event.action.target));
  }
  assert(s.sealed === undefined || typeof s.sealed === 'boolean');
  assert(s.players.length === s.base.roster.length);
  assert(s.players.every(id => typeof id === 'string' && s.base.roster.some(([key]) => key === id)));
  assert(Array.isArray(s.completed) && new Set(s.completed).size === s.completed.length && s.completed.every(id => s.players.includes(id)) && typeof s.closed === 'boolean' && Number.isSafeInteger(s.revision) && s.revision >= 0);
  const ids = new Set<string>();
  for (const entry of s.entries) {
    assert(entry && validOfflineEvent(entry.event) && entry.event.roundId === roundId && s.players.includes(entry.actor) && !ids.has(entry.event.id));
    assert(entry.receipt?.id === entry.event.id && ['accepted', 'review', 'rejected'].includes(entry.receipt.status) && (entry.receipt.reason === null || typeof entry.receipt.reason === 'string') && typeof entry.approved === 'boolean');
    ids.add(entry.event.id);
  }
}
