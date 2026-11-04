import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getServerConfig, getServerOrigin } from '../src/server/config.ts';
import { checkNode, projectRoot, toolEnvironment } from './runtime.mjs';

export function tunaExecutable(env = process.env, options = {}) {
  const root = options.root ?? projectRoot;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  if (env.TUNA_BIN?.trim()) return resolve(root, env.TUNA_BIN.trim());
  const local = join(root, '.runtime', 'tuna', platform === 'win32' ? 'tuna.exe' : 'tuna');
  return exists(local) ? local : 'tuna';
}

export function tunaLaunch(env = process.env) {
  const { host, port } = getServerConfig(env);
  if (port === 0) throw new Error('A Tuna tunnel requires a fixed positive PORT.');
  const origin = getServerOrigin({ host, port });
  const args = ['http', origin, '--inspect=false', '--qr', '--no-colors'];
  const subdomain = env.TUNA_SUBDOMAIN?.trim();
  if (subdomain) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdomain)) throw new Error('TUNA_SUBDOMAIN must be the assigned subdomain name, without a URL or spaces.');
    args.push('--subdomain', subdomain);
  }
  return {
    executable: tunaExecutable(env),
    args,
    origin,
    port,
  };
}

export function publicTunnelOrigin(line) {
  const candidate = /\bForwarding\s*:?\s+(https:\/\/(?:[a-z0-9-]+\.)+tuna\.am)\/?(?=\s|$)/i.exec(line)?.[1];
  if (candidate) return new URL(candidate).origin;
}

export async function requireLocalApp(origin) {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(3000) });
    const health = response.ok ? await response.json() : null;
    if (health?.app === 'pomekhi' && health.status === 'ok') return;
  } catch { /* Return a safe actionable status, not transport details. */ }
  throw new Error('Pomekhi is not ready locally. Start the application first, or use npm run start:public.');
}

async function main() {
  checkNode();
  const command = process.argv[2];
  let executable;
  let args;
  if (command === 'login') {
    executable = tunaExecutable();
    args = ['login', '--web', '--hostname', 'pomekhi-game'];
  } else if (command === 'http') {
    const launch = tunaLaunch();
    await requireLocalApp(launch.origin);
    ({ executable, args } = launch);
  } else {
    throw new Error('Use npm run tuna:login or npm run tunnel.');
  }
  const child = spawn(executable, args, { cwd: projectRoot, env: toolEnvironment(), stdio: 'inherit' });
  child.on('error', () => {
    console.error('Cannot start Tuna. Install its CLI or set TUNA_BIN. See README.md.');
    process.exitCode = 1;
  });
  child.on('exit', code => { process.exitCode = code ?? 0; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
