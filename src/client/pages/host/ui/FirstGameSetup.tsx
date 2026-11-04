import { useState } from 'react';
import type { LobbyCommand, LobbyInputs, LobbyView, RoomSnapshot } from '../../../../shared/protocol.js';
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
  const [harder, setHarder] = useState(venue.harder ?? false);
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
    <h3>{initial ? 'Подготовка · первая партия' : 'Порядок вернувшихся'}</h3>
    {initial && <p>От 5 до 12 медиумов. Семь раундов без эффектов испытаний. Организатор тоже входит с телефона.</p>}
    <form onSubmit={event => {
      event.preventDefault();
      void run('venue:configure', { ...gameCommand(room), venue: initial ? { base, zones: zoneList, dwelling: { zone, place }, storyId: story, harder, order } : { ...venue, order } });
    }}>
      {initial && <>
        <label>База<input required maxLength={64} value={base} onChange={event => setBase(event.target.value)} /></label>
        <label>Разрешённые локации, по одной на строке<textarea required value={zones} onChange={event => setZones(event.target.value)} /></label>
        <label>Локация Обители<select required value={zone} onChange={event => setZone(event.target.value)}>
          <option value="">Выберите локацию</option>{[...new Set(zoneList)].map(item => <option key={item}>{item}</option>)}
        </select></label>
        <label>Пустое место Обители<input required maxLength={64} placeholder="Например, угол дальней комнаты" value={place} onChange={event => setPlace(event.target.value)} /></label>
        <label>Вступительная история<select value={story} onChange={event => setStory(event.target.value)}>
          {view.stories?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label><input type="checkbox" checked={harder} onChange={event => setHarder(event.target.checked)} /> Добавить карточки с отметкой «Сложнее»</label>
      </>}
      <p>Порядок за столом определяет раздачу: экзорцист, одержимый, экзорцист и так далее.</p>
      <ol>{order.map((id, index) => {
        const name = eligible.find(player => player.id === id)?.name;
        return <li key={id}><span>{index + 1}. {name}</span>
          <button type="button" disabled={disabled || index === 0} aria-label={`Передвинуть выше: ${name}`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" disabled={disabled || index === order.length - 1} aria-label={`Передвинуть ниже: ${name}`} onClick={() => move(index, 1)}>↓</button>
        </li>;
      })}</ol>
      <button disabled={disabled}>Сохранить {initial ? 'подготовку' : 'порядок'}</button>
    </form>
  </section>;
}
