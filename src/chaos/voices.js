// Tone.js voice families + a mangled effects chain. Global `Tone` (vendored UMD build).
export class Voices {
  constructor(T = globalThis.Tone) {
    this.T = T;
    this.limiter = new T.Limiter(-3).toDestination();
    this.master = new T.Gain(0.7).connect(this.limiter);
    this.reverb = new T.Reverb({ decay: 4, wet: 0.35 }).connect(this.master);
    this.delay = new T.FeedbackDelay({ delayTime: '8n.', feedback: 0.45, wet: 0.3 }).connect(this.reverb);
    this.autoFilter = new T.AutoFilter({ frequency: '1m', depth: 0.6, baseFrequency: 300, octaves: 4, wet: 0.5 }).connect(this.delay).start();
    this.crusher = new T.BitCrusher({ bits: 8, wet: 0.1 }).connect(this.autoFilter);
    this.cheby = new T.Chebyshev({ order: 3, wet: 0.1 }).connect(this.crusher);
    this.bus = new T.Gain(1).connect(this.cheby);
    this.fam = {
      membrane: new T.PolySynth(T.MembraneSynth, { maxPolyphony: 4, volume: -6 }).connect(this.bus),
      pluck: new T.PolySynth(T.Synth, { maxPolyphony: 6, volume: -8, options: { oscillator: { type: 'triangle' }, envelope: { attack: 0.003, decay: 0.25, sustain: 0, release: 0.3 } } }).connect(this.bus),
      fm: new T.PolySynth(T.FMSynth, { maxPolyphony: 6, volume: -10, options: { harmonicity: 2.5, modulationIndex: 6, envelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.8 } } }).connect(this.bus),
      am: new T.PolySynth(T.AMSynth, { maxPolyphony: 5, volume: -10, options: { harmonicity: 1.5, envelope: { attack: 0.05, decay: 0.5, sustain: 0.2, release: 1.2 } } }).connect(this.bus),
      metal: new T.PolySynth(T.MetalSynth, { maxPolyphony: 3, volume: -18, options: { envelope: { attack: 0.001, decay: 0.3, release: 0.1 } } }).connect(this.bus),
      noise: new T.NoiseSynth({ volume: -14, noise: { type: 'pink' }, envelope: { attack: 0.005, decay: 0.15, sustain: 0 } }).connect(this.bus),
    };
    this.reverb.generate?.();
  }
  /** Active voices across all families (Tone PolySynths expose activeVoices). */
  activeVoices() { let n = 0; for (const f of Object.values(this.fam)) n += f.activeVoices ?? 0; return n; }
  capacity() { let n = 0; for (const f of Object.values(this.fam)) n += f.maxPolyphony ?? 1; return n; }
  play({ note, vel, family }, time) {
    const T = this.T; const f = this.fam[family] || this.fam.pluck; const freq = T.Frequency(note, 'midi').toFrequency();
    if (f.maxPolyphony && (f.activeVoices ?? 0) >= f.maxPolyphony) return false;   // never overrun a family: dropping is cheaper than glitching
    const dur = family === 'am' ? '4n' : family === 'fm' ? '8n' : '16n';
    try { if (family === 'noise') f.triggerAttackRelease(dur, time, vel); else f.triggerAttackRelease(freq, dur, time, vel); return true; } catch { return false; }
  }
  /** params in 0..1 */
  /** Re-lock the tempo-relative bits after a bpm change (Tone resolves note values at set time). */
  syncTempo() { this.delay.delayTime.value = this.T.Time('8n.').toSeconds(); this.autoFilter.frequency.value = this.T.Frequency('1m').toFrequency(); }
  apply({ morph, crush, space }) {
    const T = this.T;
    this.fam.fm.set({ harmonicity: 0.5 + morph * 6, modulationIndex: 1 + morph * 24 });
    this.fam.am.set({ harmonicity: 0.5 + morph * 4 });
    this.fam.pluck.set({ oscillator: { type: morph < 0.33 ? 'triangle' : morph < 0.66 ? 'sawtooth' : 'square' } });
    this.crusher.bits = Math.round(2 + (1 - crush) * 6); this.crusher.wet.value = crush * 0.9; this.cheby.order = 1 + Math.round(crush * 20) * 2; this.cheby.wet.value = crush * 0.6;
    this.delay.wet.value = space * 0.6; this.delay.feedback.value = 0.2 + space * 0.6; this.reverb.wet.value = space * 0.8;
  }
  setVolume(v) { this.master.gain.rampTo(v, 0.05); }
}
