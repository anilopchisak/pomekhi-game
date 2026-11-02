import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { GameCue, GameSnapshot } from '../../../../shared/protocol.js';
import { createProceduralAudio, defaultLevels } from '../../../shared/audio/index.js';
import type { AudioLevels, ProceduralAudio } from '../../../shared/audio/index.js';

function savedLevels(): AudioLevels {
  try {
    const saved = JSON.parse(sessionStorage.getItem('pomekhi.sound') ?? 'null');
    if (saved && ['signals', 'background', 'effects'].every(key => typeof saved[key] === 'number' && saved[key] >= 0 && saved[key] <= 1) && typeof saved.muted === 'boolean') return saved;
  } catch { /* Use quiet defaults when storage is unavailable. */ }
  return { ...defaultLevels };
}
export function SoundControls({ enabled, disabled, cue, claim, prepareRef, gameVersion, clockOffset, game, online = true }: {
  enabled: boolean; disabled: boolean; cue?: GameCue; claim: (enabled: boolean) => Promise<boolean>;
  prepareRef: RefObject<(() => Promise<void>) | null>; gameVersion: number; clockOffset: number | null;
  game?: GameSnapshot; online?: boolean;
}) {
  const engine = useRef<ProceduralAudio | null>(null), consumed = useRef('');
  const [levels, setLevels] = useState(savedLevels), [message, setMessage] = useState('');
  const current = useRef({ levels, enabled, online, game });
  const apply = () => { const v = current.current; engine.current?.update({ levels: v.levels, running: v.enabled && v.online, phase: v.game?.phase ?? 'lobby', paused: v.game?.paused ?? false }); };
  useLayoutEffect(() => { current.current = { levels, enabled, online, game }; apply(); }, [levels, enabled, online, game]);
  useEffect(() => { try { sessionStorage.setItem('pomekhi.sound', JSON.stringify(levels)); } catch { /* Audio remains usable. */ } }, [levels]);
  useEffect(() => {
    if (!enabled || !online) engine.current?.stop();
  }, [enabled, online]);
  async function unlock() {
    try {
      engine.current ??= createProceduralAudio(new AudioContext());
      await engine.current.resume();
      if (engine.current.state() !== 'running') throw new Error('Audio is suspended.');
      setMessage(''); apply(); return true;
    } catch { setMessage('Звук недоступен. Проверьте разрешения браузера; таймер продолжает работать.'); return false; }
  }
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  useEffect(() => {
    let active = true;
    prepareRef.current = async () => {
      if (!current.current.enabled || !engine.current) return;
      let timer: number | undefined;
      try {
        await Promise.race([engine.current.resume(), new Promise<void>(resolve => { timer = window.setTimeout(resolve, 250); })]);
        if (active) setMessage(engine.current.state() === 'running' ? '' : 'Нажмите «Проверить звук», чтобы разрешить сигналы в этой вкладке.');
      } catch { if (active) setMessage('Звук недоступен; таймер продолжает работать.'); }
      finally { window.clearTimeout(timer); }
    };
    return () => { active = false; prepareRef.current = null; };
  }, [prepareRef]);
  useEffect(() => {
    if (!cue || cue.version !== gameVersion) return;
    const identity = `${cue.roomId}:${cue.version}`;
    if (consumed.current === identity) return;
    consumed.current = identity;
    if (!enabled || !online || !engine.current) return;
    let canceled = false;
    const fresh = () => !canceled && current.current.enabled && current.current.online && clockOffset !== null && Math.abs(performance.now() + clockOffset - cue.serverNow) < 2000;
    const play = () => { if (fresh()) { apply(); engine.current?.cue(cue.kind, cue.phase, game?.ritual?.outcome); } };
    if (engine.current.state() === 'running') play();
    else { setMessage('Нажмите «Проверить звук», если сигналы не слышны.'); void engine.current.resume().then(play).catch(() => {}); }
    return () => { canceled = true; };
  }, [cue, gameVersion, enabled, online]);
  return <section aria-label="Звуковые сигналы">
    <h3>Звук дома</h3>
    <p>{enabled ? 'Сигналы и фон играет эта панель.' : 'Выберите одну панель ноутбука для звука.'} Телефонные эффекты включаются отдельно.</p>
    <button disabled={disabled} onClick={async () => {
      if (enabled) { engine.current?.stop(); await claim(false); return; }
      if (await unlock() && await claim(true)) { current.current.enabled = true; apply(); engine.current?.cue('start'); }
    }}>{enabled ? 'Выключить звук здесь' : 'Включить звук здесь'}</button>
    <button disabled={disabled || !enabled} onClick={async () => { if (await unlock()) engine.current?.cue('phase'); }}>Проверить звук</button>
    {(['signals', 'background', 'effects'] as const).map((key, i) => <label key={key}>{['Громкость сигналов', 'Громкость фона', 'Громкость эффектов'][i]}<input type="range" min={0} max={1} step={.01} value={levels[key]} onChange={event => setLevels(v => ({ ...v, [key]: Number(event.target.value) }))} /></label>)}
    <label><input type="checkbox" checked={levels.muted} onChange={event => setLevels(v => ({ ...v, muted: event.target.checked }))} /> Без звука</label>
    {message && <p role="status">{message}</p>}
  </section>;
}
