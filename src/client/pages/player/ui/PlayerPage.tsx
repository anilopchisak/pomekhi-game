import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError, useLobbyConnection } from '../../../shared/api/index.js';
import { LobbyShell } from '../../../shared/ui/index.js';
import { clearPlayerSession, createResumeKey, readPlayerSession, savePlayerSession } from '../session.js';
import type { PlayerSession } from '../session.js';

export function PlayerPage() {
  const { connection, generation, view, request } = useLobbyConnection();
  const invitationCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  const initial = readPlayerSession();
  const saved = useRef(initial && (!invitationCode || initial.roomCode === invitationCode) ? initial : null);
  const operation = useRef(0);
  const [roomCode, setRoomCode] = useState(invitationCode || saved.current?.roomCode || '');
  const [name, setName] = useState(saved.current?.name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const playerView = view?.kind === 'player' ? view : undefined;

  const enter = useCallback(async (session: PlayerSession) => {
    const attempt = ++operation.current;
    setBusy(true); setError('');
    const result = await request(session.pending ? 'player:join' : 'player:resume', session);
    if (attempt !== operation.current) return;
    setBusy(false);
    if (result.ok) {
      if (result.view.kind !== 'player') return;
      const completed = { ...session, pending: false };
      saved.current = completed;
      try { savePlayerSession(completed); } catch { /* The pre-join key is already stored. */ }
    } else {
      setError(describeError(result.error));
      if (result.error !== 'TIMEOUT' && result.error !== 'CONNECTION_LOST') { saved.current = null; clearPlayerSession(); }
    }
  }, [request]);

  useEffect(() => { if (generation && saved.current) void enter(saved.current); }, [generation, enter]);
  const ended = view?.kind === 'ended' ? view.reason : null;
  useEffect(() => {
    if (!ended) return;
    operation.current++;
    setBusy(false);
    saved.current = null; clearPlayerSession();
    setError({ closed: 'Комната закрыта. Для новой встречи потребуется новое приглашение.', removed: 'Организатор удалил ваш вход. При необходимости войдите заново.', left: 'Вы вышли из комнаты.' }[ended]);
  }, [ended]);

  async function join() {
    const normalizedCode = roomCode.trim().toUpperCase();
    // Retry the saved join or resume without replacing a still-valid credential.
    const previous = saved.current;
    const session: PlayerSession = previous?.roomCode === normalizedCode
      ? previous : { roomCode: normalizedCode, name, resumeKey: createResumeKey(), pending: true };
    try { savePlayerSession(session); }
    catch { setError('Браузер не позволяет сохранить вход. Разрешите хранилище сайта и повторите.'); return; }
    saved.current = session;
    await enter(session);
  }

  return <LobbyShell title={playerView ? 'Вы внутри' : 'Войти в дом'} connection={connection} error={error}>
    {!playerView ? <form onSubmit={event => { event.preventDefault(); void join(); }}>
      <label>Код комнаты<input value={roomCode} autoCapitalize="characters" autoComplete="off" maxLength={6} minLength={6} onChange={event => setRoomCode(event.target.value.toUpperCase())} required /></label>
      <label>Ваше имя<input value={name} autoComplete="nickname" maxLength={48} onChange={event => setName(event.target.value)} required /></label>
      <button disabled={busy || connection !== 'online'}>{busy ? 'Входим…' : 'Войти в комнату'}</button>
    </form> : <section>
      <h3>{playerView.room.players.find(player => player.id === playerView.playerId)?.name}, оставайтесь на связи</h3>
      <p>Комната <code>{playerView.room.code}</code></p>
      <p>Собираемся у экрана. Участников: {playerView.room.players.length} / {playerView.room.capacity}.</p>
      <ul>{playerView.room.players.map(player => <li key={player.id}>
        <span>{player.name}{player.id === playerView.playerId ? ' (вы)' : ''}</span><small>{player.online ? 'На связи' : 'Нет связи'}</small>
      </li>)}</ul>
      <button data-danger disabled={busy || connection !== 'online'} onClick={async () => {
        if (!window.confirm('Выйти из комнаты? Ваше место освободится.')) return;
        const attempt = ++operation.current;
        setBusy(true); setError('');
        const result = await request('player:leave', { roomId: playerView.room.id });
        if (attempt !== operation.current) return;
        setBusy(false);
        if (!result.ok) setError(describeError(result.error));
      }}>Выйти из комнаты</button>
    </section>}
  </LobbyShell>;
}
