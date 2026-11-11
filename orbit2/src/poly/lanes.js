// Polyrhythm drum machine model: 4 lanes, each with its own length, speed ratio, euclidean fill, rotation,
// swing, probability and accents. Pure logic (no audio), unit-tested.
import { KITS } from './kits.js';
import { VOICES, ARTICS, ARTIC_MAX, articAt, strokeOf } from './voices.js';
/** L1: a lane loops over up to 32 steps (two bars of sixteenths). Saves from before hold 16 per lane: the rest load empty. */
export const MAX_STEPS = 32;
/** Speed ratios, slowest first (the speed knob's order). Saved as the value (`ratio`); older saves only have an index
 *  into OLD_RATIOS. ×5/4 and ×7/4 are quintuplet / septuplet feels, ×4/3 the hemiola, ×5 and ×6 fives and 16th triplets. */
export const RATIOS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 5 / 4, 4 / 3, 3 / 2, 7 / 4, 2, 3, 4, 5, 6];
export const RATIO_LABEL = ['¼', '⅓', '½', '⅔', '¾', '1', '5/4', '4/3', '3/2', '7/4', '2', '3', '4', '5', '6'];
/** The table `ratioIndex` pointed into before R2 (saves and links without a `ratio` field). */
export const OLD_RATIOS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1, 3 / 2, 2, 3, 4];
/** Index of a ratio value in RATIOS (−1 when it isn't one). */
export const ratioIndexOf = (r) => RATIOS.findIndex(x => Math.abs(x - r) < 1e-9);
/** Evolve's speed moves stay on the classic set (the range it always used), never onto ×7/4 by surprise. */
const EVOLVE_RATIOS = [2 / 3, 3 / 4, 1, 3 / 2, 2, 3];
/** Evolve's next speed: one step along the classic set; a lane outside it lands on the nearest end whatever the
 *  direction (as before R2, so a locked-dice evolve of an old pattern is the same); 5/4, 4/3, 7/4 go to the classic
 *  neighbour on that side. */
const evolveRatio = (r, dir) => {
  const e = EVOLVE_RATIOS, k = e.findIndex(x => Math.abs(x - r) < 1e-9);
  if (r < e[0] || r > e[e.length - 1]) return r < e[0] ? e[0] : e[e.length - 1];
  return k >= 0 ? e[clamp(k + dir, 0, e.length - 1)] : dir > 0 ? e.find(x => x > r) : e.findLast(x => x < r);
};
/** Lane ids (not voices). L2: a pattern has 4 or 6 lanes; lanes 5–6 default to an open hat and a cymbal (the kit's). */
export const LANE_NAMES = ['kick', 'snare', 'hat', 'perc', 'open', 'cymbal'];
export const LANE_COUNTS = [4, 6], MAX_LANES = 6;
/** A fresh lane i: lengths and speeds of the classic four, then an open hat in eighths and a two-bar cymbal lane. */
const LANE_DEFAULTS = [[4, 1], [4, 1], [8, 2], [5, 2], [8, 2], [8, 1]];
const freshLane = (i) => new Lane(LANE_NAMES[i], { length: LANE_DEFAULTS[i][0], ratioIndex: ratioIndexOf(LANE_DEFAULTS[i][1]) });
/** A fresh lane i with kit lane i's voice and sound: lanes 5–6 coming in (setLaneCount), or a link cut short. */
const kitLane = (i, kit) => { const l = freshLane(i), k = kit.lanes[i]; l.setVoice(k.voice); l.sound = { ...DEFAULT_SOUND, ...(k.sound || {}) }; return l; };
/** The lane count a pattern with `n` lanes keeps: 4 (old saves, or fewer), else 6. */
export const laneCountOf = (n) => (n > 4 ? MAX_LANES : 4);
/** Per-lane sound sculpting, all 0..1: Shift + knobs on the Move. */
export const SOUND_KEYS = ['decay', 'tone', 'drive', 'snap', 'color', 'send', 'pan', 'level'];
export const DEFAULT_SOUND = { decay: 0.5, tone: 0.75, drive: 0, snap: 0.5, color: 0.5, send: 0.15, pan: 0.5, level: 0.8 };
/** Master clock resolution (ticks per beat). 840 = 24 × 35 = 2³·3·5·7: every ratio's step is a whole number of ticks
 *  (×5/4 = 672, ×7/4 = 480, ×6 = 140), so 5- and 7-tuplets are exact. MIDI clock (24 per beat) = every MIDI_DIV ticks;
 *  the old 24-PPQ positions are exactly ×35, so a pattern plays the same hits. BAR_TICKS = a 4/4 bar. */
export const PPQ = 840, MIDI_DIV = PPQ / 24, BAR_TICKS = PPQ * 4;
/** Time signatures (R3), stored with the pattern (`meter`, missing = 4/4). A bar is num × (4 / den) quarter notes. */
export const METERS = ['4/4', '3/4', '5/4', '6/8', '7/8', '12/8'];
export const meterParts = (meter) => { const [num, den] = (METERS.includes(meter) ? meter : '4/4').split('/').map(Number); return { num, den }; };
/** Master ticks in one bar of `meter`: 4/4 = 3360, 7/8 = 2940 (3.5 beats), 6/8 = 2520. A table: the clock asks on
 *  every tick, so no string parsing there. */
