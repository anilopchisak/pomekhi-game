export const APP_ID = 'pomekhi';

export interface HealthResponse {
  app: typeof APP_ID;
  status: 'ok';
  stage: 'foundation';
}

export interface ServerToClientEvents {
  'server:ready': (health: HealthResponse) => void;
  'lobby:state': (view: LobbyView) => void;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  version: number;
  capacity: number;
  players: { id: string; name: string; online: boolean }[];
  dealing: DealingSnapshot;
}

export type Role = 'possessed' | 'exorcist';
export type PersonalCard = { id: string; title: string; difficulty: 1 } & (
  | { role: 'possessed'; behavior: string; clue: string; releaseCondition: string }
  | { role: 'exorcist'; mission: string }
);
export interface Assignment {
  id: string;
  card: PersonalCard;
  ready: boolean;
  replacementRequested: boolean;
}
export interface DealingSnapshot {
  phase: 'lobby' | 'reading';
  version: number;
  dealId: string | null;
  initialPossessedCount: number | null;
  compositionValid: boolean;
  assignments: { playerId: string; assignmentId: string; ready: boolean; replacementRequested: boolean }[];
}
interface DealCommand { roomId: string; requestId: string; dealVersion: number; dealId: string | null }
interface CardCommand extends DealCommand { assignmentId: string }

export type LobbyView = { revision: number } & (
  | { kind: 'organizer'; room: RoomSnapshot | null }
  | { kind: 'player'; room: RoomSnapshot; playerId: string; assignment: Assignment | null }
  | { kind: 'ended'; reason: 'closed' | 'removed' | 'left' }
);

export type LobbyError = 'INVALID_INPUT' | 'INVALID_ORGANIZER_CODE' | 'FORBIDDEN'
  | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NAME_TAKEN' | 'SESSION_EXPIRED'
  | 'INVALID_COMPOSITION' | 'STALE_DEAL' | 'STALE_CARD' | 'REPLACEMENT_PENDING' | 'REQUEST_LIMIT';
export type LobbyReply = { ok: true; view: LobbyView } | { ok: false; error: LobbyError };

export interface LobbyInputs {
  'organizer:authorize': { code: string };
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
}

export type LobbyCommand = keyof LobbyInputs;
export type ClientToServerEvents = {
  [Command in LobbyCommand]: (input: LobbyInputs[Command], acknowledge: (reply: LobbyReply) => void) => void;
};
