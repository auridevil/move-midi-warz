// Polyrhythm drum machine model: 4 lanes, each with its own length, speed ratio, euclidean fill, rotation,
// swing, probability and accents. Pure logic (no audio), unit-tested.
export const MAX_STEPS = 16;
export const RATIOS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 3 / 2, 2, 3, 4];
export const RATIO_LABEL = ['¼', '⅓', '½', '⅔', '¾', '1', '3/2', '2', '3', '4'];
export const LANE_NAMES = ['kick', 'snare', 'hat', 'perc'];
/** Per-lane sound sculpting, all 0..1: Shift + knobs on the Move. */
export const SOUND_KEYS = ['decay', 'tone', 'drive', 'snap', 'color', 'send', 'pan', 'level'];
export const DEFAULT_SOUND = { decay: 0.5, tone: 0.75, drive: 0, snap: 0.5, color: 0.5, send: 0.15, pan: 0.5, level: 0.8 };
/** Master clock resolution (ticks per beat). 24 = MIDI clock, and every ratio's step is a whole number of ticks. */
export const PPQ = 24, BAR_TICKS = PPQ * 4;
/** Per-step parameter locks: hold a step and turn a knob. tune is −1..1, the rest 0..1. */
export const LOCK_KEYS = ['tune', 'prob', 'vel', 'decay', 'tone', 'snap', 'color'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Trig conditions per step. 'a:b' = play on loop a of every b; fill = only while Fill is held; first = first loop after Play. */
export const CONDS = ['always', '1:2', '2:2', '1:3', '2:3', '3:3', '1:4', '2:4', '3:4', '4:4', 'fill', 'not fill', 'first', 'not first'];
export const MAX_RATCHET = 4;
/** Does a condition pass on loop `loop` (0 = first loop since Play)? */
export function condPasses(cond, loop, fill = false) {
  if (!cond || cond === 'always') return true;
  if (cond === 'fill') return fill; if (cond === 'not fill') return !fill;
  if (cond === 'first') return loop === 0; if (cond === 'not first') return loop > 0;
  const [a, b] = cond.split(':').map(Number); return loop % b === a - 1;
}

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
    this.locks = new Array(MAX_STEPS).fill(null); this.evolve = true;
    this.trigs = new Array(MAX_STEPS).fill(null);   // per stored step: { cond, ratchet, fade } or null
    this.solo = false; this.choke = -1;             // choke: index of the lane this one cuts off when it hits   // locks: per stored step, {key: value} or null
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
  clear() { this.hits.fill(false); this.accents.fill(false); this.locks.fill(null); this.trigs.fill(null); this.euclidK = 0; }
  /** Condition / ratchet on one stored step. ratchet 1 = a normal hit; fade = repeats get quieter. */
  setTrig(i, patch) {
    if (i < 0 || i >= MAX_STEPS) return null; const t = { cond: 'always', ratchet: 1, fade: false, ...(this.trigs[i] || {}), ...patch };
    if (!CONDS.includes(t.cond)) t.cond = 'always'; t.ratchet = clamp(Math.round(t.ratchet), 1, MAX_RATCHET); t.fade = !!t.fade;
    this.trigs[i] = t.cond === 'always' && t.ratchet === 1 ? null : t; return this.trigs[i];
  }
  trigAt(i) { return this.trigs[this.stepIndex(i)]; }
  /** Lock a parameter on one stored step (use stepIndex() for a visible position). */
  setLock(i, k, v) { if (!LOCK_KEYS.includes(k) || i < 0 || i >= MAX_STEPS) return; const x = clamp(v, k === 'tune' ? -1 : 0, 1); (this.locks[i] ||= {})[k] = x; return x; }
  clearLocks(i) { this.locks[i] = null; }
  lockAt(i) { return this.locks[this.stepIndex(i)]; }
  /** Master-clock ticks per step: ×1 = 24 (a beat), ×4 = 6, ⅔ = 36. */
  stepTicks() { return Math.round(PPQ / this.ratio); }
  /**
   * What this lane does at master tick `tick`, or null when it doesn't step there. The position is derived
   * from the tick, never accumulated, so lanes stay phase-locked through ratio, length and tempo changes.
   */
  at(tick, rng = Math.random, ctx = {}) {
    const st = this.stepTicks(); if (tick % st) return null;
    const step = tick / st, i = step % this.length, lock = this.lockAt(i), trig = this.trigAt(i), loop = Math.floor(step / this.length);
    const r = ctx.dice ? ctx.dice.at(ctx.li ?? 0, step, this.length) : rng();
    const hit = this.hitAt(i) && !this.muted && !ctx.silenced && condPasses(trig?.cond, loop, ctx.fill) && r < (lock?.prob ?? this.prob);
    this.pos = (i + 1) % this.length;
    return { index: i, step, hit, accent: hit && this.accentAt(i), swung: i % 2 === 1 ? this.swing : 0, lock, lane: this.name, ratchet: hit ? trig?.ratchet || 1 : 0, fade: !!trig?.fade, loop };
  }
  /**
   * Live record: the step a hit at fractional master tick `tickF` belongs to. 'nearest' rounds (early hits
   * land on the coming step), 'previous' always files it under the step that just played.
   */
  quantize(tickF, mode = 'nearest') {
    const f = tickF / this.stepTicks(), step = mode === 'previous' ? Math.floor(f) : Math.round(f);
    return { step, index: ((step % this.length) + this.length) % this.length, ahead: step > f };
  }
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
  toJSON() { const { name, length, ratioIndex, hits, accents, rotation, swing, prob, tune, muted, euclidK, sound, voice, locks, evolve, trigs, solo, choke, sample } = this; return { name, length, ratioIndex, hits, accents, rotation, swing, prob, tune, muted, euclidK, sound, voice, locks, evolve, trigs, solo, choke, sample: sample || null }; }
  static from(o) { const l = new Lane(o.name, { length: o.length, ratioIndex: o.ratioIndex }); Object.assign(l, { hits: o.hits, accents: o.accents, rotation: o.rotation, swing: o.swing, prob: o.prob, tune: o.tune, muted: o.muted, euclidK: o.euclidK }); l.sound = { ...DEFAULT_SOUND, ...(o.sound || {}) }; l.voice = o.voice || o.name; l.locks = Array.from({ length: MAX_STEPS }, (_, i) => (o.locks?.[i] ? { ...o.locks[i] } : null)); l.evolve = o.evolve ?? true; l.trigs = Array.from({ length: MAX_STEPS }, (_, i) => (o.trigs?.[i] ? { ...o.trigs[i] } : null)); l.solo = !!o.solo; l.choke = Number.isInteger(o.choke) ? o.choke : -1; l.sample = o.sample || null; return l; }
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
  /** Master ticks until every lane lines up again. */
  cycleTicks() { return Math.max(1, Math.round(this.cycleSteps() * PPQ)); }
  /** Every lane's event at master tick `tick` (null where a lane doesn't step). */
  /** ctx: { fill, dice } — solo silences every lane that isn't soloed. */
  tick(tick, rng = Math.random, ctx = {}) { const solo = this.lanes.some(l => l.solo); return this.lanes.map((l, li) => l.at(tick, rng, { ...ctx, li, silenced: solo && !l.solo })); }
  /** Replace the whole state in place (pattern slots), keeping the object other code holds. */
  assign(o) { const n = Machine.from(o); this.lanes = n.lanes; this.selected = n.selected; this.humanize = n.humanize; this.kit = n.kit; return this; }
  /**
   * Evolve: nudge some lanes a little. scope 'rotate' = rotation only, 'hits' = + euclid fill, 'all' = + length
   * and speed. amount 0..1 = chance per lane. Lanes with evolve=false or muted are left alone. Returns what changed.
   */
  evolve({ scope = 'hits', amount = 0.4 } = {}, rng = Math.random) {
    const changes = [];
    this.lanes.forEach((l, li) => {
      if (!l.evolve || l.muted || rng() >= amount) return;
      const kinds = ['rotate']; if (scope !== 'rotate') kinds.push('hits'); if (scope === 'all') kinds.push('length', 'ratio');
      const kind = kinds[Math.floor(rng() * kinds.length)], dir = rng() < 0.5 ? -1 : 1;
      if (kind === 'rotate') l.rotation = ((l.rotation + dir) % l.length + l.length) % l.length;
      if (kind === 'hits') {
        if (l.euclidK) l.setEuclid(clamp(l.euclidK + dir, 1, l.length));
        else { const i = Math.floor(rng() * l.length); if (!(l.hits[i] && l.hits.filter(Boolean).length <= 1)) l.toggle(i); }
      }
      if (kind === 'length') { l.setLength(clamp(l.length + dir, 2, MAX_STEPS)); if (l.euclidK) l.setEuclid(Math.min(l.euclidK, l.length)); l.rotation %= l.length; }
      if (kind === 'ratio') l.setRatio(clamp(l.ratioIndex + dir, 3, 8));
      changes.push({ lane: li, kind, dir });
    });
    return changes;
  }
  randomize(rng = Math.random) { for (const l of this.lanes) { l.setLength(2 + Math.floor(rng() * 11)); l.setEuclid(1 + Math.floor(rng() * Math.max(1, l.length - 1))); l.rotation = Math.floor(rng() * l.length); } }
  /** Apply a kit: voices + sound tweaks per lane; patterns untouched. */
  applyKit(kit, defaults) { kit.lanes.forEach((k, i) => { const l = this.lanes[i]; if (!l) return; l.setVoice(k.voice); l.sound = { ...defaults, ...(k.sound || {}) }; }); this.kit = kit.name; }
  toJSON() { return { lanes: this.lanes.map(l => l.toJSON()), selected: this.selected, humanize: this.humanize, kit: this.kit }; }
  static from(o) { const m = new Machine(); if (o?.lanes) m.lanes = o.lanes.map(Lane.from); m.selected = o?.selected ?? 0; m.humanize = o?.humanize ?? 0; m.kit = o?.kit; return m; }
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
