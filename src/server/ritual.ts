import type { LobbyError, Prophecy, RitualOutcome, RitualSnapshot, RoundResult } from '../shared/protocol.js';
import { finalProphecy, prophecies } from './prophecies.js';

type Positions = [number, number, number, number];
type RitualEvent = { kind: 'round'; id: string; number: number; successes: number }
  | { kind: 'penalty'; id: string; undone: boolean } | { kind: 'lock' } | { kind: 'stop' };
export interface SavedRitual { players: number; roundLimit: number; cards: [Prophecy, Prophecy, Prophecy]; events: RitualEvent[] }
export function ritualSetup(players: number, rounds: number) {
  const target = Math.max(3, Math.round((3 * players + 7) * rounds / 7));
  const b = Math.min(Math.round(2 * rounds / 7), Math.floor((target - 3) / 2));
  const a = Math.max(1, Math.floor((target - 2 * b - Math.round(3 * rounds / 7)) / 3));
  return { target, positions: [a, b, target - 3 * a - 2 * b, 0] as Positions };
}
function advance(positions: Positions, successes: number) {
  while (successes-- > 0) {
    const index = positions.findIndex((n, i) => i < 3 && n > 0);
    if (index < 0) break;
    positions[index]--; positions[index + 1]++;
  }
}
const remaining = (p: Positions) => 3 * p[0] + 2 * p[1] + p[2];
export function newRitual(players: number, rounds: number, randomIndex: (limit: number) => number, generateId: () => string) {
  const bank = [...prophecies];
  const take = () => structuredClone(bank.splice(randomIndex(bank.length), 1)[0]);
  return createRitual({ players, roundLimit: rounds, cards: [take(), take(), structuredClone(finalProphecy)], events: [] }, generateId);
}

/** The ritual consumes sealed outcomes. Game remains the sole owner of lifecycle phases. */
export function createRitual(saved: SavedRitual, generateId: () => string) {
  const state = structuredClone(saved), setup = ritualSetup(state.players, state.roundLimit);
  let positions: Positions, revealed: boolean[], outcome: RitualOutcome;
  function rebuild() {
    positions = [...setup.positions]; revealed = [false, false, false]; outcome = 'playing';
    for (const event of state.events) {
      if (event.kind === 'round') {
        advance(positions, event.successes);
        for (let i = 0; i < 3; i++) if ((i === 0 || revealed[i - 1]) && positions.slice(0, i + 1).every(n => n === 0)) revealed[i] = true;
        outcome = remaining(positions) === 0 ? 'won' : event.number >= state.roundLimit ? 'lost' : 'playing';
      } else if (event.kind === 'penalty' && !event.undone) {
        let index = 3;
        for (let i = 2; i >= 1; i--) if (positions[i] > positions[index]) index = i;
        if (positions[index]) { positions[index]--; positions[index - 1]++; }
      } else if (event.kind === 'stop') outcome = 'stopped';
    }
  }
  rebuild();
  function commit(row: RoundResult): LobbyError | undefined {
    if (row.kind === 'tutorial' || row.status === 'aborted') return;
    if (row.status !== 'final') return 'INVALID_INPUT';
    const old = state.events.find(e => e.kind === 'round' && e.id === row.roundId);
    if (old) return old.kind === 'round' && old.number === row.number && old.successes === row.rescuedGroups + row.missions ? undefined : 'INVALID_INPUT';
    if (outcome !== 'playing') return 'RESULTS_FINAL';
    if (row.number !== state.events.filter(e => e.kind === 'round').length + 1 || row.number > state.roundLimit || !Number.isInteger(row.rescuedGroups + row.missions) || row.rescuedGroups + row.missions < 0 || row.rescuedGroups + row.missions > 12) return 'INVALID_INPUT';
    state.events.push({ kind: 'round', id: row.roundId, number: row.number, successes: row.rescuedGroups + row.missions }); rebuild();
  }
  function snapshot(row?: RoundResult): RitualSnapshot {
    const next = [...positions] as Positions;
    const preview = outcome === 'playing' && row?.kind === 'regular' && row.status === 'provisional';
    if (preview) advance(next, row.rescuedGroups + row.missions);
    const last = state.events.at(-1);
    return { players: state.players, roundLimit: state.roundLimit, target: setup.target, positions: [...positions], remainingSteps: remaining(positions), outcome,
      cards: (['A', 'B', 'C'] as const).map((slot, i) => revealed[i] ? { slot, revealed: true, card: structuredClone(state.cards[i]) } : { slot, revealed: false }),
      canPenalize: outcome === 'playing' && revealed[0] && positions.slice(1).some(n => n > 0),
      canUndoPenalty: outcome === 'playing' && last?.kind === 'penalty' && !last.undone,
      preview: preview ? { successes: row.rescuedGroups + row.missions, positions: next, remainingSteps: remaining(next) } : null };
  }
  function penalty(): LobbyError | undefined {
    if (!snapshot().canPenalize) return 'ACTION_UNAVAILABLE';
    state.events.push({ kind: 'penalty', id: generateId(), undone: false }); rebuild();
  }
  function undoPenalty(): LobbyError | undefined {
    if (!snapshot().canUndoPenalty) return 'ACTION_UNAVAILABLE';
    const last = state.events.at(-1)!; if (last.kind === 'penalty') last.undone = true; rebuild();
  }
  return { snapshot, commit, penalty, undoPenalty,
    lock: () => { if (outcome === 'playing' && state.events.at(-1)?.kind === 'penalty') state.events.push({ kind: 'lock' }); },
    stop: () => { if (outcome === 'playing') { state.events.push({ kind: 'stop' }); rebuild(); } },
    exportState: (): SavedRitual => structuredClone(state) };
}

