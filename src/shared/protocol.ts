export const APP_ID = 'pomekhi';
export const DEFAULT_ROUND_LIMIT = 7;

export interface HealthResponse {
  app: typeof APP_ID;
  status: 'ok';
  stage: 'foundation';
}

export interface ServerToClientEvents {
  'server:ready': (health: HealthResponse) => void;
  'lobby:state': (view: LobbyView) => void;
  'game:cue': (cue: GameCue) => void;
  'player:scare': (scare: PhoneScare) => void;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  version: number;
  capacity: number;
  phoneScaresEnabled: boolean;
  players: { id: string; name: string; online: boolean }[];
  dealing: DealingSnapshot;
  game: GameSnapshot;
}

export type GamePhase = 'lobby' | 'reading' | 'placement' | 'search' | 'return' | 'between_rounds' | 'finished';
export type TimedPhase = 'placement' | 'search' | 'return';
export type PauseReason = 'organizer' | 'organizer_disconnected' | 'participant_left' | 'clock_gap' | 'server_restarted' | 'storage_error';
export type Difficulty = 1 | 2 | 3;
export type InfectionMode = 'auto' | 'on' | 'off';
export interface GameSettings {
  ritualEnabled: boolean; roundLimit: number | null; placementSeconds: number; searchSeconds: number; returnSeconds: number; offlineWaitSeconds?: number;
  tutorialEnabled: boolean; initialDifficulty: Difficulty; maximumDifficulty: Difficulty; infectionMode: InfectionMode;
}
export interface RoundPlan { kind: 'tutorial' | 'regular'; number: number; difficulty: Difficulty; infectionEnabled: boolean }
export interface RoundResult extends Omit<RoundPlan, 'infectionEnabled'> {
  infectionEnabled: boolean | null;
  roundId: string; number: number; status: 'provisional' | 'final' | 'aborted';
  rescuedGroups: number; totalGroups: number; missions: number; totalMissions: number; infectedPlayers: number; activeMs: number; trialBonus?: 0 | 1; lossReason?: 'no_return';
}
export interface PersonalPlay {
  roundId: string; version: number; status: 'exorcist' | 'possessed' | 'captured' | 'released';
  card: PersonalCard; cardKey: string; wasCaptured: boolean; missionCompleted: boolean; missionEligible: boolean;
  undo: { id: string; label: string; available: boolean; canRequestReview?: boolean } | null;
  location?: string | null;
  retained?: boolean;
  targets?: string[];
  unknownGroup?: boolean;
  infections?: { id: string; targetId: string; available: boolean; canRequestReview?: boolean; pending?: boolean }[];
}
interface PlayCommand extends GameCommand { playVersion: number }
export type GameMode = 'first' | 'ordinary';
export const cardSets = ['indoor', 'outdoor', 'contact', 'harder'] as const;
export type CardSet = typeof cardSets[number];
export const venueFeatures = ['space', 'door', 'mirror', 'tree', 'dimLight', 'wall', 'twoZones', 'scary', 'touchSurfaces', 'contact', 'landmarks'] as const;
export type VenueFeature = typeof venueFeatures[number];
export interface Venue { mode?: GameMode; bank?: 'local' | 'authored'; horror?: boolean; sets?: CardSet[]; features?: VenueFeature[]; prologueRead?: boolean; base: string; zones: string[]; dwelling?: { zone: string; place: string }; storyId?: string; harder?: boolean; order?: string[] }
export type PhysicalStatus = 'at_base' | 'in_group';
export interface Presence {
  playerId: string; expected: PhysicalStatus; confirmed: boolean;
  status?: PersonalPlay['status']; unknownGroup?: boolean;
}
export type PresenceCorrection = 'infected' | 'released' | 'assign';
export type OfflineAction =
  | { kind: 'infect'; targetId: string }
  | { kind: 'captured'; by: string }
  | { kind: 'presence_correction'; correction: PresenceCorrection; groupMemberId?: string }
  | { kind: 'release'; targetIds?: string[] }
  | { kind: 'mission'; completed: boolean }
  | { kind: 'undo'; actionId: string; requestReview?: true }
  | { kind: 'withdraw' };
