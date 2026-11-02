import type { EventReceipt, LobbyView, OfflineEvent, PersonalPlay } from '../../../../shared/protocol.js';
export type PlayerView = Extract<LobbyView, { kind: 'player' }>;
export interface LocalEvent { event: OfflineEvent; receipt?: EventReceipt; before: PersonalPlay | null }
export interface OfflineRecord { scope: string; cachedAt: number; view: PlayerView | null; clientId: string; sequence: number; events: LocalEvent[] }
const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Persistent offline storage is unavailable.')); return; }
    const request = indexedDB.open('pomekhi-private-player', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('players', { keyPath: 'scope' });
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = undefined; }; resolve(db); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => reject(new Error('Offline storage upgrade is blocked.'));
  });
}
/** Each read/modify/write is one transaction, including sequence allocation across tabs. */
export async function updateOffline(scope: string, mutate: (record: OfflineRecord) => void = () => {}): Promise<OfflineRecord> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('players', 'readwrite'), store = transaction.objectStore('players');
    const request = store.get(scope); let next: OfflineRecord;
    request.onsuccess = () => {
      next = request.result ?? { scope, cachedAt: Date.now(), view: null, clientId: randomId(), sequence: 0, events: [] };
      try { mutate(next); store.put(next); } catch (error) { transaction.abort(); reject(error); }
    };
    transaction.oncomplete = () => resolve(structuredClone(next));
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Offline write was cancelled.'));
  });
}
export function appendOffline(scope: string, roundId: string, action: OfflineEvent['action'], view: PlayerView, estimatedServerTime: number | null) {
  return updateOffline(scope, record => {
    if (record.events.length >= 12000) throw new Error('Offline journal is full.');
    const previous = record.events.findLast(e => e.event.roundId === roundId);
    record.events.push({ event: { id: randomId(), clientId: record.clientId, sequence: ++record.sequence, previousId: previous?.event.id ?? null,
      roundId, action, phase: view.room.game.phase === 'search' && view.room.game.deadline !== null && estimatedServerTime !== null && estimatedServerTime >= view.room.game.deadline ? 'return' : view.room.game.phase, paused: view.room.game.paused, estimatedServerTime }, before: structuredClone(projectOffline(view, record.events).play) });
  });
}
export async function purgeOffline(scope: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => { const t = db.transaction('players', 'readwrite'); t.objectStore('players').delete(scope); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); });
}
export function projectOffline(view: PlayerView, entries: LocalEvent[]): PlayerView {
  const result = structuredClone(view), round = view.room.game.roundId;
  const events = entries.filter(e => e.event.roundId === round && (!e.receipt || e.receipt.status === 'review'));
  const undone = new Set(events.filter(e => e.event.action.kind === 'undo').map(e => e.event.action.kind === 'undo' ? e.event.action.actionId : ''));
  for (const item of events) {
    const action = item.event.action;
    if (undone.has(item.event.id)) continue;
    if (action.kind === 'withdraw') { result.play = null; result.synchronization = { roundId: round!, receipts: result.synchronization?.receipts ?? [], complete: false, withdrawn: true }; }
    else if (action.kind === 'undo') {
      const original = entries.find(e => e.event.id === action.actionId);
      if (original?.before && !result.synchronization?.withdrawn) result.play = structuredClone(original.before);
    } else if (result.play) {
      if (action.kind === 'mission') result.play.missionCompleted = action.completed;
      if (action.kind === 'release') result.play.status = 'released';
      if (action.kind === 'captured') { result.play.status = 'captured'; result.play.missionEligible = false; result.play.wasCaptured = true; }
      if (action.kind === 'captured') { result.play.undo = null; continue; }
      result.play.undo = { id: item.event.id, label: action.kind === 'infect' ? 'Заражение' : action.kind === 'release' ? 'Освобождение группы' : 'Отметка миссии', available: true };
    }
  }
  return result;
}
