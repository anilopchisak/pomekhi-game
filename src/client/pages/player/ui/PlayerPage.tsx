import { useCallback, useEffect, useRef, useState } from 'react';
import { dealCommand, describeError, useLobbyConnection } from '../../../shared/api/index.js';
import { LobbyShell, RoundStatus } from '../../../shared/ui/index.js';
import { clearPlayerSession, createResumeKey, readPlayerSession, savePlayerSession } from '../session.js';
import type { PlayerSession } from '../session.js';
import { PersonalCardPanel } from './PersonalCardPanel.js';
import { PlayControls } from './PlayControls.js';
import type { LobbyCommand, LobbyInputs } from '../../../../shared/protocol.js';

export function PlayerPage() {
  const { connection, generation, view, request, clockOffset } = useLobbyConnection();
  const invitationCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  const initial = readPlayerSession();
  const saved = useRef(initial && (!invitationCode || initial.roomCode === invitationCode) ? initial : null);
  const operation = useRef(0);
  const [roomCode, setRoomCode] = useState(invitationCode || saved.current?.roomCode || '');
  const [name, setName] = useState(saved.current?.name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ command: LobbyCommand; input: LobbyInputs[LobbyCommand] } | null>(null);
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
    setPending(null);
    setError({ closed: 'Комната закрыта. Для новой встречи потребуется новое приглашение.', removed: 'Организатор удалил ваш вход. При необходимости войдите заново.', left: 'Вы вышли из комнаты.' }[ended]);
  }, [ended]);

  async function cardAction<C extends LobbyCommand>(command: C, input: LobbyInputs[C]) {
    const attempt = ++operation.current;
    setBusy(true); setError('');
    const result = await request(command, input);
    if (attempt !== operation.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(describeError(result.error));
      setPending(result.error === 'TIMEOUT' || result.error === 'CONNECTION_LOST' ? { command, input } : null);
    } else setPending(null);
  }

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
    {pending && playerView && <button disabled={busy || connection !== 'online'} onClick={() => void cardAction(pending.command, pending.input)}>Повторить действие</button>}
    {!playerView ? <form onSubmit={event => { event.preventDefault(); void join(); }}>
      <label>Код комнаты<input value={roomCode} autoCapitalize="characters" autoComplete="off" maxLength={6} minLength={6} onChange={event => setRoomCode(event.target.value.toUpperCase())} required /></label>
      <label>Ваше имя<input value={name} autoComplete="nickname" maxLength={48} onChange={event => setName(event.target.value)} required /></label>
      <button disabled={busy || connection !== 'online'}>{busy ? 'Входим…' : 'Войти в комнату'}</button>
    </form> : <>
    <RoundStatus game={playerView.room.game} clockOffset={clockOffset} connection={connection}
      role={playerView.play?.card.role ?? playerView.assignment?.card.role} playStatus={playerView.play?.status} waiting={!playerView.assignment} />
    {playerView.play && <PlayControls view={playerView} disabled={busy || connection !== 'online'} run={cardAction} />}
    {playerView.assignment && <PersonalCardPanel infectionEnabled={playerView.room.game.settings.infectionEnabled} assignment={playerView.play ? { ...playerView.assignment, id: playerView.play.cardKey, card: playerView.play.card } : playerView.assignment} disabled={busy || connection !== 'online'} readOnly={playerView.room.game.phase !== 'reading'} act={async (action, flag) => {
      const base = { ...dealCommand(playerView.room), assignmentId: playerView.assignment!.id };
      await cardAction(action, action === 'card:ready' ? { ...base, ready: flag } : { ...base, requested: flag });
    }} />}
    <section>
      <h3>{playerView.room.players.find(player => player.id === playerView.playerId)?.name}, оставайтесь на связи</h3>
      <p>Комната <code>{playerView.room.code}</code></p>
      <p>Участников: {playerView.room.players.length} / {playerView.room.capacity}.</p>
      <ul>{playerView.room.players.map(player => <li key={player.id}>
        <span>{player.name}{player.id === playerView.playerId ? ' (вы)' : ''}</span><small>{player.online ? 'На связи' : 'Нет связи'}</small>
        {playerView.room.dealing.assignments.filter(item => item.playerId === player.id).map(item => <small key={item.assignmentId}>{playerView.room.game.phase === 'reading' ? item.replacementRequested ? 'Просит замену' : item.ready ? 'Прочитал' : 'Читает' : 'Карточка выдана'}</small>)}
        {!playerView.room.dealing.assignments.some(item => item.playerId === player.id) && <small>Ждёт следующей раздачи</small>}
      </li>)}</ul>
      <button data-danger disabled={busy || connection !== 'online'} onClick={async () => {
        if (!window.confirm('Выйти из комнаты? Ваше место освободится. Если вы участвуете в текущем раунде, он будет поставлен на паузу.')) return;
        const attempt = ++operation.current;
        setBusy(true); setError('');
        const result = await request('player:leave', { roomId: playerView.room.id });
        if (attempt !== operation.current) return;
        setBusy(false);
        if (!result.ok) setError(describeError(result.error));
      }}>Выйти из комнаты</button>
    </section></>}
  </LobbyShell>;
}
