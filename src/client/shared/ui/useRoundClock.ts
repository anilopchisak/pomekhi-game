import { useEffect, useState } from 'react';
import type { GameSnapshot } from '../../../shared/protocol.js';

export function useRoundClock(game: GameSnapshot, offset: number | null) {
  const [, render] = useState(0);
  useEffect(() => {
    if (game.deadline === null || game.paused) return;
    const timer = window.setInterval(() => render(value => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [game.deadline, game.paused]);
  if (game.paused) return game.remainingMs;
  return game.deadline !== null && offset !== null ? Math.max(0, game.deadline - performance.now() - offset) : null;
}
