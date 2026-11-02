import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../..', import.meta.url)) });

describe('production import restrictions', () => {
  const cases = [
    ['ritual cannot import transport', 'src/server/ritual.ts', "import './transport/socket.js';", true],
    ['ritual cannot read disk', 'src/server/ritual.ts', "import 'node:fs/promises';", true],
    ['browser cannot import prophecies', 'src/client/app/main.tsx', "import '../../server/prophecies.js';", true],
    ['round inbox cannot import transport', 'src/server/round-sync.ts', "import './transport/socket.js';", true],
    ['round inbox cannot read disk', 'src/server/round-sync.ts', "import 'node:fs/promises';", true],
    ['search cannot import transport', 'src/server/search.ts', "import './transport/socket.js';", true],
    ['game cannot import transport', 'src/server/game.ts', "import './transport/socket.js';", true],
    ['game cannot import runtime', 'src/server/game.ts', "export { createServerRuntime } from './runtime.js';", true],
    ['game can compose dealing', 'src/server/game.ts', "export { createDealing } from './dealing.js';", false],
    ['dealing cannot import transport', 'src/server/dealing.ts', "import './transport/socket.js';", true],
    ['card bank cannot import bootstrap', 'src/server/cards.ts', "import './index.js';", true],
    ['browser cannot import the card bank', 'src/client/pages/player/ui/PlayerPage.tsx', "import '../../../../server/cards.js';", true],
    ['protocol cannot import the card bank', 'src/shared/protocol.ts', "import '../server/cards.js';", true],
    ['dealing can import the server card bank', 'src/server/dealing.ts', "import './cards.js';", false],
    ['App imports the page interface', 'src/client/app/main.tsx', "export { PlayerPage } from '../pages/player/index.js';", false],
    ['App cannot import page internals', 'src/client/app/main.tsx', "export { PlayerPage } from '../pages/player/ui/PlayerPage.js';", true],
    ['App cannot re-export page internals', 'src/client/app/main.tsx', "export * from '../pages/player/ui/PlayerPage.js';", true],
    ['page index exposes its own implementation', 'src/client/pages/player/index.ts', "export { PlayerPage } from './ui/PlayerPage.js';", false],
    ['page imports neutral contract types', 'src/client/pages/player/ui/PlayerPage.tsx', "export type { ServerToClientEvents } from '../../../../shared/protocol.js';", false],
    ['page imports its local styles', 'src/client/pages/player/ui/PlayerPage.tsx', "import './PlayerPage.module.css';", false],
    ['page cannot import App', 'src/client/pages/player/ui/PlayerPage.tsx', "export * from '../../../app/main.js';", true],
    ['page cannot import server code', 'src/client/pages/player/ui/PlayerPage.tsx', "export { createAppServer } from '../../../../server/app.js';", true],
    ['App keeps the client-to-server restriction', 'src/client/app/main.tsx', "export { createAppServer } from '../../server/app.js';", true],
    ['page keeps Node prefix restrictions', 'src/client/pages/player/ui/PlayerPage.tsx', "export { readFile } from 'node:fs/promises';", true],
    ['client rejects unprefixed Node subpaths', 'src/client/app/main.tsx', "export { readFile } from 'fs/promises';", true],
    ['client rejects unprefixed Node modules', 'src/client/app/main.tsx', "export { createServer } from 'http';", true],
    ['client can use its transport library', 'src/client/pages/player/ui/PlayerPage.tsx', "export { io } from 'socket.io-client';", false],
    ['server can use Node modules', 'src/server/app.ts', "export { createServer } from 'node:http';", false],
    ['server can use neutral contracts', 'src/server/app.ts', "export type { HealthResponse } from '../shared/protocol.js';", false],
    ['server cannot import the browser', 'src/server/app.ts', "export { PlayerPage } from '../client/pages/player/index.js';", true],
    ['contracts cannot import browser code', 'src/shared/protocol.ts', "export { PlayerPage } from '../client/pages/player/index.js';", true],
    ['contracts cannot import server types', 'src/shared/protocol.ts', "export type { ServerConfig } from '../server/config.js';", true],
    ['contracts stay independent of Node', 'src/shared/protocol.ts', "export { createServer } from 'node:http';", true],
    ['integration tests may compose runtimes', 'tests/integration/server.test.ts', "export { createAppServer } from '../../src/server/app.js';", false],
    ['HTTP transport cannot import assembly', 'src/server/transport/http.ts', "import '../app.js';", true],
    ['socket transport cannot import runtime', 'src/server/transport/socket.ts', "export { createServerRuntime } from '../runtime.js';", true],
    ['transport cannot import process bootstrap', 'src/server/transport/http.ts', "import '../index.js';", true],
    ['transport retains browser restrictions', 'src/server/transport/socket.ts', "import '../../client/app/main.js';", true],
    ['transport can use Node types', 'src/server/transport/socket.ts', "export type { Server } from 'node:http';", false],
    ['Shared cannot import a page', 'src/client/shared/api/connection.ts', "import '../../pages/player/index.js';", true],
    ['Shared cannot import App', 'src/client/shared/ui/screen.tsx', "import '../../app/main.js';", true],
    ['page cannot import another page', 'src/client/pages/host/ui/HostPage.tsx', "import '../../player/index.js';", true],
    ['page can use Shared public API', 'src/client/pages/player/ui/PlayerPage.tsx', "export { useLobbyConnection } from '../../../shared/api/index.js';", false],
    ['page cannot use Shared internals', 'src/client/pages/player/ui/PlayerPage.tsx', "export { useLobbyConnection } from '../../../shared/api/useLobbyConnection.js';", true],
    ['lobby cannot import transport', 'src/server/lobby.ts', "import './transport/socket.js';", true],
    ['lobby cannot import Socket.IO', 'src/server/lobby.ts', "import 'socket.io';", true],
    ['game cannot import persistence coordinator', 'src/server/game.ts', "import './session.js';", true],
    ['lobby cannot read disk', 'src/server/lobby.ts', "export { readFile } from 'node:fs/promises';", true],
    ['client cannot import private save format', 'src/client/app/main.tsx', "export type { SavedSession } from '../../server/session-format.js';", true],
    ['lobby can generate credentials', 'src/server/lobby.ts', "export { randomUUID } from 'node:crypto';", false],
    ['transport can import lobby interface', 'src/server/transport/socket.ts', "export type { Lobby } from '../lobby.js';", false],
    ['transport can use shared contracts', 'src/server/transport/http.ts', "export type { HealthResponse } from '../../shared/protocol.js';", false],
  ];

  it.each(cases)('%s', async (_name, filePath, source, restricted) => {
    const [result] = await eslint.lintText(source, { filePath });
    expect(result.fatalErrorCount).toBe(0);
    expect(result.messages.filter(message => message.ruleId === 'no-restricted-imports'))
      .toHaveLength(restricted ? 1 : 0);
    expect(result.messages.filter(message => message.ruleId !== 'no-restricted-imports')).toEqual([]);
  });
});
