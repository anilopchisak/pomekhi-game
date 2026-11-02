import type { Prophecy } from '../shared/protocol.js';

/** Original base-only rules. Only revealed cards enter authorized wire projections. */
export const prophecies: readonly Prophecy[] = [
  { id: 'no-names', title: 'Имена стёрты', rule: 'На базе не произносите имена и прозвища участников.' },
  { id: 'formal', title: 'Чужие лица', rule: 'На базе обращайтесь к другим участникам на «вы».' },
  { id: 'hand', title: 'Право голоса', rule: 'Перед каждой репликой на базе поднимайте ладонь. После начала реплики её можно опустить.' },
  { id: 'over', title: 'Неизвестная частота', rule: 'Каждую реплику на базе завершайте словом «Приём».' },
  { id: 'here', title: 'Ответ из темноты', rule: 'Отвечая на вопрос на базе, начинайте со слов «Я здесь».' },
  { id: 'returned', title: 'Порог помнит', rule: 'После возвращения на базу перед обычным разговором скажите «Я вернулся».' },
];
export const finalProphecy: Prophecy = { id: 'door', title: 'Дом отпускает', rule: 'Дверь открыта. Дух больше не держит вас в этом доме.' };
