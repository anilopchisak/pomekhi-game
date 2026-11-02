export const APP_ID = 'pomekhi';

export interface HealthResponse {
  app: typeof APP_ID;
  status: 'ok';
  stage: 'foundation';
}

export interface ServerToClientEvents {
  'server:ready': (health: HealthResponse) => void;
  'lobby:state': (view: LobbyView) => void;
  'game:cue': (cue: GameCue) => void;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  version: number;
  capacity: number;
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
  roundLimit: number | null; placementSeconds: number; searchSeconds: number; returnSeconds: number;
  tutorialEnabled: boolean; initialDifficulty: Difficulty; maximumDifficulty: Difficulty; infectionMode: InfectionMode;
}
export interface RoundPlan { kind: 'tutorial' | 'regular'; number: number; difficulty: Difficulty; infectionEnabled: boolean }
export interface RoundResult extends Omit<RoundPlan, 'infectionEnabled'> {
  infectionEnabled: boolean | null;
  roundId: string; number: number; status: 'provisional' | 'final' | 'aborted';
  rescuedGroups: number; totalGroups: number; missions: number; totalMissions: number; infectedPlayers: number; activeMs: number;
}
export interface PersonalPlay {
  roundId: string; version: number; status: 'exorcist' | 'possessed' | 'captured' | 'released';
  card: PersonalCard; cardKey: string; wasCaptured: boolean; missionCompleted: boolean; missionEligible: boolean;
  undo: { id: string; label: string; available: boolean } | null;
}
interface PlayCommand extends GameCommand { playVersion: number }
export interface Venue { base: string; zones: string[] }
export type OfflineAction =
  | { kind: 'infect'; targetId: string }
  | { kind: 'captured'; by: string }
  | { kind: 'release' }
  | { kind: 'mission'; completed: boolean }
  | { kind: 'undo'; actionId: string }
  | { kind: 'withdraw' };
export interface OfflineEvent {
  id: string; clientId: string; sequence: number; previousId: string | null;
  roundId: string; action: OfflineAction; phase: GamePhase; paused: boolean; estimatedServerTime: number | null;
}
export interface EventReceipt { id: string; status: 'accepted' | 'review' | 'rejected'; reason: string | null }
export interface ReviewEvent extends EventReceipt { actor: string; actorName?: string; targetName?: string; dependsOn?: string[]; action: OfflineAction }
export interface RoundSyncSnapshot { waitingPlayerIds: string[]; waitingPlayers?: { id: string; name: string }[]; conflicts: number; closed: boolean; revision: number }
export interface PersonalSync { roundId: string; receipts: EventReceipt[]; complete: boolean; withdrawn: boolean }
export interface GameSnapshot {
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
export interface GameCue { roomId: string; version: number; phase: GamePhase; kind: 'start' | 'phase' | 'pause' | 'resume' | 'abort' | 'finish'; serverNow: number }
interface GameCommand { roomId: string; requestId: string; gameVersion: number; roundId: string | null }

export type Role = 'possessed' | 'exorcist';
export type PersonalCard = { id: string; title: string; difficulty: Difficulty } & (
  | { role: 'possessed'; behavior: string; clue: string; releaseCondition: string; infectionCondition: string }
  | { role: 'exorcist'; mission: string }
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
  | { kind: 'organizer'; room: RoomSnapshot | null; audioEnabled: boolean; review?: ReviewEvent[] }
  | { kind: 'player'; room: RoomSnapshot; playerId: string; assignment: Assignment | null; play: PersonalPlay | null; synchronization?: PersonalSync | null }
  | { kind: 'ended'; reason: 'closed' | 'removed' | 'left' }
);

export type LobbyError = 'INVALID_INPUT' | 'INVALID_ORGANIZER_CODE' | 'FORBIDDEN'
  | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NAME_TAKEN' | 'SESSION_EXPIRED'
  | 'INVALID_COMPOSITION' | 'STALE_DEAL' | 'STALE_CARD' | 'REPLACEMENT_PENDING' | 'REQUEST_LIMIT'
  | 'INVALID_PHASE' | 'STALE_GAME' | 'START_WARNING' | 'RESUME_WARNING' | 'SETTINGS_LOCKED'
  | 'STALE_PLAY' | 'ACTION_UNAVAILABLE' | 'UNDO_DEPENDENCY' | 'RESULTS_FINAL' | 'STORAGE_UNAVAILABLE' | 'SYNC_PENDING';
export type LobbyReply = { ok: true; view: LobbyView } | { ok: false; error: LobbyError };

export interface LobbyInputs {
  'organizer:authorize': { code: string };
  'organizer:audio': { enabled: boolean };
  'lobby:sync': Record<string, never>;
  'room:create': Record<string, never>;
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
  'play:release': PlayCommand;
  'play:mission': PlayCommand & { completed: boolean };
  'play:undo': PlayCommand & { actionId: string };
  'results:finalize': GameCommand;
  'venue:configure': GameCommand & { venue: Venue };
  'play:withdraw': PlayCommand;
  'play:sync': { roomId: string; roundId: string; events: OfflineEvent[] };
  'play:complete': { roomId: string; roundId: string; syncRevision: number };
  'sync:resolve': GameCommand & { eventId: string; decision: 'accept' | 'reject'; beforeId?: string };
  'sync:close': GameCommand & { confirm: true };
  'storage:retry': Record<string, never>;
  'storage:reset': { confirm: true };
}

export type LobbyCommand = keyof LobbyInputs;
export type ClientToServerEvents = {
  [Command in LobbyCommand]: (input: LobbyInputs[Command], acknowledge: (reply: LobbyReply) => void) => void;
};
