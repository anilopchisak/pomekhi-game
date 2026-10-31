import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { get } from 'node:http';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

function launch(port: string, fixture?: string, development = false) {
  const preload = fixture ? ['--import', fileURLToPath(new URL(`./fixtures/${fixture}`, import.meta.url))] : [];
  const entry = development ? ['--import', 'tsx', 'src/server/index.ts'] : ['dist/server/index.js'];
  const child = spawn(process.execPath, [...preload, ...entry], {
    env: { ...process.env, NODE_ENV: development ? 'development' : 'production', HOST: '127.0.0.1', PORT: port },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages: unknown[] = [];
  const output = { stdout: '', stderr: '' };
  child.stdout!.on('data', chunk => { output.stdout += String(chunk); });
  child.stderr!.on('data', chunk => { output.stderr += String(chunk); });
  child.on('message', message => { messages.push(message); });
  const exited = once(child, 'exit');
  return { child, messages, output, exited };
}

function messageOfType(child: ChildProcess, type: string): Promise<{ type: string; port: number }> {
  return new Promise((resolve, reject) => {
    function cleanup() { child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); }
    function onMessage(message: unknown) {
      if (message && typeof message === 'object' && 'type' in message && message.type === type) {
        cleanup();
        resolve(message as { type: string; port: number });
      }
    }
    function onExit() { cleanup(); reject(new Error(`Server exited before ${type}.`)); }
    function onError(error: Error) { cleanup(); reject(error); }
    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function dispose(child: ChildProcess, exited: Promise<unknown>) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await exited;
}

it.skipIf(process.platform === 'win32')('runs the development TypeScript entry and stops normally', async () => {
  const run = launch('0', undefined, true);
  try {
    const ready = await messageOfType(run.child, 'pomekhi:ready');
    const response = await fetch(`http://127.0.0.1:${ready.port}/api/health`);
    expect(await response.json()).toEqual({ app: 'pomekhi', status: 'ok', stage: 'foundation' });
    run.child.kill('SIGTERM');
    expect(await run.exited).toEqual([0, null]);
    expect(run.output.stderr).toBe('');
  } finally { await dispose(run.child, run.exited); }
});

it.skipIf(process.platform === 'win32')('cancels process startup without publishing late readiness', async () => {
  const run = launch('0', 'delayed-listen.mjs');
  try {
    await messageOfType(run.child, 'test:listen-pending');
    run.child.kill('SIGTERM');
    const [code, signal] = await run.exited;
    expect(code).toBe(0);
    expect(signal).toBeNull();
    expect(run.messages.some(message => (message as { type?: string }).type === 'pomekhi:ready')).toBe(false);
    expect(run.output.stdout).toContain('Pomekhi server stopped.');
    expect(run.output.stderr).toBe('');
  } finally { await dispose(run.child, run.exited); }
});

it('fails cleanly on an occupied port without announcing readiness', async () => {
  const blocker = createServer();
  await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve));
  const address = blocker.address();
  if (!address || typeof address === 'string') throw new Error('No blocking port.');
  const run = launch(String(address.port));
  try {
    const [code] = await run.exited;
    expect(code).toBe(1);
    expect(blocker.listening).toBe(true);
    expect(run.messages).toEqual([]);
    expect(run.output.stderr).toContain('Cannot start the server.');
  } finally {
    await dispose(run.child, run.exited);
    await new Promise<void>(resolve => blocker.close(() => resolve()));
  }
});

it('reports invalid configuration without echoing its raw value', async () => {
  const secret = 'invalid-private-config-value';
  const run = launch(secret);
  try {
    const [code] = await run.exited;
    expect(code).toBe(1);
    expect(run.messages).toEqual([]);
    expect(run.output.stderr).toContain('Check HOST, PORT');
    expect(run.output.stderr).not.toContain(secret);
  } finally { await dispose(run.child, run.exited); }
});

it('bounds cleanup after a post-start server error without exposing its details', async () => {
  const run = launch('0', 'server-error.mjs');
  let request: ReturnType<typeof get> | undefined;
  try {
    const ready = await messageOfType(run.child, 'pomekhi:ready');
    expect((await fetch(`http://127.0.0.1:${ready.port}/api/health`)).status).toBe(200);
    const pending = messageOfType(run.child, 'test:request-pending');
    request = get(`http://127.0.0.1:${ready.port}/test-server-error`);
    const failed = new Promise<Error>(resolve => request!.once('error', resolve));
    await pending;
    const started = Date.now();
    run.child.send('test:server-error');
    expect(await run.exited).toEqual([1, null]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
    expect(Date.now() - started).toBeLessThan(3000);
    expect((await failed).message).toMatch(/socket hang up|reset/i);
    expect(run.output.stderr).toContain('Pomekhi server encountered a transport error.');
    expect(run.output.stderr).toContain('could not stop gracefully');
    expect(run.output.stderr).not.toContain('private-transport-error-details');
    expect(run.output.stderr).not.toContain('Cannot start the server.');
    expect(run.output.stdout.match(/Stopping Pomekhi server/g)).toHaveLength(1);
    const reservation = createServer();
    try { await new Promise<void>((resolve, reject) => {
      reservation.once('error', reject);
      reservation.listen(ready.port, '127.0.0.1', resolve);
    }); }
    finally { await new Promise<void>(resolve => reservation.close(() => resolve())); }
  } finally { request?.destroy(); await dispose(run.child, run.exited); }
});

it.skipIf(process.platform === 'win32')('exits with code 1 and releases the port after a two-second forced stop', async () => {
  const run = launch('0', 'pending-request.mjs');
  let request: ReturnType<typeof get> | undefined;
  try {
    const ready = await messageOfType(run.child, 'pomekhi:ready');
    const pending = messageOfType(run.child, 'test:request-pending');
    request = get(`http://127.0.0.1:${ready.port}/test-pending-stop`);
    const failed = new Promise<Error>(resolve => request!.once('error', resolve));
    await pending;
    const started = Date.now();
    run.child.kill('SIGTERM');
    const [code, signal] = await run.exited;
    expect(code).toBe(1);
    expect(signal).toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
    expect(Date.now() - started).toBeLessThan(3000);
    expect((await failed).message).toMatch(/socket hang up|reset/i);
    expect(run.output.stderr).toContain('could not stop gracefully');
    const reservation = createServer();
    try { await new Promise<void>((resolve, reject) => {
      reservation.once('error', reject);
      reservation.listen(ready.port, '127.0.0.1', resolve);
    }); }
    finally { await new Promise<void>(resolve => reservation.close(() => resolve())); }
  } finally { request?.destroy(); await dispose(run.child, run.exited); }
});
