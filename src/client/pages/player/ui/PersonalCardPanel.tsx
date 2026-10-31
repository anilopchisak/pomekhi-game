import { useState } from 'react';
import type { Assignment } from '../../../../shared/protocol.js';

export function PersonalCardPanel({ assignment, disabled, act }: {
  assignment: Assignment; disabled: boolean;
  act: (action: 'card:ready' | 'card:request', flag: boolean) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const open = revealed === assignment.id;
  const card = assignment.card;
  return <section aria-label="Личная карточка">
    <h3>Личная карточка</h3>
    <button aria-expanded={open} onClick={() => setRevealed(open ? null : assignment.id)}>{open ? 'Скрыть карточку' : 'Открыть карточку'}</button>
    {open && <div>
      <h3>{card.role === 'possessed' ? 'Вы — одержимый' : 'Вы — экзорцист'}</h3>
      <h4>{card.title}</h4>
      {card.role === 'possessed' ? <>
        <p><strong>Поведение:</strong> {card.behavior}</p>
        <p><strong>Подсказка:</strong> {card.clue} Её можно произнести, если экзорцисту нужна помощь.</p>
        <p><strong>Условие освобождения:</strong> {card.releaseCondition}</p>
      </> : <>
        <p>Ваша основная цель — находить одержимых и помогать им освободиться.</p>
        <p><strong>Дополнительная миссия:</strong> {card.mission}</p>
      </>}
      <p>Это простая карточка без заражения. Действовать пока не нужно: сейчас все читают.</p>
    </div>}
    <p role="status">{assignment.ready ? 'Вы отметили, что прочитали карточку.' : 'Когда прочитаете карточку, отметьте готовность.'}</p>
    <button disabled={disabled || assignment.replacementRequested} onClick={() => void act('card:ready', !assignment.ready)}>{assignment.ready ? 'Я пока не готов' : 'Я прочитал карточку'}</button>
    <button disabled={disabled} onClick={() => void act('card:request', !assignment.replacementRequested)}>{assignment.replacementRequested ? 'Отменить запрос замены' : 'Попросить замену карточки'}</button>
    {assignment.replacementRequested && <p>Запрос передан организатору. Дождитесь замены или отмените запрос. Карточку меняют с ноутбука.</p>}
  </section>;
}
