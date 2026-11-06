import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './PlayerScene.module.css';
import type { LobbyCommand, LobbyInputs, LobbyView, OfflineAction } from '../../../../shared/protocol.js';
import { gameCommand } from '../../../shared/api/index.js';
import { ConfirmButton, DialogButton } from '../../../shared/ui/index.js';

export function PlayControls({ view, disabled, run, queue, online = true, estimatedSearchEnded = false, actorTrial, feedback, pendingReports = false, roleControlsTarget }: {
  view: Extract<LobbyView, { kind: 'player' }>; disabled: boolean;
  queue?: (action: OfflineAction) => Promise<void>;
  online?: boolean;
  estimatedSearchEnded?: boolean;
  actorTrial?: ReactNode;
  feedback?: ReactNode;
  pendingReports?: boolean;
  roleControlsTarget?: HTMLElement | null;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C], onSuccess?: () => void) => Promise<void>;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [selection, setSelection] = useState<{ id: string; round: string; role: string }>();
  const [releaseIds, setReleaseIds] = useState<string[]>([]);
  const { play, room } = view;
  if (!play) return null;
  const game = room.game;
  const target = selection?.round === play.roundId && selection.role === play.status ? selection.id : '';
  const base = { ...gameCommand(room), playVersion: play.version };
  const mutable = !game.lastRoundAborted && !game.results.some(result => result.roundId === play.roundId && result.status !== 'provisional');
  const searching = game.phase === 'search' && !game.paused && !estimatedSearchEnded && mutable;
  const possessed = !play.unknownGroup && (play.status === 'possessed' || play.status === 'captured');
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

  const selectedReleaseIds = releaseIds.filter(id => eligible.some(player => player.id === id));
  const mission = play.missionEligible && <ConfirmButton native={native}
      title={play.missionCompleted ? 'Снять отметку выполнения миссии?' : 'Подтвердить выполнение миссии?'}
      description={play.missionCompleted ? undefined : offering ? 'Подтвердите, что лично дошли до Обители и выполнили действие карточки до призыва.' : 'Миссия должна быть выполнена до призыва на базу.'}
      confirm={play.missionCompleted ? 'Снять отметку' : 'Подтвердить миссию'} disabled={disabled || !missionAllowed}
      onConfirm={() => void (!online && queue ? queue({ kind: 'mission', completed: !play.missionCompleted }) : run('play:mission', { ...base, completed: !play.missionCompleted }))}>
      {play.missionCompleted ? 'Снять отметку миссии' : offering ? 'Подтвердить подношение и миссию' : 'Миссия выполнена'}
    </ConfirmButton>;

  function infectionUndo(actionId: string, requestReview?: true) {
    return !online && queue ? queue({ kind: 'undo', actionId, ...(requestReview ? { requestReview } : {}) }) :
      run('play:undo', { ...base, actionId, ...(requestReview ? { requestReview } : {}) });
  }

  const roleControls = game.firstGame && <div className={styles.roleActions}>
      {(possessed || Boolean(play.infections?.length)) && game.roundPlan.infectionEnabled && <DialogButton data-role-action="infect" title="Заражение"
        disabled={!searching && !play.infections?.length}
        content={<>
          <h3>Кого вы заразили</h3>
          {play.infections?.length ? <ul>{play.infections.map(infection => {
            const waiting = undoRequests.some(row => row.actionId === infection.id && ['queued', 'review'].includes(row.status));
            return <li key={infection.id}>
              <span>{room.players.find(player => player.id === infection.targetId)?.name ?? 'Участник'}</span>
              {infection.pending && <small>Ждёт отправки или сверки</small>}
              <ConfirmButton data-secondary title="Отменить заражение?" confirm="Отменить заражение"
                disabled={disabled || !mutable || game.paused || !infection.available || waiting || online && infection.pending}
                onConfirm={() => void infectionUndo(infection.id)}>Отменить заражение</ConfirmButton>
              {waiting ? <small>Отмена ждёт сверки.</small> : infection.canRequestReview && mutable && !game.synchronization?.closed && <>
                <small>Отмену блокируют связанные действия.</small>
                <ConfirmButton data-secondary title="Запросить разбор отмены?" confirm="Отправить запрос"
                  description="Организатор проверит связанные действия на базе."
                  disabled={disabled || game.paused} onConfirm={() => void infectionUndo(infection.id, true)}>Запросить разбор</ConfirmButton>
              </>}
            </li>;
          })}</ul> : <p>Вы ещё никого не заразили в этом раунде.</p>}
          {possessed && <>
            <h3>Заразить экзорциста</h3>
            {targetSelect('Кого заразить')}
            <button type="button" disabled={disabled || !searching || !name} onClick={() => {
              void (!online && queue ? queue({ kind: 'infect', targetId: target }) : run('play:infect', { ...base, targetId: target }));
            }}>Заразить</button>
          </>}
          {feedback}
        </>}>Заразить</DialogButton>}
      {(play.missionEligible || actorTrial) && <DialogButton data-role-action="missions" title="Миссии" content={<>
        {play.missionEligible && play.card.role === 'exorcist' && <section aria-label="Личная миссия">
          <h3>{play.card.brief ? 'Как выполнить личную миссию?' : 'Личная миссия'}</h3>
          <p>{play.card.mission}</p>
          {!play.card.brief && play.card.successCondition && <p><strong>Условие зачёта:</strong> {play.card.successCondition}</p>}
          {mission}
        </section>}
        {actorTrial}
        {feedback}
      </>}>Миссии</DialogButton>}
      {play.status === 'exorcist' && <DialogButton data-role-action="release" title="Освободить участников" disabled={!searching}
        content={<>
          <p>Отметьте тех, чьё условие освобождения вы выполнили. Вместе с ними освободятся их группы.</p>
          <fieldset disabled={disabled || !searching}>
            <legend>Участники раунда</legend>
            {eligible.map(player => <label key={player.id}>
              <input type="checkbox" checked={selectedReleaseIds.includes(player.id)} onChange={event => {
                setReleaseIds(event.currentTarget.checked ? [...selectedReleaseIds, player.id] : selectedReleaseIds.filter(id => id !== player.id));
              }} /> {player.name}
            </label>)}
          </fieldset>
          <button type="button" disabled={disabled || !searching || !selectedReleaseIds.length} onClick={() => {
            const targetIds = selectedReleaseIds;
            const clear = () => setReleaseIds([]);
            if (!online && queue) void queue({ kind: 'release', targetIds }).then(clear);
            else void run('play:release', { ...base, targetIds }, clear);
          }}>Подтвердить освобождение</button>
          {pendingReports && <p role="status">На телефоне есть записи, которые ждут отправки.</p>}
          {feedback}
        </>}>Освободить</DialogButton>}
  </div>;

  return <section aria-label="Игровые действия">
    {play.status === 'captured' && <h3>Вы заражены</h3>}
    {play.status === 'released' && <h3>Вы освобождены</h3>}
    {play.status === 'captured' && <p>Ваша дополнительная миссия не засчитывается.</p>}
    {play.wasCaptured && play.status === 'released' && <p>После заражения дополнительная миссия этого раунда не засчитывается.</p>}
    {game.firstGame && searching && unavailable && <p role="status">Этот участник уже недоступен. Выберите имя из обновлённого списка.</p>}
    {game.firstGame && searching && !online && <p>Список сохранён при последней связи. Отметка дождётся проверки.</p>}
    {(possessed || game.firstGame && Boolean(play.infections?.length)) && <>
      {game.firstGame && play.location && <p>Ваша локация: {play.location}.</p>}
      {!game.firstGame && <ConfirmButton native={native} title="Условие освобождения выполнено?"
        description="Вся ваша группа освободится и вернётся на базу."
        confirm="Подтвердить освобождение" disabled={disabled || !searching}
        onConfirm={() => void (!online && queue ? queue({ kind: 'release' }) : run('play:release', base))}>Нас освободили</ConfirmButton>}
      {!game.firstGame && game.roundPlan.infectionEnabled && <>
        {targetSelect('Кого заразить')}
        <ConfirmButton native={native} title={name ? `Заразить участника «${name}»?` : 'Участник уже недоступен'}
          description={unavailable ? 'Вернитесь к обновлённому списку.' : 'Подтвердите, что участник выполнил условие заражения. Он присоединится к вашей группе.'}
          confirm="Подтвердить заражение" fallbackFocus={selectRef} cancel={unavailable ? 'Вернуться к списку' : 'Отмена'} disabled={disabled || !searching || !name}
          onConfirm={() => void (!online && queue ? queue({ kind: 'infect', targetId: target }) : run('play:infect', { ...base, targetId: target }))}>
          Заразить выбранного
        </ConfirmButton>
      </>}
    </>}
    {!game.firstGame && mission}
    {roleControlsTarget ? createPortal(roleControls, roleControlsTarget) : roleControls}
    {play.undo && (!game.firstGame || play.undo.label !== 'Заражение') && <>
      <p>Последнее действие: {play.undo.label}.</p>
      <ConfirmButton native={native} title={`Отменить: ${play.undo.label}?`} description="Завершённый поиск не возобновится."
        confirm="Отменить действие" disabled={disabled || !mutable || !play.undo.available || waitingUndo || game.firstGame && game.paused}
        onConfirm={() => void (!online && queue ? queue({ kind: 'undo', actionId: play.undo!.id }) : run('play:undo', { ...base, actionId: play.undo!.id }))}>
        Отменить моё последнее действие
      </ConfirmButton>
      {!play.undo.available && mutable && <p>Отмену блокируют связанные записи.</p>}
      {game.firstGame && play.undo.canRequestReview && mutable && !game.synchronization?.closed && !waitingUndo &&
        <ConfirmButton title="Запросить разбор отмены?" description="Организатор проверит связанные записи на сверке. До решения действие остаётся в силе."
          confirm="Отправить запрос" disabled={disabled || game.paused}
          onConfirm={() => void (!online && queue ? queue({ kind: 'undo', actionId: play.undo!.id, requestReview: true }) :
            run('play:undo', { ...base, actionId: play.undo!.id, requestReview: true }))}>Запросить разбор</ConfirmButton>}
    </>}
    {undoHistory}
    {!mutable && <p>Результат закрыт для изменений.</p>}
  </section>;
}
