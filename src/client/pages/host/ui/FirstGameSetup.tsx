import { useState } from 'react';
import { cardSets, venueFeatures } from '../../../../shared/protocol.js';
import type { LobbyCommand, LobbyInputs, LobbyView, RoomSnapshot } from '../../../../shared/protocol.js';
import { GameDialog } from '../../../shared/ui/index.js';
import { gameCommand } from '../../../shared/api/index.js';

type Run = <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
type HostView = Extract<LobbyView, { kind: 'organizer' }>;

export function FirstGameSetup({ room, view, disabled, run }: { room: RoomSnapshot; view: HostView; disabled: boolean; run: Run }) {
  const { venue, phase } = room.game;
  const initial = phase === 'lobby';
  const [base, setBase] = useState(venue.base);
  const [zones, setZones] = useState(venue.zones.join('\n'));
  const [zone, setZone] = useState(venue.dwelling?.zone ?? '');
  const [place, setPlace] = useState(venue.dwelling?.place ?? '');
  const [story, setStory] = useState(venue.storyId ?? 'S001');
  const [mode, setMode] = useState(venue.mode ?? 'first');
  const [bank, setBank] = useState(venue.bank ?? 'local');
  const [horror, setHorror] = useState(venue.horror ?? false);
  const authored = mode === 'ordinary' || bank === 'authored';
  const [sets, setSets] = useState(venue.sets ?? (venue.harder ? ['harder' as const] : []));
  const [draftSets, setDraftSets] = useState<typeof sets | null>(null);
  const [features, setFeatures] = useState(venue.features ?? []);
  const [prologueRead, setPrologueRead] = useState(venue.prologueRead ?? false);
  const locked = Boolean(room.dealing.dealId || room.game.started || room.game.preparationLocked);
  const setLabels = { indoor: 'В помещении', outdoor: 'На улице', contact: 'Физический контакт (по общему согласию)', harder: 'Сложнее' };
  const featureLabels = { space: 'Свободные ровные места для движений', door: 'Разрешённая внутренняя дверь', mirror: 'Неподвижное зеркало и свободный подход', tree: 'Осмотренное дерево на ровном участке', dimLight: 'Тусклый экран различим, в том числе как источник тени', wall: 'Доступная чистая стена', scary: 'Группа согласна на пугающую актёрскую игру', touchSurfaces: 'Можно касаться стен, пола или дерева', landmarks: 'В локациях видны неподвижные ориентиры' };
  const chosenStory = view.stories?.find(item => item.id === story);
  const [ordered, setOrdered] = useState(venue.order ?? []);
  const eligible = initial ? room.players : room.players.filter(player =>
    view.presence?.some(item => item.playerId === player.id && item.confirmed && item.expected === 'at_base'));
  const ids = new Set(eligible.map(player => player.id));
  const order = [...new Set([...ordered, ...ids])].filter(id => ids.has(id));
  const zoneList = zones.split('\n').map(value => value.trim()).filter(Boolean);
  function move(index: number, direction: number) {
    const next = [...order];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setOrdered(next);
  }
  if (!initial && (phase !== 'between_rounds' || room.game.results.at(-1)?.status !== 'final' || !order.length)) return null;
  return <section aria-label="Подготовка партии">
    <h3>{initial ? 'Подготовка партии' : 'Порядок вернувшихся'}</h3>
    {initial && <p>От 5 до 12 медиумов. Семь раундов. Организатор тоже входит с телефона.</p>}
    <form onSubmit={event => {
      event.preventDefault();
      void run('venue:configure', { ...gameCommand(room), venue: initial ? { base, zones: zoneList, dwelling: { zone, place }, storyId: story, harder: sets.includes('harder'), mode, bank: authored ? 'authored' : 'local', horror: authored && horror, sets, features, prologueRead, order } : { ...venue, order } });
    }}>
      {initial && locked && <p>Подготовка зафиксирована первой раздачей.</p>}
      {initial && locked && room.players.length < 5 && <p>Пригласите игроков по тому же коду комнаты, чтобы снова собрать пятерых.</p>}
      {initial && !locked && <>
        <label>Режим<select value={mode} onChange={event => setMode(event.target.value === 'ordinary' ? 'ordinary' : 'first')}>
          <option value="first">Первая партия · без испытаний</option><option value="ordinary">Обычный режим · испытания Мастера</option>
        </select></label>
        {mode === 'ordinary' ? <p>Используется авторская адаптация. Для отбора испытаний подтвердите свободное место, видимость тусклого экрана, подходящие локации и согласованные наборы.</p> :
          <label>Банк миссий<select value={bank} onChange={event => setBank(event.target.value === 'authored' ? 'authored' : 'local')}>
            <option value="authored">Авторский набор · домашний хоррор</option><option value="local">Текущий редактируемый банк</option>
          </select></label>}
        {authored && <label><input type="checkbox" checked={horror} onChange={event => setHorror(event.target.checked)} /> Смешать со страшными вариантами, если группа согласна
          <small>Подходящие страшные версии заменят свои основные карты. Условия места и согласие на контакт учитываются при раздаче.</small>
        </label>}
        <label>База<input required maxLength={64} value={base} onChange={event => setBase(event.target.value)} /></label>
        <label>Разрешённые локации, по одной на строке<textarea required value={zones} onChange={event => setZones(event.target.value)} /></label>
        <label>Локация Обители<select required value={zone} onChange={event => setZone(event.target.value)}>
          <option value="">Выберите локацию</option>{[...new Set(zoneList)].map(item => <option key={item}>{item}</option>)}
        </select></label>
        <label>Пустое место Обители<input required maxLength={64} placeholder="Например, угол дальней комнаты" value={place} onChange={event => setPlace(event.target.value)} /></label>
        <label>Вступительная история<select value={story} onChange={event => { setStory(event.target.value); setPrologueRead(false); }}>
          {view.stories?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        {chosenStory && <details><summary>Пролог · {chosenStory.title}</summary><p>{chosenStory.prologue}</p></details>}
        <label><input type="checkbox" checked={prologueRead} onChange={event => setPrologueRead(event.target.checked)} /> Пролог прочитан всем участникам</label>
        <button type="button" data-secondary disabled={disabled} onClick={() => setDraftSets(sets)}>Допустимые задания</button>
        {draftSets && <GameDialog eyebrow="Ведущий · карточки" title="Допустимые задания" onClose={() => setDraftSets(null)}>
          <p>Согласуйте категории с группой до раздачи. Выбор сохранится вместе с подготовкой.</p>
          {cardSets.map(set => <label key={set} data-dialog-panel>
            <input type="checkbox" checked={draftSets.includes(set)} onChange={event => {
              setDraftSets(event.target.checked ? [...draftSets, set] : draftSets.filter(value => value !== set));
            }} /> {setLabels[set]}
          </label>)}
          <div data-dialog-actions>
            <button type="button" onClick={() => { setSets(draftSets); setDraftSets(null); }}>Применить выбор</button>
            <button type="button" data-secondary onClick={() => setDraftSets(null)}>Сбросить изменения</button>
          </div>
        </GameDialog>}
        <fieldset><legend>Проверенные условия места и согласие группы</legend>{venueFeatures.filter(feature => feature !== 'twoZones' && feature !== 'contact').map(feature => <label key={feature}>
          <input type="checkbox" checked={features.includes(feature)} onChange={event => setFeatures([...features.filter(value => value !== feature), ...(event.target.checked ? [feature] : [])])} /> {featureLabels[feature]}
        </label>)}</fieldset>
        {place.trim() && zone && <p>Обитель: {zone}, {place}. Задания для Обители могут выпасть при обычной раздаче.</p>}
      </>}
      {(!initial || !locked) && <><p>Порядок за столом определяет раздачу: экзорцист, одержимый, экзорцист и так далее.</p>
      <ol>{order.map((id, index) => {
        const name = eligible.find(player => player.id === id)?.name;
        return <li key={id}><span>{index + 1}. {name}</span>
          <button type="button" disabled={disabled || index === 0} aria-label={`Передвинуть выше: ${name}`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" disabled={disabled || index === order.length - 1} aria-label={`Передвинуть ниже: ${name}`} onClick={() => move(index, 1)}>↓</button>
        </li>;
      })}</ol>
      <button data-preparation-submit disabled={disabled}>Сохранить {initial ? 'подготовку' : 'порядок'}</button></>}
    </form>
  </section>;
}
