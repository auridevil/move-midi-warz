// Polyrhythm drum machine model: 4 lanes, each with its own length, speed ratio, euclidean fill, rotation,
// swing, probability and accents. Pure logic (no audio), unit-tested.
export const MAX_STEPS = 16;
export const RATIOS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 3 / 2, 2, 3, 4];
export const RATIO_LABEL = ['¼', '⅓', '½', '⅔', '¾', '1', '3/2', '2', '3', '4'];
export const LANE_NAMES = ['kick', 'snare', 'hat', 'perc'];
/** Per-lane sound sculpting, all 0..1: Shift + knobs on the Move. */
export const SOUND_KEYS = ['decay', 'tone', 'drive', 'snap', 'color', 'send', 'pan', 'level'];
export const DEFAULT_SOUND = { decay: 0.5, tone: 0.75, drive: 0, snap: 0.5, color: 0.5, send: 0.15, pan: 0.5, level: 0.8 };

/** Bjorklund / euclidean rhythm: k hits spread as evenly as possible over n steps. */
export function euclid(k, n) {
  k = Math.max(0, Math.min(n, k)); if (n <= 0) return [];
  // a hit wherever floor(i·k/n) steps up: E(3,8) = 10010010 (tresillo), always starting on a hit
  return Array.from({ length: n }, (_, i) => k > 0 && Math.floor(i * k / n) !== Math.floor((i - 1) * k / n));
}

export class Lane {
  constructor(name, { length = 8, ratioIndex = 5 } = {}) {
    this.name = name; this.length = length; this.ratioIndex = ratioIndex;
    this.hits = new Array(MAX_STEPS).fill(false); this.accents = new Array(MAX_STEPS).fill(false);
    this.rotation = 0; this.swing = 0; this.prob = 1; this.tune = 0; this.muted = false; this.pos = 0; this.euclidK = 0;
    this.sound = { ...DEFAULT_SOUND }; this.voice = name;   // voice = engine key from voices.js; defaults to the lane's classic sound
  }
  setVoice(key) { this.voice = key; return key; }
  setSound(k, v) { if (!(k in this.sound)) return; this.sound[k] = Math.max(0, Math.min(1, v)); return this.sound[k]; }
  get ratio() { return RATIOS[this.ratioIndex]; }
  setLength(n) { this.length = Math.max(1, Math.min(MAX_STEPS, Math.round(n))); if (this.pos >= this.length) this.pos = 0; return this.length; }
  setRatio(i) { this.ratioIndex = Math.max(0, Math.min(RATIOS.length - 1, Math.round(i))); return this.ratioIndex; }
  setEuclid(k) { this.euclidK = Math.max(0, Math.min(this.length, Math.round(k))); const e = euclid(this.euclidK, this.length); for (let i = 0; i < MAX_STEPS; i++) this.hits[i] = i < this.length ? e[i] : false; return this.euclidK; }
  toggle(i) { if (i >= this.length) return false; this.hits[i] = !this.hits[i]; return this.hits[i]; }
  toggleAccent(i) { if (i >= this.length) return false; this.accents[i] = !this.accents[i]; return this.accents[i]; }
  clear() { this.hits.fill(false); this.accents.fill(false); this.euclidK = 0; }
  /** Read a step through the rotation. */
  stepIndex(i) { return ((i - this.rotation) % this.length + this.length) % this.length; }
  hitAt(i) { return this.hits[this.stepIndex(i)]; }
  accentAt(i) { return this.accents[this.stepIndex(i)]; }
  /** Advance one step: returns what happened at the current position, then moves on. */
  advance(rng = Math.random) {
    const i = this.pos; const hit = this.hitAt(i) && !this.muted && rng() < this.prob; const accent = hit && this.accentAt(i);
    const swung = i % 2 === 1 ? this.swing : 0;   // fraction of a step to delay odd steps
    this.pos = (this.pos + 1) % this.length;
    return { index: i, hit, accent, swung, lane: this.name };
  }
  reset() { this.pos = 0; }
  toJSON() { const { name, length, ratioIndex, hits, accents, rotation, swing, prob, tune, muted, euclidK, sound, voice } = this; return { name, length, ratioIndex, hits, accents, rotation, swing, prob, tune, muted, euclidK, sound, voice }; }
  static from(o) { const l = new Lane(o.name, { length: o.length, ratioIndex: o.ratioIndex }); Object.assign(l, { hits: o.hits, accents: o.accents, rotation: o.rotation, swing: o.swing, prob: o.prob, tune: o.tune, muted: o.muted, euclidK: o.euclidK }); l.sound = { ...DEFAULT_SOUND, ...(o.sound || {}) }; l.voice = o.voice || o.name; return l; }
}

export class Machine {
  constructor() { this.lanes = LANE_NAMES.map((n, i) => new Lane(n, { length: [4, 4, 8, 5][i], ratioIndex: [5, 5, 7, 7][i] })); this.selected = 0; this.humanize = 0; }
  get lane() { return this.lanes[this.selected]; }
  select(i) { this.selected = ((i % this.lanes.length) + this.lanes.length) % this.lanes.length; return this.lane; }
  /** Seconds per step: at ratio ×1 a step is a quarter note (4 steps = one bar); ×2 = eighths, ×4 = sixteenths, ½ = half notes. */
  stepSeconds(lane, bpm) { return (60 / bpm) / lane.ratio; }
  /** Beats (quarter notes) until all lanes line up again: the polyrhythm's true cycle. */
  cycleSteps() { const lcm = (a, b) => a * b / gcd(a, b); return this.lanes.reduce((acc, l) => lcm(acc, Math.round(l.length / l.ratio * 12)), 1) / 12; }
  resetAll() { for (const l of this.lanes) l.reset(); }
  randomize(rng = Math.random) { for (const l of this.lanes) { l.setLength(2 + Math.floor(rng() * 11)); l.setEuclid(1 + Math.floor(rng() * Math.max(1, l.length - 1))); l.rotation = Math.floor(rng() * l.length); } }
  /** Apply a kit: voices + sound tweaks per lane; patterns untouched. */
  applyKit(kit, defaults) { kit.lanes.forEach((k, i) => { const l = this.lanes[i]; if (!l) return; l.setVoice(k.voice); l.sound = { ...defaults, ...(k.sound || {}) }; }); this.kit = kit.name; }
  toJSON() { return { lanes: this.lanes.map(l => l.toJSON()), selected: this.selected, humanize: this.humanize, kit: this.kit }; }
  static from(o) { const m = new Machine(); if (o?.lanes) m.lanes = o.lanes.map(Lane.from); m.selected = o?.selected ?? 0; m.humanize = o?.humanize ?? 0; m.kit = o?.kit; return m; }
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
