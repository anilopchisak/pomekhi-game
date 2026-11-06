import type { LobbyError, Prophecy, RitualOutcome, RitualSnapshot, RoundResult } from '../shared/protocol.js';
import { authoredProphecies } from './authored-content.js';
import { shortAnswer } from './short-cards.js';
import { finalProphecy, prophecies } from './prophecies.js';

type Positions = [number, number, number, number];
type RitualEvent = { kind: 'round'; id: string; number: number; successes: number }
  | { kind: 'penalty'; id: string; undone: boolean } | { kind: 'lock' } | { kind: 'stop' } | { kind: 'all_possessed' | 'no_return' } | { kind: 'dismissed_penalty' };
export interface SavedRitual { players: number; roundLimit: number; cards: [Prophecy, Prophecy, Prophecy]; events: RitualEvent[]; firstGame?: true }
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
export function newRitual(players: number, rounds: number, randomIndex: (limit: number) => number, generateId: () => string, firstGame = false, useAuthoredBank = false) {
  const publicCard = ({ id, title }: Prophecy) => ({ id, title, rule: shortAnswer(id) });
  const bank = useAuthoredBank ? authoredProphecies.filter(card => !card.final).map(publicCard) : [...prophecies];
  const take = () => structuredClone(bank.splice(randomIndex(bank.length), 1)[0]);
  return createRitual({ players, roundLimit: rounds, cards: [take(), take(), useAuthoredBank ? publicCard(authoredProphecies.find(card => card.final)!) : structuredClone(finalProphecy)], events: [], ...(firstGame ? { firstGame: true } : {}) }, generateId);
}

