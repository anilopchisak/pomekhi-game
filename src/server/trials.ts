import { trialTraits } from '../shared/protocol.js';
import type { LateVisitStatus, TrialReviewFact, TrialTrait, GamePhase, LobbyError, PersonalPlay, PersonalTrial, TrialField, TrialReview, TrialValue, Venue } from '../shared/protocol.js';
import { authoredTrials } from './authored-content.js';
import { shortAnswer } from './short-cards.js';
import type { TrialCard } from './authored-content.js';

type Values = Record<string, TrialValue>;
type Participant = { id: string; name: string; play: PersonalPlay | null; returned: boolean };
type Report = { playerId: string; values: Values; accepted: boolean };
export interface TrialRound {
  actor: string | null; eligibleTargets: string[]; branch: 'early' | 'late' | null;
  reports: Report[]; replied: boolean; earlyReturn: boolean;
  lateVisit?: LateVisitStatus;
  equivalence?: [string, TrialTrait[]][];
}
export interface SavedTrials { deck: TrialCard[]; current?: TrialRound }

const b = (id: string, label: string): TrialField => ({ id, label, type: 'boolean' });
const t = (id: string, label: string): TrialField => ({ id, label, type: 'text' });
const target = (id = 'target', label = 'Участник встречи'): TrialField => ({ id, label, type: 'player' });
const z = (id: string, label: string): TrialField => ({ id, label, type: 'zone' });
const separate = b('separate', 'Встречи были отдельными: между ними вы шли порознь?');
const did = (label: string) => b('did', label);
const firstTarget = target('target', 'Первый участник');
const secondTarget = target('other', 'Второй участник');
const descriptions = [t('height', 'Рост'), t('clothes', 'Одежда'), t('motion', 'Движение')];
const specs: Record<string, { actor: TrialField[]; witness: TrialField[] }> = {
  T001: { actor: [target(), did('Направили тусклый экран на одержимого по инструкции?')], witness: [did('Эта встреча и освещение действительно состоялись?')] },
  T002: { actor: [firstTarget, secondTarget, b('first', 'Разыграли сцену при первой встрече?'), b('second', 'Разыграли сцену при второй встрече?')], witness: [did('Вы испытали испуг во время этой сцены?')] },
  T003: { actor: [did('Обращались к Мастеру внутри роли до призыва?')], witness: [] },
  T004: { actor: [b('visit', 'Первый визит: произнесли вымышленное имя у Обители?'), b('returned', 'Вернулись к столу и произнесли имя до общего призыва?'), b('repeat', 'После ответа Мастера снова посетили Обитель и попрощались?')], witness: [] },
  T005: { actor: [z('zone', 'Первая локация'), z('otherZone', 'Вторая локация'), firstTarget, secondTarget, t('answer', 'Первый ответ: слово или жест'), t('otherAnswer', 'Второй ответ: слово или жест')], witness: [did('Вы сами ответили словом или намеренным жестом?')] },
  T006: { actor: [z('zone', 'Локация встречи'), target(), did('Выполнили обе части игрового жеста?')], witness: [b('noticed', 'Заметили оба движения?'), b('speech', 'Из-за жеста прервали игровую речь?'), b('motion', 'Из-за жеста прервали движение?'), b('breath', 'Оба действия прервались вместе на один спокойный выдох?')] },
  T007: { actor: [target(), did('Завершили встречу: посмотрели в пустое место, затем в лицо и произнесли реплику?')], witness: [b('noticed', 'Заметили взгляд и услышали реплику?'), b('look', 'Посмотрели на указанное пустое место?'), b('back', 'Затем снова посмотрели в лицо собеседнику?')] },
  T008: { actor: [target(), t('name', 'Вымышленное имя')], witness: [t('name', 'Какое имя вы запомнили?'), t('saidName', 'Если сами обратились по имени до вопроса, каким именем?')] },
  T009: { actor: [target(), separate, did('Собеседник показал оба движения на встрече?'), b('first', 'На второй встрече собеседник показал их первым?')], witness: [separate, did('Намеренно повторили оба движения?'), b('first', 'На второй встрече показали знак до показа посланником?')] },
  T010: { actor: [firstTarget, secondTarget, ...descriptions], witness: descriptions },
  T011: { actor: [target(), did('Полностью повторили наблюдение и попробовали освобождение без полного подражания?'), b('released', 'Вы лично освободили эту группу?')], witness: [did('Посланник полностью повторил молчаливое наблюдение и не подражал всему поведению?'), b('released', 'Условие освобождения выполнил именно посланник?'), b('captured', 'Посланник был заражён в этой попытке?')] },
};

