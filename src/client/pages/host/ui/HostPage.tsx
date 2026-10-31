import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { describeError, useLobbyConnection } from '../../../shared/api/index.js';
import { LobbyShell } from '../../../shared/ui/index.js';
import { invitationUrl } from '../invitation.js';
import type { LobbyInputs, LobbyCommand } from '../../../../shared/protocol.js';

const storageKey = 'pomekhi.organizer';
function storedCode() { try { return sessionStorage.getItem(storageKey) ?? ''; } catch { return ''; } }

export function HostPage() {
  const { connection, generation, view, request } = useLobbyConnection();
  const credential = useRef(storedCode());
  const operation = useRef(0);
  const [code, setCode] = useState(credential.current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');
  const [publicAddress, setPublicAddress] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const room = view?.kind === 'organizer' ? view.room : null;
  const joinUrl = room && publicAddress ? invitationUrl(publicAddress, room.code) : '';

  const authorize = useCallback(async (value: string) => {
    try { sessionStorage.setItem(storageKey, value); }
    catch { setError('Браузер не позволяет сохранить вход. Разрешите хранилище сайта и повторите.'); return; }
    credential.current = value;
    const attempt = ++operation.current;
    setBusy(true); setError('');
    const result = await request('organizer:authorize', { code: value });
    if (attempt !== operation.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(describeError(result.error));
      if (result.error === 'INVALID_ORGANIZER_CODE' || result.error === 'INVALID_INPUT') {
        credential.current = '';
        try { sessionStorage.removeItem(storageKey); } catch { /* The credential is already cleared in memory. */ }
      }
    }
  }, [request]);

  useEffect(() => { if (generation && credential.current) void authorize(credential.current); }, [generation, authorize]);
  useEffect(() => {
    let cancelled = false;
    setQr(''); setCopied(false);
    if (joinUrl) void QRCode.toDataURL(joinUrl, { width: 280, margin: 4, errorCorrectionLevel: 'M' }).then(value => {
      if (!cancelled) setQr(value);
    }).catch(() => { if (!cancelled) setError('Не удалось построить QR. Можно скопировать ссылку или ввести код комнаты.'); });
    return () => { cancelled = true; };
  }, [joinUrl]);

  async function run<Command extends LobbyCommand>(command: Command, input: LobbyInputs[Command]) {
    const attempt = ++operation.current;
    setBusy(true); setError('');
    const result = await request(command, input);
    if (attempt !== operation.current) return;
    setBusy(false);
    if (!result.ok) setError(describeError(result.error));
  }

  return <LobbyShell title="Сбор у экрана" connection={connection} error={error}>
    {view?.kind !== 'organizer' ? <form onSubmit={event => { event.preventDefault(); void authorize(code.trim().toUpperCase()); }}>
      <h3>Вход организатора</h3>
      <p>Код находится в окне запуска программы на ноутбуке. Участникам нужен только код комнаты.</p>
      <label>Код организатора<input type="password" autoComplete="off" value={code} maxLength={12} onChange={event => setCode(event.target.value)} required /></label>
      <button disabled={busy || connection !== 'online'}>{busy ? 'Проверяем…' : 'Войти'}</button>
    </form> : !room ? <section>
      <p>Соберите всех у экрана. Создайте комнату и пригласите участников с телефонов.</p>
      <button disabled={busy || connection !== 'online'} onClick={() => void run('room:create', {})}>Создать комнату</button>
    </section> : <>
      <section>
        <h3>Комната <code>{room.code}</code></h3>
        <form onSubmit={event => {
          event.preventDefault();
          try { invitationUrl(address, room.code); setPublicAddress(address.trim()); setError(''); }
          catch { setError('Вставьте HTTPS-адрес Tuna без дополнительных путей и параметров.'); }
        }}>
          <label>Адрес Tuna<input type="url" value={address} placeholder="https://…" onChange={event => setAddress(event.target.value)} required /></label>
          <button>Показать приглашение</button>
        </form>
        {joinUrl && <>
          <label>Ссылка для участников<input readOnly value={joinUrl} onFocus={event => event.target.select()} /></label>
          <button onClick={() => {
            void navigator.clipboard?.writeText(joinUrl).then(() => setCopied(true)).catch(() => setError('Выделите и скопируйте ссылку из поля вручную.'));
            if (!navigator.clipboard) setError('Выделите и скопируйте ссылку из поля вручную.');
          }}>{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button>
          {qr && <img src={qr} width={280} height={280} alt="QR-код приглашения в комнату" />}
          <p>Отсканируйте QR или откройте ссылку. Если вводите адрес сайта вручную, используйте код комнаты.</p>
        </>}
      </section>
      <section>
        <h3>Участники: {room.players.length} / {room.capacity}</h3>
        <p>Организатор тоже входит с телефона. Этот экран не занимает место.</p>
        {room.players.length ? <ul>{room.players.map(player => <li key={player.id}>
          <span>{player.name}</span><small>{player.online ? 'На связи' : 'Нет связи'}</small>
          <button data-danger disabled={busy || connection !== 'online'} onClick={() => {
            if (window.confirm(`Удалить участника «${player.name}»? Его прежний вход перестанет действовать.`)) void run('player:remove', { roomId: room.id, playerId: player.id });
          }} aria-label={`Удалить участника ${player.name}`}>Удалить</button>
        </li>)}</ul> : <p>Пока здесь тихо. Ждём первого участника.</p>}
        <button data-danger disabled={busy || connection !== 'online'} onClick={() => {
          if (window.confirm('Закрыть комнату? Все участники выйдут, прежнее приглашение перестанет действовать.')) void run('room:close', { roomId: room.id });
        }}>Закрыть комнату</button>
      </section>
    </>}
  </LobbyShell>;
}
