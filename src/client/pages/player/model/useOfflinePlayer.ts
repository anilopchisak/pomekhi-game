import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LobbyCommand, LobbyInputs, LobbyReply, LobbyError, OfflineAction } from '../../../../shared/protocol.js';
import { appendOffline, cachePlayerView, partyOf, projectOffline, purgeOffline, updateOffline } from './offline-store.js';
import type { OfflineRecord, PlayerView } from './offline-store.js';

type Request = <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<Extract<LobbyReply, { ok: true }> | { ok: false; error: LobbyError | 'CONNECTION_LOST' | 'TIMEOUT' }>;
export function useOfflinePlayer(scope: string | null, live: PlayerView | undefined, online: boolean, authorized: boolean, generation: number, request: Request, clockOffset: number | null) {
  const [storedRecord, setRecord] = useState<OfflineRecord>();
  const scopedRecord = storedRecord?.scope === scope ? storedRecord : undefined;
  const cached = scopedRecord?.view;
  const cachedNewParty = cached && live && cached.room.id === live.room.id &&
    cached.revision > live.revision && partyOf(cached) !== partyOf(live);
  const base = cachedNewParty ? cached : live ?? cached ?? undefined;
  const record = !base || !cached || partyOf(base) === partyOf(cached) ? scopedRecord : undefined;
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const syncing = useRef(false), handshake = useRef('');
  const mounted = useRef(false), retry = useRef<number | undefined>(undefined), channel = useRef<BroadcastChannel | null>(null);
  const currentScope = useRef(scope); currentScope.current = scope;
  const accept = useCallback((value: OfflineRecord) => { if (value.scope === currentScope.current) setRecord(value); }, []);
  const cacheView = useCallback(async (scope: string, view: PlayerView) => {
    let partyChanged = false;
    const next = await updateOffline(scope, item => { partyChanged = cachePlayerView(item, view); });
    if (partyChanged) channel.current?.postMessage(scope);
    return next;
  }, []);
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
    void cacheView(scope, live)
      .then(value => { accept(value); setAvailable(true); }).catch(() => setError('Не удалось сохранить экран на телефоне. Проверьте хранилище браузера.'));
  }, [scope, live, authorized, accept, cacheView]);
  const pending = record?.events.filter(e => !e.receipt) ?? [];
  const conflicts = record?.events.filter(e => e.receipt?.status === 'review') ?? [];
  useEffect(() => {
    const currentRound = live?.room.game.roundId;
    if (!scope || !available || !online || !authorized || !currentRound || base !== live || live.synchronization?.roundId !== currentRound || syncing.current) return;
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
          accept(await updateOffline(scope, item => {
            for (const entry of item.events) if (!entry.receipt && entry.event.roundId === roundId) {
              entry.receipt = { id: entry.event.id, status: 'rejected', reason: result.error };
              // A server receipt takes precedence over a local delivery failure.
              entry.receiptRevision = -1;
              entry.before = null;
            }
          }));
        }
        return;
      }
      if (result.view.kind !== 'player' || partyOf(result.view) !== partyOf(live)) return;
      latest = result.view; handshake.current = signature;
      const next = await cacheView(scope, latest);
      if (!next.view || partyOf(next.view) !== partyOf(latest)) return;
      accept(next);
      if (!next.events.some(e => !e.receipt) && !['placement', 'search', 'return', 'reading', 'lobby'].includes(latest.room.game.phase) && latest.room.game.synchronization) {
        await request('play:complete', { roomId: latest.room.id, roundId: latest.room.game.roundId!, syncRevision: latest.room.game.synchronization.revision });
      }
    })().catch(() => setError('Не удалось синхронизировать журнал. Записи остаются на телефоне.')).finally(() => { syncing.current = false; if (!mounted.current) return; retry.current = window.setTimeout(() => { if (mounted.current && currentScope.current === activeScope) setRecord(v => v ? { ...v } : v); }, retryDelay); });

  }, [scope, available, online, authorized, generation, live, base, pending.length, record, request, accept, cacheView]);
  const cachedServerTime = record?.view?.room.game.serverNow;
  const cachedAt = record?.cachedAt;
  const recoveredOffset = useMemo(() => cachedServerTime === undefined || cachedAt === undefined ? null :
    cachedServerTime + Math.max(0, Date.now() - cachedAt) - performance.now(), [cachedServerTime, cachedAt]);
  const effectiveOffset = cachedNewParty ? recoveredOffset : clockOffset ?? recoveredOffset;
  const game = base?.room.game;
  const deadline = game?.firstGame && game.phase === 'search' && !game.paused && !(online && authorized) &&
    game.deadline !== null && effectiveOffset !== null ? game.deadline - effectiveOffset : null;
  const [elapsedDeadline, setElapsedDeadline] = useState<number | null>(null);
  const estimatedSearchEnded = deadline !== null && (deadline === elapsedDeadline || performance.now() >= deadline);
  useEffect(() => {
    if (deadline === null) return;
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      setElapsedDeadline(deadline);
      return;
    }
    const timer = window.setTimeout(() => setElapsedDeadline(deadline), remaining);
    return () => window.clearTimeout(timer);
  }, [deadline]);
  const queue = useCallback(async (action: OfflineAction) => {
    if (base?.room.game.firstGame && base.room.game.paused) return;
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
  const pendingCapture = base?.play?.status === 'exorcist' && view?.play?.status === 'captured';
  return { view, clockOffset: effectiveOffset, estimatedSearchEnded, queue, clear, available, error, pending: pending.length, conflicts: conflicts.length, pendingCapture,
    rejected: record?.events.filter(e => e.receipt?.status === 'rejected').map(e => e.receipt!) ?? [] };
}
