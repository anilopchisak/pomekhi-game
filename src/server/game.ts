import { cardSets, venueFeatures, DEFAULT_ROUND_LIMIT } from '../shared/protocol.js';
import { createRitual, newRitual } from './ritual.js';
import type { SavedRitual } from './ritual.js';
import { performance } from 'node:perf_hooks';
import type { Assignment, PresenceCorrection, Difficulty, GameCue, GamePhase, GameSettings, GameSnapshot, LobbyError, PersonalCard, PauseReason, RoundPlan, RoundResult, TimedPhase } from '../shared/protocol.js';
import { createDealing } from './dealing.js';
import { createSearch } from './search.js';
import type { SavedDealing } from './dealing.js';
import { createRoundSync } from './round-sync.js';
import type { SavedRoundSync } from './round-sync.js';
import { CARD_BANK } from './cards.js';
import { eligibleTrials, selectTrials, beginTrial, personalTrial, submitTrial, trialBonus, trialReview, reviewTrialEvidence } from './trials.js';
import type { SavedTrials } from './trials.js';
import { authoredMissions, authoredReferences } from './authored-content.js';
import { comedyMissions } from './comedy-missions.js';
import { shortAnswer, shortMission } from './short-cards.js';
import { dwellingMissions, stories } from './first-game-content.js';
import type { MissingLocation, OfflineEvent, PhysicalStatus, ReviewPreview, TrialReviewFact, Venue, ViolationReview } from '../shared/protocol.js';
import type { SavedSearch, RetainedGroup } from './search.js';

const baseMissions = authoredMissions.map(card => shortMission(card));
const comicMissions = comedyMissions.map(card => shortMission(card));
const shortReferences = authoredReferences.map(({ id, title }) => ({ id, title,
  sections: [{ title: 'Что делать в этой роли?', text: shortAnswer(id) }] }));

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
  firstGame?: { locked: boolean; retained: RetainedGroup[]; presence: [string, PhysicalStatus][]; waitingFree: string[]; trials?: SavedTrials; violations?: ViolationReview[]; locations?: [string, { proposed?: string; confirmed?: string }][]; story?: { title: string; prologue: string }; unassigned?: [string, Assignment][]; recallWait?: { players: string[]; remainingMs: number } };
  ritual?: SavedRitual | null; freeplayFrom?: number | null;
  venue?: Venue & { horror?: boolean }; roundSync?: SavedRoundSync | null; playerNames?: [string, string][];
  tutorialCompleted: boolean; progressionRounds: number; roundPlan: RoundPlan | null;
  dealing: SavedDealing; settings: GameSettings; phase: GamePhase; waitingPhase: 'lobby' | 'between_rounds'; version: number;
  roundId: string | null; completedRounds: number; started: boolean; paused: boolean; pauseReason: PauseReason | null;
  remainingMs: number | null; activePlayerIds: string[]; rosterChanged: boolean; lastRoundAborted: boolean;
  history: [string, number][]; originalPossessed: string[]; search: SavedSearch | null; results: RoundResult[]; activeMs: number;
}
export function isTimedPhase(phase: GamePhase): phase is TimedPhase {
  return phase === 'placement' || phase === 'search' || phase === 'return';
}

