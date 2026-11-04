import type { GameCue, GamePhase, RitualOutcome } from '../../../shared/protocol.js';

export interface AudioLevels { background: number; signals: number; effects: number; muted: boolean }
export const defaultLevels: AudioLevels = { background: .12, signals: .2, effects: .1, muted: false };
type Voice = { source: OscillatorNode | AudioBufferSourceNode; gain: GainNode; cleanup?: () => void };

/** Owns all Web Audio nodes and ambient timers. No networking or game transitions. */
export function createProceduralAudio(audio: AudioContext, random = Math.random) {
  let levels = { ...defaultLevels }, phase: GamePhase = 'lobby', running = false, paused = false, closed = false;
  let drone: Voice | undefined, pulse: Voice | undefined, knockTimer: ReturnType<typeof setTimeout> | undefined, duckTimer: ReturnType<typeof setTimeout> | undefined;
  const voices = new Set<Voice>();
  const master = audio.createDynamicsCompressor();
  master.threshold.value = -16; master.knee.value = 18; master.ratio.value = 8; master.attack.value = .01; master.release.value = .2;
  master.connect(audio.destination);
  function ramp(gain: GainNode, value: number, seconds: number) {
    gain.gain.cancelScheduledValues(audio.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, audio.currentTime);
    gain.gain.linearRampToValueAtTime(value, audio.currentTime + seconds);
  }
  function disposeVoice(voice: Voice) { if (!voices.delete(voice)) return; voice.cleanup?.(); voice.source.disconnect(); voice.gain.disconnect(); }
  function oscillator(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine') {
    if (closed || audio.state !== 'running' || levels.muted || !volume) return;
    const source = audio.createOscillator(), gain = audio.createGain(), voice = { source, gain };
    voices.add(voice); source.type = type; source.frequency.setValueAtTime(frequency, audio.currentTime);
    source.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * .65), audio.currentTime + duration);
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(volume * .35, audio.currentTime + .035);
    gain.gain.linearRampToValueAtTime(0, audio.currentTime + duration);
    source.connect(gain); gain.connect(master); source.onended = () => disposeVoice(voice);
    source.start(); source.stop(audio.currentTime + duration + .02);
  }
  function noise(duration: number, volume: number, frequency: number) {
    if (closed || audio.state !== 'running' || levels.muted || !volume) return;
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (random() * 2 - 1) * (1 - i / data.length);
    source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .7;
    const voice = { source, gain, cleanup: () => filter.disconnect() }; voices.add(voice);
    gain.gain.setValueAtTime(0, audio.currentTime); gain.gain.linearRampToValueAtTime(volume * .3, audio.currentTime + .025);
    gain.gain.linearRampToValueAtTime(0, audio.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.onended = () => disposeVoice(voice);
    source.start(); source.stop(audio.currentTime + duration + .02);
  }
  function target() {
    if (!running || paused || closed || levels.muted || phase === 'finished') return 0;
    return levels.background * ({ lobby: .25, reading: .25, between_rounds: .25, placement: .65, search: 1, return: .4 }[phase] ?? 0) * .15;
  }
  function scheduleKnock() {
    clearTimeout(knockTimer); knockTimer = undefined;
    if (!running || paused || closed || phase !== 'search' || levels.muted || !levels.effects) return;
    const delay = 30000 + random() * 30000;
    const due = performance.now() + delay, dueWall = Date.now() + delay;
    knockTimer = setTimeout(() => {
      if (running && !paused && phase === 'search' && Math.abs(performance.now() - due) < 2000 && Math.abs(Date.now() - dueWall) < 2000) { oscillator(160, .18, levels.effects); noise(.3, levels.effects * .3, 600); }
      scheduleKnock();
    }, delay);
  }
  function update(next: { phase: GamePhase; paused: boolean; running: boolean; levels: AudioLevels }) {
    if (closed) return;
    const changed = phase !== next.phase || paused !== next.paused || running !== next.running || levels.effects !== next.levels.effects || levels.muted !== next.levels.muted;
    if (next.levels.muted && !levels.muted) stop();
    phase = next.phase; paused = next.paused; running = next.running; levels = { ...next.levels };
    if (target() > 0 && !drone) {
      const source = audio.createOscillator(), gain = audio.createGain();
      source.type = 'sine'; source.frequency.value = phase === 'search' ? 73 : 62;
      gain.gain.value = 0; drone = { source, gain }; voices.add(drone);
      source.connect(gain); gain.connect(master); source.start();
      const modulator = audio.createOscillator(), depth = audio.createGain();
      modulator.frequency.value = .16; depth.gain.value = 0;
      pulse = { source: modulator, gain: depth }; voices.add(pulse);
      modulator.connect(depth); depth.connect(gain.gain); modulator.start();
    }
    if (drone) { (drone.source as OscillatorNode).frequency.setValueAtTime(phase === 'search' ? 73 : 62, audio.currentTime); ramp(drone.gain, target(), running && !paused ? 1.5 : .15); }
    if (pulse) ramp(pulse.gain, target() * .22, running && !paused ? 1.5 : .15);
    if (changed) scheduleKnock();
    // Ownership is managed by the page; the engine never claims a sound capability.
  }
  function stop() {
    running = false; clearTimeout(knockTimer); clearTimeout(duckTimer); knockTimer = undefined;
    for (const voice of [...voices]) { voice.source.onended = () => disposeVoice(voice); try { voice.source.stop(); } catch { /* A one-shot may already have ended. */ } disposeVoice(voice); }
    drone = undefined; pulse = undefined;
  }
  function cue(kind: GameCue['kind'], cuePhase: GamePhase = phase, outcome?: RitualOutcome) {
    if (closed || !running || levels.muted) return;
    const pitch = kind === 'pause' ? 440 : kind === 'abort' ? 100 : kind === 'resume' ? 620 : kind === 'finish' ? outcome === 'won' ? 330 : 95 : cuePhase === 'return' ? 310 : cuePhase === 'search' ? 210 : 180;
    if (drone) ramp(drone.gain, target() * .2, .04);
    clearTimeout(duckTimer); duckTimer = setTimeout(() => { if (drone) ramp(drone.gain, target(), .4); }, 650);
    oscillator(pitch, kind === 'finish' ? .65 : .5, levels.signals);
  }
  function scare(variant: 0 | 1 | 2, volume: number) {
    const level = Math.min(.3, Math.max(0, volume));
    if (variant === 0) noise(.3, level, 1400);
    else if (variant === 1) { noise(.6, level * .6, 700); oscillator(140, .2, level); }
    else { oscillator(390, .65, level * .5, 'triangle'); noise(.45, level * .6, 1000); }
  }
  return { update, cue, scare, stop, dispose() { if (closed) return; stop(); closed = true; master.disconnect(); void audio.close().catch(() => {}); },
    resume: () => audio.resume(), state: () => audio.state };
}
export type ProceduralAudio = ReturnType<typeof createProceduralAudio>;
