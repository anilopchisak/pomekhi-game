import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkNode, nodePath, npmCli, projectRoot, pythonDirectory, toolEnvironment } from './runtime.mjs';

checkNode();
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const npm = spawnSync(nodePath(), [npmCli(), '--version'], { encoding: 'utf8', env: toolEnvironment() });
if (npm.status !== 0 || npm.stdout.trim() !== pkg.engines.npm) {
  throw new Error(`Expected bundled npm ${pkg.engines.npm}. Use the Node.js version in .nvmrc.`);
}
console.log(`PASS Node.js ${pkg.engines.node}, npm ${npm.stdout.trim()}`);
const python = join(pythonDirectory, process.platform === 'win32' ? 'python.exe' : 'python');
if (existsSync(python)) {
  const result = spawnSync(python, ['-c', 'import sys,importlib.metadata; assert sys.version_info >= (3,10); assert importlib.metadata.version("graphifyy")=="0.9.55"; print(sys.version.split()[0])'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Graphify environment is incompatible. Recreate .agent-runtime using docs/agent/graphify.md.');
  console.log(`PASS isolated Python ${result.stdout.trim()}, Graphify 0.9.55`);
} else {
  console.log('INFO Graphify environment is not installed. Full agent checks require docs/agent/graphify.md.');
}
