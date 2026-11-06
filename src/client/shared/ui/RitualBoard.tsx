import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameSnapshot, RitualSnapshot } from '../../../shared/protocol.js';
import { DialogButton } from './GameDialog.js';
import styles from './RitualBoard.module.css';

type RitualView = Pick<RitualSnapshot, 'positions' | 'cards'>;
const steps = (positions: RitualView['positions']) => 3 * positions[0] + 2 * positions[1] + positions[2];

function candleFrames(before: RitualView, target: RitualView) {
  const positions = [...before.positions] as RitualView['positions'];
  let cards = before.cards;
  const frames: { view: RitualView; delay: number; extinguished?: number }[] = [];
  const push = (delay: number, extinguished?: number) => frames.push({ view: { positions: [...positions], cards }, delay, extinguished });
  const reveal = () => {
    target.cards.forEach((card, i) => {
      if (card.revealed && !cards[i]?.revealed && positions.slice(0, i + 1).every(count => count === 0)) {
        cards = cards.map((current, slot) => slot === i ? card : current);
        push(500);
      }
    });
  };
  while (steps(positions) > steps(target.positions)) {
    const from = positions.findIndex((count, index) => index < 3 && count > 0);
    if (from < 0) break;
    positions[from]--; positions[from + 1]++;
    push(450, positions[from] === 0 ? from : undefined);
    reveal();
  }
  if (positions.some((count, i) => count !== target.positions[i])) {
    positions.splice(0, positions.length, ...target.positions);
    push(450);
  }
  reveal();
  return frames;
}

