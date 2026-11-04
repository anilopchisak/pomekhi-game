import { invitationUrl } from './invitation.js';

export async function redeemOrganizerBootstrap() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const token = fragment.get('bootstrap');
  if (!token) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  const address = fragment.get('invite') ?? '';
  const local = fragment.get('local') === '1';
  const createRoom = local && Boolean(address) && fragment.get('create') === '1';
  if (!/^[a-f0-9]{64}$/.test(token) || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  if (address) invitationUrl(address, 'ROOM22', local);
  const response = await fetch('/api/organizer-bootstrap', {
    method: 'POST', cache: 'no-store', headers: { 'X-Pomekhi-Bootstrap': token },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Bootstrap unavailable');
  const { code } = await response.json() as { code?: unknown };
  if (typeof code !== 'string' || !code) throw new Error('Bootstrap unavailable');
  return { code, address, local, createRoom, waitForTunnel: fragment.get('tunnel') === '1' };
}

const addressKey = 'pomekhi.public-invitation';
export function savedInvitationAddress() {
  try {
    const address = sessionStorage.getItem(addressKey);
    if (address) {
      invitationUrl(address, 'ROOM22', address.startsWith('http:'));
      return address;
    }
  } catch { /* Manual invitation remains available. */ }
  return '';
}

export function saveInvitationAddress(address: string) {
  try {
    if (address) sessionStorage.setItem(addressKey, address);
    else sessionStorage.removeItem(addressKey);
  } catch { /* The current panel still has the address. */ }
}

export async function loadPublicInvitation(signal: AbortSignal) {
  const response = await fetch('/api/public-invitation', { cache: 'no-store', signal });
  if (response.status !== 200) return;
  const { origin } = await response.json() as { origin?: unknown };
  if (typeof origin !== 'string') return;
  invitationUrl(origin, 'ROOM22');
  return origin;
}
