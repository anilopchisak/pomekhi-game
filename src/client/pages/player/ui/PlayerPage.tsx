import styles from './PlayerScene.module.css';
import { PhoneSound } from './PhoneSound.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dealCommand, gameCommand, describeError, useLobbyConnection } from '../../../shared/api/index.js';
import { FullscreenButton, PhaseSignals, HowToPlay, ConfirmButton, DialogButton, LobbyShell, ResultsSummary, RitualBoard, RoundStatus, RoundTimer } from '../../../shared/ui/index.js';
import { clearPlayerSession, createResumeKey, readPlayerSession, savePlayerSession } from '../session.js';
import type { PlayerSession } from '../session.js';
import { PersonalCardActions, PersonalCardPanel } from './PersonalCardPanel.js';
import { purgeOffline } from '../model/offline-store.js';
import { useOfflinePlayer } from '../model/useOfflinePlayer.js';
import { PlayControls } from './PlayControls.js';
import type { LobbyCommand, LobbyInputs } from '../../../../shared/protocol.js';

type PrivateFormCommand = 'play:trial' | 'play:violation';
function isPrivateForm(command: LobbyCommand): command is PrivateFormCommand {
  return command === 'play:trial' || command === 'play:violation';
}

export function PlayerPage() {
  const { connection, generation, view, request, clockOffset, scare, cue, reconnect, resetView } = useLobbyConnection();
  const invitationCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  const initial = readPlayerSession();
  const saved = useRef(initial && (!invitationCode || initial.roomCode === invitationCode) ? initial : null);
  const operation = useRef(0);
  const [roomCode, setRoomCode] = useState(invitationCode || saved.current?.roomCode || '');
  const [name, setName] = useState(saved.current?.name ?? '');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState<{ command: PrivateFormCommand; roomId: string; roundId: string | null; message: string }>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ command: LobbyCommand; input: LobbyInputs[LobbyCommand] } | null>(null);
  const [authorizedGeneration, setAuthorizedGeneration] = useState(0);
  const liveConnection = connection === 'online' && authorizedGeneration !== generation ? 'connecting' : connection;
  const [roleControlsTarget, setRoleControlsTarget] = useState<HTMLDivElement | null>(null);
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
  const offlineDisabled = busy || !offline.available && liveConnection !== 'online';

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
    setFormError(undefined);
    setError({ closed: 'Комната закрыта. Для новой встречи потребуется новое приглашение.', removed: 'Организатор удалил ваш вход. При необходимости войдите заново.', left: 'Вы вышли из комнаты.' }[ended]);
  }, [ended, offline.clear]);

  async function cardAction<C extends LobbyCommand>(command: C, input: LobbyInputs[C], onSuccess?: () => void) {
    const attempt = ++operation.current;
    setBusy(true); setError('');
    setFormError(undefined);
    const result = await request(command, input);
    if (attempt !== operation.current) return;
    setBusy(false);
    if (!result.ok) {
      if (isPrivateForm(command)) {
        const { roomId, roundId } = input as LobbyInputs[PrivateFormCommand];
        const message = result.error !== 'INVALID_INPUT' ? describeError(result.error) :
          command === 'play:trial' ? 'Проверьте ответы и заполните нужные поля.' : 'Кратко опишите, что произошло на базе.';
        setFormError({ command, roomId, roundId, message });
      } else setError(describeError(result.error));
      setPending(result.error === 'TIMEOUT' || result.error === 'CONNECTION_LOST' ? { command, input } : null);
    } else { setPending(null); onSuccess?.(); }
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
  const sound = playerView && (firstGame ? <PhaseSignals key={playerView.room.id} cue={cue} enabled={Boolean(playerView.audioEnabled)} previewOnEnable allowVibration signalVolume={0.65}
      online={liveConnection === 'online' && playerView.persistence?.state !== 'write_error'} clockOffset={clockOffset}
      claim={async enabled => (await request('player:audio', { roomId: playerView.room.id, enabled })).ok} /> : <PhoneSound key={playerView.room.id} view={playerView} scare={scare} online={connection === 'online' && authorizedGeneration === generation} clockOffset={clockOffset} claim={async enabled => {
      const result = await request('player:audio', { roomId: playerView.room.id, enabled });
      if (!result.ok) setError(describeError(result.error)); return result.ok;
    }} />);
  const sync = offline.available && playerView && <section aria-label="Синхронизация телефона">
      <p>{shellReady ? 'Офлайн-перезагрузка подготовлена. Сохраняйте этот адрес и браузер.' : 'Держите вкладку открытой: офлайн-перезагрузка пока недоступна. В локальном HTTP после закрытия вкладки потребуется связь с ноутбуком.'}</p><p role="status">{offline.pending ? `Сохранено на телефоне: ${offline.pending}. Ждёт отправки.` : offline.conflicts ? `Нужен разбор: ${offline.conflicts}.` : 'Все отправленные действия подтверждены сервером.'}</p>
      {offline.rejected.length > 0 && <p role="alert">Не зачтено действий: {offline.rejected.length}. Проверьте результат на базе: запись отклонена организатором, закрытием итога или правилами раунда.</p>}
      {playerView.synchronization?.withdrawn && <p>Вы пропускаете этот раунд. Вернитесь на базу; место в комнате сохранено.</p>}
    </section>;

  function privateFeedback(command: PrivateFormCommand) {
    if (formError?.command !== command || formError.roomId !== playerView?.room.id || formError.roundId !== playerView.room.game.roundId) return null;
    return <>
      <p role="alert">{formError.message}</p>
      {pending?.command === command && <button type="button" disabled={busy || liveConnection !== 'online'} onClick={() => void cardAction(pending.command, pending.input)}>Повторить действие</button>}
    </>;
  }
  const violationCards = playerView?.room.game.ritual?.cards.filter(card => card.revealed && card.slot !== 'C') ?? [];
  const violationControl = playerView && playerView.room.game.firstGame && (violationCards.length > 0 || Boolean(playerView.violations?.length)) &&
    <DialogButton title="Доклады о прорицаниях" content={<>
      {playerView.canReportViolation &&
        <form onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          const slot = data.get('slot'), details = data.get('details');
          if ((slot === 'A' || slot === 'B') && typeof details === 'string') { void cardAction('play:violation', { ...gameCommand(playerView.room), slot, details }); }
        }}>
          <label>Открытое прорицание<select name="slot" required>{violationCards.map(card => card.revealed && <option key={card.slot} value={card.slot}>{card.card.title}</option>)}</select></label>
          <label>Что произошло на базе<input name="details" required maxLength={500} /></label>
          <button disabled={busy || liveConnection !== 'online'}>Отправить на сверку</button>
        </form>}
      {privateFeedback('play:violation')}
      <ul>{playerView.violations?.map(report => <li key={report.id}>{report.details} · {{ review: 'Ждёт сверки', applied: 'Штраф применён', rejected: 'Отклонено', dismissed: 'Закрыто без движения', reversed: 'Штраф отменён' }[report.status]}</li>)}</ul>
    </>}>Доклады о прорицаниях</DialogButton>;
  const trial = playerView?.trial;
  const trialContent = trial && playerView && <>
    <p>{trial.instruction}</p>
    {trial.message && <p role="status">{trial.message}</p>}
    {trial.submitted && <p>Ответ сохранён. Другие игроки его не видят.</p>}
    {trial.lateVisit && <p role="status">{{ review: 'Отчёт о повторном визите ждёт сверки.',
      accepted: 'Повторный визит подтверждён.', rejected: 'Отчёт о повторном визите отклонён.' }[trial.lateVisit]}</p>}
    {trial.reporter === 'witness' && trial.submitted && <ul aria-label="Ваши сохранённые ответы">
      {trial.fields.filter(field => field.id in trial.values).map(field => {
        const value = trial.values[field.id];
        return <li key={field.id}>{field.label} {typeof value === 'boolean' ? value ? 'Да' : 'Нет' : value}</li>;
      })}
    </ul>}
    {trial.canSubmit && <form key={trial.fields.map(field => field.id).join(':')} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const values = Object.fromEntries(trial.fields.flatMap(field => {
        const value = data.get(field.id);
        return typeof value === 'string' && value ? [[field.id, field.type === 'boolean' ? value === 'yes' : value]] : [];
      }));
      void cardAction('play:trial', { ...gameCommand(playerView.room), values });
    }}>
      {trial.fields.filter(field => !(field.id in trial.values)).map(field => <label key={field.id}>{field.label}
        {field.type === 'text' ? <input name={field.id} maxLength={160} /> :
          <select name={field.id}><option value="">Нет сведений</option>
            {field.type === 'boolean' ? <>{(!field.allowed || field.allowed.includes(true)) && <option value="yes">Да</option>}{(!field.allowed || field.allowed.includes(false)) && <option value="no">Нет</option>}</> :
              field.choices?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>}
      </label>)}
      <button disabled={busy || liveConnection !== 'online'}>Сохранить свидетельство</button>
    </form>}
    {privateFeedback('play:trial')}
  </>;
  const trialControl = trial && playerView && (!firstGame || trial.reporter === 'witness') &&
    <DialogButton key={playerView.room.game.roundId} title={trial.title} content={trialContent}>
      {trial.reporter === 'actor' ? 'Личное поручение Мастера' : 'Дать свидетельство'}
    </DialogButton>;
  const actorTrial = firstGame && trial?.reporter === 'actor' && <section aria-label="Личное поручение Мастера">
    <h3>{trial.title}</h3>
    {trialContent}
  </section>;
  const actions = playerView && <>    {playerView.room.game.firstGame && playerView.room.game.phase === 'placement' && !playerView.room.game.paused && playerView.play?.status === 'possessed' && !playerView.play.retained &&
      <section><label>Ваша локация<select value={playerView.play.location ?? ''} disabled={busy || liveConnection !== 'online'} onChange={event => {
        if (event.target.value) void cardAction('play:location', { ...gameCommand(playerView.room), zone: event.target.value });
      }}><option value="">Выберите место</option>{playerView.room.game.venue.zones.map(zone => <option key={zone}>{zone}</option>)}</select></label></section>}
    {playerView.room.game.firstGame && ['return', 'between_rounds'].includes(playerView.room.game.phase) &&
      !playerView.room.game.results.some(row => row.roundId === playerView.room.game.roundId && row.status === 'final') &&
      playerView.play && ['possessed', 'captured'].includes(playerView.play.status) && !playerView.play.unknownGroup && !playerView.play.location &&
      <label>Сообщить пропущенную локацию
        <select value={playerView.locationProposal ?? ''} disabled={busy || liveConnection !== 'online'} onChange={event => {
          if (event.target.value) void cardAction('play:location', { ...gameCommand(playerView.room), zone: event.target.value });
        }}><option value="">Выберите место</option>{playerView.room.game.venue.zones.map(zone => <option key={zone}>{zone}</option>)}</select>
        {playerView.locationProposal && <small>Ждёт подтверждения на ноутбуке.</small>}
      </label>}
    {playerView.play && (!playerView.room.game.firstGame || ['search', 'return', 'between_rounds'].includes(playerView.room.game.phase)) && !playerView.synchronization?.withdrawn && <PlayControls key={playerView.play.roundId} view={playerView} actorTrial={actorTrial} roleControlsTarget={roleControlsTarget} pendingReports={offline.pending > 0}
      feedback={<>{error && <p role="alert">{error}</p>}{offline.error && <p role="alert">{offline.error}</p>}
        {pending && !isPrivateForm(pending.command) && <button type="button" disabled={busy || liveConnection !== 'online'}
          onClick={() => void cardAction(pending.command, pending.input)}>Повторить действие</button>}</>} disabled={offlineDisabled} run={cardAction} queue={offline.available ? offline.queue : undefined} online={liveConnection === 'online'} estimatedSearchEnded={offline.estimatedSearchEnded} />}
    {!playerView.room.game.firstGame && ['placement', 'search', 'return'].includes(playerView.room.game.phase) && playerView.room.game.activePlayerIds.includes(playerView.playerId) && !playerView.synchronization?.withdrawn && <button data-danger disabled={offlineDisabled} onClick={() => { if (window.confirm('Пропустить текущий раунд и вернуться на базу? Остальные продолжают игру, место в комнате сохранится.')) { if (liveConnection !== 'online' && offline.available) void offline.queue({ kind: 'withdraw' }); else if (playerView.play) void cardAction('play:withdraw', { ...dealCommand(playerView.room), roomId: playerView.room.id, requestId: dealCommand(playerView.room).requestId, gameVersion: playerView.room.game.version, roundId: playerView.room.game.roundId, playVersion: playerView.play.version }); } }}>Пропустить этот раунд</button>}
