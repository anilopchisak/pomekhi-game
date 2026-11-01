import type { Assignment, DealingSnapshot, Difficulty, LobbyError, Role } from '../shared/protocol.js';
import { CARD_BANK } from './cards.js';

interface Options { generateId: () => string; randomIndex: (limit: number) => number }
export interface SavedDealing { difficulty: Difficulty; version: number; dealId: string | null; initialPossessedCount: number | null; assignments: [string, Assignment][] }
export function createDealing({ generateId, randomIndex }: Options) {
  let difficulty: Difficulty = 1;
  let version = 0;
  let dealId: string | null = null;
  let initialPossessedCount: number | null = null;
  let assignments = new Map<string, Assignment>();

  function select(role: Role, used: Set<string>, previous?: string) {
    for (let level = difficulty; level >= 1; level--) {
      const available = CARD_BANK.filter(card => card.role === role && card.difficulty === level && !used.has(card.id) && card.id !== previous);
      if (available.length) return structuredClone(available[randomIndex(available.length)]);
    }
    throw new Error('No unused card remains at or below this difficulty.');
  }
  function counts() {
    const possessed = [...assignments.values()].filter(item => item.card.role === 'possessed').length;
    return { possessed, exorcists: assignments.size - possessed };
  }
  function publicState(): DealingSnapshot {
    const { possessed, exorcists } = counts();
    return {
      version, dealId, initialPossessedCount,
      compositionValid: assignments.size >= 4 && assignments.size <= 12 && possessed >= 1 && exorcists >= 2 && possessed <= exorcists,
      assignments: [...assignments].sort(([a], [b]) => a.localeCompare(b)).map(([playerId, item]) => ({ playerId, assignmentId: item.id, ready: item.ready, replacementRequested: item.replacementRequested })),
    };
  }
  function personal(playerId: string): Assignment | null {
    const assignment = assignments.get(playerId);
    return assignment ? structuredClone(assignment) : null;
  }
  function deal(players: string[], possessedCount: number, history: ReadonlyMap<string, number> = new Map(), level: Difficulty = 1): LobbyError | undefined {
    if (players.length < 4 || players.length > 12 || !Number.isInteger(possessedCount) || possessedCount < 1 || possessedCount > Math.floor(players.length / 2)) return 'INVALID_COMPOSITION';
    difficulty = level;
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // A stable sort retains random tie order while favoring less-played possessed roles.
    shuffled.sort((a, b) => (history.get(a) ?? 0) - (history.get(b) ?? 0));
    const next = new Map<string, Assignment>();
    const used = new Set<string>();
    shuffled.forEach((playerId, index) => {
      const role = index < possessedCount ? 'possessed' : 'exorcist';
      const card = select(role, used, assignments.get(playerId)?.card.id);
      used.add(card.id);
      next.set(playerId, { id: generateId(), card, ready: false, replacementRequested: false });
    });
    assignments = next;
    dealId = generateId(); initialPossessedCount = possessedCount; version++;
  }
  function cancel() { assignments.clear(); dealId = null; initialPossessedCount = null; version++; }
  function add(playerId: string) {
    if (!dealId || assignments.has(playerId)) return;
    const { possessed, exorcists } = counts();
    const role: Role = exorcists < 2 ? 'exorcist' : possessed === 0 ? 'possessed'
      : possessed >= exorcists ? 'exorcist' : randomIndex(2) === 0 ? 'possessed' : 'exorcist';
    const card = select(role, new Set([...assignments.values()].map(item => item.card.id)));
    assignments.set(playerId, { id: generateId(), card, ready: false, replacementRequested: false });
  }
  function remove(playerId: string) { assignments.delete(playerId); }
  function change(playerId: string, assignmentId: string, action: 'replace' | 'ready' | 'request', flag?: boolean): LobbyError | undefined {
    const current = assignments.get(playerId);
    if (!current || current.id !== assignmentId) return 'STALE_CARD';
    if (action === 'replace') {
      const used = new Set([...assignments.values()].map(item => item.card.id));
      const card = select(current.card.role, used);
      assignments.set(playerId, { id: generateId(), card, ready: false, replacementRequested: false });
    } else if (action === 'ready') {
      if (flag && current.replacementRequested) return 'REPLACEMENT_PENDING';
      current.ready = flag!;
    } else {
      current.replacementRequested = flag!;
      if (flag) current.ready = false;
    }
  }
  function exportState(): SavedDealing { return structuredClone({ difficulty, version, dealId, initialPossessedCount, assignments: [...assignments] }); }
  function restore(state: SavedDealing, bump = true) {
    difficulty = state.difficulty;
    version = state.version + Number(bump); dealId = state.dealId; initialPossessedCount = state.initialPossessedCount;
    assignments = new Map(structuredClone(state.assignments));
  }
  return { publicState, personal, deal, cancel, add, remove, change, exportState, restore };
}
