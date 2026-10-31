import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkNode, projectRoot, pythonDirectory, toolEnvironment } from './runtime.mjs';

checkNode();
const python = join(pythonDirectory, process.platform === 'win32' ? 'python.exe' : 'python');
if (!existsSync(python)) throw new Error('Create the isolated .agent-runtime first. See docs/agent/graphify.md.');
const result = spawnSync(python, ['-B', join(projectRoot, 'tools/agentkit/agent.py'), ...process.argv.slice(2)], {
  cwd: projectRoot, env: toolEnvironment({ PYTHONDONTWRITEBYTECODE: '1' }), stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
