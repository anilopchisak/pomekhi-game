// @vitest-environment happy-dom
import { audioHarness } from '../helpers/audio.mjs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlayerPage } from '../../src/client/pages/player/index.js';
import { HostPage } from '../../src/client/pages/host/index.js';
import { savePlayerSession } from '../../src/client/pages/player/session.js';
import { createLobby } from '../../src/server/lobby.js';
import { controlledClock } from '../helpers/game-clock.js';

const { io } = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io }));
let root, container, lobby, room, phoneId, saved, sequence, clock;
const clients = new Map();
const value = reply => { if (!reply.ok) throw new Error(reply.error); return reply.view; };
function base() {
  const room = lobby.viewFor('host').room;
  return { roomId: room.id, dealVersion: room.dealing.version, dealId: room.dealing.dealId, requestId: `test-request-${++sequence}` };
}
function publish(cue) {
  for (const [id, socket] of clients) if (socket.connected) {
    const view = lobby.viewFor(id);
    if (view) socket.listeners.get('lobby:state')?.(view);
    if (cue && view?.kind === 'organizer' && view.audioEnabled) socket.listeners.get('game:cue')?.(cue);
  }
}
function socket(id, dropCommand) {
  let dropped = false;
  const client = {
    listeners: new Map(), connected: false,
    on(event, listener) { this.listeners.set(event, listener); return this; },
    connect() { this.connected = true; this.listeners.get('connect')(); },
    disconnect() { this.connected = false; lobby.disconnect(id); this.listeners.get('disconnect')?.(); },
    removeAllListeners() { this.listeners.clear(); },
    timeout() { return this; }, get volatile() { return this; },
    emit(command, input, acknowledge) {
      const reply = command === 'catalog:command' ? lobby.catalogExecute(id, input) : lobby.execute(id, command, input);
      if (!dropped && command === dropCommand) { dropped = true; acknowledge(new Error('Acknowledgement lost')); }
      else acknowledge(null, reply);
      publish();
    },
  };
  clients.set(id, client); return client;
}
function button(name) {
  const found = [...container.querySelectorAll('button')].find(button => button.textContent === name);
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}
async function click(name) { await act(async () => button(name).click()); }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  globalThis.window.confirm = vi.fn().mockReturnValue(true);
  globalThis.localStorage.clear(); globalThis.sessionStorage.clear();
  globalThis.history.replaceState(null, '', '/?room=ABCDEF');
  sequence = 0;
  clock = controlledClock();
  lobby = createLobby({ organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF', clock: clock.clock });
  lobby.subscribe(publish);
  value(lobby.execute('host', 'organizer:authorize', { code: 'HOST' }));
  room = value(lobby.execute('host', 'room:create', {})).room;
  for (let i = 0; i < 7; i++) {
    const session = { roomCode: room.code, name: `Player ${i}`, resumeKey: String(i + 1).repeat(64), pending: false };
    const view = value(lobby.execute(`p${i}`, 'player:join', session));
    if (i === 0) { saved = session; phoneId = view.playerId; }
    lobby.disconnect(`p${i}`);
  }
  value(lobby.execute('host', 'game:configure', { ...gameBase(), settings: { ...lobby.viewFor('host').room.game.settings, ritualEnabled: false, roundLimit: 5, infectionMode: 'auto', tutorialEnabled: false } }));
  value(lobby.execute('host', 'deal:create', { ...base(), possessedCount: 3 }));
  savePlayerSession(saved);
  container = globalThis.document.createElement('div'); globalThis.document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); lobby.dispose(); container.remove(); clients.clear();
  globalThis.localStorage.clear(); globalThis.sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks();
});

it('conceals restored cards, preserves readiness while hidden and remounts closed', async () => {
  io.mockReturnValue(socket('phone'));
  await act(async () => root.render(createElement(PlayerPage)));
  const original = lobby.viewFor('phone').assignment;
  expect(container.textContent).not.toContain(original.card.title);
  await click('Открыть карточку'); expect(container.textContent).toContain(original.card.title);
  await click('Я прочитал карточку'); expect(lobby.viewFor('phone').assignment.ready).toBe(true);
  await click('Скрыть карточку'); expect(container.textContent).not.toContain(original.card.title);
  expect(lobby.viewFor('phone').assignment.ready).toBe(true);
  await act(async () => root.unmount()); root = createRoot(container); io.mockReturnValue(socket('refreshed'));
  await act(async () => root.render(createElement(PlayerPage)));
  expect(container.textContent).not.toContain(original.card.title);
  expect(button('Я пока не готов')).toBeDefined();
  expect(lobby.viewFor('refreshed').assignment.id).toBe(original.id);
  expect(JSON.parse(globalThis.localStorage.getItem('pomekhi.player'))).toEqual(saved);
});

