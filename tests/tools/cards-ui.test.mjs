// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlayerPage } from '../../src/client/pages/player/index.js';
import { HostPage } from '../../src/client/pages/host/index.js';
import { savePlayerSession } from '../../src/client/pages/player/session.js';
import { createLobby } from '../../src/server/lobby.js';

const { io } = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io }));
let root, container, lobby, room, phoneId, saved, sequence;
const clients = new Map();
const value = reply => { if (!reply.ok) throw new Error(reply.error); return reply.view; };
function base() {
  const room = lobby.viewFor('host').room;
  return { roomId: room.id, dealVersion: room.dealing.version, dealId: room.dealing.dealId, requestId: `test-request-${++sequence}` };
}
function publish() { for (const [id, socket] of clients) if (socket.connected) socket.listeners.get('lobby:state')?.(lobby.viewFor(id)); }
function socket(id, dropCommand) {
  let dropped = false;
  const client = {
    listeners: new Map(), connected: false,
    on(event, listener) { this.listeners.set(event, listener); return this; },
    connect() { this.connected = true; this.listeners.get('connect')(); },
    disconnect() { this.connected = false; lobby.disconnect(id); },
    removeAllListeners() { this.listeners.clear(); },
    timeout() { return this; }, get volatile() { return this; },
    emit(command, input, acknowledge) {
      const reply = lobby.execute(id, command, input);
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
  globalThis.localStorage.clear(); globalThis.sessionStorage.clear();
  globalThis.history.replaceState(null, '', '/?room=ABCDEF');
  sequence = 0;
  lobby = createLobby({ organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF' });
  value(lobby.execute('host', 'organizer:authorize', { code: 'HOST' }));
  room = value(lobby.execute('host', 'room:create', {})).room;
  for (let i = 0; i < 7; i++) {
    const session = { roomCode: room.code, name: `Player ${i}`, resumeKey: String(i + 1).repeat(64), pending: false };
    const view = value(lobby.execute(`p${i}`, 'player:join', session));
    if (i === 0) { saved = session; phoneId = view.playerId; }
    lobby.disconnect(`p${i}`);
  }
  value(lobby.execute('host', 'deal:create', { ...base(), possessedCount: 3 }));
  savePlayerSession(saved);
  container = globalThis.document.createElement('div'); globalThis.document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); clients.clear();
  globalThis.localStorage.clear(); globalThis.sessionStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks();
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
