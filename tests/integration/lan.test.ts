import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it.skipIf(process.platform === 'win32')('launches the production LAN process with a loopback panel and releases its port on stop', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pomekhi-lan-'));
  const child = spawn(process.execPath, ['scripts/start-lan.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', POMEKHI_NO_BROWSER: '1', POMEKHI_TEST_DIRECTORY: directory,
      NODE_OPTIONS: `--import=${new URL('./fixtures/isolated-data.mjs', import.meta.url).href}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.resume();
  let output = '';
  const exited = once(child, 'exit');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const port = await new Promise<number>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('LAN launcher did not become ready.')), 5000);
      child.stdout.on('data', chunk => {
        output += String(chunk);
        const match = output.match(/Organizer panel: http:\/\/127\.0\.0\.1:(\d+)\/\?screen=host/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('LAN launcher stopped before readiness.')));
    });
    expect(await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).toMatchObject({ app: 'pomekhi', status: 'ok' });
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
    expect(output).not.toContain('Starting Tuna');
    child.kill('SIGTERM'); expect(await exited).toEqual([0, null]);
    await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
});
