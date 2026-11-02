import { DEFAULT_ROUND_LIMIT } from '../shared/protocol.js';
import { createRitual, newRitual } from './ritual.js';
import type { SavedRitual } from './ritual.js';
import { performance } from 'node:perf_hooks';
import type { Difficulty, GameCue, GamePhase, GameSettings, GameSnapshot, LobbyError, PauseReason, RoundPlan, RoundResult, TimedPhase } from '../shared/protocol.js';
import { createDealing } from './dealing.js';
import { createSearch } from './search.js';
import type { SavedDealing } from './dealing.js';
import { createRoundSync } from './round-sync.js';
import type { SavedRoundSync } from './round-sync.js';
import type { OfflineEvent, Venue } from '../shared/protocol.js';
import type { SavedSearch } from './search.js';

export interface GameClock {
  now: () => number;
  wallNow: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
}
export const defaultClock: GameClock = {
  now: () => performance.now(), wallNow: () => Date.now(),
  schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
};
export interface SavedGame {
  ritual?: SavedRitual | null; freeplayFrom?: number | null;
  venue?: Venue; roundSync?: SavedRoundSync | null; playerNames?: [string, string][];
  tutorialCompleted: boolean; progressionRounds: number; roundPlan: RoundPlan | null;
  dealing: SavedDealing; settings: GameSettings; phase: GamePhase; waitingPhase: 'lobby' | 'between_rounds'; version: number;
  roundId: string | null; completedRounds: number; started: boolean; paused: boolean; pauseReason: PauseReason | null;
  remainingMs: number | null; activePlayerIds: string[]; rosterChanged: boolean; lastRoundAborted: boolean;
  history: [string, number][]; originalPossessed: string[]; search: SavedSearch | null; results: RoundResult[]; activeMs: number;
}
export function isTimedPhase(phase: GamePhase): phase is TimedPhase {
  return phase === 'placement' || phase === 'search' || phase === 'return';
}
export function validSettings(value: unknown, maximumRounds = 99): value is GameSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as GameSettings;
  return typeof data.ritualEnabled === 'boolean' && (!data.ritualEnabled || data.roundLimit !== null) && typeof data.tutorialEnabled === 'boolean' && ['auto', 'on', 'off'].includes(data.infectionMode)
    && validDifficulty(data.initialDifficulty) && validDifficulty(data.maximumDifficulty) && data.initialDifficulty <= data.maximumDifficulty
    && (data.roundLimit === null || Number.isInteger(data.roundLimit) && data.roundLimit >= 1 && data.roundLimit <= maximumRounds)
    && [data.placementSeconds, data.searchSeconds, data.returnSeconds].every(item => Number.isInteger(item) && item >= 1 && item <= 3600);
}

export function validDifficulty(value: unknown): value is Difficulty { return value === 1 || value === 2 || value === 3; }

/** Resolve only the next deal. Issued rounds retain their saved plan. */
export function planRound(settings: GameSettings, completedRounds: number, tutorialCompleted: boolean, horizon: number): RoundPlan {
  if (settings.tutorialEnabled && !tutorialCompleted) return { kind: 'tutorial', number: 0, difficulty: 1, infectionEnabled: settings.infectionMode === 'on' };
  const number = completedRounds + 1;
  const difficulty = number > horizon ? settings.maximumDifficulty : horizon === 1 ? settings.initialDifficulty
    : settings.initialDifficulty + Math.round((settings.maximumDifficulty - settings.initialDifficulty) * (number - 1) / (horizon - 1));
  return { kind: 'regular', number, difficulty: difficulty as Difficulty,
    infectionEnabled: settings.infectionMode === 'on' || settings.infectionMode === 'auto' && number >= Math.max(2, Math.ceil(0.75 * horizon)) };
}

