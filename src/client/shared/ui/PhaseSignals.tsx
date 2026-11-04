import { useEffect, useRef, useState } from 'react';
import type { GameCue } from '../../../shared/protocol.js';
import { createProceduralAudio, defaultLevels } from '../audio/index.js';
import type { ProceduralAudio } from '../audio/index.js';

const levels = { ...defaultLevels, background: 0, effects: 0 };

export function PhaseSignals({ cue, online, enabled, clockOffset, claim, previewOnEnable = false, signalVolume = levels.signals }: {
  cue?: GameCue; online: boolean; enabled: boolean; clockOffset: number | null;
  claim: (enabled: boolean) => Promise<boolean>;
  previewOnEnable?: boolean;
  signalVolume?: number;
}) {
  const engine = useRef<ProceduralAudio | null>(null);
  const consumed = useRef('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  useEffect(() => { if (!online || !enabled) engine.current?.stop(); }, [online, enabled]);
  useEffect(() => {
    if (!cue || !((cue.kind === 'start' && cue.phase === 'placement') ||
      (cue.kind === 'phase' && (cue.phase === 'search' || cue.phase === 'return')))) return;
    const key = `${cue.roomId}:${cue.version}`;
    if (consumed.current === key) return;
    consumed.current = key;
    const audio = engine.current;
    if (!audio || !online || !enabled || clockOffset === null || document.hidden) return;
    let canceled = false;
    function play() {
      if (!audio || canceled || document.hidden || clockOffset === null || Math.abs(performance.now() + clockOffset - cue!.serverNow) >= 2000) return;
      audio.update({ phase: cue!.phase, paused: false, running: true, levels: { ...levels, signals: signalVolume } });
      audio.cue(cue!.kind, cue!.phase);
    }
    if (audio.state() === 'running') play();
    else void audio.resume().then(play).catch(() => {});
    return () => { canceled = true; };
  }, [cue, online, enabled, clockOffset, signalVolume]);

  async function toggle() {
    setBusy(true); setMessage('');
    try {
      if (!enabled) {
        engine.current ??= createProceduralAudio(new AudioContext());
        await engine.current.resume();
        if (engine.current.state() !== 'running') throw new Error('Audio is suspended.');
      }
      if (!await claim(!enabled)) throw new Error('Audio ownership request failed.');
      if (enabled) engine.current?.stop();
      else if (previewOnEnable && !document.hidden && engine.current?.state() === 'running') {
        engine.current.update({ phase: 'placement', paused: false, running: true, levels: { ...levels, signals: signalVolume } });
        engine.current.cue('start', 'placement');
      }
    } catch {
      setMessage(enabled ? 'Не удалось выключить сигналы этапов. Повторите попытку.'
        : 'Не удалось включить сигналы этапов. Следите за этапами на экране.');
    }
    finally { setBusy(false); }
  }
  return <div>
    <label>
      <input type="checkbox" checked={enabled} disabled={!online || busy} onChange={() => void toggle()} />
      Сигналы этапов
    </label>
    {message && <small role="status">{message}</small>}
  </div>;
}