export interface OfflineEvent {
  id: string; clientId: string; sequence: number; previousId: string | null;
  roundId: string; action: OfflineAction; phase: GamePhase; paused: boolean; estimatedServerTime: number | null;
}
export interface EventReceipt { id: string; status: 'accepted' | 'review' | 'rejected'; reason: string | null }
export interface ReviewPreview { successes: number; remainingSteps: number; changed: EventReceipt[]; applied: boolean }
export interface ViolationReceipt { id: string; slot: 'A' | 'B'; details: string; status: 'review' | 'applied' | 'rejected' | 'dismissed' | 'reversed' }
export interface ViolationReview extends ViolationReceipt { reporterId: string }
export const trialTraits = ['height', 'clothes', 'motion'] as const;
export type TrialTrait = typeof trialTraits[number];
export type TrialReviewFact = 'repeat' | TrialTrait;
export type LateVisitStatus = 'review' | 'accepted' | 'rejected';
export type TrialValue = string | boolean;
export interface TrialField { id: string; label: string; type: 'boolean' | 'text' | 'player' | 'zone'; allowed?: boolean[]; choices?: { id: string; label: string }[] }
export interface PersonalTrial {
  title: string; instruction: string; fields: TrialField[]; values: Record<string, TrialValue>;
  lateVisit?: LateVisitStatus; message?: string; submitted: boolean; reporter: 'actor' | 'witness'; canSubmit: boolean;
}
export interface TrialReview {
  lateVisit?: { playerId: string; status: LateVisitStatus };
  traitComparisons?: { playerId: string; trait: TrialTrait; label: string; original: string; answer: string; equivalent: boolean }[];
  reports: { playerId: string; accepted: boolean; facts: { label: string; value: TrialValue }[] }[];
  status: 'waiting' | 'ready' | 'unavailable' | 'conflict'; bonus: 0 | 1;
}
export interface MissingLocation { memberId: string; proposed?: string; confirmed?: string }
export interface ReviewEvent extends EventReceipt { actor: string; actorName?: string; targetName?: string; dependsOn?: string[]; action: OfflineAction; blockers?: string[] }
export interface RoundSyncSnapshot { waitingPlayerIds: string[]; waitingPlayers?: { id: string; name: string }[]; conflicts: number; closed: boolean; revision: number }
export interface PersonalSync { roundId: string; receipts: EventReceipt[]; complete: boolean; withdrawn: boolean; undoRequests?: { id: string; actionId: string; status: EventReceipt['status'] | 'queued' }[] }
export type RitualOutcome = 'playing' | 'won' | 'lost' | 'stopped' | 'all_possessed' | 'no_return';
export interface Prophecy { id: string; title: string; rule: string }
export interface RitualSnapshot {
  players: number; roundLimit: number; target: number; positions: [number, number, number, number];
  remainingSteps: number; outcome: RitualOutcome;
  cards: ({ slot: 'A' | 'B' | 'C'; revealed: false } | { slot: 'A' | 'B' | 'C'; revealed: true; card: Prophecy })[];
  canPenalize: boolean; canUndoPenalty: boolean;
  penaltyDisputed?: boolean;
  penaltyPreview?: { source: 1 | 2 | 3; positions: [number, number, number, number]; remainingSteps: number } | null;
  preview: { successes: number; positions: [number, number, number, number]; remainingSteps: number } | null;
}
export interface GameSnapshot {
  offlineWait?: { deadline: number; awaitingReview: boolean };
  references?: { id: string; title: string; sections: { title: string; text: string }[] }[];
  firstGame?: true;
  preparationLocked?: boolean;
  story?: { title: string; prologue: string };
  ritual: RitualSnapshot | null;
  freeplayFrom: number | null;
  phase: GamePhase;
  version: number;
  roundId: string | null;
  roundNumber: number;
  completedRounds: number;
  venue: Venue;
  synchronization: RoundSyncSnapshot | null;
  tutorialCompleted: boolean;
  roundPlan: RoundPlan;
  settings: GameSettings;
  started: boolean;
  paused: boolean;
  pauseReason: PauseReason | null;
  deadline: number | null;
  remainingMs: number | null;
  serverNow: number;
  activePlayerIds: string[];
  rosterChanged: boolean;
  lastRoundAborted: boolean;
  results: RoundResult[];
}
export interface PhoneScare { id: string; roomId: string; roundId: string; serverNow: number; variant: 0 | 1 | 2 }
export interface GameCue { roomId: string; version: number; phase: GamePhase; kind: 'start' | 'phase' | 'pause' | 'resume' | 'abort' | 'finish'; serverNow: number }
interface GameCommand { roomId: string; requestId: string; gameVersion: number; roundId: string | null }