/** The ritual consumes sealed outcomes. Game remains the sole owner of lifecycle phases. */
export function createRitual(saved: SavedRitual, generateId: () => string) {
  const state = structuredClone(saved);
  const initial: Positions = [state.players + 1, 2, 3, 0];
  const setup = state.firstGame ? { positions: initial, target: remaining(initial) } : ritualSetup(state.players, state.roundLimit);
  let positions: Positions, revealed: boolean[], outcome: RitualOutcome;
  function penaltyIndex() {
    if (state.firstGame) {
      const max = Math.max(...positions), index = positions.indexOf(max);
      return index > 0 && positions.lastIndexOf(max) === index ? index : -1;
    }
    let index = 3;
    for (let i = 2; i >= 1; i--) if (positions[i] > positions[index]) index = i;
    return positions[index] ? index : -1;
  }
  function penaltyMove(): NonNullable<RitualSnapshot['penaltyPreview']> | null {
    const source = penaltyIndex();
    if (source !== 1 && source !== 2 && source !== 3) return null;
    const next = [...positions] as Positions;
    next[source]--;
    next[source - 1]++;
    return { source, positions: next, remainingSteps: remaining(next) };
  }
  function rebuild() {
    positions = [...setup.positions]; revealed = [false, false, false]; outcome = 'playing';
    for (const event of state.events) {
      if (event.kind === 'round') {
        advance(positions, event.successes);
        for (let i = 0; i < 3; i++) if ((i === 0 || revealed[i - 1]) && positions.slice(0, i + 1).every(n => n === 0)) revealed[i] = true;
        outcome = remaining(positions) === 0 ? 'won' : event.number >= state.roundLimit ? 'lost' : 'playing';
      } else if (event.kind === 'penalty' && !event.undone) {
        const move = penaltyMove();
        if (move) positions = move.positions;
      } else if (event.kind === 'stop') outcome = 'stopped';
      else if (event.kind === 'all_possessed' || event.kind === 'no_return') outcome = event.kind;
    }
  }
  rebuild();
  const successes = (row: RoundResult) => row.rescuedGroups + row.missions + (row.trialBonus ?? 0);
  function commit(row: RoundResult): LobbyError | undefined {
    if (row.kind === 'tutorial' || row.status === 'aborted') return;
    if (row.status !== 'final') return 'INVALID_INPUT';
    const old = state.events.find(e => e.kind === 'round' && e.id === row.roundId);
    if (old) return old.kind === 'round' && old.number === row.number && old.successes === successes(row) ? undefined : 'INVALID_INPUT';
    if (outcome !== 'playing') return 'RESULTS_FINAL';
    if (row.number !== state.events.filter(e => e.kind === 'round').length + 1 || row.number > state.roundLimit || !Number.isInteger(successes(row)) || successes(row) < 0 || successes(row) > (row.trialBonus ? 13 : 12)) return 'INVALID_INPUT';
    state.events.push({ kind: 'round', id: row.roundId, number: row.number, successes: successes(row) }); rebuild();
  }
  function snapshot(row?: RoundResult): RitualSnapshot {
    const next = [...positions] as Positions;
    const preview = outcome === 'playing' && row?.kind === 'regular' && row.status === 'provisional';
    if (preview) advance(next, successes(row));
    const last = state.events.at(-1);
    const penaltyAvailable = outcome === 'playing' && revealed[0];
    const penaltyPreview = penaltyAvailable ? penaltyMove() : null;
    return { players: state.players, roundLimit: state.roundLimit, target: setup.target, positions: [...positions], remainingSteps: remaining(positions), outcome,
      cards: (['A', 'B', 'C'] as const).map((slot, i) => revealed[i] ? { slot, revealed: true, card: structuredClone(state.cards[i]) } : { slot, revealed: false }),
      canPenalize: penaltyPreview !== null,
      ...(state.firstGame ? { penaltyDisputed: penaltyAvailable && !penaltyPreview, penaltyPreview } : {}),
      canUndoPenalty: outcome === 'playing' && last?.kind === 'penalty' && !last.undone,
      preview: preview ? { successes: successes(row), positions: next, remainingSteps: remaining(next) } : null };
  }
  function penalty(id?: string): LobbyError | undefined {
    if (snapshot().penaltyDisputed) { state.events.push({ kind: 'dismissed_penalty' }); return; }
    if (!snapshot().canPenalize) return 'ACTION_UNAVAILABLE';
    state.events.push({ kind: 'penalty', id: id ?? generateId(), undone: false }); rebuild();
  }
  function undoPenalty(): LobbyError | undefined {
    if (!snapshot().canUndoPenalty) return 'ACTION_UNAVAILABLE';
    const last = state.events.at(-1)!; if (last.kind === 'penalty') last.undone = true; rebuild();
  }
  return { snapshot, commit, penalty, undoPenalty, lastPenaltyId: () => { const last = state.events.at(-1); return last?.kind === 'penalty' && !last.undone ? last.id : undefined; },
    lock: () => { if (outcome === 'playing' && state.events.at(-1)?.kind === 'penalty') state.events.push({ kind: 'lock' }); },
    stop: (reason: 'stop' | 'all_possessed' | 'no_return' = 'stop') => { if (outcome === 'playing' || reason !== 'stop' && (outcome === 'lost' || outcome === 'won')) { state.events.push({ kind: reason }); rebuild(); } },
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
  check(s.firstGame === undefined || s.firstGame === true && s.players >= 5 && s.roundLimit === 7);
  const replay = createRitual({ ...s, events: [] }, () => nextId);
  const ids = new Set<string>();
  for (const e of s.events) {
    check(e && (replay.snapshot().outcome === 'playing' || s.firstGame && (e.kind === 'all_possessed' || e.kind === 'no_return') && ['lost', 'won'].includes(replay.snapshot().outcome)));
    if (e.kind === 'round' || e.kind === 'penalty') {
      check(typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 256 && !ids.has(e.id)); ids.add(e.id); nextId = e.id;
    }
    const before = replay.exportState().events.length;
    if (e.kind === 'round') {
      check(Number.isInteger(e.number) && e.number === ++number && e.number <= s.roundLimit && Number.isInteger(e.successes) && e.successes >= 0 && e.successes <= (s.firstGame ? 13 : 12));
      check(replay.commit({ roundId: e.id, number: e.number, kind: 'regular', status: 'final', rescuedGroups: Math.min(12, e.successes), missions: 0, trialBonus: e.successes === 13 ? 1 : undefined } as RoundResult) === undefined);
    } else if (e.kind === 'penalty') {
      check(typeof e.undone === 'boolean' && replay.snapshot().canPenalize && replay.penalty() === undefined);
      if (e.undone) check(replay.undoPenalty() === undefined);
    } else if (e.kind === 'lock') replay.lock();
    else if (e.kind === 'dismissed_penalty') { check(s.firstGame && replay.snapshot().penaltyDisputed); replay.penalty(); }
    else { check(e.kind === 'stop' || s.firstGame && (e.kind === 'all_possessed' || e.kind === 'no_return')); replay.stop(e.kind); }
    check(replay.exportState().events.length === before + 1);
  }
}
