// WebAudio: metronome clicks, cue tones, and a small poly synth (Move is silent in control-surface mode).
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.voices = new Map(); this.volume = 0.5; }
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  setVolume(v) { this.volume = Math.min(1, Math.max(0, v)); if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02); }

  click(accent = false, when = 0) {
    const ctx = this.ensure(); const t = when || ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1600 : 1000;
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.06);
  }

  tone(midi, dur = 0.4) {
    const ctx = this.ensure(); const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  }

  /** Simple 2-osc poly voice with velocity; call noteOff to release. */
  noteOn(midi, velocity = 100) {
    const ctx = this.ensure(); const t = ctx.currentTime;
    this.noteOff(midi);
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = f; o2.frequency.value = f * 1.005; o2.detune.value = -7;
    lp.type = 'lowpass'; lp.frequency.value = 600 + (velocity / 127) * 4000; lp.Q.value = 1;
    const peak = 0.12 + (velocity / 127) * 0.18;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.25);
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(this.master); o1.start(t); o2.start(t);
    this.voices.set(midi, { o1, o2, g });
  }
  noteOff(midi) {
    const v = this.voices.get(midi); if (!v) return; this.voices.delete(midi);
    const t = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    v.o1.stop(t + 0.2); v.o2.stop(t + 0.2);
  }
  allNotesOff() { for (const m of [...this.voices.keys()]) this.noteOff(m); }
}

/** Scheduler that fires `onBeat(beatIndex, wallTimeMs, accent)` steadily using lookahead. */
export class Metronome {
  constructor(audio) { this.audio = audio; this.timer = null; this.bpm = 90; this.beat = 0; this.next = 0; this.onBeat = null; this.beatsPerBar = 4; }
  start(bpm) { this.bpm = bpm; this.beat = 0; const ctx = this.audio.ensure(); this.next = ctx.currentTime + 0.1; this.timer = setInterval(() => this.tick(), 25); }
  stop() { clearInterval(this.timer); this.timer = null; }
  tick() {
    const ctx = this.audio.ctx;
    while (this.next < ctx.currentTime + 0.1) {
      const accent = this.beat % this.beatsPerBar === 0;
      this.audio.click(accent, this.next);
      this.onBeat?.(this.beat, performance.now() + (this.next - ctx.currentTime) * 1000, accent);
      this.next += 60 / this.bpm; this.beat++;
    }
  }
}
