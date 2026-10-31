import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpErrorHandler } from '../../src/server/transport/http.js';
import { createAppServer } from '../../src/server/app.js';

describe('HTTP error policy through real Express requests', () => {
  const reportError = vi.fn();
  const secret = 'private-card-and-credential-must-stay-out-of-responses';
  const failure = new Error(secret);
  const forwarded = vi.fn();
  const app = express();
  app.get('/sync', () => { throw failure; });
  app.get('/async', async () => { throw failure; });
  app.get('/status/:value', (request, _response, next) => {
    next(Object.assign(new Error(secret), { status: Number(request.params.value) }));
  });
  app.get('/status-code', (_request, _response, next) => {
    next({ statusCode: 403, message: secret });
  });
  app.get('/invalid-status', (_request, _response, next) => {
    next({ status: '401', message: secret });
  });
  app.get('/partial', (_request, response, next) => {
    response.write('partial:');
    next(failure);
  });
  app.use(createHttpErrorHandler(reportError));
  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    forwarded(error);
    if (response.headersSent) response.end('delegated');
    else next(error);
  });
  const server = createServer(app);
  let origin: string;
  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test server address.');
    origin = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(() => { reportError.mockClear(); forwarded.mockClear(); });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it.each(['/sync', '/async'])('normalizes an unexpected %s failure without exposing details', async path => {
    const response = await fetch(origin + path);
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it.each([[400, 'Bad Request'], [401, 'Unauthorized'], [404, 'Not found'], [429, 'Too Many Requests']])(
    'keeps status %s and returns a standard message', async (status, message) => {
      const response = await fetch(`${origin}/status/${status}`);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: message });
      expect(reportError).not.toHaveBeenCalled();
    },
  );

  it('accepts a valid statusCode without echoing its message', async () => {
    const response = await fetch(origin + '/status-code');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it.each(['/status/302', '/status/503', '/status/NaN', '/invalid-status'])('normalizes invalid or server status from %s', async path => {
    const response = await fetch(origin + path);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('delegates an error after headers have been sent', async () => {
    const response = await fetch(origin + '/partial');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('partial:delegated');
    expect(forwarded).toHaveBeenCalledExactlyOnceWith(failure);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('keeps a missing production entry a safe JSON 404 through the assembled application', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pomekhi-empty-client-'));
    const assembled = createAppServer({ clientDirectory: directory, reportError });
    try {
      await new Promise<void>(resolve => assembled.server.listen(0, '127.0.0.1', resolve));
      const address = assembled.server.address();
      if (!address || typeof address === 'string') throw new Error('No assembled test address.');
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Not found' });
      expect(reportError).not.toHaveBeenCalled();
    } finally { await assembled.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('returns JSON even when the injected error reporter throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reportingApp = express();
    reportingApp.get('/', () => { throw failure; });
    reportingApp.use(createHttpErrorHandler(() => { throw new Error(secret); }));
    const reportingServer = createServer(reportingApp);
    try {
      await new Promise<void>(resolve => reportingServer.listen(0, '127.0.0.1', resolve));
      const address = reportingServer.address();
      if (!address || typeof address === 'string') throw new Error('No reporting test address.');
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
      expect(consoleError).toHaveBeenCalledExactlyOnceWith('HTTP error reporting failed.');
    } finally {
      await new Promise<void>(resolve => reportingServer.close(() => resolve()));
      consoleError.mockRestore();
    }
  });
});
