// Polyrhythm drum machine model: 4 lanes, each with its own length, speed ratio, euclidean fill, rotation,
// swing, probability and accents. Pure logic (no audio), unit-tested.
import { KITS } from './kits.js';
import { VOICES } from './voices.js';
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
    // swing follows the absolute step (counted from the master tick), not the loop index: on a 5-step lane the
    // index restarts on an odd step every other loop, which would swing the downbeat
    return { index: i, step, hit, accent: hit && this.accentAt(i), swung: step % 2 === 1 ? this.swing : 0, lock, lane: this.name, ratchet: hit ? trig?.ratchet || 1 : 0, fade: !!trig?.fade, loop };
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
  /**
   * Loops of this lane before it repeats exactly: the lcm of every a:b condition's b on its active steps, × the locked
   * dice repeat when a roll can change something (probability below 100 % or humanize). 'first'/'fill' are not periodic.
   */
  loopsPerCycle({ repeat = 1, humanize = 0 } = {}) {
    let n = 1;
    for (let i = 0; i < this.length; i++) { const ab = this.hits[i] && /^(\d+):(\d+)$/.exec(this.trigs[i]?.cond || ''); if (ab) n = lcm(n, +ab[2]); }
    const rolls = humanize > 0 || this.prob < 1 || this.locks.some((lk, i) => i < this.length && this.hits[i] && lk?.prob != null && lk.prob < 1);
    return repeat > 1 && rolls ? lcm(n, repeat) : n;   // dice repeat counts loops too: 1:2 with repeat 2 is still 2
  }
  toJSON() { const { name, length, ratioIndex, hits, accents, rotation, swing, prob, tune, muted, euclidK, sound, voice, locks, evolve, trigs, solo, choke, sample } = this; return { name, length, ratioIndex, hits, accents, rotation, swing, prob, tune, muted, euclidK, sound, voice, locks, evolve, trigs, solo, choke, sample: sample || null }; }
  static from(o) { const l = new Lane(o.name, { length: o.length, ratioIndex: o.ratioIndex }); Object.assign(l, { hits: o.hits, accents: o.accents, rotation: o.rotation, swing: o.swing, prob: o.prob, tune: o.tune, muted: o.muted, euclidK: o.euclidK }); l.sound = { ...DEFAULT_SOUND, ...(o.sound || {}) }; l.voice = o.voice || o.name; l.locks = Array.from({ length: MAX_STEPS }, (_, i) => (o.locks?.[i] ? { ...o.locks[i] } : null)); l.evolve = o.evolve ?? true; l.trigs = Array.from({ length: MAX_STEPS }, (_, i) => (o.trigs?.[i] ? { ...o.trigs[i] } : null)); l.solo = !!o.solo; l.choke = Number.isInteger(o.choke) ? o.choke : -1; l.sample = o.sample || null; return l; }
}