export function eligibleTrials(venue: Venue) {
  return authoredTrials.filter(card => (!card.harder || venue.harder) &&
    (card.id !== 'T001' || venue.features?.includes('dimLight')) &&
    (card.id !== 'T002' || venue.features?.includes('scary')) &&
    (card.id !== 'T005' || venue.zones.length >= 2));
}

export function selectTrials(venue: Venue, randomIndex: (limit: number) => number): SavedTrials | undefined {
  const eligible = eligibleTrials(venue);
  if (eligible.length < 7) return;
  return { deck: Array.from({ length: 7 }, () => {
    const [card] = eligible.splice(randomIndex(eligible.length), 1);
    return { ...card, instruction: shortAnswer(card.id) };
  }) };
}

function requiresPossessedTarget(card: TrialCard) {
  return card.id === 'T001' || card.id === 'T011';
}

export function beginTrial(card: TrialCard, players: Participant[], randomIndex: (limit: number) => number): TrialRound {
  const free = players.filter(player => player.play?.status === 'exorcist');
  const targets = players.filter(player => player.play && (!requiresPossessedTarget(card) || player.play.status === 'possessed')).map(player => player.id);
  const minimum = ['T002', 'T005', 'T010'].includes(card.id) ? 2 : specs[card.id].witness.length ? 1 : 0;
  const eligible = free.filter(player => targets.filter(id => id !== player.id).length >= minimum);
  return { actor: eligible.length ? eligible[randomIndex(eligible.length)].id : null, eligibleTargets: targets, branch: null, reports: [], replied: false, earlyReturn: false };
}

function accepted(round: TrialRound, playerId: string) {
  return round.reports.find(report => report.playerId === playerId && report.accepted)?.values;
}
const named = (values: Values | undefined) => values ? [values.target, values.other].filter((id): id is string => typeof id === 'string') : [];
const norm = (value: TrialValue | undefined) => typeof value === 'string' ? value.normalize('NFKC').trim().toLocaleLowerCase('ru') : '';
const same = (a: Values, w: Values | undefined, keys: string[]) => keys.every(key => norm(a[key]) && norm(a[key]) === norm(w?.[key]));

function remembered(round: TrialRound, original: Values, witnessId: TrialValue | undefined, answer: Values | undefined) {
  const equivalent = round.equivalence?.find(([id]) => id === witnessId)?.[1] ?? [];
  return trialTraits.every(trait => {
    const expected = norm(original[trait]), actual = norm(answer?.[trait]);
    return expected && actual && (expected === actual || equivalent.includes(trait));
  });
}

export function trialBonus(card: TrialCard, round: TrialRound, players: Participant[]): 0 | 1 {
  if (!round.actor || !round.branch) return 0;
  const actor = players.find(player => player.id === round.actor);
  const a = accepted(round, round.actor);
  if (!actor?.play || !a || named(a).some(id => !players.some(player => player.id === id && player.play))) return 0;
  if (requiresPossessedTarget(card) && (typeof a.target !== 'string' || !round.eligibleTargets.includes(a.target))) return 0;
  const first = typeof a.target === 'string' ? accepted(round, a.target) : undefined;
  const second = typeof a.other === 'string' ? accepted(round, a.other) : undefined;
  const late = round.branch === 'late';
  let success: boolean;
  switch (card.id) {
    case 'T001': success = a.did === true && first?.did === true && (late ? actor.play.wasCaptured : !actor.play.wasCaptured && actor.returned); break;
    case 'T002': {
      const hits = Number(a.first === true && first?.did === true) + Number(a.second === true && second?.did === true);
      success = hits >= (late ? 2 : 1); break;
    }
    case 'T003': success = late ? a.did === false : a.did === true && round.replied; break;
    case 'T004': success = late ? a.returned === false && !round.earlyReturn : a.visit === true && a.returned === true && (a.repeat === true || round.lateVisit === 'accepted') && round.earlyReturn; break;
    case 'T005': {
      const hits = Number(Boolean(a.answer) && first?.did === true) + Number(Boolean(a.otherAnswer) && second?.did === true);
      success = Boolean(a.zone && a.otherZone && a.zone !== a.otherZone) && hits >= (late ? 2 : 1); break;
    }
    case 'T006': success = a.did === true && Boolean(a.zone) && first?.noticed === true &&
      (late ? first.speech === true && first.motion === true && first.breath === true : first.speech === true || first.motion === true); break;
    case 'T007': success = a.did === true && first?.noticed === true &&
      (late ? first.look === true && first.back === true : first.look === false); break;
    case 'T008': success = late ? Boolean(norm(a.name) && norm(a.name) === norm(first?.saidName)) : same(a, first, ['name']); break;
    case 'T009': success = a.did === true && first?.did === true &&
      (!late || a.separate === true && first.separate === true && a.first === true && first.first === true); break;
    case 'T010': success = Number(remembered(round, a, a.target, first)) + Number(remembered(round, a, a.other, second)) >= (late ? 2 : 1); break;
    case 'T011': success = a.did === true && first?.did === true &&
      (late ? !actor.play.wasCaptured && a.released === true && first.released === true &&
        players.find(player => player.id === a.target)?.play?.status === 'released' : first.captured === false); break;
    default: success = false;
  }
  return success ? 1 : 0;
}

