// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerPage } from '../../src/client/pages/player/index.js';
import { HostPage } from '../../src/client/pages/host/index.js';
import { readPlayerSession, savePlayerSession } from '../../src/client/pages/player/session.js';
import { createLobby } from '../../src/server/lobby.js';
import { audioHarness } from '../helpers/audio.mjs';
import { controlledClock } from '../helpers/game-clock.js';
import { dealCommand, gameCommand } from '../../src/client/shared/api/index.js';

const { io, offlineRecords } = vi.hoisted(() => ({ io: vi.fn(), offlineRecords: new Map() }));
vi.mock('socket.io-client', () => ({ io }));
vi.mock('../../src/client/pages/player/model/offline-store.js', async importOriginal => ({
  ...await importOriginal(),
  // Retain the real offline hook and projection; replace only IndexedDB persistence.
  async updateOffline(scope, mutate = () => {}) {
    const record = globalThis.structuredClone(offlineRecords.get(scope) ?? {
      scope, cachedAt: Date.now(), view: null, clientId: 'recovery-test-client', sequence: 0, events: [],
    });
    mutate(record); offlineRecords.set(scope, globalThis.structuredClone(record));
    return record;
  },
  async purgeOffline(scope) { offlineRecords.delete(scope); },
}));

let root;
let container;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
  offlineRecords.clear();
  globalThis.history.replaceState(null, '', '/?room=ABCDEF');
  container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function recoveryTransport(currentLobby) {
  const listeners = new Map(); let connection = 0;
  const socket = {
    connected: false, nextError: null, holdNextReply: false, deliver: null,
    on(event, listener) { listeners.set(event, listener); return this; },
    connect() { this.connected = true; listeners.get('connect')(); return this; },
    disconnect() { this.connected = false; currentLobby().disconnect(`phone-${connection}`); listeners.get('disconnect')?.(); return this; },
    reconnect() { this.disconnect(); connection++; return this.connect(); },
    publish() { listeners.get('lobby:state')?.(currentLobby().viewFor(`phone-${connection}`)); },
    removeAllListeners() { listeners.clear(); },
    timeout() { return this; }, get volatile() { return this; },
    emit(command, input, acknowledge) {
      if (this.holdNextReply) {
        this.holdNextReply = false;
        this.deliver = () => acknowledge(null, currentLobby().execute(`phone-${connection}`, command, input));
        return;
      }
      if (this.nextError) {
        const error = this.nextError; this.nextError = null;
        if (error === 'TIMEOUT') acknowledge(new Error('Acknowledgement timed out.'));
        else acknowledge(null, { ok: false, error });
      } else acknowledge(null, currentLobby().execute(`phone-${connection}`, command, input));
    },
  };
  io.mockReturnValue(socket); return socket;
}

it('shows the new organizer code form after a server restart and accepts it without reload', async () => {
  let lobby = createLobby({ organizerCode: 'OLDHOST' });
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'OLDHOST');
  const socket = recoveryTransport(() => lobby);
  await act(async () => root.render(createElement(HostPage)));
  expect(container.querySelector('form')).toBeNull();
  lobby = createLobby({ organizerCode: 'NEWHOST' });
  await act(async () => socket.reconnect());
  expect(container.textContent).toContain('Код организатора не подошёл');
  expect(container.querySelector('input[type=password]')).not.toBeNull();
  expect(globalThis.sessionStorage.getItem('pomekhi.organizer')).toBeNull();
  await act(async () => {
    const input = container.querySelector('input[type=password]');
    Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set.call(input, 'NEWHOST');
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  });
  await act(async () => container.querySelector('form').dispatchEvent(new globalThis.Event('submit', { bubbles: true, cancelable: true })));
  expect(container.textContent).toContain('Создать комнату');
  expect(container.querySelector('form')).toBeNull();
});

