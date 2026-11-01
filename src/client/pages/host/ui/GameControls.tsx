import { useEffect, useState } from 'react';
import type { GameSettings, LobbyCommand, LobbyInputs, RoomSnapshot } from '../../../../shared/protocol.js';
import { gameCommand } from '../../../shared/api/index.js';

export function GameControls({ room, disabled, run }: {
  room: RoomSnapshot; disabled: boolean;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
}) {
  const game = room.game;
  const { roundLimit, placementSeconds, searchSeconds, returnSeconds, infectionEnabled } = game.settings;
  const [draft, setDraft] = useState<GameSettings>(game.settings);
  useEffect(() => setDraft({ roundLimit, placementSeconds, searchSeconds, returnSeconds, infectionEnabled }), [roundLimit, placementSeconds, searchSeconds, returnSeconds, infectionEnabled]);
  const timed = ['placement', 'search', 'return'].includes(game.phase);
  const editable = ['lobby', 'reading', 'between_rounds'].includes(game.phase);
  const dirty = JSON.stringify(draft) !== JSON.stringify(game.settings);
  const hasWarnings = room.players.some(player => !player.online) || room.dealing.assignments.some(item => !item.ready);
  const pendingReplacement = room.dealing.assignments.some(item => item.replacementRequested);
  return <section aria-label="Управление раундом">
    <h3>Управление раундом</h3>
    {editable && <details>
      <summary>Настройки партии и времени</summary>
      <form onSubmit={event => { event.preventDefault(); void run('game:configure', { ...gameCommand(room), settings: draft }); }}>
        <label><input type="checkbox" checked={draft.infectionEnabled} disabled={disabled} onChange={event => setDraft({ ...draft, infectionEnabled: event.target.checked })} /> Заражение в следующем раунде</label>
        <label><input type="checkbox" checked={draft.roundLimit === null} disabled={disabled || game.started}
          onChange={event => setDraft({ ...draft, roundLimit: event.target.checked ? null : 5 })} /> Без ограничения раундов</label>
        {draft.roundLimit !== null && <label>Количество раундов<input type="number" min={1} max={99} value={draft.roundLimit} disabled={disabled || game.started}
          onChange={event => setDraft({ ...draft, roundLimit: Number(event.target.value) })} required /></label>}
        {([['placementSeconds', 'Расстановка'], ['searchSeconds', 'Поиск'], ['returnSeconds', 'Возвращение']] as const).map(([key, label]) =>
          <label key={key}>{label}, секунд<input type="number" min={1} max={3600} step={1} value={draft[key]} disabled={disabled}
            onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} required /></label>)}
        <p>Количество раундов фиксируется при первом старте. Время можно менять перед следующим раундом.</p>
        <button disabled={disabled || !dirty}>Сохранить настройки</button>
      </form>
    </details>}
    {game.phase === 'reading' && <>
      {dirty && <p role="alert">Сохраните настройки перед запуском.</p>}
      {pendingReplacement && <p>Сначала замените карточки по запросам или попросите участников отменить запросы.</p>}
      <button disabled={disabled || dirty || !room.dealing.compositionValid || pendingReplacement} onClick={() => {
        if (hasWarnings && !window.confirm('Есть неготовые или отключённые участники. Начать раунд с текущим составом?')) return;
        void run('round:start', { ...gameCommand(room), confirmWarnings: hasWarnings });
      }}>Начать раунд</button>
    </>}
    {timed && <>
      {!game.paused ? <button disabled={disabled} onClick={() => void run('round:pause', gameCommand(room))}>Пауза</button>
        : <button disabled={disabled || !game.activePlayerIds.length} onClick={() => {
          if (game.rosterChanged && !window.confirm('Состав раунда изменился. Продолжить с оставшимися участниками без новых карточек?')) return;
          void run('round:resume', { ...gameCommand(room), confirmWarnings: game.rosterChanged });
        }}>Продолжить</button>}
      {game.phase === 'search' && <button disabled={disabled || !game.activePlayerIds.length} onClick={() => {
        if (window.confirm('Завершить поиск и запустить таймер возвращения на базу?')) void run('round:return', gameCommand(room));
      }}>{game.paused ? 'Начать возвращение' : 'Завершить поиск'}</button>}
      <button data-danger disabled={disabled} onClick={() => {
        if (window.confirm('Отменить раунд без зачёта? Всем потребуется вернуться на базу.')) void run('round:abort', gameCommand(room));
      }}>Отменить раунд</button>
    </>}
    {game.phase === 'between_rounds' && <button data-danger disabled={disabled} onClick={() => {
      if (window.confirm('Завершить партию сейчас?')) void run('party:finish', gameCommand(room));
    }}>Завершить партию</button>}
    {game.phase === 'finished' && game.settings.roundLimit !== null && <button disabled={disabled} onClick={() => void run('party:extend', gameCommand(room))}>Добавить ещё раунд</button>}
    {game.results.at(-1)?.status === 'provisional' && <button disabled={disabled} onClick={() => {
      if (window.confirm('Зафиксировать результаты? Отметки миссий и отмена действий этого раунда станут недоступны.')) void run('results:finalize', gameCommand(room));
    }}>Зафиксировать результаты</button>}
    <button disabled={disabled} onClick={() => void run('lobby:sync', {})}>Обновить состояние</button>
  </section>;
}
