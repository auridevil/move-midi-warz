// Unassembler audio engine (plain Web Audio). The track ("deck") always keeps running underneath: an effect that takes
// over the sound mutes the deck and plays its own voice, so on release you land where the song would be (continuation).
import { beatSec, nextGrid } from './beats.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Effects. `x: true` = takes over the sound (one at a time, last pressed wins); the others stack on top. */
export const FX = {
  // stutters: repeat a slice captured on the grid; len in beats
  s2: { name: '1/2', x: true, kind: 'stutter', len: 2 }, s4: { name: '1/4', x: true, kind: 'stutter', len: 1 },
  s8: { name: '1/8', x: true, kind: 'stutter', len: 0.5 }, s16: { name: '1/16', x: true, kind: 'stutter', len: 0.25 },
  s32: { name: '1/32', x: true, kind: 'stutter', len: 0.125 }, s64: { name: '1/64', x: true, kind: 'stutter', len: 0.0625 },
  s8t: { name: '1/8 T', x: true, kind: 'stutter', len: 1 / 3 }, s16t: { name: '1/16 T', x: true, kind: 'stutter', len: 1 / 6 },
  // takeovers
  reverse: { name: 'reverse', x: true, kind: 'reverse' }, tape: { name: 'tape stop', x: true, kind: 'tape' },
  spin: { name: 'spin back', x: true, kind: 'spin' }, half: { name: 'half speed', x: true, kind: 'half' },
  freeze: { name: 'freeze', x: true, kind: 'freeze' }, scatter: { name: 'scatter', x: true, kind: 'scatter' },
  build: { name: 'build roll', x: true, kind: 'build' }, octave: { name: 'octave up', x: true, kind: 'octave' },
  // the bottom row: colour and damage
  filter: { name: 'filter sweep', kind: 'filter' }, crush: { name: 'bitcrush', kind: 'crush' }, gate: { name: 'gate 1/16', kind: 'gate' },
  echo: { name: 'echo throw', kind: 'echo' }, wash: { name: 'reverb wash', kind: 'wash' }, kill: { name: 'kill', x: true, kind: 'kill' },
  drop: { name: 'pitch drop', x: true, kind: 'drop' }, glitch: { name: 'glitch', x: true, kind: 'glitch' },
};
/** Pad layout, top row first (rows on the Move are bottom → top, so the app flips them). Row 2 = slices 1–8. */
export const LAYOUT = [
  ['s2', 's4', 's8', 's16', 's32', 's64', 's8t', 's16t'],
  ['slice0', 'slice1', 'slice2', 'slice3', 'slice4', 'slice5', 'slice6', 'slice7'],
  ['reverse', 'tape', 'spin', 'half', 'freeze', 'scatter', 'build', 'octave'],
  ['filter', 'crush', 'gate', 'echo', 'wash', 'kill', 'drop', 'glitch'],
];

function crushCurve(bits) {
  const n = 2048, c = new Float32Array(n), steps = 2 ** clamp(bits, 1, 16) / 2;
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * steps) / steps; } return c;
}
function impulse(ctx, seconds = 3.5) {
  const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2.5; } return b;
}