function fieldsFor(card: TrialCard, round: TrialRound, id: string, phase: GamePhase, players: Participant[], venue: Venue, report: Report | undefined) {
  const actor = id === round.actor;
  const fields = actor ? specs[card.id].actor : specs[card.id].witness;
  const live = phase === 'search';
  return fields.filter(field => {
    if (card.id === 'T010' && actor) return report ? field.type === 'player' : live && field.type === 'text';
    if (card.id !== 'T004' || !actor) return true;
    if (!live) return field.id === (round.earlyReturn ? 'repeat' : 'returned');
    if (!round.earlyReturn) return field.id !== 'repeat';
    return field.id === 'repeat';
  }).map(field => ({
    ...field,
    ...(actor && card.id === 'T004' && field.id === 'repeat' && !live ? {
      label: 'Повторно посетили Обитель и попрощались до общего призыва?', allowed: [true],
    } : {}),
    ...(actor && (card.id === 'T003' && field.id === 'did' || card.id === 'T004' && field.id === 'returned') ? { allowed: [live] } : {}),
    ...(field.type === 'player' ? { choices: players.filter(player =>
      player.id !== id && player.play && (requiresPossessedTarget(card) || round.eligibleTargets.includes(player.id))
    ).map(player => ({ id: player.id, label: player.name })) } : {}),
    ...(field.type === 'zone' ? { choices: venue.zones.map(zone => ({ id: zone, label: zone })) } : {}),
  }));
}

export function personalTrial(card: TrialCard, round: TrialRound, id: string, phase: GamePhase, players: Participant[], venue: Venue, paused: boolean, sealed: boolean): PersonalTrial | undefined {
  const isActor = id === round.actor;
  if (!round.actor || !isActor && !named(accepted(round, round.actor)).includes(id)) return;
  if (!isActor && phase === 'search' || !['search', 'return', 'between_rounds'].includes(phase)) return;
  const report = round.reports.find(entry => entry.playerId === id);
  const step = !isActor || (card.id === 'T004' || card.id === 'T010');
  const fields = fieldsFor(card, round, id, phase, players, venue, report);
  const lateVisit = isActor && card.id === 'T004' ? round.lateVisit : undefined;
  const canSubmit = !sealed && !paused && !lateVisit && fields.some(field => !report || step && !(field.id in report.values));
  const message = isActor && (card.id === 'T003' && round.replied ? 'Обращение принято. Разговор окончен.' :
    card.id === 'T004' && round.earlyReturn ? 'Верни зов на место.' :
    card.id === 'T010' && !report ? 'До встреч запишите три признака фигуры.' :
    card.id === 'T010' && canSubmit ? 'После двух встреч укажите, кому вы описали фигуру.' : undefined);
  return { title: isActor ? card.title : 'Свидетельство об испытании',
    instruction: isActor ? card.instruction : 'Сообщите, что вы сами наблюдали. Ответы других игроков скрыты.',
    reporter: isActor ? 'actor' : 'witness', fields, values: structuredClone(report?.values ?? {}), lateVisit, message: message || undefined, submitted: Boolean(report), canSubmit };
}

