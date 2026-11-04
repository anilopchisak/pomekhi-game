import type { LobbyCommand, LobbyInputs, RoomSnapshot } from '../../../../shared/protocol.js';
import { gameCommand } from '../../../shared/api/index.js';
import { ConfirmButton } from '../../../shared/ui/index.js';

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
  const ready = room.dealing.assignments.every(item => item.ready && room.players.some(player => player.id === item.playerId && player.online));
  const awaitingReplacement = room.dealing.assignments.some(item => item.replacementRequested);
  const ritual = game.ritual;
  const penalty = ritual?.penaltyPreview;
  if (game.phase === 'lobby') return null;
  if (game.phase === 'finished') return <div aria-label="Управление раундом"><ConfirmButton title="Начать новую партию?"
    description="Текущая комната закроется. Для новой партии игроки получат новое приглашение."
    confirm="Закрыть текущую комнату" onConfirm={newParty} disabled={disabled}>Новая партия</ConfirmButton></div>;

  return <div aria-label="Управление раундом">
    {game.phase === 'reading' && <>
      {awaitingReplacement && <p>Сначала разберите запросы замены карточек.</p>}
      {!game.started && room.players.length < 5 && <p>Для старта нужно пять игроков. Отмените раздачу и пригласите замену по тому же коду комнаты.</p>}
      {ready ? <button disabled={disabled || !room.dealing.compositionValid || awaitingReplacement}
        onClick={() => void run('round:start', { ...gameCommand(room), confirmWarnings: false })}>Начать раунд</button>
        : <ConfirmButton title="Начать раунд с текущим составом?"
          description="Некоторые участники ещё не готовы или отключены."
          confirm="Начать раунд" disabled={disabled || !room.dealing.compositionValid || awaitingReplacement}
          onConfirm={() => void run('round:start', { ...gameCommand(room), confirmWarnings: true })}>Начать раунд</ConfirmButton>}
    </>}
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