/** Owns the party lifecycle; membership, authorization and publication belong to lobby. */
export function createGame({ generateId, randomIndex, clock = defaultClock, onChange }: {
  generateId: () => string; randomIndex: (limit: number) => number; clock?: GameClock; onChange: () => void;
}) {
  const dealing = createDealing({ generateId, randomIndex });
  let settings: GameSettings = { ritualEnabled: true, roundLimit: DEFAULT_ROUND_LIMIT, placementSeconds: 45, searchSeconds: 180, returnSeconds: 45, tutorialEnabled: true, initialDifficulty: 1, maximumDifficulty: 3, infectionMode: 'on' };
  let playerNames = new Map<string, string>();
  let venue: Venue = { base: 'База', zones: [] };
  let roundSync: ReturnType<typeof createRoundSync> | undefined;
  let phase: GamePhase = 'lobby';
  let waitingPhase: 'lobby' | 'between_rounds' = 'lobby';
  let version = 0;
  let roundId: string | null = null;
  let completedRounds = 0;
  let tutorialCompleted = false;
  let progressionRounds = DEFAULT_ROUND_LIMIT;
  let ritual: ReturnType<typeof createRitual> | undefined;
  let freeplayFrom: number | null = null;
  const ritualActive = () => settings.ritualEnabled && settings.roundLimit !== null && freeplayFrom === null;
  const reviewPending = () => ritualActive() && results.at(-1)?.status === 'provisional';
  function ensureRitual(players: number) { if (ritualActive()) ritual ??= newRitual(players, settings.roundLimit!, randomIndex, generateId); }
  let roundPlan: RoundPlan | null = null;
  const nextPlan = () => planRound(settings, completedRounds, tutorialCompleted, progressionRounds);
  let started = false;
  let paused = false;
  let pauseReason: PauseReason | null = null;
  let deadline: number | null = null;
  let remainingMs: number | null = null;
  let lastNow = clock.now();
  let lastWall = clock.wallNow();
  let activePlayerIds: string[] = [];
  let rosterChanged = false;
  let lastRoundAborted = false;
  const history = new Map<string, number>();
  let originalPossessed: string[] = [];
  let search: ReturnType<typeof createSearch> | undefined;
  const results: RoundResult[] = [];
  let activeMs = 0, runStarted: number | null = null;
  function account(until = clock.now()) { if (runStarted !== null) activeMs += Math.max(0, until - runStarted); runStarted = null; }
  function updateResult() {
    const last = results.at(-1);
    if (search && last?.roundId === roundId && last.status === 'provisional') Object.assign(last, search.result(last.number, last.status, last.activeMs));
  }
  function sealResult() { updateResult(); const last = results.at(-1); if (last?.status === 'provisional') last.status = 'final'; search?.seal(); roundSync?.seal(); }
  function finishSearchIfNeeded() { if (phase === 'search' && !paused && search && !search.canSearch()) { enterTimed('return'); bump('phase'); } }
  let cancelTimer: (() => void) | undefined;
  let timerGeneration = 0;
  let disposed = false;
  let cue: Omit<GameCue, 'roomId'> | undefined;

  function bump(kind?: GameCue['kind']) {
    version++;
    if (kind) cue = { version, phase, kind, serverNow: clock.now() };
  }
  function clearTimer() { timerGeneration++; cancelTimer?.(); cancelTimer = undefined; }
  function schedule() {
    clearTimer();
    if (disposed || !isTimedPhase(phase) || paused) return;
    const generation = timerGeneration;
    cancelTimer = clock.schedule(() => {
      if (disposed || generation !== timerGeneration) return;
      const before = version;
      synchronize();
      if (version !== before) onChange();
    }, Math.min(1000, Math.max(1, deadline! - clock.now())));
  }
  function enterTimed(next: TimedPhase) {
    account(); runStarted = clock.now();
    phase = next; paused = false; pauseReason = null;
    remainingMs = settings[`${next}Seconds`] * 1000;
    lastNow = clock.now(); lastWall = clock.wallNow();
    deadline = lastNow + remainingMs;
    schedule();
  }
  function pause(reason: PauseReason = 'organizer', frozenRemaining?: number): LobbyError | undefined {
    if (!isTimedPhase(phase) || paused) return 'INVALID_PHASE';
    account(frozenRemaining === undefined ? clock.now() : lastNow);
    remainingMs = frozenRemaining ?? Math.max(0, deadline! - clock.now());
    deadline = null; paused = true; pauseReason = reason;
    clearTimer(); bump('pause');
  }
  function finishRound() {
    account(); clearTimer();
    if (roundPlan!.kind === 'tutorial') tutorialCompleted = true;
    else {
      completedRounds++;
      for (const player of originalPossessed) history.set(player, (history.get(player) ?? 0) + 1);
    }
    results.push({ ...search!.result(roundPlan!.number, 'provisional', activeMs), ...roundPlan! });
    phase = !ritualActive() && settings.roundLimit !== null && completedRounds >= settings.roundLimit ? 'finished' : 'between_rounds';
    deadline = null; remainingMs = null; paused = false; pauseReason = null;
    bump('finish');
  }
  function synchronize() {
    const before = version;
    if (disposed || !isTimedPhase(phase) || paused) return false;
    const now = clock.now(), wall = clock.wallNow();
    if (now - lastNow > 5000 || wall - lastWall > 5000 || Math.abs((wall - lastWall) - (now - lastNow)) > 5000) {
      pause('clock_gap', remainingMs!);
    } else {
      remainingMs = Math.max(0, deadline! - now);
      lastNow = now; lastWall = wall;
      if (!remainingMs) {
        if (phase === 'return') finishRound();
        else { enterTimed(phase === 'placement' ? 'search' : 'return'); bump('phase'); finishSearchIfNeeded(); }
      }
      schedule();
    }
    return version !== before;
  }
  function publicState(): GameSnapshot {
    updateResult();
    const sync = roundSync?.publicState();
    return {
      ritual: ritual?.snapshot(['between_rounds', 'finished'].includes(phase) ? results.at(-1) : undefined) ?? null, freeplayFrom,
      phase, version, roundId, roundNumber: (roundPlan ?? nextPlan()).number,
      venue: structuredClone(venue), synchronization: sync ? { ...sync, waitingPlayers: sync.waitingPlayerIds.map(id => ({ id, name: playerNames.get(id) ?? id })) } : null,
      tutorialCompleted, roundPlan: { ...(roundPlan ?? nextPlan()) },
      completedRounds, settings: { ...settings }, started, paused, pauseReason, deadline, remainingMs,
      results: structuredClone(results), serverNow: clock.now(), activePlayerIds: [...activePlayerIds], rosterChanged, lastRoundAborted,
    };
  }
  function configure(next: GameSettings): LobbyError | undefined {
    if (!['lobby', 'reading', 'between_rounds'].includes(phase)) return 'INVALID_PHASE';
    if (!validSettings(next, Math.max(99, settings.roundLimit ?? 99))) return 'INVALID_INPUT';
    const progressionChanged = (['ritualEnabled', 'roundLimit', 'tutorialEnabled', 'initialDifficulty', 'maximumDifficulty'] as const).some(key => settings[key] !== next[key]);
    if (progressionChanged && (started || phase === 'reading')) return 'SETTINGS_LOCKED';
    const infectionChanged = settings.infectionMode !== next.infectionMode;
    settings = { ritualEnabled: next.ritualEnabled, roundLimit: next.roundLimit, placementSeconds: next.placementSeconds, searchSeconds: next.searchSeconds, returnSeconds: next.returnSeconds,
      tutorialEnabled: next.tutorialEnabled, initialDifficulty: next.initialDifficulty, maximumDifficulty: next.maximumDifficulty, infectionMode: next.infectionMode };
    if (!started) progressionRounds = settings.roundLimit ?? DEFAULT_ROUND_LIMIT;
    if (phase === 'reading' && infectionChanged) roundPlan!.infectionEnabled = nextPlan().infectionEnabled;
    bump();
  }
  function deal(players: string[], count: number, shuffle: boolean): LobbyError | undefined {
    if (shuffle ? phase !== 'reading' : phase !== 'lobby' && phase !== 'between_rounds') return 'INVALID_PHASE';
    if (!shuffle && roundSync && !roundSync.ready()) return 'SYNC_PENDING';
    if (!shuffle && reviewPending()) return 'RITUAL_REVIEW_PENDING';
    const plan = phase === 'reading' ? roundPlan! : nextPlan();
    const error = dealing.deal(players, count, history, plan.difficulty);
    if (error) return error;
    if (phase !== 'reading') { sealResult(); search = undefined; roundSync = undefined; }
    roundPlan = { ...plan };
    if (phase !== 'reading') waitingPhase = phase as 'lobby' | 'between_rounds';
    phase = 'reading'; activePlayerIds = []; roundId = null; rosterChanged = false; lastRoundAborted = false;
    bump();
  }
  function cancelDeal(): LobbyError | undefined {
    if (phase !== 'reading') return 'INVALID_PHASE';
    dealing.cancel(); roundPlan = null; phase = waitingPhase; bump();
  }
  function start(players: { id: string; online: boolean; name?: string }[], confirmWarnings: boolean): LobbyError | undefined {
    if (phase !== 'reading') return 'INVALID_PHASE';
    const state = dealing.publicState();
    if (!state.compositionValid || state.assignments.length !== players.length) return 'INVALID_COMPOSITION';
    if (state.assignments.some(item => item.replacementRequested)) return 'REPLACEMENT_PENDING';
    if (!confirmWarnings && (state.assignments.some(item => !item.ready) || players.some(item => !item.online))) return 'START_WARNING';
    if (roundPlan!.kind === 'regular') ensureRitual(players.length);
    ritual?.lock();
    playerNames = new Map(players.map(item => [item.id, item.name ?? item.id]));
    activePlayerIds = players.map(item => item.id);
    originalPossessed = activePlayerIds.filter(id => dealing.personal(id)?.card.role === 'possessed');
    rosterChanged = false; lastRoundAborted = false; started = true; roundId = generateId();
    search = createSearch(roundId, new Map(activePlayerIds.map(id => [id, dealing.personal(id)!])), generateId);
    roundSync = undefined; ensureSync();
    activeMs = 0; runStarted = null;
    enterTimed('placement'); bump('start');
  }
  function resume(confirmWarnings: boolean): LobbyError | undefined {
    if (!isTimedPhase(phase) || !paused) return 'INVALID_PHASE';
    if (!activePlayerIds.length) return 'INVALID_COMPOSITION';
    if (rosterChanged && !confirmWarnings) return 'RESUME_WARNING';
    paused = false; pauseReason = null; lastNow = clock.now(); lastWall = clock.wallNow();
    deadline = lastNow + remainingMs!; runStarted = lastNow; schedule(); bump('resume'); finishSearchIfNeeded();
  }
  function beginReturn(): LobbyError | undefined {
    if (phase !== 'search') return 'INVALID_PHASE';
    if (!activePlayerIds.length) return 'INVALID_COMPOSITION';
    enterTimed('return'); bump('phase');
  }
  function abort(): LobbyError | undefined {
    if (!isTimedPhase(phase)) return 'INVALID_PHASE';
    account(); results.push({ ...search!.result(roundPlan!.number, 'aborted', activeMs), ...roundPlan! }); search!.seal(); roundSync?.seal();
    clearTimer(); phase = 'between_rounds'; lastRoundAborted = true;
    paused = false; pauseReason = null; deadline = null; remainingMs = null; bump('abort');
  }
  function finishParty(): LobbyError | undefined {
    if (phase !== 'between_rounds') return 'INVALID_PHASE';
    if (roundSync && !roundSync.ready()) return 'SYNC_PENDING';
    if (reviewPending()) return 'RITUAL_REVIEW_PENDING';
    if (ritualActive()) { ensureRitual(search?.exportState().roster.length ?? playerNames.size); ritual!.stop(); }
    sealResult(); phase = 'finished'; bump('finish');
  }
  function extend(): LobbyError | undefined {
    if (phase !== 'finished' || settings.roundLimit === null || ritualActive()) return 'INVALID_PHASE';
    settings.roundLimit = completedRounds + 1; phase = 'between_rounds'; bump();
  }
  function add(playerId: string) { if (phase === 'reading') dealing.add(playerId); }
  function remove(playerId: string) {
    if (roundSync) { roundSync.legacy(playerId, { kind: 'withdraw' }); search = roundSync.current(); } else search?.depart(playerId);
    dealing.remove(playerId);
    history.delete(playerId);
    originalPossessed = originalPossessed.filter(id => id !== playerId);
    if (isTimedPhase(phase) && activePlayerIds.includes(playerId)) {
      activePlayerIds = activePlayerIds.filter(id => id !== playerId); rosterChanged = true;
      bump(); finishSearchIfNeeded();
    }
  }
  function change(...args: Parameters<typeof dealing.change>): LobbyError | undefined {
    return phase === 'reading' ? dealing.change(...args) : 'INVALID_PHASE';
  }
  function playAction(playerId: string, action: 'infect' | 'release' | 'mission' | 'undo', target?: string, completed?: boolean): LobbyError | undefined {
    if (!search || phase === 'reading' || phase === 'lobby' || phase === 'placement') return 'INVALID_PHASE';
    if (lastRoundAborted || results.at(-1)?.roundId === roundId && results.at(-1)?.status === 'final') return 'RESULTS_FINAL';
    if (action !== 'undo' && (paused || action !== 'mission' && phase !== 'search')) return 'INVALID_PHASE';
    if (action === 'infect' && !roundPlan!.infectionEnabled) return 'ACTION_UNAVAILABLE';
    const intent = action === 'infect' ? { kind: action, targetId: target! } as const : action === 'undo' ? { kind: action, actionId: target! } as const : action === 'mission' ? { kind: action, completed: completed! } as const : { kind: action } as const;
    const error = roundSync ? roundSync.legacy(playerId, intent) : action === 'undo' ? search.undo(playerId, target!) : search.act(playerId, action, target, completed);
    if (roundSync) search = roundSync.current();
    if (error) return error;
    bump(); updateResult(); finishSearchIfNeeded();
  }
  function finalize(): LobbyError | undefined {
    if (!['between_rounds', 'finished'].includes(phase) || !results.length) return 'INVALID_PHASE';
    if (roundSync && !roundSync.ready()) return 'SYNC_PENDING';
    const last = results.at(-1)!;
    if (ritualActive() && last.status === 'provisional' && last.kind === 'regular') {
      const error = ritual!.commit({ ...last, status: 'final' }); if (error) return error;
    }
    sealResult();
    if (ritualActive() && ritual && ritual.snapshot().outcome !== 'playing') { phase = 'finished'; bump('finish'); } else bump();
  }
  function ritualAction(action: 'penalty' | 'undoPenalty'): LobbyError | undefined {
    if (!ritualActive() || !ritual || !['reading', 'between_rounds'].includes(phase)) return 'INVALID_PHASE';
    const error = ritual[action](); if (!error) bump(); return error;
  }
  function freeplay(): LobbyError | undefined {
    if (phase !== 'finished' || !ritual || ritual.snapshot().outcome === 'playing' || freeplayFrom !== null) return 'INVALID_PHASE';
    freeplayFrom = results.length; settings = { ...settings, ritualEnabled: false, roundLimit: null }; phase = 'between_rounds'; bump();
  }
  function ensureSync() {
    if (!search) return;
    roundSync ??= createRoundSync({ base: search.exportState(), entries: [], players: search.exportState().roster.map(([id]) => id), completed: [], closed: false, revision: 0 }, generateId);
  }
  function syncEvents(actor: string, expectedRound: string, events: OfflineEvent[]): LobbyError | undefined {
    if (!search || roundId !== expectedRound) return 'STALE_GAME';
    ensureSync();
    const beforeRevision = roundSync!.publicState().revision;
    const closed = lastRoundAborted || results.some(row => row.roundId === roundId && row.status === 'final');
    if (closed) roundSync!.close();
    if (events.some(e => (e.action.kind === 'infect' || e.action.kind === 'captured') && !roundPlan!.infectionEnabled)) return 'ACTION_UNAVAILABLE';
    const error = roundSync!.ingest(actor, events, e => e.action.kind === 'withdraw' || e.action.kind === 'undo' ||
      !paused && (e.action.kind === 'mission' ? ['search', 'return', 'between_rounds', 'finished'].includes(phase) : phase === 'search' && e.phase === 'search' && !e.paused));
    search = roundSync!.current();
    activePlayerIds = activePlayerIds.filter(id => search!.personal(id) !== null);
    if (!error && roundSync!.publicState().revision !== beforeRevision) { bump(); updateResult(); finishSearchIfNeeded(); }
    return error;
  }
  function completeSync(actor: string, expectedRound: string, revision: number): LobbyError | undefined {
    if (roundId !== expectedRound || !roundSync || isTimedPhase(phase)) return 'INVALID_PHASE';
    const wasComplete = roundSync.personal(actor).complete;
    const error = roundSync.complete(actor, revision); if (!error && !wasComplete) bump(); return error;
  }
  function resolveSync(id: string, decision: 'accept' | 'reject', before?: string): LobbyError | undefined {
    if (!roundSync || isTimedPhase(phase) || phase === 'reading') return 'INVALID_PHASE';
    const error = roundSync.resolve(id, decision, before); search = roundSync.current(); if (!error) { bump(); updateResult(); } return error;
  }
  function closeSync(): LobbyError | undefined {
    if (!roundSync || isTimedPhase(phase) || phase === 'reading') return 'INVALID_PHASE';
    roundSync.close(); bump(); return;
  }
  function withdraw(actor: string): LobbyError | undefined {
    if (!search || !isTimedPhase(phase)) return 'INVALID_PHASE';
    ensureSync(); const error = roundSync!.legacy(actor, { kind: 'withdraw' }); search = roundSync!.current();
    if (!error) { activePlayerIds = activePlayerIds.filter(id => id !== actor); bump(); finishSearchIfNeeded(); }
    return error;
  }
  function configureVenue(next: unknown): LobbyError | undefined {
    if (!['lobby', 'between_rounds'].includes(phase)) return 'INVALID_PHASE';
    if (!next || typeof next !== 'object') return 'INVALID_INPUT';
    const v = next as Venue;
    const valid = (name: unknown) => typeof name === 'string' && name.trim().length > 0 && name.length <= 64 && !/\p{Cc}/u.test(name);
    if (!valid(v.base) || !Array.isArray(v.zones) || v.zones.length > 12 || !v.zones.every(valid)) return 'INVALID_INPUT';
    const names = [v.base, ...v.zones].map(n => n.trim());
    if (new Set(names.map(n => n.toLocaleLowerCase('ru'))).size !== names.length) return 'INVALID_INPUT';
    venue = { base: names[0], zones: names.slice(1) }; bump();
  }
  function personalPlay(playerId: string) { return search?.personal(playerId) ?? null; }
  function takeCue() { const result = cue; cue = undefined; return result; }
  function dispose() { disposed = true; clearTimer(); cue = undefined; }
  function exportState(): SavedGame {
    updateResult();
    // lastNow/remainingMs are the last healthy clock checkpoint, including clock-gap protection.
    return structuredClone({ ritual: ritual?.exportState() ?? null, freeplayFrom, venue, playerNames: [...playerNames], roundSync: roundSync?.exportState() ?? null, tutorialCompleted, progressionRounds, roundPlan, dealing: dealing.exportState(), settings, phase, waitingPhase, version, roundId, completedRounds, started,
      paused, pauseReason, remainingMs, activePlayerIds, rosterChanged, lastRoundAborted, history: [...history], originalPossessed,
      search: search?.exportState() ?? null, results, activeMs: activeMs + (runStarted === null ? 0 : Math.max(0, lastNow - runStarted)) });
  }
  function restore(state: SavedGame, reason: PauseReason = 'server_restarted', bumpVersion = true) {
    clearTimer(); cue = undefined;
    ritual = state.ritual ? createRitual(state.ritual, generateId) : undefined; freeplayFrom = state.freeplayFrom ?? null;
    playerNames = new Map(state.playerNames ?? []);
    venue = structuredClone(state.venue ?? { base: 'База', zones: [] });
    roundSync = state.roundSync ? createRoundSync(state.roundSync, generateId) : undefined;
    tutorialCompleted = state.tutorialCompleted; progressionRounds = state.progressionRounds; roundPlan = structuredClone(state.roundPlan);
    dealing.restore(state.dealing, bumpVersion); settings = { ...state.settings }; phase = state.phase; waitingPhase = state.waitingPhase;
    version = state.version + Number(bumpVersion); roundId = state.roundId; completedRounds = state.completedRounds; started = state.started;
    paused = isTimedPhase(phase) ? true : state.paused; pauseReason = isTimedPhase(phase) ? reason : state.pauseReason;
    remainingMs = state.remainingMs; deadline = null; activePlayerIds = [...state.activePlayerIds]; rosterChanged = state.rosterChanged;
    lastRoundAborted = state.lastRoundAborted; history.clear(); for (const [id, count] of state.history) history.set(id, count);
    originalPossessed = [...state.originalPossessed]; results.splice(0, results.length, ...structuredClone(state.results));
    activeMs = state.activeMs; runStarted = null; lastNow = clock.now(); lastWall = clock.wallNow();
    search = state.search ? createSearch(state.search.roundId, new Map(state.search.roster), generateId) : undefined;
    if (state.search) search!.restore(state.search, bumpVersion);
    if (roundSync) search = roundSync.current();
    else if (search && !search.exportState().finalized) ensureSync();
  }
  return { publicState, dealingState: dealing.publicState, personal: dealing.personal, configure, deal, cancelDeal,
    configureVenue, syncEvents, completeSync, resolveSync, closeSync, withdraw, personalSync: (id: string) => roundSync?.personal(id) ?? null, review: () => (roundSync?.review() ?? []).map(entry => ({ ...entry, actorName: playerNames.get(entry.actor), targetName: playerNames.get('targetId' in entry.action ? entry.action.targetId : 'by' in entry.action ? entry.action.by : '') })),
    ritualAction, freeplay, start, pause, resume, beginReturn, abort, finishParty, extend, add, remove, change, synchronize, takeCue, dispose, playAction, personalPlay, finalize, exportState, restore };
}
