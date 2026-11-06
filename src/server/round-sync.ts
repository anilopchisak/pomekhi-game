import type { EventReceipt, LobbyError, OfflineAction, OfflineEvent, ReviewEvent } from '../shared/protocol.js';
import { createSearch } from './search.js';
import type { SavedSearch } from './search.js';

interface Entry { event: OfflineEvent; actor: string; receipt: EventReceipt; approved: boolean }
export interface SavedRoundSync {
  base: SavedSearch; entries: Entry[]; players: string[]; completed: string[]; closed: boolean; revision: number; sealed?: boolean;
}
const INBOX_LIMIT = 12000;
const validEventId = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);

export function validReleaseTargets(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 12 &&
    value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 256) && new Set(value).size === value.length;
}

export function validOfflineEvent(value: unknown): value is OfflineEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as OfflineEvent, a = e.action;
  return validEventId(e.id) && validEventId(e.clientId) && Number.isSafeInteger(e.sequence) && e.sequence > 0 && (e.previousId === null || validEventId(e.previousId))
    && typeof e.roundId === 'string' && e.roundId.length > 0 && e.roundId.length <= 256 && ['placement', 'search', 'return', 'between_rounds', 'finished'].includes(e.phase)
    && typeof e.paused === 'boolean' && (e.estimatedServerTime === null || typeof e.estimatedServerTime === 'number' && Number.isFinite(e.estimatedServerTime))
    && Boolean(a && typeof a === 'object' && (a.kind === 'release' && (a.targetIds === undefined || validReleaseTargets(a.targetIds)) || a.kind === 'withdraw' || a.kind === 'presence_correction' &&
      (a.correction === 'assign' ? typeof a.groupMemberId === 'string' && a.groupMemberId.length <= 256 :
        (a.correction === 'infected' || a.correction === 'released') && a.groupMemberId === undefined) || a.kind === 'mission' && typeof a.completed === 'boolean'
      || a.kind === 'infect' && typeof a.targetId === 'string' && a.targetId.length <= 256 || a.kind === 'captured' && typeof a.by === 'string' && a.by.length <= 256 || a.kind === 'undo' && typeof a.actionId === 'string' && a.actionId.length <= 256 && (a.requestReview === undefined || a.requestReview === true)));
}

function canonicalEvent(event: OfflineEvent): OfflineEvent {
  const { id, clientId, sequence, previousId, roundId, action, phase, paused, estimatedServerTime } = event;
  const { kind } = action;
  let intent: OfflineAction;
  switch (kind) {
    case 'release': intent = { kind, ...(action.targetIds ? { targetIds: [...action.targetIds] } : {}) }; break;
    case 'presence_correction': intent = { kind, correction: action.correction, ...(action.groupMemberId ? { groupMemberId: action.groupMemberId } : {}) }; break;
    case 'infect': intent = { kind, targetId: action.targetId }; break;
    case 'captured': intent = { kind, by: action.by }; break;
    case 'mission': intent = { kind, completed: action.completed }; break;
    case 'undo': intent = { kind, actionId: action.actionId, ...(action.requestReview ? { requestReview: true } : {}) }; break;
    default: intent = { kind };
  }
  return { id, clientId, sequence, previousId, roundId, action: intent, phase, paused, estimatedServerTime };
}

