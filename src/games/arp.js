// Generative arpeggiator for the games: a soft plucked voice + feedback delay, lookahead-scheduled.
// evolve(state) reshapes the notes from the board; every call nudges pattern, rate and tone.
const SCALES = { pentMinor: [0, 3, 5, 7, 10], pentMajor: [0, 2, 4, 7, 9], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
const ROOTS = [45, 48, 50, 52, 55, 57];   // A2 C3 D3 E3 G3 A3
const PATTERNS = ['up', 'down', 'updown', 'random', 'skip'];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Arp {
  constructor(audio) {
    this.audio = audio; this.running = false; this.timer = null;
    this.root = 48; this.scale = SCALES.pentMinor; this.notes = [48, 55, 60]; this.pattern = 'up'; this.rateMs = 190; this.cutoff = 1800; this.decay = 0.28;
    this.i = 0; this.dir = 1; this.next = 0; this.gainLevel = 0.5; this.presses = 0;
  }
  ensureFx() {
    if (this.bus) return; const ctx = this.audio.ensure();
    this.bus = ctx.createGain(); this.bus.gain.value = this.gainLevel;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = this.cutoff; this.lp.Q.value = 2;
    this.delay = ctx.createDelay(1.5); this.delay.delayTime.value = 0.375; this.fb = ctx.createGain(); this.fb.gain.value = 0.38; this.wet = ctx.createGain(); this.wet.gain.value = 0.35;
    this.bus.connect(this.lp); this.lp.connect(this.audio.master); this.lp.connect(this.delay); this.delay.connect(this.fb); this.fb.connect(this.delay); this.delay.connect(this.wet); this.wet.connect(this.audio.master);
  }
  newSong(seed = Math.random()) {
    this.root = ROOTS[Math.floor(seed * ROOTS.length)]; const keys = Object.keys(SCALES); this.scale = SCALES[keys[Math.floor((seed * 7919) % keys.length)]];
    this.pattern = 'up'; this.rateMs = 200; this.cutoff = 1600; this.presses = 0; this.i = 0; this.dir = 1;
    this.delay && (this.delay.delayTime.value = this.rateMs * 1.5 / 1000);
  }
  /** state: { cells: [{row, col, on}], level, won } → notes from the lit cells (col = scale degree, row = octave). */
  /** bpm → arp rate: 8ths at low levels, 16ths from level 8, faster with presses. */
  setTempo(bpm) { this.bpm = bpm; this.rateFromTempo(); }
  rateFromTempo() { if (!this.bpm) return; const div = (this.level || 4) >= 8 ? 4 : 2; this.rateMs = Math.max(90, 60000 / this.bpm / div - Math.min(40, (this.presses || 0) * 2)); if (this.delay) this.delay.delayTime.setTargetAtTime(this.rateMs * 1.5 / 1000, this.audio.ctx.currentTime, 0.3); }
  evolve({ lit = [], level = 4, won = false, cols = 8 } = {}) {
    this.level = level;
    this.presses++;
    if (won) { this.notes = [this.root, this.root + this.scale[2 % this.scale.length], this.root + 7, this.root + 12, this.root + 12 + this.scale[1]]; this.pattern = 'updown'; this.rateMs = 260; this.cutoff = 2600; return; }
    const degs = new Map();
    for (const { row, col } of lit) { const d = Math.floor(col / cols * this.scale.length); const note = this.root + 12 * Math.min(2, row) + this.scale[d % this.scale.length]; degs.set(note, (degs.get(note) || 0) + 1); }
    let notes = [...degs.keys()].sort((a, b) => a - b);
    if (!notes.length) notes = [this.root, this.root + 7];
    if (notes.length > 7) { notes = notes.filter((_, i) => i % 2 === 0); }
    this.notes = notes;
    if (this.presses % 4 === 0) this.pattern = PATTERNS[(PATTERNS.indexOf(this.pattern) + 1) % PATTERNS.length];
    if (this.bpm) this.rateFromTempo(); else this.rateMs = Math.max(110, 230 - level * 8 - Math.min(60, this.presses * 3));
    this.cutoff = 900 + Math.min(3000, lit.length * 180 + this.presses * 40);
    if (this.lp) this.lp.frequency.setTargetAtTime(this.cutoff, this.audio.ctx.currentTime, 0.2);
    if (this.delay) this.delay.delayTime.setTargetAtTime(this.rateMs * 1.5 / 1000, this.audio.ctx.currentTime, 0.3);
  }
  start() {
    if (this.running) return; this.ensureFx(); this.running = true; this.next = this.audio.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), 25);
    this.audio.ctx.addEventListener('statechange', () => { this.next = this.audio.ctx.currentTime + 0.05; }); // no catch-up burst after a resume
  }
  stop() { this.running = false; clearInterval(this.timer); this.timer = null; }
  setVolume(v) { this.gainLevel = v; if (this.bus) this.bus.gain.setTargetAtTime(v, this.audio.ctx.currentTime, 0.05); }
  nextNote() {
    const n = this.notes; if (!n.length) return null;
    let idx;
    switch (this.pattern) {
      case 'down': idx = (n.length - 1) - (this.i % n.length); break;
      case 'updown': { const span = Math.max(1, n.length * 2 - 2); const k = this.i % span; idx = k < n.length ? k : span - k; break; }
      case 'random': idx = Math.floor(Math.random() * n.length); break;
      case 'skip': idx = (this.i * 2) % n.length; break;
      default: idx = this.i % n.length;
    }
    this.i++; return n[idx] + ((this.i % 16 === 0) ? 12 : 0);
  }
  tick() {
    const ctx = this.audio.ctx;
    if (ctx.state !== 'running') { this.next = ctx.currentTime + 0.05; return; }   // suspended: wait, don't queue
    if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.02;        // drifted (tab was hidden): resync
    while (this.next < ctx.currentTime + 0.12) {
      const note = this.nextNote(); if (note != null) this.pluck(note, this.next, this.i % 4 === 1 ? 0.9 : 0.6);
      this.next += this.rateMs / 1000;
    }
  }
  pluck(midi, t, vel = 0.7) {
    const ctx = this.audio.ctx; const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = mtof(midi); o2.frequency.value = mtof(midi) * 2.01;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + this.decay);
    o.connect(g); o2.connect(g); g.connect(this.bus); o.start(t); o2.start(t); o.stop(t + this.decay + 0.05); o2.stop(t + this.decay + 0.05);
  }
}
