import type { GamePhase, GameSnapshot, PauseReason, Role } from '../../../shared/protocol.js';
import { useRoundClock } from './useRoundClock.js';
import type { ConnectionState } from '../api/index.js';
import styles from './RoundStatus.module.css';

const labels: Record<GamePhase, string> = { lobby: 'Сбор участников', reading: 'Чтение карточек', placement: 'Расстановка', search: 'Поиск', return: 'Возвращение на базу', between_rounds: 'Перерыв', finished: 'Партия завершена' };
const reasons: Record<PauseReason, string> = { organizer: 'Пауза организатора.', organizer_disconnected: 'Панель организатора отключилась.', participant_left: 'Участник покинул раунд.', clock_gap: 'Ноутбук был недоступен или часы изменились.' };
export function RoundStatus({ game, clockOffset, connection, role, waiting = false }: {
  game: GameSnapshot; clockOffset: number | null; connection: ConnectionState; role?: Role; waiting?: boolean;
}) {
  const remaining = useRoundClock(game, clockOffset);
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
  let instruction: string;
  if (game.phase === 'reading') instruction = 'Прочитайте свою карточку и отметьте готовность. Запуск — с ноутбука.';
  else if (game.phase === 'placement') instruction = waiting ? 'Вы участвуете со следующего раунда. Оставайтесь на базе.'
    : role === 'possessed' ? 'Спокойно займите место в разрешённой зоне. Не бегите.'
    : role === 'exorcist' ? 'Ждите на базе до начала поиска.' : 'Одержимые занимают места. Экзорцисты ждут на базе.';
  else if (game.phase === 'search') instruction = waiting ? 'Ждите следующего раунда на базе.'
    : role === 'possessed' ? 'Оставайтесь в выбранной зоне и следуйте поведению на карточке.'
    : 'Поиск начался. Ищите одержимых и помогайте им. Передвигайтесь шагом, только в разрешённых зонах.';
  else if (game.phase === 'return') instruction = 'Все возвращаются на базу. Передвигайтесь шагом.';
  else if (game.phase === 'between_rounds') instruction = game.lastRoundAborted ? 'Раунд отменён. Все возвращаются на базу. Ждите новой раздачи.' : 'Раунд окончен. Отдыхайте на базе и ждите новой раздачи.';
  else if (game.phase === 'finished') instruction = `Завершено раундов: ${game.completedRounds}. Все возвращаются на базу.`;
  else instruction = 'Собираемся у экрана. Ждите раздачи карточек.';
  if (game.paused) instruction = 'Прекратите действия и ждите в безопасном месте. Продолжение объявит ноутбук.';
  return <section className={styles.panel} aria-label="Состояние раунда">
    <p>Раунд {game.roundNumber || 1} {game.settings.roundLimit === null ? '· без ограничения' : `из ${game.settings.roundLimit}`} · завершено: {game.completedRounds}</p>
    <div role="status"><h3>{game.paused ? `Пауза · ${labels[game.phase]}` : labels[game.phase]}</h3></div>
    {(game.deadline !== null || game.paused) && <>
      <div className={styles.timer} role="timer" aria-label="Осталось времени" aria-live="off">{seconds === null ? '—:—' : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</div>
      {remaining === 0 && !game.paused && <p>Ожидаем подтверждения следующей фазы от сервера…</p>}
    </>}
    {game.paused && <p>{game.pauseReason && reasons[game.pauseReason]} Время сохранено.</p>}
    <p>{instruction}</p>
    {connection !== 'online' && <p role="alert">Нет связи. Фаза и таймер не подтверждены. Сверьтесь с общим экраном.</p>}
  </section>;
}