function isMissionReportPhase(phase: GamePhase) {
  return phase === 'search' || phase === 'return' || phase === 'between_rounds';
}
const FIRST_DEAL_MINIMUM = 5;
export function validSettings(value: unknown, maximumRounds = 99): value is GameSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as GameSettings;
  return typeof data.ritualEnabled === 'boolean' && (!data.ritualEnabled || data.roundLimit !== null) && typeof data.tutorialEnabled === 'boolean' && ['auto', 'on', 'off'].includes(data.infectionMode)
    && validDifficulty(data.initialDifficulty) && validDifficulty(data.maximumDifficulty) && data.initialDifficulty <= data.maximumDifficulty
    && (data.roundLimit === null || Number.isInteger(data.roundLimit) && data.roundLimit >= 1 && data.roundLimit <= maximumRounds)
    && data.offlineWaitSeconds !== null && [data.placementSeconds, data.searchSeconds, data.returnSeconds, data.offlineWaitSeconds ?? 90].every(item => Number.isInteger(item) && item >= 1 && item <= 3600);
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
export function createGame({ generateId, randomIndex, clock = defaultClock, onChange, onlinePlayers, getCards = () => CARD_BANK, firstGame = false }: {
  generateId: () => string; randomIndex: (limit: number) => number; clock?: GameClock; onChange: () => void; onlinePlayers?: () => ReadonlySet<string>; getCards?: () => readonly PersonalCard[]; firstGame?: boolean;
}) {
  let locked = false;
  let retained: RetainedGroup[] = [];
  let unassigned: [string, Assignment][] = [];
  let recallWait: { players: string[]; deadline: number } | undefined;
  let cancelRecall: (() => void) | undefined;
  let waitingFree: string[] = [];
  let selectedStory: { title: string; prologue: string } | undefined;
  let trials: SavedTrials | undefined;
  let violations: ViolationReview[] = [];
  const locations = new Map<string, { proposed?: string; confirmed?: string }>();
  const presence = new Map<string, PhysicalStatus>();
  const usesAuthoredBank = () => firstGame && (venue.mode === 'ordinary' || venue.bank === 'authored');
  const dealing = createDealing({ generateId, randomIndex, getCards, ordered: firstGame ? {
    minimum: () => started ? 1 : FIRST_DEAL_MINIMUM,
    reserved: () => retained.map(g => g.assignment.card.id),
    pool: () => {
      const eligible = (card: PersonalCard) => (!card.harder || venue.harder) &&
        (card.sets ?? []).every(set => venue.sets?.includes(set) || set === 'harder' && venue.harder) &&
        (card.requirements ?? []).every(feature => feature === 'twoZones' ? venue.zones.length >= 2 : feature === 'contact' ? venue.sets?.includes('contact') : venue.features?.includes(feature));
      if (!usesAuthoredBank()) return [...getCards(), ...dwellingMissions].filter(eligible);
      const bank = venue.comedy ? [...baseMissions, ...comicMissions] : baseMissions;
      return bank.filter(eligible);
    },
  } : undefined });
  let settings: GameSettings = { ritualEnabled: true, roundLimit: DEFAULT_ROUND_LIMIT, placementSeconds: 45, searchSeconds: firstGame ? 240 : 180, returnSeconds: 45, ...(firstGame ? { offlineWaitSeconds: 90 } : {}), tutorialEnabled: !firstGame, initialDifficulty: firstGame ? 3 : 1, maximumDifficulty: 3, infectionMode: 'on' };
  let playerNames = new Map<string, string>();
  let venue: Venue = { base: 'База', zones: [], ...(firstGame ? { mode: 'ordinary', bank: 'authored' } : {}) };
  function initializeStory() {
    if (!firstGame || selectedStory) return;
    const { id, title } = stories[randomIndex(stories.length)];
    selectedStory = { title, prologue: shortAnswer(id) };
    venue = { ...venue, storyId: id };
  }
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
  function ensureRitual(players: number) { if (ritualActive()) ritual ??= newRitual(players, settings.roundLimit!, randomIndex, generateId, firstGame, usesAuthoredBank()); }
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
    if (search && last?.roundId === roundId && last.status === 'provisional') {
      Object.assign(last, search.result(last.number, last.status, last.activeMs));
      if (trials?.current && trialCard()) last.trialBonus = trialBonus(trialCard()!, trials.current, trialParticipants());
    }
  }
  function sealResult() { updateResult(); const last = results.at(-1); if (last?.status === 'provisional') last.status = 'final'; search?.seal(); roundSync?.seal(); }
  function timed() { return isTimedPhase(phase) && (!firstGame || phase !== 'return'); }
  function recall() {
    if (!firstGame) { enterTimed('return'); bump('phase'); return; }
    account(); clearTimer();
    phase = 'return'; paused = false; pauseReason = null; deadline = null; remainingMs = null;
    const online = onlinePlayers?.();
    const players = online && activePlayerIds.filter(id => !online.has(id) && playerNames.has(id));
    if (players?.length) {
      recallWait = { players, deadline: clock.now() + (settings.offlineWaitSeconds ?? 90) * 1000 };
      scheduleRecall();
    }
    bump('phase');
  }
  function finishSearchIfNeeded() { if (phase === 'search' && !paused && search && !search.canSearch()) recall(); }
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
    if (disposed || !timed() || paused) return;
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
    if (!timed() || paused) return 'INVALID_PHASE';
    account(frozenRemaining === undefined ? clock.now() : lastNow);
    remainingMs = frozenRemaining ?? Math.max(0, deadline! - clock.now());
    deadline = null; paused = true; pauseReason = reason;
    clearTimer(); bump('pause');
  }
  function clearRecall() {
    cancelRecall?.(); cancelRecall = undefined; recallWait = undefined;
  }

  function reviewCanReturnPlayer() {
    const rows = roundSync?.review() ?? [];
    return rows.some(row => {
      if (row.status !== 'review') return false;
      if (row.action.kind === 'release') return true;
      if (row.action.kind !== 'undo') return false;
      const { actionId } = row.action;
      return rows.some(action => action.id === actionId && action.action.kind === 'infect');
    });
  }

  function scheduleRecall() {
    cancelRecall?.();
    const wait = recallWait;
    if (!wait || wait.deadline <= clock.now()) return;
    cancelRecall = clock.schedule(() => {
      if (disposed || recallWait !== wait) return;
      reconcileRecall();
      scheduleRecall();
      onChange();
    }, Math.min(1000, wait.deadline - clock.now()));
  }

  function reconcileRecall() {
    const connected = onlinePlayers?.();
    if (!connected || !(phase === 'return' || phase === 'between_rounds' && results.at(-1)?.status === 'provisional')) return false;
    const before = version;
    let confirmed = false;
    for (const id of connected) {
      const status = physicalStatus(id);
      if (status && presence.get(id) !== status.expected) {
        presence.set(id, status.expected);
        confirmed = true;
      }
    }
    if (confirmed) bump();
    if (!recallWait || recallWait.deadline > clock.now() ||
      returners().length || !recallWait.players.some(id => playerNames.has(id) && !connected.has(id))) return confirmed;
    const online = [...playerNames.keys()].filter(id => connected.has(id));
    if (!online.length || !online.every(id => physicalStatus(id)?.expected === 'in_group')) return confirmed;
    if (phase === 'return') finishRound();
    if (!reviewCanReturnPlayer()) finalize(true);
    return version !== before;
  }

  function finishRound() {
    account(); clearTimer();
    if (trials?.current) trials.current.branch = (ritual?.snapshot().cards.slice(0, 2).filter(card => card.revealed).length ?? 0) >= 2 ? 'late' : 'early';
    if (roundPlan!.kind === 'tutorial') tutorialCompleted = true;
    else {
      completedRounds++;
      if (!firstGame) for (const player of originalPossessed) history.set(player, (history.get(player) ?? 0) + 1);
    }
    results.push({ ...search!.result(roundPlan!.number, 'provisional', activeMs), ...roundPlan! });
    phase = !ritualActive() && settings.roundLimit !== null && completedRounds >= settings.roundLimit ? 'finished' : 'between_rounds';
    deadline = null; remainingMs = null; paused = false; pauseReason = null;
    bump('finish');
  }
  function synchronize() {
    const before = version;
    if (disposed || !timed() || paused) return false;
    const now = clock.now(), wall = clock.wallNow();
    if (now - lastNow > 5000 || wall - lastWall > 5000 || Math.abs((wall - lastWall) - (now - lastNow)) > 5000) {
      pause('clock_gap', remainingMs!);
    } else {
      remainingMs = Math.max(0, deadline! - now);
      lastNow = now; lastWall = wall;
      if (!remainingMs) {
        if (phase === 'return') finishRound();
        else if (phase === 'search') recall();
        else { enterTimed('search'); if (trials && trialCard()) trials.current = beginTrial(trialCard()!, trialParticipants(), randomIndex); bump('phase'); finishSearchIfNeeded(); }
      }
      schedule();
    }
    return version !== before;
  }
  function publicState(): GameSnapshot {
    updateResult();
    const sync = roundSync?.publicState();
    const story = firstGame && selectedStory;
    return {
      ...(firstGame ? { firstGame: true as const, preparationLocked: locked } : {}),
      ...(usesAuthoredBank() ? { references: structuredClone(shortReferences) } : {}),
      ...(story ? { story: { title: story.title, prologue: story.prologue } } : {}),
      ritual: ritual?.snapshot(['between_rounds', 'finished'].includes(phase) ? results.at(-1) : undefined) ?? null, freeplayFrom,
      ...(recallWait ? { offlineWait: { deadline: recallWait.deadline, awaitingReview: recallWait.deadline <= clock.now() && reviewCanReturnPlayer() } } : {}),
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
    if (firstGame) {
      if ((Object.keys(settings) as (keyof GameSettings)[]).some(key =>
        key !== 'placementSeconds' && key !== 'searchSeconds' && key !== 'offlineWaitSeconds' && next[key] !== settings[key])) return 'SETTINGS_LOCKED';
      settings = { ...settings, placementSeconds: next.placementSeconds, searchSeconds: next.searchSeconds, offlineWaitSeconds: next.offlineWaitSeconds ?? settings.offlineWaitSeconds };
      bump();
      return;
    }
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
    if (firstGame && violations.some(item => item.status === 'review')) return 'RITUAL_REVIEW_PENDING';
    if (!shuffle && reviewPending()) return 'RITUAL_REVIEW_PENDING';
    if (firstGame) {
      if (!venue.dwelling || !venue.storyId) return 'PREPARATION_REQUIRED';
      if (shuffle || started) {
        const eligible = new Set(shuffle ? dealing.publicState().assignments.map(item => item.playerId) : returners());
        players = players.filter(id => eligible.has(id));
      }
    }
    if (firstGame && !locked && venue.mode === 'ordinary' && eligibleTrials(venue).length < 7) return 'TRIAL_POOL_INSUFFICIENT';
    const plan = phase === 'reading' ? roundPlan! : nextPlan();
    const error = dealing.deal(players, count, history, plan.difficulty);
    if (error) return error;
    if (phase !== 'reading') { clearRecall(); sealResult(); search = undefined; roundSync = undefined; }
    if (firstGame && !locked && venue.mode === 'ordinary') trials = selectTrials(venue, randomIndex);
    if (firstGame) locked = true;
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
    const names = players;
    if (firstGame) players = players.filter(item => dealing.personal(item.id) !== null);
    if (!state.compositionValid || state.assignments.length !== players.length) return 'INVALID_COMPOSITION';
    if (state.assignments.some(item => item.replacementRequested)) return 'REPLACEMENT_PENDING';
    if (!confirmWarnings && (state.assignments.some(item => !item.ready) || players.some(item => !item.online))) return 'START_WARNING';
    if (roundPlan!.kind === 'regular') ensureRitual(players.length);
    ritual?.lock();
    playerNames = new Map(names.map(item => [item.id, item.name ?? item.id]));
    const assigned = new Map(players.map(item => [item.id, dealing.personal(item.id)!]));
    activePlayerIds = [...new Set([...assigned.keys(), ...retained.flatMap(group => group.members.map(([id]) => id)), ...unassigned.map(([id]) => id)])];
    originalPossessed = players.map(p => p.id).filter(id => assigned.get(id)?.card.role === 'possessed');
    rosterChanged = false; lastRoundAborted = false; started = true; roundId = generateId();
    search = createSearch(roundId, new Map([...assigned, ...retained.flatMap(group => group.members), ...unassigned]), generateId, firstGame ? retained : undefined, unassigned.map(([id]) => id));
    if (firstGame) waitingFree = waitingFree.filter(id => !assigned.has(id));
    presence.clear(); locations.clear(); if (trials) delete trials.current;
    roundSync = undefined; ensureSync();
    activeMs = 0; runStarted = null;
    enterTimed('placement'); bump('start');
  }
  function resume(confirmWarnings: boolean): LobbyError | undefined {
    if (!timed() || !paused) return 'INVALID_PHASE';
    if (!activePlayerIds.length) return 'INVALID_COMPOSITION';
    if (rosterChanged && !confirmWarnings) return 'RESUME_WARNING';
    paused = false; pauseReason = null; lastNow = clock.now(); lastWall = clock.wallNow();
    deadline = lastNow + remainingMs!; runStarted = lastNow; schedule(); bump('resume'); finishSearchIfNeeded();
  }
  function beginReturn(): LobbyError | undefined {
    if (firstGame && phase === 'return') { finishRound(); return; }
    if (phase !== 'search' || firstGame && paused) return 'INVALID_PHASE';
    if (!firstGame && !activePlayerIds.length) return 'INVALID_COMPOSITION';
    recall();
  }
  function abort(): LobbyError | undefined {
    if (firstGame) return finishParty();
    if (!isTimedPhase(phase)) return 'INVALID_PHASE';
    account(); results.push({ ...search!.result(roundPlan!.number, 'aborted', activeMs), ...roundPlan! }); search!.seal(); roundSync?.seal();
    clearTimer(); phase = 'between_rounds'; lastRoundAborted = true;
    paused = false; pauseReason = null; deadline = null; remainingMs = null; bump('abort');
  }
  function finishParty(): LobbyError | undefined {
    if (firstGame) {
      if (phase === 'finished' || phase === 'lobby') return 'INVALID_PHASE';
      ensureRitual(Math.max(5, dealing.publicState().assignments.length));
      account();
      if (results.at(-1)?.status === 'provisional') { results.at(-1)!.status = 'aborted'; completedRounds--; }
      if (roundId && search && !results.some(row => row.roundId === roundId))
        results.push({ ...search.result(roundPlan!.number, 'aborted', activeMs), ...roundPlan! });
      clearRecall(); roundSync?.close(); sealResult(); ritual!.stop();
      for (const report of violations) if (report.status === 'review') report.status = 'rejected';
      if (trials?.current?.lateVisit === 'review') trials.current.lateVisit = 'rejected';
      clearTimer(); phase = 'finished'; deadline = null; remainingMs = null; paused = false; pauseReason = null;
      bump('finish'); return;
    }
    if (phase !== 'between_rounds') return 'INVALID_PHASE';
    if (roundSync && !roundSync.ready()) return 'SYNC_PENDING';
    if (reviewPending()) return 'RITUAL_REVIEW_PENDING';
    if (ritualActive()) { ensureRitual(search?.exportState().roster.length ?? playerNames.size); ritual!.stop(); }
    sealResult(); phase = 'finished'; bump('finish');
  }
  function extend(): LobbyError | undefined {
    if (firstGame) return 'INVALID_PHASE';
    if (phase !== 'finished' || settings.roundLimit === null || ritualActive()) return 'INVALID_PHASE';
    settings.roundLimit = completedRounds + 1; phase = 'between_rounds'; bump();
  }
  function add(playerId: string, members = 0) {
    if (firstGame && locked) {
      if (started || phase !== 'lobby' || members >= FIRST_DEAL_MINIMUM) return 'SETTINGS_LOCKED';
      return;
    }
    if (phase === 'reading') return dealing.add(playerId);
  }
  function remove(playerId: string) {
    if (roundSync) { roundSync.legacy(playerId, { kind: 'withdraw' }); search = roundSync.current(); } else search?.depart(playerId);
    dealing.remove(playerId);
    if (firstGame) {
      unassigned = unassigned.filter(([id]) => id !== playerId);
      playerNames.delete(playerId); presence.delete(playerId); waitingFree = waitingFree.filter(id => id !== playerId);
      retained = retained.map(g => ({ ...g, members: g.members.filter(([id]) => id !== playerId) })).filter(g => g.members.length > 0);
      venue.order = venue.order?.filter(id => id !== playerId);
      bump();
    }
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
  function playAction(playerId: string, action: 'infect' | 'release' | 'mission' | 'undo', target?: string, completed?: boolean, requestReview?: true, targetIds?: string[]): LobbyError | undefined {
    if (!search || phase === 'reading' || phase === 'lobby' || phase === 'placement') return 'INVALID_PHASE';
    if (lastRoundAborted || results.at(-1)?.roundId === roundId && results.at(-1)?.status === 'final') return 'RESULTS_FINAL';
    if (firstGame && action === 'mission' && !isMissionReportPhase(phase)) return 'RESULTS_FINAL';
    if (firstGame && paused || action !== 'undo' && (paused || action !== 'mission' && phase !== 'search')) return 'INVALID_PHASE';
    if (action === 'infect' && !roundPlan!.infectionEnabled) return 'ACTION_UNAVAILABLE';
    const intent = action === 'infect' ? { kind: action, targetId: target! } as const : action === 'undo' ? { kind: action, actionId: target!, ...(requestReview ? { requestReview } : {}) } as const : action === 'mission' ? { kind: action, completed: completed! } as const : { kind: action, ...(targetIds ? { targetIds } : {}) } as const;
    if (targetIds && !firstGame) return 'ACTION_UNAVAILABLE';
    if (requestReview && (!firstGame || action !== 'undo' || !roundSync)) return 'ACTION_UNAVAILABLE';
    const error = roundSync ? roundSync.legacy(playerId, intent, false, phase) : action === 'undo' ? search.undo(playerId, target!) : search.act(playerId, action, target, completed);
    if (roundSync) search = roundSync.current();
    if (error) return error;
    bump(); updateResult(); finishSearchIfNeeded();
  }
  function finalize(noReturn = false): LobbyError | undefined {
    if (!['between_rounds', 'finished'].includes(phase) || !results.length) return 'INVALID_PHASE';
    if (noReturn) {
      roundSync?.close();
      search = roundSync?.current() ?? search;
      for (const report of violations) if (report.status === 'review') report.status = 'rejected';
      if (trials?.current?.lateVisit === 'review') trials.current.lateVisit = 'rejected';
    } else {
      if (firstGame && violations.some(item => item.status === 'review')) return 'RITUAL_REVIEW_PENDING';
      if (roundSync && !roundSync.ready()) return 'SYNC_PENDING';
      if (trials?.current?.lateVisit === 'review') return 'TRIAL_REVIEW_PENDING';
    }
    updateResult();
    const last = results.at(-1)!;
    if (ritualActive() && last.status === 'provisional' && last.kind === 'regular') {
      const fullyPossessed = !recallWait?.players.some(id => playerNames.has(id) && !onlinePlayers?.().has(id)) && firstGame && playerNames.size > 0 && [...playerNames.keys()].every(id => {
        const state = physicalStatus(id);
        return state?.expected === 'in_group' && state.confirmed;
      });
      if (!noReturn && firstGame && !returners().length && !fullyPossessed && last.number < DEFAULT_ROUND_LIMIT &&
        ritual!.snapshot(last).preview!.remainingSteps > 0) return 'PRESENCE_REQUIRED';
      const error = ritual!.commit({ ...last, status: 'final' }); if (error) return error;
      if (firstGame) {
        unassigned = search!.unassigned().filter(([id]) => playerNames.has(id));
        retained = search!.carry(new Set(playerNames.keys())).map(group => ({ ...group, location: group.location ?? locations.get(group.id)?.confirmed ?? null }));
        waitingFree = [...playerNames.keys()].filter(id => physicalStatus(id)?.expected === 'at_base');
      }
      if (noReturn) { last.lossReason = 'no_return'; ritual!.stop('no_return'); }
      else if (fullyPossessed) ritual!.stop('all_possessed');
    }
    clearRecall(); sealResult();
    if (ritualActive() && ritual && ritual.snapshot().outcome !== 'playing') { phase = 'finished'; bump('finish'); } else bump();
  }
  function trialCard() { return roundPlan && trials?.deck[roundPlan.number - 1]; }
  function trialParticipants(ledger = search) {
    return [...playerNames].map(([id, name]) => ({ id, name, play: ledger?.personal(id) ?? null, returned: presence.get(id) === 'at_base' }));
  }
  function trialFor(id: string) {
    const card = trialCard();
    if (card && trials?.current) return personalTrial(card, trials.current, id, phase, trialParticipants(), venue, paused, results.at(-1)?.roundId === roundId && results.at(-1)?.status !== 'provisional');
  }
  function trialStatus() {
    const card = trialCard();
    if (card && trials?.current && phase === 'between_rounds' && results.at(-1)?.status === 'provisional') return trialReview(card, trials.current, trialParticipants(), venue);
  }
  function reportTrial(id: string, values: unknown): LobbyError | undefined {
    const card = trialCard();
    if (!card || !trials?.current) return 'ACTION_UNAVAILABLE';
    const error = submitTrial(card, trials.current, id, values, phase, trialParticipants(), venue, paused, results.at(-1)?.roundId === roundId && results.at(-1)?.status !== 'provisional');
    if (!error) { updateResult(); bump(); }
    return error;
  }
  function reviewTrial(id: string, accepted: boolean, fact?: TrialReviewFact): LobbyError | undefined {
    const card = trialCard(), current = trials?.current;
    if (!card || !current || phase !== 'between_rounds' || results.at(-1)?.status !== 'provisional') return 'INVALID_PHASE';
    const error = reviewTrialEvidence(card, current, id, accepted, fact);
    if (!error) { updateResult(); bump(); }
    return error;
  }
  function canReportViolation(actor: string, board = ritual?.snapshot()) {
    if (!firstGame || paused || board?.outcome !== 'playing' || !board.cards.some(card => card.slot !== 'C' && card.revealed)) return false;
    if (phase === 'reading') return presence.get(actor) === 'at_base' && dealing.personal(actor) !== null;
    const status = physicalStatus(actor);
    return phase === 'between_rounds' && status?.expected === 'at_base' && status.confirmed;
  }
  function reportViolation(actor: string, slot: 'A' | 'B', details: string, id: string): LobbyError | undefined {
    const board = ritual?.snapshot();
    if (!canReportViolation(actor, board) || !board?.cards.some(card => card.slot === slot && card.revealed)) return 'ACTION_UNAVAILABLE';
    if (!details.trim() || details.length > 500 || /[\p{Cc}]/u.test(details)) return 'INVALID_INPUT';
    if (violations.length >= 200) return 'REQUEST_LIMIT';
    violations.push({ id, reporterId: actor, slot, details: details.trim(), status: 'review' }); bump();
  }
  function reviewViolation(id: string, accept: boolean): LobbyError | undefined {
    if (!firstGame || !ritual || !['reading', 'between_rounds'].includes(phase)) return 'INVALID_PHASE';
    const item = violations.find(row => row.id === id);
    if (!item) return 'INVALID_INPUT';
    if (item.status !== 'review') return;
    if (!accept) item.status = 'rejected';
    else {
      const disputed = ritual.snapshot().penaltyDisputed;
      const error = ritual.penalty(item.id); if (error) return error;
      item.status = disputed ? 'dismissed' : 'applied';
    }
    bump();
  }
  function ritualAction(action: 'penalty' | 'undoPenalty'): LobbyError | undefined {
    if (!ritualActive() || !ritual || !['reading', 'between_rounds'].includes(phase)) return 'INVALID_PHASE';
    const linked = action === 'undoPenalty' ? violations.find(row => row.id === ritual!.lastPenaltyId()) : undefined;
    const error = ritual[action]();
    if (!error) { if (linked) linked.status = 'reversed'; bump(); }
    return error;
  }
  function freeplay(): LobbyError | undefined {
    if (firstGame) return 'INVALID_PHASE';
    if (phase !== 'finished' || !ritual || ritual.snapshot().outcome === 'playing' || freeplayFrom !== null) return 'INVALID_PHASE';
    freeplayFrom = results.length; settings = { ...settings, ritualEnabled: false, roundLimit: null }; phase = 'between_rounds'; bump();
  }
  function ensureSync() {
    if (!search) return;
    roundSync ??= createRoundSync({ base: search.exportState(), entries: [], players: search.exportState().roster.map(([id]) => id), completed: [], closed: false, revision: 0 }, generateId);
  }
  function syncEvents(actor: string, expectedRound: string, events: OfflineEvent[]): LobbyError | undefined {
    if (!search || roundId !== expectedRound) return 'STALE_GAME';
    if (!firstGame && events.some(event => event.action.kind === 'undo' && event.action.requestReview)) return 'ACTION_UNAVAILABLE';
    if (firstGame && events.some(event => event.action.kind === 'withdraw')) return 'ACTION_UNAVAILABLE';
    ensureSync();
    const beforeRevision = roundSync!.publicState().revision;
    const closed = lastRoundAborted || results.some(row => row.roundId === roundId && row.status === 'final');
    if (closed) roundSync!.close();
    if (events.some(e => (e.action.kind === 'infect' || e.action.kind === 'captured') && !roundPlan!.infectionEnabled)) return 'ACTION_UNAVAILABLE';
    const error = roundSync!.ingest(actor, events, e => {
      if (firstGame && e.paused) return 'paused';
      if (firstGame && paused) return false;
      if (e.action.kind === 'withdraw' || e.action.kind === 'undo') return true;
      if (paused) return false;
      if (!firstGame && e.action.kind === 'mission') return isMissionReportPhase(phase) || phase === 'finished';
      if (e.paused) return false;
      if (phase === 'search') return e.phase === 'search';
      return false;
    });
    search = roundSync!.current();
    activePlayerIds = activePlayerIds.filter(id => search!.personal(id) !== null);
    if (!error && roundSync!.publicState().revision !== beforeRevision) { bump(); updateResult(); finishSearchIfNeeded(); }
    return error;
  }
  function completeSync(actor: string, expectedRound: string, revision: number): LobbyError | undefined {
    if (roundId !== expectedRound || !roundSync || isTimedPhase(phase)) return 'INVALID_PHASE';
    const wasComplete = roundSync.personal(actor)?.complete;
    const error = roundSync.complete(actor, revision); if (!error && !wasComplete) bump(); return error;
  }
  function resolveSync(id: string, decision: 'accept' | 'reject', before?: string): LobbyError | undefined {
    if (!roundSync || isTimedPhase(phase) || phase === 'reading') return 'INVALID_PHASE';
    const error = roundSync.resolve(id, decision, before); search = roundSync.current(); if (!error) { bump(); updateResult(); } return error;
  }
  function reviewPreview(id: string, decision: 'accept' | 'reject', before?: string): ReviewPreview | LobbyError {
    const last = results.at(-1);
    if (!firstGame || phase !== 'between_rounds' || !roundSync || !ritual || last?.status !== 'provisional') return 'INVALID_PHASE';
    const copy = createRoundSync(roundSync.exportState(), generateId);
    const error = copy.resolve(id, decision, before);
    const requested = roundSync.review().find(row => row.id === id)?.action;
    const blockedUndo = decision === 'accept' && requested?.kind === 'undo' && requested.requestReview &&
      (error === 'UNDO_DEPENDENCY' || error === 'ACTION_UNAVAILABLE');
    if (error && !blockedUndo) return error;
    const original = new Map(roundSync.review().map(entry => [entry.id, entry]));
    const rows = copy.review();
    const result = copy.current().result(last.number, last.status, last.activeMs);
    const card = trialCard();
    const trial = card && trials?.current ? trialBonus(card, trials.current, trialParticipants(copy.current())) : undefined;
    const preview = ritual.snapshot({ ...last, ...result, trialBonus: trial }).preview!;
    return { successes: preview.successes, remainingSteps: preview.remainingSteps, applied: rows.find(row => row.id === id)?.status === (decision === 'accept' ? 'accepted' : 'rejected'),
      changed: rows.flatMap(({ id: eventId, status, reason }) => {
        const old = original.get(eventId);
        return old?.status !== status || old.reason !== reason ? [{ id: eventId, status, reason }] : [];
      }) };
  }
  function closeSync(): LobbyError | undefined {
    if (!roundSync || isTimedPhase(phase) || phase === 'reading') return 'INVALID_PHASE';
    if (recallWait && !returners().length && (recallWait.deadline > clock.now() || reviewCanReturnPlayer())) return 'PRESENCE_REQUIRED';
    roundSync.close(); bump(); return;
  }
  function withdraw(actor: string): LobbyError | undefined {
    if (firstGame) return 'ACTION_UNAVAILABLE';
    if (!search || !isTimedPhase(phase)) return 'INVALID_PHASE';
    ensureSync(); const error = roundSync!.legacy(actor, { kind: 'withdraw' }); search = roundSync!.current();
    if (!error) { activePlayerIds = activePlayerIds.filter(id => id !== actor); bump(); finishSearchIfNeeded(); }
    return error;
  }
  function configureVenue(next: unknown): LobbyError | undefined {
    if (!['lobby', 'between_rounds'].includes(phase)) return 'INVALID_PHASE';
    if (firstGame && locked && phase === 'lobby') return 'SETTINGS_LOCKED';
    if (!next || typeof next !== 'object') return 'INVALID_INPUT';
    const v = next as Venue;
    const valid = (name: unknown) => typeof name === 'string' && name.trim().length > 0 && name.length <= 64 && !/\p{Cc}/u.test(name);
    if (!valid(v.base) || !Array.isArray(v.zones) || v.zones.length > 12 || !v.zones.every(valid)) return 'INVALID_INPUT';
    const names = [v.base, ...v.zones].map(n => n.trim());
    if (new Set(names.map(n => n.toLocaleLowerCase('ru'))).size !== names.length) return 'INVALID_INPUT';
    if (firstGame) {
      if (phase !== 'lobby') return 'SETTINGS_LOCKED';
      if (!v.dwelling || !valid(v.dwelling.place) || !names.slice(1).includes(v.dwelling.zone)) return 'INVALID_INPUT';
      const sets = v.sets === undefined ? (v.harder === true ? ['harder' as const] : []) : v.sets;
      const features = v.features ?? [];
      if (!Array.isArray(sets) || !sets.every(set => cardSets.includes(set)) || new Set(sets).size !== sets.length ||
        !Array.isArray(features) || !features.every(feature => venueFeatures.includes(feature)) || new Set(features).size !== features.length ||
        v.comedy !== undefined && typeof v.comedy !== 'boolean') return 'INVALID_INPUT';
      initializeStory();
      venue = { base: names[0], zones: names.slice(1), dwelling: { zone: v.dwelling.zone, place: v.dwelling.place.trim() },
        storyId: venue.storyId, harder: sets.includes('harder'), mode: 'ordinary', bank: 'authored', sets: [...sets],
        ...(features.length ? { features: [...features] } : {}),
        ...(v.comedy ? { comedy: true } : {}) };
    } else venue = { base: names[0], zones: names.slice(1) };
    bump();
  }
  function physicalStatus(playerId: string) {
    if (!firstGame || !playerNames.has(playerId) || !['return', 'between_rounds', 'finished'].includes(phase)) return undefined;
    const play = search?.personal(playerId);
    if (!play) {
      if (waitingFree.includes(playerId))
        return { playerId, status: 'exorcist' as const, expected: 'at_base' as const, confirmed: presence.get(playerId) === 'at_base' };
      return undefined;
    }
    const expected: PhysicalStatus = play.status === 'captured' || play.status === 'possessed' ? 'in_group' : 'at_base';
    return { playerId, expected, status: play.status, unknownGroup: play.unknownGroup,
      confirmed: presence.get(playerId) === expected };
  }
  function confirmPresence(playerId: string, status: PhysicalStatus) {
    if (!firstGame || !['return', 'between_rounds'].includes(phase) || physicalStatus(playerId)?.expected !== status) return 'ACTION_UNAVAILABLE';
    if (presence.get(playerId) !== status) { presence.set(playerId, status); bump(); }
  }
  function reconcilePresence(playerId: string, correction: PresenceCorrection, groupMemberId?: string): LobbyError | undefined {
    if (!firstGame || !roundSync || !(phase === 'return' || phase === 'between_rounds' && results.at(-1)?.status === 'provisional') ||
      !playerNames.has(playerId)) return 'ACTION_UNAVAILABLE';
    const releasesUnknownGroup = correction === 'released' && search?.personal(playerId)?.unknownGroup;
    if (onlinePlayers?.().has(playerId) && correction !== 'assign' && !releasesUnknownGroup) return 'ACTION_UNAVAILABLE';
    const error = roundSync.legacy(playerId, { kind: 'presence_correction', correction, ...(groupMemberId ? { groupMemberId } : {}) }, false, phase);
    search = roundSync.current();
    if (error) return error;
    presence.set(playerId, correction === 'released' ? 'at_base' : 'in_group');
    bump(); updateResult();
  }
  function returners() { return [...playerNames.keys()].filter(id => {
    const item = physicalStatus(id);
    return item?.expected === 'at_base' && item.confirmed;
  }); }
  function missingGroup(actor: string) {
    const play = search?.personal(actor);
    return play && (play.status === 'possessed' || play.status === 'captured') && !play.location ? search?.group(actor) : undefined;
  }
  function locationProposal(actor: string) {
    const group = missingGroup(actor);
    return group ? locations.get(group)?.proposed : undefined;
  }
  function missingLocations(): MissingLocation[] {
    if (phase !== 'between_rounds' || results.at(-1)?.status !== 'provisional') return [];
    const seen = new Set<string>();
    return [...playerNames.keys()].flatMap(memberId => {
      const group = missingGroup(memberId);
      if (!group || seen.has(group)) return [];
      seen.add(group);
      return [{ memberId, ...locations.get(group) }];
    });
  }
  function setLocation(actor: string, zone: string, organizer = false) {
    if (firstGame && ['return', 'between_rounds'].includes(phase) && (phase === 'return' || results.at(-1)?.status === 'provisional')) {
      const group = missingGroup(actor);
      if (!group || !venue.zones.includes(zone) || organizer && phase !== 'between_rounds') return 'ACTION_UNAVAILABLE';
      const current = locations.get(group);
      if (current?.confirmed) return current.confirmed === zone ? undefined : 'ACTION_UNAVAILABLE';
      locations.set(group, organizer ? { ...current, confirmed: zone } : { proposed: zone }); bump();
      return;
    }
    if (organizer || !firstGame || phase !== 'placement' || paused || !venue.zones.includes(zone) || !roundSync) return 'ACTION_UNAVAILABLE';
    const error = roundSync.place(actor, zone);
    if (!error) { search = roundSync.current(); bump(); }
    return error;
  }
  function personalPlay(playerId: string) {
    const play = search?.personal(playerId);
    if (!firstGame) return play ?? null;
    if (play) {
      if (play.unknownGroup) play.retained = true;
      if (phase === 'search' && !paused && !play.unknownGroup && (play.status === 'captured' || play.status === 'possessed')) play.targets = search!.targets();
      if (play.location === null) play.location = locations.get(search!.group(playerId) ?? '')?.confirmed ?? null;
      return play;
    }
    const unresolved = unassigned.find(([id]) => id === playerId);
    if (unresolved) return { roundId: '', version, status: 'captured' as const, unknownGroup: true, card: structuredClone(unresolved[1].card),
      cardKey: unresolved[1].id, wasCaptured: true, missionCompleted: false, missionEligible: false, undo: null, retained: true };
    const group = retained.find(g => g.members.some(([id]) => id === playerId));
    return group ? { roundId: '', version, status: group.origin === playerId ? 'possessed' as const : 'captured' as const,
      card: structuredClone(group.assignment.card), cardKey: group.id, wasCaptured: group.origin !== playerId, missionCompleted: false,
      missionEligible: false, undo: null, location: group.location, retained: true } : null;
  }
  function roles() {
    const entries = dealing.exportState().assignments.concat(retained.flatMap(group => group.members));
    return Object.fromEntries(entries.map(([id, a]) => [id, a.card.role]));
  }
  function takeCue() { const result = cue; cue = undefined; return result; }
  function dispose() { disposed = true; clearTimer(); clearRecall(); cue = undefined; }
  function exportState(): SavedGame {
    updateResult();
    // lastNow/remainingMs are the last healthy clock checkpoint, including clock-gap protection.
    return structuredClone({ ...(firstGame ? { firstGame: { locked, retained, presence: [...presence], waitingFree, story: selectedStory, trials, violations, locations: [...locations],
      ...(unassigned.length ? { unassigned } : {}), ...(recallWait ? { recallWait: { players: recallWait.players, remainingMs: Math.max(0, recallWait.deadline - clock.now()) } } : {}) } } : {}), ritual: ritual?.exportState() ?? null, freeplayFrom, venue, playerNames: [...playerNames], roundSync: roundSync?.exportState() ?? null, tutorialCompleted, progressionRounds, roundPlan, dealing: dealing.exportState(), settings, phase, waitingPhase, version, roundId, completedRounds, started,
      paused, pauseReason, remainingMs, activePlayerIds, rosterChanged, lastRoundAborted, history: [...history], originalPossessed,
      search: search?.exportState() ?? null, results, activeMs: activeMs + (runStarted === null ? 0 : Math.max(0, lastNow - runStarted)) });
  }
  function restore(state: SavedGame, reason: PauseReason = 'server_restarted', bumpVersion = true) {
    clearTimer(); clearRecall(); cue = undefined;
    unassigned = structuredClone(state.firstGame?.unassigned ?? []);
    locked = state.firstGame?.locked ?? false; retained = structuredClone(state.firstGame?.retained ?? []);
    waitingFree = [...(state.firstGame?.waitingFree ?? [])]; selectedStory = structuredClone(state.firstGame?.story);
    trials = structuredClone(state.firstGame?.trials);
    violations = structuredClone(state.firstGame?.violations ?? []);
    locations.clear(); for (const [id, location] of state.firstGame?.locations ?? []) locations.set(id, location);
    presence.clear(); for (const [id, status] of state.firstGame?.presence ?? []) presence.set(id, status);
    ritual = state.ritual ? createRitual(state.ritual, generateId) : undefined; freeplayFrom = state.freeplayFrom ?? null;
    playerNames = new Map(state.playerNames ?? []);
    const savedVenue = structuredClone(state.venue ?? { base: 'База', zones: [] });
    delete savedVenue.horror;
    venue = savedVenue;
    if (firstGame && !locked) {
      venue.mode = 'ordinary';
      venue.bank = 'authored';
      delete venue.prologueRead;
      initializeStory();
    }
    roundSync = state.roundSync ? createRoundSync(state.roundSync, generateId) : undefined;
    tutorialCompleted = state.tutorialCompleted; progressionRounds = state.progressionRounds; roundPlan = structuredClone(state.roundPlan);
    dealing.restore(state.dealing, bumpVersion); settings = { ...state.settings, ...(firstGame ? { offlineWaitSeconds: state.settings.offlineWaitSeconds ?? 90 } : {}) }; phase = state.phase; waitingPhase = state.waitingPhase;
    version = state.version + Number(bumpVersion); roundId = state.roundId; completedRounds = state.completedRounds; started = state.started;
    paused = timed() ? true : state.paused; pauseReason = timed() ? reason : state.pauseReason;
    remainingMs = state.remainingMs; deadline = null; activePlayerIds = [...state.activePlayerIds]; rosterChanged = state.rosterChanged;
    lastRoundAborted = state.lastRoundAborted; history.clear(); for (const [id, count] of state.history) history.set(id, count);
    originalPossessed = [...state.originalPossessed]; results.splice(0, results.length, ...structuredClone(state.results));
    activeMs = state.activeMs; runStarted = null; lastNow = clock.now(); lastWall = clock.wallNow();
    search = state.search ? createSearch(state.search.roundId, new Map(state.search.roster), generateId, state.search.retained, state.search.unassigned) : undefined;
    if (state.search) search!.restore(state.search, bumpVersion);
    if (roundSync) search = roundSync.current();
    else if (search && !search.exportState().finalized) ensureSync();
    const wait = state.firstGame?.recallWait;
    if (wait) {
      recallWait = { players: [...wait.players], deadline: clock.now() + wait.remainingMs };
      scheduleRecall();
    }
  }
  return { publicState, dealingState: dealing.publicState, personal: dealing.personal, configure, deal, cancelDeal,
    initializeStory, configureVenue, confirmPresence, reconcilePresence, reconcileRecall, setLocation, missingLocations, locationProposal, physicalStatus, roles, syncEvents, completeSync, resolveSync, reviewPreview, closeSync, withdraw, personalSync: (id: string) => roundSync?.personal(id) ?? null, review: () => (roundSync?.review() ?? []).map(entry => ({ ...entry, actorName: playerNames.get(entry.actor), targetName: playerNames.get('targetId' in entry.action ? entry.action.targetId : 'by' in entry.action ? entry.action.by : '') })),
    trialFor, trialStatus, reportTrial, reviewTrial, canReportViolation, reportViolation, reviewViolation, violations: () => structuredClone(violations), ritualAction, freeplay, start, pause, resume, beginReturn, abort, finishParty, extend, add, remove, change, synchronize, takeCue, dispose, playAction, personalPlay, finalize, exportState, restore };
}
