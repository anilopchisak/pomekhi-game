import type { PersonalCard } from './protocol.js';

export type LegacyCard = PersonalCard & { offering?: boolean };

export function isRetiredMission(card: LegacyCard | undefined): boolean {
  return card?.role === 'exorcist' && (card.offering === true ||
    [card.title, card.mission, card.successCondition, card.setup].some(value =>
      value !== undefined && /(?:обител[ьи]|spirit dwelling)/iu.test(value)));
}
