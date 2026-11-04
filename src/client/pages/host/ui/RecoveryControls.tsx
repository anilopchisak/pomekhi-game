import { useEffect, useRef, useState } from 'react';
import type { LobbyCommand, LobbyInputs, LobbyView, ReviewEvent, ReviewPreview, RoomSnapshot } from '../../../../shared/protocol.js';
import { ConfirmButton, GameDialog } from '../../../shared/ui/index.js';
import { gameCommand, describeError, useLobbyConnection } from '../../../shared/api/index.js';
export function RecoveryControls({ room, review, disabled, run, request, missingLocations }: {
  room: RoomSnapshot; review: ReviewEvent[]; request: ReturnType<typeof useLobbyConnection>['request']; missingLocations?: Extract<LobbyView, { kind: 'organizer' }>['missingLocations']; disabled: boolean; run: <C extends LobbyCommand>(command: C, input: LobbyInputs[C]) => Promise<void>;
}) {
  const [base, setBase] = useState(room.game.venue?.base ?? 'База');
  const [zones, setZones] = useState(room.game.venue?.zones.join('\n') ?? '');
  const [before, setBefore] = useState('');
  const [historyRoundId, setHistoryRoundId] = useState<string | null>(null);
  useEffect(() => { setBase(room.game.venue?.base ?? 'База'); setZones(room.game.venue?.zones.join('\n') ?? ''); }, [room.game.venue]);
  const sync = room.game.synchronization;
  const waiting = ['between_rounds', 'finished'].includes(room.game.phase) && room.game.results.at(-1)?.status !== 'final';
  const name = (id: string) => room.players.find(p => p.id === id)?.name ?? sync?.waitingPlayers?.find(p => p.id === id)?.name ?? review.find(e => e.actor === id)?.actorName ?? 'Ушедший участник';
  const firstGame = Boolean(room.game.firstGame);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [choice, setChoice] = useState<{ id: string; decision: 'accept' | 'reject'; beforeId?: string }>();
  const [projection, setProjection] = useState<{ version: number; roundId: string | null; preview?: ReviewPreview; error?: string }>();
  const { version, roundId } = room.game;
  const showHistory = roundId !== null && historyRoundId === roundId;
  const pendingSync = Boolean(sync && (sync.conflicts > 0 || sync.waitingPlayerIds.length > 0));
  const roomId = room.id;
  useEffect(() => {
    if (!choice || disabled) return;
    let cancelled = false;
    void request('sync:preview', { roomId, roundId, gameVersion: version, requestId: 'preview-only', eventId: choice.id, decision: choice.decision, beforeId: choice.beforeId }).then(reply => {
      if (!cancelled) setProjection({ version, roundId, preview: reply.ok ? reply.reviewPreview : undefined, error: reply.ok ? undefined : describeError(reply.error) });
    });
    return () => { cancelled = true; };
  }, [choice, disabled, request, roomId, roundId, version]);
  function choose(button: HTMLButtonElement, id: string, decision: 'accept' | 'reject') {
    opener.current = button; setProjection(undefined);
    const action = review.find(entry => entry.id === id)?.action;
    const requestedUndo = action?.kind === 'undo' && action.requestReview;
    setChoice({ id, decision, ...(!requestedUndo && decision === 'accept' && before && before !== id && review.some(e => e.id === before && e.status !== 'rejected') ? { beforeId: before } : {}) });
  }
  const selected = choice && review.find(e => e.id === choice.id);
  const undo = selected?.action.kind === 'undo' && selected.action.requestReview ? selected.action : null;
  const blocker = undo && choice?.decision === 'accept' ? selected?.blockers?.[0] : undefined;
  const projected = projection?.version === version && projection.roundId === roundId ? projection : undefined;
  const labels = { presence_correction: 'Отметка сверки', infect: 'Заражение', captured: 'Сообщение о заражении', mission: 'Миссия', release: 'Освобождение группы', undo: 'Отмена', withdraw: 'Выход из раунда' };
  function actionLabel(action: ReviewEvent['action']) {
    if (action.kind !== 'presence_correction') return labels[action.kind];
    const correction = { infected: 'заражение', released: 'освобождение', assign: 'назначение группы' }[action.correction];
    return `${labels.presence_correction} · ${correction}`;
  }
  const orderedReview = [...review].sort((a, b) => Number(b.status === 'review' && ['release', 'undo'].includes(b.action.kind)) -
    Number(a.status === 'review' && ['release', 'undo'].includes(a.action.kind)));
  const blockers = new Set(review.flatMap(row => row.status === 'review' ? row.blockers ?? [] : []));
  const visibleReview = firstGame && !showHistory ? orderedReview.filter(row => row.status === 'review' || blockers.has(row.id)) : orderedReview;
  const describeRecord = (id: string) => {
    const row = review.find(entry => entry.id === id);
    return row ? `${name(row.actor)} · ${actionLabel(row.action)}` : `Запись ${id.slice(-6)}`;
  };
  return <>
    {!room.game.firstGame && ['lobby', 'between_rounds'].includes(room.game.phase) && <section aria-label="Зоны игры"><h3>База и разрешённые зоны</h3>
      <form onSubmit={e => { e.preventDefault(); void run('venue:configure', { ...gameCommand(room), venue: { base: base.trim(), zones: zones.split('\n').map(v => v.trim()).filter(Boolean) } }); }}>
        <label>Название базы<input value={base} maxLength={64} required disabled={disabled} onChange={e => setBase(e.target.value)} /></label>
        <label>Разрешённые зоны, по одной на строке<textarea value={zones} disabled={disabled} onChange={e => setZones(e.target.value)} /></label>
        <button disabled={disabled}>Сохранить зоны</button>
      </form><p>Заранее исключите лестницы и опасные места. Программа не отслеживает перемещения.</p>
    </section>}
    {missingLocations?.map(item => <form key={item.memberId} onSubmit={event => {
      event.preventDefault();
      const zone = new FormData(event.currentTarget).get('zone');
      if (typeof zone === 'string') void run('round:location', { ...gameCommand(room), playerId: item.memberId, zone });
    }}>
      <label>Локация группы · {name(item.memberId)}
        <select key={item.confirmed ?? item.proposed ?? ''} name="zone" required defaultValue={item.confirmed ?? item.proposed ?? ''} disabled={disabled || Boolean(item.confirmed)}>
          <option value="">Уточните у группы</option>{room.game.venue.zones.map(zone => <option key={zone}>{zone}</option>)}
        </select>
      </label>
      {item.confirmed ? <p>Локация подтверждена.</p> : <button disabled={disabled}>Подтвердить локацию</button>}
    </form>)}
    {choice && selected && <GameDialog eyebrow={undo ? 'Ведущий · связанные записи' : 'Ведущий · проверка'}
      title={undo ? 'Отмена требует сверки' : `${choice.decision === 'accept' ? 'Принять' : 'Отклонить'} запись · ${actionLabel(selected.action)}`} onClose={() => setChoice(undefined)} returnFocus={opener.current}>
      <p>Отчёт отправил {name(selected.actor)}. {selected.reason === 'timing' ? 'Проверьте, что действие произошло до призыва.' : 'Проверьте обстоятельства и зависимости.'}</p>
      {undo && <div data-dialog-panel>
        <strong>Сверьте связанные записи</strong>
        <p>Исходное действие · {describeRecord(undo.actionId)}</p>
        {Boolean(selected.blockers?.length) && <><p>Отмену блокируют следующие записи.</p>
          <ul>{selected.blockers?.map(id => <li key={id}>{describeRecord(id)}</li>)}</ul></>}
      </div>}
      <div role="status" data-dialog-panel>
        <strong>Зачёт после решения</strong>
        {projected?.error ? <p>{projected.error}</p> : projected?.preview ? <>
          <p>После решения: {projected.preview.successes} успехов, останется {projected.preview.remainingSteps} шагов.</p>
          {!projected.preview.applied && <p>Запись пока не может быть принята. Проверьте порядок и зависимости.</p>}
          {projected.preview.changed.filter(row => row.id !== selected.id).map(row => {
            const entry = review.find(e => e.id === row.id);
            return entry && <p key={row.id}>{name(entry.actor)} · {actionLabel(entry.action)}: {row.status === 'accepted' ? 'подтверждено' : row.status === 'rejected' ? 'отклонено' : 'нужен разбор'}</p>;
          })}
        </> : <p>Рассчитываем предварительный итог…</p>}
      </div>
      <div data-dialog-actions>
        {blocker ? <button type="button" onClick={() => {
          setChoice(undefined);
          requestAnimationFrame(() => document.getElementById(`review-${blocker}`)?.focus());
        }}>Разобрать записи</button> : <button type="button" disabled={disabled || !projected?.preview?.applied} onClick={() => {
          setChoice(undefined);
          void run('sync:resolve', { ...gameCommand(room), eventId: choice.id, decision: choice.decision, beforeId: choice.beforeId });
        }}>{choice.decision === 'accept' ? undo ? 'Принять отмену' : 'Принять запись' : 'Отклонить запись'}</button>}
        <button data-secondary type="button" data-dialog-focus onClick={() => setChoice(undefined)}>{undo ? 'Оставить на сверке' : 'Отмена'}</button>
      </div>
    </GameDialog>}
    {sync && waiting && !sync.closed && (pendingSync || firstGame && review.length > 0) && <section aria-label="Согласование результатов"><h3>Синхронизация результатов</h3>
      <p>Ожидаем телефоны: {sync.waitingPlayerIds.length ? sync.waitingPlayerIds.map(name).join(', ') : 'все подтвердили журнал'}. Спорных действий: {sync.conflicts}.</p>
      {firstGame && review.some(row => row.status !== 'review' && !blockers.has(row.id)) &&
        <button type="button" data-secondary aria-expanded={showHistory} onClick={() => setHistoryRoundId(showHistory ? null : roundId)}>
          {showHistory ? 'Скрыть обработанные записи' : 'Показать все записи журнала'}
        </button>}
      {visibleReview.length > 0 && <>
        <label>Применить выбранное действие перед<select value={before} onChange={e => setBefore(e.target.value)}><option value="">По текущему порядку</option>{review.filter(e => e.status !== 'rejected').map(e => <option key={e.id} value={e.id}>{name(e.actor)} · {actionLabel(e.action)} · {e.id.slice(-6)}</option>)}</select></label>
        <ul>{visibleReview.map(e => <li key={e.id} id={`review-${e.id}`} tabIndex={-1}><span>{name(e.actor)} · {actionLabel(e.action)}{'targetId' in e.action ? ` → ${(e.targetName ?? name(e.action.targetId))}` : 'by' in e.action ? ` ← ${(e.targetName ?? name(e.action.by))}` : e.action.kind === 'release' && e.action.targetIds ? ` → ${e.action.targetIds.map(name).join(', ')}` : ''}</span>
          <small>{e.status === 'review' ? 'Нужен разбор' : e.status === 'accepted' ? 'Подтверждено' : 'Отклонено'}{e.reason ? ` · ${e.reason === 'timing' ? 'проверьте момент действия' : e.reason === 'paused' ? 'записано во время паузы' : e.reason === 'undo_requested' ? 'запрос на разбор отмены' : 'проверьте зависимости и состояние группы'}` : ''}</small>
          {firstGame && e.action.kind === 'mission' && <small>{e.action.completed ? 'Отмечено выполнение миссии' : 'Снята отметка выполнения'}</small>}
          {Boolean(e.dependsOn?.length) && <small>После: {e.dependsOn!.map(id => { const linked = review.find(row => row.id === id); return linked ? `${name(linked.actor)} · ${actionLabel(linked.action)} · ${id.slice(-6)}` : `ожидается запись ${id.slice(-6)}`; }).join('; ')}.</small>}
          {!firstGame && e.status !== 'accepted' && e.reason !== 'paused' && <button disabled={disabled || before === e.id} onClick={() =>
            void run('sync:resolve', { ...gameCommand(room), eventId: e.id, decision: 'accept', ...(before ? { beforeId: before } : {}) })}>Подтвердить действие</button>}
          {Boolean(e.blockers?.length) && <small>Блокируют отмену · {e.blockers?.map(describeRecord).join(', ')}.</small>}
          {firstGame && e.status !== 'accepted' && e.reason !== 'paused' && (!(e.action.kind === 'undo' && e.action.requestReview) || e.status === 'review') && <button disabled={disabled || before === e.id && !(e.action.kind === 'undo' && e.action.requestReview)} onClick={event => choose(event.currentTarget, e.id, 'accept')}>Подтвердить действие</button>}
          {firstGame && e.status !== 'rejected' && <button disabled={disabled} onClick={event => choose(event.currentTarget, e.id, 'reject')}>Отклонить действие</button>}
          {!firstGame && e.status !== 'rejected' && <ConfirmButton title={`Отклонить запись · ${labels[e.action.kind]}`}
            description="Запись не войдёт в итог. Зависимые события могут потребовать повторного разбора."
            confirm="Отклонить запись" disabled={disabled} native
            onConfirm={() => void run('sync:resolve', { ...gameCommand(room), eventId: e.id, decision: 'reject' })}>Отклонить действие</ConfirmButton>}
        </li>)}</ul>
      </>}
      {pendingSync && <ConfirmButton data-danger title="Закрыть ожидание синхронизации?"
        description="Неполученные и спорные действия не будут засчитаны. Поздние записи не изменят итог."
        confirm="Закрыть ожидание" disabled={disabled} native={!firstGame}
        onConfirm={() => void run('sync:close', { ...gameCommand(room), confirm: true })}>Закрыть ожидание с предупреждением</ConfirmButton>}
    </section>}
  </>;
}