export class Engine extends EventTarget {
  constructor(ctx) {
    super(); this.ctx = ctx;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.deckBus = g(); this.fxBus = g(); this.pre = g();
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 20000; this.filter.Q.value = 0.7;
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 10;
    this.dry = g(1); this.crushWet = g(0); this.shaper = ctx.createWaveShaper(); this.shaper.curve = crushCurve(6); this.shaper.oversample = 'none';
    this.gate = g(1); this.out = g(0.9); this.wet = g(1); this.dryDirect = g(0); this.deckTap = g(1);
    this.echoSend = g(0); this.delay = ctx.createDelay(2); this.fb = g(0.5); this.echoTone = ctx.createBiquadFilter(); this.echoTone.type = 'bandpass'; this.echoTone.frequency.value = 1400; this.echoTone.Q.value = 0.6;
    this.washSend = g(0); this.verb = ctx.createConvolver(); this.verb.buffer = impulse(ctx); this.verbOut = g(0.8);
    this.limiter = ctx.createDynamicsCompressor(); this.limiter.threshold.value = -3; this.limiter.ratio.value = 12; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.1;
    // the deck feeds the effect chain (muted while an effect takes over) and, untouched, the dry side of the mix
    this.deckTap.connect(this.deckBus); this.deckTap.connect(this.dryDirect).connect(this.out);
    this.deckBus.connect(this.pre); this.fxBus.connect(this.pre);
    this.pre.connect(this.hp).connect(this.filter);
    this.filter.connect(this.dry).connect(this.gate); this.filter.connect(this.shaper).connect(this.crushWet).connect(this.gate);
    this.gate.connect(this.wet).connect(this.out);
    this.gate.connect(this.echoSend).connect(this.delay).connect(this.echoTone).connect(this.fb).connect(this.delay); this.echoTone.connect(this.wet);
    this.gate.connect(this.washSend).connect(this.verb).connect(this.verbOut).connect(this.wet);
    this.out.connect(this.limiter); this.output = this.limiter; // the app connects output → (recorder) → destination
    this.buffer = null; this.rev = null; this.grid = { bpm: 120, offset: 0 };
    this.playing = false; this.rate = 1; this.loop = null; // { start, end } in buffer seconds
    this.anchors = []; this.deck = null; this.quant = 0.25; this.held = []; this.voice = null; this.timers = new Set();
    this.base = { filter: 0, res: 0.7, crush: 0, echo: 0, feedback: 0.5, wash: 0, pitch: 0 }; this.mods = {};
  }
  get duration() { return this.buffer?.duration || 0; }
  /** Seconds of the track per beat (the grid is in track time; rate only changes how fast we move through it). */
  get beat() { return beatSec(this.grid.bpm); }
  load(buffer) {
    this.stop(); this.buffer = buffer;
    const rev = this.ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) { const s = buffer.getChannelData(c), d = rev.getChannelData(c); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; }
    this.rev = rev; this.loop = null; this.anchors = [{ t: 0, pos: this.grid.offset, rate: this.rate }];
  }

  // ---------- time ----------
  region() { return this.loop || { start: 0, end: this.duration }; }
  wrap(p) { const { start, end } = this.region(); const L = end - start; if (L <= 0) return 0; return p >= end || p < start ? start + ((((p - start) % L) + L) % L) : p; }
  /** Track position (s) at context time t. */
  posAt(t = this.ctx.currentTime) {
    if (!this.anchors.length) return 0; let a = this.anchors[0]; for (const x of this.anchors) if (x.t <= t) a = x;
    return this.playing ? this.wrap(a.pos + Math.max(0, t - a.t) * a.rate) : a.pos;
  }
  /** Context time of the next grid line (quantize setting), and the track position there. */
  nextAt(div = this.quant) {
    const now = this.ctx.currentTime + 0.01; if (!this.playing || !div) return { t: now, pos: this.posAt(now) };
    const p = this.posAt(now), gpos = nextGrid(p, this.grid, div); return { t: now + (gpos - p) / this.rate, pos: this.wrap(gpos) };
  }
  anchor(t, pos, rate = this.rate) { this.anchors = [...this.anchors.filter(a => a.t <= t).slice(-1), { t, pos, rate }]; }

  // ---------- deck ----------
  startDeck(t, pos) {
    const old = this.deck; if (old) { try { old.stop(t); } catch {} }
    const s = this.ctx.createBufferSource(); s.buffer = this.buffer; s.loop = true; const r = this.region(); s.loopStart = r.start; s.loopEnd = r.end;
    s.playbackRate.value = this.rate; s.connect(this.deckTap); s.start(t, pos); this.deck = s; this.anchor(t, pos);
  }
  play() { if (!this.buffer || this.playing) return; const t = this.ctx.currentTime + 0.03; const pos = this.posAt(); this.playing = true; this.startDeck(t, pos); this.emit('transport'); }
  stop() {
    if (!this.playing) return; const pos = this.posAt(); this.playing = false;
    try { this.deck?.stop(); } catch {} this.deck = null; this.releaseAll(); this.anchors = [{ t: this.ctx.currentTime, pos, rate: this.rate }]; this.emit('transport');
  }
  toggle() { this.playing ? this.stop() : this.play(); }
  /** Jump (quantized) to a track position: slices, steps, clicks on the waveform. */
  jump(pos) {
    if (!this.buffer) return; pos = clamp(pos, 0, this.duration - 0.01);
    if (this.loop && (pos < this.loop.start || pos >= this.loop.end)) this.loop = null; // jumping out of the loop leaves it
    if (!this.playing) { this.anchors = [{ t: this.ctx.currentTime, pos, rate: this.rate }]; this.emit('transport'); return; }
    const { t } = this.nextAt(); this.startDeck(t, pos);
  }
  /** Loop `bars` bars starting at the bar under the playhead (null = off). */
  setLoop(bars) {
    if (!this.buffer) return; const now = this.ctx.currentTime;
    if (!bars) { this.loop = null; } else {
      const bar = 4 * this.beat, p = this.posAt(now), k = Math.floor((p - this.grid.offset) / bar + 1e-6);
      const start = clamp(this.grid.offset + k * bar, 0, this.duration); this.loop = { start, end: clamp(start + bars * bar, start + 0.05, this.duration) };
    }
    if (this.deck) { const r = this.region(); this.deck.loopStart = r.start; this.deck.loopEnd = r.end; const p = this.posAt(now); this.anchor(now, p); }
    this.emit('transport');
  }
  setRate(rate) {
    const now = this.ctx.currentTime, p = this.posAt(now); this.rate = clamp(rate, 0.25, 4);
    if (this.deck) this.deck.playbackRate.setValueAtTime(this.rate, now); this.anchor(now, p);
  }

  // ---------- effects ----------
  press(id, { pressure = 0.5 } = {}) {
    if (!this.buffer) return; if (!this.playing) this.play();
    if (id.startsWith('slice')) { const k = +id.slice(5); const r = this.loop || this.barRegion(); this.jump(r.start + (r.end - r.start) * k / 8); return; }
    const fx = FX[id]; if (!fx) return; this.mods[id] = pressure;
    if (fx.x) { this.held = [...this.held.filter(h => h !== id), id]; this.takeover(id); } else this.modulate(id, true);
    this.emit('fx');
  }
  release(id) {
    const fx = FX[id]; if (!fx) return; delete this.mods[id];
    if (fx.x) { const wasTop = this.held[this.held.length - 1] === id; this.held = this.held.filter(h => h !== id); if (wasTop) { const next = this.held[this.held.length - 1]; if (next) this.takeover(next); else this.endTakeover(); } }
    else this.modulate(id, false);
    this.emit('fx');
  }
  releaseAll() { for (const id of [...this.held, ...Object.keys(this.mods)]) this.release(id); this.held = []; this.mods = {}; }
  setPressure(id, p) {
    if (!(id in this.mods)) return; this.mods[id] = p; const fx = FX[id]; const now = this.ctx.currentTime;
    if (!fx.x) this.modulate(id, true, true);
    else if (this.voice?.id === id && this.voice.gain) {
      if (fx.kind === 'stutter' || fx.kind === 'octave') { this.voice.lp?.frequency.setTargetAtTime(18000 * (1 - p) ** 2 + 400, now, 0.03); this.voice.gain.gain.setTargetAtTime(1 - 0.5 * p, now, 0.03); }
      if (fx.kind === 'freeze' || fx.kind === 'half') this.voice.lp?.frequency.setTargetAtTime(14000 * (1 - p) ** 2 + 300, now, 0.05);
    }
  }
  barRegion() { const bar = 4 * this.beat, p = this.posAt(), k = Math.floor((p - this.grid.offset) / bar + 1e-6), start = Math.max(0, this.grid.offset + k * bar); return { start, end: Math.min(this.duration, start + bar) }; }
  emit(type) { this.dispatchEvent(new Event(type)); }

  /** A voice: a buffer source → its own lowpass → gain → fx bus. */
  voiceNode({ reverse = false, rate = this.rate, loop = null, offset = 0, t, stopAt = null }) {
    const s = this.ctx.createBufferSource(); s.buffer = reverse ? this.rev : this.buffer; s.playbackRate.value = rate;
    if (loop) { s.loop = true; s.loopStart = loop[0]; s.loopEnd = loop[1]; }
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; const gain = this.ctx.createGain(); gain.gain.value = 0;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(1, t + 0.004);
    s.connect(lp).connect(gain).connect(this.fxBus); s.start(t, Math.max(0, offset)); if (stopAt) s.stop(stopAt);
    return { src: s, lp, gain };
  }
  killVoice(t) {
    const v = this.voice; if (!v) return; this.voice = null; for (const id of v.timers || []) { clearInterval(id); this.timers.delete(id); }
    for (const n of v.nodes || [v]) { try { n.gain.gain.setValueAtTime(n.gain.gain.value, t); n.gain.gain.linearRampToValueAtTime(0, t + 0.006); n.src.stop(t + 0.01); } catch {} }
  }
  muteDeck(t, on) { const g = this.deckBus.gain; g.cancelScheduledValues(t); g.setValueAtTime(on ? 1 : g.value, t); g.linearRampToValueAtTime(on ? 1 : 0, t + 0.005); if (on) g.setValueAtTime(1, t + 0.006); }
  /** Where an effect starts (and a stutter ends): a stutter waits for a grid line of its own length (up to a beat), the
   *  longer gestures (tape stop, spin, build, scatter, glitch) for the beat. Quantize off = right away. */
  qFor(id) {
    if (!this.quant) return 0; const fx = FX[id];
    if (fx.kind === 'stutter' || fx.kind === 'drop' || fx.kind === 'octave') return Math.max(this.quant, Math.min(fx.len ?? 0.25, 1));
    if (['tape', 'spin', 'build', 'scatter', 'glitch'].includes(fx.kind)) return Math.max(this.quant, 1);
    return this.quant;
  }
  endTakeover() { const { t } = this.nextAt(this.voice?.q ?? this.quant); this.killVoice(t); this.muteDeck(t, true); }
  /** Start the take-over effect `id` at the next grid line. */
  takeover(id) {
    const q = this.qFor(id), fx = FX[id], { t, pos } = this.nextAt(q), b = this.beat, p = this.mods[id] ?? 0.5, rate = this.rate; const dur = this.duration;
    this.killVoice(t); this.muteDeck(t, false);
    const v = { id, nodes: [], timers: [], q }; const add = (n) => { v.nodes.push(n); return n; };
    // very short loops turn into a buzzing tone: give them less level
    const stutter = (start, len, at, r = rate, stopAt = null) => { const n = add(this.voiceNode({ loop: [start, Math.min(dur, start + len)], offset: start, t: at, rate: r, stopAt })); const lvl = Math.min(1, 0.45 + len / b); n.gain.gain.cancelScheduledValues(at); n.gain.gain.setValueAtTime(0, at); n.gain.gain.linearRampToValueAtTime(lvl, at + 0.004); return n; };
    switch (fx.kind) {
      case 'stutter': { const n = stutter(pos, fx.len * b, t); n.lp.frequency.value = 18000 * (1 - p) ** 2 + 400; break; }
      case 'octave': stutter(pos, 0.25 * b, t, rate * 2); break;
      case 'freeze': { const n = stutter(pos, b * (p > 0.6 ? 1 / 32 : 1 / 16), t); // a 1/64 or 1/128 note: tiny but on the grid
        n.lp.frequency.value = 5000; n.gain.gain.linearRampToValueAtTime(0.45, t + 0.01); break; }
      case 'reverse': add(this.voiceNode({ reverse: true, offset: dur - pos, t })); break;
      case 'half': add(this.voiceNode({ offset: pos, t, rate: rate * 0.5 })); break;
      case 'tape': { const n = add(this.voiceNode({ offset: pos, t })); const T = b * (p > 0.6 ? 2 : 1) / rate; n.src.playbackRate.setValueAtTime(rate, t); n.src.playbackRate.exponentialRampToValueAtTime(0.02, t + T); /* one beat, two when pressed hard */ n.gain.gain.setValueAtTime(1, t + T * 0.7); n.gain.gain.linearRampToValueAtTime(0, t + T); break; }
      case 'spin': { const n = add(this.voiceNode({ reverse: true, offset: dur - pos, t })); const T = b * 0.5 / rate; n.src.playbackRate.setValueAtTime(rate, t); n.src.playbackRate.linearRampToValueAtTime(rate * 3.5, t + T); /* half a beat */ n.gain.gain.setValueAtTime(1, t + T * 0.4); n.gain.gain.linearRampToValueAtTime(0, t + T); break; }
      case 'drop': { const n = stutter(pos, 0.5 * b, t); n.src.detune.setValueAtTime(0, t); n.src.detune.linearRampToValueAtTime(-2400, t + 2 * b / rate); break; }
      case 'build': { const lens = [1, 0.5, 0.25, 0.125]; lens.forEach((L, k) => { const at = t + k * b / rate; stutter(pos, L * b, at, rate, k < 3 ? at + b / rate + 0.01 : null); }); break; }
      case 'kill': break;
      case 'scatter': case 'glitch': {
        // a little sequencer: each 1/16 (scatter) or beat (glitch) plays a random piece of the current bar
        const unit = fx.kind === 'scatter' ? b / 4 : b; const bar = this.barRegion(); let next = t;
        const tick = () => {
          const horizon = this.ctx.currentTime + 0.12;
          while (next < horizon) {
            const k = Math.floor(Math.random() * (fx.kind === 'scatter' ? 16 : 4)); const start = bar.start + k * unit;
            if (fx.kind === 'scatter') stutter(start, unit, next, rate, next + unit / rate);
            else { const L = [0.5, 0.25, 0.125, 1 / 6][Math.floor(Math.random() * 4)] * b; const r = [0.5, 1, 1, 2][Math.floor(Math.random() * 4)]; if (Math.random() < 0.25) add(this.voiceNode({ reverse: true, offset: dur - start - unit, t: next, stopAt: next + unit / rate })); else stutter(start, L, next, rate * r, next + unit / rate); }
            next += unit / rate; if (v.nodes.length > 64) v.nodes.splice(0, v.nodes.length - 64);
          }
        };
        tick(); const id2 = setInterval(tick, 25); v.timers.push(id2); this.timers.add(id2); break;
      }
    }
    this.voice = v;
  }
  /** Stacking effects on the master chain; `again` = only the pressure changed. */
  modulate(id, on, again = false) {
    const now = this.ctx.currentTime, p = this.mods[id] ?? 0.5, b = this.beat / this.rate, B = this.base;
    switch (FX[id].kind) {
      case 'filter': { const f = this.filter.frequency; f.cancelScheduledValues(now); f.setValueAtTime(f.value, now); if (on) { if (!again) f.exponentialRampToValueAtTime(260, now + 2 * b); this.filter.Q.setTargetAtTime(1 + p * 14, now, 0.05); } else { f.exponentialRampToValueAtTime(this.baseCut(), now + 0.25); this.filter.Q.setTargetAtTime(B.res, now, 0.1); } break; }
      case 'crush': this.setCrush(on ? Math.max(B.crush, 0.35 + p * 0.65) : B.crush); break;
      case 'echo': this.echoSend.gain.setTargetAtTime(on ? 0.5 + p * 0.5 : B.echo, now, 0.02); if (on) this.fb.gain.setTargetAtTime(Math.max(B.feedback, 0.55 + p * 0.3), now, 0.05); else this.fb.gain.setTargetAtTime(B.feedback, now, 0.4); this.delay.delayTime.setTargetAtTime(0.75 * b, now, 0.01); break;
      case 'wash': this.washSend.gain.setTargetAtTime(on ? 0.6 + p * 0.6 : B.wash, now, 0.05); break;
      case 'gate': {
        clearInterval(this.gateTimer); const g = this.gate.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
        if (!on) { g.linearRampToValueAtTime(1, now + 0.01); this.gateTimer = null; break; }
        let { t } = this.nextAt(0.25); const depth = 0.6 + 0.4 * p;
        const tick = () => { const horizon = this.ctx.currentTime + 0.15; while (t < horizon) { g.setValueAtTime(1, t); g.setValueAtTime(1 - depth, t + b * 0.25 * 0.5); t += b * 0.25; } };
        tick(); this.gateTimer = setInterval(tick, 25); break;
      }
    }
  }
  /** Dry/wet: 0 = the original only, 1 = only the effected sound. A linear crossfade, since both sides carry the same deck. */
  setMix(m) { const now = this.ctx.currentTime; m = clamp(m, 0, 1); this.wet.gain.setTargetAtTime(m, now, 0.02); this.dryDirect.gain.setTargetAtTime(1 - m, now, 0.02); }
  setCrush(amount) { const now = this.ctx.currentTime; this.shaper.curve = crushCurve(Math.round(10 - amount * 8)); this.crushWet.gain.setTargetAtTime(amount > 0.01 ? Math.min(1, amount * 1.5) : 0, now, 0.02); this.dry.gain.setTargetAtTime(amount > 0.5 ? 1 - (amount - 0.5) * 1.6 : 1, now, 0.02); }
  baseCut() { const f = this.base.filter; return f < 0 ? 20000 * Math.pow(0.01, -f) + 60 : 20000; }
  /** Knob-driven base sound: filter (−1 lowpass … +1 highpass), res, crush, echo, feedback, wash. */
  setBase(patch) {
    Object.assign(this.base, patch); const B = this.base, now = this.ctx.currentTime;
    if (!('filter' in this.mods)) { this.filter.frequency.setTargetAtTime(this.baseCut(), now, 0.03); this.filter.Q.setTargetAtTime(B.res, now, 0.05); }
    this.hp.frequency.setTargetAtTime(B.filter > 0 ? 20 * Math.pow(400, B.filter) : 10, now, 0.03);
    if (!('crush' in this.mods)) this.setCrush(B.crush);
    if (!('echo' in this.mods)) { this.echoSend.gain.setTargetAtTime(B.echo, now, 0.05); this.fb.gain.setTargetAtTime(B.feedback, now, 0.1); this.delay.delayTime.setTargetAtTime(0.75 * this.beat / this.rate, now, 0.05); }
    if (!('wash' in this.mods)) this.washSend.gain.setTargetAtTime(B.wash, now, 0.05);
  }
}
