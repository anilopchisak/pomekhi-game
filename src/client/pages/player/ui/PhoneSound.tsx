import { useEffect, useRef, useState } from 'react';
import type { LobbyView, PhoneScare } from '../../../../shared/protocol.js';
import { createProceduralAudio } from '../../../shared/audio/index.js';
import type { ProceduralAudio } from '../../../shared/audio/index.js';

type PlayerView = Extract<LobbyView, { kind: 'player' }>;
export function PhoneSound({ view, scare, online, clockOffset, claim }: {
  view: PlayerView; scare?: PhoneScare; online: boolean; clockOffset: number | null;
  claim: (enabled: boolean) => Promise<boolean>;
}) {
  const engine = useRef<ProceduralAudio | null>(null), consumed = useRef(new Set<string>());
  const opted = useRef(false), operation = useRef(0);
  const [volume, setVolume] = useState(.15), [message, setMessage] = useState('');
  const current = useRef({ volume, view, online }); current.current = { volume, view, online };
  useEffect(() => () => { operation.current++; engine.current?.dispose(); engine.current = null; opted.current = false; }, []);
  useEffect(() => {
    if (!online || !view.audioEnabled || !view.room.phoneScaresEnabled) engine.current?.stop();
    if (!online || !view.audioEnabled) opted.current = false;
  }, [online, view.audioEnabled, view.room.phoneScaresEnabled]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { operation.current++; engine.current?.stop(); if (opted.current) void claim(false); opted.current = false; } };
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', hide);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', hide); };
  }, [claim]);
  useEffect(() => {
    if (!scare || consumed.current.has(scare.id)) return;
    consumed.current.add(scare.id);
    if (consumed.current.size > 32) consumed.current.delete(consumed.current.values().next().value!);
    const v = current.current;
    if (!opted.current || !v.online || !v.view.audioEnabled || !v.view.room.phoneScaresEnabled || document.hidden
      || v.view.room.id !== scare.roomId || v.view.room.game.roundId !== scare.roundId || v.view.room.game.phase !== 'search'
      || v.view.room.game.paused || v.view.room.game.roundPlan.kind === 'tutorial' || !v.view.room.game.activePlayerIds.includes(v.view.playerId)
      || v.view.play?.status === 'released' || v.view.synchronization?.withdrawn || engine.current?.state() !== 'running'
      || clockOffset === null || Math.abs(performance.now() + clockOffset - scare.serverNow) >= 2000) return;
    engine.current.scare(scare.variant, v.volume);
  }, [scare, clockOffset]);
  useEffect(() => {
    if (view.room.game.paused || view.room.game.phase !== 'search' || view.play?.status === 'released' || view.synchronization?.withdrawn) engine.current?.stop();
    // WebKit can suspend an unlocked context between phases or after a native dialog.
    // Resume existing consent, never a skipped effect or consent lost on hide/disconnect.
    if (opted.current && online && view.audioEnabled && view.room.phoneScaresEnabled && !document.hidden && !view.room.game.paused && view.play?.status !== 'released') {
      void engine.current?.resume().catch(() => setMessage('Нажмите «Проверить жуткий звук», чтобы разрешить звук в этой вкладке.'));
    }
  }, [online, view.audioEnabled, view.room.phoneScaresEnabled, view.room.game.paused, view.room.game.phase, view.play?.status, view.synchronization?.withdrawn]);
  useEffect(() => {
    const resume = () => { const v = current.current; if (opted.current && v.online && v.view.audioEnabled && !document.hidden) void engine.current?.resume().catch(() => {}); };
    document.addEventListener('click', resume);
    return () => document.removeEventListener('click', resume);
  }, []);
  async function toggle() {
    const attempt = ++operation.current;
    if (view.audioEnabled && opted.current) { opted.current = false; engine.current?.stop(); await claim(false); return; }
    try {
      engine.current ??= createProceduralAudio(new AudioContext());
      await engine.current.resume();
      if (engine.current.state() !== 'running') throw new Error('Audio is suspended.');
      if (attempt !== operation.current || document.hidden || !current.current.online) return;
      opted.current = true;
      if (!await claim(true)) { opted.current = false; engine.current.stop(); return; }
      if (attempt !== operation.current || document.hidden || !current.current.online) { opted.current = false; engine.current.stop(); void claim(false); return; }
      engine.current.scare(0, current.current.volume); setMessage('');
    } catch { opted.current = false; setMessage('Звук недоступен. Карточка и игровые действия продолжают работать.'); }
  }
  const active = online && view.audioEnabled && opted.current;
  return <section aria-label="Жуткие звуки телефона">
    <h3>Жуткие звуки</h3>
    <p>Редкий короткий эффект только во время обычного поиска. Включение добровольное; после скрытия вкладки или потери связи включите заново.</p>
    {!view.room.phoneScaresEnabled && <p>Организатор отключил телефонные эффекты.</p>}
    <button disabled={!online || !view.room.phoneScaresEnabled && !active} onClick={() => void toggle()}>{active ? 'Выключить жуткие звуки' : 'Включить жуткие звуки'}</button>
    {active && <button disabled={!online || !view.room.phoneScaresEnabled} onClick={async () => { try { await engine.current?.resume(); if (engine.current?.state() === 'running' && opted.current) { engine.current.scare(0, current.current.volume); setMessage(''); } } catch { setMessage('Звук недоступен; игра продолжается.'); } }}>Проверить жуткий звук</button>}
    <label>Громкость жутких звуков<input type="range" min={0} max={.3} step={.01} value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); if (!value) { engine.current?.stop(); opted.current = false; void claim(false); } }} /></label>
    {message && <p role="status">{message}</p>}
  </section>;
}
