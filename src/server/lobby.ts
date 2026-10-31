import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { LobbyCommand, LobbyError, LobbyReply, LobbyView, RoomSnapshot } from '../shared/protocol.js';
import { createDealing } from './dealing.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maximumRequestsPerPrincipal = 1024;
function randomCode(length: number) {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}
export function generateOrganizerCode() { return randomCode(12); }

interface Player { id: string; name: string; key: string; connections: Set<string> }
type Actor = { kind: 'organizer' } | { kind: 'player'; playerId: string }
  | { kind: 'ended'; reason: 'closed' | 'removed' | 'left' };
interface Room {
  id: string; code: string; players: Map<string, Player>; revoked: Set<string>;
  dealing: ReturnType<typeof createDealing>;
  requests: Map<string, Map<string, string>>;
}
interface LobbyOptions {
  organizerCode: string;
  generateId?: () => string;
  generateRoomCode?: () => string;
  randomIndex?: (limit: number) => number;
}

export function createLobby({ organizerCode, generateId = randomUUID, generateRoomCode = () => randomCode(6), randomIndex = randomInt }: LobbyOptions) {
  let room: Room | undefined;
  let revision = 0;
  const actors = new Map<string, Actor>();
  const usedCodes = new Set<string>();

  function snapshot(): RoomSnapshot | null {
    return room ? {
      id: room.id, code: room.code, version: revision, capacity: 12,
      dealing: room.dealing.publicState(),
      players: [...room.players.values()].map(player => ({
        id: player.id, name: player.name, online: player.connections.size > 0,
      })),
    } : null;
  }

  function viewFor(connection: string): LobbyView | undefined {
    const actor = actors.get(connection);
    if (!actor) return undefined;
    if (actor.kind === 'organizer') return { revision, kind: 'organizer', room: snapshot() };
    if (actor.kind === 'ended') return { revision, ...actor };
    const state = snapshot();
    if (!state) return undefined;
    return { revision, kind: 'player', room: state, playerId: actor.playerId, assignment: room!.dealing.personal(actor.playerId) };
  }

  function disconnect(connection: string) {
    const actor = actors.get(connection);
    if (actor?.kind === 'player') {
      const player = room?.players.get(actor.playerId);
      if (player?.connections.delete(connection) && player.connections.size === 0) revision++;
    }
    actors.delete(connection);
  }

  function attach(connection: string, player: Player) {
    const actor = actors.get(connection);
    if (actor?.kind === 'player' && actor.playerId === player.id) return;
    disconnect(connection);
    player.connections.add(connection);
    actors.set(connection, { kind: 'player', playerId: player.id });
  }

  function remove(player: Player, reason: 'left' | 'removed') {
    room!.revoked.add(player.key);
    room!.players.delete(player.id);
    room!.dealing.remove(player.id);
    room!.requests.delete(`player:${player.id}`);
    for (const connection of player.connections) actors.set(connection, { kind: 'ended', reason });
  }

  function execute(connection: string, command: LobbyCommand, input: unknown): LobbyReply {
    const fail = (error: LobbyError): LobbyReply => ({ ok: false, error });
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_INPUT');
    const data = input as Record<string, unknown>;
    const actor = actors.get(connection);
    if (command === 'organizer:authorize') {
      if (typeof data.code !== 'string' || data.code.length > 32) return fail('INVALID_INPUT');
      const candidate = Buffer.from(data.code.trim().toUpperCase());
      const expected = Buffer.from(organizerCode);
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return fail('INVALID_ORGANIZER_CODE');
      disconnect(connection);
      actors.set(connection, { kind: 'organizer' });
    } else if (command === 'room:create' || command === 'room:close' || command === 'player:remove') {
      if (actor?.kind !== 'organizer') return fail('FORBIDDEN');
      if (command === 'room:create') {
        if (!room) {
          let code = generateRoomCode();
          for (let attempts = 0; usedCodes.has(code) && attempts < 32; attempts++) code = generateRoomCode();
          if (usedCodes.has(code)) throw new Error('Room code generator did not provide an unused code.');
          usedCodes.add(code);
          room = { id: generateId(), code, players: new Map(), revoked: new Set(), dealing: createDealing({ generateId, randomIndex }), requests: new Map() };
        }
      } else {
        if (typeof data.roomId !== 'string') return fail('INVALID_INPUT');
        if (!room || room.id !== data.roomId) return fail('ROOM_NOT_FOUND');
        if (command === 'room:close') {
          for (const [id, current] of actors) if (current.kind === 'player') actors.set(id, { kind: 'ended', reason: 'closed' });
          room = undefined;
        } else {
          if (typeof data.playerId !== 'string') return fail('INVALID_INPUT');
          const player = room.players.get(data.playerId);
          if (!player) return fail('SESSION_EXPIRED');
          remove(player, 'removed');
        }
      }
    } else if (command === 'player:join' || command === 'player:resume') {
      if (typeof data.roomCode !== 'string' || !/^[A-Z2-9]{6}$/i.test(data.roomCode)
        || typeof data.resumeKey !== 'string' || !/^[a-f0-9]{64}$/.test(data.resumeKey)) return fail('INVALID_INPUT');
      if (!room || room.code !== data.roomCode.toUpperCase()) return fail(command === 'player:resume' ? 'SESSION_EXPIRED' : 'ROOM_NOT_FOUND');
      if (room.revoked.has(data.resumeKey)) return fail('SESSION_EXPIRED');
      let player = [...room.players.values()].find(item => item.key === data.resumeKey);
      if (!player) {
        if (command === 'player:resume') return fail('SESSION_EXPIRED');
        if (typeof data.name !== 'string' || data.name.length > 256) return fail('INVALID_INPUT');
        const name = data.name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
        if (!name || [...name].length > 24 || /\p{Cc}/u.test(name)) return fail('INVALID_INPUT');
        if ([...room.players.values()].some(item => item.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) return fail('NAME_TAKEN');
        if (room.players.size >= 12) return fail('ROOM_FULL');
        player = { id: generateId(), name, key: data.resumeKey, connections: new Set() };
        room.dealing.add(player.id);
        room.players.set(player.id, player);
      }
      attach(connection, player);
    } else if (command === 'player:leave') {
      if (actor?.kind !== 'player') return fail('FORBIDDEN');
      if (typeof data.roomId !== 'string') return fail('INVALID_INPUT');
      if (!room || room.id !== data.roomId) return fail('ROOM_NOT_FOUND');
      const player = room.players.get(actor.playerId);
      if (!player) return fail('SESSION_EXPIRED');
      remove(player, 'left');
    } else if (['deal:create', 'deal:shuffle', 'deal:cancel', 'deal:replace', 'card:ready', 'card:request'].includes(command)) {
      const organizerAction = command.startsWith('deal:');
      if (organizerAction ? actor?.kind !== 'organizer' : actor?.kind !== 'player') return fail('FORBIDDEN');
      if (!room || room.id !== data.roomId) return fail('ROOM_NOT_FOUND');
      if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(data.requestId)
        || !Number.isInteger(data.dealVersion) || (data.dealVersion as number) < 0
        || !(data.dealId === null || typeof data.dealId === 'string')) return fail('INVALID_INPUT');
      if ((command === 'deal:create' || command === 'deal:shuffle') && !Number.isInteger(data.possessedCount)) return fail('INVALID_INPUT');
      if (command === 'deal:replace' && typeof data.playerId !== 'string') return fail('INVALID_INPUT');
      if (['deal:replace', 'card:ready', 'card:request'].includes(command) && typeof data.assignmentId !== 'string') return fail('INVALID_INPUT');
      if (command === 'card:ready' && typeof data.ready !== 'boolean') return fail('INVALID_INPUT');
      if (command === 'card:request' && typeof data.requested !== 'boolean') return fail('INVALID_INPUT');
      const principal = actor!.kind === 'player' ? `player:${actor!.playerId}` : 'organizer';
      const fields = [command, data.roomId, data.dealVersion, data.dealId];
      if (command === 'deal:create' || command === 'deal:shuffle') fields.push(data.possessedCount);
      if (command === 'deal:replace') fields.push(data.playerId, data.assignmentId);
      if (command === 'card:ready') fields.push(data.assignmentId, data.ready);
      if (command === 'card:request') fields.push(data.assignmentId, data.requested);
      const fingerprint = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
      const requests = room.requests.get(principal);
      const previous = requests?.get(data.requestId);
      if (previous) return previous === fingerprint ? { ok: true, view: viewFor(connection)! } : fail('INVALID_INPUT');
      const state = room.dealing.publicState();
      if (data.dealVersion !== state.version || data.dealId !== state.dealId) return fail('STALE_DEAL');
      if ((command === 'deal:create') !== (state.phase === 'lobby')) return fail('STALE_DEAL');
      if (requests && requests.size >= maximumRequestsPerPrincipal) return fail('REQUEST_LIMIT');
      let error: LobbyError | undefined;
      if (command === 'deal:create' || command === 'deal:shuffle') error = room.dealing.deal([...room.players.keys()], data.possessedCount as number);
      else if (command === 'deal:cancel') room.dealing.cancel();
      else if (command === 'deal:replace') error = room.dealing.change(data.playerId as string, data.assignmentId as string, 'replace');
      else if (actor!.kind === 'player') error = room.dealing.change(actor!.playerId, data.assignmentId as string, command === 'card:ready' ? 'ready' : 'request', (command === 'card:ready' ? data.ready : data.requested) as boolean);
      if (error) return fail(error);
      if (requests) requests.set(data.requestId, fingerprint);
      else room.requests.set(principal, new Map([[data.requestId, fingerprint]]));
    } else return fail('INVALID_INPUT');
    revision++;
    return { ok: true, view: viewFor(connection)! };
  }

  return { execute, disconnect, viewFor };
}

export type Lobby = ReturnType<typeof createLobby>;
