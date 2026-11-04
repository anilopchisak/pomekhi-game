import { useRef, useState } from 'react';
import type { LobbyCommand, LobbyInputs, RoomSnapshot } from '../../../../shared/protocol.js';
import { dealCommand, gameCommand } from '../../../shared/api/index.js';
import { ConfirmButton, GameDialog } from '../../../shared/ui/index.js';
import styles from './Broadcast.module.css';

export function FirstGameControls({ room, disabled, run, newParty, trialPending }: {
  room: RoomSnapshot;
  disabled: boolean;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
  newParty: () => void;
  trialPending?: boolean;
}) {
  const { game } = room;
  const sync = game.synchronization;
  const provisional = game.results.at(-1)?.status === 'provisional';
  const waiting = sync && !sync.closed && (sync.conflicts > 0 || sync.waitingPlayerIds.length > 0);
  const ritual = game.ritual;
  const penalty = ritual?.penaltyPreview;
  if (game.phase === 'lobby') {
    const count = Math.min(3, Math.floor(room.players.length / 2));
    return <div className={styles.sceneActions}>
      {!game.venue.dwelling && <p>Укажите места игры в настройках партии.</p>}
      {room.players.length < 5 && <p>Для раздачи нужно не меньше пяти участников.</p>}
      <button disabled={disabled || room.players.length < 5 || !game.venue.dwelling}
        onClick={() => void run('deal:create', { ...dealCommand(room), possessedCount: count })}>Раздать карточки</button>
    </div>;
  }
  if (game.phase === 'finished') return <div aria-label="Управление раундом"><ConfirmButton title="Начать новую партию?"
    description="Текущая комната закроется. Для новой партии игроки получат новое приглашение."
    confirm="Закрыть текущую комнату" onConfirm={newParty} disabled={disabled}>Новая партия</ConfirmButton></div>;

  return <div aria-label="Управление раундом">
    {game.phase === 'reading' && <ReadingControls room={room} disabled={disabled} run={run} />}
    {['placement', 'search'].includes(game.phase) && <>
      {!game.paused ? <button data-secondary disabled={disabled} onClick={() => void run('round:pause', gameCommand(room))}>Пауза</button>
        : game.rosterChanged ? <ConfirmButton title="Продолжить с изменившимся составом?"
          description="Оставшиеся игроки сохранят свои карточки." confirm="Продолжить"
          disabled={disabled || !game.activePlayerIds.length}
          onConfirm={() => void run('round:resume', { ...gameCommand(room), confirmWarnings: true })}>Продолжить</ConfirmButton>
          : <button disabled={disabled || !game.activePlayerIds.length}
            onClick={() => void run('round:resume', { ...gameCommand(room), confirmWarnings: false })}>Продолжить</button>}
      {game.phase === 'search' && <ConfirmButton data-secondary title="Досрочно позвать свободных?"
        description="Участники сообщили, что ходят вместе или слишком много разговаривают. Свободные вернутся на базу, группы останутся на местах."
        confirm="Позвать свободных" disabled={disabled || game.paused || !game.activePlayerIds.length}
        onConfirm={() => void run('round:return', gameCommand(room))}>Досрочный призыв</ConfirmButton>}
    </>}
    {game.phase === 'return' && <button disabled={disabled} onClick={() => void run('round:return', gameCommand(room))}>Открыть сверку</button>}
    {provisional && trialPending && <p>Разберите отчёт о повторном визите в Обитель.</p>}
    {provisional && <ConfirmButton title="Подтвердить итоги раунда?"
      description={ritual?.preview ? `Предварительный итог: ${ritual.preview.successes} успехов, останется ${ritual.preview.remainingSteps} шагов. После подтверждения поздние записи не изменят результат.` : 'Подтверждённый результат больше не изменится.'}
      confirm="Подтвердить итог" disabled={disabled || Boolean(waiting) || trialPending}
      onConfirm={() => void run('results:finalize', gameCommand(room))}>Подтвердить итоги раунда</ConfirmButton>}
    {ritual?.outcome === 'playing' && ['reading', 'between_rounds'].includes(game.phase) && <>
      {penalty && <ConfirmButton eyebrow="Ритуал · сверка нарушения" title="Подтвердить шаг назад?" confirm="Подтвердить штраф" cancel="Отклонить нарушение"
        description={<>
          <p>Сверьте факт нарушения и исключения. Свеча вернётся на один шаг из стопки «{['А', 'Б', 'В', 'Вышедшие свечи'][penalty.source]}».</p>
          <div data-dialog-panel>
            <strong>{ritual.positions.slice(0, 3).join(' / ')} → {penalty.positions.slice(0, 3).join(' / ')}</strong>
            <p>Останется шагов: {penalty.remainingSteps}. Открытые прорицания сохранятся.</p>
          </div>
          <div data-dialog-panel><strong>Одно нарушение · одно начисление</strong>
            <p>Просьбы о помощи и технические сообщения не штрафуются.</p></div>
        </>} disabled={disabled} onConfirm={() => void run('ritual:penalty', gameCommand(room))}>Нарушение прорицания</ConfirmButton>}
      {ritual.penaltyDisputed && <ConfirmButton title="Закрыть спорный отчёт без штрафа?"
        description="Для текущих стопок правило не даёт однозначного шага. Свечи и открытые прорицания сохранятся."
        confirm="Закрыть без штрафа" disabled={disabled}
        onConfirm={() => void run('ritual:penalty', gameCommand(room))}>Закрыть спорный отчёт</ConfirmButton>}
      {ritual.canUndoPenalty && <ConfirmButton title="Отменить последний штраф?"
        confirm="Отменить штраф" disabled={disabled}
        onConfirm={() => void run('ritual:undo-penalty', gameCommand(room))}>Отменить последний штраф</ConfirmButton>}
    </>}
    <ConfirmButton data-danger title="Остановить партию?"
      description="Все вернутся на базу. Текущий неподтверждённый раунд не засчитывается."
      confirm="Остановить партию" disabled={disabled} onConfirm={() => void run('party:finish', gameCommand(room))}>Остановить партию</ConfirmButton>
  </div>;
}

