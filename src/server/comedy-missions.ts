import type { PersonalCard } from '../shared/protocol.js';
import comedy from './comedy-cards.js';

export const comedyMissions: readonly PersonalCard[] = [
  ...comedy.possessed.map(({ id, title, behavior, infectionCondition, releaseCondition }) => ({
    id, title, difficulty: 1 as const, role: 'possessed' as const, behavior, infectionCondition, releaseCondition,
  })),
  ...comedy.exorcist.map(({ id, title, mission, successCondition, requirements, depositRequired }) => ({
    id, title, difficulty: 1 as const, role: 'exorcist' as const, mission, successCondition,
    ...(requirements.length ? { setup: requirements.join(' ') } : {}),
    ...(depositRequired ? { offering: true } : {}),
  })),
];
