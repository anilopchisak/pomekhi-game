import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cardSets } from '../../../../shared/protocol.js';
import type { LobbyCommand, LobbyInputs, RoomSnapshot } from '../../../../shared/protocol.js';
import { ConfirmButton, GameDialog } from '../../../shared/ui/index.js';
import { gameCommand } from '../../../shared/api/index.js';
import styles from './Broadcast.module.css';

type Run = <C extends LobbyCommand>(command: C, input: LobbyInputs[C], onSuccess?: () => void) => Promise<void>;
type SetupProps = { room: RoomSnapshot; disabled: boolean; run: Run };
function PlaceField({ label, help, children }: { label: string; help: string; children: (id: string, helpId: string) => ReactNode }) {
  const id = useId();
  const helpId = id + '-help';
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: MouseEvent) {
      const hint = details.current;
      if (hint?.open && event.target instanceof Node && !hint.contains(event.target)) hint.open = false;
    }
    document.addEventListener('click', closeOutside, true);
    return () => document.removeEventListener('click', closeOutside, true);
  }, []);
  return <div className={styles.placeField}>
    <div>
      <label htmlFor={id}>{label}</label>
      <details ref={details}>
        <summary aria-label={`Подсказка: ${label}`}>?</summary>
        <p>{help}</p>
      </details>
    </div>
    <span id={helpId} hidden>{help}</span>
    {children(id, helpId)}
  </div>;
}

function PartyForm({ room, disabled, run, error, retry, close }: SetupProps & { error: string; retry: ReactNode; close: () => void }) {
  const { venue } = room.game;
  const locked = room.game.phase !== 'lobby' || Boolean(room.game.preparationLocked);
  const [base, setBase] = useState(venue.base);
  const [zones, setZones] = useState(venue.zones.join('\n'));
  const [sets, setSets] = useState(venue.sets ?? (venue.harder ? ['harder' as const] : []));
  const [comedy, setComedy] = useState(venue.comedy ?? false);
  const [validation, setValidation] = useState('');
  const zoneList = zones.split('\n').map(value => value.trim()).filter(Boolean);
  const setLabels = { indoor: 'Для помещения', outdoor: 'Для улицы', contact: 'С физическим контактом', harder: 'Повышенная сложность' };
  return <form onSubmit={event => {
    event.preventDefault();
    if (locked || disabled) return;
    const names = [base.trim(), ...zoneList];
    if (!names[0] || !zoneList.length || zoneList.length > 12 || names.some(name => name.length > 64) ||
      new Set(names.map(name => name.toLocaleLowerCase('ru'))).size !== names.length) {
      setValidation('Укажите базу и от 1 до 12 локаций. Названия должны различаться и быть не длиннее 64 символов.');
      return;
    }
    setValidation('');
    void run('venue:configure', { ...gameCommand(room), venue: { base, zones: zoneList, sets, comedy } }, close);
  }}>
    {locked && <p>Настройки зафиксированы первой раздачей.</p>}
    <fieldset disabled={locked || disabled} className={styles.partyFields}>
      <PlaceField label="База" help="Место сбора у общего экрана. Здесь экзорцисты ждут начала поиска, а свободные игроки собираются после призыва.">
        {(id, helpId) => <input id={id} aria-describedby={helpId} required maxLength={64} value={base} onChange={event => setBase(event.target.value)} />}
      </PlaceField>
      <PlaceField label="Разрешённые локации" help="Места, где можно играть и искать одержимых. Напишите каждое название с новой строки.">
        {(id, helpId) => <textarea id={id} aria-describedby={helpId} required value={zones} onChange={event => setZones(event.target.value)} />}
      </PlaceField>
      <fieldset><legend>Допустимые задания</legend>
        <p>Основные задания входят в раздачу, если подходят для ваших локаций.</p>
        {cardSets.map(set => <label key={set}>
          <input type="checkbox" checked={sets.includes(set)} onChange={event => setSets(event.target.checked ? [...sets, set] : sets.filter(item => item !== set))} /> {setLabels[set]}
        </label>)}
        <label><input type="checkbox" checked={comedy} onChange={event => setComedy(event.target.checked)} /> Добавить смешные карты</label>
        <p>Для любого прикосновения сначала получите согласие участника.</p>
      </fieldset>
    </fieldset>
    {(validation || error) && <p role="alert">{validation || error}</p>}
    {retry}
    {!locked && <div data-dialog-actions><button type="submit" disabled={disabled}>Сохранить</button></div>}
  </form>;
}

export function PartySettings({ room, disabled, run, error, retry }: SetupProps & { error: string; retry: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <>
    <button type="button" data-secondary onClick={() => setOpen(true)}>Настройки партии</button>
    {open && <GameDialog title="Настройки партии" onClose={close}>
      <PartyForm room={room} disabled={disabled} run={run} error={error} retry={retry} close={close} />
      {room.game.firstGame && !['lobby', 'finished'].includes(room.game.phase) &&
        <ConfirmButton data-danger title="Остановить партию?"
          description="Все вернутся на базу. Текущий неподтверждённый раунд не засчитывается."
          confirm="Остановить партию" disabled={disabled} onConfirm={() => void run('party:finish', gameCommand(room), close)}>Остановить партию</ConfirmButton>}
    </GameDialog>}
  </>;
}
