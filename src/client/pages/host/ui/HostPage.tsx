import { CatalogEditor } from './CatalogEditor.js';
import broadcast from './Broadcast.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { dealCommand, gameCommand, describeError, useLobbyConnection } from '../../../shared/api/index.js';
import { FullscreenButton, PhaseSignals, HowToPlay, ConfirmButton, DialogButton, LobbyShell, ResultsSummary, RitualBoard, RoundStatus, RoundTimer } from '../../../shared/ui/index.js';
import { loadPublicInvitation, redeemOrganizerBootstrap, savedInvitationAddress, saveInvitationAddress } from '../bootstrap.js';
import { invitationUrl } from '../invitation.js';
import type { LobbyInputs, LobbyCommand, RoomSnapshot } from '../../../../shared/protocol.js';
import { DealControls } from './DealControls.js';
import { RecoveryControls } from './RecoveryControls.js';
import { PartySettings } from './FirstGameSetup.js';
import { FirstGameControls } from './FirstGameControls.js';
import { GameControls } from './GameControls.js';
import { SoundControls } from './SoundControls.js';

const storageKey = 'pomekhi.organizer';
function storedCode() { try { return sessionStorage.getItem(storageKey) ?? ''; } catch { return ''; } }

function ReadingStatus({ text }: { text: string }) {
  const tooltip = useRef<HTMLSpanElement>(null);

  function show(status: HTMLElement) {
    const popup = tooltip.current;
    if (!popup || status.scrollWidth <= status.clientWidth || typeof popup.showPopover !== 'function') return;
    const { left, bottom } = status.getBoundingClientRect();
    popup.style.top = `${bottom + 6}px`;
    popup.showPopover();
    popup.style.left = `${Math.max(8, Math.min(left, window.innerWidth - popup.offsetWidth - 8))}px`;
  }

  function hide() {
    tooltip.current?.hidePopover?.();
  }

  return <>
    <small tabIndex={0} onPointerEnter={event => show(event.currentTarget)} onPointerLeave={hide}
      onFocus={event => show(event.currentTarget)} onBlur={hide}
      onKeyDown={event => { if (event.key === 'Escape') hide(); }}>{text}</small>
    <span ref={tooltip} popover="manual" aria-hidden="true" className={broadcast.readingTooltip}>{text}</span>
  </>;
}

