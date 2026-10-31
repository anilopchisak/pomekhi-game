import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, HealthResponse, LobbyCommand, LobbyReply, ServerToClientEvents } from '../../shared/protocol.js';
import type { Lobby } from '../lobby.js';

export function createSocketServer(server: HttpServer, health: HealthResponse, lobby: Lobby) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, { serveClient: false, maxHttpBufferSize: 16384 });
  function publish() {
    for (const socket of io.sockets.sockets.values()) {
      const view = lobby.viewFor(socket.id);
      if (view) socket.emit('lobby:state', view);
    }
  }
  io.on('connection', socket => {
    socket.emit('server:ready', health);
    const commands: LobbyCommand[] = ['organizer:authorize', 'room:create', 'room:close', 'player:join', 'player:resume', 'player:leave', 'player:remove'];
    for (const command of commands) socket.on(command, (input: unknown, acknowledge: (reply: LobbyReply) => void) => {
      if (typeof acknowledge !== 'function') return;
      const reply = lobby.execute(socket.id, command, input);
      acknowledge(reply);
      if (reply.ok) publish();
    });
    socket.on('disconnect', () => { lobby.disconnect(socket.id); publish(); });
  });
  return io;
}
