import type { GameClock } from '../../src/server/game.js';

/** A scheduler that can distinguish normal elapsed time from a suspended process. */
export function controlledClock() {
  let now = 0, wall = 100000, sequence = 0;
  const jobs = new Map<number, { at: number; callback: () => void }>();
  const clock: GameClock = {
    now: () => now, wallNow: () => wall,
    schedule(callback, delay) { const id = ++sequence; jobs.set(id, { at: now + delay, callback }); return () => { jobs.delete(id); }; },
  };
  function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      const first = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (!first || first[1].at > target) break;
      wall += first[1].at - now; now = first[1].at;
      jobs.delete(first[0]); first[1].callback();
    }
    wall += target - now; now = target;
  }
  function jump(ms: number, wallOnly = false) { if (!wallOnly) now += ms; wall += ms; }
  return { clock, advance, jump, pending: () => jobs.size, callbacks: () => [...jobs.values()].map(job => job.callback) };
}
