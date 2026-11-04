import { useEffect, useRef, useState } from 'react';
import type { CatalogEntry, CatalogFile, CatalogInput, CatalogReply, CatalogSnapshot, Difficulty, Role } from '../../../../shared/protocol.js';
import { validateCatalogFile } from '../../../../shared/catalog.js';
import { describeError } from '../../../shared/api/index.js';

function download(file: CatalogFile) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'pomekhi-cards.json'; link.click(); URL.revokeObjectURL(url);
}
function identifier() { return [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join(''); }
function empty(role: Role = 'possessed', id = `custom-${identifier()}`): CatalogEntry {
  const common = { id, title: '', difficulty: 1 as Difficulty };
  return { enabled: true, card: role === 'possessed' ? { ...common, role, behavior: '', clue: '', releaseCondition: '', infectionCondition: '' } : { ...common, role, mission: '' } };
}
export function CatalogEditor({ request, disabled, editable, generation }: {
  request: (input: CatalogInput) => Promise<CatalogReply>; disabled: boolean; editable: boolean; generation: number;
}) {
  const [catalog, setCatalog] = useState<CatalogSnapshot>(), [draft, setDraft] = useState<CatalogEntry>();
  const [role, setRole] = useState('all'), [level, setLevel] = useState('all'), [active, setActive] = useState('all');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [pending, setPending] = useState<CatalogInput>();
  const [preview, setPreview] = useState<CatalogFile>();
  const draftRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (draft?.card.id) { draftRef.current?.scrollIntoView?.({ block: 'start' }); draftRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }); } }, [draft?.card.id]);
  const epoch = useRef(0), mounted = useRef(false), previousGeneration = useRef(generation);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; }; }, []);
  useEffect(() => {
    if (previousGeneration.current !== generation) { previousGeneration.current = generation; epoch.current++; setCatalog(undefined); setBusy(false); setMessage('Связь восстановлена. Перечитайте банк; несохранённая форма оставлена.'); }
  }, [generation]);
  async function send(input: CatalogInput) {
    const attempt = ++epoch.current; setBusy(true); setMessage('');
    const result = await request(input);
    if (!mounted.current || epoch.current !== attempt) return;
    setBusy(false);
    if (result.ok) { setCatalog(result.catalog); setPending(undefined); setPreview(undefined); setMessage(input.action === 'read' ? 'Банк прочитан. Несохранённая форма не изменена.' : 'Банк сохранён. Выданные карточки не изменены.'); }
    else { setMessage(result.error === 'INVALID_INPUT' ? 'Карточка или файл не прошли проверку. Проверьте обязательные поля, длину текста, уникальность ID и размер данных.' : describeError(result.error)); setPending(['TIMEOUT', 'CONNECTION_LOST'].includes(result.error) ? input : undefined); }
  }
  const blocked = disabled || busy;
  const locked = blocked || !editable || !catalog;
  function mutate(action: 'reset' | 'save' | 'import', entry?: CatalogEntry) {
    if (!catalog) return;
    const base = { revision: catalog.revision, requestId: identifier() };
    if (action === 'save' && entry) void send({ ...base, action, entry });
    else if (action === 'import' && preview) void send({ ...base, action, file: preview });
    else if (action === 'reset') void send({ ...base, action });
  }
  const rows = catalog?.file.entries ?? [];
  const visible = rows.filter(e => (role === 'all' || e.card.role === role) && (level === 'all' || e.card.difficulty === Number(level)) && (active === 'all' || e.enabled === (active === 'on')));
  const oldIds = new Map(rows.map(e => [e.card.id, e]));
  const newIds = new Set(preview?.entries.map(e => e.card.id));
  const added = preview?.entries.filter(e => !oldIds.has(e.card.id)).length ?? 0;
  const changed = preview?.entries.filter(e => oldIds.has(e.card.id) && JSON.stringify(oldIds.get(e.card.id)) !== JSON.stringify(e)).length ?? 0;
  const removed = rows.filter(e => !newIds.has(e.card.id)).length;
  return <section aria-label="Редактор банка">
    <h3>Банк секретных заданий</h3>
    <p>Здесь находятся личные задания. Открывайте их, только если готовы узнать содержание. Названия и тексты скрыты до выбора карточки.</p>
    <a href="/?screen=host">Открыть пульт</a>
    <button disabled={blocked} onClick={() => void send({ action: 'read' })}>{catalog ? 'Перечитать банк' : 'Открыть банк заданий'}</button>
    {pending && <button disabled={blocked} onClick={() => void send(pending)}>Повторить запрос редактора</button>}
    {message && <p role="status">{message}</p>}
    {!editable && <p>Сейчас только просмотр. Изменения доступны в лобби, перерыве и после завершения партии.</p>}
    {draft && <form ref={draftRef} aria-label="Карточка в редакторе" onSubmit={e => { e.preventDefault(); mutate('save', draft); }}>
      <h4>Карточка {draft.card.id}</h4>
      <label>Роль<select disabled={locked} value={draft.card.role} onChange={e => { const next = empty(e.target.value as Role, draft.card.id); next.enabled = draft.enabled; next.card.title = draft.card.title; next.card.difficulty = draft.card.difficulty; setDraft(next); }}><option value="possessed">Одержимый</option><option value="exorcist">Экзорцист</option></select></label>
      <label>Сложность<select disabled={locked} value={draft.card.difficulty} onChange={e => setDraft({ ...draft, card: { ...draft.card, difficulty: Number(e.target.value) as Difficulty } })}>{[1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Название<input required maxLength={120} disabled={locked} value={draft.card.title} onChange={e => setDraft({ ...draft, card: { ...draft.card, title: e.target.value } })} /></label>
      {(draft.card.role === 'possessed' ? [['behavior', 'Поведение'], ['clue', 'Подсказка'], ['releaseCondition', 'Условие освобождения'], ['infectionCondition', 'Условие заражения']] : [['mission', 'Дополнительная миссия']]).map(([key, label]) => <label key={key}>{label}<textarea required maxLength={2000} disabled={locked} value={(draft.card as unknown as Record<string, string>)[key]} onChange={e => setDraft({ ...draft, card: { ...draft.card, [key]: e.target.value } })} /></label>)}
      <label><input type="checkbox" disabled={locked} checked={draft.card.harder ?? false} onChange={e => setDraft({ ...draft, card: { ...draft.card, harder: e.target.checked } })} /> Только с набором «Сложнее»</label>
      <label><input type="checkbox" disabled={locked} checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /> Использовать карточку</label>
      <button disabled={locked}>Сохранить карточку</button><button type="button" onClick={() => setDraft(undefined)}>Скрыть карточку</button>
    </form>}
    {catalog && <>
      <p>Ревизия банка: {catalog.revision}. Всего карточек: {rows.length}. Включено: {rows.filter(e => e.enabled).length}.</p>
      <p>Для раздачи нужны уникальные карточки. Уровни ниже — метки банка. В первой партии уровень не меняется от раунда к раунду.</p>
      <ul>{(['possessed', 'exorcist'] as const).flatMap(r => [1, 2, 3].map(t => <li key={`${r}:${t}`}>{r === 'possessed' ? 'Одержимые' : 'Экзорцисты'} · уровень {t}: {rows.filter(e => e.enabled && e.card.role === r && e.card.difficulty === t).length}</li>))}</ul>
      <label>Роль карточек<select value={role} onChange={e => setRole(e.target.value)}><option value="all">Все роли</option><option value="possessed">Одержимые</option><option value="exorcist">Экзорцисты</option></select></label>
      <label>Уровень карточек<select value={level} onChange={e => setLevel(e.target.value)}><option value="all">Все уровни</option>{[1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Активность карточек<select value={active} onChange={e => setActive(e.target.value)}><option value="all">Все</option><option value="on">Включённые</option><option value="off">Отключённые</option></select></label>
      <button disabled={locked} onClick={() => setDraft(empty())}>Добавить карточку</button>
      <button disabled={blocked} onClick={() => download(catalog.file)}>Экспортировать банк</button>
      <button data-danger disabled={locked} onClick={() => { if (window.confirm('Заменить весь банк стандартными 90 карточками? Пользовательские изменения исчезнут. История текущей комнаты сохранится. Сначала можно экспортировать банк.')) mutate('reset'); }}>Восстановить стандартные карточки</button>
      <label>Импорт JSON<input type="file" accept=".json,application/json" disabled={locked} onChange={async e => {
        const file = e.target.files?.[0]; setPreview(undefined);
        if (!file) return;
        try { if (file.size > 1024 * 1024) throw Error(); const parsed = validateCatalogFile(JSON.parse(await file.text())); setPreview(parsed); setMessage('Проверьте сравнение перед заменой банка.'); }
        catch { setMessage('Файл не подошёл. Нужен JSON Pomekhi: до 500 карточек, 512 КиБ данных, непустые поля и уникальные ID.'); }
        e.target.value = '';
      }} /></label>
      {preview && <aside aria-label="Сравнение импорта"><p>Добавлено: {added}. Изменено: {changed}. Удалено: {removed}. В новом банке: {preview.entries.length}.</p><button disabled={blocked} onClick={() => download(catalog.file)}>Скачать текущий банк перед заменой</button><button disabled={locked} onClick={() => { if (window.confirm('Полностью заменить банк показанным импортом? Выданные карточки не изменятся.')) mutate('import'); }}>Подтвердить замену банка</button><button onClick={() => setPreview(undefined)}>Отменить импорт</button></aside>}
      <ul aria-label="Карточки банка">{visible.map(entry => <li key={entry.card.id}>
        <span>{entry.card.id} · {entry.card.role === 'possessed' ? 'Одержимый' : 'Экзорцист'} · {entry.card.difficulty}</span>
        <label><input type="checkbox" checked={entry.enabled} disabled={locked} onChange={e => mutate('save', { ...entry, enabled: e.target.checked })} /> Включена</label>
        <button onClick={() => setDraft(structuredClone(entry))}>Открыть {entry.card.id}</button>
      </li>)}</ul>
    </>}

  </section>;
}
