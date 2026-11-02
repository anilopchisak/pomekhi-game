import { expect, it } from 'vitest';
import { createCatalog, standardCatalog, validateCatalogFile } from './catalog.js';
import { createDealing } from './dealing.js';
import { CARD_BANK } from './cards.js';
import { createLobby } from './lobby.js';
import { createSession } from './session.js';
import { validateSession } from './session-format.js';
import type { SavedSession } from './session-format.js';
import type { LobbyReply, PersonalCard } from '../shared/protocol.js';

const value = (reply: LobbyReply) => { if (!reply.ok) throw Error(reply.error); return reply.view; };
const players = Array.from({ length: 7 }, (_, i) => `p${i}`);
it('uses every admissible card before a repeat, retains cancellation history and restores it', () => {
  let id = 0; const options = { generateId: () => `id-${++id}`, randomIndex: () => 0 };
  const d = createDealing(options), seen = new Set<string>();
  for (let deal = 0; deal < 3; deal++) {
    expect(d.deal(players, 3)).toBeUndefined();
    for (const p of players) { const card = d.personal(p)!.card; if (card.role === 'exorcist') { expect(seen.has(card.id)).toBe(false); seen.add(card.id); } }
    d.cancel();
  }
  expect(seen.size).toBe(12);
  const restored = createDealing(options); restored.restore(d.exportState(), false);
  expect(restored.exportState()).toEqual(d.exportState());
  expect(restored.deal(players, 3)).toBeUndefined();
});
it('keeps exhausted high-level draws at that level and fails atomically with too few cards', () => {
  let id = 0; let bank: readonly PersonalCard[] = CARD_BANK;
  const d = createDealing({ generateId: () => `id-${++id}`, randomIndex: () => 0, getCards: () => bank });
  for (let i = 0; i < 8; i++) { expect(d.deal(players, 3, new Map(), 2)).toBeUndefined(); for (const p of players) expect(d.personal(p)!.card.difficulty).toBe(2); }
  const before = d.exportState(); bank = CARD_BANK.filter(c => c.role === 'possessed');
  expect(d.deal(players, 3)).toBe('CARD_POOL_INSUFFICIENT'); expect(d.exportState()).toEqual(before);
  const exorcist = players.find(p => d.personal(p)!.card.role === 'exorcist')!;
  expect(d.change(exorcist, d.personal(exorcist)!.id, 'replace')).toBe('CARD_POOL_INSUFFICIENT'); expect(d.exportState()).toEqual(before);
});
it('validates bounds, unique IDs and complete role fields without retaining unknown properties', () => {
  const original = standardCatalog().file; expect(validateCatalogFile(original)).toEqual(original);
  for (const file of [{ ...original, entries: [original.entries[0], original.entries[0]] }, { ...original, entries: [{ ...original.entries[0], card: { ...original.entries[0].card, title: '' } }] }, { ...original, entries: Array(501).fill(original.entries[0]) }]) expect(() => validateCatalogFile(file)).toThrow();
  const extra = { ...original.entries[0], secret: 'discard', card: { ...original.entries[0].card, credential: 'discard' } };
  expect(JSON.stringify(validateCatalogFile({ ...original, entries: [extra] }))).not.toContain('discard');
});
it('deduplicates changes, rejects stale editors and allows exact retries after restart', () => {
  const c = createCatalog(); const entry = { ...c.snapshot(true).file.entries[0], enabled: false };
  const command = { action: 'save', revision: 0, requestId: 'catalog-request-1', entry };
  expect(c.execute(command, true)).toBeUndefined(); expect(c.execute(command, true)).toBeUndefined(); expect(c.snapshot(true).revision).toBe(1);
  expect(c.execute({ ...command, requestId: 'catalog-request-2' }, true)).toBe('STALE_CATALOG');
  expect(c.execute({ ...command, revision: 1, requestId: 'catalog-request-3' }, false)).toBe('CATALOG_LOCKED');
  const restored = createCatalog(); restored.restore(c.exportState()); expect(restored.execute(command, false)).toBeUndefined(); expect(restored.exportState()).toEqual(c.exportState());
});
it('keeps the global bank after room closure while the new room has no usage', () => {
  const lobby = createLobby({ organizerCode: 'HOST' }); value(lobby.execute('h', 'organizer:authorize', { code: 'HOST' }));
  const entry = { ...standardCatalog().file.entries[0], enabled: false };
  expect(lobby.catalogExecute('x', { action: 'read' })).toEqual({ ok: false, error: 'FORBIDDEN' });
  expect(lobby.catalogExecute('h', { action: 'save', entry, revision: 0, requestId: 'save-before-room' }).ok).toBe(true);
  const v = value(lobby.execute('h', 'room:create', {})); if (v.kind !== 'organizer' || !v.room) throw Error();
  value(lobby.execute('h', 'room:close', { roomId: v.room.id })); value(lobby.execute('h', 'room:create', {}));
  expect(lobby.exportState().catalog!.file.entries.find(e => e.card.id === entry.card.id)!.enabled).toBe(false);
  expect(lobby.exportState().room!.game.dealing.usage).toEqual([]); lobby.dispose();
});
it('migrates a v4 issued deal without changing cards and seeds only known usage', () => {
  const lobby = createLobby({ organizerCode: 'HOST' }); value(lobby.execute('h', 'organizer:authorize', { code: 'HOST' }));
  const v = value(lobby.execute('h', 'room:create', {})); if (v.kind !== 'organizer' || !v.room) throw Error();
  for (let i = 0; i < 7; i++) value(lobby.execute(`p${i}`, 'player:join', { roomCode: v.room.code, name: `P${i}`, resumeKey: String(i + 1).repeat(64) }));
  value(lobby.execute('h', 'deal:create', { roomId: v.room.id, dealId: null, dealVersion: 0, requestId: 'legacy-deal-test', possessedCount: 3 }));
  const old = { schemaVersion: 4, lobby: lobby.exportState() }; delete old.lobby.catalog; delete old.lobby.room!.game.dealing.usage;
  const migrated = validateSession(old); expect(migrated.schemaVersion).toBe(5); expect(migrated.lobby.room!.game.dealing.assignments).toEqual(old.lobby.room!.game.dealing.assignments);
  expect(migrated.lobby.room!.game.dealing.usage!.flatMap(([, ids]) => ids)).toHaveLength(7); lobby.dispose();
});
it('never acknowledges an unsaved bank and recovers the committed revision after a write failure', async () => {
  let disk: SavedSession | null = null, fail = false;
  const store = { async acquire() {}, async close() {}, async preserve() {}, async load() { return structuredClone(disk); }, async write(s: SavedSession) { if (fail) throw Error('private'); disk = structuredClone(s); } };
  const session = createSession({ organizerCode: 'HOST', store }); await session.initialize(); value(await session.execute('h', 'organizer:authorize', { code: 'HOST' }));
  fail = true;
  expect(await session.catalogExecute('h', { action: 'save', entry: { ...standardCatalog().file.entries[0], enabled: false }, revision: 0, requestId: 'failed-bank-save' })).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
  expect(disk!.lobby.catalog!.revision).toBe(0); fail = false;
  value(await session.execute('h', 'storage:retry', {})); const result = await session.catalogExecute('h', { action: 'read' });
  expect(result).toMatchObject({ ok: true, catalog: { revision: 0 } }); await session.close();
});
it('preserves issued text and usage when a bank edit is saved between rounds and restored', () => {
  const lobby = createLobby({ organizerCode: 'HOST' }); value(lobby.execute('h', 'organizer:authorize', { code: 'HOST' }));
  const roomView = value(lobby.execute('h', 'room:create', {})); if (roomView.kind !== 'organizer' || !roomView.room) throw Error(); const room = roomView.room;
  for (let i = 0; i < 7; i++) value(lobby.execute(`p${i}`, 'player:join', { roomCode: room.code, name: `P${i}`, resumeKey: String(i + 1).repeat(64) }));
  value(lobby.execute('h', 'deal:create', { roomId: room.id, dealId: null, dealVersion: 0, requestId: 'text-stability-deal', possessedCount: 3 }));
  const own = lobby.viewFor('p0'); if (own?.kind !== 'player' || !own.assignment) throw Error(); const original = own.assignment;
  let seq = 0; const base = () => { const v = lobby.viewFor('h'); if (v?.kind !== 'organizer' || !v.room) throw Error(); return { roomId: room.id, roundId: v.room.game.roundId, gameVersion: v.room.game.version, requestId: `text-stability-${++seq}` }; };
  value(lobby.execute('h', 'round:start', { ...base(), confirmWarnings: true })); value(lobby.execute('h', 'round:abort', base()));
  expect(lobby.catalogExecute('h', { action: 'save', revision: 0, requestId: 'change-previous-card', entry: { enabled: false, card: { ...original.card, title: 'Changed future text' } } }).ok).toBe(true);
  const saved = validateSession({ schemaVersion: 5, lobby: lobby.exportState() }); const restored = createLobby({ organizerCode: 'NEW' }); restored.restore(saved.lobby);
  restored.execute('p', 'player:resume', { roomCode: room.code, resumeKey: '1'.repeat(64) }); expect(restored.viewFor('p')).toMatchObject({ assignment: original });
  expect(restored.exportState().room!.game.dealing.usage).toEqual(saved.lobby.room!.game.dealing.usage);
  expect(restored.exportState().catalog!.file.entries.find(e => e.card.id === original.card.id)!.card.title).toBe('Changed future text'); lobby.dispose(); restored.dispose();
});
it('retains old-pool history when a card moves up and then returns', () => {
  let id = 0, bank = structuredClone(CARD_BANK);
  const d = createDealing({ generateId: () => `moving-${++id}`, randomIndex: () => 0, getCards: () => bank });
  d.deal(players, 3); const moved = players.map(p => d.personal(p)!.card).find(c => c.role === 'possessed')!;
  const oldUsage = d.exportState().usage!.find(([key]) => key === 'possessed:1')![1]; expect(oldUsage).toContain(moved.id);
  d.cancel(); bank = bank.map(c => c.id === moved.id ? { ...c, difficulty: 2 } : c); d.deal(players, 3, new Map(), 2);
  d.cancel(); bank = bank.map(c => c.id === moved.id ? { ...c, difficulty: 1 } : c); d.deal(players, 3);
  expect(players.map(p => d.personal(p)!.card.id)).not.toContain(moved.id);
});
it('rejects a catalog above the canonical byte limit', () => {
  const card = standardCatalog().file.entries[0];
  const entries = Array.from({ length: 500 }, (_, i) => ({ ...card, card: { ...card.card, id: `huge-${i}`, title: 'Long card', behavior: 'я'.repeat(2000) } }));
  expect(() => validateCatalogFile({ format: 'pomekhi.cards', version: 1, entries })).toThrow();
});