export function HostPage({ display = false, editor = false }: { display?: boolean; editor?: boolean }) {
  const { connection, generation, restored, view, request, requestCatalog, clockOffset, cue, resetView } = useLobbyConnection();
  const credential = useRef(storedCode());
  const operation = useRef(0);
  const prepareSound = useRef<(() => Promise<void>) | null>(null);
  const [effects, setEffects] = useState(() => { try { return sessionStorage.getItem('pomekhi.visuals') === 'on'; } catch { return false; } });
  const [code, setCode] = useState(credential.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [local, setLocal] = useState(() => savedInvitationAddress().startsWith('http:'));
  const [address, setAddress] = useState(savedInvitationAddress);
  const [publicAddress, setPublicAddress] = useState(savedInvitationAddress);
  const bootstrap = useRef<ReturnType<typeof redeemOrganizerBootstrap> | undefined>(undefined);
  const bootstrapHandled = useRef(false);
  const [invitationError, setInvitationError] = useState('');
  const [waitForTunnel, setWaitForTunnel] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<{ command: LobbyCommand; input: LobbyInputs[LobbyCommand] } | null>(null);
  const room = view?.kind === 'organizer' ? view.room : null;
  const persistence = view?.persistence;
  const disabled = busy || connection !== 'online' || !restored || persistence?.state !== undefined && persistence.state !== 'ready';
  const sync = room?.game.synchronization;
  const waitingForSync = room?.game.phase === 'between_rounds' && sync && !sync.closed && (sync.conflicts > 0 || sync.waitingPlayerIds.length > 0);
  const joinUrl = room && publicAddress ? invitationUrl(publicAddress, room.code, local) : '';

  const authorize = useCallback(async (value: string, createRoom = false) => {
    try { sessionStorage.setItem(storageKey, value); }
    catch { setError('Браузер не позволяет сохранить вход. Разрешите хранилище сайта и повторите.'); return; }
    credential.current = value;
    const attempt = ++operation.current;
    setBusy(true); setError('');
    const result = await request('organizer:authorize', { code: value });
    if (attempt !== operation.current) return;
    if (result.ok && createRoom && result.view.kind === 'organizer' && !result.view.room &&
      (!result.view.persistence || result.view.persistence.state === 'ready')) {
      const created = await request('room:create', {});
      if (attempt !== operation.current) return;
      if (!created.ok) setError(describeError(created.error));
    }
    setBusy(false);
    if (!result.ok) {
      setError(describeError(result.error));
      if (result.error === 'INVALID_ORGANIZER_CODE' || result.error === 'INVALID_INPUT') {
        credential.current = '';
        resetView(); setCode(''); setPending(null);
        try { sessionStorage.removeItem(storageKey); } catch { /* The credential is already cleared in memory. */ }
      }
    }
  }, [request, resetView]);

  useEffect(() => {
    if (!generation) return;
    if (!bootstrapHandled.current && !display && !editor && (bootstrap.current || location.hash)) {
      let active = true;
      setBusy(true);
      bootstrap.current ??= redeemOrganizerBootstrap();
      void bootstrap.current.then(result => {
        if (!active) return;
        bootstrapHandled.current = true;
        if (result) {
          setWaitForTunnel(result.waitForTunnel);
          setLocal(result.local);
          setAddress(result.address);
          setPublicAddress(result.address);
          saveInvitationAddress(result.address);
          void authorize(result.code, result.createRoom);
        } else if (credential.current) void authorize(credential.current);
        else setBusy(false);
      }).catch(() => {
        if (!active) return;
        bootstrapHandled.current = true;
        setBusy(false);
        setError('Автоматический вход недоступен. Введите код организатора из окна запуска.');
      });
      return () => { active = false; };
    }
    if (credential.current) void authorize(credential.current);
  }, [generation, authorize, display, editor]);
  useEffect(() => {
    if (!waitForTunnel || publicAddress || view?.kind !== 'organizer') return;
    const abort = new AbortController();
    let timer: number | undefined;
    const deadline = Date.now() + 60000;
    async function check() {
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(3000)]);
      const origin = await loadPublicInvitation(signal).catch(() => undefined);
      if (abort.signal.aborted) return;
      if (origin) {
        setLocal(false);
        setAddress(origin);
        setPublicAddress(origin);
        saveInvitationAddress(origin);
        setWaitForTunnel(false);
      } else if (Date.now() < deadline) timer = window.setTimeout(() => void check(), 1000);
      else setWaitForTunnel(false);
    }
    void check();
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [waitForTunnel, publicAddress, view?.kind]);

  useEffect(() => {
    let cancelled = false;
    setQr(''); setCopied(false);
    if (joinUrl) void QRCode.toDataURL(joinUrl, { width: 280, margin: 4, errorCorrectionLevel: 'M' }).then(value => {
      if (!cancelled) setQr(value);
    }).catch(() => { if (!cancelled) setInvitationError('Не удалось построить QR. Можно скопировать ссылку или ввести код комнаты.'); });
    return () => { cancelled = true; };
  }, [joinUrl]);

  async function run<Command extends LobbyCommand>(command: Command, input: LobbyInputs[Command], onSuccess?: () => void) {
    const attempt = ++operation.current;
    setBusy(true); setError('');
    if (command.startsWith('round:') || command === 'party:finish') await prepareSound.current?.();
    if (attempt !== operation.current) return;
    const result = await request(command, input);
    if (attempt !== operation.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(command === 'venue:configure' && result.error === 'INVALID_INPUT'
        ? 'Проверьте названия локаций, место Обители и список участников.' : describeError(result.error));
      setPending(result.error === 'TIMEOUT' || result.error === 'CONNECTION_LOST' ? { command, input } : null);
    } else {
      setPending(null);
      onSuccess?.();
    }
  }

  const firstGame = Boolean(room?.game.firstGame && !editor);
  const liveConnection = connection === 'online' && !restored ? 'connecting' : connection;
  const invitation = room && (<section>
        <h3>Комната <code>{room.code}</code></h3>
        <form onSubmit={event => {
          event.preventDefault();
          try { invitationUrl(address, room.code, local); setPublicAddress(address.trim()); saveInvitationAddress(address.trim()); setInvitationError(''); }
          catch { setInvitationError('Укажите HTTPS-адрес Tuna или включите локальный режим для HTTP-адреса ноутбука. Пути и параметры не нужны.'); }
        }}>
          <label><input type="checkbox" checked={local} onChange={e => { setWaitForTunnel(false); setLocal(e.target.checked); setPublicAddress(''); saveInvitationAddress(''); setInvitationError(''); }} /> Локальное подключение</label>
          <p>{local ? 'Все телефоны и ноутбук должны быть в одной сети. Возьмите адрес Local player address из окна запуска. Адрес выбирается до входа; автоматического переноса между сайтами нет.' : 'Вставьте HTTPS-адрес Tuna.'}</p>
          <label>{local ? 'Локальный адрес ноутбука' : 'Адрес Tuna'}<input type="url" value={address} placeholder="https://…" onChange={event => setAddress(event.target.value)} required /></label>
          <button>Показать приглашение</button>
        </form>
        {joinUrl && <>
          <label>Ссылка для участников<input readOnly value={joinUrl} onFocus={event => event.target.select()} /></label>
          <button onClick={() => {
            void navigator.clipboard?.writeText(joinUrl).then(() => { setCopied(true); setInvitationError(''); })
              .catch(() => setInvitationError('Выделите и скопируйте ссылку из поля вручную.'));
            if (!navigator.clipboard) setInvitationError('Выделите и скопируйте ссылку из поля вручную.');
          }}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button>
          {qr && <img src={qr} width={280} height={280} alt="QR-код приглашения в комнату" />}
          <p>Отсканируйте QR или откройте ссылку. Если вводите адрес сайта вручную, используйте код комнаты.</p>
        </>}
        {!display && <>
        <ConfirmButton data-danger disabled={disabled} native={!room.game.firstGame} title="Закрыть комнату?"
          description="Все участники выйдут. Прежнее приглашение перестанет действовать." confirm="Закрыть комнату"
          onConfirm={() => void run('room:close', { roomId: room.id })}>Закрыть комнату</ConfirmButton>
          {room.game.firstGame && <ConfirmButton data-danger disabled={disabled} title="Начать новую партию?"
            description="Текущая партия завершится, и откроется пустая комната с новым кодом." confirm="Создать новую комнату"
            onConfirm={() => void run('room:restart', { roomId: room.id })}>Новая партия</ConfirmButton>}
        </>}
        {waitForTunnel && !publicAddress && <p role="status">Ждём адрес Tuna. Ссылка и QR появятся автоматически.</p>}
        {invitationError && <p role="alert">{invitationError}</p>}
      </section>);
  const settings = room && view?.kind === 'organizer' && <><section aria-label="Экран">
        <label><input type="checkbox" checked={effects} onChange={e => { setEffects(e.target.checked); try { sessionStorage.setItem('pomekhi.visuals', e.target.checked ? 'on' : 'off'); } catch { /* Visual effects still work. */ } }} /> Эффект старого телевизора</label>
        {!display && !room.game.firstGame && <label><input type="checkbox" disabled={disabled} checked={room.phoneScaresEnabled} onChange={e => void run('organizer:atmosphere', { roomId: room.id, enabled: e.target.checked })} /> Редкие эффекты на телефонах</label>}
        <FullscreenButton />
        {display && <a href="/?screen=host">Открыть пульт</a>}
      </section>
      {room.game.firstGame && <PhaseSignals key={room.id} cue={cue} enabled={view.audioEnabled}
        online={connection === 'online' && restored && (!persistence || persistence.state === 'ready')} clockOffset={clockOffset}
        claim={async enabled => (await request('organizer:audio', { enabled })).ok} />}
      {room.game.firstGame && !display && <TimerSettings key={`${room.id}:${room.game.settings.placementSeconds}:${room.game.settings.searchSeconds}:${room.game.settings.offlineWaitSeconds ?? 90}`} room={room} disabled={disabled} error={error} run={run} />}
      {!room.game.firstGame && <SoundControls game={room.game} online={connection === 'online' && restored && persistence?.state !== 'write_error' && persistence?.state !== 'load_error'} enabled={view.audioEnabled} disabled={disabled} cue={cue} prepareRef={prepareSound} gameVersion={room.game.version} clockOffset={clockOffset} claim={async enabled => {
        const result = await request('organizer:audio', { enabled });
        if (!result.ok) setError(describeError(result.error));
        if (result.ok && display && enabled) window.scrollTo(0, 0);
        return result.ok;
      }} />}</>;
  const roster = room && (<section>
        <h3>Участники: {room.players.length} / {room.capacity}</h3>
        <p>Организатор тоже входит с телефона. Этот экран не занимает место.</p>
        {room.players.length ? <ul>{room.players.map(player => <li key={player.id}>
          <span>{player.name}</span><small>{player.online ? 'На связи' : 'Нет связи'}</small>
          {room.dealing.assignments.filter(item => item.playerId === player.id).map(item => <span key={item.assignmentId}>
            <small>{room.game.phase === 'reading' ? item.replacementRequested ? 'Просит замену' : item.ready ? 'Прочитал' : 'Читает' : room.game.activePlayerIds.includes(player.id) ? 'В составе раунда' : 'Ждёт раздачи'}</small>
            {room.game.phase === 'reading' && <button disabled={disabled} onClick={() => void run('deal:replace', {
              ...dealCommand(room), playerId: player.id, assignmentId: item.assignmentId,
            })} aria-label={`Заменить карточку ${player.name}`}>Заменить карточку</button>}
          </span>)}
          {!room.dealing.assignments.some(item => item.playerId === player.id) && <small>Ждёт следующей раздачи</small>}
        </li>)}</ul> : <p>Пока здесь тихо. Ждём первого участника.</p>}

      </section>);
  const checkingPresence = room?.game.phase === 'return' || room?.game.phase === 'between_rounds' && room.game.results.at(-1)?.status === 'provisional';
  const cleanReview = room?.game.phase === 'between_rounds' && room.game.results.at(-1)?.status === 'provisional' && !waitingForSync;
  const work = room && view?.kind === 'organizer' && <>
      {room.game.firstGame && (checkingPresence || ['between_rounds', 'finished'].includes(room.game.phase) && Boolean(view.presence?.length)) && <section aria-label="Физический статус">
        <h3>Кто где после призыва</h3>
        {!cleanReview && room.game.offlineWait && <p role="status">{room.game.offlineWait.awaitingReview
          ? 'Время истекло. Сначала разберите спорные отметки о возвращении.'
          : room.game.offlineWait.deadline <= room.game.serverNow ? 'Время ожидания истекло. Сверка остаётся открытой.'
          : `Ожидание участников без связи · ${Math.ceil((room.game.offlineWait.deadline - room.game.serverNow) / 1000)} с`}</p>}
        <ul>{room.players.map(player => {
          const item = view.presence?.find(status => status.playerId === player.id);
          const state = item?.status;
          const label = state ? { exorcist: 'Свободен', released: 'Освобождён', possessed: 'Одержимый', captured: 'Заражён' }[state] : 'Нет подтверждения';
          const atBase = item?.expected === 'at_base' && item.confirmed;
          const canMarkBase = checkingPresence && !player.online && item?.expected === 'at_base' && !atBase;
          const canCorrect = checkingPresence && item && (!player.online || item.unknownGroup);
          const groups = view.presence?.filter(row => row.expected === 'in_group' && !row.unknownGroup && row.playerId !== player.id) ?? [];
          return <li key={player.id} className={broadcast.presenceItem}>
            <label className={broadcast.presenceRow}>
              <span>{player.name}<small>{!player.online && 'Нет связи · '}{!player.online && !item?.confirmed && state ? `Последний статус: ${label}` : label}{item?.unknownGroup && ' · группа неизвестна'}</small></span>
              <input type="checkbox" checked={Boolean(atBase)} disabled={disabled || !canMarkBase}
                aria-label={`${player.name} · На базе`}
                onChange={() => void run('round:presence', { ...gameCommand(room), playerId: player.id, status: 'at_base' })} />
            </label>
            {canCorrect && state === 'exorcist' && !atBase && <button type="button" data-secondary disabled={disabled}
              onClick={() => void run('round:reconcile', { ...gameCommand(room), playerId: player.id, correction: 'infected' })}>Заражён</button>}
            {canCorrect && item.expected === 'in_group' && <button type="button" data-secondary disabled={disabled}
              onClick={() => void run('round:reconcile', { ...gameCommand(room), playerId: player.id, correction: 'released' })}>Освобождён</button>}
            {checkingPresence && item?.unknownGroup && groups.length > 0 && <form onSubmit={event => {
              event.preventDefault();
              const groupMemberId = new FormData(event.currentTarget).get('group');
              if (typeof groupMemberId === 'string' && groupMemberId) void run('round:reconcile', { ...gameCommand(room), playerId: player.id, correction: 'assign', groupMemberId });
            }}>
              <label>Участник известной группы<select name="group" required disabled={disabled}><option value="">Выберите имя</option>
                {groups.map(row => <option key={row.playerId} value={row.playerId}>{room.players.find(member => member.id === row.playerId)?.name}</option>)}
              </select></label>
              <button disabled={disabled}>Подтвердить группу</button>
            </form>}
          </li>;
        })}</ul>
      </section>}
      {view.trialReview && (!cleanReview || view.trialReview.reports.length > 0 || view.trialReview.lateVisit?.status === 'review') && <section aria-label="Сверка свидетельств испытания">
        <h3>Испытание Мастера</h3>
        <p>{view.trialReview.status === 'unavailable' ? 'Цель недоступна. Испытание закроется без бонуса.' :
          view.trialReview.status === 'waiting' ? 'Часть свидетельств отсутствует. Итог учитывает только подтверждённые факты.' :
          view.trialReview.status === 'conflict' ? 'Участники описали один факт по-разному. Проверьте свидетельства.' : 'Сверьте свидетельства участников.'} Предварительный бонус: {view.trialReview.bonus}.</p>
        {view.trialReview.lateVisit && <div>
          <p>{{ review: 'Повторный визит в Обитель. Игрок сообщил после призыва, что завершил визит до него.',
            accepted: 'Поздний отчёт о повторном визите подтверждён.', rejected: 'Поздний отчёт о повторном визите отклонён.' }[view.trialReview.lateVisit.status]}</p>
          {view.trialReview.lateVisit.status === 'review' && ([true, false] as const).map(accepted => <ConfirmButton key={String(accepted)}
            title={accepted ? 'Подтвердить повторный визит?' : 'Отклонить отчёт о повторном визите?'}
            description={accepted ? 'Уточните, что игрок завершил повторный визит до общего призыва.' : 'Первый визит и ранний возврат останутся в записи.'}
            confirm={accepted ? 'Подтвердить визит' : 'Отклонить отчёт'} disabled={disabled}
            onConfirm={() => void run('round:trial-review', { ...gameCommand(room), playerId: view.trialReview!.lateVisit!.playerId, fact: 'repeat', accepted })}>
            {accepted ? 'Подтвердить повторный визит' : 'Отклонить повторный визит'}
          </ConfirmButton>)}
        </div>}
        {view.trialReview.traitComparisons?.map(row => <div key={`${row.playerId}:${row.trait}`}>
          <p>{room.players.find(player => player.id === row.playerId)?.name ?? 'Ушедший участник'} · {row.label}</p>
          <p>Записанный признак · {row.original}. Ответ свидетеля · {row.answer}.</p>
          <button type="button" aria-pressed={row.equivalent} disabled={disabled}
            onClick={() => void run('round:trial-review', { ...gameCommand(room), playerId: row.playerId, fact: row.trait, accepted: !row.equivalent })}>
            {row.equivalent ? 'Признак признан равнозначным' : 'Признать признак равнозначным'}
          </button>
        </div>)}
        {view.trialReview.reports.map(report => <details key={report.playerId}>
          <summary>{room.players.find(player => player.id === report.playerId)?.name ?? 'Ушедший участник'} · {report.accepted ? 'Учтено' : 'Отклонено'}</summary>
          <ul>{report.facts.map(fact => <li key={fact.label}>{fact.label} {typeof fact.value === 'boolean' ? fact.value ? 'Да' : 'Нет' : fact.value}</li>)}</ul>
          <ConfirmButton title={report.accepted ? 'Исключить свидетельство?' : 'Вернуть свидетельство?'} confirm="Подтвердить решение"
            description="Проверьте сообщённые факты. Итог испытания пересчитает компьютер."
            disabled={disabled} onConfirm={() => void run('round:trial-review', { ...gameCommand(room), playerId: report.playerId, accepted: !report.accepted })}>
            {report.accepted ? 'Отклонить свидетельство' : 'Принять свидетельство'}
          </ConfirmButton>
        </details>)}
      </section>}
      {view.violations && view.violations.some(report => !cleanReview || report.status === 'review') && <section aria-label="Доклады о прорицаниях">
        <h3>Доклады о прорицаниях</h3>
        <ul>{view.violations.map(report => {
          const rule = room.game.ritual?.cards.find(card => card.slot === report.slot);
          const preview = room.game.ritual?.penaltyPreview;
          const open = report.status === 'review' && ['reading', 'between_rounds'].includes(room.game.phase);
          const outcome = { review: 'Ждёт сверки', applied: 'Штраф применён', rejected: 'Отклонено', dismissed: 'Закрыто без движения', reversed: 'Штраф отменён' }[report.status];
          return <li key={report.id}><p>{room.players.find(player => player.id === report.reporterId)?.name ?? 'Ушедший участник'} · {outcome}</p>
            {rule?.revealed && <p>{rule.card.title}: {rule.card.rule}</p>}<p>{report.details}</p>
            {open && <><ConfirmButton eyebrow="Ритуал · сверка нарушения" title={preview ? "Подтвердить шаг назад?" : "Закрыть доклад без движения?"} confirm={preview ? 'Применить штраф' : 'Закрыть без движения'}
              description={preview ? <>
                <p>Сверьте факт нарушения и исключения.</p>
                <div data-dialog-panel>
                  <strong>{room.game.ritual?.positions.slice(0, 3).join(' / ')} → {preview.positions.slice(0, 3).join(' / ')}</strong>
                  <p>Останется шагов: {preview.remainingSteps}. Открытые прорицания сохранятся.</p>
                </div>
                <div data-dialog-panel><strong>Одно нарушение · одно начисление</strong>
                  <p>После подтверждения можно пропустить движение свечи.</p></div>
              </> : 'Крупнейшая стопка спорная. Свечи и открытые условия сохранятся.'}
              disabled={disabled} onConfirm={() => void run('ritual:review', { ...gameCommand(room), reportId: report.id, accept: true })}>Подтвердить нарушение</ConfirmButton>
              <ConfirmButton title="Отклонить доклад?" confirm="Отклонить" disabled={disabled} onConfirm={() => void run('ritual:review', { ...gameCommand(room), reportId: report.id, accept: false })}>Отклонить доклад</ConfirmButton></>}
          </li>;
        })}</ul>
      </section>}
      <RecoveryControls request={request} missingLocations={view.missingLocations} room={room} review={view.review ?? []} disabled={disabled} run={run} />
      {(!room.game.firstGame || room.game.phase === 'between_rounds' && !cleanReview) &&
        <DealControls room={room} disabled={disabled || Boolean(waitingForSync) || room.game.settings.ritualEnabled && room.game.results.at(-1)?.status === 'provisional'} run={run} />}</>;
  const toolbar = firstGame && room ? <>
    <div className={broadcast.roomIdentity}>
      <DialogButton key={room.id} data-secondary title="Приглашение" aria-label={`Приглашение · код комнаты ${room.code}`} content={invitation}><code>{room.code}</code></DialogButton>
      <span role="status" data-connection={liveConnection}>{liveConnection === 'online' ? 'Связь установлена' : liveConnection === 'offline' ? 'Нет связи' : 'Восстанавливаем связь'}</span>
    </div>
    <div className={broadcast.tools}>
      {(room.game.paused || room.game.deadline !== null) && <div className={broadcast.clock}>
        <span>{room.game.paused ? 'Пауза' : 'Осталось'}</span>
        <RoundTimer game={room.game} clockOffset={clockOffset} connection={liveConnection} />
      </div>}
      <DialogButton data-secondary title="Как играть" content={<HowToPlay game={room.game} />}>Как играть</DialogButton>
      <DialogButton data-secondary title="Сюжет" content={room.game.story ? <>
        <h3>{room.game.story.title}</h3><p className={broadcast.prologue}>{room.game.story.prologue}</p>
      </> : <p>Сюжет пока недоступен. Проверьте, что сервер запущен из актуальной сборки.</p>}>Сюжет</DialogButton>
      {!display && <PartySettings key={room.id} room={room} disabled={disabled} run={run} error={error}
        retry={pending?.command === 'venue:configure' && <button type="button" data-secondary disabled={disabled}
          onClick={() => void run(pending.command, pending.input)}>Повторить сохранение</button>} />}
      <DialogButton data-secondary title="Настройки" keepMounted content={<>
        {settings}
        {!display && persistence?.state === 'ready' && <p className={broadcast.saveNote} role="status">
          {persistence.recovered ? 'Партия восстановлена.' : persistence.mode === 'disk' ? 'Автосохранение включено.' : 'Партия хранится в памяти.'}
        </p>}
        {room.game.phase === 'finished' && <section>
          <h3>История партии</h3>
          <ResultsSummary results={room.game.results} firstGame />
          {!display && work}
        </section>}
        {!display && <><p><a href="/?screen=display" target="_blank" rel="opener">Открыть эфир</a> · <a href="/?screen=editor" target="_blank" rel="opener">Редактор карточек</a></p></>}
      </>}>Настройки</DialogButton>
    </div>
  </> : undefined;

  return <div className={broadcast.frame} data-effects={effects} data-display={display} data-first-game={firstGame}><LobbyShell toolbar={toolbar} wide={display || room?.game.firstGame} title={editor ? "Редактор карточек" : display ? "Эфир дома" : "Пульт дома"} connection={connection} error={error}>
    {display && persistence && persistence.state !== 'ready' && <p role="alert">Сохранение недоступно. Игра остановлена; откройте пульт для восстановления.</p>}
    {!display && view?.kind === 'organizer' && (!room?.game.firstGame || persistence?.state !== 'ready') && <section aria-label="Сохранение партии">
      <h3>Сохранение партии</h3>
      <p role="status">{persistence?.mode === 'disk' ? persistence.state === 'ready' ? 'Автосохранение включено.' : 'Ошибка сохранения. Продвижение игры остановлено.' : 'Тестовый режим: партия хранится только в памяти.'}</p>
      {persistence?.recovered && <p>Партия восстановлена. {room?.game.paused && room.game.pauseReason === 'server_restarted' ? 'Начатый раунд на паузе; продолжите его вручную после проверки участников.' : 'Карточки и итоги сохранены.'}</p>}
      {persistence && persistence.state !== 'ready' && <>
        <p role="alert">{persistence.state === 'load_error' ? 'Не удалось загрузить сохранение. Файл не заменён. Проверьте доступ к диску и повторите загрузку.' : 'Изменение не подтверждено. Проверьте текущее состояние после восстановления записи.'}</p>
        <button disabled={busy || liveConnection !== 'online'} onClick={() => void run('storage:retry', {})}>Повторить загрузку и запись</button>
        <button data-danger disabled={busy || liveConnection !== 'online'} onClick={() => {
          if (window.confirm('Сбросить сохранённую партию? Участники и карточки будут удалены; пользовательский банк вернётся к стандартным 90 карточкам. Исходный файл останется на диске для диагностики.')) void run('storage:reset', { confirm: true });
        }}>Сбросить сохранение</button>
      </>}
    </section>}
    {view?.kind === 'organizer' && credential.current && connection === 'online' && !restored && <button disabled={busy}
      onClick={() => void authorize(credential.current)}>{busy ? 'Восстанавливаем вход…' : 'Повторить вход'}</button>}
    {pending && <button disabled={disabled} onClick={() => void run(pending.command, pending.input)}>Повторить действие</button>}
    {view?.kind !== 'organizer' ? <form onSubmit={event => { event.preventDefault(); void authorize(code.trim().toUpperCase()); }}>
      <h3>Вход организатора</h3>
      <p>Код находится в окне запуска программы на ноутбуке. Участникам нужен только код комнаты.</p>
      <label>Код организатора<input type="password" autoComplete="off" value={code} maxLength={12} onChange={event => setCode(event.target.value)} required /></label>
      <button disabled={busy || connection !== 'online'}>{busy ? 'Проверяем…' : 'Войти'}</button>
    </form> : editor ? <CatalogEditor request={requestCatalog} disabled={disabled || !restored} editable={!room || ['lobby', 'between_rounds', 'finished'].includes(room.game.phase)} generation={generation} /> : !room ? <section>
      <p>{display ? 'Ожидаем комнату. Создайте её с пульта организатора.' : 'Соберите всех у экрана. Создайте комнату и пригласите участников с телефонов.'}</p>
      {display ? <a href="/?screen=host">Открыть пульт</a> : <button disabled={disabled} onClick={() => void run('room:create', {})}>Создать комнату</button>}
      {!display && <a href="/?screen=editor" target="_blank" rel="opener">Редактор карточек</a>}
    </section> : <>
      <div className={room.game.firstGame ? broadcast.ritualRoom : display ? broadcast.display : undefined}>
      {firstGame && <section className={broadcast.roster} aria-label="Участники за столом"
        data-organizer={!display} data-reading={room.game.phase === 'reading'}>
        <div className={broadcast.rosterHeader}>
          <h3>Участники <span>{room.players.length}/{room.capacity}</span></h3>
          {!display && room.game.phase === 'reading' && <ConfirmButton data-secondary className={broadcast.rosterIcon}
            aria-label="Перевыдать карточки" title="Перевыдать карточки?"
            description="Все участники текущей раздачи получат новые карточки и отметят готовность заново."
            confirm="Перевыдать карточки" disabled={disabled}
            onConfirm={() => void run('deal:shuffle', {
              ...dealCommand(room),
              possessedCount: Math.min(room.dealing.initialPossessedCount ?? 3, Math.max(1, Math.floor(room.players.length / 2))),
            })}><span aria-hidden="true">↻</span></ConfirmButton>}
        </div>
        <ol tabIndex={0} aria-label="Список участников">{[...room.players].sort((a, b) => {
          return a.name.localeCompare(b.name, 'ru');
        }).map((player, index) => {
          const role = view.roles?.[player.id];
          const physical = view.presence?.find(item => item.playerId === player.id);
          const assignment = room.dealing.assignments.find(item => item.playerId === player.id);
          const checking = ['return', 'between_rounds'].includes(room.game.phase);
          return <li key={player.id}>
            <span className={broadcast.seat}>{String(index + 1).padStart(2, '0')}</span>
            <div className={broadcast.playerName}><strong title={player.name}>{player.name}</strong>
              <small title={`${role ? (role === 'exorcist' ? 'Экзорцист · ' : 'Одержимый · ') : ''}${player.online ? 'на связи' : 'нет связи'}`}
                data-roster-online={player.online}>
                {role && <>{role === 'exorcist' ? 'Экзорцист' : 'Одержимый'} · </>}{player.online ? 'на связи' : 'нет связи'}
              </small>
            </div>
            <div className={broadcast.playerState}>
              {room.game.phase === 'reading' && assignment && <ReadingStatus text={assignment.replacementRequested ? 'Просит замену' : assignment.ready ? 'Готов' : 'Читает'} />}
              {!display && room.game.phase === 'reading' && assignment && <button type="button" data-secondary className={broadcast.rosterIcon}
                title="Заменить карточку" aria-label={`Заменить карточку ${player.name}`} disabled={disabled} onClick={() => void run('deal:replace', {
                  ...dealCommand(room), playerId: player.id, assignmentId: assignment.assignmentId,
                })}>↻</button>}
              {checking && !display && <small>{physical ? physical.confirmed
                ? physical.expected === 'at_base' ? 'На базе' : 'С группой'
                : physical.expected === 'at_base' ? 'Ожидается на базе' : 'Ожидается в группе'
                : 'Статус неизвестен'}</small>}
              {!checking && room.game.phase !== 'reading' && role && <small>В игре</small>}
            </div>
          </li>;
        })}</ol>
      </section>}
      <div className={broadcast.mainScene} data-phase={room.game.phase}>
      {!firstGame && <p key={`${room.game.phase}:${room.game.paused}`} className={broadcast.banner}>{room.game.paused ? 'ЗАПИСЬ ПРИОСТАНОВЛЕНА' : ({ lobby: 'ОЖИДАНИЕ СИГНАЛА', reading: 'ЛИЧНЫЕ ЗАПИСИ ПОЛУЧЕНЫ', placement: 'ЗАЙМИТЕ СВОИ МЕСТА', search: 'ДОМ СЛУШАЕТ', return: 'ВОЗВРАЩАЙТЕСЬ НА БАЗУ', between_rounds: 'СВЕРЬТЕ ПОКАЗАНИЯ', finished: 'ЗАПИСЬ ЗАВЕРШЕНА' }[room.game.phase])}</p>}
      {firstGame && room.game.phase === 'lobby' ? <section className={broadcast.inviteScene}>
        <p>Приглашение</p>
        <h3 data-scene-heading tabIndex={-1}>Пригласите участников</h3>
        <p>{qr ? 'Сканируйте QR с телефона.' : 'Введите код комнаты на телефоне.'} Организатор тоже входит как игрок.</p>
        <div className={broadcast.inviteCode}>
          {qr && <img src={qr} width={280} height={280} alt="QR-код приглашения в комнату" />}
          <p>Код комнаты · <code>{room.code}</code></p>
          <small>{qr ? 'Приглашение доступно по коду сверху.' : 'Чтобы получить ссылку и QR, нажмите на код в верхней панели.'}</small>
        </div>
      </section> : firstGame && room.game.phase === 'reading' ? <section>
        <p>Чтение · без таймера</p>
        <h3 data-scene-heading tabIndex={-1}>Прочитайте свои карточки</h3>
        <p>На чтение можно взять сколько угодно времени. Неудобное задание можно заменить значком рядом с именем до старта.</p>
        <div className={broadcast.readiness} role="status">
          <strong>Готовы {room.dealing.assignments.filter(item => item.ready).length} из {room.dealing.assignments.length}</strong>
          <p>Раунд не начнётся автоматически. Дождитесь, пока все прочитают карточки.</p>
        </div>
      </section> : <RoundStatus game={room.game} clockOffset={clockOffset} connection={firstGame ? liveConnection : connection} showRitual={!firstGame} compact={firstGame} timerInHeader={firstGame}>
        {firstGame && ['placement', 'search'].includes(room.game.phase) && <span className={broadcast.phaseMark} aria-hidden="true" />}
      </RoundStatus>}
      {firstGame && (['return', 'between_rounds'].includes(room.game.phase) || room.game.phase === 'reading' &&
        !display && Boolean(view.violations?.length)) && <div className={broadcast.sceneWork} tabIndex={0} aria-label="Сверка и история">
        {!display && work}
        {room.game.results.length > 0 && room.game.phase === 'between_rounds' && !cleanReview &&
          <details><summary>История партии</summary><ResultsSummary results={room.game.results} firstGame /></details>}
      </div>}
      {firstGame && !display && <footer className={broadcast.primary}>
        <FirstGameControls key={room.id} room={room} disabled={disabled} run={run}
          trialPending={view?.kind === 'organizer' && view.trialReview?.lateVisit?.status === 'review'}
          newParty={() => void run('room:restart', { roomId: room.id })} />
      </footer>}
      </div>
      {room.game.firstGame && <RitualBoard game={room.game} online={connection === 'online' && restored} animate />}
      </div>
      {!firstGame && <>
        {!display && <>
          <a href="/?screen=display" target="_blank" rel="opener">Открыть эфир</a> · <a href="/?screen=editor" target="_blank" rel="opener">Редактор карточек</a>
          {invitation}{work}
          <GameControls key={room.id} room={room} disabled={disabled} run={run} />
          {roster}
        </>}
        {settings}
      </>}
    </>}
  </LobbyShell></div>;
}

