import { once } from 'node:events';
import { get } from 'node:http';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { expect, it } from 'vitest';
import { io } from 'socket.io-client';
import type { HealthResponse } from '../../src/shared/protocol.js';
import { createAppServer } from '../../src/server/app.js';
import { createServerRuntime } from '../../src/server/runtime.js';

async function listen(server: Server, port = 0) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP test address.');
  return address.port;
}
async function assertPortReleased(port: number) {
  const reservation = createServer();
  try { await listen(reservation, port); }
  finally { await new Promise<void>(resolve => reservation.close(() => resolve())); }
}

it('starts once, returns the actual origin, disconnects clients and stops once', async () => {
  const signals = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  const runtime = createServerRuntime({ config: { host: '127.0.0.1', port: 0 } });
  const start = runtime.start();
  expect(runtime.start()).toBe(start);
  const address = await start;
  const socket = io(address.origin, { autoConnect: false, transports: ['websocket'], reconnection: false });
  try {
    expect(runtime.start()).toBe(start);
    expect(address.origin).toBe(`http://127.0.0.1:${address.port}`);
    expect((await fetch(address.origin + '/api/health')).status).toBe(200);
    const ready = new Promise<HealthResponse>((resolve, reject) => {
      socket.once('server:ready', resolve);
      socket.once('connect_error', reject);
    });
    socket.connect();
    expect(await ready).toEqual({ app: 'pomekhi', status: 'ok', stage: 'foundation' });
    const disconnected = new Promise<string>(resolve => socket.once('disconnect', resolve));
    const stop = runtime.stop();
    expect(runtime.stop()).toBe(stop);
    await stop;
    await disconnected;
    await assertPortReleased(address.port);
    await expect(runtime.start()).rejects.toMatchObject({ name: 'AbortError' });
    expect(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal))).toEqual(signals);
  } finally { socket.disconnect(); await runtime.stop(); }
});

it('allows stopping before starting without opening a port', async () => {
  const runtime = createServerRuntime({ config: { host: '127.0.0.1', port: 0 } });
  const stop = runtime.stop();
  expect(runtime.stop()).toBe(stop);
  await stop;
  await expect(runtime.start()).rejects.toMatchObject({ name: 'AbortError' });
});

it.each(['127.0.0.1', 'localhost'])('cancels startup for %s and does not bind later', async host => {
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const runtime = createServerRuntime({ config: { host, port } });
  const start = runtime.start();
  const rejected = expect(start).rejects.toMatchObject({ name: 'AbortError' });
  try {
    await runtime.stop();
    await rejected;
    await assertPortReleased(port);
  } finally { await runtime.stop(); }
});

it('cleans up after an occupied port fails without closing the other server', async () => {
  const blocker = createServer();
  const port = await listen(blocker);
  const runtime = createServerRuntime({ config: { host: '127.0.0.1', port } });
  try {
    await expect(runtime.start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(blocker.listening).toBe(true);
    await runtime.stop();
    await expect(runtime.start()).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    await runtime.stop();
    await new Promise<void>(resolve => blocker.close(() => resolve()));
  }
  await assertPortReleased(port);
});

it('cleans up when listen throws synchronously', async () => {
  const runtime = createServerRuntime({ config: { host: '127.0.0.1', port: -1 } });
  await expect(runtime.start()).rejects.toMatchObject({ code: 'ERR_SOCKET_BAD_PORT' });
  await runtime.stop();
});

it('cancels while a bind failure is still pending without an unhandled server error', async () => {
  const blocker = createServer();
  const port = await listen(blocker);
  const runtime = createServerRuntime({ config: { host: '127.0.0.1', port } });
  const start = runtime.start();
  const rejected = expect(start).rejects.toMatchObject({ name: 'AbortError' });
  try {
    await runtime.stop();
    await rejected;
    expect(blocker.listening).toBe(true);
  } finally {
    await runtime.stop();
    await new Promise<void>(resolve => blocker.close(() => resolve()));
  }
});

it('keeps separate runtime instances independent', async () => {
  const first = createServerRuntime({ config: { host: '127.0.0.1', port: 0 } });
  const second = createServerRuntime({ config: { host: '127.0.0.1', port: 0 } });
  try {
    const [a, b] = await Promise.all([first.start(), second.start()]);
    expect(a.port).not.toBe(b.port);
    await first.stop();
    expect((await fetch(b.origin + '/api/health')).status).toBe(200);
  } finally { await Promise.all([first.stop(), second.stop()]); }
});

it('forces an unfinished HTTP request closed at its configured deadline', async () => {
  const app = createAppServer({ shutdownTimeoutMs: 50 });
  // Keep a real request pending without adding a diagnostic production route.
  app.server.removeAllListeners('request');
  const received = new Promise<void>(resolve => app.server.on('request', () => resolve()));
  const port = await listen(app.server);
  const request = get(`http://127.0.0.1:${port}/`);
  const failed = new Promise<Error>(resolve => request.once('error', resolve));
  const closed = once(app.server, 'close');
  try {
    await received;
    const started = Date.now();
    const closing = app.close();
    expect(app.close()).toBe(closing);
    await expect(closing).rejects.toThrow('Server shutdown exceeded 50ms');
    expect(Date.now() - started).toBeLessThan(1000);
    await closed;
    expect((await failed).message).toMatch(/socket hang up|reset/i);
    await assertPortReleased(port);
  } finally { request.destroy(); await app.close().catch(() => {}); }
});
