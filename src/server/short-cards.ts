import type { PersonalCard } from '../shared/protocol.js';
import copy from './short-card-copy.js';

const answers: Readonly<Record<string, readonly string[]>> = copy.answers;

export function shortAnswer(id: string, index = 0): string {
  const answer = answers[id]?.[index];
  if (!answer) throw new Error(`Missing short card copy for ${id}.`);
  return answer + '.';
}

export function shortMission(card: PersonalCard): PersonalCard {
  const { id } = card;
  return card.role === 'possessed'
    ? { ...card, brief: true, behavior: shortAnswer(id), infectionCondition: shortAnswer(id, 1), releaseCondition: shortAnswer(id, 2) }
    : { ...card, brief: true, mission: shortAnswer(id) };
}
