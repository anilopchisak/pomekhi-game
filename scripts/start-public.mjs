import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { checkNode, nodePath, projectRoot, toolEnvironment } from './runtime.mjs';
import { openOrganizer } from './open-organizer.mjs';
import { publicTunnelOrigin, tunaLaunch } from './tuna.mjs';

checkNode();
if (!existsSync(join(projectRoot, 'dist/server/index.js')) || !existsSync(join(projectRoot, 'dist/client/index.html'))) {
  throw new Error('Production build is missing. Run npm run build first.');
}
const launch = tunaLaunch();
const bootstrapKey = randomBytes(32).toString('hex');
const children = [];
let stopping = false;
let tunnelStarted = false;
let startupTimer;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  clearTimeout(startupTimer);
  for (const child of children) {
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  const forceStop = setTimeout(() => {
    for (const child of children) {
      if (child.pid && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 3000);
  forceStop.unref();
}

function own(child, label) {
  children.push(child);
  child.on('error', () => {
    console.error(`Cannot start ${label}. Check the installation and README.md.`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    if (code !== 0 && !signal) console.error(`${label} stopped; the public session is closing.`);
    stop(code ?? (signal ? 0 : 1));
  });
  return child;
}

const server = own(spawn(nodePath(), ['--env-file-if-exists=.env', 'dist/server/index.js'], {
  cwd: projectRoot,
  env: toolEnvironment({ NODE_ENV: 'production', POMEKHI_BOOTSTRAP_KEY: bootstrapKey }),
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
}), 'the local server');

startupTimer = setTimeout(() => {
  console.error('The local server did not become ready. No tunnel was opened.');
  stop(1);
}, 10000);

server.on('message', message => {
  if (stopping || tunnelStarted || message?.type !== 'pomekhi:ready' || message.port !== launch.port) return;
  tunnelStarted = true;
  clearTimeout(startupTimer);
  console.log('Local server ready. Starting Tuna...');
  openOrganizer(launch.origin, bootstrapKey, { waitForTunnel: true });
  const tunnel = own(spawn(launch.executable, [...launch.args.filter(arg => arg !== '--qr'), '--log=stdout', '--log-format=text'], {
    cwd: projectRoot, env: toolEnvironment({ TUNA_TUI: '0' }), stdio: ['ignore', 'pipe', 'pipe'],
  }), 'Tuna');
  let addressFound = false;
  startupTimer = setTimeout(() => {
    if (!addressFound) console.log('Still waiting for the Tuna address. The local organizer panel can already be used.');
  }, 15000);
  for (const [input, output] of [[tunnel.stdout, process.stdout], [tunnel.stderr, process.stderr]]) {
    const lines = createInterface({ input, crlfDelay: Infinity });
    lines.on('line', line => {
      output.write(line + '\n');
      if (addressFound || stopping) return;
      const publicOrigin = publicTunnelOrigin(line);
      if (!publicOrigin) return;
      addressFound = true;
      clearTimeout(startupTimer);
      server.send({ type: 'pomekhi:public-origin', origin: publicOrigin }, error => {
        if (error && !stopping) console.error('Could not send the Tuna address to the panel. Copy it from the terminal.');
      });
    });
  }
});

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