/** Validate by replaying through the same interface used by game. No bank lookup changes issued text. */
export function validateRitual(value: unknown): asserts value is SavedRitual {
  const s = value as SavedRitual;
  const check = (ok: unknown) => { if (!ok) throw new Error('Invalid ritual checkpoint.'); };
  check(s && Number.isInteger(s.players) && s.players >= 4 && s.players <= 12 && Number.isInteger(s.roundLimit) && s.roundLimit >= 1 && s.roundLimit <= 99);
  check(Array.isArray(s.cards) && s.cards.length === 3 && new Set(s.cards.map(c => c?.id)).size === 3);
  check(s.cards.every(c => c && [c.id, c.title, c.rule].every(t => typeof t === 'string' && t.length > 0 && t.length <= 10000)));
  check(Array.isArray(s.events) && s.events.length <= 10000);
  let nextId = '', number = 0;
  const replay = createRitual({ players: s.players, roundLimit: s.roundLimit, cards: s.cards, events: [] }, () => nextId);
  const ids = new Set<string>();
  for (const e of s.events) {
    check(e && replay.snapshot().outcome === 'playing');
    if (e.kind === 'round' || e.kind === 'penalty') {
      check(typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 256 && !ids.has(e.id)); ids.add(e.id); nextId = e.id;
    }
    const before = replay.exportState().events.length;
    if (e.kind === 'round') {
      check(Number.isInteger(e.number) && e.number === ++number && e.number <= s.roundLimit && Number.isInteger(e.successes) && e.successes >= 0 && e.successes <= 12);
      check(replay.commit({ roundId: e.id, number: e.number, kind: 'regular', status: 'final', rescuedGroups: e.successes, missions: 0 } as RoundResult) === undefined);
    } else if (e.kind === 'penalty') {
      check(typeof e.undone === 'boolean' && replay.penalty() === undefined);
      if (e.undone) check(replay.undoPenalty() === undefined);
    } else if (e.kind === 'lock') replay.lock();
    else { check(e.kind === 'stop'); replay.stop(); }
    check(replay.exportState().events.length === before + 1);
  }
}
