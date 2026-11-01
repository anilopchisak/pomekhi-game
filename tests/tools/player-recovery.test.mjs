// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerPage } from '../../src/client/pages/player/index.js';
import { readPlayerSession, savePlayerSession } from '../../src/client/pages/player/session.js';
import { createLobby } from '../../src/server/lobby.js';

const { io } = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io }));

let root;
let container;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  globalThis.localStorage.clear();
  globalThis.history.replaceState(null, '', '/?room=ABCDEF');
  container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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

    // Keep React, the connection hook, storage and lobby real; control packet delivery only.
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
