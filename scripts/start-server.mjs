import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkNode, nodePath, projectRoot, toolEnvironment } from './runtime.mjs';
import { openOrganizer } from './open-organizer.mjs';

export function selectLanAddress(interfaces, preferred) {
  const addresses = Object.values(interfaces).flatMap(entries => entries ?? []).filter(entry =>
    !entry.internal && entry.family === 'IPv4' && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(entry.address));
  return addresses.find(entry => entry.address === preferred)?.address ??
    addresses.find(entry => !entry.address.startsWith('169.254.'))?.address ?? addresses[0]?.address;
}

export function startLocal({ lan = false, createRoom = false } = {}) {
  checkNode();
  if (!existsSync(join(projectRoot, 'dist/server/index.js')) || !existsSync(join(projectRoot, 'dist/client/index.html'))) {
    throw new Error('Production build is missing. Run npm run build first.');
  }
  const key = process.env.POMEKHI_NO_BROWSER === '1' ? '' : randomBytes(32).toString('hex');
  const env = toolEnvironment({ NODE_ENV: 'production', POMEKHI_BOOTSTRAP_KEY: key });
  if (lan) env.HOST = '0.0.0.0';
  const child = spawn(nodePath(), ['--env-file-if-exists=.env', 'dist/server/index.js'], {
    cwd: projectRoot, env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });
  child.on('error', () => { console.error('Could not start the application server.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 0; });
  child.once('message', message => {
    if (!key || message?.type !== 'pomekhi:ready' || typeof message.origin !== 'string') return;
    const address = lan ? selectLanAddress(networkInterfaces(), process.env.POMEKHI_LAN_ADDRESS) : undefined;
    const invite = address ? `http://${address}:${message.port}` : '';
    if (lan && !invite) console.log('No LAN address was detected. Connect to a local network and configure the invitation in the panel.');
    openOrganizer(message.origin, key, { invite, local: lan, createRoom: createRoom && Boolean(invite) });
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) startLocal();
