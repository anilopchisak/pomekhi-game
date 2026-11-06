export const MIN_RITUAL_TARGET = 6;
export const MAX_RITUAL_TARGET = 84;

export function validManualRitualTarget(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_RITUAL_TARGET && value <= MAX_RITUAL_TARGET;
}

export function automaticRitualTarget(players: number) {
  return 6 * Math.floor(players / 2);
}
