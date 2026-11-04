import type { Assignment, DealingSnapshot, Difficulty, LobbyError, PersonalCard, Role } from '../shared/protocol.js';
import { CARD_BANK } from './cards.js';

interface Options { generateId: () => string; randomIndex: (limit: number) => number; getCards?: () => readonly PersonalCard[]; ordered?: { pool: () => readonly PersonalCard[]; reserved: () => string[]; minimum: () => number } }
export type DeckUsage = [string, string[]][];
export interface SavedDealing { usage?: DeckUsage; difficulty: Difficulty; version: number; dealId: string | null; initialPossessedCount: number | null; assignments: [string, Assignment][] }
export function createDealing({ generateId, randomIndex, getCards = () => CARD_BANK, ordered }: Options) {
  let difficulty: Difficulty = 1;
  let version = 0;
  let dealId: string | null = null;
  let initialPossessedCount: number | null = null;
  let assignments = new Map<string, Assignment>();

  let usage = new Map<string, Set<string>>();
  const draftUsage = () => new Map([...usage].map(([key, ids]) => [key, new Set(ids)]));
  function enough(role: Role, count: number, level = difficulty) { return getCards().filter(c => c.role === role && c.difficulty <= level).length >= count + 1; }
  function select(role: Role, used: Set<string>, draft: Map<string, Set<string>>, level = difficulty, previous?: string) {
    for (let tier = level; tier >= 1; tier--) {
      const pool = getCards().filter(card => card.role === role && card.difficulty === tier);
      const available = pool.filter(card => !used.has(card.id) && card.id !== previous);
      if (!available.length) continue;
      const key = `${role}:${tier}`;
      let seen = draft.get(key) ?? new Set<string>();
      let fresh = available.filter(card => !seen.has(card.id));
      if (!fresh.length) { seen = new Set(pool.filter(card => used.has(card.id)).map(card => card.id)); fresh = available; }
      const card = fresh[randomIndex(fresh.length)]; seen.add(card.id); draft.set(key, seen);
      return structuredClone(card);
    }
    return undefined;
  }
  function counts() {
    const possessed = [...assignments.values()].filter(item => item.card.role === 'possessed').length;
    return { possessed, exorcists: assignments.size - possessed };
  }
  function publicState(): DealingSnapshot {
    const { possessed, exorcists } = counts();
    return {
      version, dealId, initialPossessedCount,
      compositionValid: ordered ? assignments.size >= ordered.minimum() && assignments.size <= 12 &&
        possessed === Math.floor(assignments.size / 2)
        : assignments.size >= 4 && assignments.size <= 12 && possessed >= 1 && exorcists >= 2 && possessed <= exorcists,
      assignments: [...assignments].sort(([a], [b]) => a.localeCompare(b)).map(([playerId, item]) => ({ playerId, assignmentId: item.id, ready: item.ready, replacementRequested: item.replacementRequested })),
    };
  }
  function personal(playerId: string): Assignment | null {
    const assignment = assignments.get(playerId);
    return assignment ? structuredClone(assignment) : null;
  }
  function deal(players: string[], possessedCount: number, history: ReadonlyMap<string, number> = new Map(), level: Difficulty = 1): LobbyError | undefined {
    if (ordered) {
      if (players.length < ordered.minimum() || players.length > 12) return 'INVALID_COMPOSITION';
      const used = new Set(ordered.reserved()), draft = draftUsage(), next = new Map<string, Assignment>();
      const pool = ordered.pool().filter(card => !used.has(card.id));
      if (pool.filter(card => card.role === 'possessed').length < Math.floor(players.length / 2) ||
        pool.filter(card => card.role === 'exorcist').length < Math.ceil(players.length / 2)) return 'CARD_POOL_INSUFFICIENT';
      const shuffled = [...players];
      for (let index = 0; index < shuffled.length - 1; index++) {
        const other = index + randomIndex(shuffled.length - index);
        [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
      }
      for (const [index, playerId] of shuffled.entries()) {
        const role = index % 2 ? 'possessed' : 'exorcist';
        const card = drawOrdered(role, used, draft);
        if (!card) return 'CARD_POOL_INSUFFICIENT';
        used.add(card.id);
        next.set(playerId, { id: generateId(), card, ready: false, replacementRequested: false });
      }
      difficulty = 3; usage = draft; assignments = next; dealId = generateId(); initialPossessedCount = Math.floor(players.length / 2); version++;
      return;
    }
    if (players.length < 4 || players.length > 12 || !Number.isInteger(possessedCount) || possessedCount < 1 || possessedCount > Math.floor(players.length / 2)) return 'INVALID_COMPOSITION';
    if (!enough('possessed', possessedCount, level) || !enough('exorcist', players.length - possessedCount, level)) return 'CARD_POOL_INSUFFICIENT';
    let draft = draftUsage();
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // A stable sort retains random tie order while favoring less-played possessed roles.
    shuffled.sort((a, b) => (history.get(a) ?? 0) - (history.get(b) ?? 0));
    const next = new Map<string, Assignment>();
    const used = new Set<string>();
    for (const [index, playerId] of shuffled.entries()) {
      const role = index < possessedCount ? 'possessed' : 'exorcist';
      const previous = assignments.get(playerId)?.card;
      const before = new Map([...draft].map(([key, ids]) => [key, new Set(ids)]));
      let card = select(role, used, draft, level, previous?.id);
      // A greedy earlier draw can leave only this player's previous high-level card.
      // Swap within the uncommitted deal instead of unnecessarily lowering difficulty.
      const blocked = previous && getCards().find(c => c.id === previous.id && c.role === role && c.difficulty <= level);
      if (blocked && !used.has(blocked.id) && (!card || card.difficulty < blocked.difficulty)) {
        const donor = [...next].find(([id, item]) => item.card.role === role && item.card.difficulty === blocked.difficulty && assignments.get(id)?.card.id !== blocked.id);
        if (donor) {
          card = donor[1].card; donor[1].card = structuredClone(blocked); draft = before;
          const key = `${role}:${blocked.difficulty}`, seen = draft.get(key) ?? new Set<string>();
          seen.add(blocked.id); draft.set(key, seen); used.add(blocked.id);
        }
      }
      if (!card) return 'CARD_POOL_INSUFFICIENT';
      used.add(card.id);
      next.set(playerId, { id: generateId(), card, ready: false, replacementRequested: false });
    }
    difficulty = level; usage = draft;
    assignments = next;
    dealId = generateId(); initialPossessedCount = possessedCount; version++;
  }
  function drawOrdered(role: Role, used: Set<string>, draft: Map<string, Set<string>>) {
    const pool = ordered!.pool().filter(card => card.role === role);
    const key = `${role}:3`, seen = draft.get(key) ?? new Set<string>();
    const available = pool.filter(card => !used.has(card.id));
    let fresh = available.filter(card => !seen.has(card.id));
    if (!fresh.length) { seen.clear(); fresh = available; }
    if (!fresh.length) return undefined;
    const card = fresh[randomIndex(fresh.length)];
    seen.add(card.id); draft.set(key, seen);
    return structuredClone(card);
  }
  function cancel() { assignments.clear(); dealId = null; initialPossessedCount = null; version++; }
  function add(playerId: string) {
    if (!dealId || assignments.has(playerId)) return;
    const { possessed, exorcists } = counts();
    const legal: Role[] = exorcists < 2 ? ['exorcist'] : possessed === 0 ? ['possessed'] : possessed >= exorcists ? ['exorcist'] : ['possessed', 'exorcist'];
    const roles = legal.filter(role => enough(role, (role === 'possessed' ? possessed : exorcists) + 1));
    if (!roles.length) return 'CARD_POOL_INSUFFICIENT';
    const role = roles[randomIndex(roles.length)], draft = draftUsage();
    const card = select(role, new Set([...assignments.values()].map(item => item.card.id)), draft);
    if (!card) return 'CARD_POOL_INSUFFICIENT';
    usage = draft;
    assignments.set(playerId, { id: generateId(), card, ready: false, replacementRequested: false });
  }
  function remove(playerId: string) { assignments.delete(playerId); }
  function change(playerId: string, assignmentId: string, action: 'replace' | 'ready' | 'request', flag?: boolean): LobbyError | undefined {
    const current = assignments.get(playerId);
    if (!current || current.id !== assignmentId) return 'STALE_CARD';
    if (action === 'replace') {
      const used = new Set([...assignments.values()].map(item => item.card.id).concat(ordered?.reserved() ?? []));
      const draft = draftUsage();
      const card = ordered ? drawOrdered(current.card.role, used, draft) : select(current.card.role, used, draft);
      if (!card) return 'CARD_POOL_INSUFFICIENT';
      usage = draft;
      assignments.set(playerId, { id: generateId(), card, ready: false, replacementRequested: false });
    } else if (action === 'ready') {
      if (flag && current.replacementRequested) return 'REPLACEMENT_PENDING';
      current.ready = flag!;
    } else {
      current.replacementRequested = flag!;
      if (flag) current.ready = false;
    }
  }
  function exportState(): SavedDealing { return structuredClone({ difficulty, version, dealId, initialPossessedCount, assignments: [...assignments], usage: [...usage].map(([key, ids]) => [key, [...ids]]) }); }
  function restore(state: SavedDealing, bump = true) {
    difficulty = state.difficulty;
    usage = new Map((state.usage ?? []).map(([key, ids]) => [key, new Set(ids)]));
    version = state.version + Number(bump); dealId = state.dealId; initialPossessedCount = state.initialPossessedCount;
    assignments = new Map(structuredClone(state.assignments));
  }
  return { publicState, personal, deal, cancel, add, remove, change, exportState, restore };
}
