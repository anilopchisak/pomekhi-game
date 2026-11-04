import type { CatalogReply, GameCue, LobbyCommand, LobbyReply, LobbyView, PersistenceStatus } from '../shared/protocol.js';
import { createLobby } from './lobby.js';
import type { LobbyOptions, SavedLobby } from './lobby.js';
import { defaultClock } from './game.js';
import type { SessionStore } from './session-store.js';
import type { SavedSession } from './session-format.js';

/** Serializes mutations and timer callbacks. Only durable projections reach transport consumers. */
export function createSession(options: LobbyOptions & { store?: SessionStore }) {
  const { store } = options;
  const sourceClock = options.clock ?? defaultClock;
  const listeners = new Set<(cue?: GameCue) => void>();
  let tail: Promise<unknown> = Promise.resolve(), initialization: Promise<void> | undefined, closing: Promise<void> | undefined;
  let stopping = false, initialized = !store, dirty = false, cue: GameCue | undefined;
  let status: PersistenceStatus = { mode: store ? 'disk' : 'memory', state: 'ready', recovered: false };
  let committed: SavedSession | undefined;
  const visible = new Map<string, LobbyView>();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation); tail = result.catch(() => {}); return result;
  }
  const lobby = createLobby({ ...options, clock: { ...sourceClock, schedule(callback, delay) {
    let cancelled = false;
    const cancel = sourceClock.schedule(() => {
      void enqueue(async () => {
        if (stopping || cancelled || status.state !== 'ready') return;
        await transaction(() => { callback(); });
      });
    }, delay);
    return () => { cancelled = true; cancel(); };
  } } });
  lobby.subscribe(value => { dirty = true; if (value) cue = value; });
  const saved = (): SavedSession => ({ schemaVersion: options.firstGame ? 7 : 5, lobby: lobby.exportState() });
  const viewFor = (connection: string): LobbyView | undefined => {
    const view = visible.get(connection); return view ? structuredClone(view) : undefined;
  };
  function refreshViews() {
    visible.clear();
    for (const connection of lobby.liveState().actors.keys()) {
      const view = lobby.viewFor(connection);
      if (view) visible.set(connection, { ...view, persistence: { ...status } });
    }
  }
  function publish() {
    refreshViews();
    const pending = cue; dirty = false; cue = undefined;
    for (const listener of listeners) listener(pending);
  }
  async function write() {
    const next = saved();
    if (store && JSON.stringify(next) !== JSON.stringify(committed)) await store.write(next);
    committed = next;
  }
  async function transaction<T>(mutate: () => T): Promise<{ value: T; durable: boolean }> {
    const before = committed ?? saved(), live = lobby.liveState();
    const value = mutate();
    if (dirty && status.state === 'ready') lobby.reconcileRecall();
    try { await write(); refreshViews(); if (dirty && status.state === 'ready') publish(); return { value, durable: true }; }
    catch {
      // A rename may have succeeded before its directory sync failed. Read back the actual commit.
      const after = saved();
      let recovered = before;
      try { recovered = await store!.load() ?? before; } catch { /* Keep the last known durable checkpoint. */ }
      committed = recovered;
      const durable = JSON.stringify(recovered) === JSON.stringify(after);
      lobby.restore(recovered.lobby, 'storage_error', durable ? lobby.liveState() : live);
      status = { ...status, state: 'write_error' }; cue = undefined; publish();
      return { value, durable: false };
    }
  }
  function initialize(): Promise<void> {
    if (initialization) return initialization;
    initialization = enqueue(async () => {
      if (!store || stopping) return;
      // Lock failure is a startup failure. A bad save instead opens an organizer-only recovery screen.
      await store.acquire();
      if (stopping) return;
      try {
        const state = await store.load();
        if (stopping) return;
        if (state) {
          committed = state; lobby.restore(state.lobby);
          status = { ...status, recovered: state.lobby.room !== null };
        }
      } catch { status = { ...status, state: 'load_error' }; }
      initialized = true;
      if (status.state === 'ready') {
        try { await write(); } catch { status = { ...status, state: 'write_error' }; }
      }
    });
    return initialization;
  }
  async function recover(reset: boolean) {
    const live = lobby.liveState();
    let target: SavedLobby;
    try {
      if (reset) {
        await store!.preserve();
        target = { revision: lobby.exportState().revision, usedCodes: committed?.lobby.usedCodes ?? [], room: null };
      } else {
        const disk = await store!.load();
        if (!disk && committed?.lobby.room) throw new Error('The session file is missing.');
        target = disk?.lobby ?? committed?.lobby ?? lobby.exportState();
      }
    } catch { status = { ...status, state: 'load_error' }; cue = undefined; publish(); return false; }
    // Recovery itself has the same save-before-publish guarantee as a game command.
    const result = await transaction(() => {
      lobby.restore(target, 'server_restarted', live);
      lobby.reconcileRecall();
    });
    if (!result.durable) return false;
    status = { ...status, state: 'ready', recovered: !reset && target.room !== null };
    cue = undefined; publish(); return true;
  }
  function execute(connection: string, command: LobbyCommand, input: unknown): Promise<LobbyReply> {
    return enqueue(async () => {
      if (stopping || !initialized) return { ok: false, error: 'STORAGE_UNAVAILABLE' };
      if (command === 'storage:retry' || command === 'storage:reset') {
        if (lobby.viewFor(connection)?.kind !== 'organizer') return { ok: false, error: 'FORBIDDEN' };
        if (!store || status.state === 'ready') return { ok: false, error: 'INVALID_PHASE' };
        if (!input || typeof input !== 'object' || Array.isArray(input) || command === 'storage:reset' && (input as { confirm?: unknown }).confirm !== true) return { ok: false, error: 'INVALID_INPUT' };
        return await recover(command === 'storage:reset') ? { ok: true, view: viewFor(connection)! } : { ok: false, error: 'STORAGE_UNAVAILABLE' };
      }
      if (status.state !== 'ready') {
        // Authentication and read-only recovery remain available; mutations stay blocked.
        if (!['organizer:authorize', 'lobby:sync', 'player:resume'].includes(command)) return { ok: false, error: 'STORAGE_UNAVAILABLE' };
        if (command === 'player:resume' && !lobby.exportState().room) return { ok: false, error: 'STORAGE_UNAVAILABLE' };
        const result = lobby.execute(connection, command, input);
        if (dirty) publish();
        return result.ok ? { ok: true, view: viewFor(connection)! } : result;
      }
      const result = await transaction(() => lobby.execute(connection, command, input));
      if (!result.durable) return { ok: false, error: 'STORAGE_UNAVAILABLE' };
      return result.value.ok ? { ...result.value, view: viewFor(connection)! } : result.value;
    });
  }
  function catalogExecute(connection: string, input: unknown): Promise<CatalogReply> {
    return enqueue(async () => {
      if (stopping || !initialized || status.state !== 'ready') return { ok: false, error: 'STORAGE_UNAVAILABLE' };
      const result = await transaction(() => lobby.catalogExecute(connection, input));
      return result.durable ? result.value : { ok: false, error: 'STORAGE_UNAVAILABLE' };
    });
  }
  function disconnect(connection: string): Promise<void> {
    return enqueue(async () => {
      if (stopping) return;
      if (status.state === 'ready') await transaction(() => lobby.disconnect(connection));
      else { lobby.disconnect(connection); if (dirty) publish(); }
    });
  }
  function close(): Promise<void> {
    if (closing) return closing;
    stopping = true;
    closing = enqueue(async () => {
      try {
        if (initialized && status.state === 'ready') { lobby.checkpoint(); await write(); }
      } finally { lobby.dispose(); listeners.clear(); visible.clear(); await store?.close(); }
    });
    return closing;
  }
  return { execute, catalogExecute, disconnect, viewFor, initialize, close,
    subscribe(listener: (cue?: GameCue) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
export type Session = ReturnType<typeof createSession>;
