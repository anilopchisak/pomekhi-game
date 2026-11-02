/** Deterministic Web Audio boundary for DOM and node-lifetime tests. */
export function audioHarness() {
  const nodes = new Set(), tones = [], ramps = [], contexts = [];
  function param() { return { value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; ramps.push(value); } }; }
  function node(fields = {}) { const n = { connect() {}, disconnect() { nodes.delete(n); }, ...fields }; nodes.add(n); return n; }
  class Audio {
    state = 'suspended'; currentTime = 0; sampleRate = 1000; destination = {};
    constructor() { contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createOscillator() {
      let timed = false;
      const frequency = param();
      const source = node({ frequency, start() {}, stop(at) { if (at !== undefined) { timed = true; tones.push(source); } else { source.onended?.(); } }, get timed() { return timed; } });
      return source;
    }
    createBufferSource() { const source = node({ start() {}, stop(at) { if (at === undefined) source.onended?.(); else tones.push(source); } }); return source; }
    createBuffer(_channels, count) { return { getChannelData() { return new Float32Array(count); } }; }
    createBiquadFilter() { return node({ frequency: param(), Q: param() }); }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createGain() { return node({ gain: param() }); }
  }
  function finish() { for (const source of [...tones]) source.onended?.(); tones.length = 0; }
  return { Audio, nodes, tones, ramps, contexts, finish };
}
