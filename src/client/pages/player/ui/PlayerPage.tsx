import styles from './PlayerScene.module.css';
import { PhoneSound } from './PhoneSound.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dealCommand, gameCommand, describeError, useLobbyConnection } from '../../../shared/api/index.js';
import { ConfirmButton, DialogButton, LobbyShell, ResultsSummary, RitualBoard, RoundStatus, RoundTimer } from '../../../shared/ui/index.js';
import { clearPlayerSession, createResumeKey, readPlayerSession, savePlayerSession } from '../session.js';
import type { PlayerSession } from '../session.js';
import { PersonalCardPanel } from './PersonalCardPanel.js';
import { purgeOffline } from '../model/offline-store.js';
import { useOfflinePlayer } from '../model/useOfflinePlayer.js';
import { PlayControls } from './PlayControls.js';
import type { LobbyCommand, LobbyInputs } from '../../../../shared/protocol.js';

export function PlayerPage() {
  const { connection, generation, view, request, clockOffset, scare, reconnect, resetView } = useLobbyConnection();
  const invitationCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  const initial = readPlayerSession();
  const saved = useRef(initial && (!invitationCode || initial.roomCode === invitationCode) ? initial : null);
  const operation = useRef(0);
  const [roomCode, setRoomCode] = useState(invitationCode || saved.current?.roomCode || '');
  const [name, setName] = useState(saved.current?.name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ command: LobbyCommand; input: LobbyInputs[LobbyCommand] } | null>(null);
  const [authorizedGeneration, setAuthorizedGeneration] = useState(0);
  const [revealedCard, setRevealedCard] = useState<string | null>(null);
  const [shellReady, setShellReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (window.isSecureContext && 'serviceWorker' in navigator) void navigator.serviceWorker.ready.then(() => { if (active) setShellReady(true); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const persisted = saved.current;
  const scope = persisted ? `${persisted.roomCode}:${persisted.resumeKey}` : null;
  const offline = useOfflinePlayer(scope, view?.kind === 'player' ? view : undefined, connection === 'online', generation > 0 && authorizedGeneration === generation, generation, request, clockOffset);
  const playerView = view?.kind === 'ended' ? undefined : offline.view;
  const offlineDisabled = busy || !offline.available && connection !== 'online';

  const enter = useCallback(async (session: PlayerSession) => {
    const attempt = ++operation.current;
    setBusy(true); setError('');
    const result = await request(session.pending ? 'player:join' : 'player:resume', session);
    if (attempt !== operation.current) return;
    setBusy(false);
    if (result.ok) {
      if (result.view.kind !== 'player') return;
      setAuthorizedGeneration(generation);
      const completed = { ...session, pending: false };
      saved.current = completed;
      try { savePlayerSession(completed); } catch { /* The pre-join key is already stored. */ }
    } else {
      setError(describeError(result.error));
      if (result.error !== 'TIMEOUT' && result.error !== 'CONNECTION_LOST' && result.error !== 'STORAGE_UNAVAILABLE') {
        saved.current = null; clearPlayerSession(); resetView(); setAuthorizedGeneration(0); setPending(null);
        void purgeOffline(`${session.roomCode}:${session.resumeKey}`).catch(() => {});
      }
    }
  }, [request, generation, resetView]);

  useEffect(() => { if (generation && saved.current) void enter(saved.current); }, [generation, enter]);
  const ended = view?.kind === 'ended' ? view.reason : null;
  useEffect(() => {
    if (!ended) return;
    operation.current++;
    setBusy(false);
    saved.current = null; clearPlayerSession();
    void offline.clear().catch(() => {});
    setPending(null);
    setError({ closed: 'Комната закрыта. Для новой встречи потребуется новое приглашение.', removed: 'Организатор удалил ваш вход. При необходимости войдите заново.', left: 'Вы вышли из комнаты.' }[ended]);
  }, [ended, offline.clear]);

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
    const previousStored = readPlayerSession();
    if (previousStored && previousStored.resumeKey !== session.resumeKey) await purgeOffline(`${previousStored.roomCode}:${previousStored.resumeKey}`).catch(() => {});
    try { savePlayerSession(session); }
    catch { setError('Браузер не позволяет сохранить вход. Разрешите хранилище сайта и повторите.'); return; }
    saved.current = session;
    await enter(session);
  }

  const firstGame = playerView?.room.game.firstGame;
  const sound = playerView && <PhoneSound key={playerView.room.id} view={playerView} scare={scare} online={connection === 'online' && authorizedGeneration === generation} clockOffset={clockOffset} claim={async enabled => {
      const result = await request('player:audio', { roomId: playerView.room.id, enabled });
      if (!result.ok) setError(describeError(result.error)); return result.ok;
    }} />;
  const sync = offline.available && playerView && <section aria-label="Синхронизация телефона">
      <p>{shellReady ? 'Офлайн-перезагрузка подготовлена. Сохраняйте этот адрес и браузер.' : 'Держите вкладку открытой: офлайн-перезагрузка пока недоступна. В локальном HTTP после закрытия вкладки потребуется связь с ноутбуком.'}</p><p role="status">{offline.pending ? `Сохранено на телефоне: ${offline.pending}. Ждёт отправки.` : offline.conflicts ? `Нужен разбор: ${offline.conflicts}.` : 'Все отправленные действия подтверждены сервером.'}</p>
      {offline.rejected.length > 0 && <p role="alert">Не зачтено действий: {offline.rejected.length}. Проверьте результат на базе: запись отклонена организатором, закрытием итога или правилами раунда.</p>}
      {playerView.synchronization?.withdrawn && <p>Вы пропускаете этот раунд. Вернитесь на базу; место в комнате сохранено.</p>}
    </section>;

  const liveConnection = connection === 'online' && authorizedGeneration !== generation ? 'connecting' : connection;
  const actions = playerView && <>    {playerView.room.game.firstGame && playerView.room.game.phase === 'placement' && !playerView.room.game.paused && playerView.play?.status === 'possessed' && !playerView.play.retained &&
      <section><label>Ваша локация<select value={playerView.play.location ?? ''} disabled={busy || connection !== 'online'} onChange={event => {
        if (event.target.value) void cardAction('play:location', { ...gameCommand(playerView.room), zone: event.target.value });
      }}><option value="">Выберите место</option>{playerView.room.game.venue.zones.map(zone => <option key={zone}>{zone}</option>)}</select></label></section>}
    {playerView.room.game.firstGame && playerView.room.game.phase === 'between_rounds' && playerView.presence && !playerView.presence.confirmed &&
      <button disabled={busy || connection !== 'online'} onClick={() => void cardAction('play:presence', { ...gameCommand(playerView.room), status: playerView.presence!.expected })}>
        {playerView.presence.expected === 'at_base' ? 'Я на базе' : 'Я в локации с группой'}
      </button>}
    {playerView.play && (!playerView.room.game.firstGame || ['search', 'return', 'between_rounds'].includes(playerView.room.game.phase)) && !playerView.synchronization?.withdrawn && <PlayControls view={playerView} disabled={offlineDisabled} run={cardAction} queue={offline.available ? offline.queue : undefined} online={liveConnection === 'online'} />}
    {!playerView.room.game.firstGame && ['placement', 'search', 'return'].includes(playerView.room.game.phase) && playerView.room.game.activePlayerIds.includes(playerView.playerId) && !playerView.synchronization?.withdrawn && <button data-danger disabled={offlineDisabled} onClick={() => { if (window.confirm('Пропустить текущий раунд и вернуться на базу? Остальные продолжают игру, место в комнате сохранится.')) { if (offline.available) void offline.queue({ kind: 'withdraw' }); else if (playerView.play) void cardAction('play:withdraw', { ...dealCommand(playerView.room), roomId: playerView.room.id, requestId: dealCommand(playerView.room).requestId, gameVersion: playerView.room.game.version, roundId: playerView.room.game.roundId, playVersion: playerView.play.version }); } }}>Пропустить этот раунд</button>}
</>;
  const cardId = playerView?.play?.cardKey ?? playerView?.assignment?.id;
  const card = playerView && <>    {offline.pendingCapture && <p>Вы отметили плен. Прочитайте задание на телефоне заразившего вас участника. Новая карточка появится после согласования с сервером.</p>}
    {(playerView.assignment || playerView.play) && !offline.pendingCapture && <PersonalCardPanel disclosure={firstGame ? { revealedCard, setRevealedCard } : undefined} firstGame={playerView.room.game.firstGame} tutorial={playerView.room.game.roundPlan.kind === 'tutorial'} infectionEnabled={playerView.room.game.roundPlan.infectionEnabled} assignment={playerView.play ? { ready: false, replacementRequested: false, id: playerView.play.cardKey, card: playerView.play.card } : playerView.assignment!} disabled={busy || connection !== 'online'} readOnly={playerView.room.game.phase !== 'reading' || !playerView.assignment} act={async (action, flag) => {
      const base = { ...dealCommand(playerView.room), assignmentId: playerView.assignment!.id };
      await cardAction(action, action === 'card:ready' ? { ...base, ready: flag } : { ...base, requested: flag });
    }} />}
</>;
  const roster = playerView && (<section>
      <h3>{playerView.room.players.find(player => player.id === playerView.playerId)?.name}, оставайтесь на связи</h3>
      <p>Комната <code>{playerView.room.code}</code></p>
      <p>Участников: {playerView.room.players.length} / {playerView.room.capacity}.</p>
      <ul>{playerView.room.players.map(player => <li key={player.id}>
        <span>{player.name}{player.id === playerView.playerId ? ' (вы)' : ''}</span><small>{player.online ? 'На связи' : 'Нет связи'}</small>
        {playerView.room.dealing.assignments.filter(item => item.playerId === player.id).map(item => <small key={item.assignmentId}>{playerView.room.game.phase === 'reading' ? item.replacementRequested ? 'Просит замену' : item.ready ? 'Прочитал' : 'Читает' : 'Карточка выдана'}</small>)}
        {!playerView.room.game.firstGame && !playerView.room.dealing.assignments.some(item => item.playerId === player.id) && <small>Ждёт следующей раздачи</small>}
      </li>)}</ul>
      <ConfirmButton data-danger disabled={busy || connection !== 'online'} native={!firstGame}
        title="Выйти из комнаты?" description="Ваше место освободится. Прежний вход перестанет действовать."
        confirm="Выйти из комнаты" onConfirm={async () => {
        const attempt = ++operation.current;
        setBusy(true); setError('');
        const result = await request('player:leave', { roomId: playerView.room.id });
        if (attempt !== operation.current) return;
        setBusy(false);
        if (!result.ok) setError(describeError(result.error));
      }}>Выйти из комнаты</ConfirmButton>
    </section>);
  const accepted = playerView?.synchronization?.receipts.filter(receipt => receipt.status === 'accepted').length ?? 0;
  const journal = playerView && ['search', 'return', 'between_rounds'].includes(playerView.room.game.phase) &&
    (accepted > 0 || offline.pending > 0 || offline.conflicts > 0 || offline.rejected.length > 0) &&
    <p className={styles.journal} role="status">Ждут отправки: {offline.pending} · Принято: {accepted} · На сверке: {offline.conflicts} · Отклонено: {offline.rejected.length}</p>;
  const toolbar = firstGame && playerView ? <>
    <span className={styles.connection} role="status" data-connection={liveConnection}>
      {liveConnection === 'online' ? 'На связи' : liveConnection === 'offline' ? 'Нет связи' : 'Подключаемся'}
    </span>
    <nav className={styles.toolbar} aria-label="Комната и справка">
      <DialogButton title="Звук и связь" aria-label="Настройки" keepMounted content={<>{sound}{sync}</>}>⚙</DialogButton>
      <DialogButton title="Комната" content={roster}>{playerView.room.game.venue.base || playerView.room.code}</DialogButton>
      <DialogButton title="Как играть и прорицания" aria-label="Как играть и прорицания" content={<>
        <p>Ходите по одному и шагом. О просьбе о помощи или остановке можно сообщить в любой момент.</p>
        {playerView.room.game.venue.dwelling && <p>Обитель: {playerView.room.game.venue.dwelling.zone}, {playerView.room.game.venue.dwelling.place}.</p>}
        <RitualBoard game={playerView.room.game} online={liveConnection === 'online'} />
      </>}>?</DialogButton>
    </nav>
    <RoundTimer game={playerView.room.game} clockOffset={offline.clockOffset} connection={liveConnection} />
  </> : undefined;

  return <LobbyShell toolbar={toolbar} title={playerView ? 'Вы внутри' : 'Войти в дом'} connection={connection} error={error} firstGame={playerView?.room.game.firstGame}>
    {!firstGame && sound}
    {offline.error && <p role="alert">{offline.error}</p>}
    {connection !== 'online' && (firstGame
      ? <div className={styles.offline} role="status">
        <span>{offline.available ? 'Карточка доступна. Отметки сохраняются на телефоне.' : 'Карточка доступна в этой вкладке.'}</span>
        <button onClick={reconnect}>Подключиться снова</button>
      </div>
      : <section><p role="alert">{playerView ? offline.available ? 'Нет связи. Карточка доступна; новые отметки сохраняются на телефоне. Состояние остальных участников не подтверждено.' : 'Нет связи. Последний экран сохранён во вкладке, но записать новые действия без хранилища нельзя.' : 'Нет связи. Для первого входа подключитесь к ноутбуку или интернету.'}</p><button onClick={reconnect}>Подключиться снова</button></section>)}
    {!firstGame && sync}
    {view?.persistence && view.persistence.state !== 'ready' && <p role="alert">Сохранение недоступно. Игра остановлена; ждите восстановления с ноутбука. Ваш вход сохранён.</p>}
    {pending && playerView && <button disabled={busy || connection !== 'online'} onClick={() => void cardAction(pending.command, pending.input)}>Повторить действие</button>}
    {!playerView ? <form onSubmit={event => { event.preventDefault(); void join(); }}>
      <label>Код комнаты<input value={roomCode} autoCapitalize="characters" autoComplete="off" maxLength={6} minLength={6} onChange={event => setRoomCode(event.target.value.toUpperCase())} required /></label>
      <label>Ваше имя<input value={name} autoComplete="nickname" maxLength={48} onChange={event => setName(event.target.value)} required /></label>
      <button disabled={busy || connection !== 'online'}>{busy ? 'Входим…' : 'Войти в комнату'}</button>
    </form> : <>
    {firstGame ? <div className={styles.scene} data-phase={playerView.room.game.phase}>
      <RoundStatus game={playerView.room.game} clockOffset={offline.clockOffset} connection={liveConnection}
      role={playerView.play?.card.role ?? playerView.assignment?.card.role} playStatus={playerView.play?.status} retained={playerView.play?.retained} waiting={!playerView.assignment && !playerView.play || playerView.synchronization?.withdrawn} showRitual={!playerView.room.game.firstGame} compact timerInHeader cardHidden={cardId ? revealedCard !== cardId : undefined}>
        {playerView.room.game.phase !== 'finished' && card}
        {actions}
        {journal}
        {playerView.room.game.phase === 'finished' && <>
          <RitualBoard game={playerView.room.game} online={liveConnection === 'online'} />
          <details><summary>История партии</summary><ResultsSummary results={playerView.room.game.results} firstGame /></details>
        </>}
      </RoundStatus>
    </div> : <>
      <RoundStatus game={playerView.room.game} clockOffset={offline.clockOffset} connection={connection === 'online' && authorizedGeneration !== generation ? 'connecting' : connection}
      role={playerView.play?.card.role ?? playerView.assignment?.card.role} playStatus={playerView.play?.status} retained={playerView.play?.retained} waiting={!playerView.assignment && !playerView.play || playerView.synchronization?.withdrawn} showRitual={!playerView.room.game.firstGame} compact={firstGame} />
      {actions}{card}{roster}
    </>}
</>}
  </LobbyShell>;
}
