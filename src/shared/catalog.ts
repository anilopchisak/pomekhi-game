import { cardSets, venueFeatures } from './protocol.js';
import type { CatalogEntry, CatalogFile, PersonalCard } from './protocol.js';
export const MAX_CATALOG_BYTES = 512 * 1024;
export function catalogByteLength(file: CatalogFile): number {
  return new TextEncoder().encode(JSON.stringify(file)).byteLength;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid catalog.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max || /\p{Cc}/u.test(value.replace(/[\n\r\t]/g, ''))) throw Error('Invalid card text.');
  return value;
}
export function validateEntry(value: unknown): CatalogEntry {
  const item = record(value), card = record(item.card);
  if (typeof item.enabled !== 'boolean' || typeof card.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(card.id) || ![1, 2, 3].includes(card.difficulty as number)) throw Error('Invalid card.');
  if (card.harder !== undefined && typeof card.harder !== 'boolean' || card.offering !== undefined && (card.role !== 'exorcist' || typeof card.offering !== 'boolean')) throw Error('Invalid card options.');
  const options = <T extends string>(values: unknown, allowed: readonly T[]): T[] | undefined => {
    if (values === undefined) return undefined;
    if (!Array.isArray(values) || !values.every(value => allowed.includes(value)) || new Set(values).size !== values.length) throw Error('Invalid card requirements.');
    return [...values];
  };
  const sets = options(card.sets, cardSets), requirements = options(card.requirements, venueFeatures);
  // Keep the legacy flag in the import payload so the server can replace the mission.
  const common = { id: card.id, title: text(card.title, 120), difficulty: card.difficulty as PersonalCard['difficulty'], ...(sets ? { sets } : {}), ...(requirements ? { requirements } : {}),
    ...(card.harder === true ? { harder: true } : {}), ...(card.offering === true ? { offering: true } : {}) };
  if (card.role === 'possessed') return { enabled: item.enabled, card: { ...common, role: 'possessed', behavior: text(card.behavior, 2000), ...(card.clue === undefined || card.clue === '' ? {} : { clue: text(card.clue, 2000) }), releaseCondition: text(card.releaseCondition, 2000), infectionCondition: text(card.infectionCondition, 2000) } };
  if (card.role === 'exorcist') return { enabled: item.enabled, card: { ...common, role: 'exorcist', mission: text(card.mission, 2000), ...(card.successCondition === undefined ? {} : { successCondition: text(card.successCondition, 2000) }) } };
  throw Error('Invalid card role.');
}
export function validateCatalogFile(value: unknown): CatalogFile {
  const file = record(value);
  if (file.format !== 'pomekhi.cards' || (file.version !== 1 && file.version !== 2) || !Array.isArray(file.entries) || file.entries.length > 500) throw Error('Invalid catalog format.');
  const entries = file.entries.map(validateEntry);
  if (new Set(entries.map(e => e.card.id)).size !== entries.length) throw Error('Duplicate card ID.');
  const result: CatalogFile = { format: 'pomekhi.cards', version: file.version, entries };
  if (catalogByteLength(result) > MAX_CATALOG_BYTES) throw Error('Catalog exceeds the supported size.');
  return result;
}
