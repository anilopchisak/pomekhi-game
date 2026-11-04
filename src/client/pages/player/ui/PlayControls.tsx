import { useRef, useState } from 'react';
import type { LobbyCommand, LobbyInputs, LobbyView, OfflineAction } from '../../../../shared/protocol.js';
import { gameCommand } from '../../../shared/api/index.js';
import { ConfirmButton } from '../../../shared/ui/index.js';

export function PlayControls({ view, disabled, run, queue, online = true, estimatedSearchEnded = false }: {
  view: Extract<LobbyView, { kind: 'player' }>; disabled: boolean;
  queue?: (action: OfflineAction) => Promise<void>;
  online?: boolean;
  estimatedSearchEnded?: boolean;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [selection, setSelection] = useState<{ id: string; round: string; role: string }>();
  const { play, room } = view;
  if (!play) return null;
  const game = room.game;
  const target = selection?.round === play.roundId && selection.role === play.status ? selection.id : '';
  const base = { ...gameCommand(room), playVersion: play.version };
  const mutable = !game.lastRoundAborted && !game.results.some(result => result.roundId === play.roundId && result.status !== 'provisional');
  const searching = game.phase === 'search' && !game.paused && !estimatedSearchEnded && mutable;
  const possessed = play.status === 'possessed' || play.status === 'captured';
  const offering = game.firstGame && play.card.offering;
  const missionAllowed = mutable && !game.paused && ['search', 'return', 'between_rounds', 'finished'].includes(game.phase);
  const eligibleIds = game.firstGame && possessed ? play.targets ?? [] : game.activePlayerIds;
  const eligible = room.players.filter(p => p.id !== view.playerId && eligibleIds.includes(p.id));
  const name = eligible.find(p => p.id === target)?.name;
  const unavailable = Boolean(target && !name);
  const native = !game.firstGame;
  const undoRequests = view.synchronization?.undoRequests ?? [];
  const waitingUndo = undoRequests.some(row => row.actionId === play.undo?.id && (row.status === 'queued' || row.status === 'review'));
  const undoHistory = undoRequests.length > 0 ? <ul aria-label="Запросы на разбор">{undoRequests.map(row => <li key={row.id}>
      {{ queued: 'Запрос сохранён на телефоне и ждёт отправки.', review: 'Запрос ждёт решения организатора.',
        accepted: 'Отмена подтверждена.', rejected: 'Запрос на отмену отклонён.' }[row.status]}
    </li>)}</ul> : null;
  if (game.firstGame && game.phase === 'finished') return undoHistory;

  function choose(id: string) { setSelection({ id, round: play!.roundId, role: play!.status }); }
  const targetSelect = (label: string) => <label>{label}
    <select ref={selectRef} value={name ? target : ''} disabled={disabled || !searching} onChange={e => choose(e.target.value)}>
      <option value="">{eligible.length ? 'Выберите имя' : 'Нет доступных участников'}</option>
      {eligible.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  </label>;

  return <section aria-label="Игровые действия">
    <h3>{({ exorcist: 'Вы — экзорцист', possessed: 'Вы — одержимый', captured: game.firstGame ? 'Вы в плену' : 'Вы заражены', released: 'Вы освобождены' })[play.status]}</h3>
    {play.status === 'captured' && <p>Ваша дополнительная миссия не засчитывается.</p>}
    {play.wasCaptured && play.status === 'released' && <p>После плена дополнительная миссия этого раунда не засчитывается.</p>}
    {game.firstGame && searching && unavailable && <p role="status">Этот участник уже недоступен. Выберите имя из обновлённого списка.</p>}
    {game.firstGame && searching && !online && <p>Список сохранён при последней связи. Отметка дождётся проверки.</p>}
    {queue && play.status === 'exorcist' && game.roundPlan.infectionEnabled && <div>
      {targetSelect(game.firstGame ? 'Кто взял вас в плен' : 'Кто вас заразил')}
      <ConfirmButton native={native} title="Сообщить о плене?"
        description={unavailable ? 'Участник уже недоступен. Вернитесь к списку.' : 'Прочитайте карточку этого участника вживую.'}
        disabled={disabled || !searching || !name} confirm="Сообщить о плене" fallbackFocus={selectRef}
        onConfirm={() => void queue({ kind: 'captured', by: target })}>{game.firstGame ? 'Я в плену' : 'Меня заразили'}</ConfirmButton>
    </div>}
    {possessed && <>
      {game.firstGame && play.location && <p>Ваша локация: {play.location}.</p>}
      <ConfirmButton native={native} title="Условие освобождения выполнено?"
        description="Вся ваша группа освободится и вернётся на базу."
        confirm="Подтвердить освобождение" disabled={disabled || !searching}
        onConfirm={() => void (queue ? queue({ kind: 'release' }) : run('play:release', base))}>Нас освободили</ConfirmButton>
      {game.roundPlan.infectionEnabled && <>
        {targetSelect(game.firstGame ? 'Кого взять в плен' : 'Кого заразить')}
        <ConfirmButton native={native} title={name ? `Взять в плен участника «${name}»?` : 'Участник уже недоступен'}
          description={unavailable ? 'Вернитесь к обновлённому списку.' : 'Подтвердите, что участник выполнил условие плена. Он присоединится к вашей группе.'}
          confirm="Подтвердить плен" fallbackFocus={selectRef} cancel={unavailable ? 'Вернуться к списку' : 'Отмена'} disabled={disabled || !searching || !name}
          onConfirm={() => void (queue ? queue({ kind: 'infect', targetId: target }) : run('play:infect', { ...base, targetId: target }))}>
          {game.firstGame ? 'Взять в плен' : 'Заразить выбранного'}
        </ConfirmButton>
      </>}
    </>}
    {play.missionEligible && <ConfirmButton native={native}
      title={play.missionCompleted ? 'Снять отметку выполнения миссии?' : 'Подтвердить выполнение миссии?'}
      description={play.missionCompleted ? undefined : offering ? 'Подтвердите, что лично дошли до Обители и выполнили действие карточки до призыва.' : 'Миссия должна быть выполнена до призыва на базу.'}
      confirm={play.missionCompleted ? 'Снять отметку' : 'Подтвердить миссию'} disabled={disabled || !missionAllowed}
      onConfirm={() => void (queue ? queue({ kind: 'mission', completed: !play.missionCompleted }) : run('play:mission', { ...base, completed: !play.missionCompleted }))}>
      {play.missionCompleted ? 'Снять отметку миссии' : offering ? 'Подтвердить подношение и миссию' : 'Миссия выполнена'}
    </ConfirmButton>}
    {play.undo && <>
      <p>Последнее действие: {play.undo.label}.</p>
      <ConfirmButton native={native} title={`Отменить: ${play.undo.label}?`} description="Завершённый поиск не возобновится."
        confirm="Отменить действие" disabled={disabled || !mutable || !play.undo.available || waitingUndo || game.firstGame && game.paused}
        onConfirm={() => void (queue ? queue({ kind: 'undo', actionId: play.undo!.id }) : run('play:undo', { ...base, actionId: play.undo!.id }))}>
        Отменить моё последнее действие
      </ConfirmButton>
      {!play.undo.available && mutable && <p>Отмену блокируют связанные записи.</p>}
      {game.firstGame && play.undo.canRequestReview && mutable && !game.synchronization?.closed && !waitingUndo &&
        <ConfirmButton title="Запросить разбор отмены?" description="Организатор проверит связанные записи на сверке. До решения действие остаётся в силе."
          confirm="Отправить запрос" disabled={disabled || game.paused}
          onConfirm={() => void (queue ? queue({ kind: 'undo', actionId: play.undo!.id, requestReview: true }) :
            run('play:undo', { ...base, actionId: play.undo!.id, requestReview: true }))}>Запросить разбор</ConfirmButton>}
    </>}
    {undoHistory}
    {!mutable && <p>Результат закрыт для изменений.</p>}
  </section>;
}
