import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { cardSets } from '../../../../shared/protocol.js';
import type { LobbyCommand, LobbyInputs, LobbyView, RoomSnapshot } from '../../../../shared/protocol.js';
import { GameDialog } from '../../../shared/ui/index.js';
import { gameCommand } from '../../../shared/api/index.js';
import styles from './Broadcast.module.css';

type Run = <C extends LobbyCommand>(command: C, input: LobbyInputs[C], onSuccess?: () => void) => Promise<void>;
type HostView = Extract<LobbyView, { kind: 'organizer' }>;
type SetupProps = { room: RoomSnapshot; disabled: boolean; run: Run };

function PlaceField({ label, help, children }: { label: string; help: string; children: (id: string, helpId: string) => ReactNode }) {
  const id = useId();
  const helpId = id + '-help';
  return <div className={styles.placeField}>
    <div>
      <label htmlFor={id}>{label}</label>
      <details>
        <summary aria-label={`Подсказка: ${label}`}>?</summary>
        <p>{help}</p>
      </details>
    </div>
    <span id={helpId} hidden>{help}</span>
    {children(id, helpId)}
  </div>;
}

function TableOrder({ players, order, disabled, move }: {
  players: RoomSnapshot['players']; order: string[]; disabled: boolean; move: (index: number, offset: number) => void;
}) {
  return <div>
    <h4>Порядок за столом</h4>
    <p>При раздаче роли чередуются: экзорцист, одержимый, экзорцист и так далее.</p>
    {order.length ? <ol>{order.map((id, index) => {
      const name = players.find(player => player.id === id)?.name;
      return <li key={id}><span>{index + 1}. {name}</span>
        <button type="button" disabled={disabled || index === 0} aria-label={`Передвинуть выше: ${name}`} onClick={() => move(index, -1)}>↑</button>
        <button type="button" disabled={disabled || index === order.length - 1} aria-label={`Передвинуть ниже: ${name}`} onClick={() => move(index, 1)}>↓</button>
      </li>;
    })}</ol> : <p>Участники появятся в списке, когда войдут в комнату.</p>}
  </div>;
}

function useTableOrder(players: RoomSnapshot['players'], saved: string[] | undefined) {
  const [draft, setDraft] = useState<string[]>();
  const members = new Set(players.map(player => player.id));
  const order = [...new Set([...(draft ?? saved ?? []), ...members])].filter(id => members.has(id));
  function move(index: number, offset: number) {
    const next = [...order];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setDraft(next);
  }
  return { order, move };
}

