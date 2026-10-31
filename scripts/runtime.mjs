import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const pythonDirectory = join(projectRoot, '.agent-runtime', process.platform === 'win32' ? 'Scripts' : 'bin');

export function nodePath() {
  const local = join(projectRoot, '.runtime', 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  return existsSync(local) ? local : process.execPath;
}

export function toolEnvironment(extra = {}) {
  return {
    ...process.env,
    PATH: [dirname(nodePath()), pythonDirectory, process.env.PATH ?? ''].join(delimiter),
    npm_config_cache: join(projectRoot, '.cache', 'npm'),
    ...extra,
  };
}

export function checkNode() {
  const expected = readFileSync(join(projectRoot, '.nvmrc'), 'utf8').trim();
  const result = spawnSync(nodePath(), ['--version'], { encoding: 'utf8' });
  const actual = result.stdout?.trim().replace(/^v/, '');
  if (result.status !== 0 || actual !== expected) {
    throw new Error(`Expected Node.js ${expected}; found ${actual ?? 'no runtime'}. Install the version in .nvmrc. See README.md.`);
  }
}

export function npmCli() {
  const executableDirectory = dirname(nodePath());
  const candidates = [
    process.env.npm_execpath,
    join(executableDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
    join(executableDirectory, 'node_modules/npm/bin/npm-cli.js'),
  ];
  const selected = candidates.find(path => path && existsSync(path));
  if (!selected) throw new Error('Bundled npm was not found. Install the official Node.js distribution.');
  return selected;
}

export function runNpm(script, argumentsAfterSeparator = []) {
  checkNode();
  const result = spawnSync(nodePath(), [npmCli(), 'run', script, ...(argumentsAfterSeparator.length ? ['--', ...argumentsAfterSeparator] : [])], {
    cwd: projectRoot,
    env: toolEnvironment(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
