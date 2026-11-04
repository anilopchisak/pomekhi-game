import { useEffect, useState } from 'react';
import { DEFAULT_ROUND_LIMIT } from '../../../../shared/protocol.js';
import type { GameSettings, LobbyCommand, LobbyInputs, RoomSnapshot } from '../../../../shared/protocol.js';
import { gameCommand } from '../../../shared/api/index.js';

export function GameControls({ room, disabled, run }: {
  room: RoomSnapshot; disabled: boolean;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
}) {
  const game = room.game;
  const { ritualEnabled, roundLimit, placementSeconds, searchSeconds, returnSeconds, tutorialEnabled, initialDifficulty, maximumDifficulty, infectionMode } = game.settings;
  const [draft, setDraft] = useState<GameSettings>(game.settings);
  useEffect(() => setDraft({ ritualEnabled, roundLimit, placementSeconds, searchSeconds, returnSeconds, tutorialEnabled, initialDifficulty, maximumDifficulty, infectionMode }), [ritualEnabled, roundLimit, placementSeconds, searchSeconds, returnSeconds, tutorialEnabled, initialDifficulty, maximumDifficulty, infectionMode]);
  const timed = ['placement', 'search', 'return'].includes(game.phase);
  const editable = ['lobby', 'reading', 'between_rounds'].includes(game.phase);
  const progressionLocked = disabled || game.started || game.phase === 'reading';
  const dirty = JSON.stringify(draft) !== JSON.stringify(game.settings);
  const hasWarnings = room.players.some(player => !player.online) || room.dealing.assignments.some(item => !item.ready);
  const synchronization = game.synchronization;
  const pendingSync = synchronization && !synchronization.closed && (synchronization.conflicts > 0 || synchronization.waitingPlayerIds.length > 0);
  const pendingRitual = game.settings.ritualEnabled && game.results.at(-1)?.status === 'provisional';
  const pendingReplacement = room.dealing.assignments.some(item => item.replacementRequested);
  return <section aria-label="Управление раундом">
    <h3>Управление раундом</h3>
    {editable && <details>
      <summary>Настройки партии, сложности и времени</summary>
      <form onSubmit={event => { event.preventDefault(); void run('game:configure', { ...gameCommand(room), settings: draft }); }}>
        <label><input type="checkbox" checked={draft.ritualEnabled} disabled={progressionLocked || draft.roundLimit === null} onChange={event => setDraft({ ...draft, ritualEnabled: event.target.checked })} /> Общий ритуал со свечами</label>
        <label><input type="checkbox" checked={draft.tutorialEnabled} disabled={progressionLocked} onChange={event => setDraft({ ...draft, tutorialEnabled: event.target.checked })} /> Учебный раунд перед основной партией</label>
        <label>Начальная сложность<select value={draft.initialDifficulty} disabled={progressionLocked} onChange={event => {
          const level = Number(event.target.value) as GameSettings['initialDifficulty'];
          setDraft({ ...draft, initialDifficulty: level, maximumDifficulty: Math.max(level, draft.maximumDifficulty) as GameSettings['maximumDifficulty'] });
        }}>{[1, 2, 3].map(level => <option key={level} value={level}>Уровень {level}</option>)}</select></label>
        <label>Максимальная сложность<select value={draft.maximumDifficulty} disabled={progressionLocked} onChange={event => setDraft({ ...draft, maximumDifficulty: Number(event.target.value) as GameSettings['maximumDifficulty'] })}>
          {[1, 2, 3].filter(level => level >= draft.initialDifficulty).map(level => <option key={level} value={level}>Уровень {level}</option>)}
        </select></label>
        <label>Заражение<select value={draft.infectionMode} disabled={disabled} onChange={event => setDraft({ ...draft, infectionMode: event.target.value as GameSettings['infectionMode'] })}>
          <option value="auto">Автоматически · в поздних раундах</option><option value="on">Включено</option><option value="off">Выключено</option>
        </select></label>
        <p>Режим заражения действует до следующего изменения. «Включено» действует с обучения. «Автоматически» оставляет обучение без заражения и включает его в последней четверти обычных раундов.</p>
        <label><input type="checkbox" checked={draft.roundLimit === null} disabled={progressionLocked}
          onChange={event => setDraft({ ...draft, ritualEnabled: !event.target.checked, roundLimit: event.target.checked ? null : DEFAULT_ROUND_LIMIT })} /> Без ограничения раундов</label>
        {draft.roundLimit !== null && <label>Количество раундов<input type="number" min={1} max={99} value={draft.roundLimit} disabled={progressionLocked}
          onChange={event => setDraft({ ...draft, roundLimit: Number(event.target.value) })} required /></label>}
        {([['placementSeconds', 'Расстановка'], ['searchSeconds', 'Поиск'], ['returnSeconds', 'Возвращение']] as const).map(([key, label]) =>
          <label key={key}>{label}, секунд<input type="number" min={1} max={3600} step={1} value={draft[key]} disabled={disabled}
            onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} required /></label>)}
        <p>В бесконечном режиме ритуала нет. Обучение не входит в количество раундов и не двигает свечи. Длина и сложность фиксируются при первом старте; для их изменения до старта отмените раздачу. Время и режим заражения можно менять перед следующим стартом.</p>
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
    {game.phase === 'between_rounds' && <button data-danger disabled={disabled || Boolean(pendingSync) || pendingRitual} onClick={() => {
      if (window.confirm('Завершить партию сейчас?')) void run('party:finish', gameCommand(room));
    }}>Завершить партию</button>}
    {game.phase === 'finished' && !game.ritual && game.settings.roundLimit !== null && <button disabled={disabled} onClick={() => void run('party:extend', gameCommand(room))}>Добавить ещё раунд</button>}
    {game.results.at(-1)?.status === 'provisional' && <button disabled={disabled || Boolean(pendingSync)} onClick={() => {
      if (window.confirm(game.settings.ritualEnabled ? 'Подтвердить итоги раунда? Свечи продвинутся, могут открыться прорицания и завершиться партия. Поздние действия не изменят итог.' : 'Зафиксировать результаты? Отметки миссий и отмена действий этого раунда станут недоступны.')) void run('results:finalize', gameCommand(room));
    }}>{game.settings.ritualEnabled ? 'Подтвердить итоги раунда' : 'Зафиксировать результаты'}</button>}
    {game.ritual && game.settings.ritualEnabled && ['reading', 'between_rounds'].includes(game.phase) && game.ritual.outcome === 'playing' && <div aria-label="Штрафы ритуала">
      <p>Участники сообщают о нарушениях на базе. Одна отметка — один шаг свечи назад. Обязательные объявления, правила, технические вопросы и безопасность не штрафуются.</p>
      <button disabled={disabled || !game.ritual.canPenalize} onClick={() => { if (window.confirm('Отметить одно нарушение прорицания и вернуть свечу на шаг назад?')) void run('ritual:penalty', gameCommand(room)); }}>Нарушение прорицания</button>
      <button disabled={disabled || !game.ritual.canUndoPenalty} onClick={() => void run('ritual:undo-penalty', gameCommand(room))}>Отменить последний штраф</button>
    </div>}
    {game.phase === 'finished' && game.ritual && game.ritual.outcome !== 'playing' && game.freeplayFrom === null && <button disabled={disabled} onClick={() => { if (window.confirm('Продолжить свободные раунды? Исход ритуала сохранится, новые результаты будут показаны отдельно.')) void run('party:freeplay', gameCommand(room)); }}>Продолжить свободную игру</button>}
    {pendingRitual && <p role="status">После синхронизации подтвердите итоги раунда. До этого следующая раздача недоступна.</p>}
    <button disabled={disabled} onClick={() => void run('lobby:sync', {})}>Обновить состояние</button>
  </section>;
}
