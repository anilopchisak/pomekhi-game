import type { ReactNode } from 'react';
import type { GamePhase, GameSnapshot, PauseReason, Role } from '../../../shared/protocol.js';
import { useRoundClock } from './useRoundClock.js';
import type { ConnectionState } from '../api/index.js';
import { RitualBoard } from './RitualBoard.js';
import { ResultsSummary } from './ResultsSummary.js';
import styles from './RoundStatus.module.css';

const labels: Record<GamePhase, string> = { lobby: 'Сбор участников', reading: 'Чтение карточек', placement: 'Расстановка', search: 'Поиск', return: 'Возвращение на базу', between_rounds: 'Перерыв', finished: 'Партия завершена' };
const reasons: Record<PauseReason, string> = { organizer: 'Пауза организатора.', organizer_disconnected: 'Панель организатора отключилась.', participant_left: 'Участник покинул раунд.', clock_gap: 'Ноутбук был недоступен или часы изменились.', server_restarted: 'Программа перезапущена.', storage_error: 'Ошибка сохранения. Ждите восстановления записи с ноутбука.' };
export function RoundTimer({ game, clockOffset, connection }: {
  game: GameSnapshot; clockOffset: number | null; connection: ConnectionState;
}) {
  const clock = useRoundClock(game, clockOffset);
  if (game.deadline === null && !game.paused) return null;
  const seconds = clock === null || connection !== 'online' ? null : Math.ceil(clock / 1000);
  const label = seconds === null ? '—:—' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return <output role="timer" aria-label="Осталось времени" aria-live="off">{label}</output>;
}

const endings = { won: 'Победа · дом освобождён', lost: 'Поражение после 7-го раунда', all_possessed: 'Поражение · все одержимы', stopped: 'Партия остановлена', playing: labels.finished };

