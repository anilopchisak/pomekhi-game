import styles from './PlayerScene.module.css';
import { useState } from 'react';
import type { Assignment } from '../../../../shared/protocol.js';

type CardAction = (action: 'card:ready' | 'card:request', flag: boolean) => Promise<void>;

export function PersonalCardPanel({ assignment, disabled, readOnly = false, infectionEnabled = false, tutorial = false, firstGame = false, disclosure, act }: {
  assignment: Assignment; disabled: boolean; readOnly?: boolean; infectionEnabled?: boolean; tutorial?: boolean; firstGame?: boolean;
  disclosure?: { revealedCard: string | null; setRevealedCard: (id: string | null) => void };
  act: CardAction;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const open = (disclosure ? disclosure.revealedCard : revealed) === assignment.id;
  const toggle = disclosure?.setRevealedCard ?? setRevealed;
  const card = assignment.card;
  return <section className={firstGame ? styles.personal : undefined} aria-label="Личная карточка">
    {!firstGame && <h3>Личная карточка</h3>}
    <div className={firstGame ? styles.cardBody : undefined} data-hidden={!open} tabIndex={firstGame && open ? 0 : undefined}>
    {firstGame && !open && <div className={styles.cardBack} data-card-role={card.role}>
      <svg viewBox="0 0 96 112" fill="none" aria-hidden="true">
        <rect x="12" y="8" width="72" height="96" rx="36" stroke="currentColor" opacity=".45" />
        {card.role === 'possessed' ? <g fill="currentColor">
          <ellipse cx="27" cy="59" rx="3.7" ry="10" transform="rotate(-40 27 59)" />
          <ellipse cx="35" cy="44" rx="3.4" ry="12.5" transform="rotate(-14 35 44)" />
          <ellipse cx="46" cy="39" rx="3.5" ry="14" transform="rotate(-4 46 39)" />
          <ellipse cx="57" cy="42" rx="3.4" ry="12.5" transform="rotate(9 57 42)" />
          <ellipse cx="67" cy="50" rx="3" ry="10" transform="rotate(23 67 50)" />
          <path d="M34 62c4 1 6-3 11-4 8-2 15 1 19 6 4 6-1 15-6 21-5 5-15 4-20 0-5-5-10-16-4-23Z" />
        </g> : <>
          <path d="M48 24c-2 10-10 14-10 22a10 10 0 0 0 20 0c0-8-6-14-10-22Z" fill="currentColor" />
          <path d="M48 56v8M36 85V65h24v20M30 85h36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>}
      </svg>
      <h4>Задание скрыто</h4>
    </div>}
    {open && <div>
      {!firstGame && <h3>{card.role === 'possessed' ? 'Вы — одержимый' : 'Вы — экзорцист'}</h3>}
      <h4>{card.title}</h4>
      {card.setup && <p><strong>Условия места и подготовки:</strong> {card.setup}</p>}
      {!firstGame && <p>Сложность карточки: {card.difficulty}</p>}
      {tutorial && <p>{card.role === 'possessed'
        ? 'Обучение: изображайте поведение и помогайте подсказкой. Когда условие выполнено, нажмите «Нас освободили» и возвращайтесь на базу.'
        : 'Обучение: дождитесь поиска, затем помогайте одержимым по их подсказкам. Если выполните необязательную миссию, нажмите «Миссия выполнена».'}</p>}
      {tutorial && infectionEnabled && <p>Попробуйте заражение: заражённый читает поведение группы и может её освободить. Заражение лишает зачёта миссии. Это обучение без общего зачёта.</p>}
      {card.role === 'possessed' ? <>
        <p><strong>Поведение:</strong> {card.behavior.replaceAll('Пленённые повторяют позу', 'Заражённые повторяют позу')}</p>
        {card.clue && <p><strong>Подсказка:</strong> {card.clue} Её можно произнести, если экзорцисту нужна помощь.</p>}
        <p><strong>Условие освобождения:</strong> {card.releaseCondition}</p>
        {infectionEnabled && <p><strong>Условие заражения:</strong> {card.infectionCondition}</p>}
      </> : <>
        <p>Ваша основная цель — находить одержимых и помогать им освободиться.</p>
        <p><strong>Дополнительная миссия:</strong> {card.mission}</p>
        {card.successCondition && <p><strong>Условие зачёта:</strong> {card.successCondition}</p>}
      </>}
      {!firstGame && <p>{infectionEnabled ? 'В этом раунде включено заражение.' : 'В этом раунде нет заражения.'} {readOnly ? 'Следуйте текущей фазе на экране.' : 'Действовать пока не нужно: сейчас все читают.'}</p>}
    </div>}
    </div>
    {!firstGame && <>
    <button aria-expanded={open} onClick={() => toggle(open ? null : assignment.id)}>
      {open ? 'Скрыть карточку' : 'Открыть карточку'}
    </button>
    {!readOnly && <div>
    <button disabled={disabled || assignment.replacementRequested} onClick={() => void act('card:ready', !assignment.ready)}>{assignment.ready ? 'Я пока не готов' : 'Я прочитал карточку'}</button>
    <button disabled={disabled} onClick={() => void act('card:request', !assignment.replacementRequested)}>{assignment.replacementRequested ? 'Отменить запрос замены' : 'Попросить замену карточки'}</button>
    {assignment.replacementRequested && <p>Запрос передан организатору. Дождитесь замены или отмените запрос. Карточку меняют с ноутбука.</p>}</div>}
    </>}
  </section>;
}

export function PersonalCardActions({ assignment, open, disabled, readOnly, toggle, act }: {
  assignment: Assignment; open: boolean; disabled: boolean; readOnly: boolean;
  toggle: () => void; act: CardAction;
}) {
  return <footer className={styles.cardActions} aria-label="Действия с карточкой">
    <button type="button" data-secondary aria-expanded={open} onClick={toggle}>{open ? 'Скрыть карточку' : 'Открыть карточку'}</button>
    {!readOnly && <div className={styles.readingActions}>
      <button type="button" data-ready={assignment.ready} disabled={disabled || assignment.replacementRequested}
        onClick={() => void act('card:ready', !assignment.ready)}>{assignment.ready ? 'Не готов' : 'Готов'}</button>
      <button type="button" data-secondary={!assignment.replacementRequested || undefined}
        data-replacement-requested={assignment.replacementRequested} disabled={disabled}
        onClick={() => void act('card:request', !assignment.replacementRequested)}>
        {assignment.replacementRequested ? 'Отменить замену' : 'Заменить карточку'}
      </button>
    </div>}
  </footer>;
}
