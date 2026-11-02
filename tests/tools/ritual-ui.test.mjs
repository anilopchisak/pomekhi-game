// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RitualBoard } from '../../src/client/shared/ui/RitualBoard.js';
import { ResultsSummary } from '../../src/client/shared/ui/ResultsSummary.js';
import { createGame } from '../../src/server/game.js';
import { newRitual } from '../../src/server/ritual.js';
let root, container;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = globalThis.document.createElement('div'); globalThis.document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const row = n => ({ roundId: `ui-round-${n}`, number: n, kind: 'regular', status: 'final', rescuedGroups: 3, missions: 4, totalGroups: 3, totalMissions: 4, infectedPlayers: 0, activeMs: 1000, difficulty: 1, infectionEnabled: true });
function state() { const game = createGame({ generateId: () => 'ui-id', randomIndex: () => 0, onChange() {} }); const snapshot = game.publicState(); game.dispose(); return snapshot; }
it('keeps provisional rules hidden and the live outcome a native heading', async () => {
  const ritual = newRitual(7, 7, () => 0, () => 'ui-id');
  await act(async () => root.render(createElement(RitualBoard, { game: { ...state(), ritual: ritual.snapshot({ ...row(1), status: 'provisional' }) } })));
  expect(container.querySelector('h3').textContent).toBe('Ритуал продолжается');
  expect(container.querySelector('h3').getAttribute('role')).toBeNull();
  expect(container.textContent).toContain('Успехов предварительно: 7.');
  expect(container.textContent).not.toContain(ritual.exportState().cards[0].title);
  expect(container.textContent).not.toContain(ritual.exportState().cards[1].rule);
});
it('marks closed rules inactive and excludes freeplay from original team totals', async () => {
  const ritual = newRitual(7, 7, () => 0, () => 'ui-id'); const results = Array.from({ length: 5 }, (_, i) => row(i + 1));
  results.slice(0, 4).forEach(r => ritual.commit(r));
  await act(async () => root.render(createElement('div', {}, createElement(RitualBoard, { game: { ...state(), ritual: ritual.snapshot(), freeplayFrom: 4 } }), createElement(ResultsSummary, { results, freeplayFrom: 4 }))));
  expect(container.textContent).toContain('Победа · дом освобождён');
  expect(container.textContent).toContain('Правила прорицаний больше не действуют.');
  expect(container.textContent).toContain('Спасено групп: 12 / 12. Миссии: 16 / 16.');
  expect(container.textContent).toContain('Завершено дополнительных раундов: 1.');
});