export function RoundStatus({ game, clockOffset, connection, role, playStatus, waiting = false, retained = false, showRitual = true, compact = false, timerInHeader = false, cardHidden, cardReady, metadata, estimatedSearchEnded = false, children }: {
  game: GameSnapshot; clockOffset: number | null; connection: ConnectionState; role?: Role; playStatus?: 'exorcist' | 'possessed' | 'captured' | 'released'; waiting?: boolean; retained?: boolean; showRitual?: boolean; compact?: boolean; timerInHeader?: boolean; cardHidden?: boolean; cardReady?: boolean; metadata?: ReactNode; estimatedSearchEnded?: boolean; children?: ReactNode;
}) {
  const clock = useRoundClock(game, timerInHeader ? null : clockOffset);
  const remaining = game.firstGame && connection !== 'online' ? null : clock;
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
  let instruction: string;
  if (game.phase === 'reading') instruction = 'Прочитайте свою карточку и отметьте готовность. Запуск — с ноутбука.';
  else if (game.phase === 'placement') instruction = waiting ? 'Вы участвуете со следующего раунда. Оставайтесь на базе.'
    : role === 'possessed' ? 'Спокойно займите место в разрешённой зоне. Не бегите.'
    : role === 'exorcist' ? 'Ждите на базе до начала поиска.' : 'Одержимые занимают места. Экзорцисты ждут на базе.';
  else if (game.phase === 'search') instruction = waiting ? 'Ждите следующего раунда на базе.'
    : playStatus === 'captured' ? 'Оставайтесь в той же зоне и повторяйте поведение группы.'
    : role === 'possessed' ? 'Оставайтесь в выбранной зоне и следуйте поведению на карточке.'
    : 'Поиск начался. Ищите одержимых и помогайте им. Передвигайтесь шагом, только в разрешённых зонах.';
  else if (game.phase === 'return') instruction = 'Все возвращаются на базу. Передвигайтесь шагом.';
  else if (game.phase === 'between_rounds') instruction = game.lastRoundAborted ? 'Раунд отменён. Все возвращаются на базу. Ждите новой раздачи.' : 'Раунд окончен. Отдыхайте на базе и ждите новой раздачи.';
  else if (game.phase === 'finished') instruction = `Завершено раундов: ${game.completedRounds}. Все возвращаются на базу.`;
  else instruction = 'Собираемся у экрана. Ждите раздачи карточек.';
  if (game.phase === 'search' && playStatus === 'released') instruction = 'Вы освобождены. Возвращайтесь на базу и не участвуйте в поиске до следующего раунда.';
  if (game.firstGame) {
    const inGroup = playStatus === 'captured' || playStatus === 'possessed';
    const isPhone = !!(role || playStatus || waiting);
    if (game.phase === 'reading' && cardHidden === true) instruction = cardReady
      ? 'Готовность подтверждена. Дождитесь начала раунда.'
      : 'Откройте карточку и прочитайте задание. Готовность ещё не подтверждена.';
    if (game.phase === 'reading' && retained) instruction = 'Оставайтесь на месте. У вас та же карточка и группа.';
    if (game.phase === 'placement') instruction = retained ? 'Оставайтесь с группой на прежнем месте.'
      : role === 'possessed' ? 'Займите место в разрешённой локации и погасите свет.'
      : role === 'exorcist' ? 'Оставайтесь на базе до призыва к поиску.' : instruction;
    if (game.phase === 'search') instruction = inGroup ? 'Оставайтесь на месте с погашенным светом и следуйте карточке.'
      : playStatus === 'released' ? 'Включите свет и сразу вернитесь на базу. Дождитесь сверки.'
      : waiting ? 'Оставайтесь на базе.'
      : estimatedSearchEnded ? 'Расчётное время поиска истекло. Вернитесь на базу и сверьтесь с общим экраном.'
      : 'Свободные экзорцисты исследуют по одному. Держите приглушённый свет включённым.';
    if (game.phase === 'return' || game.phase === 'between_rounds') instruction = inGroup
      ? 'Оставайтесь в локации с вашей группой. Отчёт можно отправить с места.'
      : isPhone ? (playStatus === 'released' ? 'Оставайтесь на базе.' : 'Свободные возвращаются на базу.')
      : 'Свободные возвращаются на базу. Одержимые и заражённые остаются на местах.';
  }
  if (game.paused) instruction = 'Прекратите действия и ждите в безопасном месте. Продолжение объявит ноутбук.';
  let title = labels[game.phase];
  if (game.firstGame) {
    if (game.phase === 'reading' && cardHidden !== undefined)
      title = cardHidden ? 'Чтение · карточка скрыта' : 'Чтение · личная карточка';
    if (game.phase === 'placement' && cardHidden !== undefined)
      title = cardHidden ? 'Расстановка · карточка скрыта' : 'Расстановка · карточка открыта';
    if (game.phase === 'search') title = compact ? 'Изгнание' : 'Дом слушает';
    if (game.phase === 'return') title = 'Призыв свободных на базу';
    if (game.phase === 'between_rounds') title = game.results.at(-1)?.status === 'final' ? 'Следующий раунд' : 'Сверка';
    if (game.phase === 'finished' && game.ritual) title = endings[game.ritual.outcome];
  }
  if (game.paused && game.firstGame && !metadata && game.pauseReason === 'server_restarted') title = 'Партия восстановлена на паузе';
  else if (game.paused) title = `Пауза · ${game.firstGame && game.phase === 'search' ? 'Изгнание' : labels[game.phase]}`;
  return <section className={styles.panel} aria-label="Состояние раунда">
    {metadata ?? <p>{game.firstGame && game.phase === 'finished' ? 'Итоги партии' : game.roundPlan.kind === 'tutorial' ? 'Обучение · перед основной партией' : `Раунд ${game.roundPlan.number} ${game.settings.roundLimit === null ? '· без ограничения' : `из ${game.settings.roundLimit}`}`}{!compact && game.phase !== 'finished' && ` · завершено${game.firstGame ? '' : ' обычных'}: ${game.completedRounds}`}</p>}
    {!compact && game.venue && <p>База: {game.venue.base}. Разрешённые зоны: {game.venue.zones.length ? game.venue.zones.join(', ') : 'уточните у организатора'}. Передвигайтесь шагом.</p>}
    {!game.firstGame && <p>Уровень {game.roundPlan.difficulty} · {game.roundPlan.infectionEnabled ? 'заражение включено' : 'без заражения'}</p>}
    {game.roundPlan.kind === 'tutorial' && ['lobby', 'reading'].includes(game.phase) && <aside aria-label="Правила обучения">
      <h4>Пробный раунд</h4>
      <p>Попробуйте роли и кнопки без общего зачёта. Откройте личную карточку на телефоне и отметьте готовность; раунд запускается вручную с ноутбука.</p>
      <p>Одержимые занимают места и изображают поведение карточки. Экзорцисты ждут сигнала поиска, затем помогают по подсказкам. Освобождение и необязательные миссии отмечаются на телефонах.</p>
      <p>Ходите шагом только в разрешённых зонах. {game.roundPlan.infectionEnabled ? 'При заражении прочитайте поведение группы; освободиться может вся группа. Зачёт миссии при заражении теряется.' : 'Заражения нет.'} По сигналу возвращения все идут на базу; при паузе остановитесь в безопасном месте.</p>
    </aside>}
    <div role="status"><h3 data-scene-heading tabIndex={-1}>{title}</h3></div>
    {!timerInHeader && (game.deadline !== null || game.paused) && <>
      <div className={styles.timer} role="timer" aria-label="Осталось времени" aria-live="off">{seconds === null ? '—:—' : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</div>
      {remaining === 0 && !game.paused && <p>{connection !== 'online' && game.phase === 'search' ? 'Расчётное время поиска истекло. Вернитесь на базу и сверьтесь с общим экраном.' : 'Ожидаем подтверждения следующей фазы от сервера…'}</p>}
    </>}
    {game.paused && <p>{game.pauseReason && reasons[game.pauseReason]} Время сохранено.</p>}
    <p>{instruction}</p>
    {connection !== 'online' && !(game.firstGame && compact && timerInHeader && (role || playStatus || waiting)) &&
      <p role="alert">Нет связи. Фаза и таймер не подтверждены. Сверьтесь с общим экраном.</p>}
    {showRitual && <RitualBoard game={game} online={connection === 'online'} />}
    {children}
    {!game.firstGame && (!compact || ['between_rounds', 'finished'].includes(game.phase)) && <ResultsSummary results={game.results} freeplayFrom={game.freeplayFrom} />}
  </section>;
}
