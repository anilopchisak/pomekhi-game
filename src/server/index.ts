import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createOrganizerBootstrap } from './organizer-bootstrap.js';
import { getServerConfig } from './config.js';
import { createServerRuntime } from './runtime.js';
import { generateOrganizerCode } from './lobby.js';
import { createFileSessionStore } from './session-store.js';

async function main() {
  const config = getServerConfig(process.env);
  const clientDirectory = process.env.NODE_ENV === 'production'
    ? fileURLToPath(new URL('../client', import.meta.url)) : undefined;
  if (clientDirectory && !existsSync(fileURLToPath(new URL('../client/index.html', import.meta.url)))) {
    throw new Error('Client build is missing. Run npm run build before npm start.');
  }
  const organizerCode = generateOrganizerCode();
  const key = process.connected && clientDirectory ? process.env.POMEKHI_BOOTSTRAP_KEY : undefined;
  let redeem: ReturnType<typeof createOrganizerBootstrap>;
  const bootstrap = key ? (...args: Parameters<NonNullable<typeof redeem>>) => redeem?.(...args) : undefined;
  let panelHost: string | undefined;
  let tunnelOrigin: string | undefined;
  function receivePublicOrigin(message: unknown) {
    const input = message as { type?: string; origin?: unknown } | null;
    if (input?.type !== 'pomekhi:public-origin' || typeof input.origin !== 'string') return;
    if (/^https:\/\/(?:[a-z0-9-]+\.)+tuna\.am$/i.test(input.origin)) tunnelOrigin = input.origin;
  }
  if (key) process.on('message', receivePublicOrigin);
  const publicInvitation = key ? (host: string | undefined) => host && host === panelHost ? tunnelOrigin : undefined : undefined;
  delete process.env.POMEKHI_BOOTSTRAP_KEY;
  const sessionStore = createFileSessionStore(resolve('data'), true);
  const runtime = createServerRuntime({ config, clientDirectory, organizerCode, bootstrap, publicInvitation, sessionStore, firstGame: true, onError: () => {
    console.error('Pomekhi server encountered a transport error.');
    process.exitCode = 1;
    stopServer();
  } });
  let stopping = false;
  let shutdown: Promise<void> | undefined;
  function removeSignals() {
    process.off('SIGINT', stopServer);
    process.off('SIGTERM', stopServer);
    process.off('message', receivePublicOrigin);
  }
  function stopServer() {
    if (shutdown) return;
    stopping = true;
    console.log('Stopping Pomekhi server...');
    shutdown = runtime.stop().then(() => {
      console.log('Pomekhi server stopped.');
    }, () => {
      console.error('Pomekhi server could not stop gracefully; remaining connections were closed.');
      process.exitCode = 1;
    }).finally(removeSignals);
  }
  process.on('SIGINT', stopServer);
  process.on('SIGTERM', stopServer);
  try {
    const address = await runtime.start();
    if (!stopping) {
      if (key) {
        redeem = createOrganizerBootstrap(key, address.origin, organizerCode);
        if (redeem) panelHost = new URL(address.origin).host;
      }
      console.log(`Pomekhi foundation: ${address.origin}`);
      const panelOrigin = clientDirectory ? address.origin : 'http://localhost:5173';
      if (config.host === '0.0.0.0' || config.host === '::') for (const entries of Object.values(networkInterfaces())) for (const entry of entries ?? []) if (!entry.internal && entry.family === 'IPv4') console.log(`Local player address: http://${entry.address}:${address.port}`);
      console.log(`Organizer panel: ${panelOrigin}/?screen=host`);
      console.log(`Organizer code (keep private): ${organizerCode}`);
      if (process.connected) process.send?.({ type: 'pomekhi:ready', port: address.port, origin: address.origin });
    }
  } catch (error) {
    removeSignals();
    if (!(stopping && error instanceof Error && error.name === 'AbortError')) throw error;
  }
}

void main().catch(() => {
  console.error('Cannot start the server. Check HOST, PORT, the client build, write access to data, another running instance and whether the port is already in use.');
  process.exitCode = 1;
});