function TimerSettings({ room, disabled, error, run }: {
  room: RoomSnapshot; disabled: boolean; error: string;
  run: (command: 'game:configure', input: LobbyInputs['game:configure']) => Promise<void>;
}) {
  const { settings, phase } = room.game;
  const [placement, setPlacement] = useState(String(settings.placementSeconds));
  const [search, setSearch] = useState(String(settings.searchSeconds));
  const [wait, setWait] = useState(String(settings.offlineWaitSeconds ?? 90));
  const locked = !['lobby', 'reading', 'between_rounds'].includes(phase);
  return <form onSubmit={event => {
    event.preventDefault();
    if (locked || disabled) return;
    void run('game:configure', { ...gameCommand(room), settings: { ...settings, placementSeconds: Number(placement), searchSeconds: Number(search), offlineWaitSeconds: Number(wait) } });
  }}>
    <h3>Таймеры этапов</h3>
    {locked && <p>Таймеры можно изменить между раундами.</p>}
    <label>Расстановка, секунды<input type="number" min={1} max={3600} required value={placement} disabled={locked || disabled} onChange={event => setPlacement(event.target.value)} /></label>
    <label>Поиск, секунды<input type="number" min={1} max={3600} required value={search} disabled={locked || disabled} onChange={event => setSearch(event.target.value)} /></label>
    <label>Ожидание участников без связи, секунды<input type="number" min={1} max={3600} required value={wait} disabled={locked || disabled} onChange={event => setWait(event.target.value)} /></label>
    <button disabled={locked || disabled}>Сохранить таймеры</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