export type Role = 'possessed' | 'exorcist';
export type PersonalCard = { id: string; title: string; difficulty: Difficulty; harder?: boolean; offering?: boolean; sets?: CardSet[]; requirements?: VenueFeature[]; setup?: string } & (
  | { role: 'possessed'; behavior: string; clue?: string; releaseCondition: string; infectionCondition: string }
  | { role: 'exorcist'; mission: string; successCondition?: string }
);
export interface Assignment {
  id: string;
  card: PersonalCard;
  ready: boolean;
  replacementRequested: boolean;
}
export interface DealingSnapshot {
  version: number;
  dealId: string | null;
  initialPossessedCount: number | null;
  compositionValid: boolean;
  assignments: { playerId: string; assignmentId: string; ready: boolean; replacementRequested: boolean }[];
}
interface DealCommand { roomId: string; requestId: string; dealVersion: number; dealId: string | null }
interface CardCommand extends DealCommand { assignmentId: string }

export interface PersistenceStatus {
  mode: 'memory' | 'disk'; state: 'ready' | 'load_error' | 'write_error'; recovered: boolean;
}
export type LobbyView = { revision: number; persistence?: PersistenceStatus } & (
  | { kind: 'organizer'; room: RoomSnapshot | null; audioEnabled: boolean; review?: ReviewEvent[]; missingLocations?: MissingLocation[]; violations?: ViolationReview[]; trialReview?: TrialReview; roles?: Record<string, Role>; presence?: Presence[] }
  | { kind: 'player'; room: RoomSnapshot; playerId: string; audioEnabled?: boolean; assignment: Assignment | null; play: PersonalPlay | null; synchronization?: PersonalSync | null; locationProposal?: string; violations?: ViolationReceipt[]; canReportViolation?: boolean; trial?: PersonalTrial; presence?: Presence }
  | { kind: 'ended'; reason: 'closed' | 'removed' | 'left' }
);

export type LobbyError = 'CARD_POOL_INSUFFICIENT' | 'STALE_CATALOG' | 'CATALOG_LOCKED' | 'INVALID_INPUT' | 'INVALID_ORGANIZER_CODE' | 'FORBIDDEN'
  | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NAME_TAKEN' | 'SESSION_EXPIRED'
  | 'INVALID_COMPOSITION' | 'STALE_DEAL' | 'STALE_CARD' | 'REPLACEMENT_PENDING' | 'REQUEST_LIMIT'
  | 'INVALID_PHASE' | 'STALE_GAME' | 'START_WARNING' | 'RESUME_WARNING' | 'SETTINGS_LOCKED'
  | 'STALE_PLAY' | 'ACTION_UNAVAILABLE' | 'UNDO_DEPENDENCY' | 'RESULTS_FINAL' | 'STORAGE_UNAVAILABLE' | 'SYNC_PENDING' | 'RITUAL_REVIEW_PENDING' | 'TRIAL_REVIEW_PENDING'
  | 'TRIAL_POOL_INSUFFICIENT' | 'PREPARATION_REQUIRED' | 'PRESENCE_REQUIRED';
export type LobbyReply = { ok: true; view: LobbyView; reviewPreview?: ReviewPreview } | { ok: false; error: LobbyError };