it.each([false, true])('keeps host audio stopped until recovery and a new source selection (display=%s)', async display => {
  const harness = audioHarness();
  vi.stubGlobal('AudioContext', harness.Audio);
  const lobby = createLobby({ organizerCode: 'HOST' });
  lobby.execute('other-panel', 'organizer:authorize', { code: 'HOST' });
  lobby.execute('other-panel', 'room:create', {});
  globalThis.sessionStorage.setItem('pomekhi.organizer', 'HOST');
  const socket = recoveryTransport(() => lobby);
  const soundButton = () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Включить звук здесь');
  try {
    await act(async () => root.render(createElement(HostPage, { display })));
    await act(async () => soundButton().click());
    harness.finish();
    expect(harness.nodes.size).toBeGreaterThan(1);
    await act(async () => socket.disconnect());
    expect(harness.nodes.size).toBe(1);
    expect(lobby.execute('other-panel', 'organizer:audio', { enabled: true }).ok).toBe(true);

    socket.holdNextReply = true;
    await act(async () => socket.reconnect());
    expect(socket.deliver).toBeTypeOf('function');
    expect(harness.nodes.size).toBe(1);
    expect(lobby.viewFor('other-panel').audioEnabled).toBe(true);

    await act(async () => socket.deliver());
    expect(harness.nodes.size).toBe(1);
    expect(soundButton().disabled).toBe(false);
    await act(async () => soundButton().click());
    harness.finish();
    expect(harness.nodes.size).toBeGreaterThan(1);
    expect(lobby.viewFor('other-panel').audioEnabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    root = createRoot(container);
    lobby.dispose();
  }
});

it('shows the join form after offline removal and rejoins with a new credential without reload', async () => {
  const lobby = createLobby({ organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF' });
  lobby.execute('host', 'organizer:authorize', { code: 'HOST' }); lobby.execute('host', 'room:create', {});
  const session = { roomCode: 'ABCDEF', name: 'Ира', resumeKey: 'a'.repeat(64), pending: true };
  savePlayerSession(session);
  const socket = recoveryTransport(() => lobby);
  await act(async () => root.render(createElement(PlayerPage)));
  expect(container.textContent).toContain('Ира, оставайтесь на связи');
  await act(async () => socket.disconnect());
  expect(container.querySelector('form')).toBeNull();
  const host = lobby.viewFor('host');
  lobby.execute('host', 'player:remove', { roomId: host.room.id, playerId: host.room.players[0].id });
  await act(async () => socket.reconnect());
  expect(container.textContent).toContain('Прежний вход больше не действует');
  expect(container.querySelector('form')).not.toBeNull();
  expect(container.textContent).not.toContain('Ира, оставайтесь на связи');
  expect(readPlayerSession()).toBeNull();
  await act(async () => container.querySelector('form').dispatchEvent(new globalThis.Event('submit', { bubbles: true, cancelable: true })));
  expect(container.textContent).toContain('Ира, оставайтесь на связи');
  expect(readPlayerSession().resumeKey).not.toBe(session.resumeKey);
  expect(lobby.viewFor('host').room.players).toHaveLength(1);
  expect(offlineRecords.size).toBe(1);
  expect([...offlineRecords.values()][0].view.playerId).toBe(lobby.viewFor('host').room.players[0].id);
});

it('uploads a retained phone release and acknowledges checking without a new card', async () => {
  const time = controlledClock();
  const lobby = createLobby({ organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF', clock: time.clock, firstGame: true });
  const host = () => lobby.viewFor('host');
  const send = (connection, command, input) => expect(lobby.execute(connection, command, input)).toMatchObject({ ok: true });
  const game = (command, input = {}) => send('host', command, { ...gameCommand(host().room), ...input });
  const deal = () => send('host', 'deal:create', { ...dealCommand(host().room), possessedCount: 0 });
  const session = { roomCode: 'ABCDEF', name: 'Медиум 1', resumeKey: 'b'.repeat(64), pending: false };
  try {
    send('host', 'organizer:authorize', { code: 'HOST' });
    send('host', 'room:create', {});
    for (let i = 0; i < 5; i++) send(`original-${i}`, 'player:join', {
      ...session, name: `Медиум ${i}`, resumeKey: (i + 10).toString(16).repeat(64),
    });
    const order = host().room.players.map(p => p.id);
    game('venue:configure', { venue: { base: 'База', zones: ['Кухня'], dwelling: { zone: 'Кухня', place: 'Угол' }, storyId: 'S001', prologueRead: true, harder: false, order } });
    deal();
    game('round:start', { confirmWarnings: true });
    time.advance(45000);
    game('round:return');
    game('round:return');
    game('round:presence', { playerId: order[0], status: 'at_base' });
    game('sync:close', { confirm: true });
    game('results:finalize');
    deal();
    game('round:start', { confirmWarnings: true });
    time.advance(45000);

    const view = lobby.viewFor('original-1');
    expect(view).toMatchObject({ assignment: null, play: { retained: true } });
    const { roundId } = view.room.game;
    const scope = `${session.roomCode}:${session.resumeKey}`;
    const event = { id: 'retained-release', clientId: 'retained-phone', sequence: 1, previousId: null, roundId,
      action: { kind: 'release' }, phase: 'search', paused: false, estimatedServerTime: null };
    offlineRecords.set(scope, { scope, view, cachedAt: Date.now(), clientId: event.clientId, sequence: 1, events: [{ event, before: view.play }] });
    savePlayerSession(session);
    const socket = recoveryTransport(() => lobby);
    await act(async () => root.render(createElement(PlayerPage)));
    await vi.waitFor(() => expect(lobby.viewFor('phone-0')?.play?.status).toBe('released'));

    await act(async () => {
      game('round:return');
      game('round:return');
      socket.publish();
    });
    await vi.waitFor(() => expect(lobby.viewFor('phone-0').synchronization.complete).toBe(true));
    expect(host().room.game.results.at(-1).rescuedGroups).toBe(1);
  } finally {
    lobby.dispose();
  }
});

it.each(['TIMEOUT', 'STORAGE_UNAVAILABLE'])('retains the authorized phone screen on uncertain recovery: %s', async error => {
  const lobby = createLobby({ organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF' });
  lobby.execute('host', 'organizer:authorize', { code: 'HOST' }); lobby.execute('host', 'room:create', {});
  const session = { roomCode: 'ABCDEF', name: 'Ира', resumeKey: 'a'.repeat(64), pending: true };
  savePlayerSession(session);
  const socket = recoveryTransport(() => lobby);
  await act(async () => root.render(createElement(PlayerPage)));
  const identity = readPlayerSession();
  socket.nextError = error;
  await act(async () => socket.reconnect());
  expect(container.textContent).toContain('Ира, оставайтесь на связи');
  expect(container.querySelector('form')).toBeNull();
  expect(readPlayerSession()).toEqual(identity);
  const retry = [...container.querySelectorAll('button')].find(button => button.textContent === 'Повторить вход');
  expect(retry).toBeDefined();
  await act(async () => retry.click());
  expect(container.textContent).toContain('Ира, оставайтесь на связи');
  expect(lobby.viewFor('host').room.players).toHaveLength(1);
});

it('retains the new credential when rejoining after an online removal notification', async () => {
  const lobby = createLobby({ organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF' });
  lobby.execute('host', 'organizer:authorize', { code: 'HOST' }); lobby.execute('host', 'room:create', {});
  const session = { roomCode: 'ABCDEF', name: 'Ира', resumeKey: 'a'.repeat(64), pending: true };
  savePlayerSession(session);
  const socket = recoveryTransport(() => lobby);
  await act(async () => root.render(createElement(PlayerPage)));
  const host = lobby.viewFor('host');
  await act(async () => {
    lobby.execute('host', 'player:remove', { roomId: host.room.id, playerId: host.room.players[0].id });
    socket.publish();
  });
  expect(container.querySelector('form')).not.toBeNull();
  expect(readPlayerSession()).toBeNull();
  socket.holdNextReply = true;
  await act(async () => container.querySelector('form').dispatchEvent(new globalThis.Event('submit', { bubbles: true, cancelable: true })));
  await act(async () => socket.deliver());
  expect(container.textContent).toContain('Ира, оставайтесь на связи');
  expect(readPlayerSession()).toMatchObject({ name: session.name, pending: false });
  expect(readPlayerSession().resumeKey).not.toBe(session.resumeKey);
  expect(lobby.viewFor('host').room.players).toHaveLength(1);
  expect(offlineRecords.size).toBe(1);
  expect([...offlineRecords.values()][0].view.playerId).toBe(lobby.viewFor('host').room.players[0].id);
});

describe('player recovery form', () => {
  it.each([[false, 'TIMEOUT'], [true, 'TIMEOUT'], [false, 'STORAGE_UNAVAILABLE'], [true, 'STORAGE_UNAVAILABLE']])('retains identity after an uncertain response (pending=%s, error=%s)', async (pending, error) => {
    const lobby = createLobby({ organizerCode: 'HOST', generateRoomCode: () => 'ABCDEF' });
    lobby.execute('host', 'organizer:authorize', { code: 'HOST' });
    lobby.execute('host', 'room:create', {});
    const session = { roomCode: 'ABCDEF', name: 'Ира', resumeKey: 'a'.repeat(64), pending };
    const joined = lobby.execute('original-phone', 'player:join', session);
    expect(joined.ok).toBe(true);
    lobby.disconnect('original-phone');
    savePlayerSession(session);

    // Keep React, the connection hook, credentials and lobby real; control packet delivery.
    const listeners = new Map();
    let dropped = false;
    const socket = {
      connected: false,
      on(event, listener) { listeners.set(event, listener); return this; },
      connect() { this.connected = true; listeners.get('connect')(); },
      disconnect() { this.connected = false; lobby.disconnect('reloaded-phone'); },
      removeAllListeners() { listeners.clear(); },
      timeout() { return this; },
      get volatile() { return this; },
      emit(command, input, acknowledge) {
        if (!dropped) {
          dropped = true;
          if (error === 'TIMEOUT') acknowledge(new Error('Packet was not delivered before the acknowledgement deadline.'));
          else acknowledge(null, { ok: false, error });
        } else acknowledge(null, lobby.execute('reloaded-phone', command, input));
      },
    };
    io.mockReturnValue(socket);

    await act(async () => root.render(createElement(PlayerPage)));
    expect(container.textContent).toContain(error === 'TIMEOUT' ? 'Ответ задерживается' : 'Не удалось сохранить партию');
    expect(readPlayerSession()).toEqual(session);
    expect(container.querySelector('button').disabled).toBe(false);

    await act(async () => {
      container.querySelector('form').dispatchEvent(new globalThis.Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(readPlayerSession()).toEqual({ ...session, pending: false });
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Ира, оставайтесь на связи');
    expect(lobby.viewFor('host').room.players).toEqual([
      { id: joined.view.playerId, name: 'Ира', online: true },
    ]);
  });
});
