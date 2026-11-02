import { useState } from 'react';
import type { LobbyCommand, LobbyInputs, LobbyView, OfflineAction } from '../../../../shared/protocol.js';
import { gameCommand } from '../../../shared/api/index.js';

export function PlayControls({ view, disabled, run, queue }: {
  view: Extract<LobbyView, { kind: 'player' }>; disabled: boolean;
  queue?: (action: OfflineAction) => Promise<void>;
  run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
}) {
  const [target, setTarget] = useState('');
  const { play, room } = view;
  if (!play) return null;
  const game = room.game;
  const base = { ...gameCommand(room), playVersion: play.version };
  const mutable = !game.lastRoundAborted && !game.results.some(result => result.roundId === play.roundId && result.status !== 'provisional');
  const searching = game.phase === 'search' && !game.paused && mutable;
  const possessed = play.status === 'possessed' || play.status === 'captured';
  const missionAllowed = mutable && !game.paused && ['search', 'return', 'between_rounds', 'finished'].includes(game.phase);
  const name = room.players.find(p => p.id === target)?.name;
  return <section aria-label="Игровые действия">
    <h3>{({ exorcist: 'Вы — экзорцист', possessed: 'Вы — одержимый', captured: 'Вы заражены', released: 'Вы освобождены' })[play.status]}</h3>
    {play.status === 'captured' && <p>Ваша дополнительная миссия не засчитывается.</p>}
    {play.wasCaptured && play.status === 'released' && <p>Вы были заражены: дополнительная миссия этого раунда не засчитывается.</p>}
    {queue && play.status === 'exorcist' && game.roundPlan.infectionEnabled && <div>
      <label>Кто вас заразил<select value={target} disabled={disabled || !searching} onChange={e => setTarget(e.target.value)}><option value="">Выберите имя</option>{room.players.filter(p => p.id !== view.playerId && game.activePlayerIds.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button disabled={disabled || !searching || !target} onClick={() => { if (window.confirm('Вас заразили? Прочитайте карточку этого участника вживую.')) void queue({ kind: 'captured', by: target }); }}>Меня заразили</button>
    </div>}
    {possessed && <>
      <button disabled={disabled || !searching} onClick={() => {
        if (window.confirm('Условие освобождения выполнено? Вся ваша группа будет освобождена и вернётся на базу.')) void (queue ? queue({ kind: 'release' }) : run('play:release', base));
      }}>Нас освободили</button>
      {game.roundPlan.infectionEnabled && <>
        <label>Кого заразить<select value={target} disabled={disabled || !searching} onChange={event => setTarget(event.target.value)}>
          <option value="">Выберите имя</option>
          {room.players.filter(p => p.id !== view.playerId && game.activePlayerIds.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <button disabled={disabled || !searching || !name} onClick={() => {
          if (window.confirm(`Условие заражения выполнено участником «${name}»? Он немедленно присоединится к вашей группе.`)) void (queue ? queue({ kind: 'infect', targetId: target }) : run('play:infect', { ...base, targetId: target }));
        }}>Заразить выбранного</button>
      </>}
    </>}
    {play.missionEligible && <button disabled={disabled || !missionAllowed} onClick={() => {
      if (window.confirm(play.missionCompleted ? 'Снять отметку выполнения миссии?' : 'Вы выполнили дополнительную миссию?')) void (queue ? queue({ kind: 'mission', completed: !play.missionCompleted }) : run('play:mission', { ...base, completed: !play.missionCompleted }));
    }}>{play.missionCompleted ? 'Снять отметку миссии' : 'Миссия выполнена'}</button>}
    {play.undo && <>
      <p>Последнее действие: {play.undo.label}.</p>
      <button disabled={disabled || !mutable || !play.undo.available} onClick={() => {
        if (window.confirm(`Отменить: ${play.undo!.label}? Завершённый поиск не возобновится.`)) void (queue ? queue({ kind: 'undo', actionId: play.undo!.id }) : run('play:undo', { ...base, actionId: play.undo!.id }));
      }}>Отменить моё последнее действие</button>
      {!play.undo.available && mutable && <p>Отмена недоступна: есть зависимые события или результат зафиксирован.</p>}
    </>}
    {!mutable && <p>Результат закрыт для изменений.</p>}
  </section>;
}