it('requests replacement, closes the changed card and keeps other participants intact', async () => {
  io.mockReturnValue(socket('phone')); await act(async () => root.render(createElement(PlayerPage)));
  await click('Открыть карточку'); await click('Я прочитал карточку');
  await click('Попросить замену карточки');
  const before = lobby.viewFor('phone'); expect(before.assignment).toMatchObject({ ready: false, replacementRequested: true });
  expect(button('Я прочитал карточку').disabled).toBe(true);
  await click('Отменить запрос замены'); expect(button('Я прочитал карточку').disabled).toBe(false);
  expect(lobby.viewFor('phone').assignment.ready).toBe(false);
  await act(async () => {
    value(lobby.execute('host', 'deal:replace', { ...base(), playerId: phoneId, assignmentId: before.assignment.id })); publish();
  });
  expect(button('Открыть карточку')).toBeDefined();
  expect(container.textContent).not.toContain(lobby.viewFor('phone').assignment.card.title);
  const preserved = lobby.viewFor('phone').assignment;
  await act(async () => {
    value(lobby.execute('late', 'player:join', { roomCode: room.code, name: 'Late', resumeKey: 'a'.repeat(64) })); publish();
  });
  expect(lobby.viewFor('phone').assignment).toEqual(preserved);
  await act(async () => { value(lobby.execute('host', 'deal:shuffle', { ...base(), possessedCount: 3 })); publish(); });
  expect(button('Открыть карточку')).toBeDefined();
  await act(async () => { value(lobby.execute('host', 'deal:cancel', base())); publish(); });
  expect(container.querySelector('[aria-label="Личная карточка"]')).toBeNull();
});

it('manually retries a lost ready acknowledgement without overwriting a newer choice', async () => {
  io.mockReturnValue(socket('phone', 'card:ready')); await act(async () => root.render(createElement(PlayerPage)));
  await click('Я прочитал карточку'); expect(button('Повторить действие')).toBeDefined();
  const assignment = lobby.viewFor('phone').assignment;
  await act(async () => {
    value(lobby.execute('phone', 'card:ready', { ...base(), assignmentId: assignment.id, ready: false })); publish();
  });
  await click('Повторить действие');
  expect(lobby.viewFor('phone').assignment.ready).toBe(false);
  expect(button('Я прочитал карточку')).toBeDefined();
});

it('shows the request limit without changing readiness', async () => {
  io.mockReturnValue(socket('phone')); await act(async () => root.render(createElement(PlayerPage)));
  const assignmentId = lobby.viewFor('phone').assignment.id;
  for (let i = 0; i < 1024; i++) {
    expect(lobby.execute('phone', 'card:ready', { ...base(), assignmentId, ready: false }).ok).toBe(true);
  }
  await click('Я прочитал карточку');
  expect(container.querySelector('[role="alert"]').textContent).toBe('Слишком много действий в этой комнате. Попросите организатора открыть новую комнату.');
  expect(lobby.viewFor('phone').assignment.ready).toBe(false);
});

it('organizer controls do not render private content and retries one replacement only', async () => {
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST');
  io.mockReturnValue(socket('panel', 'deal:replace')); await act(async () => root.render(createElement(HostPage)));
  const original = value(lobby.execute('player-check', 'player:resume', saved)).assignment;
  expect(container.textContent).not.toContain(original.card.title);
  const replace = container.querySelector('[aria-label="Заменить карточку Player 0"]');
  await act(async () => replace.click());
  const replaced = lobby.viewFor('player-check').assignment;
  expect(replaced.id).not.toBe(original.id);
  await click('Повторить действие'); expect(lobby.viewFor('player-check').assignment).toEqual(replaced);
  expect(container.textContent).not.toContain(replaced.card.title);
  expect(container.querySelector('input[type="number"]').value).toBe('3');
});

function gameBase() {
  const room = lobby.viewFor('host').room;
  return { roomId: room.id, gameVersion: room.game.version, roundId: room.game.roundId, requestId: `round-request-${++sequence}` };
}

