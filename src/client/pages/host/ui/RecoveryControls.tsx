import { useEffect, useState } from 'react';
import type { LobbyCommand, LobbyInputs, ReviewEvent, RoomSnapshot } from '../../../../shared/protocol.js';
import { ConfirmButton } from '../../../shared/ui/index.js';
import { gameCommand } from '../../../shared/api/index.js';
export function RecoveryControls({ room, review, disabled, run }: {
  room: RoomSnapshot; review: ReviewEvent[]; disabled: boolean; run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
}) {
  const [base, setBase] = useState(room.game.venue?.base ?? 'База');
  const [zones, setZones] = useState(room.game.venue?.zones.join('\n') ?? '');
  const [before, setBefore] = useState('');
  useEffect(() => { setBase(room.game.venue?.base ?? 'База'); setZones(room.game.venue?.zones.join('\n') ?? ''); }, [room.game.venue]);
  const sync = room.game.synchronization;
  const waiting = ['between_rounds', 'finished'].includes(room.game.phase) && room.game.results.at(-1)?.status !== 'final';
  const name = (id: string) => room.players.find(p => p.id === id)?.name ?? sync?.waitingPlayers?.find(p => p.id === id)?.name ?? review.find(e => e.actor === id)?.actorName ?? 'Ушедший участник';
  const firstGame = Boolean(room.game.firstGame);
  const preview = room.game.ritual?.preview;
  const labels = { infect: 'Заражение', captured: 'Сообщение о заражении', mission: 'Миссия', release: 'Освобождение группы', undo: 'Отмена', withdraw: 'Выход из раунда' };
  return <>
    {!room.game.firstGame && ['lobby', 'between_rounds'].includes(room.game.phase) && <section aria-label="Зоны игры"><h3>База и разрешённые зоны</h3>
      <form onSubmit={e => { e.preventDefault(); void run('venue:configure', { ...gameCommand(room), venue: { base: base.trim(), zones: zones.split('\n').map(v => v.trim()).filter(Boolean) } }); }}>
        <label>Название базы<input value={base} maxLength={64} required disabled={disabled} onChange={e => setBase(e.target.value)} /></label>
        <label>Разрешённые зоны, по одной на строке<textarea value={zones} disabled={disabled} onChange={e => setZones(e.target.value)} /></label>
        <button disabled={disabled}>Сохранить зоны</button>
      </form><p>Заранее исключите лестницы и опасные места. Программа не отслеживает перемещения.</p>
    </section>}
    {sync && waiting && !sync.closed && <section aria-label="Согласование результатов"><h3>Синхронизация результатов</h3>
      <p>Ожидаем телефоны: {sync.waitingPlayerIds.length ? sync.waitingPlayerIds.map(name).join(', ') : 'все подтвердили журнал'}. Спорных действий: {sync.conflicts}.</p>
      {review.length > 0 && <>
        <label>Применить выбранное действие перед<select value={before} onChange={e => setBefore(e.target.value)}><option value="">По текущему порядку</option>{review.filter(e => e.status !== 'rejected').map(e => <option key={e.id} value={e.id}>{name(e.actor)} · {labels[e.action.kind]} · {e.id.slice(-6)}</option>)}</select></label>
        <ul>{review.map(e => <li key={e.id}><span>{name(e.actor)} · {labels[e.action.kind]}{'targetId' in e.action ? ` → ${(e.targetName ?? name(e.action.targetId))}` : 'by' in e.action ? ` ← ${(e.targetName ?? name(e.action.by))}` : ''}</span>
          <small>{e.status === 'review' ? 'Нужен разбор' : e.status === 'accepted' ? 'Подтверждено' : 'Отклонено'}{e.reason ? ` · ${e.reason === 'timing' ? 'проверьте момент действия' : 'проверьте зависимости и состояние группы'}` : ''}</small>
          {firstGame && e.action.kind === 'mission' && <small>{e.action.completed ? 'Отмечено выполнение миссии' : 'Снята отметка выполнения'}</small>}
          {Boolean(e.dependsOn?.length) && <small>После: {e.dependsOn!.map(id => { const linked = review.find(row => row.id === id); return linked ? `${name(linked.actor)} · ${labels[linked.action.kind]} · ${id.slice(-6)}` : `ожидается запись ${id.slice(-6)}`; }).join('; ')}.</small>}
          {!firstGame && e.status !== 'accepted' && <button disabled={disabled || before === e.id} onClick={() =>
            void run('sync:resolve', { ...gameCommand(room), eventId: e.id, decision: 'accept', ...(before ? { beforeId: before } : {}) })}>Подтвердить действие</button>}
          {firstGame && e.status !== 'accepted' && <ConfirmButton title={`Принять запись · ${labels[e.action.kind]}`}
            description={<>
              <p>Отчёт отправил {name(e.actor)}. {e.reason === 'timing' ? 'Подтвердите, что действие произошло до призыва к возвращению.' : 'Проверьте обстоятельства и зависимые записи.'}</p>
              {preview && <p>До решения: {preview.successes} успехов, останется {preview.remainingSteps} шагов.</p>}
              <p>Сервер проверит условия и пересчитает предварительный итог. Свечи сдвинутся после подтверждения раунда.</p>
            </>}
            confirm="Принять запись" disabled={disabled || before === e.id}
            onConfirm={() => void run('sync:resolve', { ...gameCommand(room), eventId: e.id, decision: 'accept', ...(before && review.some(row => row.id === before && row.status !== 'rejected') ? { beforeId: before } : {}) })}>Подтвердить действие</ConfirmButton>}
          {e.status !== 'rejected' && <ConfirmButton title={`Отклонить запись · ${labels[e.action.kind]}`}
            description="Запись не войдёт в итог. Зависимые события могут потребовать повторного разбора."
            confirm="Отклонить запись" disabled={disabled} native={!firstGame}
            onConfirm={() => void run('sync:resolve', { ...gameCommand(room), eventId: e.id, decision: 'reject' })}>Отклонить действие</ConfirmButton>}
        </li>)}</ul>
      </>}
      <ConfirmButton data-danger title="Закрыть ожидание синхронизации?"
        description="Неполученные и спорные действия не будут засчитаны. Поздние записи не изменят итог."
        confirm="Закрыть ожидание" disabled={disabled} native={!firstGame}
        onConfirm={() => void run('sync:close', { ...gameCommand(room), confirm: true })}>Закрыть ожидание с предупреждением</ConfirmButton>
    </section>}
  </>;
}
