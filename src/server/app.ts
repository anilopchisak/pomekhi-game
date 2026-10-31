import { createServer } from 'node:http';
import { join } from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { APP_ID } from '../shared/protocol.js';
import type { ClientToServerEvents, HealthResponse, ServerToClientEvents } from '../shared/protocol.js';

export function buildHealthResponse(): HealthResponse {
  return { app: APP_ID, status: 'ok', stage: 'foundation' };
}

export function createAppServer(options: { clientDirectory?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(buildHealthResponse());
  });
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });
  if (options.clientDirectory) {
    app.use(express.static(options.clientDirectory));
    app.get('/', (_request, response) => {
      response.sendFile(join(options.clientDirectory!, 'index.html'));
    });
  }
  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' });
  });

  const server = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    serveClient: false,
  });
  io.on('connection', socket => {
    socket.emit('server:ready', buildHealthResponse());
  });

  async function close(): Promise<void> {
    await new Promise<void>(resolve => io.close(() => resolve()));
  }

  return { server, io, close };
}
