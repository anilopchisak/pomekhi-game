import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../..', import.meta.url)) });

describe('production import restrictions', () => {
  const cases = [
    ['App imports the page interface', 'src/client/app/main.tsx', "export { FoundationPage } from '../pages/foundation/index.js';", false],
    ['App cannot import page internals', 'src/client/app/main.tsx', "export { FoundationPage } from '../pages/foundation/ui/FoundationPage.js';", true],
    ['App cannot re-export page internals', 'src/client/app/main.tsx', "export * from '../pages/foundation/ui/FoundationPage.js';", true],
    ['page index exposes its own implementation', 'src/client/pages/foundation/index.ts', "export { FoundationPage } from './ui/FoundationPage.js';", false],
    ['page imports neutral contract types', 'src/client/pages/foundation/ui/FoundationPage.tsx', "export type { ServerToClientEvents } from '../../../../shared/protocol.js';", false],
    ['page imports its local styles', 'src/client/pages/foundation/ui/FoundationPage.tsx', "import './FoundationPage.module.css';", false],
    ['page cannot import App', 'src/client/pages/foundation/ui/FoundationPage.tsx', "export * from '../../../app/main.js';", true],
    ['page cannot import server code', 'src/client/pages/foundation/ui/FoundationPage.tsx', "export { createAppServer } from '../../../../server/app.js';", true],
    ['App keeps the client-to-server restriction', 'src/client/app/main.tsx', "export { createAppServer } from '../../server/app.js';", true],
    ['page keeps Node prefix restrictions', 'src/client/pages/foundation/ui/FoundationPage.tsx', "export { readFile } from 'node:fs/promises';", true],
    ['client rejects unprefixed Node subpaths', 'src/client/app/main.tsx', "export { readFile } from 'fs/promises';", true],
    ['client rejects unprefixed Node modules', 'src/client/app/main.tsx', "export { createServer } from 'http';", true],
    ['client can use its transport library', 'src/client/pages/foundation/ui/FoundationPage.tsx', "export { io } from 'socket.io-client';", false],
    ['server can use Node modules', 'src/server/app.ts', "export { createServer } from 'node:http';", false],
    ['server can use neutral contracts', 'src/server/app.ts', "export type { HealthResponse } from '../shared/protocol.js';", false],
    ['server cannot import the browser', 'src/server/app.ts', "export { FoundationPage } from '../client/pages/foundation/index.js';", true],
    ['contracts cannot import browser code', 'src/shared/protocol.ts', "export { FoundationPage } from '../client/pages/foundation/index.js';", true],
    ['contracts cannot import server types', 'src/shared/protocol.ts', "export type { ServerConfig } from '../server/config.js';", true],
    ['contracts stay independent of Node', 'src/shared/protocol.ts', "export { createServer } from 'node:http';", true],
    ['integration tests may compose runtimes', 'tests/integration/server.test.ts', "export { createAppServer } from '../../src/server/app.js';", false],
  ];

  it.each(cases)('%s', async (_name, filePath, source, restricted) => {
    const [result] = await eslint.lintText(source, { filePath });
    expect(result.fatalErrorCount).toBe(0);
    expect(result.messages.filter(message => message.ruleId === 'no-restricted-imports'))
      .toHaveLength(restricted ? 1 : 0);
    expect(result.messages.filter(message => message.ruleId !== 'no-restricted-imports')).toEqual([]);
  });
});
