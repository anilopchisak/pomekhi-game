import { spawn } from 'node:child_process';
import { checkNode, nodePath, projectRoot, toolEnvironment } from './runtime.mjs';

checkNode();
const definitions = [
  ['--env-file-if-exists=.env', '--import', 'tsx', '--watch', 'src/server/index.ts'],
  ['node_modules/vite/bin/vite.js'],
];
let stopping = false;
const children = definitions.map(argumentsForNode => spawn(nodePath(), argumentsForNode, {
  cwd: projectRoot, env: toolEnvironment({ NODE_ENV: 'development' }),
  stdio: 'inherit', detached: process.platform !== 'win32',
}));

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
