import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { APP_ID } from '../shared/protocol.js';
import type { HealthResponse } from '../shared/protocol.js';
import { createHttpApp } from './transport/http.js';
import type { HttpErrorReporter } from './transport/http.js';
import { createSocketServer } from './transport/socket.js';
import { generateOrganizerCode } from './lobby.js';
import { createSession } from './session.js';
import type { SessionStore } from './session-store.js';
import type { GameClock } from './game.js';

export interface AppServerOptions {
  clientDirectory?: string;
  reportError?: HttpErrorReporter;
  shutdownTimeoutMs?: number;
  organizerCode?: string;
  clock?: GameClock;
  sessionStore?: SessionStore;
}

export function buildHealthResponse(): HealthResponse {
  return { app: APP_ID, status: 'ok', stage: 'foundation' };
}

export function createAppServer(options: AppServerOptions = {}) {
  const timeoutMs = options.shutdownTimeoutMs ?? 2000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    throw new Error('shutdownTimeoutMs must be a positive timer-safe integer.');
  }
  const health = buildHealthResponse();
  const app = createHttpApp({ health, clientDirectory: options.clientDirectory, reportError: options.reportError });
  const server = createServer(app);
  const lobby = createSession({ organizerCode: options.organizerCode ?? generateOrganizerCode(), clock: options.clock, store: options.sessionStore });
  const io = createSocketServer(server, health, lobby);
  const connections = new Set<Socket>();
  server.on('connection', socket => {
    connections.add(socket);
    socket.once('close', () => { connections.delete(socket); });
  });
  let closing: Promise<void> | undefined;

  function forceClose() {
    for (const socket of connections) socket.destroy();
    if (server.listening) server.close();
  }

  function close(): Promise<void> {
    if (closing) return closing;
    closing = new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => {
        forceClose();
        reject(new Error(`Server shutdown exceeded ${timeoutMs}ms; remaining connections were closed.`));
      }, timeoutMs);
      let closeError: Error | undefined;
      void Promise.all([lobby.close(), io.close(error => { closeError = error; })]).then(() => {
        clearTimeout(deadline);
        if (closeError && (closeError as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(closeError);
        else resolve();
      }, error => {
        clearTimeout(deadline);
        forceClose();
        reject(error);
      });
    });
    return closing;
  }

  return { server, io, close, initialize: lobby.initialize };
}