</>;
  const assignment = playerView?.play
    ? { ready: false, replacementRequested: false, id: playerView.play.cardKey, card: playerView.play.card }
    : playerView?.assignment;
  const cardId = assignment?.id;
  const cardVisible = assignment && !offline.pendingCapture && !playerView?.play?.unknownGroup;
  const cardReadOnly = playerView?.room.game.phase !== 'reading' || !playerView.assignment;
  const cardActionsDisabled = busy || liveConnection !== 'online';
  const cardLayout = Boolean(firstGame && cardVisible && playerView?.room.game.phase !== 'finished');
  async function actOnCard(action: 'card:ready' | 'card:request', flag: boolean) {
    if (!playerView?.assignment) return;
    const base = { ...dealCommand(playerView.room), assignmentId: playerView.assignment.id };
    await cardAction(action, action === 'card:ready' ? { ...base, ready: flag } : { ...base, requested: flag });
  }
  const card = playerView && <>
    {offline.pendingCapture && <p>Вы отметили заражение. Прочитайте задание на телефоне заразившего вас участника. Новая карточка появится после согласования с сервером.</p>}
    {cardVisible && <PersonalCardPanel disclosure={firstGame ? { revealedCard, setRevealedCard } : undefined}
      firstGame={firstGame} tutorial={playerView.room.game.roundPlan.kind === 'tutorial'}
      infectionEnabled={playerView.room.game.roundPlan.infectionEnabled} assignment={assignment}
      disabled={cardActionsDisabled} readOnly={cardReadOnly} act={actOnCard} />}
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
      <ConfirmButton data-danger disabled={busy || liveConnection !== 'online'} native={!firstGame}
        title="Выйти из комнаты?" description={firstGame && playerView.room.game.phase === 'reading' && !playerView.room.game.started && playerView.room.players.length <= 5
          ? 'Прежний вход перестанет действовать. Для старта нужно пять игроков. Организатору придётся отменить раздачу и пригласить замену.'
          : 'Ваше место освободится. Прежний вход перестанет действовать.'}
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
  const playerRole = playerView?.play?.card.role ?? playerView?.assignment?.card.role;
  const playerName = playerView?.room.players.find(player => player.id === playerView.playerId)?.name;
  const toolbar = firstGame && playerView ? <>
    <span className={styles.connection} role="status" data-connection={liveConnection}>
      {liveConnection === 'online' ? 'На связи' : liveConnection === 'offline' ? 'Нет связи' : 'Подключаемся'}
      {playerName && <> · {playerName}</>}
    </span>
    <nav className={styles.toolbar} aria-label="Комната и справка">
      <DialogButton data-secondary title="Звук и связь" aria-label="Настройки" keepMounted content={<>{sound}<FullscreenButton />{sync}</>}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 3h4l.6 2.4 1.7 1 2.4-.7 2 3.5-1.8 1.7v2.2l1.8 1.7-2 3.5-2.4-.7-1.7 1L14 21h-4l-.6-2.4-1.7-1-2.4.7-2-3.5 1.8-1.7v-2.2L3.3 9.2l2-3.5 2.4.7 1.7-1L10 3Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </DialogButton>
      <DialogButton data-secondary title="Комната" content={roster}>{playerView.room.game.venue.base || playerView.room.code}</DialogButton>
      <DialogButton data-secondary title="Как играть" aria-label="Как играть и прорицания" content={<>
        <HowToPlay game={playerView.room.game} />
        <details>
          <summary>Открытые прорицания и свечи</summary>
          <RitualBoard game={playerView.room.game} online={liveConnection === 'online'} />
          {violationControl}
        </details>
      </>}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 4.1 1.9c-1 .8-1.6 1.2-1.6 2.6M12 16h.01" />
        </svg>
      </DialogButton>
    </nav>
  </> : undefined;

  return <LobbyShell toolbar={toolbar} title={playerView ? 'Вы внутри' : 'Войти в дом'} connection={connection} error={error}>
    {!firstGame && sound}
    {offline.error && <p role="alert">{offline.error}</p>}
    {connection !== 'online' && (firstGame
      ? <div className={styles.offline} role="status">
        <span>{offline.available ? 'Карточка доступна. Отметки сохраняются на телефоне.' : 'Карточка доступна в этой вкладке.'}</span>
        <button onClick={reconnect}>Подключиться снова</button>
      </div>
      : <section><p role="alert">{playerView ? offline.available ? 'Нет связи. Карточка доступна; новые отметки сохраняются на телефоне. Состояние остальных участников не подтверждено.' : 'Нет связи. Последний экран сохранён во вкладке, но записать новые действия без хранилища нельзя.' : 'Нет связи. Для первого входа подключитесь к ноутбуку или интернету.'}</p><button onClick={reconnect}>Подключиться снова</button></section>)}
    {!firstGame && sync}
    {playerView && persisted && connection === 'online' && liveConnection !== 'online' && <button disabled={busy}
      onClick={() => void enter(persisted)}>{busy ? 'Восстанавливаем вход…' : 'Повторить вход'}</button>}
    {view?.persistence && view.persistence.state !== 'ready' && <p role="alert">Сохранение недоступно. Игра остановлена; ждите восстановления с ноутбука. Ваш вход сохранён.</p>}
    {pending && !isPrivateForm(pending.command) && playerView && <button disabled={busy || liveConnection !== 'online'} onClick={() => void cardAction(pending.command, pending.input)}>Повторить действие</button>}
    {!playerView ? <form onSubmit={event => { event.preventDefault(); void join(); }}>
      <label>Код комнаты<input value={roomCode} autoCapitalize="characters" autoComplete="off" maxLength={6} minLength={6} onChange={event => setRoomCode(event.target.value.toUpperCase())} required /></label>
      <label>Ваше имя<input value={name} autoComplete="nickname" maxLength={48} onChange={event => setName(event.target.value)} required /></label>
      <button disabled={busy || connection !== 'online'}>{busy ? 'Входим…' : 'Войти в комнату'}</button>
    </form> : <>
    {firstGame ? <div className={styles.scene} data-card-layout={cardLayout} data-phase={playerView.room.game.phase}>
      <RoundStatus game={playerView.room.game} clockOffset={offline.clockOffset} connection={liveConnection} estimatedSearchEnded={offline.estimatedSearchEnded}
      role={playerView.play?.card.role ?? playerView.assignment?.card.role} playStatus={playerView.play?.status} unknownGroup={playerView.play?.unknownGroup} retained={playerView.play?.retained} waiting={!playerView.assignment && !playerView.play || playerView.synchronization?.withdrawn} showRitual={!playerView.room.game.firstGame} compact timerInHeader cardHidden={cardId ? revealedCard !== cardId : undefined}
      metadata={<div className={styles.phaseMeta}>
        {playerRole && !playerView.play?.unknownGroup && playerView.room.game.phase !== 'finished' && <span className={styles.role}>{playerRole === 'possessed' ? 'Одержимый' : 'Экзорцист'}</span>}
        <RoundTimer game={playerView.room.game} clockOffset={offline.clockOffset} connection={liveConnection} />
      </div>}>
        {playerView.room.game.phase !== 'finished' && card}
        {actions}
        {trialControl}
        {playerView.play?.status !== 'exorcist' && journal}
        {playerView.room.game.phase === 'finished' && <>
          <RitualBoard game={playerView.room.game} online={liveConnection === 'online'} />
        {violationControl}
          <details><summary>История партии</summary><ResultsSummary results={playerView.room.game.results} firstGame /></details>
        </>}
      </RoundStatus>
      {cardLayout && assignment && <PersonalCardActions roleControlsRef={setRoleControlsTarget} assignment={assignment} open={revealedCard === assignment.id}
        disabled={cardActionsDisabled} readOnly={cardReadOnly} act={actOnCard}
        toggle={() => setRevealedCard(revealedCard === assignment.id ? null : assignment.id)} />}
    </div> : <>
      <RoundStatus game={playerView.room.game} clockOffset={offline.clockOffset} connection={connection === 'online' && authorizedGeneration !== generation ? 'connecting' : connection}
      role={playerView.play?.card.role ?? playerView.assignment?.card.role} playStatus={playerView.play?.status} unknownGroup={playerView.play?.unknownGroup} retained={playerView.play?.retained} waiting={!playerView.assignment && !playerView.play || playerView.synchronization?.withdrawn} showRitual={!playerView.room.game.firstGame} compact={firstGame} />
      {actions}
        {trialControl}{card}{roster}
    </>}
</>}
  </LobbyShell>;
}
