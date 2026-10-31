import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { GameCue } from '../../../../shared/protocol.js';

export function SoundControls({ enabled, disabled, cue, claim, prepareRef, gameVersion, clockOffset }: {
  enabled: boolean; disabled: boolean; cue?: GameCue; claim: (enabled: boolean) => Promise<boolean>;
  prepareRef: RefObject<(() => Promise<void>) | null>;
  gameVersion: number; clockOffset: number | null;
}) {
  const context = useRef<AudioContext | null>(null);
  const consumed = useRef('');
  const [volume, setVolume] = useState(.2);
  const [muted, setMuted] = useState(false);
  const [message, setMessage] = useState('');
  const preferences = useRef({ volume, muted });
  useLayoutEffect(() => { preferences.current = { volume, muted }; }, [volume, muted]);

  function play(kind: GameCue['kind'] = 'phase') {
    const audio = context.current;
    const { volume, muted } = preferences.current;
    if (!audio || audio.state !== 'running' || muted || !volume) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    const now = audio.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(kind === 'pause' || kind === 'abort' ? 100 : 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(85, now + .45);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume * .35, now + .06);
    gain.gain.linearRampToValueAtTime(0, now + .5);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now); oscillator.stop(now + .52);
  }
  async function unlock() {
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      if (context.current.state !== 'running') throw new Error('Audio is suspended.');
      setMessage(''); return true;
    } catch { setMessage('Звук недоступен. Проверьте разрешения браузера; таймер продолжает работать.'); return false; }
  }
  useEffect(() => () => { void context.current?.close().catch(() => {}); }, []);
  useEffect(() => {
    let active = true;
    prepareRef.current = async () => {
      const audio = context.current;
      if (!enabled || !audio) return;
      let timer: number | undefined;
      try {
        // Safari can suspend audio around native dialogs. Resume from the control gesture,
        // but bound this wait so unavailable audio cannot block a game command.
        await Promise.race([audio.resume(), new Promise<void>(resolve => { timer = window.setTimeout(resolve, 250); })]);
        if (active) setMessage(audio.state === 'running' ? '' : 'Нажмите «Проверить звук», чтобы разрешить сигналы в этой вкладке.');
      } catch { if (active) setMessage('Звук недоступен; таймер продолжает работать.'); }
      finally { window.clearTimeout(timer); }
    };
    return () => { active = false; prepareRef.current = null; };
  }, [enabled, prepareRef]);
  useEffect(() => {
    if (!cue || cue.version !== gameVersion) return;
    const identity = `${cue.roomId}:${cue.version}`;
    if (consumed.current === identity) return;
    consumed.current = identity;
    if (!enabled) return;
    const audio = context.current;
    if (!audio) return;
    let canceled = false;
    const fresh = () => !canceled && clockOffset !== null && Math.abs(performance.now() + clockOffset - cue.serverNow) < 2000;
    if (audio.state === 'running') { if (fresh()) play(cue.kind); }
    else {
      setMessage('Нажмите «Проверить звук», если сигналы не слышны.');
      // A dialog's suspension can become visible after its click handler finishes.
      // Resume this live cue only; cleanup/freshness prevent a delayed replay.
      void audio.resume().then(() => {
        if (audio.state === 'running' && fresh()) { setMessage(''); play(cue.kind); }
      }).catch(() => {});
    }
    return () => { canceled = true; };
    // A cue is a live event, not a side effect of volume or ownership changes.
  }, [cue, gameVersion, enabled]);
  return <section aria-label="Звуковые сигналы">
    <h3>Звуковые сигналы</h3>
    <p>{enabled ? 'Сигналы играет эта панель.' : 'Для сигналов выберите одну панель ноутбука.'} Телефоны остаются без звука.</p>
    <button disabled={disabled} onClick={async () => {
      if (enabled) { await claim(false); return; }
      if (await unlock() && await claim(true)) play('start');
    }}>{enabled ? 'Выключить звук здесь' : 'Включить звук здесь'}</button>
    <button disabled={disabled || !enabled} onClick={async () => { if (await unlock()) play(); }}>Проверить звук</button>
    <label>Громкость<input type="range" min={0} max={1} step={.05} value={volume} onChange={event => setVolume(Number(event.target.value))} /></label>
    <label><input type="checkbox" checked={muted} onChange={event => setMuted(event.target.checked)} /> Без звука</label>
    {message && <p role="status">{message}</p>}
  </section>;
}