function PartyForm({ room, disabled, run, error, retry, close }: SetupProps & { error: string; retry: ReactNode; close: () => void }) {
  const { venue } = room.game;
  const locked = room.game.phase !== 'lobby' || Boolean(room.game.preparationLocked);
  const [base, setBase] = useState(venue.base);
  const [zones, setZones] = useState(venue.zones.join('\n'));
  const [zone, setZone] = useState(venue.dwelling?.zone ?? '');
  const [place, setPlace] = useState(venue.dwelling?.place ?? '');
  const [sets, setSets] = useState(venue.sets ?? (venue.harder ? ['harder' as const] : []));
  const [validation, setValidation] = useState('');
  const { order, move } = useTableOrder(room.players, venue.order);
  const zoneList = zones.split('\n').map(value => value.trim()).filter(Boolean);
  const setLabels = { indoor: 'В помещении', outdoor: 'На улице', contact: 'С физическим контактом', harder: 'Сложнее' };
  return <form onSubmit={event => {
    event.preventDefault();
    if (locked || disabled) return;
    const names = [base.trim(), ...zoneList];
    if (!names[0] || zoneList.length > 12 || names.some(name => name.length > 64) ||
      new Set(names.map(name => name.toLocaleLowerCase('ru'))).size !== names.length) {
      setValidation('Укажите базу и до 12 локаций. Названия должны различаться и быть не длиннее 64 символов.');
      return;
    }
    if (!zoneList.includes(zone) || !place.trim()) {
      setValidation('Выберите локацию Обители и назовите пустое место внутри неё.');
      return;
    }
    setValidation('');
    void run('venue:configure', { ...gameCommand(room), venue: { base, zones: zoneList, dwelling: { zone, place }, sets, order } }, close);
  }}>
    {locked && <p>Настройки зафиксированы первой раздачей.</p>}
    <fieldset disabled={locked || disabled} className={styles.partyFields}>
      <PlaceField label="База" help="Место сбора у общего экрана. Здесь экзорцисты ждут начала поиска, а свободные игроки собираются после призыва.">
        {(id, helpId) => <input id={id} aria-describedby={helpId} required maxLength={64} value={base} onChange={event => setBase(event.target.value)} />}
      </PlaceField>
      <PlaceField label="Разрешённые локации" help="Места, где можно играть и искать одержимых. Напишите каждое название с новой строки.">
        {(id, helpId) => <textarea id={id} aria-describedby={helpId} required value={zones} onChange={event => setZones(event.target.value)} />}
      </PlaceField>
      <PlaceField label="Локация Обители" help="Одна из разрешённых локаций, куда игрок может отправиться по заданию.">
        {(id, helpId) => <select id={id} aria-describedby={helpId} required value={zoneList.includes(zone) ? zone : ''} onChange={event => setZone(event.target.value)}>
          <option value="">Выберите локацию</option>{[...new Set(zoneList)].map(item => <option key={item}>{item}</option>)}
        </select>}
      </PlaceField>
      <PlaceField label="Пустое место Обители" help="Точная точка внутри выбранной локации, например свободный угол кухни. Ничего заранее туда класть не нужно.">
        {(id, helpId) => <input id={id} aria-describedby={helpId} required maxLength={64} value={place} onChange={event => setPlace(event.target.value)} />}
      </PlaceField>
      <fieldset><legend>Допустимые задания</legend>
        {cardSets.map(set => <label key={set}>
          <input type="checkbox" checked={sets.includes(set)} onChange={event => setSets(event.target.checked ? [...sets, set] : sets.filter(item => item !== set))} /> {setLabels[set]}
        </label>)}
        <p>Для любого прикосновения сначала получите согласие участника.</p>
      </fieldset>
      {!locked && <TableOrder players={room.players} order={order} move={move} disabled={disabled} />}
    </fieldset>
    {(validation || error) && <p role="alert">{validation || error}</p>}
    {retry}
    <div data-dialog-actions>
      {!locked && <button type="submit" disabled={disabled}>Сохранить</button>}
      <button type="button" data-secondary onClick={close}>Закрыть</button>
    </div>
  </form>;
}

export function PartySettings({ room, disabled, run, error, retry }: SetupProps & { error: string; retry: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <>
    <button type="button" data-secondary onClick={() => setOpen(true)}>Настройки партии</button>
    {open && <GameDialog title="Настройки партии" onClose={close}>
      <PartyForm room={room} disabled={disabled} run={run} error={error} retry={retry} close={close} />
    </GameDialog>}
  </>;
}

export function FirstGameSetup({ room, view, disabled, run }: SetupProps & { view: HostView }) {
  const players = room.players.filter(player =>
    view.presence?.some(item => item.playerId === player.id && item.confirmed && item.expected === 'at_base'));
  const { order, move } = useTableOrder(players, room.game.venue.order);
  if (room.game.phase !== 'between_rounds' || room.game.results.at(-1)?.status !== 'final' || !order.length) return null;
  return <section aria-label="Порядок вернувшихся">
    <h3>Порядок вернувшихся</h3>
    <form onSubmit={event => {
      event.preventDefault();
      void run('venue:configure', { ...gameCommand(room), venue: { ...room.game.venue, order } });
    }}>
      <TableOrder players={players} order={order} move={move} disabled={disabled} />
      <button disabled={disabled}>Сохранить порядок</button>
    </form>
  </section>;
}
