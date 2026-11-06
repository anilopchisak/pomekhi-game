import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './PlayerScene.module.css';
import type { LobbyCommand, LobbyInputs, LobbyView, OfflineAction } from '../../../../shared/protocol.js';
import { isRetiredMission } from '../../../../shared/retired-mission.js';
import { gameCommand } from '../../../shared/api/index.js';
import { ConfirmButton, DialogButton, GameDialog } from '../../../shared/ui/index.js';

function MissionCheckbox({ completed, disabled, report }: {
  completed: boolean; disabled: boolean; report: (completed: boolean) => Promise<void>;
}) {
  const checkbox = useRef<HTMLInputElement>(null);
  const [requested, setRequested] = useState<boolean | null>(null);
  const close = () => setRequested(null);
  return <>
    <label className={styles.missionToggle}>
      <input ref={checkbox} type="checkbox" checked={completed} disabled={disabled}
        onChange={event => setRequested(event.currentTarget.checked)} />
      Миссия выполнена
    </label>
    {requested !== null && <GameDialog title={requested ? 'Подтвердить выполнение миссии?' : 'Снять отметку выполнения миссии?'}
      onClose={close} returnFocus={checkbox.current}>
      <div data-dialog-actions data-mission-confirmation>
        <button type="button" data-secondary data-dialog-focus onClick={close}>Отмена</button>
        <button type="button" disabled={disabled || requested === completed} onClick={() => {
          close();
          void report(requested);
        }}>{requested ? 'Подтвердить выполнение' : 'Снять отметку'}</button>
      </div>
    </GameDialog>}
  </>;
}

