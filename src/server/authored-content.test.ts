import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { PersonalCard } from '../shared/protocol.js';
import { authoredMissions, authoredProphecies, authoredReferences, authoredTrials, horrorMissions } from './authored-content.js';
import { stories } from './first-game-content.js';

interface EditorialCard {
  id: string; baseCard?: string; type: string; title: string; sets: string[]; requirements: string[];
  behavior?: string; infectionCondition?: string; releaseCondition?: string;
  mission?: string; successCondition?: string; depositRequired?: boolean;
  rule?: string; final?: boolean; prologue?: string; sections?: unknown;
  delivery?: { instruction: string };
}
function readCards(file: string): EditorialCard[] {
  return JSON.parse(readFileSync(new URL('../../output/cards/' + file, import.meta.url), 'utf8')).cards;
}
function expectMission(card: PersonalCard | undefined, source: EditorialCard) {
  expect(card).toMatchObject({ id: source.baseCard ?? source.id, title: source.title, role: source.type, sets: source.sets });
  expect(card?.setup).toBe(source.requirements.join(' ') || undefined);
  expect(card).not.toHaveProperty('clue');
  if (card?.role === 'possessed') {
    expect(card.behavior).toBe(source.behavior);
    expect(card.infectionCondition).toBe(source.infectionCondition);
    expect(card.releaseCondition).toBe(source.releaseCondition);
  } else if (card?.role === 'exorcist') {
    expect(card.mission).toBe(source.mission);
    expect(card.successCondition).toBe(source.successCondition);
    expect(Boolean(card.offering)).toBe(Boolean(source.depositRequired));
  }
}

it('projects the complete 147-card editorial set into the game', () => {
  const source = readCards('cards.json');
  const missions = source.filter(card => card.type === 'possessed' || card.type === 'exorcist');
  expect(source).toHaveLength(147);
  expect(authoredMissions.map(card => card.id)).toEqual(missions.map(card => card.id));
  for (const card of missions) expectMission(authoredMissions.find(candidate => candidate.id === card.id), card);
  expect(authoredTrials).toEqual(source.filter(card => card.type === 'trial').map(card => ({
    id: card.id, title: card.title, instruction: card.delivery?.instruction, harder: card.sets.includes('harder'),
  })));
  expect(authoredProphecies).toEqual(source.filter(card => card.type === 'prophecy').map(({ id, title, rule, final }) => ({ id, title, rule, final })));
  expect(stories).toEqual(source.filter(card => card.type === 'story').map(({ id, title, prologue }) => ({ id, title, prologue })));
  expect(authoredReferences).toEqual(source.filter(card => card.type === 'reference').map(({ id, title, sections }) => ({ id, title, sections })));
});

it('maps all 38 horror variants to unique missions of the same role', () => {
  const source = readCards('horror/cards.json');
  expect(source).toHaveLength(38);
  expect([...horrorMissions.keys()]).toEqual(source.map(card => card.baseCard));
  for (const card of source) {
    expect(authoredMissions.find(candidate => candidate.id === card.baseCard)?.role).toBe(card.type);
    expectMission(horrorMissions.get(card.baseCard!), card);
  }
});
