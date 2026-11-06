import type { RoundResult } from '../../../shared/protocol.js';

export function ResultsSummary({ results, freeplayFrom = null, firstGame = false }: { results: RoundResult[]; freeplayFrom?: number | null; firstGame?: boolean }) {
  if (!results.length) return null;
  const main = freeplayFrom === null ? results : results.slice(0, freeplayFrom);
  const extra = freeplayFrom === null ? [] : results.slice(freeplayFrom);
  const counted = main.filter(r => r.kind === 'regular' && r.status !== 'aborted');
  const sum = (key: 'rescuedGroups' | 'totalGroups' | 'missions' | 'totalMissions' | 'activeMs') => counted.reduce((total, row) => total + row[key], 0);
  const time = (ms: number) => `${Math.floor(ms / 60000)} мин ${Math.floor(ms / 1000) % 60} с`;
  return <div aria-label="Результаты раундов">
    <h3>Командные результаты</h3>
    <p>Спасено групп: {sum('rescuedGroups')} / {sum('totalGroups')}. Миссии: {sum('missions')} / {sum('totalMissions')}. Активное время: {time(sum('activeMs'))}.</p>
    {extra.length > 0 && <p>Свободная игра. Завершено дополнительных раундов: {extra.filter(r => r.status !== 'aborted').length}. Дополнительные результаты не меняют исход и итог ритуала.</p>}
    {results.map((row, index) => <div key={row.roundId}>
      <h4>{freeplayFrom !== null && index >= freeplayFrom ? 'Свободная игра · ' : ''}{row.kind === 'tutorial' ? 'Обучение · без общего зачёта' : `Раунд ${row.number}`} · {!firstGame && `Уровень ${row.difficulty} · `}{row.lossReason === 'no_return' ? 'Поражение · никто не вернулся на базу' : row.status === 'provisional' ? 'Предварительный итог' : row.status === 'aborted' ? 'Отменён, без зачёта' : 'Результат зафиксирован'}</h4>
      {row.status !== 'aborted' && <p>Спасено групп: {row.rescuedGroups} / {row.totalGroups}. Миссии: {row.missions} / {row.totalMissions}. Заражено: {row.infectedPlayers}. Время: {time(row.activeMs)}.</p>}
      {row.status === 'provisional' && <p>Можно дополнить миссии и отменить допустимые действия до фиксации.</p>}
    </div>)}
  </div>;
}