function ReadingControls({ room, disabled, run }: Pick<Parameters<typeof FirstGameControls>[0], 'room' | 'disabled' | 'run'>) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  function runFromDialog<C extends LobbyCommand>(command: C, input: LobbyInputs[C]) {
    close();
    void run(command, input);
  }
  const { assignments, compositionValid } = room.dealing;
  const players = assignments.map(assignment => ({
    ...assignment, player: room.players.find(player => player.id === assignment.playerId),
  }));
  const ready = players.every(({ ready, player }) => ready && player?.online);
  const awaitingReplacement = assignments.some(item => item.replacementRequested);
  const blocked = disabled || !compositionValid || awaitingReplacement;
  const count = Math.min(room.dealing.initialPossessedCount ?? 3, Math.max(1, Math.floor(room.players.length / 2)));
  return <div className={styles.sceneActions}>
    <button disabled={blocked || !ready} onClick={() => void run('round:start', { ...gameCommand(room), confirmWarnings: false })}>
      {awaitingReplacement ? 'Сначала замените карточки' : ready ? 'Начать раунд' : 'Ждём чтения всех участников'}
    </button>
    <button ref={opener} type="button" data-secondary aria-disabled={disabled}
      onClick={() => { if (!disabled) setOpen(true); }}>Проверить готовность</button>
    {open && <GameDialog title="Проверить готовность" onClose={close} returnFocus={opener.current}>
      <ul>{players.map(({ assignmentId, player, ready, replacementRequested }) => <li key={assignmentId}>
        <span>{player?.name ?? 'Участник'}</span>
        <small>{replacementRequested ? 'Просит замену' : ready ? 'Готов' : 'Читает'}{!player?.online && ' · Нет связи'}</small>
      </li>)}</ul>
      {!compositionValid && <p>Состав изменился. Если участников меньше пяти перед первым раундом, отмените раздачу и пригласите замену по тому же коду.</p>}
      {awaitingReplacement && <p>Замените карточку у имени участника, затем дождитесь его готовности.</p>}
      {!ready && <div data-dialog-panel>
        <p>Некоторые участники ещё читают или потеряли связь. Если начать сейчас, у них тоже пойдёт время раунда.</p>
        <button type="button" disabled={blocked} onClick={() => runFromDialog('round:start', { ...gameCommand(room), confirmWarnings: true })}>Начать без полной готовности</button>
      </div>}
      <details><summary>Управление раздачей</summary>
        <ConfirmButton data-secondary title="Перевыдать карточки?" description="Все участники текущей раздачи получат новые карточки и отметят готовность заново."
          confirm="Перевыдать карточки" disabled={disabled} fallbackFocus={opener}
          onConfirm={() => runFromDialog('deal:shuffle', { ...dealCommand(room), possessedCount: count })}>Перевыдать карточки</ConfirmButton>
        <ConfirmButton data-danger title="Отменить текущую раздачу?" confirm="Отменить раздачу" disabled={disabled} fallbackFocus={opener}
          onConfirm={() => runFromDialog('deal:cancel', dealCommand(room))}>Отменить раздачу</ConfirmButton>
      </details>
      <div data-dialog-actions><button type="button" data-secondary onClick={close}>Закрыть</button></div>
    </GameDialog>}
  </div>;
}
