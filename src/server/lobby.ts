import { createCatalog } from './catalog.js';
import { trialTraits } from '../shared/protocol.js';
import type { TrialReviewFact } from '../shared/protocol.js';
import type { SavedCatalog } from './catalog.js';
import type { CatalogReply } from '../shared/protocol.js';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { GameCue, GameSettings, LobbyCommand, LobbyError, LobbyReply, LobbyView, PhysicalStatus, RoomSnapshot } from '../shared/protocol.js';
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
  catalog?: SavedCatalog;
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
  firstGame?: boolean;
}

export function createLobby({ organizerCode, generateId = randomUUID, generateRoomCode = () => randomCode(6), randomIndex = randomInt, clock, firstGame }: LobbyOptions) {
  const catalog = createCatalog();
  let room: Room | undefined;
  let revision = 0;
  const actors = new Map<string, Actor>();
  const usedCodes = new Set<string>();
  const listeners = new Set<(cue?: GameCue) => void>();
  let audioOwner: string | null = null;
  let phoneScaresEnabled = true;
  const phoneOwners = new Map<string, string>();

  function notify() {
    revision++;
    const pending = room?.game.takeCue();
    const cue = pending && room ? { ...pending, roomId: room.id } : undefined;
    for (const listener of listeners) listener(cue);
  }

  function snapshot(): RoomSnapshot | null {
    return room ? {
      id: room.id, code: room.code, version: revision, capacity: 12, phoneScaresEnabled,
      dealing: room.game.dealingState(), game: room.game.publicState(),
      players: [...room.players.values()].map(player => ({
        id: player.id, name: player.name, online: player.connections.size > 0,
      })),
    } : null;
  }

  function viewFor(connection: string): LobbyView | undefined {
    const actor = actors.get(connection);
    if (!actor) return undefined;
    if (actor.kind === 'organizer') return { revision, kind: 'organizer', room: snapshot(), audioEnabled: audioOwner === connection,
      ...(firstGame && room ? { roles: room.game.roles(), missingLocations: room.game.missingLocations(), violations: room.game.violations(), trialReview: room.game.trialStatus(), presence: [...room.players.keys()].flatMap(id => {
        const status = room!.game.physicalStatus(id); return status ? [status] : [];
      }) } : {}), review: room && ['between_rounds', 'finished'].includes(room.game.publicState().phase) ? room.game.review() : [] };
    if (actor.kind === 'ended') return { revision, ...actor };
    const state = snapshot();
    if (!state) return undefined;
    if (firstGame) {
      state.dealing = { ...state.dealing, initialPossessedCount: null, assignments: state.dealing.assignments.filter(item => item.playerId === actor.playerId) };
      delete state.game.venue.order;
    }
    return { revision, kind: 'player', room: state, playerId: actor.playerId, audioEnabled: phoneOwners.get(actor.playerId) === connection, assignment: room!.game.personal(actor.playerId), play: room!.game.personalPlay(actor.playerId), synchronization: room!.game.personalSync(actor.playerId), presence: room!.game.physicalStatus(actor.playerId), locationProposal: room!.game.locationProposal(actor.playerId), trial: room!.game.trialFor(actor.playerId), canReportViolation: firstGame ? room!.game.canReportViolation(actor.playerId, state.game.ritual ?? undefined) : undefined, violations: room!.game.violations().filter(row => row.reporterId === actor.playerId).map(({ id, slot, details, status }) => ({ id, slot, details, status })) };
  }

  function disconnect(connection: string) {
    const actor = actors.get(connection);
    let changed = false;
    if (actor?.kind === 'player') {
      const player = room?.players.get(actor.playerId);
      if (player?.connections.delete(connection) && player.connections.size === 0) changed = true;
    }
    actors.delete(connection);
    for (const [id, owner] of phoneOwners) if (owner === connection) { phoneOwners.delete(id); changed = true; }
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
    phoneOwners.delete(player.id);
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
    if (command === 'sync:preview') {
      if (actor?.kind !== 'organizer') return fail('FORBIDDEN');
      if (!room || room.id !== data.roomId) return fail('ROOM_NOT_FOUND');
      const state = room.game.publicState();
      if (data.gameVersion !== state.version || data.roundId !== state.roundId) return fail('STALE_GAME');
      if (typeof data.eventId !== 'string' || data.decision !== 'accept' && data.decision !== 'reject' || data.beforeId !== undefined && typeof data.beforeId !== 'string') return fail('INVALID_INPUT');
      const preview = room.game.reviewPreview(data.eventId, data.decision, data.beforeId);
      return typeof preview === 'string' ? fail(preview) : { ok: true, view: viewFor(connection)!, reviewPreview: preview };
    }
    if (command === 'lobby:sync') return actor ? { ok: true, view: viewFor(connection)! } : fail('FORBIDDEN');
    if (command === 'organizer:authorize') {
      if (typeof data.code !== 'string' || data.code.length > 32) return fail('INVALID_INPUT');
      const candidate = Buffer.from(data.code.trim().toUpperCase());
      const expected = Buffer.from(organizerCode);
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return fail('INVALID_ORGANIZER_CODE');
      if (actor?.kind !== 'organizer') disconnect(connection);
      actors.set(connection, { kind: 'organizer' });
    } else if (command === 'organizer:atmosphere' || command === 'player:audio') {
      if (command === 'organizer:atmosphere' ? actor?.kind !== 'organizer' : actor?.kind !== 'player') return fail('FORBIDDEN');
      if (!room || room.id !== data.roomId) return fail('ROOM_NOT_FOUND');
      if (typeof data.enabled !== 'boolean') return fail('INVALID_INPUT');
      if (command === 'organizer:atmosphere') phoneScaresEnabled = data.enabled;
      else if (actor?.kind === 'player') {
        if (data.enabled) phoneOwners.set(actor.playerId, connection);
        else if (phoneOwners.get(actor.playerId) === connection) phoneOwners.delete(actor.playerId);
      }
    } else if (command === 'organizer:audio') {
      if (actor?.kind !== 'organizer') return fail('FORBIDDEN');
      if (typeof data.enabled !== 'boolean') return fail('INVALID_INPUT');
      if (data.enabled) audioOwner = connection;
      else if (audioOwner === connection) audioOwner = null;
    } else if (command === 'room:create' || command === 'room:close' || command === 'player:remove') {
      if (actor?.kind !== 'organizer') return fail('FORBIDDEN');
      if (command === 'room:create') {
        if (!room) {
          phoneScaresEnabled = true; phoneOwners.clear();
          let code = generateRoomCode();
          for (let attempts = 0; usedCodes.has(code) && attempts < 32; attempts++) code = generateRoomCode();
          if (usedCodes.has(code)) throw new Error('Room code generator did not provide an unused code.');
          usedCodes.add(code);
          room = { id: generateId(), code, players: new Map(), revoked: new Set(), game: createGame({ generateId, randomIndex, clock, firstGame, onChange: notify, getCards: catalog.cards }), requests: new Map() };
          room.game.initializeStory();
        }
      } else {
        if (typeof data.roomId !== 'string') return fail('INVALID_INPUT');
        if (!room || room.id !== data.roomId) return fail('ROOM_NOT_FOUND');
        if (command === 'room:close') {
          for (const [id, current] of actors) if (current.kind === 'player') actors.set(id, { kind: 'ended', reason: 'closed' });
          room.game.dispose(); room = undefined; audioOwner = null; phoneOwners.clear();
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
        const error = room.game.add(player.id);
        if (error) return fail(error);
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
      'game:configure', 'round:start', 'round:pause', 'round:resume', 'round:return', 'round:abort', 'party:finish', 'party:extend', 'play:infect', 'play:release', 'play:mission', 'play:undo', 'results:finalize', 'venue:configure', 'play:withdraw', 'sync:resolve', 'sync:close', 'play:presence', 'play:location', 'round:location', 'round:presence', 'play:trial', 'round:trial-review', 'play:violation', 'ritual:review', 'ritual:penalty', 'ritual:undo-penalty', 'party:freeplay'].includes(command)) {
      const personalReport = command === 'play:presence' || command === 'play:location' || command === 'play:violation' || command === 'play:trial';
      const playAction = command.startsWith('play:') && !personalReport;
      const gameAction = command.startsWith('game:') || command.startsWith('round:') || command.startsWith('party:') || playAction || personalReport || command === 'results:finalize' || command === 'venue:configure' || command.startsWith('sync:') || command.startsWith('ritual:');
      const organizerAction = command.startsWith('deal:') || gameAction && !playAction && !personalReport;
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
      if ((command === 'play:presence' || command === 'round:presence') && data.status !== 'at_base' && data.status !== 'in_group') return fail('INVALID_INPUT');
      if ((command === 'round:presence' || command === 'round:location') && typeof data.playerId !== 'string' || (command === 'play:location' || command === 'round:location') && typeof data.zone !== 'string') return fail('INVALID_INPUT');
      if (playAction && (!Number.isInteger(data.playVersion) || (data.playVersion as number) < 0)) return fail('INVALID_INPUT');
      if (command === 'play:infect' && typeof data.targetId !== 'string') return fail('INVALID_INPUT');
      if (command === 'play:undo' && (typeof data.actionId !== 'string' || data.requestReview !== undefined && data.requestReview !== true)) return fail('INVALID_INPUT');
      if (command === 'play:mission' && typeof data.completed !== 'boolean') return fail('INVALID_INPUT');
      if ((command === 'deal:create' || command === 'deal:shuffle') && !Number.isInteger(data.possessedCount)) return fail('INVALID_INPUT');
      if (command === 'deal:replace' && typeof data.playerId !== 'string') return fail('INVALID_INPUT');
      if (['deal:replace', 'card:ready', 'card:request'].includes(command) && typeof data.assignmentId !== 'string') return fail('INVALID_INPUT');
      if (command === 'card:ready' && typeof data.ready !== 'boolean') return fail('INVALID_INPUT');
      if (command === 'card:request' && typeof data.requested !== 'boolean') return fail('INVALID_INPUT');
      if (command === 'sync:resolve' && (typeof data.eventId !== 'string' || !['accept', 'reject'].includes(data.decision as string) || data.beforeId !== undefined && typeof data.beforeId !== 'string')) return fail('INVALID_INPUT');
      if (command === 'round:trial-review' && (typeof data.playerId !== 'string' || typeof data.accepted !== 'boolean' || data.fact !== undefined && data.fact !== 'repeat' && !trialTraits.includes(data.fact as typeof trialTraits[number]))) return fail('INVALID_INPUT');
      if (command === 'play:violation' && (data.slot !== 'A' && data.slot !== 'B' || typeof data.details !== 'string')) return fail('INVALID_INPUT');
      if (command === 'ritual:review' && (typeof data.reportId !== 'string' || typeof data.accept !== 'boolean')) return fail('INVALID_INPUT');
      if (command === 'sync:close' && data.confirm !== true) return fail('INVALID_INPUT');
      const principal = actor!.kind === 'player' ? `player:${actor!.playerId}` : 'organizer';
      const fields: unknown[] = [command, data.roomId, gameAction ? data.gameVersion : data.dealVersion, gameAction ? data.roundId : data.dealId];
      if (command === 'game:configure') {
        const settings = data.settings as GameSettings;
        fields.push(settings.ritualEnabled, settings.tutorialEnabled, settings.initialDifficulty, settings.maximumDifficulty, settings.infectionMode, settings.roundLimit, settings.placementSeconds, settings.searchSeconds, settings.returnSeconds);
      }
      if (command === 'venue:configure') fields.push(data.venue);
      if (command === 'sync:resolve') fields.push(data.eventId, data.decision, data.beforeId);
      if (command === 'play:presence' || command === 'round:presence') fields.push(data.status, data.playerId);
      if (command === 'play:location' || command === 'round:location') fields.push(data.zone, data.playerId);
      if (playAction) fields.push(data.playVersion);
      if (command === 'play:infect') fields.push(data.targetId);
      if (command === 'play:undo') fields.push(data.actionId, ...(data.requestReview === undefined ? [] : [data.requestReview]));
      if (command === 'play:mission') fields.push(data.completed);
      if (command === 'play:trial') fields.push(data.values);
      if (command === 'round:trial-review') fields.push(data.playerId, data.accepted, ...(data.fact === undefined ? [] : [data.fact]));
      if (command === 'play:violation') fields.push(data.slot, data.details);
      if (command === 'ritual:review') fields.push(data.reportId, data.accept);
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
      else if (command === 'venue:configure') error = room.game.configureVenue(data.venue, [...room.players.keys()]);
      else if (command === 'round:presence' || command === 'play:presence') error = room.game.confirmPresence(command === 'round:presence' ? data.playerId as string : actor!.kind === 'player' ? actor!.playerId : '', data.status as PhysicalStatus);
      else if (command === 'round:location') error = room.game.setLocation(data.playerId as string, data.zone as string, true);
      else if (command === 'play:location' && actor!.kind === 'player') error = room.game.setLocation(actor!.playerId, data.zone as string);
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
      else if (command === 'play:trial' && actor!.kind === 'player') error = room.game.reportTrial(actor!.playerId, data.values);
      else if (command === 'round:trial-review') error = room.game.reviewTrial(data.playerId as string, data.accepted as boolean, data.fact as TrialReviewFact | undefined);
      else if (command === 'play:violation' && actor!.kind === 'player') error = room.game.reportViolation(actor!.playerId, data.slot as 'A' | 'B', data.details as string, generateId());
      else if (command === 'ritual:review') error = room.game.reviewViolation(data.reportId as string, data.accept as boolean);
      else if (command === 'ritual:penalty' || command === 'ritual:undo-penalty') error = room.game.ritualAction(command === 'ritual:penalty' ? 'penalty' : 'undoPenalty');
      else if (command === 'party:freeplay') error = room.game.freeplay();
      else if (command === 'party:extend') error = room.game.extend();
      else if (command === 'results:finalize') error = room.game.finalize();
      else if (playAction && actor!.kind === 'player') error = room.game.playAction(actor!.playerId, command.slice(5) as 'infect' | 'release' | 'mission' | 'undo', (command === 'play:undo' ? data.actionId : data.targetId) as string, data.completed as boolean, command === 'play:undo' && data.requestReview === true ? true : undefined);
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
    return structuredClone({ catalog: catalog.exportState(), revision, usedCodes: [...usedCodes], room: room ? { id: room.id, code: room.code,
      players: [...room.players.values()].map(({ id, name, key }) => ({ id, name, key })), revoked: [...room.revoked],
      game: room.game.exportState(), requests: [...room.requests].map(([id, entries]) => [id, [...entries]]) } : null });
  }
  function liveState() { return { actors: new Map(structuredClone([...actors])), audioOwner, phoneOwners: new Map(phoneOwners), phoneScaresEnabled }; }
  function restore(state: SavedLobby, reason: 'server_restarted' | 'storage_error' = 'server_restarted', live?: ReturnType<typeof liveState>) {
    catalog.restore(state.catalog ?? createCatalog().exportState());
    const previousGame = room?.id === state.room?.id ? room?.game.exportState() : undefined;
    room?.game.dispose(); room = undefined; audioOwner = null; actors.clear(); phoneOwners.clear(); phoneScaresEnabled = false;
    revision = Math.max(revision, state.revision) + 1; usedCodes.clear(); for (const code of state.usedCodes) usedCodes.add(code);
    if (state.room) {
      const saved = state.room;
      const game = createGame({ generateId, randomIndex, clock, firstGame, onChange: notify, getCards: catalog.cards });
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
      if (reason === 'storage_error') {
        audioOwner = room ? live.audioOwner : null;
        phoneScaresEnabled = live.phoneScaresEnabled;
        for (const [id, owner] of live.phoneOwners) if (room?.players.has(id)) phoneOwners.set(id, owner);
      }
    }
  }
  function catalogExecute(connection: string, input: unknown): CatalogReply {
    if (actors.get(connection)?.kind !== 'organizer') return { ok: false, error: 'FORBIDDEN' };
    const editable = !room || ['lobby', 'between_rounds', 'finished'].includes(room.game.publicState().phase);
    const before = catalog.exportState().revision;
    const error = catalog.execute(input, editable);
    if (error) return { ok: false, error };
    if (before !== catalog.exportState().revision) notify();
    return { ok: true, catalog: catalog.snapshot(editable) };
  }
  function checkpoint() { if (room?.game.synchronize()) notify(); }
  function dispose() { room?.game.dispose(); room = undefined; listeners.clear(); actors.clear(); audioOwner = null; phoneOwners.clear(); }
  return { execute, catalogExecute, disconnect, viewFor, subscribe, dispose, exportState, restore, liveState, checkpoint };
}

export type Lobby = ReturnType<typeof createLobby>;
