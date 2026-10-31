import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot, pythonDirectory, toolEnvironment } from './runtime.mjs';

const python = join(pythonDirectory, process.platform === 'win32' ? 'python.exe' : 'python');
const result = spawnSync(python, ['-B', '-m', 'unittest', 'discover', '-s', 'tests/agentkit', '-v'], {
  cwd: projectRoot, env: toolEnvironment(), stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
