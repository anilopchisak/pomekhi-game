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
}

export type LobbyView = { revision: number } & (
  | { kind: 'organizer'; room: RoomSnapshot | null }
  | { kind: 'player'; room: RoomSnapshot; playerId: string }
  | { kind: 'ended'; reason: 'closed' | 'removed' | 'left' }
);

export type LobbyError = 'INVALID_INPUT' | 'INVALID_ORGANIZER_CODE' | 'FORBIDDEN'
  | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'NAME_TAKEN' | 'SESSION_EXPIRED';
export type LobbyReply = { ok: true; view: LobbyView } | { ok: false; error: LobbyError };

export interface LobbyInputs {
  'organizer:authorize': { code: string };
  'room:create': Record<string, never>;
  'room:close': { roomId: string };
  'player:join': { roomCode: string; name: string; resumeKey: string };
  'player:resume': { roomCode: string; resumeKey: string };
  'player:leave': { roomId: string };
  'player:remove': { roomId: string; playerId: string };
}

export type LobbyCommand = keyof LobbyInputs;
export type ClientToServerEvents = {
  [Command in LobbyCommand]: (input: LobbyInputs[Command], acknowledge: (reply: LobbyReply) => void) => void;
};