const BAR_OF = Object.fromEntries(METERS.map(k => { const { num, den } = meterParts(k); return [k, PPQ * 4 * num / den]; }));
export const barTicks = (meter) => BAR_OF[meter] ?? BAR_TICKS;
/** Per-step parameter locks: hold a step and turn a knob. tune is −1..1, nudge −½..½ of a step (early/late), the rest 0..1. */
export const LOCK_KEYS = ['tune', 'prob', 'vel', 'decay', 'tone', 'snap', 'color', 'nudge'];
export const LOCK_RANGE = { tune: [-1, 1], nudge: [-0.5, 0.5], artic: [0, ARTIC_MAX] };
/** Every step lock: the knob locks plus L3 `artic` (a whole number, the voice's articulation: voices.js ARTICS). It has
 *  no knob or gauge of its own (lock panel: a chooser; Move: hold the step and push the jog wheel). */
export const STEP_LOCKS = [...LOCK_KEYS, 'artic'];
/** Lane push / pull: the whole lane early (−) or late (+), in ms. */
export const OFFSET_MS = 30;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** A loaded step lock with every known value back in its range (a share link is text anyone can edit; live play looks
 *  only one step ahead, so a nudge must stay within half a step). A nudge of 0 is no lock. */
const lockFrom = (lk) => {
  if (!lk) return null; const o = { ...lk };
  for (const k of STEP_LOCKS) if (o[k] != null) { const [lo, hi] = LOCK_RANGE[k] || [0, 1]; o[k] = clamp(k === 'artic' ? Math.round(+o[k] || 0) : +o[k] || 0, lo, hi); }
  if (o.nudge === 0) delete o.nudge; return Object.keys(o).length ? o : null;
};
/**
 * Swing templates: how far each step of a repeating group is delayed, as a multiple of the lane's swing amount (in
 * steps). Counted on the absolute step, like the classic swing. 'mpc' (null) is the classic rule in Lane.swungAt:
 * every second step, or the middle one of three at the triplet speeds. triplet at swing 50 % = exactly ⅓ of a step
 * (the 2:1 shuffle). amapiano pushes the "e" further than the "a"; 3-3-2 and aksak 2+2+3 lean on their groups.
 */
export const SWING_TEMPLATES = {
  straight: { name: 'straight', shift: [0] },
  mpc: { name: 'MPC 16th', shift: null },
  triplet: { name: 'triplet', shift: [0, 2 / 3] },
  '3-3-2': { name: '3-3-2', shift: [0, 0.5, 0.25, 0, 0.5, 0.25, 0, 0.5] },
  amapiano: { name: 'amapiano', shift: [0, 0.8, 0, 0.45] },
  aksak: { name: 'aksak 2+2+3', shift: [0, 0.6, 0, 0.6, 0, 0.4, 0.8] },
};
export const SWING_KEYS = Object.keys(SWING_TEMPLATES);
/** G4 velocity tiers: ghost = a vel lock of 0.35, normal = no lock (0.7), accent = the accent flag (1). */
export const GHOST_VEL = 0.35, VEL_TIERS = ['ghost', 'normal', 'accent'];
/** The tier a non-accent velocity is nearest to: ghost (0.35) or normal (0.7). */
export const tierOfVel = (v) => v < (GHOST_VEL + 0.7) / 2 ? 'ghost' : 'normal';
/** Trig conditions per step. 'a:b' = play on loop a of every b; fill = only while Fill is held; first = first loop after
 *  Play; pre / not pre = only if the previous conditional step on this lane passed / failed its condition (R4's PRE /
 *  NEI; Elektron calls the second /PRE, its NEI reads the neighbour track; appended, so saved conditions keep their
 *  meaning). */
export const CONDS = ['always', '1:2', '2:2', '1:3', '2:3', '3:3', '1:4', '2:4', '3:4', '4:4', 'fill', 'not fill', 'first', 'not first', 'pre', 'not pre'];
/** Conditions that set what pre / not pre read: every real condition except always and pre / not pre themselves (as on
 *  Elektron boxes, PRE looks past other PRE trigs). The probability roll and mutes don't count: only the condition. */
const setsPrev = (cond) => !!cond && cond !== 'always' && cond !== 'pre' && cond !== 'not pre';
export const MAX_RATCHET = 4;
/** A sample plays whole, from its first sample: decay at the top, no skip-in (snap) and no pitch swoop (color). */
const SAMPLE_KEYS = ['decay', 'snap', 'color'], SAMPLE_SOUND = { decay: 1, snap: 0.5, color: 0.5 };
const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));
/** Does a condition pass on loop `loop` (0 = first loop since Play)? prev: did the previous conditional step on the
 *  lane pass (for pre / not pre; false before any has played)? */