export class Machine {
  // a new machine plays the Common kit: lane names are ids, not voices ('perc' is not a voice)
  constructor() { this.lanes = LANE_NAMES.map((n, i) => new Lane(n, { length: [4, 4, 8, 5][i], ratioIndex: [5, 5, 7, 7][i] })); this.selected = 0; this.humanize = 0; this.applyKit(KITS.common, DEFAULT_SOUND); }
  get lane() { return this.lanes[this.selected]; }
  select(i) { this.selected = ((i % this.lanes.length) + this.lanes.length) % this.lanes.length; return this.lane; }
  /** Seconds per step: at ratio ×1 a step is a quarter note (4 steps = one bar); ×2 = eighths, ×4 = sixteenths, ½ = half notes. */
  stepSeconds(lane, bpm) { return (60 / bpm) / lane.ratio; }
  /**
   * Beats (quarter notes) until the whole machine repeats exactly: lengths × speeds, × trig conditions (1:3 = three
   * loops), × the locked dice repeat. opts.repeat = dice.repeat when the dice are locked (else 1).
   */
  cycleSteps({ repeat = 1 } = {}) { return this.lanes.reduce((acc, l) => lcm(acc, Math.round(l.length / l.ratio * 12) * l.loopsPerCycle({ repeat, humanize: this.humanize })), 1) / 12; }
  resetAll() { for (const l of this.lanes) l.reset(); }
  /** Master ticks until every lane lines up again. */
  cycleTicks(opts) { return Math.max(1, Math.round(this.cycleSteps(opts) * PPQ)); }
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
  /** Wild randomize: any length, fill and rotation per lane (speeds kept). Often noise; musical randomize is the default. */
  randomize(rng = Math.random) { for (const l of this.lanes) { l.setLength(2 + Math.floor(rng() * 11)); l.setEuclid(1 + Math.floor(rng() * Math.max(1, l.length - 1))); l.rotation = Math.floor(rng() * l.length); } }
  /**
   * Musical randomize: roll a groove from a family (MUSICAL_FAMILIES, or the key given): kick on step 1, snare where the
   * family puts it, lane lengths and speeds from the family, the whole cycle at most 16 bars. Voices and sounds stay.
   * Pure: rng is a dice stream, so locked dice re-make the same groove. Returns the family { key, name }.
   */
  randomizeMusical(rng = Math.random, family) {
    const f = MUSICAL_FAMILIES.find(x => x.key === family) || MUSICAL_FAMILIES[Math.floor(rng() * MUSICAL_FAMILIES.length)];
    const specs = f.build(rng);
    this.lanes.forEach((l, i) => {
      const s = specs[i]; if (!s) return; l.clear(); l.setLength(s.len); l.setRatio(RATIOS.indexOf(s.ratio)); l.prob = 1; l.swing = s.swing || 0;
      if (s.k != null) l.setEuclid(s.k); else for (const h of s.hits) l.hits[h % s.len] = true;
      for (const a of s.acc || []) if (l.hits[a]) l.accents[a] = true;
      l.rotation = s.rot ? s.rot % s.len : 0;
    });
    // swing on an odd lane doubles its loop: drop swing until the cycle fits (the families are built to fit anyway)
    if (this.cycleTicks() > MAX_CYCLE_BARS * BAR_TICKS) for (const l of this.lanes) l.swing = 0;
    return { key: f.key, name: f.name };
  }
  /** Apply a kit: voices + sound tweaks per lane; patterns untouched. */
  applyKit(kit, defaults) { kit.lanes.forEach((k, i) => { const l = this.lanes[i]; if (!l) return; l.setVoice(k.voice); l.sound = { ...defaults, ...(k.sound || {}) }; }); this.kit = kit.name; }
  /** The kit key whose voices and sounds every lane still has exactly, or null (= custom). */
  kitKey() {
    const same = (a, b) => Math.abs(a - b) < 1e-9;
    return Object.keys(KITS).find(key => KITS[key].lanes.every((k, i) => { const l = this.lanes[i]; if (!l || l.voice !== k.voice) return false; const s = { ...DEFAULT_SOUND, ...(k.sound || {}) }; return SOUND_KEYS.every(sk => same(l.sound[sk], s[sk])); })) ?? null;
  }
  toJSON() { return { lanes: this.lanes.map(l => l.toJSON()), selected: this.selected, humanize: this.humanize, kit: this.kit }; }
  static from(o) {
    const m = new Machine(); if (o?.lanes) m.lanes = o.lanes.map(Lane.from); m.selected = o?.selected ?? 0; m.humanize = o?.humanize ?? 0; m.kit = o?.kit;
    // old saves and links can name a voice that doesn't exist (lane 4 used to default to 'perc'), or a sample that is
    // gone: give that lane the Common kit's voice instead of a silent fallback to the kick
    m.lanes.forEach((l, i) => { if (l.voice === 'sample' ? !l.sample : !VOICES[l.voice]) l.voice = KITS.common.lanes[i % 4].voice; });
    return m;
  }
}
/** Musical randomize never makes a cycle longer than this. */
export const MAX_CYCLE_BARS = 16;
const one = (rng, a) => a[Math.floor(rng() * a.length)], some = (rng, a, p) => a.filter(() => rng() < p);
/**
 * Groove families for musical randomize. build(rng) → one spec per lane (kick, snare, hat, perc):
 * { len, ratio, hits: [stored steps] or k: euclid fill, acc, rot, swing }. lengths = the lane lengths a family may use
 * (tests check every roll against them). The kick never rotates and always has step 1.
 */
