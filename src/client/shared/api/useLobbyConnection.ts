import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { CatalogInput, CatalogReply, ClientToServerEvents, GameCue, PhoneScare, LobbyCommand, LobbyError, LobbyInputs, LobbyReply, LobbyView, ServerToClientEvents } from '../../../shared/protocol.js';

export type ConnectionState = 'connecting' | 'online' | 'offline';
type RequestError = LobbyError | 'CONNECTION_LOST' | 'TIMEOUT';
type Reply = LobbyReply | { ok: false; error: RequestError };
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const messages: Record<RequestError, string> = {
  CARD_POOL_INSUFFICIENT: 'Недостаточно включённых карточек для состава и замены. Проверьте банк в редакторе.',
  STALE_CATALOG: 'Банк изменён в другой панели. Перечитайте его; ваша несохранённая форма останется.',
  CATALOG_LOCKED: 'Редактирование доступно в лобби, перерыве и после партии. Сначала завершите или отмените чтение карточек.',
  PREPARATION_REQUIRED: 'Сначала укажите игровые локации в настройках партии.',
  PRESENCE_REQUIRED: 'Подтвердите хотя бы одного вернувшегося или уточните статус всех, кто остался вне базы.',
  RITUAL_REVIEW_PENDING: 'Сначала подтвердите итоги раунда на базе: затем программа передвинет свечи и проверит исход ритуала.',
  SYNC_PENDING: 'Сначала синхронизируйте телефоны и разберите спорные действия. Можно явно закрыть ожидание с ноутбука.',
  STORAGE_UNAVAILABLE: 'Не удалось сохранить партию. Игра остановлена. Организатор может восстановить запись с ноутбука.',
  INVALID_INPUT: 'Проверьте данные: имя — от 1 до 24 символов, код комнаты — 6 символов.',
  INVALID_ORGANIZER_CODE: 'Код организатора не подошёл. Возьмите актуальный код из окна запуска.',
  FORBIDDEN: 'Для этого действия нужен вход организатора.',
  ROOM_NOT_FOUND: 'Комната не найдена. Проверьте приглашение и код.',
  ROOM_FULL: 'В комнате уже 12 участников. Организатор может освободить место.',
  NAME_TAKEN: 'Это имя уже занято. Добавьте к имени отличительный знак.',
  SESSION_EXPIRED: 'Прежний вход больше не действует. Войдите в комнату заново.',
  INVALID_COMPOSITION: 'Для новой раздачи нужны 4–12 участников. Одержимых должно быть от одного до половины состава.',
  STALE_DEAL: 'Раздача уже изменилась. Проверьте текущее состояние перед новым действием.',
  STALE_CARD: 'Карточка уже изменилась. Откройте и прочитайте новую.',
  REPLACEMENT_PENDING: 'Сначала дождитесь замены карточки или отмените запрос.',
  REQUEST_LIMIT: 'Слишком много действий в этой комнате. Попросите организатора открыть новую комнату.',
  ACTION_UNAVAILABLE: 'Это игровое действие недоступно. Проверьте имя и текущее состояние.',
  STALE_PLAY: 'Игровое состояние изменилось. Проверьте карточку перед новым действием.',
  UNDO_DEPENDENCY: 'Отменить нельзя: от этого действия зависят последующие события.',
  RESULTS_FINAL: 'Результат уже зафиксирован. Изменения недоступны.',
  INVALID_PHASE: 'Это действие сейчас недоступно. Проверьте текущую фазу.',
  STALE_GAME: 'Раунд уже изменился. Проверьте фазу перед новым действием.',
  START_WARNING: 'Есть неготовые или отключённые участники. Проверьте состав и подтвердите запуск.',
  RESUME_WARNING: 'Состав раунда изменился. Подтвердите продолжение с оставшимися участниками.',
  SETTINGS_LOCKED: 'Настройки партии уже зафиксированы.',
  CONNECTION_LOST: 'Нет связи с домом. Дождитесь подключения и повторите действие.',
  TIMEOUT: 'Ответ задерживается. Проверьте состояние комнаты перед повтором действия.',
};
export function describeError(error: RequestError) { return messages[error]; }

