import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { PersonalCard } from '../shared/protocol.js';
import { authoredMissions, authoredProphecies, authoredReferences } from './authored-content.js';
import { stories } from './first-game-content.js';

interface EditorialCard {
  id: string; baseCard?: string; type: string; title: string; sets: string[]; requirements: string[];
  behavior?: string; infectionCondition?: string; releaseCondition?: string;
  mission?: string; successCondition?: string;
  rule?: string; final?: boolean; prologue?: string; sections?: unknown;
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
    expect(card).not.toHaveProperty('offering');
  }
}

it('projects the complete 136-card editorial set into the game', () => {
  const source = readCards('cards.json');
  const missions = source.filter(card => card.type === 'possessed' || card.type === 'exorcist');
  expect(source).toHaveLength(136);
  expect(authoredMissions.map(card => card.id)).toEqual(missions.map(card => card.id));
  for (const card of missions) expectMission(authoredMissions.find(candidate => candidate.id === card.id), card);
  expect(source.every(card => !/^T\d{3}$/.test(card.id))).toBe(true);
  expect(authoredProphecies).toEqual(source.filter(card => card.type === 'prophecy').map(({ id, title, rule, final }) => ({ id, title, rule, final })));
  expect(stories).toEqual(source.filter(card => card.type === 'story').map(({ id, title, prologue }) => ({ id, title, prologue })));
  expect(authoredReferences).toEqual(source.filter(card => card.type === 'reference').map(({ id, title, sections }) => ({ id, title, sections })));
});