/** Round-local durable inbox. Arrival order is never treated as proof of physical chronology. */
export function createRoundSync(saved: SavedRoundSync, generateId: () => string) {
  let state = structuredClone(saved);
  for (const entry of state.entries) entry.event = canonicalEvent(entry.event);
  let search = createSearch(state.base.roundId, new Map(state.base.roster), generateId, state.base.retained, state.base.unassigned);
  let actionId = '';
  function ownedUndoTarget(actor: string, actionId: string) {
    return state.entries.some(row => row.actor === actor && row.event.id === actionId && row.receipt.status === 'accepted' &&
      (row.event.action.kind === 'infect' || row.event.action.kind === 'release'));
  }
  function pendingUndo(actor: string, actionId: string) {
    return state.entries.some(row => row.actor === actor && row.receipt.status === 'review' &&
      row.event.action.kind === 'undo' && row.event.action.requestReview && row.event.action.actionId === actionId);
  }
  function apply(actor: string, action: OfflineAction): LobbyError | undefined {
    if (action.kind === 'presence_correction') return search.reconcile(actor, action.correction, action.groupMemberId);
    if (action.kind === 'withdraw') { if (!search.personal(actor)) return 'ACTION_UNAVAILABLE'; search.depart(actor); return; }
    if (action.kind === 'undo') return search.undo(actor, action.actionId);
    if (action.kind === 'release' && action.targetIds) return search.releaseSelected(actor, action.targetIds);
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
    search = createSearch(state.base.roundId, new Map(state.base.roster), () => actionId, state.base.retained, state.base.unassigned);
    search.restore(state.base, false);
    const pending = state.entries.filter(e => e.receipt.status !== 'rejected');
    const done = new Set(state.entries.filter(e => e.receipt.status === 'rejected').map(e => e.event.id));
    for (let pass = 0; pass <= pending.length; pass++) {
      let progressed = false;
      for (const entry of pending) {
        if (done.has(entry.event.id)) continue;
        if (!entry.approved && (entry.receipt.reason === 'timing' || entry.event.action.kind === 'undo' && entry.event.action.requestReview)) continue;
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
  function ingest(actor: string, events: OfflineEvent[], timing: (event: OfflineEvent) => boolean | 'paused'): LobbyError | undefined {
    if (!state.players.includes(actor)) return 'FORBIDDEN';
    const incoming = new Map<string, OfflineEvent>();
    let newEvents = 0;
    for (const raw of events) {
      if (raw.action.kind === 'presence_correction') return 'FORBIDDEN';
      const event = canonicalEvent(raw);
      const repeated = incoming.get(event.id);
      if (repeated) {
        if (JSON.stringify(repeated) !== JSON.stringify(event)) return 'INVALID_INPUT';
        continue;
      }
      if ([...incoming.values()].some(e => e.clientId === event.clientId && e.sequence === event.sequence && e.id !== event.id)) return 'INVALID_INPUT';
      incoming.set(event.id, event);
      if (state.entries.some(e => e.event.clientId === event.clientId && e.actor !== actor)) return 'INVALID_INPUT';
      if (event.action.kind === 'infect' && !state.players.includes(event.action.targetId) || event.action.kind === 'captured' && !state.players.includes(event.action.by)) return 'INVALID_INPUT';
      const old = state.entries.find(e => e.event.id === event.id);
      if (old && (old.actor !== actor || JSON.stringify(old.event) !== JSON.stringify(event))) return 'INVALID_INPUT';
      if (!old) {
        if (event.action.kind === 'release' && event.action.targetIds?.some(id => !state.players.includes(id))) return 'INVALID_INPUT';
        if (event.action.kind === 'undo' && !validEventId(event.action.actionId)) return 'INVALID_INPUT';
        newEvents++;
      }
      if (state.entries.some(e => e.event.clientId === event.clientId && e.event.sequence === event.sequence && e.event.id !== event.id)) return 'INVALID_INPUT';
    }
    if (newEvents && state.entries.length + newEvents > INBOX_LIMIT) return 'REQUEST_LIMIT';
    let changed = false;
    for (const event of incoming.values()) {
      if (state.entries.some(e => e.event.id === event.id)) continue;
      const when = timing(event);
      const request = event.action.kind === 'undo' && event.action.requestReview ? event.action : null;
      let reason: string | null = when ? null : 'timing';
      if (state.closed) reason = 'results_closed';
      else if (when === 'paused') reason = 'paused';
      else if (request) {
        if (!ownedUndoTarget(actor, request.actionId)) reason = 'ACTION_UNAVAILABLE';
        else reason = pendingUndo(actor, request.actionId) ? 'already_requested' : 'undo_requested';
      }
      else if (event.action.kind === 'undo' && pendingUndo(actor, event.action.actionId)) reason = 'already_requested';
      const rejected = reason !== null && ['results_closed', 'paused', 'ACTION_UNAVAILABLE', 'already_requested'].includes(reason);
      state.entries.push({ actor, event, approved: false,
        receipt: { id: event.id, status: rejected ? 'rejected' : 'review', reason } });
      if (!state.closed) state.completed = [];
      changed = true;
    }
    if (changed) { state.revision++; rebuild(); }
  }
  function legacy(actor: string, action: OfflineAction, deferred = false, phase: OfflineEvent['phase'] = 'search'): LobbyError | undefined {
    if (state.closed || state.sealed) return 'RESULTS_FINAL';
    const request = action.kind === 'undo' && action.requestReview ? action : null;
    if (request) {
      if (!ownedUndoTarget(actor, request.actionId)) return 'ACTION_UNAVAILABLE';
      if (pendingUndo(actor, request.actionId)) return;
    }
    if (!request && action.kind === 'undo' && pendingUndo(actor, action.actionId)) return 'ACTION_UNAVAILABLE';
    // A participant must still be able to leave when the gameplay journal is full.
    const limit = INBOX_LIMIT + (action.kind === 'withdraw' ? state.players.length : 0);
    if (state.entries.length >= limit) return 'REQUEST_LIMIT';
    actionId = generateId();
    const needsReview = deferred || Boolean(request);
    const error = needsReview ? undefined : apply(actor, action); if (error) return error;
    state.entries.push({ actor, event: { id: actionId, roundId: state.base.roundId, clientId: 'server_direct', sequence: state.entries.length + 1,
      previousId: null, action, phase, paused: false, estimatedServerTime: null }, approved: !needsReview,
      receipt: { id: actionId, status: needsReview ? 'review' : 'accepted', reason: request ? 'undo_requested' : deferred ? 'timing' : null } });
    state.revision++; state.completed = []; rebuild();
  }
  function resolve(id: string, decision: 'accept' | 'reject', beforeId?: string): LobbyError | undefined {
    if (state.closed || state.sealed) return 'RESULTS_FINAL';
    const index = state.entries.findIndex(e => e.event.id === id); if (index < 0) return 'INVALID_INPUT';
    const entry = state.entries[index];
    if (entry.receipt.reason === 'paused') return 'ACTION_UNAVAILABLE';
    const request = entry.event.action.kind === 'undo' && entry.event.action.requestReview ? entry.event.action : null;
    if (request && entry.receipt.status !== 'review') return 'ACTION_UNAVAILABLE';
    let rollback: SavedRoundSync | undefined;
    if (request && decision === 'accept') {
      if (beforeId) return 'INVALID_INPUT';
      const error = search.undoError(entry.actor, request.actionId);
      if (error) return search.undoBlockers(entry.actor, request.actionId).length ? 'UNDO_DEPENDENCY' : error;
      rollback = structuredClone(state);
    }
    if (beforeId) {
      const before = state.entries.findIndex(e => e.event.id === beforeId); if (before < 0 || before === index) return 'INVALID_INPUT';
      state.entries.splice(index, 1); state.entries.splice(state.entries.findIndex(e => e.event.id === beforeId), 0, entry);
    }
    entry.approved = true; entry.receipt.status = decision === 'reject' ? 'rejected' : 'review'; entry.receipt.reason = decision === 'reject' ? 'organizer' : null;
    state.revision++; state.completed = []; rebuild();
    if (rollback && state.entries.find(row => row.event.id === id)?.receipt.status !== 'accepted') {
      state = rollback; rebuild();
      return 'UNDO_DEPENDENCY';
    }
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
    personal: (actor: string) => {
      if (!state.players.includes(actor)) return null;
      const undoRequests = state.entries.flatMap(row => row.actor === actor && row.event.action.kind === 'undo' && row.event.action.requestReview &&
        row.receipt.reason !== 'already_requested' ? [{ id: row.event.id, actionId: row.event.action.actionId, status: row.receipt.status }] : []);
      return {
        roundId: state.base.roundId,
        receipts: state.entries.filter(e => e.actor === actor).map(e => ({ ...e.receipt })),
        ...(undoRequests.length ? { undoRequests } : {}),
        complete: state.completed.includes(actor),
        withdrawn: search.personal(actor) === null,
      };
    },
    review: (): ReviewEvent[] => state.entries.map(e => ({ ...e.receipt, actor: e.actor,
      ...(e.receipt.status === 'review' && e.event.action.kind === 'undo' && e.event.action.requestReview
        ? { blockers: search.undoBlockers(e.actor, e.event.action.actionId) } : {}),
      dependsOn: [...new Set([e.event.previousId, e.event.action.kind === 'undo' ? e.event.action.actionId : null].filter((id): id is string => id !== null))], action: structuredClone(e.event.action) })),
    close: () => { if (state.closed) return; state.closed = true; for (const entry of state.entries) if (entry.receipt.status === 'review') { entry.receipt.status = 'rejected'; entry.receipt.reason = 'results_closed'; } state.revision++; rebuild(); },
    ready: () => state.closed || state.players.every(id => state.completed.includes(id)) && !state.entries.some(e => e.receipt.status === 'review'),
    exportState: (): SavedRoundSync => structuredClone(state) };
}

export function validateRoundSync(value: unknown, roundId: unknown): asserts value is SavedRoundSync {
  const s = value as SavedRoundSync;
  const assert = (ok: unknown) => { if (!ok) throw new Error('Invalid round synchronization checkpoint.'); };
  assert(s && typeof s === 'object' && s.base?.roundId === roundId && Array.isArray(s.base?.roster) && Array.isArray(s.base?.events));
  assert(Array.isArray(s.entries) && Array.isArray(s.players) && s.players.length <= 12 && new Set(s.players).size === s.players.length);
  assert(s.entries.length <= INBOX_LIMIT + s.players.length);
  assert(Number.isSafeInteger(s.base.version) && s.base.version >= 0 && typeof s.base.finalized === 'boolean');
  assert(s.base.roster.length >= (s.base.retained ? 1 : 4) && s.base.roster.length <= 12 && new Set(s.base.roster.map(([id]) => id)).size === s.base.roster.length);
  for (const [id, assignment] of s.base.roster) {
    const card = assignment?.card;
    assert(typeof id === 'string' && typeof assignment?.id === 'string' && typeof assignment.ready === 'boolean' && typeof assignment.replacementRequested === 'boolean');
    assert(card && typeof card.id === 'string' && typeof card.title === 'string' && [1, 2, 3].includes(card.difficulty));
    assert(card.setup === undefined || typeof card.setup === 'string' && card.setup.length > 0 && card.setup.length <= 2000);
    assert(card.brief === undefined || card.brief === true);
    assert(card.role === 'possessed' ? [card.behavior, ...(card.clue === undefined ? [] : [card.clue]), card.releaseCondition, card.infectionCondition].every(v => typeof v === 'string' && v.length > 0 && v.length <= 10000) : card.role === 'exorcist' && typeof card.mission === 'string');
  }
  for (const event of s.base.events) {
    assert(event && typeof event.id === 'string' && typeof event.undone === 'boolean' && Array.isArray(event.touches) && event.touches.every(k => typeof k === 'string'));
    assert(event.action && s.base.roster.some(([id]) => id === event.action.actor));
    assert(['infect', 'release', 'mission', 'depart', 'presence_correction'].includes(event.action.kind));
    if (event.action.kind === 'release' && event.action.targetIds !== undefined) assert(validReleaseTargets(event.action.targetIds));
    if (event.action.kind === 'infect') assert(s.base.roster.some(([id]) => event.action.kind === 'infect' && id === event.action.target));
  }
  assert(s.sealed === undefined || typeof s.sealed === 'boolean');
  assert(s.players.length === s.base.roster.length);
  assert(s.players.every(id => typeof id === 'string' && s.base.roster.some(([key]) => key === id)));
  assert(Array.isArray(s.completed) && new Set(s.completed).size === s.completed.length && s.completed.every(id => s.players.includes(id)) && typeof s.closed === 'boolean' && Number.isSafeInteger(s.revision) && s.revision >= 0);
  const ids = new Set<string>();
  for (const entry of s.entries) {
    assert(entry && validOfflineEvent(entry.event) && entry.event.roundId === roundId && s.players.includes(entry.actor) && !ids.has(entry.event.id));
    if (entry.event.action.kind === 'presence_correction') assert(entry.event.clientId === 'server_direct' && entry.approved);
    assert(entry.receipt?.id === entry.event.id && ['accepted', 'review', 'rejected'].includes(entry.receipt.status) && (entry.receipt.reason === null || typeof entry.receipt.reason === 'string') && typeof entry.approved === 'boolean');
    ids.add(entry.event.id);
  }
}