export function condPasses(cond, loop, fill = false, prev = false) {
  if (!cond || cond === 'always') return true;
  if (cond === 'pre') return prev; if (cond === 'not pre') return !prev;
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

/** The ratio index of a saved lane: by its `ratio` value, else (older saves, links) its index into the pre-R2 table. */
const ratioFrom = (o) => { const i = ratioIndexOf(typeof o.ratio === 'number' ? o.ratio : OLD_RATIOS[o.ratioIndex] ?? 1); return i < 0 ? ratioIndexOf(1) : i; };

export class Lane {
  constructor(name, { length = 8, ratioIndex = ratioIndexOf(1) } = {}) {
    this.name = name; this.length = length; this.ratioIndex = ratioIndex;
    this.hits = new Array(MAX_STEPS).fill(false); this.accents = new Array(MAX_STEPS).fill(false);
    this.rotation = 0; this.swing = 0; this.prob = 1; this.tune = 0; this.muted = false; this.pos = 0; this.euclidK = 0;
    this.locks = new Array(MAX_STEPS).fill(null); this.evolve = true;
    this.swingTpl = 'mpc'; this.offsetMs = 0;       // G6 swing template, G2 push (−) / pull (+) in ms
    this.velHuman = 0;                               // G3 velocity humanize 0..1 (±0.2 at 1)
    this.trigs = new Array(MAX_STEPS).fill(null);   // per stored step: { cond, ratchet, fade } or null
    this.solo = false; this.choke = -1;             // choke: index of the lane this one cuts off when it hits   // locks: per stored step, {key: value} or null
    this.sound = { ...DEFAULT_SOUND }; this.voice = name;   // voice = engine key from voices.js; defaults to the lane's classic sound
    this.shown = null;   // runtime, not saved: the visible step that sounded last (the playhead; the app sets it)
    this.resetLoops();
  }
  /** Switching between a drum voice and the lane's sample swaps decay / snap / color: each side keeps its own. */
  setVoice(key) {
    const was = this.voice, s = this.sample; this.voice = key;
    if (s && key === 'sample' && was !== 'sample') { s.drum = { voice: was, ...pick(this.sound, SAMPLE_KEYS) }; Object.assign(this.sound, s.own || SAMPLE_SOUND); }
    else if (s && key !== 'sample' && was === 'sample') { s.own = pick(this.sound, SAMPLE_KEYS); if (s.drum) Object.assign(this.sound, pick(s.drum, SAMPLE_KEYS)); }
    return key;
  }
  /** Put a sample { id, name } on the lane, playing whole. The drum it replaces (voice + decay/snap/color) is kept in
   *  the sample record: picking a drum voice again brings its settings back, and a share link falls back to it. */
  loadSample({ id, name }) {
    const drum = this.voice === 'sample' ? this.sample?.drum : { voice: this.voice, ...pick(this.sound, SAMPLE_KEYS) };
    this.sample = { id, name, ...(drum ? { drum } : {}) }; this.voice = 'sample'; Object.assign(this.sound, SAMPLE_SOUND);
  }
  setSound(k, v) { if (!(k in this.sound)) return; this.sound[k] = Math.max(0, Math.min(1, v)); return this.sound[k]; }
  get ratio() { return RATIOS[this.ratioIndex]; }
  setLength(n) { this.length = Math.max(1, Math.min(MAX_STEPS, Math.round(n))); if (this.pos >= this.length) this.pos = 0; return this.length; }
  setRatio(i) { this.ratioIndex = Math.max(0, Math.min(RATIOS.length - 1, Math.round(i))); return this.ratioIndex; }
  setEuclid(k) { this.euclidK = Math.max(0, Math.min(this.length, Math.round(k))); const e = euclid(this.euclidK, this.length); for (let i = 0; i < MAX_STEPS; i++) this.hits[i] = i < this.length ? e[i] : false; return this.euclidK; }
  toggle(i) { if (i >= this.length) return false; this.hits[i] = !this.hits[i]; return this.hits[i]; }
  /** The accent flag alone (Shift+tap). Turning it on lifts a ghost to an accent: the soft vel lock goes, or the accent
   *  would play under a normal hit. */
  toggleAccent(i) { if (i >= this.length) return false; this.accents[i] = !this.accents[i]; if (this.accents[i]) this.dropGhost(i); return this.accents[i]; }
  /** Tier of stored step i: 'off', 'ghost' (a vel lock under the ghost/normal midpoint), 'normal' or 'accent'. */
  tierAt(i) { if (!this.hits[i]) return 'off'; if (this.accents[i]) return 'accent'; const v = this.locks[i]?.vel; return v != null && tierOfVel(v) === 'ghost' ? 'ghost' : 'normal'; }
  /** A soft vel lock is the ghost tier itself: leaving the tier takes it away (a loud hand-set one stays). */
  dropGhost(i) { const v = this.locks[i]?.vel; if (v != null && tierOfVel(v) === 'ghost') this.unlock(i, 'vel'); }
  /** Put stored step i on a tier: ghost = vel lock 0.35, normal = no soft vel lock, accent = the flag, off = empty. Any
   *  tier but ghost drops the ghost's lock; a loud hand-set vel lock stays (an accent adds on top, as it always did). */
  setTier(i, tier) {
    if (i < 0 || i >= MAX_STEPS) return 'off'; if (tier !== 'ghost') this.dropGhost(i);
    if (tier === 'off') { this.hits[i] = false; this.accents[i] = false; return 'off'; }
    this.hits[i] = true; this.accents[i] = tier === 'accent'; if (tier === 'ghost') this.setLock(i, 'vel', GHOST_VEL); return tier;
  }
  /** One tap, no modifier: off → on → accent → ghost → off. The first tap is always a plain hit (a stale accent or vel
   *  lock on an empty step goes); a full cycle leaves the step as it found it, other locks included. */
  cycleStep(i) {
    if (i >= this.length) return 'off';
    const from = this.tierAt(i); if (from === 'off') { this.accents[i] = false; this.unlock(i, 'vel'); }
    const t = this.setTier(i, { off: 'normal', normal: 'accent', accent: 'ghost', ghost: 'off' }[from]);
    return t === 'normal' ? 'on' : t;
  }
  clear() { this.hits.fill(false); this.accents.fill(false); this.locks.fill(null); this.trigs.fill(null); this.euclidK = 0; }
  /** Condition / ratchet on one stored step. ratchet 1 = a normal hit; fade = repeats get quieter. */
  setTrig(i, patch) {
    if (i < 0 || i >= MAX_STEPS) return null; const t = { cond: 'always', ratchet: 1, fade: false, ...(this.trigs[i] || {}), ...patch };
    if (!CONDS.includes(t.cond)) t.cond = 'always'; t.ratchet = clamp(Math.round(t.ratchet), 1, MAX_RATCHET); t.fade = !!t.fade;
    this.trigs[i] = t.cond === 'always' && t.ratchet === 1 ? null : t; return this.trigs[i];
  }
  trigAt(i) { return this.trigs[this.stepIndex(i)]; }
  /** Lock a parameter on one stored step (use stepIndex() for a visible position). */
  setLock(i, k, v) {
    if (!STEP_LOCKS.includes(k) || i < 0 || i >= MAX_STEPS) return; const [lo, hi] = LOCK_RANGE[k] || [0, 1], x = clamp(k === 'artic' ? Math.round(+v || 0) : +v || 0, lo, hi);
    if (k === 'nudge' && !x) { this.unlock(i, k); return 0; }   // back on the grid is no lock at all
    (this.locks[i] ||= {})[k] = x; return x;
  }
  setOffset(ms) { this.offsetMs = clamp(Math.round(+ms || 0), -OFFSET_MS, OFFSET_MS); return this.offsetMs; }
  setSwingTpl(key) { if (SWING_TEMPLATES[key]) this.swingTpl = key; return this.swingTpl; }
  /** L3: the next articulation of stored step i for this lane's voice: lane sound → first → … → last → lane sound. */
  cycleArtic(i) { const n = ARTICS[this.voice]?.length || 0; if (!n) return null; const a = articAt(this.voice, this.locks[i]); if (a == null || a < n - 1) return this.setLock(i, 'artic', a == null ? 0 : a + 1); this.unlock(i, 'artic'); return null; }
  /** L3: the stroke a hit with this step lock plays (voices.js strokeOf, with the hit's color), null without strokes. */
  strokeAt(lock) { return strokeOf(this.voice, lock, lock?.color ?? this.sound.color); }
  clearLocks(i) { this.locks[i] = null; }
  unlock(i, k) { const lk = this.locks[i]; if (!lk) return; delete lk[k]; if (!Object.keys(lk).length) this.locks[i] = null; }
  /**
   * Live record onto stored step `i`, keeping the feel on the three tiers: an accent is its own flag (and plays full);
   * any other velocity lands on the nearest tier, ghost (a 0.35 vel lock) or normal (no lock), and drops an old accent,
   * so a soft overdub plays soft. vel null = no velocity (a computer key): normal. tune = the pitch pads' lock.
   */
  recordHit(i, { accent = false, vel = null, tune = null } = {}) {
    this.unlock(i, 'vel'); this.setTier(i, accent ? 'accent' : vel != null ? tierOfVel(vel) : 'normal');   // the hit you play sets the velocity
    if (tune != null) this.setLock(i, 'tune', tune);
  }
  lockAt(i) { return this.locks[this.stepIndex(i)]; }
  /** The locks to show as "locked" at visible position i: a lone ghost vel lock is the tier, shown as a ghost instead. */
  shownLock(i) { const lk = this.lockAt(i); return lk && !(lk.vel === GHOST_VEL && Object.keys(lk).length === 1) ? lk : null; }
  /** Master-clock ticks per step: ×1 = 840 (a beat), ×4 = 210, ×5/4 = 672, ⅔ = 1260. */
  stepTicks() { return Math.round(PPQ / this.ratio); }
  /** Steps from one step on a beat to the next: 1 (every step is on a beat), 2, 4, or 3 at ×3, ×3/2 and ×¾. */
  beatGroup() { const st = this.stepTicks(); return lcm(st, PPQ) / st; }
  /**
   * Is absolute step `step` (counted from the master tick, not the loop) a swung one? Every second step; when 3 steps
   * span a beat (or a bar at ×¾) the count restarts on each step that falls on the beat, so the beat is never swung.
   */
  swungAt(step) { const g = this.beatGroup(); return (g > 1 && g % 2 ? step % g : step) % 2 === 1; }
  /** How late absolute step `step` sounds, in steps: the swing amount through the lane's template. */
  swingAt(step) {
    const sh = SWING_TEMPLATES[this.swingTpl]?.shift; if (!sh) return this.swungAt(step) ? this.swing : 0;
    return sh[((step % sh.length) + sh.length) % sh.length] * this.swing;
  }
  /** Steps after which the swing pattern repeats: the template's group, or 2 (3 at the triplet speeds) for MPC. */
  swingPeriod() { const sh = SWING_TEMPLATES[this.swingTpl]?.shift; if (sh) return sh.length; const g = this.beatGroup(); return g > 1 && g % 2 ? g : 2; }
  /**
   * What this lane does at master tick `tick`, or null when it doesn't step there. The position is derived
   * from the tick, never accumulated, so lanes stay phase-locked through ratio, length and tempo changes.
   */
  at(tick, rng = Math.random, ctx = {}) {
    const st = this.stepTicks(); if (tick % st) return null;
    const step = tick / st, i = step % this.length, lock = this.lockAt(i), trig = this.trigAt(i), loop = this.loopAt(step);
    const r = ctx.dice ? ctx.dice.at(ctx.li ?? 0, step, this.length) : rng();
    // the condition is judged on every active step, muted or not, so a mute doesn't change what pre / not pre read later
    const on = this.hitAt(i), pass = on && condPasses(trig?.cond, loop, ctx.fill, this.lastCond);
    const hit = pass && !this.muted && !ctx.silenced && r < (lock?.prob ?? this.prob);
    if (on && setsPrev(trig?.cond)) this.lastCond = pass;
    this.pos = (i + 1) % this.length; this.loopN = loop; this.lastTick = tick;
    // swing follows the absolute step (swungAt), not the loop index: on a 5-step lane the index restarts on an odd
    // step every other loop, which would swing the downbeat
    return { index: i, step, hit, accent: hit && this.accentAt(i), swung: this.swingAt(step), lock, lane: this.name, ratchet: hit ? trig?.ratchet || 1 : 0, fade: !!trig?.fade, loop };
  }
  /** at() without moving the playhead (pos) or the loop counter: live play looks ahead with it. */
  peek(tick, rng, ctx) { const { pos, loopN, lastTick, lastCond } = this, ev = this.at(tick, rng, ctx); Object.assign(this, { pos, loopN, lastTick, lastCond }); return ev; }
  /**
   * R4 loop counter (runtime, not saved): the loop of step `step`, counted as the lane wraps. It goes up by one for each
   * index 0 the lane passes after the tick it last stepped on (`lastTick`), in the length and speed it has now, so a
   * length or a speed change mid-play keeps the count (a 1:2 step stays on its loops) and it never goes back. A fresh
   * lane (Play, a slot, a link) starts from the absolute count floor(step / length), as the renders do; with one length
   * and speed all along that is what it always is.
   */
  loopAt(step) { const L = this.length; return this.lastTick == null ? Math.floor(step / L) : Math.max(0, this.loopN + Math.floor(step / L) - Math.floor(Math.floor(this.lastTick / this.stepTicks()) / L)); }
  resetLoops() { this.loopN = 0; this.lastTick = null; this.lastCond = false; }
  /**
   * Live record: the step a hit at fractional master tick `tickF` belongs to, by where the steps are heard (a swung
   * step sounds late, so a hit played with it is filed under it). 'nearest' takes the closest (on a tie the coming
   * one: early hits land on the coming step), 'previous' always the step that just played.
   */
  quantize(tickF, mode = 'nearest') {
    const f = tickF / this.stepTicks(), b = Math.floor(f), heard = (s) => s + this.swingAt(s);
    let step = b + 1;
    if (mode === 'previous') while (heard(step) > f) step--;
    else for (const s of [b, b - 1]) if (Math.abs(heard(s) - f) < Math.abs(heard(step) - f)) step = s;
    return { step, index: ((step % this.length) + this.length) % this.length, ahead: heard(step) > f };
  }
  /** Read a step through the rotation. */
  stepIndex(i) { return ((i - this.rotation) % this.length + this.length) % this.length; }
  hitAt(i) { return this.hits[this.stepIndex(i)]; }
  accentAt(i) { return this.accents[this.stepIndex(i)]; }
  reset() { this.pos = 0; this.shown = null; this.resetLoops(); }   // a restart lights no step until one sounds, counts loops from 0
  /**
   * Loops of this lane before it sounds exactly the same again (an empty lane: 1): the lcm of every a:b condition's b
   * on its active steps; × 2 (or 3) when swing is on and the length is odd (the swung steps move through the loop);
   * × the locked dice repeat when a roll can change something (probability below 100 % or humanize).
   * 'first' / 'fill' are not periodic.
   */
  loopsPerCycle({ repeat = 1, humanize = 0 } = {}) {
    let n = 1, any = false;
    for (let i = 0; i < this.length; i++) { if (!this.hits[i]) continue; any = true; const ab = /^(\d+):(\d+)$/.exec(this.trigs[i]?.cond || ''); if (ab) n = lcm(n, +ab[2]); }
    if (!any) return 1;
    if (this.swing > 0) n = lcm(n, lcm(this.length, this.swingPeriod()) / this.length);
    const rolls = humanize > 0 || this.velHuman > 0 || this.prob < 1 || this.locks.some((lk, i) => i < this.length && this.hits[i] && lk?.prob != null && lk.prob < 1);
    return repeat > 1 && rolls ? lcm(n, repeat) : n;   // dice repeat counts loops too: 1:2 with repeat 2 is still 2
  }
  toJSON() { const { name, length, ratioIndex, hits, accents, rotation, swing, swingTpl, offsetMs, velHuman, prob, tune, muted, euclidK, sound, voice, locks, evolve, trigs, solo, choke, sample } = this; return { name, length, ratioIndex, ratio: RATIOS[ratioIndex], hits, accents, rotation, swing, swingTpl, offsetMs, velHuman, prob, tune, muted, euclidK, sound, voice, locks, evolve, trigs, solo, choke, sample: sample || null }; }
  // copies everything it is given, so a lane loaded from a slot (or undo) never edits the stored one
  static from(o) { const l = new Lane(o.name, { length: o.length, ratioIndex: ratioFrom(o) }); Object.assign(l, { hits: Array.from({ length: MAX_STEPS }, (_, i) => !!o.hits?.[i]), accents: Array.from({ length: MAX_STEPS }, (_, i) => !!o.accents?.[i]), rotation: o.rotation, swing: o.swing, prob: o.prob, tune: o.tune, muted: o.muted, euclidK: o.euclidK }); l.sound = { ...DEFAULT_SOUND, ...(o.sound || {}) }; l.voice = o.voice || o.name; l.locks = Array.from({ length: MAX_STEPS }, (_, i) => lockFrom(o.locks?.[i])); l.evolve = o.evolve ?? true; l.trigs = Array.from({ length: MAX_STEPS }, (_, i) => (o.trigs?.[i] ? { ...o.trigs[i] } : null)); l.solo = !!o.solo; l.choke = Number.isInteger(o.choke) ? o.choke : -1; l.sample = o.sample ? JSON.parse(JSON.stringify(o.sample)) : null; l.setSwingTpl(o.swingTpl); l.setOffset(o.offsetMs); l.velHuman = clamp(+o.velHuman || 0, 0, 1); return l; }   // older saves: no template (MPC), no offset
}

export class Machine {
  // a new machine plays the Common kit: lane names are ids, not voices ('perc' is not a voice)
  constructor(n = 4) { this.lanes = Array.from({ length: laneCountOf(n) }, (_, i) => freshLane(i)); this.selected = 0; this.humanize = 0; this.meter = '4/4'; this.origin = 0; this.applyKit(KITS.common, DEFAULT_SOUND); }
  setMeter(meter) { if (METERS.includes(meter)) this.meter = meter; return this.meter; }
  /**
   * L2: 4 or 6 lanes. Lanes 5–6 come in empty, with the voices and sounds of the kit the pattern still plays (else
   * Common's); going back to 4 drops them (undo brings them back), and a choke aimed at a dropped lane goes.
   */
  setLaneCount(n) {
    n = laneCountOf(n); const had = this.lanes.length; if (n === had) return n;
    if (n > had) { const kit = KITS[this.kitKey()] || KITS.common; while (this.lanes.length < n) this.lanes.push(kitLane(this.lanes.length, kit)); }
    else { this.lanes.length = n; for (const l of this.lanes) if (l.choke >= n) l.choke = -1; this.selected = Math.min(this.selected, n - 1); }
    return n;
  }
  /**
   * Runtime, not saved: the master tick this pattern's bar 1 starts on (the app's bar anchor, which moves when the time
   * signature changes: the meter control, or a slot or chain step in another meter). Lanes count their steps from
   * here, so a pattern in a new meter starts on its own downbeat; with one meter since Play it is 0, as it always was.
   * A move keeps each lane's loop count going: the restart on step 1 is one more wrap (R4).
   */
  setOrigin(t) { const d = t - this.origin; if (!d) return; for (const l of this.lanes) if (l.lastTick != null) l.lastTick -= d; this.origin = t; }
  /** Master ticks in one bar of this pattern's time signature. */
  barTicks() { return barTicks(this.meter); }
  get lane() { return this.lanes[this.selected]; }
  select(i) { this.selected = ((i % this.lanes.length) + this.lanes.length) % this.lanes.length; return this.lane; }
  /** Seconds per step: at ratio ×1 a step is a quarter note (4 steps = one bar); ×2 = eighths, ×4 = sixteenths, ½ = half notes. */
  stepSeconds(lane, bpm) { return (60 / bpm) / lane.ratio; }
  /**
   * Beats (quarter notes) until the whole machine repeats exactly: lengths × speeds, × trig conditions (1:3 = three
   * loops), × the locked dice repeat. opts.repeat = dice.repeat when the dice are locked (else 1).
   */
  cycleSteps(opts) { return this.cycleTicks(opts) / PPQ; }
  resetAll() { for (const l of this.lanes) l.reset(); }
  /** Master ticks until every lane lines up again: in whole ticks (a ×5/4 loop is not a whole number of 12ths of a beat). */
  cycleTicks({ repeat = 1 } = {}) { return Math.max(1, this.lanes.reduce((acc, l) => lcm(acc, l.length * l.stepTicks() * l.loopsPerCycle({ repeat, humanize: this.humanize })), 1)); }
  /** Every lane's event at master tick `tick` (null where a lane doesn't step), its steps counted from `origin`. */
  /** ctx: { fill, dice } — solo silences every lane that isn't soloed. */
  tick(tick, rng = Math.random, ctx = {}) { const solo = this.lanes.some(l => l.solo), r = tick - this.origin; return this.lanes.map((l, li) => r < 0 || r % l.stepTicks() ? null : l.at(r, rng, { ...ctx, li, silenced: solo && !l.solo })); }   // most ticks step no lane: nothing allocated
  /** Does any lane step at master tick `tick`? */
  steps(tick) { const r = tick - this.origin; return r >= 0 && this.lanes.some(l => r % l.stepTicks() === 0); }
  /**
   * Replace the whole state in place (pattern slots, undo), keeping the object other code holds. A slot or a link
   * starts its lanes fresh, from the absolute loop count, as the chain render does; keep (undo / redo, evolve's way
   * home) lets each new lane go on counting loops where the one it replaces was (R4: no jump in a 1:2 or PRE).
   * selected: the lane to keep selected (the state's own if not given), within the new lane count (L2: a 4-lane state
   * replacing 6 lanes moves a selected lane 5 / 6 to lane 4).
   */
  assign(o, { keep = false, selected = null } = {}) {
    const n = Machine.from(o); if (keep) n.lanes.forEach((l, i) => { const p = this.lanes[i]; if (p) Object.assign(l, { loopN: p.loopN, lastTick: p.lastTick, lastCond: p.lastCond }); });
    this.lanes = n.lanes; this.selected = clamp(selected ?? n.selected, 0, n.lanes.length - 1); this.humanize = n.humanize; this.kit = n.kit; this.meter = n.meter; return this;
  }
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
      // evolve keeps its old reach (2–16 steps): a 16-step lane never drifts to 17; a longer lane (L1) can only shrink back
      if (kind === 'length') { l.setLength(clamp(l.length + dir, 2, Math.max(16, l.length))); if (l.euclidK) l.setEuclid(Math.min(l.euclidK, l.length)); l.rotation %= l.length; }
      if (kind === 'ratio') l.setRatio(ratioIndexOf(evolveRatio(l.ratio, dir)));
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
    // L2 lanes 5–6 (after the family's own rolls, so a 4-lane pattern rolls what it always did): an open sound on some
    // offbeat eighths, a cymbal on the first beat every two bars (a 1- and a 2-bar loop keep the cycle short)
    if (this.lanes.length > 4) specs.push({ len: 8, ratio: 2, hits: one(rng, [[3, 7], [7], [1, 3, 5, 7]]) }, { len: 8, ratio: 1, hits: [0], acc: [0] });
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
    // a 4-lane pattern matches the kit's first four lanes
    return Object.keys(KITS).find(key => this.lanes.every((l, i) => { const k = KITS[key].lanes[i]; if (!k || l.voice !== k.voice) return false; const s = { ...DEFAULT_SOUND, ...(k.sound || {}) }; return SOUND_KEYS.every(sk => same(l.sound[sk], s[sk])); })) ?? null;
  }
  toJSON() { return { lanes: this.lanes.map(l => l.toJSON()), selected: this.selected, humanize: this.humanize, kit: this.kit, meter: this.meter }; }
  static from(o) {
    // L2: the data keeps its lane count (4, or 6); a link edited to some other count is cut, or filled up with the lanes
    // of the kit it plays (as setLaneCount would add them)
    const m = new Machine(o?.lanes?.length); if (o?.lanes) { const n = m.lanes.length; m.lanes = o.lanes.slice(0, n).map(Lane.from); m.kit = o.kit; if (m.lanes.length < n) { const kit = KITS[m.kitKey()] || KITS.common; while (m.lanes.length < n) m.lanes.push(kitLane(m.lanes.length, kit)); } }
    m.selected = Math.max(0, Math.min(m.lanes.length - 1, o?.selected | 0)); m.humanize = o?.humanize ?? 0; m.setMeter(o?.meter);
    // old saves and links can name a voice that doesn't exist (lane 4 used to default to 'perc'), or a sample lane
    // without its sample record: give that lane the Common kit's voice instead of a silent fallback to the kick.
    // (A record whose audio is no longer in IndexedDB can't be seen from here: that lane stays silent.)
    m.lanes.forEach((l, i) => { if (l.voice === 'sample' ? !l.sample : !VOICES[l.voice]) l.voice = KITS.common.lanes[i].voice; if (l.choke >= m.lanes.length) l.choke = -1; });
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
 * Swing moves every second step of a lane's own grid, so a family swings on one grid only: the sixteenths, every ×4
 * lane by the same amount (×2 lanes then play straight eighths, which that grid doesn't move). Tresillo and clave are
 * straight. A half-time snare (on 3) never lands on a kick. Tests check every roll for flams.
 */
/** Kick on the beats (or 1 and 3), backbeat on 2 and 4 or half time on 3, never both on 3. */
const beatKickSnare = (rng, pFull, pBack) => {
  const kick = rng() < pFull ? [0, 1, 2, 3] : [0, 2], back = rng() < pBack;
  return [{ len: 4, ratio: 1, hits: back ? kick : kick.filter(i => i !== 2), acc: [0] }, { len: 4, ratio: 1, hits: back ? [1, 3] : [2], acc: [1, 2, 3] }];
};
export const MUSICAL_FAMILIES = [
  { key: 'tresillo', name: 'tresillo over four', lengths: [[8, 16], [16], [4, 8, 16], [8, 16]],
    build: (rng) => {
      const long = rng() < 0.5;
      return [
        { len: long ? 16 : 8, ratio: 4, hits: long ? [0, 3, 6, 8, 11, ...some(rng, [14], 0.5)] : [0, 3, 6], acc: [0] },   // 3+3+2
        { len: 16, ratio: 4, hits: rng() < 0.7 ? [4, 12] : [8], acc: [4, 8, 12] },
        one(rng, [{ len: 8, ratio: 2, k: 8, acc: [0, 2, 4, 6] }, { len: 16, ratio: 4, k: one(rng, [8, 12, 16]) }, { len: 4, ratio: 2, hits: [1, 3] }]),
        { len: one(rng, [8, 16]), ratio: 4, k: 3, rot: one(rng, [2, 4, 5]) },    // the tresillo answered on the other lane
      ];
    } },
  { key: 'clave32', name: '3-2 clave', lengths: [[4], [4], [2, 8, 16], [16]],
    build: (rng) => [
      ...beatKickSnare(rng, 0.6, 0.5),
      one(rng, [{ len: 2, ratio: 2, hits: [1] }, { len: 16, ratio: 4, k: one(rng, [6, 8, 10]), rot: one(rng, [0, 1, 2]) }, { len: 8, ratio: 2, k: 8, acc: [1, 3, 5, 7] }]),
      { len: 16, ratio: one(rng, [2, 4]), hits: [0, 3, 6, 10, 12], acc: [0] },   // son clave 3-2: 2 bars of 8ths, or 1 bar of 16ths
    ] },
  { key: '4vs3', name: 'four against three', lengths: [[4], [4], [3, 6], [3, 12]],
    build: (rng) => [
      ...beatKickSnare(rng, 0.5, 0.6),
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
    build: (rng) => {
      const swing = one(rng, [0, 0.1, 0.15]);   // the sixteenths' shuffle, the same on both ×4 lanes
      return [
        { len: 4, ratio: 1, hits: [0, 1, 2, 3], acc: [0] },
        { len: 4, ratio: 1, hits: [1, 3], acc: [1, 3] },
        one(rng, [{ len: 2, ratio: 2, hits: [1] }, { len: 16, ratio: 4, k: one(rng, [8, 12, 16]), acc: [2, 6, 10, 14], swing }]),
        (len => ({ len, ratio: 4, k: one(rng, [3, 4, 5, 7]), rot: Math.floor(rng() * len), swing }))(one(rng, [8, 12, 16])),
      ];
    } },
  { key: 'boombap', name: 'boom bap', lengths: [[16], [16], [16], [8, 16]],
    build: (rng) => {
      const swing = one(rng, [0.15, 0.2, 0.25]), more = some(rng, [7, 8, 10, 11, 14], 0.35);   // swung sixteenths: 57.5–62.5 %
      return [
        { len: 16, ratio: 4, hits: [0, ...(more.length ? more : [one(rng, [7, 10])])], acc: [0], swing },   // never a lone kick
        { len: 16, ratio: 4, hits: [4, 12, ...some(rng, [7, 15], 0.25)], acc: [4, 12], swing },   // backbeat + the odd ghost
        { len: 16, ratio: 4, hits: [0, 2, 4, 6, 8, 10, 12, 14, ...some(rng, [3, 7, 11, 15], 0.3)], acc: [0, 4, 8, 12], swing },   // 8ths + swung 16th pickups
        one(rng, [{ len: 8, ratio: 1, k: one(rng, [2, 3]), rot: one(rng, [1, 3]) }, { len: 16, ratio: 2, k: one(rng, [3, 5]), rot: one(rng, [2, 6]) }]),
      ];
    } },
];
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function lcm(a, b) { return a / gcd(a, b) * b; }   // divide first: cycles in 840-PPQ ticks get big
