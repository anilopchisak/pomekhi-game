import { spawn } from 'node:child_process';
import { URLSearchParams } from 'node:url';

export function openOrganizer(origin, key, { invite = '', local = false, createRoom = false, waitForTunnel = false } = {}) {
  const panel = new URL('/?screen=host', origin);
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(panel.hostname) || !key) {
    console.log('Use the organizer panel and code printed above.');
    return;
  }
  const fragment = new URLSearchParams({ bootstrap: key });
  if (invite) fragment.set('invite', invite);
  if (local) fragment.set('local', '1');
  if (waitForTunnel) fragment.set('tunnel', '1');
  if (createRoom) fragment.set('create', '1');
  panel.hash = fragment.toString();
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', panel.href] : [panel.href];
  const browser = spawn(command, args, { stdio: 'ignore' });
  const manual = () => console.log('Could not open the organizer panel. Use the panel address and organizer code printed above.');
  browser.once('error', manual);
  browser.once('exit', code => { if (code) manual(); });
  browser.unref();
}
