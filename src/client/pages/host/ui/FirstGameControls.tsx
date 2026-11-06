import type { LobbyCommand, LobbyInputs, RoomSnapshot } from '../../../../shared/protocol.js';
import { dealCommand, gameCommand } from '../../../shared/api/index.js';
import { ConfirmButton } from '../../../shared/ui/index.js';
import styles from './Broadcast.module.css';

export function FirstGameControls({ room, disabled, run, newParty }: {
  room: RoomSnapshot;
  disabled: boolean;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
  newParty: () => void;
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
      {!game.venue.zones.length && <p>Укажите места игры в настройках партии.</p>}
      {room.players.length < 5 && <p>Для раздачи нужно не меньше пяти участников.</p>}
      <button disabled={disabled || room.players.length < 5 || !game.venue.zones.length}
        onClick={() => void run('deal:create', { ...dealCommand(room), possessedCount: count })}>Раздать карточки</button>
    </div>;
  }
  if (game.phase === 'finished') return <div aria-label="Управление раундом"><ConfirmButton title="Начать новую партию?"
    description="Текущая комната закроется. Откроется пустая комната с новым приглашением."
    confirm="Создать новую комнату" onConfirm={newParty} disabled={disabled}>Новая партия</ConfirmButton></div>;

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
    {provisional && <ConfirmButton title="Подтвердить итоги раунда?"
      description={ritual?.preview ? `Предварительный итог: ${ritual.preview.successes} успехов, останется ${ritual.preview.remainingSteps} шагов. После подтверждения поздние записи не изменят результат.` : 'Подтверждённый результат больше не изменится.'}
      confirm="Подтвердить итог" disabled={disabled || Boolean(waiting)}
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
  </div>;
}

function ReadingControls({ room, disabled, run }: Pick<Parameters<typeof FirstGameControls>[0], 'room' | 'disabled' | 'run'>) {
  const { assignments, compositionValid } = room.dealing;
  const ready = assignments.every(assignment => assignment.ready &&
    room.players.some(player => player.id === assignment.playerId && player.online));
  const awaitingReplacement = assignments.some(item => item.replacementRequested);
  const blocked = !compositionValid || awaitingReplacement;
  return <div className={styles.sceneActions}>
    {ready || blocked ? <button disabled={disabled || blocked}
      onClick={() => void run('round:start', { ...gameCommand(room), confirmWarnings: false })}>
      {awaitingReplacement ? 'Сначала замените карточки' : ready ? 'Начать раунд' : 'Ждём чтения всех участников'}
    </button> : <ConfirmButton data-secondary disabled={disabled} title="Начать без полной готовности?"
      description="Некоторые участники ещё читают или потеряли связь. Если начать сейчас, у них тоже пойдёт время раунда."
      confirm="Начать раунд" onConfirm={() => void run('round:start', { ...gameCommand(room), confirmWarnings: true })}>
      Начать без полной готовности
    </ConfirmButton>}
    {!compositionValid && <p>С этим составом начать раунд нельзя. Остановить партию можно в настройках партии.</p>}
  </div>;
}