export function submitTrial(card: TrialCard, round: TrialRound, id: string, raw: unknown, phase: GamePhase, players: Participant[], venue: Venue, paused: boolean, sealed: boolean): LobbyError | undefined {
  const form = personalTrial(card, round, id, phase, players, venue, paused, sealed);
  if (!form?.canSubmit) return 'ACTION_UNAVAILABLE';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'INVALID_INPUT';
  const input = raw as Values, values: Values = {};
  if (!Object.keys(input).length || Object.keys(input).length > form.fields.length) return 'INVALID_INPUT';
  for (const [key, value] of Object.entries(input)) {
    const field = form.fields.find(item => item.id === key);
    if (!field || (field.type === 'boolean' ? typeof value !== 'boolean' || field.allowed && !field.allowed.includes(value) :
      typeof value !== 'string' || !value.trim() || value.length > 160 || /\p{Cc}/u.test(value) ||
      field.choices && !field.choices.some(choice => choice.id === value))) return 'INVALID_INPUT';
    values[key] = typeof value === 'string' ? value.trim() : value;
  }
  const existing = round.reports.find(report => report.playerId === id);
  if (existing && Object.keys(values).some(key => key in existing.values)) return 'ACTION_UNAVAILABLE';
  const next = { ...existing?.values, ...values };
  if (next.target && next.target === next.other || next.zone && next.zone === next.otherZone) return 'INVALID_INPUT';
  if (card.id === 'T010' && id === round.actor && form.fields.some(field => !(field.id in next))) return 'INVALID_INPUT';
  if (card.id === 'T004' && id === round.actor) {
    if (values.returned === true && (phase !== 'search' || next.visit !== true || players.find(player => player.id === id)?.play?.status !== 'exorcist')) return 'ACTION_UNAVAILABLE';
    if (values.repeat === true && !round.earlyReturn) return 'ACTION_UNAVAILABLE';
    if (phase !== 'search' && values.repeat === true) {
      round.lateVisit = 'review';
      return;
    }
    if (values.returned === true) round.earlyReturn = true;
  }
  if (card.id === 'T003' && (values.did === true && phase !== 'search' || values.did === false && phase === 'search')) return 'ACTION_UNAVAILABLE';
  if (card.id === 'T003' && values.did === true) round.replied = true;
  if (existing) existing.values = next;
  else round.reports.push({ playerId: id, accepted: true, values: next });
}

function traitComparisons(round: TrialRound): NonNullable<TrialReview['traitComparisons']> {
  if (!round.actor) return [];
  const original = accepted(round, round.actor);
  return named(original).flatMap(playerId => {
    const answer = accepted(round, playerId);
    return descriptions.flatMap(({ id, label }) => {
      const trait = id as TrialTrait;
      const expected = original?.[trait], actual = answer?.[trait];
      if (typeof expected !== 'string' || typeof actual !== 'string' || !norm(expected) || !norm(actual) || norm(expected) === norm(actual)) return [];
      const equivalent = round.equivalence?.find(([witness]) => witness === playerId)?.[1].includes(trait) ?? false;
      return [{ playerId, trait, label, original: expected, answer: actual, equivalent }];
    });
  });
}

export function reviewTrialEvidence(card: TrialCard, round: TrialRound, playerId: string, accept: boolean, fact?: TrialReviewFact): LobbyError | undefined {
  if (fact === 'repeat') {
    if (card.id !== 'T004' || round.actor !== playerId || round.lateVisit !== 'review') return 'ACTION_UNAVAILABLE';
    round.lateVisit = accept ? 'accepted' : 'rejected';
    return;
  }
  if (fact) {
    if (card.id !== 'T010' || !traitComparisons(round).some(row => row.playerId === playerId && row.trait === fact)) return 'ACTION_UNAVAILABLE';
    const decisions = new Map(round.equivalence);
    const traits = new Set(decisions.get(playerId));
    if (accept) traits.add(fact); else traits.delete(fact);
    if (traits.size) decisions.set(playerId, [...traits]); else decisions.delete(playerId);
    round.equivalence = [...decisions];
    return;
  }
  const report = round.reports.find(row => row.playerId === playerId);
  if (!report) return 'INVALID_INPUT';
  report.accepted = accept;
}

