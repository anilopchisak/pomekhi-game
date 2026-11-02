import { createPhoneScares } from '../phone-scares.js';
import type { GameClock } from '../game.js';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, GameCue, HealthResponse, LobbyCommand, LobbyReply, ServerToClientEvents } from '../../shared/protocol.js';
import type { Session } from '../session.js';

function withinPayloadLimit(input: unknown, limit: number): boolean {
  try { return Buffer.byteLength(JSON.stringify(input) ?? '') <= limit; }
  catch { return false; }
}

export function createSocketServer(server: HttpServer, health: HealthResponse, lobby: Session, clock?: GameClock, randomIndex?: (limit: number) => number) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, { serveClient: false, maxHttpBufferSize: 1024 * 1024 });
  const scares = createPhoneScares({ clock, randomIndex, current: () => {
    const result = new Map<string, import('../../shared/protocol.js').LobbyView>();
    for (const socket of io.sockets.sockets.values()) { const view = lobby.viewFor(socket.id); if (view) result.set(socket.id, view); }
    return result;
  }, emit: (id, event) => { io.sockets.sockets.get(id)?.emit('player:scare', event); } });
  function publish(cue?: GameCue) {
    for (const socket of io.sockets.sockets.values()) {
      const view = lobby.viewFor(socket.id);
      if (view) socket.emit('lobby:state', view);
      // A volatile packet immediately after a snapshot can be dropped while that write drains.
      // Clients discard old cues by timestamp/version; cues are never restored from state.
      if (cue && view?.kind === 'organizer' && view.audioEnabled) socket.emit('game:cue', cue);
    }
  }
  const unsubscribe = lobby.subscribe(cue => { publish(cue); scares.update(); });
  io.engine.once('close', () => { unsubscribe(); scares.dispose(); });
  io.on('connection', socket => {
    socket.emit('server:ready', health);
    socket.on('catalog:command', (input, acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      const limit = input?.action === 'import' ? 1024 * 1024 : 16384;
      if (!withinPayloadLimit(input, limit)) { acknowledge({ ok: false, error: 'INVALID_INPUT' }); return; }
      void lobby.catalogExecute(socket.id, input).then(acknowledge, () => acknowledge({ ok: false, error: 'STORAGE_UNAVAILABLE' }));
    });
    const commands: LobbyCommand[] = ['organizer:authorize', 'room:create', 'room:close', 'player:join', 'player:resume', 'player:leave', 'player:remove',
      'deal:create', 'deal:shuffle', 'deal:cancel', 'deal:replace', 'card:ready', 'card:request', 'lobby:sync', 'organizer:audio', 'organizer:atmosphere', 'player:audio',
      'game:configure', 'round:start', 'round:pause', 'round:resume', 'round:return', 'round:abort', 'party:finish', 'party:extend', 'play:infect', 'play:release', 'play:mission', 'play:undo', 'results:finalize', 'storage:retry', 'storage:reset', 'venue:configure', 'play:withdraw', 'play:sync', 'play:complete', 'sync:resolve', 'sync:close', 'ritual:penalty', 'ritual:undo-penalty', 'party:freeplay'];
    for (const command of commands) socket.on(command, (input: unknown, acknowledge: (reply: LobbyReply) => void) => {
      if (typeof acknowledge !== 'function') return;
      if (!withinPayloadLimit(input, 16384)) { acknowledge({ ok: false, error: 'INVALID_INPUT' }); return; }
      void lobby.execute(socket.id, command, input).then(acknowledge, () => acknowledge({ ok: false, error: 'STORAGE_UNAVAILABLE' }));
    });
    socket.on('disconnect', () => { void lobby.disconnect(socket.id).catch(() => {}); });
  });
  return io;
}
