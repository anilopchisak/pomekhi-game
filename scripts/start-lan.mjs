import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { checkNode, nodePath, projectRoot, toolEnvironment } from './runtime.mjs';
checkNode();
if (!existsSync(join(projectRoot, 'dist/server/index.js')) || !existsSync(join(projectRoot, 'dist/client/index.html'))) {
  throw new Error('Production build is missing. Run npm run build first.');
}
const child = spawn(nodePath(), ['--env-file-if-exists=.env', 'dist/server/index.js'], {
  cwd: projectRoot, env: { ...toolEnvironment({ NODE_ENV: 'production' }), HOST: '0.0.0.0' }, stdio: 'inherit',
});
child.on('error', () => { console.error('Could not start the LAN server. Run npm run build first.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
