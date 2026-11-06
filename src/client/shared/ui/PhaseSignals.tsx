import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GameCue } from '../../../shared/protocol.js';
import { createProceduralAudio, defaultLevels } from '../audio/index.js';
import type { ProceduralAudio } from '../audio/index.js';

const levels = { ...defaultLevels, background: 0, effects: 0 };

export function PhaseSignals({ cue, online, enabled, clockOffset, claim, phoneChimes = false, signalVolume = levels.signals }: {
  cue?: GameCue; online: boolean; enabled: boolean; clockOffset: number | null;
  claim: (enabled: boolean) => Promise<boolean>;
  phoneChimes?: boolean;
  signalVolume?: number;
}) {
  const engine = useRef<ProceduralAudio | null>(null);
  const consumed = useRef('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isFresh = useEffectEvent((signal: GameCue) =>
    !document.hidden && clockOffset !== null && Math.abs(performance.now() + clockOffset - signal.serverNow) < 2000);
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  useEffect(() => {
    if (!online || !enabled) engine.current?.stop();
  }, [online, enabled]);
  useEffect(() => {
    if (!cue) return;
    const { kind, phase } = cue;
    const transition = (kind === 'start' && phase === 'placement') ||
      (kind === 'phase' && (phase === 'search' || phase === 'return'));
    if (!transition && kind !== 'pause' && kind !== 'resume') return;
    const key = `${cue.roomId}:${cue.version}`;
    if (consumed.current === key) return;
    consumed.current = key;
    if (!online || !enabled || !isFresh(cue)) return;
    const audio = engine.current;
    if (!audio) return;
    let canceled = false;
    const play = () => {
      if (canceled || audio.state() !== 'running' || !isFresh(cue)) return;
      audio.update({ phase, paused: false, running: true, levels: { ...levels, signals: signalVolume } });
      if (phoneChimes && transition) audio.chime(phase);
      else audio.cue(kind, phase);
    };
    if (audio.state() === 'running') play();
    else void audio.resume().then(play).catch(() => {});
    return () => { canceled = true; };
  }, [cue, online, enabled, signalVolume, phoneChimes]);

  async function prepareSound() {
    engine.current ??= createProceduralAudio(new AudioContext());
    await engine.current.resume();
    if (engine.current.state() !== 'running') throw new Error('Audio is suspended.');
  }

  function preview() {
    const audio = engine.current;
    if (!phoneChimes || document.hidden || audio?.state() !== 'running') return;
    audio.update({ phase: 'placement', paused: false, running: true, levels: { ...levels, signals: signalVolume } });
    audio.chime('placement');
  }

  async function toggle() {
    setBusy(true); setMessage('');
    try {
      if (!enabled) await prepareSound();
      if (!await claim(!enabled)) throw new Error('Signal ownership request failed.');
      if (!enabled) preview();
    } catch {
      setMessage(enabled ? 'Не удалось выключить сигналы этапов. Повторите попытку.'
        : 'Не удалось включить сигналы этапов. Следите за этапами на экране.');
    } finally { setBusy(false); }
  }

  async function testSignal() {
    setBusy(true); setMessage('');
    try {
      await prepareSound();
      preview();
    } catch {
      setMessage('Не удалось воспроизвести сигнал. Повторите попытку.');
    } finally { setBusy(false); }
  }

  return <div>
    <label>
      <input type="checkbox" checked={enabled} disabled={!online || busy} onChange={() => void toggle()} />
      Сигналы этапов
    </label>
    {phoneChimes && enabled && <button type="button" disabled={!online || busy} onClick={() => void testSignal()}>Проверить сигнал</button>}
    {message && <small role="status">{message}</small>}
  </div>;
}
