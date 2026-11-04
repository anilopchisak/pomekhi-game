import { CatalogEditor } from './CatalogEditor.js';
import broadcast from './Broadcast.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { dealCommand, gameCommand, describeError, useLobbyConnection } from '../../../shared/api/index.js';
import { ConfirmButton, DialogButton, LobbyShell, ResultsSummary, RitualBoard, RoundStatus, RoundTimer } from '../../../shared/ui/index.js';
import { invitationUrl } from '../invitation.js';
import type { LobbyInputs, LobbyCommand } from '../../../../shared/protocol.js';
import { DealControls } from './DealControls.js';
import { RecoveryControls } from './RecoveryControls.js';
import { FirstGameSetup } from './FirstGameSetup.js';
import { FirstGameControls } from './FirstGameControls.js';
import { GameControls } from './GameControls.js';
import { SoundControls } from './SoundControls.js';

const storageKey = 'pomekhi.organizer';
function storedCode() { try { return sessionStorage.getItem(storageKey) ?? ''; } catch { return ''; } }

export function HostPage({ display = false, editor = false }: { display?: boolean; editor?: boolean }) {
  const { connection, generation, restored, view, request, requestCatalog, clockOffset, cue, resetView } = useLobbyConnection();
  const credential = useRef(storedCode());
  const operation = useRef(0);
  const prepareSound = useRef<(() => Promise<void>) | null>(null);
  const [effects, setEffects] = useState(() => { try { return sessionStorage.getItem('pomekhi.visuals') !== 'off'; } catch { return true; } });
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [code, setCode] = useState(credential.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [local, setLocal] = useState(false);
  const [address, setAddress] = useState('');
  const [publicAddress, setPublicAddress] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<{ command: LobbyCommand; input: LobbyInputs[LobbyCommand] } | null>(null);
  const room = view?.kind === 'organizer' ? view.room : null;
  const persistence = view?.persistence;
  const disabled = busy || connection !== 'online' || persistence?.state !== undefined && persistence.state !== 'ready';
  const sync = room?.game.synchronization;
  const waitingForSync = room?.game.phase === 'between_rounds' && sync && !sync.closed && (sync.conflicts > 0 || sync.waitingPlayerIds.length > 0);
  const joinUrl = room && publicAddress ? invitationUrl(publicAddress, room.code, local) : '';

  const authorize = useCallback(async (value: string) => {
    try { sessionStorage.setItem(storageKey, value); }
    catch { setError('Браузер не позволяет сохранить вход. Разрешите хранилище сайта и повторите.'); return; }
    credential.current = value;
    const attempt = ++operation.current;
    setBusy(true); setError('');
    const result = await request('organizer:authorize', { code: value });
    if (attempt !== operation.current) return;
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

  useEffect(() => { if (generation && credential.current) void authorize(credential.current); }, [generation, authorize]);
  useEffect(() => {
    let cancelled = false;
    setQr(''); setCopied(false);
    if (joinUrl) void QRCode.toDataURL(joinUrl, { width: 280, margin: 4, errorCorrectionLevel: 'M' }).then(value => {
      if (!cancelled) setQr(value);
    }).catch(() => { if (!cancelled) setError('Не удалось построить QR. Можно скопировать ссылку или ввести код комнаты.'); });
    return () => { cancelled = true; };
  }, [joinUrl]);

  async function run<Command extends LobbyCommand>(command: Command, input: LobbyInputs[Command]) {
    const attempt = ++operation.current;
    setBusy(true); setError('');
    if (command.startsWith('round:') || command === 'party:finish') await prepareSound.current?.();
    if (attempt !== operation.current) return;
    const result = await request(command, input);
    if (attempt !== operation.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(describeError(result.error));
      setPending(result.error === 'TIMEOUT' || result.error === 'CONNECTION_LOST' ? { command, input } : null);
    } else setPending(null);
  }

  const firstGame = Boolean(room?.game.firstGame && !editor);
  const liveConnection = connection === 'online' && !restored ? 'connecting' : connection;
  const invitation = room && (<section>
        <h3>Комната <code>{room.code}</code></h3>
        <form onSubmit={event => {
          event.preventDefault();
          try { invitationUrl(address, room.code, local); setPublicAddress(address.trim()); setError(''); }
          catch { setError('Укажите HTTPS-адрес Tuna или включите локальный режим для HTTP-адреса ноутбука. Пути и параметры не нужны.'); }
        }}>
          <label><input type="checkbox" checked={local} onChange={e => { setLocal(e.target.checked); setPublicAddress(''); }} /> Локальное подключение</label>
          <p>{local ? 'Все телефоны и ноутбук должны быть в одной сети. Возьмите адрес Local player address из окна запуска. Адрес выбирается до входа; автоматического переноса между сайтами нет.' : 'Вставьте HTTPS-адрес Tuna.'}</p>
          <label>{local ? 'Локальный адрес ноутбука' : 'Адрес Tuna'}<input type="url" value={address} placeholder="https://…" onChange={event => setAddress(event.target.value)} required /></label>
          <button>Показать приглашение</button>
        </form>
        {joinUrl && <>
          <label>Ссылка для участников<input readOnly value={joinUrl} onFocus={event => event.target.select()} /></label>
          <button onClick={() => {
            void navigator.clipboard?.writeText(joinUrl).then(() => setCopied(true)).catch(() => setError('Выделите и скопируйте ссылку из поля вручную.'));
            if (!navigator.clipboard) setError('Выделите и скопируйте ссылку из поля вручную.');
          }}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button>
          {qr && <img src={qr} width={280} height={280} alt="QR-код приглашения в комнату" />}
          <p>Отсканируйте QR или откройте ссылку. Если вводите адрес сайта вручную, используйте код комнаты.</p>
        </>}
      </section>);
  const settings = room && view?.kind === 'organizer' && <><section aria-label="Атмосфера">
        <h3>Атмосфера</h3>
        <label><input type="checkbox" checked={effects} onChange={e => { setEffects(e.target.checked); try { sessionStorage.setItem('pomekhi.visuals', e.target.checked ? 'on' : 'off'); } catch { /* Visual effects still work. */ } }} /> Помехи старого телевизора</label>
        {!display && <label><input type="checkbox" disabled={disabled} checked={room.phoneScaresEnabled} onChange={e => void run('organizer:atmosphere', { roomId: room.id, enabled: e.target.checked })} /> Редкие эффекты на телефонах</label>}
        {display && <><button onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => setFullscreenMessage('Используйте обычное окно браузера.'));
          else if (document.documentElement.requestFullscreen) void document.documentElement.requestFullscreen().catch(() => setFullscreenMessage('Полноэкранный режим недоступен; эфир работает в окне.'));
          else setFullscreenMessage('Полноэкранный режим недоступен; эфир работает в окне.');
        }}>Полноэкранный режим</button><a href="/?screen=host">Открыть пульт</a>{fullscreenMessage && <p role="status">{fullscreenMessage}</p>}</>}
      </section>
      <SoundControls game={room.game} online={connection === 'online' && restored && persistence?.state !== 'write_error' && persistence?.state !== 'load_error'} enabled={view.audioEnabled} disabled={disabled} cue={cue} prepareRef={prepareSound} gameVersion={room.game.version} clockOffset={clockOffset} claim={async enabled => {
        const result = await request('organizer:audio', { enabled });
        if (!result.ok) setError(describeError(result.error));
        if (result.ok && display && enabled) window.scrollTo(0, 0);
        return result.ok;
      }} /></>;
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
          <ConfirmButton data-danger disabled={disabled} native={!room.game.firstGame} title={`Удалить участника «${player.name}»?`}
            description="Его прежний вход перестанет действовать." confirm="Удалить"
            onConfirm={() => void run('player:remove', { roomId: room.id, playerId: player.id })}
            aria-label={`Удалить участника ${player.name}`}>Удалить</ConfirmButton>
        </li>)}</ul> : <p>Пока здесь тихо. Ждём первого участника.</p>}
        <ConfirmButton data-danger disabled={disabled} native={!room.game.firstGame} title="Закрыть комнату?"
          description="Все участники выйдут. Прежнее приглашение перестанет действовать." confirm="Закрыть комнату"
          onConfirm={() => void run('room:close', { roomId: room.id })}>Закрыть комнату</ConfirmButton>
      </section>);
  const work = room && view?.kind === 'organizer' && <>{room.game.firstGame && <FirstGameSetup key={`${room.id}:${room.game.phase}:${room.game.results.at(-1)?.status}`} room={room} view={view} disabled={disabled} run={run} />}
      {room.game.firstGame && room.game.phase === 'between_rounds' && room.game.results.at(-1)?.status === 'provisional' && <section aria-label="Физический статус">
        <h3>Кто где после призыва</h3><p>Подтверждайте только то, что сообщили участники. Отключённый телефон ничего не доказывает.</p>
        <ul>{room.players.map(player => {
          const item = view.presence?.find(status => status.playerId === player.id);
          return <li key={player.id}><span>{player.name}</span><small>{item?.confirmed ? item.expected === 'at_base' ? 'На базе' : 'В локации с группой' : 'Статус не подтверждён'}</small>
            {item && !item.confirmed && <ConfirmButton disabled={disabled} title={`${player.name} · ${item.expected === 'at_base' ? 'возвращение на базу' : 'ожидание с группой'}`}
              description="Подтвердите статус, который сообщил участник." confirm="Подтвердить статус"
              onConfirm={() => void run('round:presence', { ...gameCommand(room), playerId: player.id, status: item.expected })}>
              {item.expected === 'at_base' ? 'Подтвердить возвращение' : 'Подтвердить группу'}
            </ConfirmButton>}
          </li>;
        })}</ul>
      </section>}
      <RecoveryControls room={room} review={view.review ?? []} disabled={disabled} run={run} />
      <DealControls room={room} disabled={disabled || Boolean(waitingForSync) || room.game.settings.ritualEnabled && room.game.results.at(-1)?.status === 'provisional'} run={run} /></>;
  const toolbar = firstGame && room ? <>
    <div className={broadcast.roomIdentity}>
      {!display ? <DialogButton title="Приглашение" content={invitation}><code>{room.code}</code></DialogButton> : <code>{room.code}</code>}
      <span role="status" data-connection={liveConnection}>{liveConnection === 'online' ? 'Связь установлена' : liveConnection === 'offline' ? 'Нет связи' : 'Восстанавливаем связь'}</span>
    </div>
    <div className={broadcast.tools}>
      <RoundTimer game={room.game} clockOffset={clockOffset} connection={liveConnection} />
      <DialogButton title="Как играть" content={<>
        <p>Свободные игроки возвращаются на базу по призыву. Одержимые и пленённые остаются с группой.</p>
        <p>База: {room.game.venue.base}. Разрешённые зоны: {room.game.venue.zones.join(', ') || 'ещё не заданы'}.</p>
        <p>При остановке партии возвращаются все. За просьбу о помощи штрафа нет.</p>
      </>}>Как играть</DialogButton>
      <DialogButton title="Настройки" keepMounted content={<>
        {settings}
        {!display && <><p><a href="/?screen=display" target="_blank" rel="opener">Открыть эфир</a> · <a href="/?screen=editor" target="_blank" rel="opener">Редактор карточек</a></p>{roster}</>}
      </>}>Настройки</DialogButton>
    </div>
  </> : undefined;

  return <div className={broadcast.frame} data-effects={effects} data-display={display} data-first-game={firstGame}><LobbyShell toolbar={toolbar} wide={display || room?.game.firstGame} firstGame={room?.game.firstGame} title={editor ? "Редактор карточек" : display ? "Эфир дома" : "Пульт дома"} connection={connection} error={error}>
    {display && persistence && persistence.state !== 'ready' && <p role="alert">Сохранение недоступно. Игра остановлена; откройте пульт для восстановления.</p>}
    {!display && room?.game.firstGame && persistence?.state === 'ready' && <p className={broadcast.saveNote} role="status">
      {persistence.recovered ? 'Партия восстановлена.' : persistence.mode === 'disk' ? 'Автосохранение включено.' : 'Партия хранится в памяти.'}
    </p>}
    {!display && view?.kind === 'organizer' && (!room?.game.firstGame || persistence?.state !== 'ready') && <section aria-label="Сохранение партии">
      <h3>Сохранение партии</h3>
      <p role="status">{persistence?.mode === 'disk' ? persistence.state === 'ready' ? 'Автосохранение включено.' : 'Ошибка сохранения. Продвижение игры остановлено.' : 'Тестовый режим: партия хранится только в памяти.'}</p>
      {persistence?.recovered && <p>Партия восстановлена. {room?.game.paused && room.game.pauseReason === 'server_restarted' ? 'Начатый раунд на паузе; продолжите его вручную после проверки участников.' : 'Карточки и итоги сохранены.'}</p>}
      {persistence && persistence.state !== 'ready' && <>
        <p role="alert">{persistence.state === 'load_error' ? 'Не удалось загрузить сохранение. Файл не заменён. Проверьте доступ к диску и повторите загрузку.' : 'Изменение не подтверждено. Проверьте текущее состояние после восстановления записи.'}</p>
        <button disabled={busy || connection !== 'online'} onClick={() => void run('storage:retry', {})}>Повторить загрузку и запись</button>
        <button data-danger disabled={busy || connection !== 'online'} onClick={() => {
          if (window.confirm('Сбросить сохранённую партию? Участники и карточки будут удалены; пользовательский банк вернётся к стандартным 90 карточкам. Исходный файл останется на диске для диагностики.')) void run('storage:reset', { confirm: true });
        }}>Сбросить сохранение</button>
      </>}
    </section>}
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
      {firstGame && <section className={broadcast.roster} aria-label="Участники за столом">
        <h3>Участники · {room.players.length}/{room.capacity}</h3>
        <ol tabIndex={0} aria-label="Список участников">{[...room.players].sort((a, b) => {
          const order = room.game.venue.order ?? [];
          return (order.indexOf(a.id) + 1 || Infinity) - (order.indexOf(b.id) + 1 || Infinity);
        }).map((player, index) => {
          const role = view.roles?.[player.id];
          const physical = view.presence?.find(item => item.playerId === player.id);
          const assignment = room.dealing.assignments.find(item => item.playerId === player.id);
          const checking = ['return', 'between_rounds'].includes(room.game.phase);
          return <li key={player.id}>
            <span className={broadcast.seat}>{String(index + 1).padStart(2, '0')}</span>
            <div><strong>{player.name}</strong>
              <small>{role && <span>{role === 'exorcist' ? 'Экзорцист' : 'Одержимый'} · </span>}{player.online ? 'На связи' : 'Нет связи'}</small>
            </div>
            <div className={broadcast.playerState}>
              {room.game.phase === 'reading' && assignment && <small>{assignment.replacementRequested ? 'Просит замену' : assignment.ready ? 'Готов' : 'Читает'}</small>}
              {checking && !display && <small>{physical ? physical.confirmed
                ? physical.expected === 'at_base' ? 'На базе' : 'С группой'
                : physical.expected === 'at_base' ? 'Ожидается на базе' : 'Ожидается в группе'
                : 'Статус неизвестен'}</small>}
            </div>
          </li>;
        })}</ol>
      </section>}
      <div className={broadcast.mainScene}>
      {!firstGame && <p key={`${room.game.phase}:${room.game.paused}`} className={broadcast.banner}>{room.game.paused ? 'ЗАПИСЬ ПРИОСТАНОВЛЕНА' : ({ lobby: 'ОЖИДАНИЕ СИГНАЛА', reading: 'ЛИЧНЫЕ ЗАПИСИ ПОЛУЧЕНЫ', placement: 'ЗАЙМИТЕ СВОИ МЕСТА', search: 'ДОМ СЛУШАЕТ', return: 'ВОЗВРАЩАЙТЕСЬ НА БАЗУ', between_rounds: 'СВЕРЬТЕ ПОКАЗАНИЯ', finished: 'ЗАПИСЬ ЗАВЕРШЕНА' }[room.game.phase])}</p>}
      <RoundStatus game={room.game} clockOffset={clockOffset} connection={firstGame ? liveConnection : connection} showRitual={!firstGame} compact={firstGame} timerInHeader={firstGame}>
        {firstGame && ['placement', 'search'].includes(room.game.phase) && <span className={broadcast.phaseMark} aria-hidden="true" />}
      </RoundStatus>
      {room.game.firstGame && room.game.story && room.game.phase === 'reading' && room.game.roundNumber === 1 && <section>
        <h3>{room.game.story.title}</h3><p className={broadcast.prologue}>{room.game.story.prologue}</p>
      </section>}
      {firstGame && !['placement', 'search'].includes(room.game.phase) && <div className={broadcast.sceneWork} tabIndex={0} aria-label="Подготовка, сверка и история">
        {!display && work}
        {room.game.results.length > 0 && ['between_rounds', 'finished'].includes(room.game.phase) &&
          <details open={room.game.phase === 'finished'}><summary>История партии</summary><ResultsSummary results={room.game.results} firstGame /></details>}
      </div>}
      {firstGame && !display && <footer className={broadcast.primary}>
        <FirstGameControls key={room.id} room={room} disabled={disabled} run={run}
          newParty={() => void run('room:close', { roomId: room.id })} />
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
