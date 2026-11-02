import type { GameSnapshot } from '../../../shared/protocol.js';
import styles from './RitualBoard.module.css';
export function RitualBoard({ game }: { game: GameSnapshot }) {
  const ritual = game.ritual;
  const last = game.results.at(-1);
  if (!ritual) return game.settings.ritualEnabled ? <section aria-label="Общий ритуал"><h3>Дом ждёт</h3>
    <p>Ритуал начнётся при первом обычном старте. Освобождённая исходная группа и зачтённая миссия продвигают одну свечу на шаг: A → B → C → выход.</p>
    {last?.kind === 'tutorial' && last.status !== 'aborted' && <p>Учебных успехов: {last.rescuedGroups + last.missions}. В основной партии они передвинули бы свечи; настоящий ритуал пока не изменён.</p>}
  </section> : null;
  const labels = { playing: 'Ритуал продолжается', won: 'Победа · дом освобождён', lost: 'Поражение · дух остался', stopped: 'Партия прервана' };
  return <section className={styles.board} aria-label="Общий ритуал">
    <h3 aria-live="polite">{labels[ritual.outcome]}</h3>
    {game.freeplayFrom !== null && <p>Сейчас идёт свободная игра. Исход ритуала сохранён.</p>}
    <p>Осталось шагов до освобождения дома: {ritual.remainingSteps}. Начальная цель: {ritual.target}. Состав при старте: {ritual.players}, обычных раундов: {ritual.roundLimit}.</p>
    <ol className={styles.stages}>{ritual.cards.map((item, i) => <li key={item.slot}>
      <span className={styles.candle} aria-hidden="true" /><strong>{item.slot} · Свечей: {ritual.positions[i]}</strong>
      {item.revealed ? <><h4>{item.card.title}</h4><p>{item.card.rule}</p></> : <p>Прорицание закрыто</p>}
    </li>)}</ol><p>Вышло свечей: {ritual.positions[3]}. {ritual.outcome === 'playing' ? 'Открытые правила действуют только на базе и складываются.' : 'Ритуал закрыт. Правила прорицаний больше не действуют.'}</p>
    {ritual.preview && <p role="status">Успехов предварительно: {ritual.preview.successes}. После подтверждения останется шагов: {ritual.preview.remainingSteps}. Закрытые карты пока не раскрываются.</p>}
    <p>Участники честно сообщают о нарушениях. Обязательные объявления, обсуждение правил, технических проблем и безопасности не штрафуются.</p>
  </section>;
}