export const MUSICAL_FAMILIES = [
  { key: 'tresillo', name: 'tresillo over four', lengths: [[8, 16], [16], [4, 8, 16], [8, 16]],
    build: (rng) => {
      const long = rng() < 0.5;
      return [
        { len: long ? 16 : 8, ratio: 4, hits: long ? [0, 3, 6, 8, 11, ...some(rng, [14], 0.5)] : [0, 3, 6], acc: [0] },   // 3+3+2
        { len: 16, ratio: 4, hits: rng() < 0.7 ? [4, 12] : [8], acc: [4, 8, 12] },
        one(rng, [{ len: 8, ratio: 2, k: 8, acc: [0, 2, 4, 6], swing: one(rng, [0, 0.1, 0.2]) }, { len: 16, ratio: 4, k: one(rng, [8, 12, 16]), swing: one(rng, [0, 0.1]) }, { len: 4, ratio: 2, hits: [1, 3] }]),
        { len: one(rng, [8, 16]), ratio: 4, k: 3, rot: one(rng, [2, 4, 5]) },    // the tresillo answered on the other lane
      ];
    } },
  { key: 'clave32', name: '3-2 clave', lengths: [[4], [4], [2, 8, 16], [16]],
    build: (rng) => [
      { len: 4, ratio: 1, hits: rng() < 0.6 ? [0, 1, 2, 3] : [0, 2], acc: [0] },
      { len: 4, ratio: 1, hits: rng() < 0.5 ? [1, 3] : [2], acc: [1, 2, 3] },
      one(rng, [{ len: 2, ratio: 2, hits: [1] }, { len: 16, ratio: 4, k: one(rng, [6, 8, 10]), rot: one(rng, [0, 1, 2]), swing: one(rng, [0, 0.12]) }, { len: 8, ratio: 2, k: 8, acc: [1, 3, 5, 7] }]),
      { len: 16, ratio: one(rng, [2, 4]), hits: [0, 3, 6, 10, 12], acc: [0] },   // son clave 3-2: 2 bars of 8ths, or 1 bar of 16ths
    ] },
  { key: '4vs3', name: 'four against three', lengths: [[4], [4], [3, 6], [3, 12]],
    build: (rng) => [
      { len: 4, ratio: 1, hits: rng() < 0.5 ? [0, 1, 2, 3] : [0, 2], acc: [0] },
      { len: 4, ratio: 1, hits: rng() < 0.6 ? [1, 3] : [2], acc: [1, 2, 3] },
      one(rng, [{ len: 3, ratio: 3 / 4, hits: [0, 1, 2], acc: [0] }, { len: 6, ratio: 3 / 2, k: one(rng, [3, 4, 6]), acc: [0] }]),   // 3 (or 6) across the bar
      one(rng, [{ len: 3, ratio: 1, k: one(rng, [1, 2]) }, { len: 12, ratio: 3, k: one(rng, [3, 5, 7]), rot: one(rng, [0, 2, 4]) }]),
    ] },
  { key: '5over4', name: 'five over four', lengths: [[4], [4], [8, 16], [5]],
    build: (rng) => [
      { len: 4, ratio: 1, hits: rng() < 0.5 ? [0, 1, 2, 3] : [0, 2], acc: [0] },
      { len: 4, ratio: 1, hits: [1, 3], acc: [1, 3] },
      one(rng, [{ len: 8, ratio: 2, k: one(rng, [4, 6, 8]), rot: one(rng, [0, 1]) }, { len: 16, ratio: 4, k: one(rng, [8, 12]) }]),
      { len: 5, ratio: one(rng, [1, 2, 4]), k: one(rng, [1, 2, 3]), acc: [0] },   // meets the bar again after 5 bars at most
    ] },
  { key: 'fourfloor', name: 'four on the floor', lengths: [[4], [4], [2, 16], [8, 12, 16]],
    build: (rng) => [
      { len: 4, ratio: 1, hits: [0, 1, 2, 3], acc: [0] },
      { len: 4, ratio: 1, hits: [1, 3], acc: [1, 3] },
      one(rng, [{ len: 2, ratio: 2, hits: [1] }, { len: 16, ratio: 4, k: one(rng, [8, 12, 16]), acc: [2, 6, 10, 14], swing: one(rng, [0, 0.1, 0.15]) }]),
      (len => ({ len, ratio: 4, k: one(rng, [3, 4, 5, 7]), rot: Math.floor(rng() * len) }))(one(rng, [8, 12, 16])),
    ] },
  { key: 'boombap', name: 'boom bap', lengths: [[16], [16], [8], [8, 16]],
    build: (rng) => {
      const swing = one(rng, [0.15, 0.2, 0.25]);
      return [
        { len: 16, ratio: 4, hits: [0, ...some(rng, [7, 8, 10, 11, 14], 0.35)], acc: [0], swing },
        { len: 16, ratio: 4, hits: [4, 12, ...some(rng, [7, 15], 0.25)], acc: [4, 12], swing },   // backbeat + the odd ghost
        { len: 8, ratio: 2, k: one(rng, [6, 8]), acc: [0, 2, 4, 6], swing: swing + 0.1 },
        one(rng, [{ len: 8, ratio: 1, k: one(rng, [2, 3]), rot: one(rng, [1, 3]) }, { len: 16, ratio: 2, k: one(rng, [3, 5]), rot: one(rng, [2, 6]) }]),
      ];
    } },
];
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function lcm(a, b) { return a * b / gcd(a, b); }
