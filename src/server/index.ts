import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
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
  const sessionStore = createFileSessionStore(resolve('data'));
  const runtime = createServerRuntime({ config, clientDirectory, organizerCode, sessionStore, onError: () => {
    console.error('Pomekhi server encountered a transport error.');
    process.exitCode = 1;
    stopServer();
  } });
  let stopping = false;
  let shutdown: Promise<void> | undefined;
  function removeSignals() {
    process.off('SIGINT', stopServer);
    process.off('SIGTERM', stopServer);
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
      console.log(`Pomekhi foundation: ${address.origin}`);
      const panelOrigin = clientDirectory ? address.origin : 'http://localhost:5173';
      console.log(`Organizer panel: ${panelOrigin}/?screen=host`);
      console.log(`Organizer code (keep private): ${organizerCode}`);
      if (process.connected) process.send?.({ type: 'pomekhi:ready', port: address.port });
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
