import type { PersonalCard } from '../shared/protocol.js';
import { isRetiredMission } from '../shared/retired-mission.js';
import type { LegacyCard } from '../shared/retired-mission.js';
import { authoredMissions } from './authored-content.js';
import { comedyMissions } from './comedy-missions.js';
import { shortMission } from './short-cards.js';

const replacements = [...authoredMissions, ...comedyMissions].filter(card =>
  ['E001', 'E014', 'E015', 'E016', 'E017', 'E018', 'E020', 'CE016'].includes(card.id));

export function replaceRetiredMission(card: LegacyCard, mode: 'issued' | 'catalog' | 'compact' = 'catalog'): PersonalCard {
  if (card.role !== 'exorcist') return card;
  const { offering, ...current } = card;
  if (!isRetiredMission(card)) return offering === undefined ? card : current;

  delete current.successCondition;
  delete current.setup;
  // The compact title and mission use 15 UTF-8 bytes. In a canonical catalog the
  // shortest retired text plus the other required field already uses 15 bytes.
  if (mode === 'compact') return { ...current, title: '👋', mission: 'Кивни.' };
  const issued = mode === 'issued';
  const legacyBuiltIn = /^dwelling:(E01[456])$/.exec(card.id);
  const replacement = issued ? replacements.find(candidate => candidate.id === (legacyBuiltIn?.[1] ?? card.id)) : undefined;
  const newMission = replacement ?? replacements.find(candidate => candidate.id === 'E014')!;
  const copy = issued && (card.brief || legacyBuiltIn) ? shortMission(newMission) : newMission;
  if (copy.role !== 'exorcist') throw Error('Invalid replacement mission.');
  return { ...current, title: copy.title, mission: copy.mission,
    ...(copy.brief ? { brief: true } : {}), ...(copy.successCondition ? { successCondition: copy.successCondition } : {}) };
}
