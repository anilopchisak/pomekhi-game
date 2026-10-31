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
  const reading = room.dealing.phase === 'reading';
  const readyCount = room.dealing.assignments.filter(item => item.ready).length;
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
