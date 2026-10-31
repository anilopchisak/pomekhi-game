import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, LobbyCommand, LobbyError, LobbyInputs, LobbyReply, LobbyView, ServerToClientEvents } from '../../../shared/protocol.js';

export type ConnectionState = 'connecting' | 'online' | 'offline';
type RequestError = LobbyError | 'CONNECTION_LOST' | 'TIMEOUT';
type Reply = LobbyReply | { ok: false; error: RequestError };
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const messages: Record<RequestError, string> = {
  INVALID_INPUT: 'Проверьте данные: имя — от 1 до 24 символов, код комнаты — 6 символов.',
  INVALID_ORGANIZER_CODE: 'Код организатора не подошёл. Возьмите актуальный код из окна запуска.',
  FORBIDDEN: 'Для этого действия нужен вход организатора.',
  ROOM_NOT_FOUND: 'Комната не найдена. Проверьте приглашение и код.',
  ROOM_FULL: 'В комнате уже 12 участников. Организатор может освободить место.',
  NAME_TAKEN: 'Это имя уже занято. Добавьте к имени отличительный знак.',
  SESSION_EXPIRED: 'Прежний вход больше не действует. Войдите в комнату заново.',
  CONNECTION_LOST: 'Нет связи с домом. Дождитесь подключения и повторите действие.',
  TIMEOUT: 'Ответ задерживается. Проверьте состояние комнаты перед повтором действия.',
};
export function describeError(error: RequestError) { return messages[error]; }

export function useLobbyConnection() {
  const socketRef = useRef<ClientSocket | null>(null);
  const epoch = useRef(0);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [generation, setGeneration] = useState(0);
  const [view, setView] = useState<LobbyView>();
  const accept = useCallback((next: LobbyView) => {
    setView(previous => !previous || next.revision >= previous.revision ? next : previous);
  }, []);

  useEffect(() => {
    const socket: ClientSocket = io({ autoConnect: false, retries: 0 });
    socketRef.current = socket;
    socket.on('connect', () => {
      epoch.current++;
      setView(undefined);
      setConnection('online');
      setGeneration(value => value + 1);
    });
    socket.on('lobby:state', accept);
    socket.on('disconnect', () => { epoch.current++; setConnection('offline'); });
    socket.on('connect_error', () => setConnection('offline'));
    socket.connect();
    return () => { epoch.current++; socket.removeAllListeners(); socket.disconnect(); socketRef.current = null; };
  }, [accept]);

  const request = useCallback(<Command extends LobbyCommand>(command: Command, input: LobbyInputs[Command]): Promise<Reply> => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve({ ok: false, error: 'CONNECTION_LOST' });
    const sentAt = epoch.current;
    return new Promise(resolve => {
      // Volatile emits never queue a control command for a later connection.
      const emit = socket.timeout(6000).volatile.emit.bind(socket) as (
        event: Command, data: LobbyInputs[Command], callback: (error: Error | null, reply?: LobbyReply) => void,
      ) => void;
      emit(command, input, (error, reply) => {
        if (epoch.current !== sentAt) { resolve({ ok: false, error: 'CONNECTION_LOST' }); return; }
        if (error || !reply) { resolve({ ok: false, error: 'TIMEOUT' }); return; }
        if (reply.ok) accept(reply.view);
        resolve(reply);
      });
    });
  }, [accept]);
  return { connection, generation, view, request };
}
