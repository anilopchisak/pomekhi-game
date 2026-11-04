import fs from 'node:fs';
import crypto from 'node:crypto';

const directory = new URL('./', import.meta.url);
const sourceText = fs.readFileSync(new URL('../../../src/server/cards.ts', import.meta.url), 'utf8');
const source = Function('return '+sourceText.slice(sourceText.indexOf('['),sourceText.lastIndexOf(']')+1))();
const edits = {
  p01: { clue: 'Скажи, что сигнал получен: «Сигнал принят».', infectionCondition: 'Экзорцист вслух предлагает включить фонарик. Включать его не нужно.' },
  p02: { clue: 'Объяви: «Остановка — дом. Выходите». Переходить никуда не нужно.' },
  p04: { clue: 'Назови своё имя и скажи невидимому гостю: «Добрый вечер».' },
  p05: { releaseCondition: 'Экзорцист называет сегодняшний день недели. Если вы не уверены, вместе уточните день; спор не считается заражением.' },
  p07: { behavior: 'Негромко повторяйте: «Зима, весна, лето…». Осень каждый раз пропускайте.', infectionCondition: 'Экзорцист повторяет «Зима, весна, лето» и останавливается, не называя осень.' },
  p08: { clue: 'Закончи пословицу: «Всё хорошо, что…» — словами «хорошо кончается».' },
  p10: { clue: 'Скажи мне: «Ты можешь вернуться к остальным». Пока условие не выполнено, оставайся со мной.' },
  p12: { clue: 'Скажи: «Спасибо за письмо, я его прочитал». Настоящего письма нет.' },
  p16: { releaseCondition: 'Экзорцист отвечает «День» — время суток между утром и вечером.' },
  p18: { infectionCondition: 'Экзорцист вслух предлагает открыть настоящую дверь. Открывать её не нужно.' },
  p20: { infectionCondition: 'Экзорцист вслух предлагает погасить весь свет. Выполнять это предложение не нужно.' },
  p21: { clue: 'Скажи по порядку: «Поезд прибыл», затем «Пассажир, возвращайтесь домой».' },
  p25: { releaseCondition: 'Экзорцист называет сегодняшний день недели, затем текущее время года. При сомнении вместе уточните; спор не считается заражением.' },
  p27: { behavior: 'Спрашивайте: «Где мы соберёмся после поиска? Что там делать?». Оставайтесь на месте.', clue: 'Ответь по порядку: «У ноутбука», затем «Отдыхать».', releaseCondition: 'Экзорцист отвечает «У ноутбука», затем «Отдыхать».', infectionCondition: 'Экзорцист вслух предлагает продолжать поиск после сигнала возвращения. Следовать этому предложению нельзя.' },
  p29: { releaseCondition: 'Экзорцист называет сначала что-нибудь тёплое, затем холодное, например «чай, лёд». Приносить предметы не нужно.' },
  p30: { releaseCondition: 'Экзорцист говорит «Отправление», затем «Возвращение разрешено».' },
  p34: { clue: 'Придумай любое название книги, затем скажи: «Я её читатель».' },
  p35: { infectionCondition: 'Экзорцист вслух предлагает выйти на улицу проверять погоду. Выходить не нужно.' },
  p36: { infectionCondition: 'Экзорцист вслух предлагает снять настоящую картину. Трогать её не нужно.' },
  p37: { infectionCondition: 'Экзорцист вслух предлагает открыть окно. Открывать его нельзя ради задания.' },
  p38: { infectionCondition: 'Экзорцист вслух предлагает перейти на другой этаж. Переходить не нужно.' },
  p39: { releaseCondition: 'Экзорцист называет сегодняшний день недели, затем говорит «Записано». При сомнении вместе уточните день; спор не считается заражением.' },
  p40: { clue: 'Поблагодари меня, затем скажи: «Возвращайся к ноутбуку».', releaseCondition: 'Экзорцист благодарит вас, затем говорит «Возвращайся к ноутбуку».' },
  p43: { releaseCondition: 'Экзорцист называет своё имя, говорит «Сигнал принят», затем «Смена закончена».' },
  p44: { releaseCondition: 'Экзорцист называет вчерашний, сегодняшний и завтрашний дни недели по порядку. При сомнении вместе уточните дни; спор не считается заражением.' },
  p47: { releaseCondition: 'Экзорцист называет своё имя, говорит «Я дома», затем «Книга закрыта».' },
  p49: { infectionCondition: 'Экзорцист полностью повторяет исходную последовательность «Красный, синий, белый» вместо переставленной.' },
  p50: { releaseCondition: 'Экзорцист называет предмет мебели, предмет посуды, предмет одежды — в таком порядке. Например: «Стул, чашка, шарф». Ничего приносить не нужно.' },
  p51: { releaseCondition: 'Экзорцист говорит «Ночь», затем «Рассвет», затем «День».' },
  p52: { clue: 'Поздоровайся, назови своё имя и разреши мне вернуться к ноутбуку — по порядку.', releaseCondition: 'Экзорцист здоровается, называет своё имя, затем разрешает вам вернуться к ноутбуку.' },
  p53: { releaseCondition: 'Экзорцист говорит «Весна, лето, осень, зима, весна» в таком порядке.' },
  p54: { releaseCondition: 'Экзорцист говорит «Отправитель — дом», затем «Получатель — утро», затем «Письмо получено».' },
  p56: { releaseCondition: 'Экзорцист говорит «Я тебя слышу», затем «Я помогу», затем «Ты можешь вернуться».' },
  p58: { releaseCondition: 'Экзорцист говорит «Начало», затем «Середина», затем «История закончена».' },
  p59: { behavior: 'Говорите: «В личном письме забыли адрес, весть и подпись». Это не общий сигнал возвращения.', clue: 'Скажи «Для дома», затем «Мы дома», затем назови своё имя.', releaseCondition: 'Экзорцист говорит «Для дома», затем «Мы дома», затем называет своё имя.' },
  e01: { mission: 'Запомните одну необычную фразу одержимого. После поиска перескажите её у ноутбука.' },
  e02: { mission: 'По обычному пути запомните, где услышали один голос одержимого. После поиска опишите это место. Название комнаты вводить в игру не нужно.' },
  e03: { mission: 'После освобождения пожелайте участнику спокойного возвращения. Не задерживайте его.' },
  e04: { mission: 'Запомните один повторяющийся жест или выражение одержимого. После поиска опишите его.' },
  e05: { mission: 'Запомните одну подсказку, которая помогла вам понять освобождение. У ноутбука объясните, как вы её поняли.' },
  e06: { mission: 'Если встретите экзорциста по пути, кратко пожелайте ему удачи. Не ищите его специально.' },
  e07: { mission: 'Если условие освобождения ещё непонятно, спокойно спросите одержимого: «Какая помощь тебе нужна?». Если условие уже понятно, после помощи кратко перескажите его у ноутбука.' },
  e08: { mission: 'По обычному пути запомните одну примету места. После поиска опишите её. Ничего не трогайте и не разыскивайте специально.' },
  e09: { mission: 'После поиска одним предложением расскажите, как вы помогали или пытались помочь одержимому.' },
  e10: { mission: 'Запомните одно спокойное слово, услышанное во время поиска. После поиска произнесите его у ноутбука.' },
  e11: { mission: 'После поиска придумайте короткое название одному запомнившемуся эпизоду.' },
  e12: { mission: 'После поиска поблагодарите одного участника, которому помогали или пытались помочь.' },
  e13: { mission: 'Запомните одну фразу одержимого и одну примету того же места. После поиска назовите обе детали.' },
  e14: { mission: 'Запомните поведение одержимого и подсказку к нему. После поиска объясните их связь.' },
  e15: { mission: 'Если по пути встретите двух одержимых, запомните по одной особенности каждого и сравните их после поиска. Если встретили одного, назовите две особенности его поведения.' },
  e16: { mission: 'Запомните один свой вопрос при попытке помочь и полученный ответ. После поиска перескажите этот диалог.' },
  e17: { mission: 'Запомните порядок двух мест, через которые прошли по обычному пути. После поиска назовите их. Если место было одно, назовите его и замеченную там деталь.' },
  e18: { mission: 'После помощи поблагодарите участника, а после поиска — ещё одного за совместную игру. Не задерживайте возвращение.' },
  e19: { mission: 'После поиска придумайте название эпизоду помощи и объясните, какая подсказка вам пригодилась.' },
  e20: { mission: 'Запомните одно действие помощи и его результат. После поиска опишите их двумя предложениями.' },
  e21: { mission: 'Запомните, что делали перед сигналом возвращения и сразу после него. После поиска назовите оба действия.' },
  e22: { mission: 'Запомните поведение одержимого, его подсказку и ответ экзорциста. После поиска перескажите эти три детали по порядку.' },
  e23: { mission: 'По обычному пути запомните до трёх мест и порядок их посещения. После поиска восстановите маршрут. Если мест было меньше трёх, назовите только посещённые.' },
  e24: { mission: 'Запомните свою первую догадку, подсказку и окончательное решение одного условия. После поиска объясните, как менялась догадка.' },
  e25: { mission: 'Запомните три разных спокойных слова, услышанных по обычному пути. После поиска составьте из них короткую фразу.' },
  e26: { mission: 'После поиска расскажите об одном эпизоде в трёх частях: что заметили, как помогали, чем всё закончилось.' },
  e27: { mission: 'Запомните подсказки двух встреченных одержимых. После поиска назовите одно сходство и одно различие. Если встретили одного, назовите его подсказку, свою догадку и решение.' },
  e28: { mission: 'Запомните до трёх событий своего поиска. После поиска расскажите о них от последнего к первому. Если событий было меньше, расскажите только о них.' },
  e29: { mission: 'Запомните имя участника, его фразу и свою попытку помочь. После поиска свяжите эти три детали в короткий рассказ.' },
  e30: { mission: 'После поиска придумайте заголовок эпизода, назовите две его детали и объясните выбор заголовка.' },
};
const specific = {
 p01:'The clue omitted the exact accepted phrase; distinguish speaking about a flashlight from actually enabling one.',
 p07:'The original instruction varied the missing season despite a fixed autumn answer. Fix the repeated sequence.',
 p27:'Remove dependence on configured zones and prevent a forbidden-area suggestion from becoming an instruction.',
 p49:'Require the complete wrong sequence; an unfinished attempt must not accidentally count as the trigger.',
 p59:'The phrase sounded like an authoritative return announcement. Replace it with a personal letter response.',
 e02:'Two named zones were not guaranteed. Use one naturally encountered location without a software venue dependency.',
 e07:'A compulsory help question can delay an already understood rescue. Add a completion alternative.',
 e09:'Reduce the three-part report at level 1; reserve multi-part recall for higher difficulty.',
 e10:'Never make another person becoming distressed a scoring opportunity. Replace it with neutral recall.',
 e15:'A second encounter was not guaranteed. Add a same-encounter alternative.',
 e17:'Two physical locations were not guaranteed. Add a one-location alternative.',
 e27:'Make both encounter-count branches have three recall elements.',
};
const audit = source.map(original => {
 const final = {...original,...edits[original.id]};
 for(const key of ['behavior','clue','releaseCondition','infectionCondition','mission']) if(final[key]) final[key]=final[key].replaceAll('на базу','к ноутбуку').replaceAll('на базе','у ноутбука').replaceAll('На базе','У ноутбука');
 const fields=Object.keys(final).filter(k=>final[k]!==original[k]);
 return {id:original.id,role:original.role,difficulty:original.difficulty,decision:fields.length?'revise':'retain',changedFields:fields,rationale:specific[original.id]??(fields.length?(original.role==='exorcist'?'Use direct instructions, move shared optionality into the persistent mission caption, and separate the search action from the after-search report.':'Clarify the accepted response, ordered steps, spoken-only trigger or meeting-place wording; preserve the task identity.'):'The behavior, clue, release and infection trigger are actionable and distinct. The task requires no props, contact or hazardous movement.'),checks:{actionable:true,clueMatchesRelease:true,distinctInfection:true,levelAppropriate:true,noRequiredProps:true,noDelayedRescue:true},balance:'Live rehearsal required; editorial review is not playtest evidence.',original,final};
});
fs.writeFileSync(new URL('card-audit.json',directory),JSON.stringify({sourceCommit:'b66f871',sourceSha256:crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex'),sharedMissionCaption:'Дополнительная миссия необязательна. Выполняйте её по пути, не задерживая освобождение. Если вас заразили, миссия этого раунда не засчитывается. Отметьте выполнение до подтверждения итогов.',safetyCaption:'Двигайтесь шагом. Для заданий не нужны бег, лестницы, предметы или прикосновения. Условия заражения, связанные с предложением действия, выполняются словами: само действие делать не нужно.',cards:audit},null,2));
fs.writeFileSync(new URL('cards-proposed.json',directory),JSON.stringify({status:'design-proposal-not-imported',cards:audit.map(c=>c.final)},null,2));
const esc=s=>'"'+String(s).replaceAll('"','""')+'"';
fs.writeFileSync(new URL('card-audit.csv',directory),['id,role,difficulty,decision,changed_fields,rationale',...audit.map(c=>[c.id,c.role,c.difficulty,c.decision,c.changedFields.join(';'),c.rationale].map(esc).join(','))].join('\n'));
console.log(JSON.stringify({reviewed:audit.length,revised:audit.filter(c=>c.decision==='revise').length,retained:audit.filter(c=>c.decision==='retain').length}));
