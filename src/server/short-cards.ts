import type { PersonalCard } from '../shared/protocol.js';
import copy from './short-card-copy.js';

const answers: Readonly<Record<string, readonly string[]>> = copy.answers;
const setups: Readonly<Partial<Record<string, string>>> = copy.setup;

export function shortAnswer(id: string, index = 0): string {
  const answer = answers[id]?.[index];
  if (!answer) throw new Error(`Missing short card copy for ${id}.`);
  return answer + '.';
}

export function shortMission(card: PersonalCard): PersonalCard {
  const { id } = card;
  const setup = setups[id];
  const brief = { brief: true as const, setup: setup ? setup + '.' : card.setup };
  return card.role === 'possessed'
    ? { ...card, ...brief, behavior: shortAnswer(id), infectionCondition: shortAnswer(id, 1), releaseCondition: shortAnswer(id, 2) }
    : { ...card, ...brief, mission: shortAnswer(id) };
}
