import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, HealthResponse, ServerToClientEvents } from '../../shared/protocol.js';

export function createSocketServer(server: HttpServer, health: HealthResponse) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, { serveClient: false });
  io.on('connection', socket => { socket.emit('server:ready', health); });
  return io;
}