export function useLobbyConnection() {
  const socketRef = useRef<ClientSocket | null>(null);
  const epoch = useRef(0);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [generation, setGeneration] = useState(0);
  const [restored, setRestored] = useState(false);
  const [view, setView] = useState<LobbyView>();
  const latestView = useRef<LobbyView>(undefined);
  const offsetRef = useRef<number | null>(null);
  const [clockOffset, setClockOffset] = useState<number | null>(null);
  const [cue, setCue] = useState<GameCue>();
  const [scare, setScare] = useState<PhoneScare>();
  const resetView = useCallback(() => {
    latestView.current = undefined; offsetRef.current = null;
    setView(undefined); setRestored(false); setClockOffset(null); setCue(undefined); setScare(undefined);
  }, []);
  const accept = useCallback((next: LobbyView, sampledAt?: number) => {
    if (latestView.current && next.revision < latestView.current.revision) return;
    latestView.current = next; setView(next); setRestored(true);
    if (next.kind !== 'ended' && next.room && (sampledAt !== undefined || offsetRef.current === null)) {
      const offset = next.room.game.serverNow - (sampledAt ?? performance.now());
      offsetRef.current = offset; setClockOffset(offset);
    }
  }, []);

  useEffect(() => {
    const socket: ClientSocket = io({ autoConnect: false, retries: 0 });
    socketRef.current = socket;
    socket.on('connect', () => {
      epoch.current++;
      latestView.current = undefined; offsetRef.current = null; setClockOffset(null); setCue(undefined); setScare(undefined);
      // Keep the last authorized screen while identity is being restored.
      setRestored(false);
      setConnection('online');
      setGeneration(value => value + 1);
    });
    socket.on('lobby:state', accept);
    socket.on('game:cue', next => {
      const current = latestView.current;
      if (current && current.kind !== 'ended' && current.audioEnabled && current.room?.id === next.roomId
        && current.room.game.version === next.version && offsetRef.current !== null
        && Math.abs(performance.now() + offsetRef.current - next.serverNow) < 2000) setCue(next);
    });
    socket.on('player:scare', next => {
      const current = latestView.current;
      if (current?.kind === 'player' && current.audioEnabled && current.room.phoneScaresEnabled
        && current.room.id === next.roomId && current.room.game.roundId === next.roundId
        && current.room.game.phase === 'search' && !current.room.game.paused && offsetRef.current !== null
        && Math.abs(performance.now() + offsetRef.current - next.serverNow) < 2000) setScare(next);
    });
    socket.on('disconnect', () => { epoch.current++; setCue(undefined); setScare(undefined); setConnection('offline'); });
    socket.on('connect_error', () => setConnection('offline'));
    // A browser network hint can be false while the LAN socket is still reachable.
    const networkLost = () => { if (!socket.connected) { setConnection('offline'); setCue(undefined); setScare(undefined); } };
    const networkRestored = () => { if (!socket.connected) socket.connect(); };
    window.addEventListener('offline', networkLost);
    window.addEventListener('online', networkRestored);
    socket.connect();
    return () => { window.removeEventListener('offline', networkLost); window.removeEventListener('online', networkRestored); epoch.current++; socket.removeAllListeners(); socket.disconnect(); socketRef.current = null; };
  }, [accept]);

  const request = useCallback(<Command extends LobbyCommand>(command: Command, input: LobbyInputs[Command]): Promise<Reply> => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve({ ok: false, error: 'CONNECTION_LOST' });
    const sentAt = epoch.current;
    const startedAt = performance.now();
    return new Promise(resolve => {
      // Volatile emits never queue a control command for a later connection.
      const channel = ['play:sync', 'play:complete', 'player:join', 'player:resume', 'organizer:authorize'].includes(command) ? socket.timeout(6000) : socket.timeout(6000).volatile;
      const emit = channel.emit.bind(socket) as (
        event: Command, data: LobbyInputs[Command], callback: (error: Error | null, reply?: LobbyReply) => void,
      ) => void;
      emit(command, input, (error, reply) => {
        if (epoch.current !== sentAt) { resolve({ ok: false, error: 'CONNECTION_LOST' }); return; }
        if (error || !reply) { resolve({ ok: false, error: 'TIMEOUT' }); return; }
        if (reply.ok) accept(reply.view, (startedAt + performance.now()) / 2);
        resolve(reply);
      });
    });
  }, [accept]);
  const requestCatalog = useCallback((input: CatalogInput): Promise<CatalogReply> => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve({ ok: false, error: 'CONNECTION_LOST' });
    const sentAt = epoch.current;
    return new Promise(resolve => {
      socket.timeout(6000).volatile.emit('catalog:command', input, (error: Error | null, reply?: CatalogReply) => {
        if (epoch.current !== sentAt) resolve({ ok: false, error: 'CONNECTION_LOST' });
        else if (error || !reply) resolve({ ok: false, error: 'TIMEOUT' });
        else resolve(reply);
      });
    });
  }, []);
  const roomId = view && view.kind !== 'ended' ? view.room?.id : undefined;
  const timed = view && view.kind !== 'ended' && view.room ? ['placement', 'search', 'return'].includes(view.room.game.phase) : false;
  useEffect(() => {
    if (connection !== 'online' || !roomId || !restored) return;
    const sync = () => { if (!document.hidden) void request('lobby:sync', {}); };
    document.addEventListener('visibilitychange', sync);
    const timer = timed ? window.setInterval(sync, 30000) : undefined;
    if (timed) sync();
    return () => { document.removeEventListener('visibilitychange', sync); window.clearInterval(timer); };
  }, [connection, roomId, timed, generation, request, restored]);
  const reconnect = useCallback(() => { socketRef.current?.disconnect().connect(); }, []);
  return { connection, generation, restored, view, request, requestCatalog, clockOffset, cue, scare, reconnect, resetView };
}
