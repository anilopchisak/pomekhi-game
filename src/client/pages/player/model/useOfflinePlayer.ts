import { useCallback, useEffect, useRef, useState } from 'react';
import type { LobbyCommand, LobbyInputs, LobbyReply, LobbyError, OfflineAction } from '../../../../shared/protocol.js';
import { appendOffline, projectOffline, purgeOffline, updateOffline } from './offline-store.js';
import type { OfflineRecord, PlayerView } from './offline-store.js';

type Request = <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<Extract<LobbyReply, { ok: true }> | { ok: false; error: LobbyError | 'CONNECTION_LOST' | 'TIMEOUT' }>;
export function useOfflinePlayer(scope: string | null, live: PlayerView | undefined, online: boolean, authorized: boolean, generation: number, request: Request, clockOffset: number | null) {
  const [storedRecord, setRecord] = useState<OfflineRecord>();
  const record = storedRecord?.scope === scope ? storedRecord : undefined;
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const syncing = useRef(false), handshake = useRef('');
  const mounted = useRef(false), retry = useRef<number | undefined>(undefined), channel = useRef<BroadcastChannel | null>(null);
  const currentScope = useRef(scope); currentScope.current = scope;
  const accept = useCallback((value: OfflineRecord) => { if (value.scope === currentScope.current) setRecord(value); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; window.clearTimeout(retry.current); }; }, []);
  useEffect(() => {
    if (!scope || !('BroadcastChannel' in window)) return;
    const bus = new BroadcastChannel('pomekhi-private-player'); channel.current = bus;
    bus.onmessage = message => { if (message.data === scope) void updateOffline(scope).then(accept).catch(() => setError('Не удалось прочитать журнал другой вкладки.')); };
    return () => { bus.close(); channel.current = null; };
  }, [scope, accept]);
  useEffect(() => {
    setAvailable(false); setRecord(undefined); handshake.current = '';
    if (!scope) return;
    let active = true;
    void updateOffline(scope).then(value => { if (active) { accept(value); setAvailable(true); } }).catch(() => { if (active) setError('Не удалось открыть офлайн-хранилище. Без связи действия записать не получится.'); });
    return () => { active = false; };
  }, [scope, accept]);
  useEffect(() => {
    if (!scope || !live || !authorized) return;
    void updateOffline(scope, item => {
      item.view = structuredClone(live); item.cachedAt = Date.now();
      const receipts = live.synchronization?.receipts ?? [];
      for (const entry of item.events) { const receipt = receipts.find(r => r.id === entry.event.id); if (receipt) entry.receipt = receipt; }
      // New assignments retain only event metadata; previous private cards are removed.
      for (const entry of item.events) if (entry.event.roundId !== live.room.game.roundId) entry.before = null;
    }).then(value => { accept(value); setAvailable(true); }).catch(() => setError('Не удалось сохранить экран на телефоне. Проверьте хранилище браузера.'));
  }, [scope, live, authorized, accept]);
  const base = live ?? record?.view ?? undefined;
  const pending = record?.events.filter(e => !e.receipt) ?? [];
  const conflicts = record?.events.filter(e => e.receipt?.status === 'review') ?? [];
  useEffect(() => {
    if (!scope || !available || !online || !authorized || !live?.room.game.roundId || !live.assignment || syncing.current) return;
    const signature = `${generation}:${live.room.game.roundId}`;
    const needHandshake = handshake.current !== signature;
    const needComplete = !['placement', 'search', 'return', 'reading', 'lobby'].includes(live.room.game.phase)
      && !live.synchronization?.complete && !live.room.game.synchronization?.closed;
    if (!pending.length && !needHandshake && !needComplete) return;
    const activeScope = scope;
    let retryDelay = 200;
    syncing.current = true;
    void (async () => {
      let latest = live;
      const batch = pending.slice(0, 24);
      const roundId = batch[0]?.event.roundId ?? latest.room.game.roundId!;
      const result = await request('play:sync', { roomId: latest.room.id, roundId, events: batch.filter(e => e.event.roundId === roundId).map(e => e.event) });
      if (!result.ok) {
        retryDelay = 2000;
        if (['STALE_GAME', 'RESULTS_FINAL', 'ROOM_NOT_FOUND', 'SESSION_EXPIRED', 'ACTION_UNAVAILABLE', 'INVALID_INPUT', 'FORBIDDEN', 'REQUEST_LIMIT'].includes(result.error)) {
          accept(await updateOffline(scope, item => { for (const entry of item.events) if (!entry.receipt && entry.event.roundId === roundId) { entry.receipt = { id: entry.event.id, status: 'rejected', reason: result.error }; entry.before = null; } }));
        }
        return;
      }
      if (result.view.kind !== 'player') return;
      latest = result.view; handshake.current = signature;
      const next = await updateOffline(scope, item => {
        item.view = latest; item.cachedAt = Date.now();
        for (const entry of item.events) { const receipt = latest.synchronization?.receipts.find(r => r.id === entry.event.id); if (receipt) entry.receipt = receipt; }
      });
      accept(next);
      if (!next.events.some(e => !e.receipt) && !['placement', 'search', 'return', 'reading', 'lobby'].includes(latest.room.game.phase) && latest.room.game.synchronization) {
        await request('play:complete', { roomId: latest.room.id, roundId: latest.room.game.roundId!, syncRevision: latest.room.game.synchronization.revision });
      }
    })().catch(() => setError('Не удалось синхронизировать журнал. Записи остаются на телефоне.')).finally(() => { syncing.current = false; if (!mounted.current) return; retry.current = window.setTimeout(() => { if (mounted.current && currentScope.current === activeScope) setRecord(v => v ? { ...v } : v); }, retryDelay); });

  }, [scope, available, online, authorized, generation, live, pending.length, record, request, accept]);
  const recoveredOffset = record?.view && record.cachedAt ? record.view.room.game.serverNow + Math.max(0, Date.now() - record.cachedAt) - performance.now() : null;
  const effectiveOffset = clockOffset ?? recoveredOffset;
  const queue = useCallback(async (action: OfflineAction) => {
    if (!scope || !base?.room.game.roundId || !available) { setError('Офлайн-хранилище недоступно. Действие не записано.'); return; }
    try { accept(await appendOffline(scope, base.room.game.roundId, action, base, effectiveOffset === null ? null : performance.now() + effectiveOffset)); channel.current?.postMessage(scope); setError(''); }
    catch { setError('Не удалось записать действие. Оно не отправлено; вернитесь на базу для проверки.'); }
  }, [scope, base, available, effectiveOffset, accept]);
  const clear = useCallback(async () => {
    const clearedScope = currentScope.current;
    if (clearedScope) await purgeOffline(clearedScope);
    setRecord(value => value?.scope === clearedScope ? undefined : value);
  }, []);
  const view = base && record ? projectOffline(base, record.events) : base;
  const pendingCapture = record?.events.some(e => e.event.roundId === view?.room.game.roundId && e.event.action.kind === 'captured' && (!e.receipt || e.receipt.status === 'review')) && live?.play?.status !== 'captured';
  return { view, clockOffset: effectiveOffset, queue, clear, available, error, pending: pending.length, conflicts: conflicts.length, pendingCapture,
    rejected: record?.events.filter(e => e.receipt?.status === 'rejected').map(e => e.receipt!) ?? [] };
}
