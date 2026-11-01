import type { RoundResult } from '../../../shared/protocol.js';

export function ResultsSummary({ results }: { results: RoundResult[] }) {
  if (!results.length) return null;
  const counted = results.filter(r => r.status !== 'aborted');
  const sum = (key: 'rescuedGroups' | 'totalGroups' | 'missions' | 'totalMissions' | 'activeMs') => counted.reduce((total, row) => total + row[key], 0);
  const time = (ms: number) => `${Math.floor(ms / 60000)} мин ${Math.floor(ms / 1000) % 60} с`;
  return <div aria-label="Результаты раундов">
    <h3>Командные результаты</h3>
    <p>Спасено групп: {sum('rescuedGroups')} / {sum('totalGroups')}. Миссии: {sum('missions')} / {sum('totalMissions')}. Активное время: {time(sum('activeMs'))}.</p>
    {results.map(row => <div key={row.roundId}>
      <h4>Раунд {row.number} · {row.status === 'provisional' ? 'Предварительный итог' : row.status === 'aborted' ? 'Отменён, без зачёта' : 'Результат зафиксирован'}</h4>
      {row.status !== 'aborted' && <p>Спасено групп: {row.rescuedGroups} / {row.totalGroups}. Миссии: {row.missions} / {row.totalMissions}. Заражено: {row.infectedPlayers}. Время: {time(row.activeMs)}.</p>}
      {row.status === 'provisional' && <p>Можно дополнить миссии и отменить допустимые действия до фиксации.</p>}
    </div>)}
  </div>;
}
