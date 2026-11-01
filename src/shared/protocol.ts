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
export type PauseReason = 'organizer' | 'organizer_disconnected' | 'participant_left' | 'clock_gap';
export interface GameSettings { roundLimit: number | null; placementSeconds: number; searchSeconds: number; returnSeconds: number; infectionEnabled: boolean }
export interface RoundResult {
  roundId: string; number: number; status: 'provisional' | 'final' | 'aborted';
  rescuedGroups: number; totalGroups: number; missions: number; totalMissions: number; infectedPlayers: number; activeMs: number;
}
export interface PersonalPlay {
  roundId: string; version: number; status: 'exorcist' | 'possessed' | 'captured' | 'released';
  card: PersonalCard; cardKey: string; wasCaptured: boolean; missionCompleted: boolean; missionEligible: boolean;
  undo: { id: string; label: string; available: boolean } | null;
}
interface PlayCommand extends GameCommand { playVersion: number }
export interface GameSnapshot {
  phase: GamePhase;
  version: number;
  roundId: string | null;
  roundNumber: number;
  completedRounds: number;
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
export type PersonalCard = { id: string; title: string; difficulty: 1 } & (
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

export type LobbyView = { revision: number } & (
  | { kind: 'organizer'; room: RoomSnapshot | null; audioEnabled: boolean }
  | { kind: 'player'; room: RoomSnapshot; playerId: string; assignment: Assignment | null; play: PersonalPlay | null }
  | { kind: 'ended'; reason: 'closed' | 'removed' | 'left' }
);

export type LobbyError = 'INVALID_INPUT' | 'INVALID_ORGANIZER_CODE' | 'FORBIDDEN'
  | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NAME_TAKEN' | 'SESSION_EXPIRED'
  | 'INVALID_COMPOSITION' | 'STALE_DEAL' | 'STALE_CARD' | 'REPLACEMENT_PENDING' | 'REQUEST_LIMIT'
  | 'INVALID_PHASE' | 'STALE_GAME' | 'START_WARNING' | 'RESUME_WARNING' | 'SETTINGS_LOCKED'
  | 'STALE_PLAY' | 'ACTION_UNAVAILABLE' | 'UNDO_DEPENDENCY' | 'RESULTS_FINAL';
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
}

export type LobbyCommand = keyof LobbyInputs;
export type ClientToServerEvents = {
  [Command in LobbyCommand]: (input: LobbyInputs[Command], acknowledge: (reply: LobbyReply) => void) => void;
};
