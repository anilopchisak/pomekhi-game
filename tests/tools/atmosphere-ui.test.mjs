// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhoneSound } from '../../src/client/pages/player/ui/PhoneSound.js';
import { SoundControls } from '../../src/client/pages/host/ui/SoundControls.js';
import { PhaseSignals } from '../../src/client/shared/ui/index.js';
import { createProceduralAudio, defaultLevels } from '../../src/client/shared/audio/index.js';
import { createGame } from '../../src/server/game.js';
import { createSession } from '../../src/server/session.js';
import { audioHarness } from '../helpers/audio.mjs';
let root, container, harness;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); harness = audioHarness(); vi.stubGlobal('AudioContext', harness.Audio);
  container = globalThis.document.createElement('div'); globalThis.document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
function game() { const owner = createGame({ generateId: () => 'id', randomIndex: () => 0, onChange() {} }); const v = owner.publicState(); owner.dispose(); return v; }
it('plays distinct phone chimes for the three live round transitions without replaying them', async () => {
  const props = { online: true, clockOffset: 0, enabled: false, phoneChimes: true };
  const render = () => root.render(createElement(PhaseSignals, { ...props, claim: async enabled => { props.enabled = enabled; render(); return true; } }));
  await act(async () => render());
  await act(async () => container.querySelector('input').click());
  expect(harness.tones).toHaveLength(2);
  harness.finish();
  await act(async () => container.querySelector('button').click());
  expect(harness.tones).toHaveLength(2);
  harness.finish();

  const patterns = [];
  for (const [index, phase] of ['placement', 'search', 'return'].entries()) {
    props.cue = { roomId: 'room', version: index + 1, phase, kind: index === 0 ? 'start' : 'phase', serverNow: globalThis.performance.now() };
    if (phase === 'search') {
      const audio = harness.contexts[0];
      audio.state = 'suspended';
      let resume;
      vi.spyOn(audio, 'resume').mockImplementationOnce(() => new Promise(resolve => {
        resume = () => { audio.state = 'running'; resolve(); };
      }));
      await act(async () => render());
      expect(harness.tones).toHaveLength(0);
      props.clockOffset = 1;
      await act(async () => render());
      await act(async () => resume());
    } else {
      await act(async () => render());
    }
    expect(harness.tones.length).toBeGreaterThan(1);
    patterns.push(harness.tones.map(tone => tone.frequency.value).join(','));
    harness.finish();
    props.cue = { ...props.cue };
    await act(async () => render());
    expect(harness.tones).toHaveLength(0);
  }
  expect(new Set(patterns).size).toBe(3);
  props.cue = { ...props.cue, version: 4, serverNow: globalThis.performance.now() - 3000 };
  await act(async () => render());
  expect(harness.tones).toHaveLength(0);
});
it('keeps host audio silent after storage recovery until a new source selection', async () => {
  globalThis.sessionStorage.clear();
  let disk = null, fail = false;
  const session = createSession({ organizerCode: 'TESTHOSTCODE', store: {
    async acquire() {}, async close() {}, async preserve() {},
    async load() { return globalThis.structuredClone(disk); },
    async write(value) { if (fail) throw new Error('Injected write failure'); disk = globalThis.structuredClone(value); },
  } });
  const claim = vi.fn(async enabled => (await session.execute('host', 'organizer:audio', { enabled })).ok);
  const prepareRef = { current: null };
  async function render() {
    const view = session.viewFor('host'), online = view.persistence.state === 'ready';
    await act(async () => root.render(createElement(SoundControls, { enabled: view.audioEnabled, online, disabled: !online,
      game: view.room.game, gameVersion: view.room.game.version, clockOffset: 0, prepareRef, claim })));
  }
  try {
    await session.initialize();
    expect((await session.execute('host', 'organizer:authorize', { code: 'TESTHOSTCODE' })).ok).toBe(true);
    expect((await session.execute('host', 'room:create', {})).ok).toBe(true);
    await render(); await act(async () => container.querySelector('button').click()); await render(); harness.finish();
    expect(harness.nodes.size).toBeGreaterThan(1);
    const read = await session.catalogExecute('host', { action: 'read' });
    fail = true;
    expect(await session.catalogExecute('host', { action: 'save', revision: read.catalog.revision, requestId: 'audio-write-failure',
      entry: { ...read.catalog.file.entries[0], enabled: false } })).toEqual({ ok: false, error: 'STORAGE_UNAVAILABLE' });
    await render(); expect(harness.nodes.size).toBe(1);
    expect(session.viewFor('host')).toMatchObject({ audioEnabled: true, persistence: { state: 'write_error' } });
    fail = false;
    expect((await session.execute('host', 'storage:retry', {})).ok).toBe(true);
    await render(); expect(harness.nodes.size).toBe(1);
    expect(session.viewFor('host')).toMatchObject({ audioEnabled: false, persistence: { state: 'ready' } });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button').textContent).toBe('Включить звук здесь');
    await act(async () => container.querySelector('button').click()); await render(); harness.finish();
    expect(claim).toHaveBeenCalledTimes(2); expect(harness.nodes.size).toBeGreaterThan(1);
  } finally { fail = false; await session.close(); }
});
it('keeps audio nodes bounded across ten simulated minutes and cleans every owned node', () => {
  vi.useFakeTimers();
  const engine = createProceduralAudio(new harness.Audio(), () => .5);
  return engine.resume().then(() => {
    engine.update({ running: true, phase: 'search', paused: false, levels: defaultLevels });
    const baseline = harness.nodes.size;
    for (let second = 0; second < 600; second++) {
      vi.advanceTimersByTime(1000); harness.finish(); expect(harness.nodes.size).toBe(baseline);
    }
    engine.update({ running: true, phase: 'search', paused: true, levels: defaultLevels });
    expect(vi.getTimerCount()).toBe(0);
    engine.dispose(); expect(harness.nodes.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
});
it('plays phone effects only after explicit enable and consumes duplicate events', async () => {
  const props = { online: true, clockOffset: 0, view: { kind: 'player', revision: 1, audioEnabled: false, playerId: 'p1',
    room: { id: 'room', phoneScaresEnabled: true, game: { ...game(), phase: 'search', roundId: 'round', activePlayerIds: ['p1'], roundPlan: { kind: 'regular' } } },
    play: { status: 'exorcist' }, synchronization: null } };
  const render = () => root.render(createElement(PhoneSound, { ...props, claim: async enabled => { props.view = { ...props.view, audioEnabled: enabled }; render(); return true; } }));
  props.scare = { id: 'before-enable', roomId: 'room', roundId: 'round', serverNow: globalThis.performance.now(), variant: 0 };
  await act(async () => render()); expect(harness.tones).toHaveLength(0);
  await act(async () => container.querySelector('button').click()); expect(harness.tones).toHaveLength(1);
  props.scare = { ...props.scare, id: 'live', serverNow: globalThis.performance.now() }; await act(async () => render()); expect(harness.tones).toHaveLength(2);
  await act(async () => render()); expect(harness.tones).toHaveLength(2);
  props.scare = { ...props.scare, id: 'old', serverNow: globalThis.performance.now() - 3000 }; await act(async () => render()); expect(harness.tones).toHaveLength(2);
  props.view = { ...props.view, room: { ...props.view.room, game: { ...props.view.room.game, paused: true } } };
  props.scare = { ...props.scare, id: 'paused', serverNow: globalThis.performance.now() }; await act(async () => render()); expect(harness.tones).toHaveLength(2);
  await act(async () => container.querySelector('button').click()); expect(container.textContent).toContain('Включить жуткие звуки');
});
it('cancels consent on a hidden page without automatic reenabling', async () => {
  const claim = vi.fn().mockResolvedValue(true);
  const props = { online: true, clockOffset: 0, claim, view: { kind: 'player', audioEnabled: true, room: { phoneScaresEnabled: true, game: game() } } };
  await act(async () => root.render(createElement(PhoneSound, props)));
  await act(async () => container.querySelector('button').click());
  vi.spyOn(globalThis.document, 'hidden', 'get').mockReturnValue(true);
  await act(async () => globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange')));
  expect(claim).toHaveBeenLastCalledWith(false);
});

it('skips an overdue ambient knock after a wall-clock gap', async () => {
  vi.useFakeTimers(); const engine = createProceduralAudio(new harness.Audio(), () => 0);
  await engine.resume(); engine.update({ running: true, phase: 'search', paused: false, levels: defaultLevels });
  vi.setSystemTime(Date.now() + 60000); vi.advanceTimersByTime(30000);
  expect(harness.tones).toHaveLength(0); engine.dispose(); expect(harness.nodes.size).toBe(0);
});
