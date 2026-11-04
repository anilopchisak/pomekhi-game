import { STATUS_CODES } from 'node:http';
import { join } from 'node:path';
import express from 'express';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { HealthResponse } from '../../shared/protocol.js';

export type HttpErrorReporter = (error: unknown) => void;

export function createHttpErrorHandler(reportError: HttpErrorReporter = () => {
  console.error('An unexpected HTTP request error occurred.');
}): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const details = error && typeof error === 'object'
      ? error as { status?: unknown; statusCode?: unknown }
      : {};
    const candidate = details.status ?? details.statusCode;
    const status = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate < 500
      ? candidate : 500;
    if (status === 500) {
      try { reportError(error); }
      catch { console.error('HTTP error reporting failed.'); }
    }
    const message = status === 404 ? 'Not found'
      : status === 500 ? 'Internal server error'
      : STATUS_CODES[status] ?? 'Bad Request';
    response.status(status).json({ error: message });
  };
}

export function createHttpApp(options: {
  health: HealthResponse;
  clientDirectory?: string;
  reportError?: HttpErrorReporter;
  publicInvitation?: (host: string | undefined) => string | undefined;
  bootstrap?: (origin: string | undefined, host: string | undefined, key: string | undefined) => string | undefined;
}) {
  const app = express();
  const notFound: RequestHandler = (_request, response) => {
    response.status(404).json({ error: 'Not found' });
  };
  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(options.health);
  });
  if (options.bootstrap) app.post('/api/organizer-bootstrap', (request, response) => {
    response.set('Cache-Control', 'no-store');
    const code = options.bootstrap?.(request.get('origin'), request.get('host'), request.get('x-pomekhi-bootstrap'));
    if (!code) { response.status(403).json({ error: 'Bootstrap unavailable' }); return; }
    response.json({ code });
  });
  if (options.publicInvitation) app.get('/api/public-invitation', (request, response) => {
    response.set('Cache-Control', 'no-store');
    const origin = options.publicInvitation?.(request.get('host'));
    if (origin) response.json({ origin });
    else response.status(204).end();
  });
  app.use('/api', notFound);
  const clientDirectory = options.clientDirectory;
  if (clientDirectory) {
    app.use(express.static(clientDirectory));
    app.get('/', (_request, response) => {
      response.sendFile(join(clientDirectory, 'index.html'));
    });
  }
  app.use(notFound);
  app.use(createHttpErrorHandler(options.reportError));
  return app;
}