it('closes the roster shuffle confirmation so the organizer can retry a lost acknowledgement', async () => {
  lobby.dispose();
  lobby = createLobby({ firstGame: true, organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF', clock: clock.clock });
  lobby.subscribe(publish);
  value(lobby.execute('host', 'organizer:authorize', { code: 'HOST' }));
  const { code } = value(lobby.execute('host', 'room:create', {})).room;
  for (let i = 0; i < 5; i++) {
    value(lobby.execute(`phone-${i}`, 'player:join', { roomCode: code, name: `Player ${i}`, resumeKey: String(i).repeat(64) }));
  }
  value(lobby.execute('host', 'venue:configure', { ...gameBase(), venue: {
    base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' },
    order: lobby.viewFor('host').room.players.map(player => player.id),
  } }));
  const original = value(lobby.execute('host', 'deal:create', { ...base(), possessedCount: 2 })).room.dealing.dealId;
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST');
  io.mockReturnValue(socket('panel', 'deal:shuffle'));
  await act(async () => root.render(createElement(HostPage)));

  const shuffle = container.querySelector('section[aria-label="Участники за столом"] button[aria-label="Перевыдать карточки"]');
  expect(container.textContent).not.toContain('Проверить готовность');
  expect(container.textContent).not.toContain('Исходные роли открыты');
  await act(async () => shuffle.click());
  const confirmation = container.querySelector('dialog[open]');
  await act(async () => [...confirmation.querySelectorAll('button')].find(button => button.textContent === 'Перевыдать карточки').click());

  const shuffled = lobby.viewFor('host').room.dealing.dealId;
  expect(shuffled).not.toBe(original);
  expect(container.querySelector('dialog[open]')).toBeNull();
  expect(globalThis.document.activeElement).toBe(container.querySelector('[data-scene-heading]'));
  expect(container.querySelector('[role="alert"]').textContent).toContain('Ответ задерживается');
  await click('Повторить действие');
  expect(lobby.viewFor('host').room.dealing.dealId).toBe(shuffled);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it('lets the organizer reverse an accepted correction after all journals are confirmed', async () => {
  lobby.dispose();
  lobby = createLobby({ firstGame: true, organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF', randomIndex: () => 0, clock: clock.clock });
  lobby.subscribe(publish);
  value(lobby.execute('host', 'organizer:authorize', { code: 'HOST' }));
  const { code } = value(lobby.execute('host', 'room:create', {})).room;
  const phones = Array.from({ length: 5 }, (_, i) => ({
    id: `phone-${i}`, credentials: { roomCode: code, resumeKey: String(i).repeat(64) },
  }));
  const players = phones.map(({ id, credentials }, i) =>
    value(lobby.execute(id, 'player:join', { ...credentials, name: `Player ${i}` })));
  value(lobby.execute('host', 'venue:configure', { ...gameBase(), venue: {
    base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' },
  } }));
  value(lobby.execute('host', 'deal:create', { ...base(), possessedCount: 0 }));
  value(lobby.execute('host', 'round:start', { ...gameBase(), confirmWarnings: true }));
  clock.advance(45000);
  const { id, credentials } = phones[0];
  value(lobby.execute(id, 'play:mission', { ...gameBase(), playVersion: lobby.viewFor(id).play.version, completed: true }));
  lobby.disconnect(id);
  value(lobby.execute('host', 'round:return', gameBase()));
  value(lobby.execute('host', 'round:return', gameBase()));
  value(lobby.execute('host', 'round:reconcile', { ...gameBase(), playerId: players[0].playerId, correction: 'infected' }));
  value(lobby.execute(id, 'player:resume', credentials));
  const { room: checked } = lobby.viewFor('host');
  for (const phone of phones) value(lobby.execute(phone.id, 'play:complete', {
    roomId: checked.id, roundId: checked.game.roundId, syncRevision: checked.game.synchronization.revision,
  }));
  expect(lobby.viewFor('host').room.game.results.at(-1).missions).toBe(0);

  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST');
  io.mockReturnValue(socket('panel'));
  await act(async () => root.render(createElement(HostPage)));
  await click('Показать все записи журнала');
  const correction = [...container.querySelectorAll('li')].find(item => item.textContent.includes('Отметка сверки · заражение'));
  await act(async () => correction.querySelector('button').click());
  await click('Отклонить запись');
  expect(lobby.viewFor('host').room.game.results.at(-1).missions).toBe(1);
});

it('shows a group as one release choice and keeps the exorcist’s corrections inside the dialog', async () => {
  lobby.dispose();
  lobby = createLobby({ firstGame: true, organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF', randomIndex: () => 0, clock: clock.clock });
  lobby.subscribe(publish);
  value(lobby.execute('host', 'organizer:authorize', { code: 'HOST' }));
  const { code } = value(lobby.execute('host', 'room:create', {})).room;
  const players = Array.from({ length: 7 }, (_, i) =>
    value(lobby.execute(`phone-${i}`, 'player:join', { roomCode: code, name: `Player ${i}`, resumeKey: String(i).repeat(64) })));
  value(lobby.execute('host', 'venue:configure', { ...gameBase(), venue: {
    base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' }, order: players.map(player => player.playerId),
  } }));
  value(lobby.execute('host', 'deal:create', { ...base(), possessedCount: 0 }));
  value(lobby.execute('host', 'round:start', { ...gameBase(), confirmWarnings: true }));
  clock.advance(45000);
  value(lobby.execute('phone-1', 'play:infect', { ...gameBase(), playVersion: lobby.viewFor('phone-1').play.version, targetId: players[0].playerId }));
  savePlayerSession({ roomCode: code, name: 'Player 2', resumeKey: '2'.repeat(64), pending: false });
  io.mockReturnValue(socket('phone'));
  await act(async () => root.render(createElement(PlayerPage)));
  await click('Освободить');
  const dialog = container.querySelector('dialog[open]');
  const select = dialog.querySelector('select');
  expect([...select.options].map(option => option.textContent)).toEqual(['Выберите группу', 'Player 1, Player 0', 'Player 3', 'Player 5']);
  await act(async () => {
    select.selectedIndex = 1;
    select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  });
  await click('Подтвердить освобождение');
  expect(dialog.querySelector('li span').textContent.split(', ').sort()).toEqual(['Player 0', 'Player 1']);
  expect([...select.options].map(option => option.textContent)).toEqual(['Выберите группу', 'Player 3', 'Player 5']);
  expect(lobby.viewFor('phone-0').play.status).toBe('released');
  expect(lobby.viewFor('phone-4').play.releases).toEqual([]);
  expect(lobby.viewFor('phone-1').play.releaseGroups).toBeUndefined();
  expect(lobby.viewFor('host').room).not.toHaveProperty('releaseGroups');
  expect(container.textContent).not.toMatch(/Отменить моё последнее действие|Последнее действие:|Ждут отправки:/);

  await act(async () => value(lobby.execute('phone', 'play:mission', {
    ...gameBase(), playVersion: lobby.viewFor('phone').play.version, completed: true,
  })));
  expect(button('Отменить освобождение').disabled).toBe(true);
  await act(async () => dialog.querySelector('[aria-label="Закрыть окно"]').click());
  await click('Миссии');
  await click('Отменить последнюю отметку миссии');
  await click('Отменить отметку');
  expect(lobby.viewFor('phone').play.missionCompleted).toBe(false);
  await act(async () => container.querySelector('dialog[open] [aria-label="Закрыть окно"]').click());
  await click('Освободить');
  expect(button('Отменить освобождение').disabled).toBe(false);
  await click('Отменить освобождение');
  const confirm = [...container.querySelectorAll('dialog[open]')].at(-1);
  await act(async () => [...confirm.querySelectorAll('button')].find(item => item.textContent === 'Отменить освобождение').click());
  const reopened = container.querySelector('dialog[open]');
  expect(reopened.textContent).toContain('Вы ещё никого не освободили');
  expect(lobby.viewFor('phone-0').play.status).toBe('captured');
  expect([...reopened.querySelector('select').options].map(option => option.textContent)).toContain('Player 1, Player 0');
});

it('confirms a warned start, retries a lost acknowledgement once and restores paused controls', async () => {
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST');
  io.mockReturnValue(socket('panel', 'round:start'));
  const confirm = globalThis.window.confirm.mockReturnValue(false);
  await act(async () => root.render(createElement(HostPage)));
  await click('Начать раунд'); expect(confirm).toHaveBeenCalled(); expect(lobby.viewFor('host').room.game.phase).toBe('reading');
  confirm.mockReturnValue(true); await click('Начать раунд');
  const id = lobby.viewFor('host').room.game.roundId;
  expect(container.textContent).toContain('Расстановка'); expect(button('Повторить действие')).toBeDefined();
  await click('Повторить действие'); expect(lobby.viewFor('host').room.game.roundId).toBe(id);
  expect(container.querySelector('[aria-label="Заменить карточку Player 0"]')).toBeNull();
  await click('Пауза'); expect(container.textContent).toContain('Прекратите действия');
  expect(clock.pending()).toBe(0); await click('Продолжить'); expect(lobby.viewFor('host').room.game.paused).toBe(false);
});

it('restores a private card during a round, freezes pause time and marks offline timing unconfirmed', async () => {
  vi.spyOn(globalThis.performance, 'now').mockImplementation(clock.clock.now);
  const client = socket('phone'); io.mockReturnValue(client); await act(async () => root.render(createElement(PlayerPage)));
  const original = lobby.viewFor('phone').assignment;
  await act(async () => value(lobby.execute('host', 'round:start', { ...gameBase(), confirmWarnings: true })));
  expect(container.querySelector('[role="timer"]').textContent).toBe('00:45');
  expect([...container.querySelectorAll('button')].some(button => button.textContent === 'Я прочитал карточку')).toBe(false);
  await act(async () => { clock.advance(2500); value(lobby.execute('host', 'round:pause', gameBase())); });
  expect(container.querySelector('[role="timer"]').textContent).toBe('00:43');
  await act(async () => root.unmount()); root = createRoot(container); io.mockReturnValue(socket('refreshed'));
  await act(async () => root.render(createElement(PlayerPage)));
  expect(container.textContent).toContain('Пауза'); expect(container.querySelector('[aria-label="Личная карточка"] h4')).toBeNull();
  await click('Открыть карточку'); expect(container.textContent).toContain(original.card.title);
  expect(lobby.viewFor('refreshed').assignment.id).toBe(original.id);
  await act(async () => clients.get('refreshed').disconnect());
  expect(container.textContent).toContain('Фаза и таймер не подтверждены');
});

it('shows a late player waiting without a card until the next manual deal', async () => {
  value(lobby.execute('host', 'round:start', { ...gameBase(), confirmWarnings: true }));
  const session = { roomCode: room.code, name: 'Late', resumeKey: 'f'.repeat(64), pending: true };
  savePlayerSession(session); io.mockReturnValue(socket('late'));
  await act(async () => root.render(createElement(PlayerPage)));
  expect(container.textContent).toContain('Вы участвуете со следующего раунда');
  expect(container.querySelector('[aria-label="Личная карточка"]')).toBeNull();
  await act(async () => {
    value(lobby.execute('host', 'round:abort', gameBase()));
    value(lobby.execute('host', 'sync:close', { ...gameBase(), confirm: true }));
    value(lobby.execute('host', 'deal:create', { ...base(), possessedCount: 3 }));
  });
  expect(button('Открыть карточку')).toBeDefined(); expect(container.querySelector('[aria-label="Личная карточка"] h4')).toBeNull();
});

it('unlocks audio explicitly, plays live cues once and does not replay when volume or mute changes', async () => {
  const { tones, contexts: audios, Audio } = audioHarness();
  vi.stubGlobal('AudioContext', Audio);
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST'); io.mockReturnValue(socket('panel'));
  globalThis.window.confirm.mockImplementation(() => { if (audios.length) audios.at(-1).state = 'suspended'; return true; });
  await act(async () => root.render(createElement(HostPage)));
  expect(tones).toHaveLength(0); await click('Включить звук здесь'); expect(tones).toHaveLength(1);
  await click('Начать раунд'); expect(tones).toHaveLength(2);
  const mute = [...container.querySelectorAll('label')].find(label => label.textContent.includes('Без звука')).querySelector('input');
  await act(async () => mute.click()); expect(tones).toHaveLength(2);
  await click('Пауза'); expect(tones).toHaveLength(2);
  await act(async () => mute.click()); expect(tones).toHaveLength(2);
  await click('Продолжить'); expect(tones).toHaveLength(3);
  await click('Обновить состояние'); expect(tones).toHaveLength(3);
});

it.each([
  ['mute', 0], ['zero volume', 0], ['lower volume', 1],
])('applies current %s when a live cue finishes resuming audio', async (setting, expectedTones) => {
  const { tones, ramps, contexts: audios, Audio } = audioHarness();
  let completeResume, holdResume = false;
  const originalResume = Audio.prototype.resume;
  Audio.prototype.resume = function () {
    if (holdResume) return new Promise(resolve => { completeResume = () => { this.state = 'running'; resolve(); }; });
    return originalResume.call(this);
  };
  vi.stubGlobal('AudioContext', Audio);
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST'); io.mockReturnValue(socket('panel'));
  await act(async () => root.render(createElement(HostPage)));
  await click('Включить звук здесь'); expect(tones).toHaveLength(1);
  tones.length = 0; ramps.length = 0;
  audios[0].state = 'suspended'; holdResume = true;
  await act(async () => value(lobby.execute('host', 'round:start', { ...gameBase(), confirmWarnings: true })));
  expect(completeResume).toBeTypeOf('function');
  const mute = [...container.querySelectorAll('label')].find(label => label.textContent.includes('Без звука')).querySelector('input');
  const volume = container.querySelector('input[type="range"]');
  await act(async () => {
    if (setting === 'mute') mute.click();
    else {
      Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set.call(volume, setting === 'zero volume' ? '0' : '0.1');
      volume.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    }
  });
  if (setting === 'mute') expect(mute.checked).toBe(true);
  else expect(volume.value).toBe(setting === 'zero volume' ? '0' : '0.1');
  await act(async () => completeResume());
  expect(tones).toHaveLength(expectedTones);
  if (expectedTones) expect(ramps.some(value => Math.abs(value - .1 * .35) < .00001)).toBe(true);
  await act(async () => mute.click());
  expect(tones).toHaveLength(expectedTones);
});

it('updates the phone to a concealed group card, releases the group and undoes the release', async () => {
  const sessionViews = [];
  for (let i = 0; i < 7; i++) sessionViews.push(value(lobby.execute(`inspect${i}`, 'player:resume', { roomCode: room.code, resumeKey: String(i + 1).repeat(64) })));
  const rootPlayer = sessionViews.find(view => view.assignment.card.role === 'possessed');
  const target = sessionViews.find(view => view.assignment.card.role === 'exorcist');
  const targetIndex = sessionViews.indexOf(target);
  savePlayerSession({ roomCode: room.code, name: `Player ${targetIndex}`, resumeKey: String(targetIndex + 1).repeat(64), pending: false });
  const current = lobby.viewFor('host').room;
  value(lobby.execute('host', 'game:configure', { ...gameBase(), settings: { ...current.game.settings, infectionMode: 'on' } }));
  value(lobby.execute('host', 'round:start', { ...gameBase(), confirmWarnings: true }));
  clock.advance(45000);
  io.mockReturnValue(socket('phone')); await act(async () => root.render(createElement(PlayerPage)));
  await click('Открыть карточку'); expect(container.textContent).toContain(target.assignment.card.title);
  await click('Миссия выполнена');
  await act(async () => {
    const own = lobby.viewFor(`inspect${sessionViews.indexOf(rootPlayer)}`);
    value(lobby.execute(`inspect${sessionViews.indexOf(rootPlayer)}`, 'play:infect', { ...gameBase(), playVersion: own.play.version, targetId: target.playerId }));
  });
  expect(container.textContent).toContain('Вы заражены');
  expect(container.querySelector('[aria-label="Личная карточка"] h4')).toBeNull();
  await click('Открыть карточку'); expect(container.textContent).toContain(rootPlayer.assignment.card.title);
  expect(container.textContent).not.toContain(target.assignment.card.title);
  await click('Нас освободили'); expect(container.textContent).toContain('Вы освобождены');
  expect(container.textContent).toContain('не засчитывается');
  await click('Отменить моё последнее действие'); expect(container.textContent).toContain('Вы заражены');
  expect(lobby.viewFor('host').room.game.results).toEqual([]);
});
async function startSearchOnExorcistPhone(roundLimit = 5) {
  value(lobby.execute('host', 'deal:cancel', base()));
  value(lobby.execute('host', 'game:configure', { ...gameBase(), settings: { ...lobby.viewFor('host').room.game.settings, infectionMode: 'on', roundLimit } }));
  value(lobby.execute('host', 'deal:create', { ...base(), possessedCount: 3 }));
  const players = [];
  for (let i = 0; i < 7; i++) {
    const connection = `inspect${i}`;
    const view = value(lobby.execute(connection, 'player:resume', { roomCode: room.code, resumeKey: String(i + 1).repeat(64) }));
    players.push({ connection, view, index: i });
  }
  const possessed = players.find(player => player.view.assignment.card.role === 'possessed');
  const exorcists = players.filter(player => player.view.assignment.card.role === 'exorcist');
  const target = exorcists.at(-1);
  savePlayerSession({ roomCode: room.code, name: `Player ${target.index}`, resumeKey: String(target.index + 1).repeat(64), pending: false });
  value(lobby.execute('host', 'round:start', { ...gameBase(), confirmWarnings: true }));
  clock.advance(45000);
  io.mockReturnValue(socket('phone'));
  await act(async () => root.render(createElement(PlayerPage)));
  return { possessed, exorcists, target };
}
async function infectFromPhone(possessed, target) {
  await act(async () => {
    const own = lobby.viewFor(possessed.connection);
    value(lobby.execute(possessed.connection, 'play:infect', { ...gameBase(), playVersion: own.play.version, targetId: target.view.playerId }));
  });
}

it.each([['between_rounds', 5], ['finished', 1]])('prioritizes return and %s instructions after the last capture', async (phase, limit) => {
  const { possessed, exorcists } = await startSearchOnExorcistPhone(limit);
  for (const target of exorcists) await infectFromPhone(possessed, target);
  expect(lobby.viewFor('phone').play.status).toBe('captured');
  expect(lobby.viewFor('phone').room.game.phase).toBe('return');
  expect(container.textContent).toContain('Все возвращаются на базу');
  expect(container.textContent).not.toContain('Оставайтесь в той же зоне и повторяйте поведение группы');
  expect(container.textContent).toContain('не засчитывается');
  await act(async () => clock.advance(45000));
  expect(lobby.viewFor('phone').room.game.phase).toBe(phase);
  expect(container.textContent).not.toContain('Оставайтесь в той же зоне и повторяйте поведение группы');
});

it('stops captured-player behavior on pause, restores it on resume and clears it on abort', async () => {
  const { possessed, target } = await startSearchOnExorcistPhone();
  await infectFromPhone(possessed, target);
  expect(container.textContent).toContain('Оставайтесь в той же зоне и повторяйте поведение группы');
  await act(async () => value(lobby.execute('host', 'round:pause', gameBase())));
  expect(lobby.viewFor('phone').room.game.paused).toBe(true);
  expect(container.textContent).toContain('Прекратите действия и ждите в безопасном месте');
  expect(container.textContent).not.toContain('Оставайтесь в той же зоне и повторяйте поведение группы');
  expect(container.textContent).toContain('не засчитывается');
  await act(async () => value(lobby.execute('host', 'round:resume', { ...gameBase(), confirmWarnings: true })));
  expect(container.textContent).toContain('Оставайтесь в той же зоне и повторяйте поведение группы');
  await act(async () => value(lobby.execute('host', 'round:abort', gameBase())));
  expect(container.textContent).toContain('Раунд отменён. Все возвращаются на базу');
  expect(container.textContent).not.toContain('Оставайтесь в той же зоне и повторяйте поведение группы');
});

it('stops released-player movement on pause and restores return instructions on resume', async () => {
  const { possessed, target } = await startSearchOnExorcistPhone();
  await infectFromPhone(possessed, target);
  await click('Нас освободили');
  expect(lobby.viewFor('phone').play.status).toBe('released');
  expect(container.textContent).toContain('Вы освобождены. Возвращайтесь на базу');
  await act(async () => value(lobby.execute('host', 'round:pause', gameBase())));
  expect(lobby.viewFor('phone').room.game.paused).toBe(true);
  expect(container.textContent).toContain('Прекратите действия и ждите в безопасном месте');
  expect(container.textContent).not.toContain('Вернитесь на базу. До следующего раунда');
  expect(container.textContent).not.toContain('Вы освобождены. Возвращайтесь на базу');
  await act(async () => value(lobby.execute('host', 'round:resume', { ...gameBase(), confirmWarnings: true })));
  expect(container.textContent).toContain('Вы освобождены. Возвращайтесь на базу');
});

it('renders provisional totals and freezes them on the organizer panel', async () => {
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST');
  io.mockReturnValue(socket('panel')); await act(async () => root.render(createElement(HostPage)));
  await click('Начать раунд');
  await act(async () => clock.advance(270000));
  expect(container.textContent).toContain('Предварительный итог');
  expect(button('Зафиксировать результаты').disabled).toBe(true);
  await click('Закрыть ожидание с предупреждением');
  await click('Зафиксировать результаты');
  expect(container.textContent).toContain('Результат зафиксирован');
  expect([...container.querySelectorAll('button')].some(button => button.textContent === 'Зафиксировать результаты')).toBe(false);
});

it('shows tutorial guidance without revealing the closed card and excludes its outcome from team totals', async () => {
  value(lobby.execute('host', 'deal:cancel', base()));
  value(lobby.execute('host', 'game:configure', { ...gameBase(), settings: { ...lobby.viewFor('host').room.game.settings,
    tutorialEnabled: true, placementSeconds: 1, searchSeconds: 1, returnSeconds: 1, infectionMode: 'on' } }));
  value(lobby.execute('host', 'deal:create', { ...base(), possessedCount: 3 }));
  io.mockReturnValue(socket('phone'));
  await act(async () => root.render(createElement(PlayerPage)));
  const own = lobby.viewFor('phone');
  expect(container.textContent).toContain('Пробный раунд');
  expect(container.textContent).toContain('Обучение · перед основной партией');
  expect(container.textContent).not.toContain(own.assignment.card.title);
  expect(container.textContent).not.toContain('Обучение:');
  await click('Открыть карточку');
  expect(container.textContent).toContain('Обучение:');
  if (lobby.viewFor('phone').assignment.card.role === 'possessed') expect(container.textContent).toContain('Условие заражения:');
  await act(async () => { value(lobby.execute('host', 'round:start', { ...gameBase(), confirmWarnings: true })); clock.advance(3000); });
  expect(container.textContent).toContain('Обучение · без общего зачёта');
  expect(container.textContent).toContain('Спасено групп: 0 / 0. Миссии: 0 / 0. Активное время: 0 мин 0 с.');
  expect(container.textContent).toContain('завершено обычных: 0');
});

it('renders the authorized broadcast without organizer mutation controls', async () => {
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST'); io.mockReturnValue(socket('broadcast'));
  await act(async () => root.render(createElement(HostPage, { display: true })));
  expect(container.textContent).toContain('Эфир дома');
  expect(button('Полноэкранный режим')).toBeDefined();
  expect([...container.querySelectorAll('button')].some(b => ['Начать раунд', 'Закрыть комнату', 'Раздать карточки'].includes(b.textContent))).toBe(false);
  expect(container.querySelector('[aria-label="Сохранение партии"]')).toBeNull();
  expect(container.querySelector('a[href="/?screen=host"]')).not.toBeNull();
});

it('keeps broadcast read-only before a room exists', async () => {
  value(lobby.execute('host', 'room:close', { roomId: room.id }));
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST'); io.mockReturnValue(socket('empty-broadcast'));
  await act(async () => root.render(createElement(HostPage, { display: true })));
  expect(container.textContent).toContain('Ожидаем комнату.');
  expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Создать комнату')).toBe(false);
  expect(container.querySelector('a[href="/?screen=host"]')).not.toBeNull();
});

it('opens the catalog explicitly, conceals titles and preserves a draft after a stale save', async () => {
  value(lobby.execute('host', 'deal:cancel', base()));
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST'); io.mockReturnValue(socket('editor'));
  await act(async () => root.render(createElement(HostPage, { editor: true })));
  const original = lobby.catalogExecute('host', { action: 'read' }).catalog.file.entries[0];
  expect(container.textContent).not.toContain(original.card.title);
  await click('Открыть банк заданий'); expect(container.textContent).not.toContain(original.card.title);
  await click(`Открыть ${original.card.id}`);
  const field = [...container.querySelectorAll('label')].find(label => label.textContent === 'Название').querySelector('input');
  expect(field.value).toBe(original.card.title);
  expect(globalThis.document.activeElement).toBe(field);
  expect(container.querySelector('[aria-label="Карточка в редакторе"]').compareDocumentPosition(container.querySelector('[aria-label="Карточки банка"]')) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await act(async () => { Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set.call(field, 'Мой несохранённый текст'); field.dispatchEvent(new globalThis.Event('input', { bubbles: true })); });
  lobby.catalogExecute('host', { action: 'save', revision: 0, requestId: 'another-editor-change', entry: { ...original, enabled: false } });
  await click('Сохранить карточку'); expect(container.textContent).toContain('Банк изменён в другой панели.'); expect(field.value).toBe('Мой несохранённый текст');
  await click('Перечитать банк'); expect(field.value).toBe('Мой несохранённый текст');
  await click('Сохранить карточку'); expect(lobby.catalogExecute('host', { action: 'read' }).catalog.file.entries.find(e => e.card.id === original.card.id).card.title).toBe('Мой несохранённый текст');
});
