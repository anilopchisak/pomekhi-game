import { createHash } from 'node:crypto';
import type { CatalogFile, CatalogInput, CatalogSnapshot, LobbyError } from '../shared/protocol.js';
import { replaceRetiredMission } from './retired-missions.js';
import { CARD_BANK } from './cards.js';

import { catalogByteLength, MAX_CATALOG_BYTES, validateCatalogFile, validateEntry } from '../shared/catalog.js';
export { validateCatalogFile, validateEntry, MAX_CATALOG_BYTES } from '../shared/catalog.js';
function replaceRetiredEntries(file: CatalogFile, mode: 'catalog' | 'compact' = 'catalog'): CatalogFile {
  const entries = file.entries.map(entry => {
    const card = replaceRetiredMission(entry.card, mode);
    return card === entry.card ? entry : { ...entry, card };
  });
  return entries.some((entry, index) => entry !== file.entries[index]) ? { ...file, entries } : file;
}

export interface SavedCatalog { revision: number; file: CatalogFile; requests: [string, string][] }
export function standardCatalog(): SavedCatalog {
  return { revision: 0, file: { format: 'pomekhi.cards', version: 1, entries: CARD_BANK.map(card => ({ enabled: true, card: structuredClone(card) })) }, requests: [] };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid catalog.');
  return value as Record<string, unknown>;
}
export function validateSavedCatalog(value: unknown): SavedCatalog {
  const saved = record(value);
  if (!Number.isSafeInteger(saved.revision) || (saved.revision as number) < 0 || !Array.isArray(saved.requests) || saved.requests.length > 256) throw Error('Invalid catalog checkpoint.');
  const requests = saved.requests.map(pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(pair[0]) || !/^[a-f0-9]{64}$/.test(pair[1])) throw Error('Invalid catalog request.');
    return pair as [string, string];
  });
  if (new Set(requests.map(p => p[0])).size !== requests.length) throw Error('Duplicate catalog request.');
  const file = validateCatalogFile(saved.file);
  const expanded = replaceRetiredEntries(file);
  const migrated = expanded !== file && catalogByteLength(expanded) > MAX_CATALOG_BYTES ? replaceRetiredEntries(file, 'compact') : expanded;
  return { revision: saved.revision as number, file: migrated, requests };
}
/** Owns the global private library; no file, transport or game dependency. */
export function createCatalog() {
  let state = standardCatalog();
  const snapshot = (editable: boolean): CatalogSnapshot => structuredClone({ revision: state.revision, file: state.file, editable });
  function execute(input: unknown, editable: boolean): LobbyError | undefined {
    try {
      const data = record(input);
      if (data.action === 'read') return;
      if (!['save', 'import', 'reset'].includes(data.action as string) || !Number.isSafeInteger(data.revision) || typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(data.requestId)) return 'INVALID_INPUT';
      const action = data.action as Exclude<CatalogInput['action'], 'read'>;
      const entry = action === 'save' ? validateEntry(data.entry) : undefined;
      const file = action === 'import' ? validateCatalogFile(data.file) : undefined;
      const fingerprint = createHash('sha256').update(JSON.stringify([action, data.revision, entry ?? file ?? null])).digest('hex');
      const old = state.requests.find(([id]) => id === data.requestId);
      if (old) return old[1] === fingerprint ? undefined : 'INVALID_INPUT';
      if (!editable) return 'CATALOG_LOCKED';
      if (data.revision !== state.revision) return 'STALE_CATALOG';
      const entries = entry ? [...state.file.entries.filter(e => e.card.id !== entry.card.id), entry] : undefined;
      const next = action === 'reset' ? standardCatalog().file : file ?? validateCatalogFile({ format: 'pomekhi.cards', version: 2, entries });
      const normalized = replaceRetiredEntries(next);
      if (normalized !== next && catalogByteLength(normalized) > MAX_CATALOG_BYTES) return 'INVALID_INPUT';
      state = { revision: state.revision + 1, file: normalized, requests: [...state.requests, [data.requestId, fingerprint] as [string, string]].slice(-256) };
    } catch { return 'INVALID_INPUT'; }
  }
  return { execute, snapshot, cards: () => state.file.entries.filter(e => e.enabled).map(e => structuredClone(e.card)),
    exportState: () => structuredClone(state), restore(saved: SavedCatalog) { state = validateSavedCatalog(saved); } };
}
