import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { checkNode, nodePath, projectRoot, toolEnvironment } from './runtime.mjs';
import { tunaLaunch } from './tuna.mjs';

checkNode();
if (!existsSync(join(projectRoot, 'dist/server/index.js')) || !existsSync(join(projectRoot, 'dist/client/index.html'))) {
  throw new Error('Production build is missing. Run npm run build first.');
}
const launch = tunaLaunch();
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
  env: toolEnvironment({ NODE_ENV: 'production' }),
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
  console.log('Local server ready. Starting Tuna; share its HTTPS address with players.');
  own(spawn(launch.executable, launch.args, {
    cwd: projectRoot, env: toolEnvironment(), stdio: 'inherit',
  }), 'Tuna');
});

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
