import styles from './PlayerScene.module.css';
import { useState } from 'react';
import type { Assignment } from '../../../../shared/protocol.js';

export function PersonalCardPanel({ assignment, disabled, readOnly = false, infectionEnabled = false, tutorial = false, firstGame = false, disclosure, act }: {
  assignment: Assignment; disabled: boolean; readOnly?: boolean; infectionEnabled?: boolean; tutorial?: boolean; firstGame?: boolean;
  disclosure?: { revealedCard: string | null; setRevealedCard: (id: string | null) => void };
  act: (action: 'card:ready' | 'card:request', flag: boolean) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const open = (disclosure ? disclosure.revealedCard : revealed) === assignment.id;
  const toggle = disclosure?.setRevealedCard ?? setRevealed;
  const card = assignment.card;
  return <section className={firstGame ? styles.personal : undefined} aria-label="Личная карточка">
    {!firstGame && <h3>Личная карточка</h3>}
    {firstGame && <p className={styles.role}>{card.role === 'possessed' ? 'Одержимый' : 'Экзорцист'}</p>}
    <div className={firstGame ? styles.cardBody : undefined} data-hidden={!open}>
    {firstGame && !open && <div><h4>Задание закрыто</h4><p>Откройте, когда рядом нет других игроков.</p></div>}
    {open && <div>
      <h3>{card.role === 'possessed' ? 'Вы — одержимый' : 'Вы — экзорцист'}</h3>
      <h4>{card.title}</h4>
      {!firstGame && <p>Сложность карточки: {card.difficulty}</p>}
      {tutorial && <p>{card.role === 'possessed'
        ? 'Обучение: изображайте поведение и помогайте подсказкой. Когда условие выполнено, нажмите «Нас освободили» и возвращайтесь на базу.'
        : 'Обучение: дождитесь поиска, затем помогайте одержимым по их подсказкам. Если выполните необязательную миссию, нажмите «Миссия выполнена».'}</p>}
      {tutorial && infectionEnabled && <p>Попробуйте заражение: заражённый читает поведение группы и может её освободить. Заражение лишает зачёта миссии. Это обучение без общего зачёта.</p>}
      {card.role === 'possessed' ? <>
        <p><strong>Поведение:</strong> {card.behavior}</p>
        <p><strong>Подсказка:</strong> {card.clue} Её можно произнести, если экзорцисту нужна помощь.</p>
        <p><strong>Условие освобождения:</strong> {card.releaseCondition}</p>
        {infectionEnabled && <p><strong>{firstGame ? 'Условие плена:' : 'Условие заражения:'}</strong> {card.infectionCondition}</p>}
      </> : <>
        <p>Ваша основная цель — находить одержимых и помогать им освободиться.</p>
        <p><strong>Дополнительная миссия:</strong> {card.mission}</p>
      </>}
      {!firstGame && <p>{infectionEnabled ? 'В этом раунде включено заражение.' : 'В этом раунде нет заражения.'} {readOnly ? 'Следуйте текущей фазе на экране.' : 'Действовать пока не нужно: сейчас все читают.'}</p>}
    </div>}
    </div>
    <button className={firstGame ? styles.fullAction : undefined} aria-expanded={open} onClick={() => toggle(open ? null : assignment.id)}>
      {open ? 'Скрыть карточку' : 'Открыть карточку'}
    </button>
    {!readOnly && <><p role="status">{assignment.ready ? 'Вы отметили, что прочитали карточку.' : 'Когда прочитаете карточку, отметьте готовность.'}</p>
    <button disabled={disabled || assignment.replacementRequested || firstGame && !open && !assignment.ready} onClick={() => void act('card:ready', !assignment.ready)}>{assignment.ready ? 'Я пока не готов' : 'Я прочитал карточку'}</button>
    <button disabled={disabled} onClick={() => void act('card:request', !assignment.replacementRequested)}>{assignment.replacementRequested ? 'Отменить запрос замены' : 'Попросить замену карточки'}</button>
    {assignment.replacementRequested && <p>Запрос передан организатору. Дождитесь замены или отмените запрос. Карточку меняют с ноутбука.</p>}</>}
  </section>;
}