export function trialReview(card: TrialCard, round: TrialRound, players: Participant[], venue: Venue): TrialReview {
  const available = round.actor && players.some(player => player.id === round.actor && player.play);
  const a = round.actor ? accepted(round, round.actor) : undefined;
  const targets = named(a);
  const unavailable = !available || targets.some(id => !players.some(player => player.id === id && player.play));
  const witness = targets.length ? accepted(round, targets[0]) : undefined;
  const disagrees = (key: string) => typeof a?.[key] === 'boolean' && typeof witness?.[key] === 'boolean' && a[key] !== witness[key];
  const conflict = card.id === 'T001' && disagrees('did') || card.id === 'T009' && (disagrees('separate') || disagrees('first')) ||
    card.id === 'T011' && (disagrees('did') || disagrees('released'));
  return { status: unavailable ? 'unavailable' : conflict ? 'conflict' :
    !a || card.id === 'T010' && targets.length !== 2 || targets.some(id => !accepted(round, id)) ? 'waiting' : 'ready',
    ...(card.id === 'T004' && round.actor && round.lateVisit ? { lateVisit: { playerId: round.actor, status: round.lateVisit } } : {}),
    ...(card.id === 'T010' ? { traitComparisons: traitComparisons(round) } : {}),
    bonus: trialBonus(card, round, players),
    reports: round.reports.map(report => {
      const fields = report.playerId === round.actor ? specs[card.id].actor : specs[card.id].witness;
      return { playerId: report.playerId, accepted: report.accepted, facts: fields.filter(field => field.id in report.values).map(field => {
        const value = report.values[field.id];
        return { label: field.label, value: field.type === 'player' ? players.find(player => player.id === value)?.name ?? 'Ушедший участник' :
          field.type === 'zone' && !venue.zones.includes(String(value)) ? 'Неизвестная локация' : value };
      }) };
    }) };
}

export function validateTrials(raw: unknown): asserts raw is SavedTrials {
  const state = raw as SavedTrials;
  const ids = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= max &&
    new Set(value).size === value.length && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 256);
  const check = (ok: unknown) => { if (!ok) throw Error('Invalid Master trial checkpoint.'); };
  check(state && Array.isArray(state.deck) && state.deck.length === 7 && ids(state.deck.map(card => card?.id), 7));
  check(state.deck.every(card => authoredTrials.some(source => source.id === card.id) && typeof card.harder === 'boolean' &&
    typeof card.title === 'string' && card.title.length > 0 && card.title.length <= 120 &&
    typeof card.instruction === 'string' && card.instruction.length > 0 && card.instruction.length <= 4000));
  const r = state.current;
  if (r === undefined) return;
  check(r && (r.actor === null || ids([r.actor], 1)) && ids(r.eligibleTargets, 12) &&
    (r.branch === null || r.branch === 'early' || r.branch === 'late') && typeof r.replied === 'boolean' && typeof r.earlyReturn === 'boolean' &&
    Array.isArray(r.reports) && ids(r.reports.map(report => report?.playerId), 12));
  if (r.lateVisit !== undefined) {
    const actor = r.reports.find(report => report.playerId === r.actor);
    check(r.earlyReturn && actor?.values.visit === true && actor.values.returned === true &&
      ['review', 'accepted', 'rejected'].includes(r.lateVisit));
  }
  if (r.equivalence !== undefined) {
    check(Array.isArray(r.equivalence) && r.equivalence.length <= 2 &&
      r.equivalence.every(pair => Array.isArray(pair) && pair.length === 2 && ids(pair[1], 3) &&
        pair[1].every(trait => trialTraits.includes(trait)) && r.reports.some(report => report.playerId === pair[0] && pair[0] !== r.actor)) &&
      ids(r.equivalence.map(([id]) => id), 2));
  }
  for (const report of r.reports) {
    check(typeof report.accepted === 'boolean' && report.values && typeof report.values === 'object' && !Array.isArray(report.values));
    const fields = Object.entries(report.values);
    check(fields.length > 0 && fields.length <= 10 && fields.every(([key, value]) => /^[a-zA-Z]{1,12}$/.test(key) &&
      (typeof value === 'boolean' || typeof value === 'string' && value.length > 0 && value.length <= 160 && !/\p{Cc}/u.test(value))));
  }
}
