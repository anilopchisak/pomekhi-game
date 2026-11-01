import { performance } from 'node:perf_hooks';
import type { GameCue, GamePhase, GameSettings, GameSnapshot, LobbyError, PauseReason, RoundResult, TimedPhase } from '../shared/protocol.js';
import { createDealing } from './dealing.js';
import { createSearch } from './search.js';

export interface GameClock {
  now: () => number;
  wallNow: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
}
const defaultClock: GameClock = {
  now: () => performance.now(), wallNow: () => Date.now(),
  schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
};
export function isTimedPhase(phase: GamePhase): phase is TimedPhase {
  return phase === 'placement' || phase === 'search' || phase === 'return';
}
export function validSettings(value: unknown, maximumRounds = 99): value is GameSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as GameSettings;
  return typeof data.infectionEnabled === 'boolean' && (data.roundLimit === null || Number.isInteger(data.roundLimit) && data.roundLimit >= 1 && data.roundLimit <= maximumRounds)
    && [data.placementSeconds, data.searchSeconds, data.returnSeconds].every(item => Number.isInteger(item) && item >= 1 && item <= 3600);
}

/** Owns the party lifecycle; membership, authorization and publication belong to lobby. */
export function createGame({ generateId, randomIndex, clock = defaultClock, onChange }: {
  generateId: () => string; randomIndex: (limit: number) => number; clock?: GameClock; onChange: () => void;
}) {
  const dealing = createDealing({ generateId, randomIndex });
  let settings: GameSettings = { roundLimit: 5, placementSeconds: 45, searchSeconds: 180, returnSeconds: 45, infectionEnabled: false };
  let phase: GamePhase = 'lobby';
  let waitingPhase: 'lobby' | 'between_rounds' = 'lobby';
  let version = 0;
  let roundId: string | null = null;
  let completedRounds = 0;
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
  function sealResult() { updateResult(); const last = results.at(-1); if (last?.status === 'provisional') last.status = 'final'; search?.seal(); }
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
    account(); clearTimer(); completedRounds++;
    results.push(search!.result(completedRounds, 'provisional', activeMs));
    for (const player of originalPossessed) history.set(player, (history.get(player) ?? 0) + 1);
    phase = settings.roundLimit !== null && completedRounds >= settings.roundLimit ? 'finished' : 'between_rounds';
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
    return {
      phase, version, roundId, roundNumber: isTimedPhase(phase) || phase === 'reading' ? completedRounds + 1 : completedRounds,
      completedRounds, settings: { ...settings }, started, paused, pauseReason, deadline, remainingMs,
      results: structuredClone(results), serverNow: clock.now(), activePlayerIds: [...activePlayerIds], rosterChanged, lastRoundAborted,
    };
  }
  function configure(next: GameSettings): LobbyError | undefined {
    if (!['lobby', 'reading', 'between_rounds'].includes(phase)) return 'INVALID_PHASE';
    if (!validSettings(next, Math.max(99, settings.roundLimit ?? 99))) return 'INVALID_INPUT';
    if (started && settings.roundLimit !== next.roundLimit) return 'SETTINGS_LOCKED';
    settings = { roundLimit: next.roundLimit, placementSeconds: next.placementSeconds, searchSeconds: next.searchSeconds, returnSeconds: next.returnSeconds, infectionEnabled: next.infectionEnabled };
    bump();
  }
  function deal(players: string[], count: number, shuffle: boolean): LobbyError | undefined {
    if (shuffle ? phase !== 'reading' : phase !== 'lobby' && phase !== 'between_rounds') return 'INVALID_PHASE';
    const error = dealing.deal(players, count, history);
    if (error) return error;
    if (phase !== 'reading') { sealResult(); search = undefined; }
    if (phase !== 'reading') waitingPhase = phase as 'lobby' | 'between_rounds';
    phase = 'reading'; activePlayerIds = []; roundId = null; rosterChanged = false; lastRoundAborted = false;
    bump();
  }
  function cancelDeal(): LobbyError | undefined {
    if (phase !== 'reading') return 'INVALID_PHASE';
    dealing.cancel(); phase = waitingPhase; bump();
  }
  function start(players: { id: string; online: boolean }[], confirmWarnings: boolean): LobbyError | undefined {
    if (phase !== 'reading') return 'INVALID_PHASE';
    const state = dealing.publicState();
    if (!state.compositionValid || state.assignments.length !== players.length) return 'INVALID_COMPOSITION';
    if (state.assignments.some(item => item.replacementRequested)) return 'REPLACEMENT_PENDING';
    if (!confirmWarnings && (state.assignments.some(item => !item.ready) || players.some(item => !item.online))) return 'START_WARNING';
    activePlayerIds = players.map(item => item.id);
    originalPossessed = activePlayerIds.filter(id => dealing.personal(id)?.card.role === 'possessed');
    rosterChanged = false; lastRoundAborted = false; started = true; roundId = generateId();
    search = createSearch(roundId, new Map(activePlayerIds.map(id => [id, dealing.personal(id)!])), generateId);
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
    account(); results.push(search!.result(completedRounds + 1, 'aborted', activeMs)); search!.seal();
    clearTimer(); phase = 'between_rounds'; lastRoundAborted = true;
    paused = false; pauseReason = null; deadline = null; remainingMs = null; bump('abort');
  }
  function finishParty(): LobbyError | undefined {
    if (phase !== 'between_rounds') return 'INVALID_PHASE';
    sealResult(); phase = 'finished'; bump('finish');
  }
  function extend(): LobbyError | undefined {
    if (phase !== 'finished' || settings.roundLimit === null) return 'INVALID_PHASE';
    settings.roundLimit = completedRounds + 1; phase = 'between_rounds'; bump();
  }
  function add(playerId: string) { if (phase === 'reading') dealing.add(playerId); }
  function remove(playerId: string) {
    search?.depart(playerId);
    dealing.remove(playerId);
    history.delete(playerId);
    originalPossessed = originalPossessed.filter(id => id !== playerId);
    if (isTimedPhase(phase) && activePlayerIds.includes(playerId)) {
      activePlayerIds = activePlayerIds.filter(id => id !== playerId); rosterChanged = true;
      if (paused) bump(); else pause('participant_left');
    }
  }
  function change(...args: Parameters<typeof dealing.change>): LobbyError | undefined {
    return phase === 'reading' ? dealing.change(...args) : 'INVALID_PHASE';
  }
  function playAction(playerId: string, action: 'infect' | 'release' | 'mission' | 'undo', target?: string, completed?: boolean): LobbyError | undefined {
    if (!search || phase === 'reading' || phase === 'lobby' || phase === 'placement') return 'INVALID_PHASE';
    if (lastRoundAborted || results.at(-1)?.roundId === roundId && results.at(-1)?.status === 'final') return 'RESULTS_FINAL';
    if (action !== 'undo' && (paused || action !== 'mission' && phase !== 'search')) return 'INVALID_PHASE';
    if (action === 'infect' && !settings.infectionEnabled) return 'ACTION_UNAVAILABLE';
    const error = action === 'undo' ? search.undo(playerId, target!) : search.act(playerId, action, target, completed);
    if (error) return error;
    bump(); updateResult(); finishSearchIfNeeded();
  }
  function finalize(): LobbyError | undefined {
    if (!['between_rounds', 'finished'].includes(phase) || !results.length) return 'INVALID_PHASE';
    sealResult(); bump();
  }
  function personalPlay(playerId: string) { return search?.personal(playerId) ?? null; }
  function takeCue() { const result = cue; cue = undefined; return result; }
  function dispose() { disposed = true; clearTimer(); cue = undefined; }
  return { publicState, dealingState: dealing.publicState, personal: dealing.personal, configure, deal, cancelDeal,
    start, pause, resume, beginReturn, abort, finishParty, extend, add, remove, change, synchronize, takeCue, dispose, playAction, personalPlay, finalize };
}
