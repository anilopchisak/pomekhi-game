import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createAppServer } from './app.js';
import { getServerConfig } from './config.js';

const config = getServerConfig(process.env);
const clientDirectory = process.env.NODE_ENV === 'production'
  ? fileURLToPath(new URL('../client', import.meta.url))
  : undefined;
if (clientDirectory && !existsSync(fileURLToPath(new URL('../client/index.html', import.meta.url)))) {
  throw new Error('Client build is missing. Run npm run build before npm start.');
}
const { server, close } = createAppServer({ clientDirectory });
server.listen(config.port, config.host, () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    console.log(`Pomekhi foundation: http://${config.host}:${address.port}`);
    process.send?.({ type: 'pomekhi:ready', port: address.port });
  }
});
server.on('error', () => {
  console.error('Cannot start the server. Check HOST, PORT and whether the port is already in use.');
  process.exitCode = 1;
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await close();
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
