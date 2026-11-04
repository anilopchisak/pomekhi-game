import { ConfirmButton } from '../../../shared/ui/index.js';
import { useState } from 'react';
import { dealCommand } from '../../../shared/api/index.js';
import type { LobbyCommand, LobbyInputs, RoomSnapshot } from '../../../../shared/protocol.js';

export function DealControls({ room, disabled, run }: {
  room: RoomSnapshot; disabled: boolean;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number>();
  const maximum = Math.max(1, Math.floor(room.players.length / 2));
  const count = Math.min(selected ?? room.dealing.initialPossessedCount ?? 3, maximum);
  const reading = room.game.phase === 'reading';
  const readyCount = room.dealing.assignments.filter(item => item.ready).length;
  if (!['lobby', 'reading', 'between_rounds'].includes(room.game.phase)) return null;
  if (room.game.firstGame) return <section aria-label="Раздача">
    <h3>{reading ? 'Чтение карточек' : room.game.started ? 'Новая раздача — только свободным' : 'Подготовка раздачи'}</h3>
    {reading ? <p role="status">Прочитали: {readyCount} / {room.dealing.assignments.length}. Чтение без таймера.</p>
      : <p>Карточки чередуются по порядку за столом. Группы в локациях сохраняют свои карточки.</p>}
    {reading ? <>
      <ConfirmButton title="Перевыдать карточки?" description="Новые карточки получат участники текущей раздачи."
        confirm="Перевыдать карточки" disabled={disabled}
        onConfirm={() => void run('deal:shuffle', { ...dealCommand(room), possessedCount: count })}>Перевыдать карточки</ConfirmButton>
      <ConfirmButton data-danger title="Отменить текущую раздачу?" confirm="Отменить раздачу" disabled={disabled}
        onConfirm={() => void run('deal:cancel', dealCommand(room))}>Отменить раздачу</ConfirmButton>
    </> : <button disabled={disabled || !room.game.started && room.players.length < 5 || !room.game.venue.dwelling}
      onClick={() => void run('deal:create', { ...dealCommand(room), possessedCount: count })}>
      {room.game.started ? 'Раздать свободным' : 'Раздать карточки'}
    </button>}
  </section>;
  return <section>
    <h3>{reading ? 'Чтение карточек' : 'Подготовка раздачи'}</h3>
    <label>Одержимых при новой общей раздаче
      <input type="number" min={1} max={maximum} value={count} disabled={disabled || room.players.length < 4}
        onChange={event => setSelected(Math.max(1, Math.min(maximum, Number(event.target.value) || 1)))} />
    </label>
    <p>Карточки получат все участники комнаты, в том числе временно отключённые. Для новой раздачи нужны минимум четыре человека.</p>
    {reading && <>
      <p role="status">Прочитали: {readyCount} / {room.players.length}. На связи: {room.players.filter(player => player.online).length} / {room.players.length}.</p>
      {!room.dealing.compositionValid && <p role="alert">Состав изменился. Доберите участников или сделайте новую общую раздачу. Карточки остальных сохранены.</p>}
      <p>Время чтения не ограничено. Отметки готовности ничего не запускают.</p>
    </>}
    <button disabled={disabled || room.players.length < 4} onClick={() => {
      if (reading && !window.confirm('Заново распределить роли и карточки всем участникам? Готовность и запросы замены будут сброшены.')) return;
      void run(reading ? 'deal:shuffle' : 'deal:create', { ...dealCommand(room), possessedCount: count });
    }}>{reading ? 'Перетасовать роли и карточки' : 'Раздать роли и карточки'}</button>
    {reading && <button data-danger disabled={disabled} onClick={() => {
      if (window.confirm('Отменить раздачу? Карточки и готовность будут очищены, участники останутся в комнате.')) void run('deal:cancel', dealCommand(room));
    }}>Отменить раздачу</button>}
  </section>;
}