export function RitualBoard({ game, online = true, animate = false, footer }: {
  game: GameSnapshot; online?: boolean; animate?: boolean; footer?: ReactNode;
}) {
  const { ritual } = game;
  const last = game.results.at(-1);
  const heading = useRef<HTMLHeadingElement>(null);
  const cancelPlayback = useRef<(() => void) | null>(null);
  const previous = useRef<RitualView | null>(null);
  const wasLive = useRef(false);
  const canAnimate = Boolean(animate && game.firstGame && online && !game.paused && ['reading', 'between_rounds', 'finished'].includes(game.phase));
  const [smoke, setSmoke] = useState<{ key: string; slot: number; frame: number }>();
  const [playback, setPlayback] = useState<{ key: string; view: RitualView }>();
  const key = ritual ? JSON.stringify({ positions: ritual.positions, cards: ritual.cards }) : '';
  useEffect(() => {
    const target = key ? JSON.parse(key) as RitualView : null;
    const before = previous.current;
    previous.current = target;
    const animateTransition = canAnimate && wasLive.current;
    wasLive.current = canAnimate;
    setPlayback(undefined);
    setSmoke(undefined);
    if (!animateTransition || !before || !target || JSON.stringify(before) === key) return;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const frames = motion?.matches ? [] : candleFrames(before, target);
    if (!frames.length) return;
    let timer: number | undefined, smokeTimer: number | undefined;
    let index = 0;
    setPlayback({ key, view: before });
    function playNext() {
      const frame = frames[index++];
      if (!frame) { setPlayback(undefined); return; }
      timer = window.setTimeout(() => {
        setPlayback({ key, view: frame.view });
        if (frame.extinguished !== undefined) {
          window.clearTimeout(smokeTimer);
          setSmoke({ key, slot: frame.extinguished, frame: index });
          smokeTimer = window.setTimeout(() => setSmoke(undefined), 300);
        }
        if (frame.delay === 500) timer = window.setTimeout(playNext, 500);
        else playNext();
      }, frame.delay === 500 ? 0 : frame.delay);
    }
    const stop = () => {
      window.clearTimeout(timer);
      window.clearTimeout(smokeTimer);
      setPlayback(undefined);
      setSmoke(undefined);
    };
    cancelPlayback.current = stop;
    motion?.addEventListener?.('change', stop);
    playNext();
    return () => { window.clearTimeout(timer); window.clearTimeout(smokeTimer); motion?.removeEventListener?.('change', stop); };
  }, [key, canAnimate]);
  if (!ritual) return game.settings.ritualEnabled ? <section aria-label="Общий ритуал"><h3>Общий ритуал</h3>
    <p>Свечи появятся при первом старте. Освобождение группы и зачтённая миссия продвигают свечу на шаг.</p>
    {last?.kind === 'tutorial' && last.status !== 'aborted' && <p>Учебных успехов: {last.rescuedGroups + last.missions}. Настоящий ритуал пока не изменён.</p>}
  </section> : null;
  if (!game.firstGame) {
    const labels = { playing: 'Ритуал продолжается', won: 'Победа · дом освобождён', lost: 'Поражение · дух остался', stopped: 'Партия остановлена', all_possessed: 'Поражение · все одержимы', no_return: 'Поражение · никто не вернулся на базу' };
    return <section className={styles.board} aria-label="Общий ритуал">
      <h3 aria-live="polite">{labels[ritual.outcome]}</h3>
      {game.freeplayFrom !== null && <p>Сейчас идёт свободная игра. Исход ритуала сохранён.</p>}
      <p>Осталось шагов до освобождения дома: <strong className={styles.steps}>{ritual.remainingSteps}</strong>. {ritual.players} медиумов · {ritual.roundLimit} раундов.</p>
      <ol className={styles.stages}>{ritual.cards.map((item, index) => <li key={item.slot}>
        <strong>{item.slot} · {ritual.positions[index]}</strong>
        {item.revealed ? <details open><summary>{item.card.title}</summary><p>{item.card.rule}</p></details> : <p>Прорицание закрыто</p>}
      </li>)}</ol>
      <p>Вышло свечей: {ritual.positions[3]}. {ritual.outcome === 'playing' ? 'Открытые правила действуют только на базе и складываются.' : 'Ритуал закрыт. Правила прорицаний больше не действуют.'}</p>
      {ritual.preview && <p role="status">Успехов предварительно: {ritual.preview.successes}. После подтверждения останется шагов: {ritual.preview.remainingSteps}. Закрытые карты пока не раскрываются.</p>}
    </section>;
  }
  const moving = canAnimate && playback?.key === key;
  const visible = moving ? playback.view : ritual;
  const opened = visible.cards.filter(card => card.revealed);
  const captions = ['Первое прорицание', 'Второе прорицание', 'Последняя дверь'];
  return <section className={styles.board} data-first-game="true" aria-label="Общий ритуал">
    <h3 ref={heading} tabIndex={-1}>Общий ритуал</h3>
    <p className={styles.round}>{game.roundNumber} / {ritual.roundLimit} раундов</p>
    <p className={styles.stepsLabel}>Осталось шагов <strong className={styles.steps}>{steps(visible.positions)}</strong></p>
    {moving && <button onClick={() => { cancelPlayback.current?.(); heading.current?.focus(); }}>Пропустить движение свечей</button>}
    <ol className={styles.stages}>{visible.cards.map((item, i) => <li key={item.slot} data-revealed={item.revealed}>
      <span className={styles.candle} data-empty={visible.positions[i] === 0} aria-hidden="true" />
      {canAnimate && smoke?.key === key && smoke.slot === i && <span key={smoke.frame} className={styles.smoke} data-candle-smoke="" aria-hidden="true" />}
      <strong>{visible.positions[i]}</strong>
      {item.revealed
        ? <><DialogButton data-secondary key={item.card.id} title={item.card.title} content={<p>{item.card.rule}</p>}>{item.card.title}</DialogButton><small>Открыто</small></>
        : <><span className={styles.caption}>{captions[i]}</span><small>Закрыто</small></>}
    </li>)}</ol>
    <p>Прорицания → дверь → выход</p>
    <p>Освобождение · миссия<br />Один успех = один шаг.</p>
    {ritual.preview && <aside className={styles.preview} role="status">
      <strong>Предварительный итог</strong>
      <p>{ritual.preview.successes} успехов · после подтверждения останется {ritual.preview.remainingSteps} шагов.</p>
    </aside>}
    <DialogButton data-secondary title={opened.length ? 'Открытые прорицания' : 'Как работает ритуал'} content={<>
      {opened.map(item => item.revealed && <section key={item.slot}><h3>{item.card.title}</h3><p>{item.card.rule}</p></section>)}
      <p>Освобождение группы и зачтённая миссия продвигают свечу на один шаг: А → Б → В → выход.</p>
      <p>Открытые правила действуют на базе. Просьбы о помощи, вопросы о правилах и технические сообщения не штрафуются.</p>
    </>}>{opened.length ? 'Открытые прорицания' : 'Как работает ритуал'}</DialogButton>
    {opened.length > 0 && <p>Открытое прорицание можно посмотреть нажатием.</p>}
    {footer}
  </section>;
}
