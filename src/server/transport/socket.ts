import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, GameCue, HealthResponse, LobbyCommand, LobbyReply, ServerToClientEvents } from '../../shared/protocol.js';
import type { Session } from '../session.js';

export function createSocketServer(server: HttpServer, health: HealthResponse, lobby: Session) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, { serveClient: false, maxHttpBufferSize: 16384 });
  function publish(cue?: GameCue) {
    for (const socket of io.sockets.sockets.values()) {
      const view = lobby.viewFor(socket.id);
      if (view) socket.emit('lobby:state', view);
      // A volatile packet immediately after a snapshot can be dropped while that write drains.
      // Clients discard old cues by timestamp/version; cues are never restored from state.
      if (cue && view?.kind === 'organizer' && view.audioEnabled) socket.emit('game:cue', cue);
    }
  }
  const unsubscribe = lobby.subscribe(publish);
  io.engine.once('close', unsubscribe);
  io.on('connection', socket => {
    socket.emit('server:ready', health);
    const commands: LobbyCommand[] = ['organizer:authorize', 'room:create', 'room:close', 'player:join', 'player:resume', 'player:leave', 'player:remove',
      'deal:create', 'deal:shuffle', 'deal:cancel', 'deal:replace', 'card:ready', 'card:request', 'lobby:sync', 'organizer:audio',
      'game:configure', 'round:start', 'round:pause', 'round:resume', 'round:return', 'round:abort', 'party:finish', 'party:extend', 'play:infect', 'play:release', 'play:mission', 'play:undo', 'results:finalize', 'storage:retry', 'storage:reset', 'venue:configure', 'play:withdraw', 'play:sync', 'play:complete', 'sync:resolve', 'sync:close', 'ritual:penalty', 'ritual:undo-penalty', 'party:freeplay'];
    for (const command of commands) socket.on(command, (input: unknown, acknowledge: (reply: LobbyReply) => void) => {
      if (typeof acknowledge !== 'function') return;
      void lobby.execute(socket.id, command, input).then(acknowledge, () => acknowledge({ ok: false, error: 'STORAGE_UNAVAILABLE' }));
    });
    socket.on('disconnect', () => { void lobby.disconnect(socket.id).catch(() => {}); });
  });
  return io;
}
