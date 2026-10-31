export interface PlayerSession { roomCode: string; name: string; resumeKey: string; pending: boolean }
const storageKey = 'pomekhi.player';
export function readPlayerSession(): PlayerSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    return value && typeof value.name === 'string' && typeof value.roomCode === 'string'
      && /^[A-Z2-9]{6}$/.test(value.roomCode) && typeof value.resumeKey === 'string'
      && /^[a-f0-9]{64}$/.test(value.resumeKey) && typeof value.pending === 'boolean' ? value : null;
  } catch { return null; }
}
export function savePlayerSession(value: PlayerSession) { localStorage.setItem(storageKey, JSON.stringify(value)); }
export function clearPlayerSession() { try { localStorage.removeItem(storageKey); } catch { /* Rejoining still replaces the stored session. */ } }
export function createResumeKey() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, '0')).join('');
}
