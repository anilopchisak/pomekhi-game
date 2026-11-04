import { useEffect, useRef, useState } from 'react';
import type { GameCue } from '../../../shared/protocol.js';
import { createProceduralAudio, defaultLevels } from '../audio/index.js';
import type { ProceduralAudio } from '../audio/index.js';

const levels = { ...defaultLevels, background: 0, effects: 0 };

type SignalMode = 'sound' | 'vibration';

function vibrationPattern(cue: GameCue): number[] {
  if (cue.kind === 'pause') return [300];
  if (cue.kind === 'resume') return [120, 100, 240];
  if (cue.kind === 'start') return [160];
  return cue.phase === 'return' ? [160, 90, 160, 90, 300] : [160, 90, 160];
}

export function PhaseSignals({ cue, online, enabled, clockOffset, claim, previewOnEnable = false, signalVolume = levels.signals, allowVibration = false }: {
  cue?: GameCue; online: boolean; enabled: boolean; clockOffset: number | null;
  claim: (enabled: boolean) => Promise<boolean>;
  previewOnEnable?: boolean;
  signalVolume?: number;
  allowVibration?: boolean;
}) {
  const engine = useRef<ProceduralAudio | null>(null);
  const consumed = useRef('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<SignalMode>('sound');
  const supportsVibration = allowVibration && typeof navigator.vibrate === 'function';
  const vibration = supportsVibration && mode === 'vibration';
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  useEffect(() => {
    if (!online || !enabled || vibration) engine.current?.stop();
  }, [online, enabled, vibration]);
  useEffect(() => {
    if (!vibration || !online || !enabled) return;
    return () => { navigator.vibrate(0); };
  }, [vibration, online, enabled]);
  useEffect(() => {
    if (!cue || !(cue.kind === 'pause' || cue.kind === 'resume' || (cue.kind === 'start' && cue.phase === 'placement') ||
      (cue.kind === 'phase' && (cue.phase === 'search' || cue.phase === 'return')))) return;
    const key = `${cue.roomId}:${cue.version}`;
    if (consumed.current === key) return;
    consumed.current = key;
    if (!online || !enabled || clockOffset === null || document.hidden) return;
    if (vibration) {
      if (Math.abs(performance.now() + clockOffset - cue.serverNow) < 2000) navigator.vibrate(vibrationPattern(cue));
      return;
    }
    const audio = engine.current;
    if (!audio) return;
    let canceled = false;
    function play() {
      if (!audio || canceled || document.hidden || clockOffset === null || Math.abs(performance.now() + clockOffset - cue!.serverNow) >= 2000) return;
      audio.update({ phase: cue!.phase, paused: false, running: true, levels: { ...levels, signals: signalVolume } });
      audio.cue(cue!.kind, cue!.phase);
    }
    if (audio.state() === 'running') play();
    else void audio.resume().then(play).catch(() => {});
    return () => { canceled = true; };
  }, [cue, online, enabled, clockOffset, signalVolume, vibration]);

  async function prepareSound() {
    engine.current ??= createProceduralAudio(new AudioContext());
    await engine.current.resume();
    if (engine.current.state() !== 'running') throw new Error('Audio is suspended.');
  }

  function preview(useVibration: boolean) {
    if (!previewOnEnable || document.hidden) return;
    if (useVibration) {
      if (!navigator.vibrate(160)) setMessage('Телефон не запустил вибрацию. Можно выбрать звук.');
    } else if (engine.current?.state() === 'running') {
      engine.current.update({ phase: 'placement', paused: false, running: true, levels: { ...levels, signals: signalVolume } });
      engine.current.cue('start', 'placement');
    }
  }

  async function changeMode(next: SignalMode) {
    setBusy(true); setMessage('');
    try {
      if (enabled && next === 'sound') await prepareSound();
      setMode(next);
      if (enabled) preview(next === 'vibration');
    } catch {
      setMessage('Не удалось включить звук. Повторите попытку.');
    } finally { setBusy(false); }
  }

  async function toggle() {
    setBusy(true); setMessage('');
    try {
      if (!enabled && !vibration) await prepareSound();
      if (!await claim(!enabled)) throw new Error('Signal ownership request failed.');
      if (!enabled) preview(vibration);
    } catch {
      setMessage(enabled ? 'Не удалось выключить сигналы этапов. Повторите попытку.'
        : 'Не удалось включить сигналы этапов. Следите за этапами на экране.');
    } finally { setBusy(false); }
  }

  return <div>
    <label>
      <input type="checkbox" checked={enabled} disabled={!online || busy} onChange={() => void toggle()} />
      Сигналы этапов
    </label>
    {supportsVibration && <label>Тип сигнала
      <select value={mode} disabled={busy || !online} onChange={event => void changeMode(event.currentTarget.value === 'vibration' ? 'vibration' : 'sound')}>
        <option value="sound">Звук</option>
        <option value="vibration">Вибрация</option>
      </select>
    </label>}
    {allowVibration && !supportsVibration && <small>В этом браузере доступны звуковые сигналы.</small>}
    {message && <small role="status">{message}</small>}
  </div>;
}
