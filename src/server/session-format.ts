import { cardSets, venueFeatures } from '../shared/protocol.js';
import { validateTrials } from './trials.js';
import { standardCatalog, validateSavedCatalog } from './catalog.js';
import type { Assignment } from '../shared/protocol.js';
import type { SavedLobby } from './lobby.js';
import { createSearch } from './search.js';
import type { SavedSearch } from './search.js';
import { createRitual, validateRitual } from './ritual.js';
import { createRoundSync, validateRoundSync, validReleaseTargets } from './round-sync.js';
import { validDifficulty, validSettings, isTimedPhase } from './game.js';

/** Private disk contract. Never import this module from the browser or wire protocol. */
export interface SavedSession { schemaVersion: 5 | 6 | 7; lobby: SavedLobby }
function requireValue(condition: unknown): asserts condition { if (!condition) throw new Error('Invalid or incompatible session file.'); }
function object(value: unknown): Record<string, unknown> { requireValue(value && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown>; }
function array(value: unknown, limit = 100000): unknown[] { requireValue(Array.isArray(value) && value.length <= limit); return value; }
function text(value: unknown, max = 10000): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function duration(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function nullableText(value: unknown) { return value === null || text(value, 256); }
function strings(value: unknown, max = 100000): string[] {
  const values = array(value, max); requireValue(values.every(v => text(v, 256)) && new Set(values).size === values.length); return values as string[];
}
function pairs(value: unknown, max = 100000): [string, unknown][] {
  const entries = array(value, max).map(v => { const p = array(v, 2); requireValue(p.length === 2 && text(p[0], 256)); return p as [string, unknown]; });
  requireValue(new Set(entries.map(([id]) => id)).size === entries.length); return entries;
}
function assignment(value: unknown): Assignment {
  const a = object(value), card = object(a.card);
  requireValue(text(a.id, 256) && typeof a.ready === 'boolean' && typeof a.replacementRequested === 'boolean' && !(a.ready && a.replacementRequested));
  requireValue(text(card.id, 256) && text(card.title) && validDifficulty(card.difficulty));
  requireValue(card.setup === undefined || text(card.setup, 2000));
  requireValue(card.brief === undefined || card.brief === true);
  if (card.role === 'possessed') requireValue(['behavior', 'releaseCondition', 'infectionCondition'].every(k => text(card[k])) && (card.clue === undefined || text(card.clue)));
  else requireValue(card.role === 'exorcist' && text(card.mission));
  return value as Assignment;
}

function validateRetained(value: unknown) {
  const retained = array(value, 12).map(object);
  const members = new Set<string>(), groups = new Set<string>();
  for (const g of retained) {
    const original = assignment(g.assignment);
    requireValue(text(g.origin, 256) && g.id === original.id && original.card.role === 'possessed' && !groups.has(original.id) && nullableText(g.location));
    groups.add(original.id);
    const people = pairs(g.members, 12);
    requireValue(people.length > 0);
    for (const [id, a] of people) {
      requireValue(!members.has(id)); members.add(id);
      requireValue(id === g.origin ? assignment(a).id === original.id : assignment(a).card.role === 'exorcist');
    }
  }
  return { members, groups };
}
function validateSearchBase(base: Record<string, unknown>, zones: string[]) {
  const { members, groups } = validateRetained(base.retained);
  const roster = pairs(base.roster, 12).map(([id, a]) => [id, assignment(a)] as const);
  for (const [id, a] of roster) if (!members.has(id) && a.card.role === 'possessed') { requireValue(!groups.has(a.id)); groups.add(a.id); }
  requireValue([...members].every(id => roster.some(([playerId]) => playerId === id)));
  if (base.unassigned !== undefined) requireValue(strings(base.unassigned, 12).every(id => !members.has(id) &&
    roster.some(([playerId, a]) => playerId === id && a.card.role === 'exorcist')));
  for (const [id, location] of pairs(base.locations, 12)) requireValue(groups.has(id) && typeof location === 'string' && zones.includes(location));
  return [...groups];
}

function validatePlan(value: unknown, historical = false) {
  const plan = object(value);
  requireValue(validDifficulty(plan.difficulty) && (typeof plan.infectionEnabled === 'boolean' || historical && plan.infectionEnabled === null));
  requireValue(plan.kind === 'tutorial' ? plan.number === 0 && plan.difficulty === 1 && typeof plan.infectionEnabled === 'boolean'
    : plan.kind === 'regular' && integer(plan.number) && plan.number >= 1);
  return plan;
}

/** Upgrade detached legacy data. Issued cards and request fingerprints are preserved verbatim. */
function migrateLegacy(input: Record<string, unknown>) {
  const saved = structuredClone(input), lobby = object(saved.lobby);
  if (lobby.room !== null) {
    const room = object(lobby.room), game = object(room.game), settings = object(game.settings), deal = object(game.dealing);
    requireValue(typeof settings.infectionEnabled === 'boolean');
    const infectionEnabled = settings.infectionEnabled;
    const hadInfection = game.search !== null && array(object(game.search).events).some(event => object(object(event).action).kind === 'infect');
    for (const [, a] of pairs(deal.assignments, 12)) requireValue(object(object(a).card).difficulty === 1);
    if (game.search !== null) for (const [, a] of pairs(object(game.search).roster, 12)) requireValue(object(object(a).card).difficulty === 1);
    const results = array(game.results).map(value => {
      const row = object(value);
      return { ...row, kind: 'regular', difficulty: 1, infectionEnabled: null };
    });
    game.settings = { ...settings, tutorialEnabled: false, initialDifficulty: 1, maximumDifficulty: 1, infectionMode: infectionEnabled ? 'on' : 'off' };
    delete (game.settings as Record<string, unknown>).infectionEnabled;
    game.tutorialCompleted = false; game.progressionRounds = settings.roundLimit ?? 5;
    game.roundPlan = deal.dealId === null ? null : { kind: 'regular', number: game.phase === 'reading' || isTimedPhase(game.phase as Parameters<typeof isTimedPhase>[0]) || game.lastRoundAborted
      ? Number(game.completedRounds) + 1 : game.completedRounds, difficulty: 1, infectionEnabled: infectionEnabled || hadInfection };
    deal.difficulty = 1; game.results = results;
  }
  saved.schemaVersion = 2;
  return saved;
}

export function validateSession(value: unknown): SavedSession {
  let saved = object(value);
  if (saved.schemaVersion === 1) saved = migrateLegacy(saved);
  if (saved.schemaVersion === 2) { saved = structuredClone(saved); saved.schemaVersion = 3; const oldLobby = object(saved.lobby); if (oldLobby.room !== null) { const g = object(object(oldLobby.room).game); g.venue = { base: 'База', zones: [] }; g.roundSync = null; } }
  if (saved.schemaVersion === 3) {
    saved = structuredClone(saved); saved.schemaVersion = 4;
    const oldLobby = object(saved.lobby);
    if (oldLobby.room !== null) { const g = object(object(oldLobby.room).game); object(g.settings).ritualEnabled = false; g.ritual = null; g.freeplayFrom = null; }
  }
  if (saved.schemaVersion === 4) {
    saved = structuredClone(saved); saved.schemaVersion = 5;
    const old = object(saved.lobby); old.catalog = standardCatalog();
    if (old.room !== null) {
      const game = object(object(old.room).game), deal = object(game.dealing);
      const usage = new Map<string, Set<string>>();
      const issued = [...pairs(deal.assignments, 12), ...(game.search ? pairs(object(game.search).roster, 12) : [])];
      for (const [, item] of issued) { const card = object(object(item).card), key = `${card.role}:${card.difficulty}`; const seen = usage.get(key) ?? new Set<string>(); seen.add(card.id as string); usage.set(key, seen); }
      deal.usage ??= [...usage].map(([key, ids]) => [key, [...ids]]);
    }
  }
  requireValue(saved.schemaVersion === 5 || saved.schemaVersion === 6 || saved.schemaVersion === 7);
  const firstGame = saved.schemaVersion !== 5;
  const lobby = object(saved.lobby); requireValue(integer(lobby.revision));
  validateSavedCatalog(lobby.catalog);
  const codes = strings(lobby.usedCodes); requireValue(codes.every(v => /^[A-Z2-9]{6}$/.test(v)));
  if (lobby.room === null) return saved as unknown as SavedSession;
  const room = object(lobby.room); requireValue(text(room.id, 256) && codes.includes(room.code as string));
  const players = array(room.players, 12).map(v => object(v));
  requireValue(players.every(p => text(p.id, 256) && text(p.name, 256) && [...p.name].length <= 24 && !/\p{Cc}/u.test(p.name) && /^[a-f0-9]{64}$/.test(p.key as string)));
  requireValue(players.every(p => p.name === (p.name as string).normalize('NFKC').trim().replace(/\s+/gu, ' ')));
  const ids = players.map(p => p.id as string), keys = players.map(p => p.key as string);
  requireValue(new Set(ids).size === ids.length && new Set(keys).size === keys.length && new Set(players.map(p => (p.name as string).toLocaleLowerCase('ru-RU'))).size === players.length);
  const revoked = strings(room.revoked); requireValue(revoked.every(k => /^[a-f0-9]{64}$/.test(k) && !keys.includes(k)));
  for (const [principal, requests] of pairs(room.requests, 13)) {
    requireValue(principal === 'organizer' || ids.some(id => principal === `player:${id}`));
    for (const [id, hash] of pairs(requests, 1024)) requireValue(/^[a-zA-Z0-9_-]{8,80}$/.test(id) && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash));
  }
  const game = object(room.game);
  if (game.playerNames !== undefined) for (const [, name] of pairs(game.playerNames, 12)) requireValue(text(name, 256));
  const venue = object(game.venue); requireValue(text(venue.base, 64));
  requireValue(array(venue.zones, 12).every(z => text(z, 64)));
  requireValue(new Set([venue.base, ...venue.zones as string[]].map(v => (v as string).trim().toLocaleLowerCase('ru'))).size === (venue.zones as string[]).length + 1);
  const zones = venue.zones as string[];
  if (firstGame) {
    const state = object(game.firstGame);
    const { members } = validateRetained(state.retained);
    requireValue(venue.mode === undefined || venue.mode === 'first' || saved.schemaVersion === 7 && venue.mode === 'ordinary');
    requireValue(venue.bank === undefined || venue.bank === 'local' || venue.bank === 'authored');
    requireValue(venue.horror === undefined || typeof venue.horror === 'boolean');
    requireValue(venue.comedy === undefined || typeof venue.comedy === 'boolean');
    if (venue.sets !== undefined) requireValue(strings(venue.sets, cardSets.length).every(set => (cardSets as readonly string[]).includes(set)));
    if (venue.features !== undefined) requireValue(strings(venue.features, venueFeatures.length).every(feature => (venueFeatures as readonly string[]).includes(feature)));
    requireValue(venue.prologueRead === undefined || typeof venue.prologueRead === 'boolean');
    if (state.locations !== undefined) for (const [id, location] of pairs(state.locations, 12)) {
      const row = object(location);
      requireValue(text(id, 256) && (row.proposed !== undefined || row.confirmed !== undefined) &&
        (row.proposed === undefined || zones.includes(row.proposed as string)) && (row.confirmed === undefined || zones.includes(row.confirmed as string)));
    }
    if (state.violations !== undefined) {
      const violations = array(state.violations, 200).map(object);
      requireValue(new Set(violations.map(row => row.id)).size === violations.length && violations.every(row => text(row.id, 256) && text(row.reporterId, 256) &&
        text(row.details, 500) && (row.slot === 'A' || row.slot === 'B') && ['review', 'applied', 'rejected', 'dismissed', 'reversed'].includes(row.status as string)));
    }
    if (state.trials !== undefined) {
      requireValue(venue.mode === 'ordinary' && state.locked);
      validateTrials(state.trials);
    } else requireValue(venue.mode !== 'ordinary' || !state.locked);
    requireValue(typeof state.locked === 'boolean' && (!game.started || state.locked) && [...members].every(id => ids.includes(id)));
    if (state.unassigned !== undefined) for (const [id, value] of pairs(state.unassigned, 12)) {
      requireValue(ids.includes(id) && !members.has(id) && assignment(value).card.role === 'exorcist');
    }
    if (state.recallWait !== undefined) {
      const wait = object(state.recallWait);
      requireValue(['return', 'between_rounds'].includes(game.phase as string) && strings(wait.players, 12).length > 0 &&
        duration(wait.remainingMs) && wait.remainingMs <= 3600000);
    }
    requireValue(strings(state.waitingFree, 12).every(id => ids.includes(id) && !members.has(id)));
    if (state.story !== undefined) {
      const story = object(state.story); requireValue(text(story.title, 120) && text(story.prologue, 4000));
    }
    for (const [id, status] of pairs(state.presence, 12)) requireValue(ids.includes(id) && (status === 'at_base' || status === 'in_group'));
    if (venue.order !== undefined) requireValue(strings(venue.order, 12).every(id => ids.includes(id)));
    if (state.locked) {
      const dwelling = object(venue.dwelling);
      requireValue(state.story && zones.includes(dwelling.zone as string) && text(dwelling.place, 64) && text(venue.storyId, 40) && typeof venue.harder === 'boolean');
    }
  } else requireValue(game.firstGame === undefined);
  if (game.roundSync !== null) {
    if (firstGame) validateSearchBase(object(object(game.roundSync).base), zones);
    validateRoundSync(game.roundSync, game.roundId);
    const rebuilt = createRoundSync(game.roundSync, () => 'validation-only').current().exportState();
    const actual = object(game.search);
    requireValue(JSON.stringify(rebuilt.roster) === JSON.stringify(actual.roster) && JSON.stringify(rebuilt.events) === JSON.stringify(actual.events) && rebuilt.finalized === actual.finalized && JSON.stringify(rebuilt.retained) === JSON.stringify(actual.retained) && JSON.stringify(rebuilt.locations) === JSON.stringify(actual.locations) && JSON.stringify(rebuilt.unassigned) === JSON.stringify(actual.unassigned));
  }
  const deal = object(game.dealing);
  for (const [key, ids] of pairs(deal.usage, 6)) { requireValue(/^(possessed|exorcist):[123]$/.test(key)); strings(ids); }
  requireValue(typeof game.tutorialCompleted === 'boolean' && integer(game.progressionRounds) && game.progressionRounds >= 1 && validDifficulty(deal.difficulty));
  const plan = game.roundPlan === null ? null : validatePlan(game.roundPlan);
  if (plan) requireValue(plan.difficulty === deal.difficulty);
  requireValue(!['reading', 'placement', 'search', 'return'].includes(game.phase as string) || plan !== null);
  requireValue(integer(game.version) && integer(game.completedRounds) && integer(deal.version) && validSettings(game.settings, Number.MAX_SAFE_INTEGER));
  requireValue(['lobby', 'reading', 'placement', 'search', 'return', 'between_rounds', 'finished'].includes(game.phase as string));
  requireValue(['lobby', 'between_rounds'].includes(game.waitingPhase as string));
  requireValue(['started', 'paused', 'rosterChanged', 'lastRoundAborted'].every(k => typeof game[k] === 'boolean') && duration(game.activeMs));
  requireValue(game.pauseReason === null || ['organizer', 'organizer_disconnected', 'participant_left', 'clock_gap', 'server_restarted', 'storage_error'].includes(game.pauseReason as string));
  requireValue(nullableText(game.roundId) && nullableText(deal.dealId) && (deal.initialPossessedCount === null || integer(deal.initialPossessedCount) && deal.initialPossessedCount >= (firstGame ? 0 : 1) && deal.initialPossessedCount <= 6));
  const assignments = pairs(deal.assignments, 12).map(([id, a]) => { requireValue(ids.includes(id)); return [id, assignment(a)] as const; });
  requireValue(new Set(assignments.map(([, a]) => a.id)).size === assignments.length && new Set(assignments.map(([, a]) => a.card.id)).size === assignments.length);
  requireValue(deal.dealId !== null || assignments.length === 0);
  requireValue(assignments.every(([, a]) => a.card.difficulty <= (deal.difficulty as number)));
  if (game.phase === 'reading') requireValue(deal.dealId !== null && game.roundId === null);
  if (game.phase === 'lobby') requireValue(deal.dealId === null && game.roundId === null && !game.started);
  const settings = object(game.settings);
  if (firstGame) requireValue(settings.ritualEnabled === true && settings.roundLimit === 7 && settings.tutorialEnabled === false &&
    settings.infectionMode === 'on' && settings.initialDifficulty === 3 && settings.maximumDifficulty === 3);
  if (plan?.kind === 'tutorial') requireValue(settings.tutorialEnabled === true);
  requireValue(deal.dealId !== null || plan === null);
  if (plan && (game.phase === 'reading' || isTimedPhase(game.phase as Parameters<typeof isTimedPhase>[0])))
    requireValue(plan.number === (plan.kind === 'tutorial' ? 0 : Number(game.completedRounds) + 1));
  const active = strings(game.activePlayerIds, 12);
  const original = strings(game.originalPossessed, 12); requireValue(original.every(id => ids.includes(id)));
  for (const [id, count] of pairs(game.history, 12)) requireValue(ids.includes(id) && integer(count) && count <= game.completedRounds);
  const timed = isTimedPhase(game.phase as Parameters<typeof isTimedPhase>[0]) && (!firstGame || game.phase !== 'return');
  requireValue(!timed || active.every(id => ids.includes(id)));
  requireValue(timed ? duration(game.remainingMs) && game.remainingMs <= 3600000 && text(game.roundId, 256) && game.started : game.remainingMs === null && game.paused === false && game.pauseReason === null);
  requireValue(!timed || (game.paused ? game.pauseReason !== null : game.pauseReason === null));
  const results = array(game.results).map(v => object(v));
  requireValue(new Set(results.map(r => r.roundId)).size === results.length);
  for (const r of results) {
    validatePlan(r, true);
    requireValue(text(r.roundId, 256) && integer(r.number) && ['provisional', 'final', 'aborted'].includes(r.status as string) && duration(r.activeMs));
    requireValue(['rescuedGroups', 'totalGroups', 'missions', 'totalMissions', 'infectedPlayers'].every(k => integer(r[k]) && r[k] <= 12));
    requireValue(r.lossReason === undefined || firstGame && r.lossReason === 'no_return' && r.status === 'final');
    requireValue(r.trialBonus === undefined || venue.mode === 'ordinary' && (r.trialBonus === 0 || r.trialBonus === 1));
    requireValue((r.rescuedGroups as number) <= (r.totalGroups as number) && (r.missions as number) <= (r.totalMissions as number));
  }
  requireValue(results.filter(r => r.kind === 'regular' && r.status !== 'aborted').length === game.completedRounds && results.filter(r => r.status === 'provisional').length <= 1);
  const tutorials = results.filter(r => r.kind === 'tutorial' && r.status !== 'aborted');
  requireValue(tutorials.length <= 1 && game.tutorialCompleted === (tutorials.length === 1));
  if (game.search === null) requireValue(!timed);
  else {
    const search = object(game.search); requireValue(search.roundId === game.roundId && integer(search.version) && typeof search.finalized === 'boolean');
    const roster = pairs(search.roster, 12).map(([id, a]) => [id, assignment(a)] as const);
    requireValue(roster.length >= (firstGame ? 1 : 4) && new Set(roster.map(([, a]) => a.id)).size === roster.length && (firstGame || new Set(roster.map(([, a]) => a.card.id)).size === roster.length));
    const rosterIds = roster.map(([id]) => id), groups = firstGame ? validateSearchBase(search, zones) : roster.filter(([, a]) => a.card.role === 'possessed').map(([id]) => id);
    requireValue(firstGame || groups.length >= 1 && groups.length <= Math.floor(roster.length / 2));
    requireValue(active.every(id => rosterIds.includes(id)) && original.every(id => firstGame ? roster.some(([playerId, a]) => playerId === id && a.card.role === 'possessed') : groups.includes(id)));
    const events = array(search.events).map(v => object(v)); requireValue(new Set(events.map(e => e.id)).size === events.length);
    for (const e of events) {
      const a = object(e.action); requireValue(text(e.id, 256) && typeof e.undone === 'boolean' && rosterIds.includes(a.actor as string));
      const touches = strings(e.touches, 25); requireValue(touches.every(t => t.startsWith('p:') ? rosterIds.includes(t.slice(2)) : t.startsWith('g:') && groups.includes(t.slice(2))));
      requireValue(touches.includes(`p:${a.actor}`));
      if (a.kind === 'infect') requireValue(plan?.infectionEnabled === true && rosterIds.includes(a.target as string) && a.target !== a.actor && groups.includes(a.group as string) && touches.includes(`p:${a.target}`) && touches.includes(`g:${a.group}`));
      else if (a.kind === 'release') {
        requireValue(groups.includes(a.group as string) && touches.includes(`g:${a.group}`));
        if (a.targetIds !== undefined) requireValue(firstGame && validReleaseTargets(a.targetIds) && a.targetIds.every(id => rosterIds.includes(id)));
      }
      else if (a.kind === 'presence_correction') requireValue(firstGame && !e.undone &&
        ['infected', 'released', 'assign'].includes(a.correction as string) &&
        (a.group === undefined || groups.includes(a.group as string)) &&
        (a.correction === 'assign' ? rosterIds.includes(a.groupMemberId as string) && groups.includes(a.group as string) : a.groupMemberId === undefined));
      else if (a.kind === 'mission') requireValue(typeof a.completed === 'boolean');
      else requireValue(a.kind === 'depart' && !e.undone);
    }
    // Reconstruct effective actions through the real rule boundary, including dependency keys.
    const typed = game.search as SavedSearch;
    let eventId = '';
    const replay = createSearch(typed.roundId, new Map(typed.roster), () => eventId, typed.retained, typed.unassigned);
    if (firstGame) replay.restore({ ...typed, events: [], version: 0, finalized: false }, false);
    let effective = 0;
    for (const e of typed.events) {
      if (e.undone) continue;
      eventId = e.id; const a = e.action;
      if (a.kind === 'depart') replay.depart(a.actor);
      else if (a.kind === 'presence_correction') requireValue(replay.reconcile(a.actor, a.correction, a.groupMemberId) === undefined);
      else if (a.kind === 'release' && a.targetIds) requireValue(replay.releaseSelected(a.actor, a.targetIds) === undefined);
      else requireValue(replay.act(a.actor, a.kind, a.kind === 'infect' ? a.target : undefined, a.kind === 'mission' ? a.completed : undefined) === undefined);
      const generated = replay.exportState().events;
      requireValue(generated.length === ++effective && generated.at(-1)!.id === e.id && JSON.stringify(generated.at(-1)!.touches.sort()) === JSON.stringify([...e.touches].sort()));
    }
    requireValue(typed.version >= typed.events.length);
    if (timed) requireValue(!typed.finalized && assignments.every(([id, a]) => (active.includes(id) || typed.events.some(e => !e.undone && e.action.kind === 'depart' && e.action.actor === id)) && roster.some(([originalId, original]) => id === originalId && JSON.stringify(a.card) === JSON.stringify(original.card) && a.id === original.id)));
    const current = results.find(r => r.roundId === typed.roundId);
    if (current) {
      requireValue(plan !== null && ['kind', 'number', 'difficulty', 'infectionEnabled'].every(key => key === 'infectionEnabled' && current[key] === null || current[key] === plan[key]));
      requireValue(!timed && typed.finalized === (current.status !== 'provisional'));
      const derived = replay.result(current.number as number, current.status as 'provisional' | 'final' | 'aborted', game.activeMs as number);
      for (const key of ['rescuedGroups', 'totalGroups', 'missions', 'totalMissions', 'infectedPlayers', 'activeMs'] as const) requireValue(current[key] === derived[key]);
    }
  }
  requireValue(game.freeplayFrom === null || integer(game.freeplayFrom) && game.freeplayFrom <= results.length && settings.roundLimit === null && settings.ritualEnabled === false);
  if (game.ritual !== null) {
    validateRitual(game.ritual);
    const ritual = game.ritual;
    requireValue(Boolean(ritual.firstGame) === firstGame);
    const projection = createRitual(ritual, () => 'validation').snapshot();
    requireValue(ritual.roundLimit === game.progressionRounds);
    const expected = results.slice(0, game.freeplayFrom === null ? results.length : game.freeplayFrom as number).filter(r => r.kind === 'regular' && r.status === 'final');
    const noReturn = results.filter(r => r.lossReason === 'no_return');
    requireValue(noReturn.length === (projection.outcome === 'no_return' ? 1 : 0) &&
      (!noReturn.length || noReturn[0] === results.at(-1) && game.phase === 'finished'));
    const applied = ritual.events.filter(e => e.kind === 'round');
    requireValue(applied.length === expected.length && applied.every((e, i) => e.id === expected[i].roundId && e.number === expected[i].number && e.successes === Number(expected[i].rescuedGroups) + Number(expected[i].missions) + Number(expected[i].trialBonus ?? 0)));
    const initial = results.find(r => r.kind === 'regular' && r.status !== 'aborted');
    if (initial) requireValue(ritual.players === Number(initial.totalGroups) + Number(initial.totalMissions));
    requireValue(projection.outcome === 'playing' ? settings.ritualEnabled === true && game.freeplayFrom === null && game.phase !== 'finished'
      : game.freeplayFrom !== null || game.phase === 'finished' && settings.ritualEnabled === true);
  } else {
    requireValue(game.freeplayFrom === null);
    requireValue(!settings.ritualEnabled || !results.some(r => r.kind === 'regular') && !(timed && plan?.kind === 'regular'));
  }
  return saved as unknown as SavedSession;
}