export interface LobbyInputs {
  'organizer:authorize': { code: string };
  'organizer:audio': { enabled: boolean };
  'organizer:atmosphere': { roomId: string; enabled: boolean };
  'player:audio': { roomId: string; enabled: boolean };
  'lobby:sync': Record<string, never>;
  'room:create': Record<string, never>;
  'room:restart': { roomId: string };
  'room:close': { roomId: string };
  'player:join': { roomCode: string; name: string; resumeKey: string };
  'player:resume': { roomCode: string; resumeKey: string };
  'player:leave': { roomId: string };
  'player:remove': { roomId: string; playerId: string };
  'deal:create': DealCommand & { possessedCount: number };
  'deal:shuffle': DealCommand & { possessedCount: number };
  'deal:cancel': DealCommand;
  'deal:replace': CardCommand & { playerId: string };
  'card:ready': CardCommand & { ready: boolean };
  'card:request': CardCommand & { requested: boolean };
  'game:configure': GameCommand & { settings: GameSettings };
  'round:start': GameCommand & { confirmWarnings: boolean };
  'round:pause': GameCommand;
  'round:resume': GameCommand & { confirmWarnings: boolean };
  'round:return': GameCommand;
  'round:abort': GameCommand;
  'party:finish': GameCommand;
  'party:extend': GameCommand;
  'play:infect': PlayCommand & { targetId: string };
  'play:release': PlayCommand & { targetIds?: string[] };
  'play:mission': PlayCommand & { completed: boolean };
  'play:undo': PlayCommand & { actionId: string; requestReview?: true };
  'results:finalize': GameCommand;
  'play:trial': GameCommand & { values: Record<string, TrialValue> };
  'round:trial-review': GameCommand & { playerId: string; accepted: boolean; fact?: TrialReviewFact };
  'play:violation': GameCommand & { slot: 'A' | 'B'; details: string };
  'ritual:review': GameCommand & { reportId: string; accept: boolean };
  'ritual:penalty': GameCommand;
  'ritual:undo-penalty': GameCommand;
  'party:freeplay': GameCommand;
  'venue:configure': GameCommand & { venue: Venue };
  'round:location': GameCommand & { playerId: string; zone: string };
  'play:location': GameCommand & { zone: string };
  'play:presence': GameCommand & { status: PhysicalStatus };
  'round:reconcile': GameCommand & { playerId: string; correction: PresenceCorrection; groupMemberId?: string };
  'round:presence': GameCommand & { playerId: string; status: PhysicalStatus };
  'play:withdraw': PlayCommand;
  'play:sync': { roomId: string; roundId: string; events: OfflineEvent[] };
  'play:complete': { roomId: string; roundId: string; syncRevision: number };
  'sync:preview': GameCommand & { eventId: string; decision: 'accept' | 'reject'; beforeId?: string };
  'sync:resolve': GameCommand & { eventId: string; decision: 'accept' | 'reject'; beforeId?: string };
  'sync:close': GameCommand & { confirm: true };
  'storage:retry': Record<string, never>;
  'storage:reset': { confirm: true };
}

export type LobbyCommand = keyof LobbyInputs;
export type ClientToServerEvents = {
  [Command in LobbyCommand]: (input: LobbyInputs[Command], acknowledge: (reply: LobbyReply) => void) => void;
} & { 'catalog:command': (input: CatalogInput, acknowledge: (reply: CatalogReply) => void) => void };

export interface CatalogEntry { enabled: boolean; card: PersonalCard }
export interface CatalogFile { format: 'pomekhi.cards'; version: 1 | 2; entries: CatalogEntry[] }
export type CatalogInput = { action: 'read' } | ({ revision: number; requestId: string } & (
  | { action: 'save'; entry: CatalogEntry }
  | { action: 'import'; file: CatalogFile }
  | { action: 'reset' }
));
export interface CatalogSnapshot { revision: number; editable: boolean; file: CatalogFile }
export type CatalogReply = { ok: true; catalog: CatalogSnapshot } | { ok: false; error: LobbyError | 'CONNECTION_LOST' | 'TIMEOUT' };
