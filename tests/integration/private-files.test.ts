import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from 'vite';

it('denies server sources and builds through Vite, including raw requests', async () => {
  const vite = await createServer({ logLevel: 'silent', server: { port: 0, open: false } });
  try {
    await vite.listen();
    const address = vite.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No Vite address');
    for (const path of ['src/server/lobby.ts', 'dist/server/lobby.js', 'src/server/cards.ts', 'dist/server/cards.js', '.env.example', '.npmrc', '.agentkit.json']) {
      for (const query of ['', '?raw']) {
        const response = await fetch(`http://127.0.0.1:${address.port}/@fs/${resolve(path)}${query}`);
        expect(response.status, `${path}${query}`).toBe(403);
      }
    }
  } finally { await vite.close(); }
});
