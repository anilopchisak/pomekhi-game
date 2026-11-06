export const deckNames = [
  'stories', 'authored-prophecies', 'classic-prophecies',
  'authored-exorcist', 'authored-possessed', 'catalog-exorcist', 'catalog-possessed',
] as const;
export type DeckName = typeof deckNames[number];
export type DeckHistory = Partial<Record<DeckName, readonly string[]>>;

// The editable catalog has at most 500 entries.
export const maxDeckHistory = 1024;

export function drawFromDeck<T extends { id: string }>(available: readonly T[], randomIndex: (limit: number) => number,
  deck: DeckName, history?: DeckHistory): T {
  if (!history) return available[randomIndex(available.length)];
  const seen = history[deck] ?? [];
  const used = new Set(seen);
  let candidates = available.filter(card => !used.has(card.id));
  let retained = seen;
  if (!candidates.length) {
    const eligibleIds = new Set(available.map(card => card.id));
    retained = seen.filter(id => !eligibleIds.has(id));
    const last = seen.at(-1);
    candidates = available.length > 1 ? available.filter(card => card.id !== last) : [...available];
  }
  const card = candidates[randomIndex(candidates.length)];
  history[deck] = [...retained, card.id].slice(-maxDeckHistory);
  return card;
}