export function PlayControls({ view, disabled, run, queue, online = true, estimatedSearchEnded = false, feedback, pendingReports = false, roleControlsTarget }: {
  view: Extract<LobbyView, { kind: 'player' }>; disabled: boolean;
  queue?: (action: OfflineAction) => Promise<void>;
  online?: boolean;
  estimatedSearchEnded?: boolean;
  feedback?: ReactNode;
  pendingReports?: boolean;
  roleControlsTarget?: HTMLElement | null;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C], onSuccess?: () => void) => Promise<void>;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [selection, setSelection] = useState<{ id: string; round: string; role: string }>();
  const [releaseSelection, setReleaseSelection] = useState('');
  const { play, room } = view;
  if (!play) return null;
  const game = room.game;
  const target = selection?.round === play.roundId && selection.role === play.status ? selection.id : '';
  const base = { ...gameCommand(room), playVersion: play.version };
  const mutable = !game.lastRoundAborted && !game.results.some(result => result.roundId === play.roundId && result.status !== 'provisional');
  const searching = game.phase === 'search' && !game.paused && !estimatedSearchEnded && mutable;
  const possessed = !play.unknownGroup && (play.status === 'possessed' || play.status === 'captured');
  const missionAllowed = mutable && !game.paused && ['search', 'return', 'between_rounds', 'finished'].includes(game.phase);
  const eligibleIds = game.firstGame && possessed ? play.targets ?? [] : game.activePlayerIds;
  const eligible = room.players.filter(p => p.id !== view.playerId && eligibleIds.includes(p.id));
  const name = eligible.find(p => p.id === target)?.name;
  const unavailable = Boolean(target && !name);
  const native = !game.firstGame;
  const undoRequests = view.synchronization?.undoRequests ?? [];
  const waitingUndo = undoRequests.some(row => row.actionId === play.undo?.id && (row.status === 'queued' || row.status === 'review'));
  const missionUndo = play.undo?.label === 'Отметка миссии' ? play.undo : null;
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

  const pendingReleaseMembers = new Set(play.releases?.filter(row => row.pending).flatMap(row => row.memberIds));
  const releaseOptions = (play.releaseGroups ?? []).filter(group => !group.some(id => pendingReleaseMembers.has(id)));
  const selectedGroup = releaseOptions.find(group => JSON.stringify(group) === releaseSelection);
  const memberNames = (ids: string[]) => ids.map(id => room.players.find(player => player.id === id)?.name ?? 'Участник').join(', ');
  const missionEligible = play.missionEligible && !isRetiredMission(play.card);
  function reportMission(completed: boolean) {
    return !online && queue ? queue({ kind: 'mission', completed }) : run('play:mission', { ...base, completed });
  }
  const mission = missionEligible && <ConfirmButton native={native}
      title={play.missionCompleted ? 'Снять отметку выполнения миссии?' : 'Подтвердить выполнение миссии?'}
      description={play.missionCompleted ? undefined : 'Миссия должна быть выполнена до призыва на базу.'}
      confirm={play.missionCompleted ? 'Снять отметку' : 'Подтвердить миссию'} disabled={disabled || !missionAllowed}
      onConfirm={() => void reportMission(!play.missionCompleted)}>
      {play.missionCompleted ? 'Снять отметку миссии' : 'Миссия выполнена'}
    </ConfirmButton>;

  function undoAction(actionId: string, requestReview?: true) {
    return !online && queue ? queue({ kind: 'undo', actionId, ...(requestReview ? { requestReview } : {}) }) :
      run('play:undo', { ...base, actionId, ...(requestReview ? { requestReview } : {}) });
  }

  const undoMission = missionUndo && <ConfirmButton data-secondary title="Отменить последнюю отметку миссии?"
    confirm="Отменить отметку" disabled={disabled || !mutable || game.paused || !missionUndo.available || waitingUndo}
    onConfirm={() => void undoAction(missionUndo.id)}>Отменить последнюю отметку миссии</ConfirmButton>;
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
                onConfirm={() => void undoAction(infection.id)}>Отменить заражение</ConfirmButton>
              {waiting ? <small>Отмена ждёт сверки.</small> : infection.canRequestReview && mutable && !game.synchronization?.closed && <>
                <small>Отмену блокируют связанные действия.</small>
                <ConfirmButton data-secondary title="Запросить разбор отмены?" confirm="Отправить запрос"
                  description="Организатор проверит связанные действия на базе."
                  disabled={disabled || game.paused} onConfirm={() => void undoAction(infection.id, true)}>Запросить разбор</ConfirmButton>
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
      {missionEligible
        ? <MissionCheckbox key={play.cardKey} completed={play.missionCompleted} disabled={disabled || !missionAllowed} report={reportMission} />
        : missionUndo && <DialogButton data-role-action="missions" title="Отметка миссии" content={<>
          {undoMission}
          {feedback}
        </>}>Отметка миссии</DialogButton>}
      {(play.status === 'exorcist' || Boolean(play.releases?.length)) && <DialogButton data-role-action="release" title="Освобождение"
        disabled={!searching && !play.releases?.length && !(missionEligible && missionUndo)}
        content={<>
          <h3>Кого вы освободили</h3>
          {play.releases?.length ? <ul>{play.releases.map(release => {
            const waiting = undoRequests.some(row => row.actionId === release.id && ['queued', 'review'].includes(row.status));
            return <li key={release.id}>
              <span>{memberNames(release.memberIds)}</span>
              {release.pending && <small>Ждёт отправки или сверки</small>}
              <ConfirmButton data-secondary title="Отменить освобождение?" confirm="Отменить освобождение"
                disabled={disabled || !mutable || game.paused || !release.available || play.undo?.id !== release.id || waiting || online && release.pending}
                onConfirm={() => void undoAction(release.id)}>Отменить освобождение</ConfirmButton>
              {waiting ? <small>Отмена ждёт сверки.</small> : release.canRequestReview && mutable && !game.synchronization?.closed && <>
                <small>Отмену блокируют связанные действия.</small>
                <ConfirmButton data-secondary title="Запросить разбор отмены?" confirm="Отправить запрос"
                  description="Организатор проверит связанные действия на базе."
                  disabled={disabled || game.paused} onConfirm={() => void undoAction(release.id, true)}>Запросить разбор</ConfirmButton>
              </>}
            </li>;
          })}</ul> : <p>Вы ещё никого не освободили в этом раунде.</p>}
          {play.status === 'exorcist' && <>
            <h3>Освободить группу</h3>
            <label>Кого освободить
              <select value={selectedGroup ? releaseSelection : ''} disabled={disabled || !searching} onChange={event => setReleaseSelection(event.target.value)}>
                <option value="">{releaseOptions.length ? 'Выберите группу' : 'Нет доступных групп'}</option>
                {releaseOptions.map(group => <option key={group[0]} value={JSON.stringify(group)}>{memberNames(group)}</option>)}
              </select>
            </label>
            <button type="button" disabled={disabled || !searching || !selectedGroup} onClick={() => {
              if (!selectedGroup) return;
              const targetIds = [selectedGroup[0]];
              const clear = () => setReleaseSelection('');
              if (!online && queue) void queue({ kind: 'release', targetIds }).then(clear);
              else void run('play:release', { ...base, targetIds }, clear);
            }}>Подтвердить освобождение</button>
            {undoHistory}
          </>}
          {missionEligible && undoMission}
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
    {play.undo && !game.firstGame && <>
      <p>Последнее действие: {play.undo.label}.</p>
      <ConfirmButton native={native} title={`Отменить: ${play.undo.label}?`} description="Завершённый поиск не возобновится."
        confirm="Отменить действие" disabled={disabled || !mutable || !play.undo.available || waitingUndo}
        onConfirm={() => void (!online && queue ? queue({ kind: 'undo', actionId: play.undo!.id }) : run('play:undo', { ...base, actionId: play.undo!.id }))}>
        Отменить моё последнее действие
      </ConfirmButton>
      {!play.undo.available && mutable && <p>Отмену блокируют связанные записи.</p>}
    </>}
    {(!game.firstGame || play.status !== 'exorcist') && undoHistory}
    {!mutable && <p>Результат закрыт для изменений.</p>}
  </section>;
}
