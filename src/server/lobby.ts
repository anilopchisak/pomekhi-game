import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { GameCue, GameSettings, LobbyCommand, LobbyError, LobbyReply, LobbyView, RoomSnapshot } from '../shared/protocol.js';
import { validOfflineEvent } from './round-sync.js';
import { createGame, validSettings } from './game.js';
import type { GameClock, SavedGame } from './game.js';

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
  game: ReturnType<typeof createGame>;
  requests: Map<string, Map<string, string>>;
}
export interface SavedLobby {
  revision: number; usedCodes: string[];
  room: null | { id: string; code: string; players: { id: string; name: string; key: string }[]; revoked: string[];
    game: SavedGame; requests: [string, [string, string][]][] };
}
export interface LobbyOptions {
  organizerCode: string;
  generateId?: () => string;
  generateRoomCode?: () => string;
  randomIndex?: (limit: number) => number;
  clock?: GameClock;
}

export function createLobby({ organizerCode, generateId = randomUUID, generateRoomCode = () => randomCode(6), randomIndex = randomInt, clock }: LobbyOptions) {
  let room: Room | undefined;
  let revision = 0;
  const actors = new Map<string, Actor>();
  const usedCodes = new Set<string>();
  const listeners = new Set<(cue?: GameCue) => void>();
  let audioOwner: string | null = null;

  function notify() {
    revision++;
    const pending = room?.game.takeCue();
    const cue = pending && room ? { ...pending, roomId: room.id } : undefined;
    for (const listener of listeners) listener(cue);
  }

  function snapshot(): RoomSnapshot | null {
    return room ? {
      id: room.id, code: room.code, version: revision, capacity: 12,
      dealing: room.game.dealingState(), game: room.game.publicState(),
      players: [...room.players.values()].map(player => ({
        id: player.id, name: player.name, online: player.connections.size > 0,
      })),
    } : null;
  }

  function viewFor(connection: string): LobbyView | undefined {
    const actor = actors.get(connection);
    if (!actor) return undefined;
    if (actor.kind === 'organizer') return { revision, kind: 'organizer', room: snapshot(), audioEnabled: audioOwner === connection, review: room && ['between_rounds', 'finished'].includes(room.game.publicState().phase) ? room.game.review() : [] };
    if (actor.kind === 'ended') return { revision, ...actor };
    const state = snapshot();
    if (!state) return undefined;
    return { revision, kind: 'player', room: state, playerId: actor.playerId, assignment: room!.game.personal(actor.playerId), play: room!.game.personalPlay(actor.playerId), synchronization: room!.game.personalSync(actor.playerId) };
  }

  function disconnect(connection: string) {
    const actor = actors.get(connection);
    let changed = false;
    if (actor?.kind === 'player') {
      const player = room?.players.get(actor.playerId);
      if (player?.connections.delete(connection) && player.connections.size === 0) changed = true;
    }
    actors.delete(connection);
    if (audioOwner === connection) { audioOwner = null; changed = true; }
    if (actor?.kind === 'organizer' && ![...actors.values()].some(item => item.kind === 'organizer')) {
      if (room?.game.synchronize()) changed = true;
      if (room && room.game.pause('organizer_disconnected') === undefined) changed = true;
    }
    if (changed) notify();
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
    room!.game.remove(player.id);
    room!.requests.delete(`player:${player.id}`);
    for (const connection of player.connections) actors.set(connection, { kind: 'ended', reason });
  }

  function execute(connection: string, command: LobbyCommand, input: unknown): LobbyReply {
    const fail = (error: LobbyError): LobbyReply => ({ ok: false, error });
    if (room?.game.synchronize()) notify();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_INPUT');
    const data = input as Record<string, unknown>;
    const actor = actors.get(connection);
    if (command === 'play:sync' || command === 'play:complete') {
      if (actor?.kind !== 'player') return fail('FORBIDDEN');
      if (!room || data.roomId !== room.id) return fail('ROOM_NOT_FOUND');
      if (typeof data.roundId !== 'string') return fail('INVALID_INPUT');
      let error: LobbyError | undefined;
      if (command === 'play:sync') {
        if (!Array.isArray(data.events) || data.events.length > 24 || !data.events.every(e => validOfflineEvent(e) && e.roundId === data.roundId)) return fail('INVALID_INPUT');
        error = room.game.syncEvents(actor.playerId, data.roundId, data.events);
      } else {
        if (!Number.isSafeInteger(data.syncRevision)) return fail('INVALID_INPUT');
        error = room.game.completeSync(actor.playerId, data.roundId, data.syncRevision as number);
      }
      if (error) return fail(error); notify(); return { ok: true, view: viewFor(connection)! };
    }
    if (command === 'lobby:sync') return actor ? { ok: true, view: viewFor(connection)! } : fail('FORBIDDEN');
    if (command === 'organizer:authorize') {
      if (typeof data.code !== 'string' || data.code.length > 32) return fail('INVALID_INPUT');
      const candidate = Buffer.from(data.code.trim().toUpperCase());
      const expected = Buffer.from(organizerCode);
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return fail('INVALID_ORGANIZER_CODE');
      if (actor?.kind !== 'organizer') disconnect(connection);
      actors.set(connection, { kind: 'organizer' });
    } else if (command === 'organizer:audio') {
      if (actor?.kind !== 'organizer') return fail('FORBIDDEN');
      if (typeof data.enabled !== 'boolean') return fail('INVALID_INPUT');
      if (data.enabled) audioOwner = connection;
      else if (audioOwner === connection) audioOwner = null;
    } else if (command === 'room:create' || command === 'room:close' || command === 'player:remove') {
      if (actor?.kind !== 'organizer') return fail('FORBIDDEN');
      if (command === 'room:create') {
        if (!room) {
          let code = generateRoomCode();
          for (let attempts = 0; usedCodes.has(code) && attempts < 32; attempts++) code = generateRoomCode();
          if (usedCodes.has(code)) throw new Error('Room code generator did not provide an unused code.');
          usedCodes.add(code);
          room = { id: generateId(), code, players: new Map(), revoked: new Set(), game: createGame({ generateId, randomIndex, clock, onChange: notify }), requests: new Map() };
        }
      } else {
        if (typeof data.roomId !== 'string') return fail('INVALID_INPUT');
        if (!room || room.id !== data.roomId) return fail('ROOM_NOT_FOUND');
        if (command === 'room:close') {
          for (const [id, current] of actors) if (current.kind === 'player') actors.set(id, { kind: 'ended', reason: 'closed' });
          room.game.dispose(); room = undefined; audioOwner = null;
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
        room.game.add(player.id);
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
    } else if (['deal:create', 'deal:shuffle', 'deal:cancel', 'deal:replace', 'card:ready', 'card:request',
      'game:configure', 'round:start', 'round:pause', 'round:resume', 'round:return', 'round:abort', 'party:finish', 'party:extend', 'play:infect', 'play:release', 'play:mission', 'play:undo', 'results:finalize', 'venue:configure', 'play:withdraw', 'sync:resolve', 'sync:close'].includes(command)) {
      const playAction = command.startsWith('play:');
      const gameAction = command.startsWith('game:') || command.startsWith('round:') || command.startsWith('party:') || playAction || command === 'results:finalize' || command === 'venue:configure' || command.startsWith('sync:');
      const organizerAction = command.startsWith('deal:') || gameAction && !playAction;
      if (organizerAction ? actor?.kind !== 'organizer' : actor?.kind !== 'player') return fail('FORBIDDEN');
      if (!room || room.id !== data.roomId) return fail('ROOM_NOT_FOUND');
      if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(data.requestId)) return fail('INVALID_INPUT');
      if (gameAction) {
        if (!Number.isInteger(data.gameVersion) || (data.gameVersion as number) < 0
          || !(data.roundId === null || typeof data.roundId === 'string')) return fail('INVALID_INPUT');
        if (command === 'game:configure' && !validSettings(data.settings, Math.max(99, room.game.publicState().settings.roundLimit ?? 99))) return fail('INVALID_INPUT');
        if ((command === 'round:start' || command === 'round:resume') && typeof data.confirmWarnings !== 'boolean') return fail('INVALID_INPUT');
      } else if (!Number.isInteger(data.dealVersion) || (data.dealVersion as number) < 0
        || !(data.dealId === null || typeof data.dealId === 'string')) return fail('INVALID_INPUT');
      if (playAction && (!Number.isInteger(data.playVersion) || (data.playVersion as number) < 0)) return fail('INVALID_INPUT');
      if (command === 'play:infect' && typeof data.targetId !== 'string') return fail('INVALID_INPUT');
      if (command === 'play:undo' && typeof data.actionId !== 'string') return fail('INVALID_INPUT');
      if (command === 'play:mission' && typeof data.completed !== 'boolean') return fail('INVALID_INPUT');
      if ((command === 'deal:create' || command === 'deal:shuffle') && !Number.isInteger(data.possessedCount)) return fail('INVALID_INPUT');
      if (command === 'deal:replace' && typeof data.playerId !== 'string') return fail('INVALID_INPUT');
      if (['deal:replace', 'card:ready', 'card:request'].includes(command) && typeof data.assignmentId !== 'string') return fail('INVALID_INPUT');
      if (command === 'card:ready' && typeof data.ready !== 'boolean') return fail('INVALID_INPUT');
      if (command === 'card:request' && typeof data.requested !== 'boolean') return fail('INVALID_INPUT');
      if (command === 'sync:resolve' && (typeof data.eventId !== 'string' || !['accept', 'reject'].includes(data.decision as string) || data.beforeId !== undefined && typeof data.beforeId !== 'string')) return fail('INVALID_INPUT');
      if (command === 'sync:close' && data.confirm !== true) return fail('INVALID_INPUT');
      const principal = actor!.kind === 'player' ? `player:${actor!.playerId}` : 'organizer';
      const fields: unknown[] = [command, data.roomId, gameAction ? data.gameVersion : data.dealVersion, gameAction ? data.roundId : data.dealId];
      if (command === 'game:configure') {
        const settings = data.settings as GameSettings;
        fields.push(settings.tutorialEnabled, settings.initialDifficulty, settings.maximumDifficulty, settings.infectionMode, settings.roundLimit, settings.placementSeconds, settings.searchSeconds, settings.returnSeconds);
      }
      if (command === 'venue:configure') fields.push(data.venue);
      if (command === 'sync:resolve') fields.push(data.eventId, data.decision, data.beforeId);
      if (playAction) fields.push(data.playVersion);
      if (command === 'play:infect') fields.push(data.targetId);
      if (command === 'play:undo') fields.push(data.actionId);
      if (command === 'play:mission') fields.push(data.completed);
      if (command === 'round:start' || command === 'round:resume') fields.push(data.confirmWarnings);
      if (command === 'deal:create' || command === 'deal:shuffle') fields.push(data.possessedCount);
      if (command === 'deal:replace') fields.push(data.playerId, data.assignmentId);
      if (command === 'card:ready') fields.push(data.assignmentId, data.ready);
      if (command === 'card:request') fields.push(data.assignmentId, data.requested);
      const fingerprint = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
      const requests = room.requests.get(principal);
      const previous = requests?.get(data.requestId);
      if (previous) return previous === fingerprint ? { ok: true, view: viewFor(connection)! } : fail('INVALID_INPUT');
      const state = room.game.dealingState();
      const gameState = room.game.publicState();
      if (gameAction) {
        if (data.gameVersion !== gameState.version || data.roundId !== gameState.roundId) return fail('STALE_GAME');
      } else if (data.dealVersion !== state.version || data.dealId !== state.dealId) return fail('STALE_DEAL');
      if (playAction && actor?.kind === 'player' && data.playVersion !== room.game.personalPlay(actor.playerId)?.version) return fail('STALE_PLAY');
      if (requests && requests.size >= maximumRequestsPerPrincipal) return fail('REQUEST_LIMIT');
      let error: LobbyError | undefined;
      if (command === 'deal:create' || command === 'deal:shuffle') error = room.game.deal([...room.players.keys()], data.possessedCount as number, command === 'deal:shuffle');
      else if (command === 'deal:cancel') error = room.game.cancelDeal();
      else if (command === 'deal:replace') error = room.game.change(data.playerId as string, data.assignmentId as string, 'replace');
      else if (command === 'venue:configure') error = room.game.configureVenue(data.venue);
      else if (command === 'sync:resolve') error = room.game.resolveSync(data.eventId as string, data.decision as 'accept' | 'reject', data.beforeId as string | undefined);
      else if (command === 'sync:close') error = room.game.closeSync();
      else if (command === 'play:withdraw' && actor!.kind === 'player') error = room.game.withdraw(actor!.playerId);
      else if (command === 'game:configure') error = room.game.configure(data.settings as GameSettings);
      else if (command === 'round:start') error = room.game.start([...room.players.values()].map(player => ({ id: player.id, name: player.name, online: player.connections.size > 0 })), data.confirmWarnings as boolean);
      else if (command === 'round:pause') error = room.game.pause();
      else if (command === 'round:resume') error = room.game.resume(data.confirmWarnings as boolean);
      else if (command === 'round:return') error = room.game.beginReturn();
      else if (command === 'round:abort') error = room.game.abort();
      else if (command === 'party:finish') error = room.game.finishParty();
      else if (command === 'party:extend') error = room.game.extend();
      else if (command === 'results:finalize') error = room.game.finalize();
      else if (playAction && actor!.kind === 'player') error = room.game.playAction(actor!.playerId, command.slice(5) as 'infect' | 'release' | 'mission' | 'undo', (command === 'play:undo' ? data.actionId : data.targetId) as string, data.completed as boolean);
      else if (actor!.kind === 'player') error = room.game.change(actor!.playerId, data.assignmentId as string, command === 'card:ready' ? 'ready' : 'request', (command === 'card:ready' ? data.ready : data.requested) as boolean);
      if (error) return fail(error);
      if (requests) requests.set(data.requestId, fingerprint);
      else room.requests.set(principal, new Map([[data.requestId, fingerprint]]));
    } else return fail('INVALID_INPUT');
    notify();
    return { ok: true, view: viewFor(connection)! };
  }

  function subscribe(listener: (cue?: GameCue) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
  function exportState(): SavedLobby {
    return structuredClone({ revision, usedCodes: [...usedCodes], room: room ? { id: room.id, code: room.code,
      players: [...room.players.values()].map(({ id, name, key }) => ({ id, name, key })), revoked: [...room.revoked],
      game: room.game.exportState(), requests: [...room.requests].map(([id, entries]) => [id, [...entries]]) } : null });
  }
  function liveState() { return { actors: new Map(structuredClone([...actors])), audioOwner }; }
  function restore(state: SavedLobby, reason: 'server_restarted' | 'storage_error' = 'server_restarted', live?: ReturnType<typeof liveState>) {
    const previousGame = room?.id === state.room?.id ? room?.game.exportState() : undefined;
    room?.game.dispose(); room = undefined; audioOwner = null; actors.clear();
    revision = Math.max(revision, state.revision) + 1; usedCodes.clear(); for (const code of state.usedCodes) usedCodes.add(code);
    if (state.room) {
      const saved = state.room;
      const game = createGame({ generateId, randomIndex, clock, onChange: notify });
      const restored = structuredClone(saved.game);
      restored.version = Math.max(restored.version, previousGame?.version ?? 0);
      restored.dealing.version = Math.max(restored.dealing.version, previousGame?.dealing.version ?? 0);
      if (restored.search && previousGame?.search?.roundId === restored.search.roundId) restored.search.version = Math.max(restored.search.version, previousGame.search.version);
      game.restore(restored, reason);
      room = { id: saved.id, code: saved.code, players: new Map(saved.players.map(p => [p.id, { ...p, connections: new Set<string>() }])),
        revoked: new Set(saved.revoked), game, requests: new Map(saved.requests.map(([id, entries]) => [id, new Map(entries)])) };
    }
    if (live) {
      for (const [connection, actor] of live.actors) {
        if (actor.kind === 'player') {
          const player = room?.players.get(actor.playerId);
          if (player) { actors.set(connection, actor); player.connections.add(connection); }
          else actors.set(connection, { kind: 'ended', reason: 'closed' });
        } else actors.set(connection, actor);
      }
      audioOwner = room ? live.audioOwner : null;
    }
  }
  function checkpoint() { if (room?.game.synchronize()) notify(); }
  function dispose() { room?.game.dispose(); room = undefined; listeners.clear(); actors.clear(); audioOwner = null; }
  return { execute, disconnect, viewFor, subscribe, dispose, exportState, restore, liveState, checkpoint };
}

export type Lobby = ReturnType<typeof createLobby>;
