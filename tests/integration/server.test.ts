import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, HealthResponse, ServerToClientEvents } from '../../src/shared/protocol.js';
import { createAppServer } from '../../src/server/app.js';

describe('built client and actual HTTP / Socket.IO server', () => {
  const app = createAppServer({
    clientDirectory: fileURLToPath(new URL('../../dist/client', import.meta.url)),
  });
  let origin: string;
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      app.server.once('error', reject);
      app.server.listen(0, '127.0.0.1', resolve);
    });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No test server address.');
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await app.close(); });

  it('returns the shared health contract without claiming the game exists', async () => {
    const response = await fetch(`${origin}/api/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ app: 'pomekhi', status: 'ok', stage: 'foundation' });
  });

  it('serves the built entry and its actual JavaScript asset', async () => {
    const response = await fetch(origin);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<title>Помехи</title>');
    const asset = html.match(/src="([^"]+\.js)"/)?.[1];
    expect(asset).toBeDefined();
    const script = await fetch(new URL(asset!, origin));
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toMatch(/javascript/);
  });

  it('returns an API 404 rather than the HTML shell for unknown endpoints', async () => {
    const response = await fetch(`${origin}/api/rooms`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('delivers readiness to independent sockets and reconnects to the live server', async () => {
    async function connect(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
      const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(origin, {
        autoConnect: false, forceNew: true, reconnection: false,
      });
      const ready = new Promise<HealthResponse>((resolve, reject) => {
        socket.once('server:ready', resolve);
        socket.once('connect_error', reject);
      });
      socket.connect();
      try {
        expect(await ready).toEqual({ app: 'pomekhi', status: 'ok', stage: 'foundation' });
        return socket;
      } catch (error) {
        socket.disconnect();
        throw error;
      }
    }
    const first = await connect();
    const second = await connect();
    try { expect(first.id).not.toBe(second.id); }
    finally { first.disconnect(); second.disconnect(); }
    const reconnected = await connect();
    reconnected.disconnect();
  });

  it('announces readiness only after the production process actually listens', async () => {
    const child = spawn(process.execPath, ['dist/server/index.js'], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: '0', NODE_ENV: 'production' },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    try {
      const [message] = await once(child, 'message') as [{ type: string; port: number }];
      expect(message.type).toBe('pomekhi:ready');
      expect(message.port).toBeGreaterThan(0);
      expect((await fetch(`http://127.0.0.1:${message.port}/api/health`)).status).toBe(200);
    } finally {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  });

  it('closes its application process when the Tuna executable cannot start', async () => {
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const address = reservation.address();
    if (!address || typeof address === 'string') throw new Error('No reserved test port.');
    const port = address.port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const directory = await mkdtemp(join(tmpdir(), 'pomekhi-tuna-'));
    const child = spawn(process.execPath, ['scripts/start-public.mjs'], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TUNA_BIN: join(directory, 'missing-tuna') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.resume();
    try {
      const [code] = await once(child, 'exit');
      expect(output).toContain('Local server ready. Starting Tuna');
      expect(code).toBe(1);
      await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
      await rm(directory, { recursive: true, force: true });
    }
  });
});
