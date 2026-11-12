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
/** V1: evolve's way back to a home speed: one step along the classic set, the home speed and the lane's own speed
 *  (so a home on ×5/4 is reached, and a lane on ×7/4 can leave it). */
const ratioToward = (r, home) => {
  const s = [...new Set([...EVOLVE_RATIOS, home, r])].sort((a, b) => a - b), k = s.indexOf(r), h = s.indexOf(home);
  return s[k + Math.sign(h - k)];
};
/** V1 evolve kinds, in the order the weights are shown: rotation, the hits, length, speed, chance (lane probability),
 *  tune. The default weights move what evolve always moved (equal odds, in the order it always rolled them), so a
 *  locked-dice evolve of an old pattern picks the same kinds; chance and tune are off until you give them a weight. */
export const EVOLVE_KINDS = ['rotate', 'hits', 'length', 'ratio', 'prob', 'tune'];
export const EVOLVE_WEIGHTS = { rotate: 1, hits: 1, length: 1, ratio: 1, prob: 0, tune: 0 };
export const MAX_WEIGHT = 4;
/** The kinds each evolve scope may touch ('all' = everything with a weight). */
const SCOPE_KINDS = { rotate: ['rotate'], hits: ['rotate', 'hits'], all: EVOLVE_KINDS };
/** Weighted pick with one roll r (0..1). With equal weights it is kinds[floor(r × n)], the old uniform pick. */
const pickWeighted = (kinds, w, r) => { let x = r * kinds.reduce((a, k) => a + w(k), 0); for (const k of kinds) { x -= w(k); if (x < 0) return k; } return kinds[kinds.length - 1]; };
/** Saved evolve weights back in range: whole numbers 0..MAX_WEIGHT, the default for anything missing. */
export const weightsFrom = (o) => Object.fromEntries(EVOLVE_KINDS.map(k => [k, clamp(Math.round(Number.isFinite(+o?.[k]) && o?.[k] !== null ? +o[k] : EVOLVE_WEIGHTS[k]), 0, MAX_WEIGHT)]));
/** What a lane step carries besides the hit: its accent, step locks and condition / ratchet (V1: they move with it). */
const STEP_DATA = ['accents', 'locks', 'trigs'];
/** The fields evolve may change on a lane (what the max cycle guard puts back when a move goes too long). */
const EVOLVE_FIELDS = ['length', 'ratioIndex', 'hits', 'accents', 'rotation', 'prob', 'tune', 'euclidK', 'locks', 'trigs'];
/** V2 coupling: off, "next lane" (a hit on lane A lifts lane A+1, the last lifts the first) or a matrix (row = the lane
 *  that hits, column = the lane it lifts, 0..1 each). The lift is added to the lifted lane's probability for its next
 *  step only. */
export const COUPLE_MODES = ['off', 'next', 'matrix'];
const coupleFrom = (o) => {
  const mode = COUPLE_MODES.includes(o?.mode) ? o.mode : 'off', amount = clamp(Number.isFinite(+o?.amount) ? +o.amount : 0.5, 0, 1);
  const matrix = Array.from({ length: MAX_LANES }, (_, a) => Array.from({ length: MAX_LANES }, (_, b) => clamp(+o?.matrix?.[a]?.[b] || 0, 0, 1)));
  return { mode, amount, matrix };
};
/** V5 modulator from saved data: a known target, loops 0..16 (0 = the whole cycle), depth 0..1; null when off. */
const modFrom = (o) => (o && MOD_TARGETS.includes(o.target) ? { target: o.target, loops: clamp(Math.round(+o.loops || 0), 0, 16), depth: clamp(+o.depth || 0, 0, 1) } : null);
/** V5 timbre dice from saved data: a range 0..1 per key; null when every range is 0. */
const tdiceFrom = (o) => { if (!o) return null; const t = Object.fromEntries(TIMBRE_KEYS.map(k => [k, clamp(+o[k] || 0, 0, 1)])); return TIMBRE_KEYS.some(k => t[k] > 0) ? t : null; };
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
/** S1: a slice set holds up to 16 slices (a bar of 16ths). */
export const MAX_SLICES = 16;
/** S1 / S2: the speed (a RATIOS index) at which n steps last a break `sec` seconds long at `bpm`. The break is taken as
 *  ½, 1, 2 or 4 bars of 4/4, whichever is nearest its length at this tempo and gives each slice a whole step at a speed
 *  the lane has: 16 slices of a bar play as 16ths (×4), 8 as 8ths (×2), 16 of two bars as 8ths. A count no bar fits
 *  (11 slices from a hand-off) gets the nearest speed. */
export function breakSpeed(n, sec, bpm) {
  const b0 = (sec * bpm) / 60, beats = b0 > 0 ? b0 : 4, far = (b) => Math.abs(Math.log2(b / beats)), near = (list) => list.reduce((a, b) => (far(b) < far(a) ? b : a));
  const fits = [2, 4, 8, 16].filter(b => ratioIndexOf(n / b) >= 0); if (fits.length) return ratioIndexOf(n / near(fits));
  const r = n / near([2, 4, 8, 16]); return RATIOS.reduce((best, x, i) => (Math.abs(Math.log2(x / r)) < Math.abs(Math.log2(RATIOS[best] / r)) ? i : best), 0);
}
export const LOCK_RANGE = { tune: [-1, 1], nudge: [-0.5, 0.5], artic: [0, ARTIC_MAX], slice: [0, MAX_SLICES - 1] };
/** Every step lock: the knob locks plus L3 `artic` (a whole number, the voice's articulation: voices.js ARTICS). It has
 *  no knob or gauge of its own (lock panel: a chooser; Move: hold the step and push the jog wheel). S1 / S3 on a sample
 *  lane: `slice` (which slice of the set), `start` / `end` (0..1 of the slice) and `rev` (1 = backwards, 0 = forwards
 *  even on a reversed lane). */
export const STEP_LOCKS = [...LOCK_KEYS, 'artic', 'slice', 'start', 'end', 'rev'];
/** Locks that are whole numbers. */
const INT_LOCKS = new Set(['artic', 'slice', 'rev']);
const lockVal = (k, v) => { const [lo, hi] = LOCK_RANGE[k] || [0, 1]; return clamp(INT_LOCKS.has(k) ? Math.round(+v || 0) : +v || 0, lo, hi); };
/** Lane push / pull: the whole lane early (−) or late (+), in ms. */
export const OFFSET_MS = 30;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** A loaded step lock with every known value back in its range (a share link is text anyone can edit; live play looks
 *  only one step ahead, so a nudge must stay within half a step). A nudge of 0 is no lock. */
const lockFrom = (lk) => {
  if (!lk) return null; const o = { ...lk };
  for (const k of STEP_LOCKS) if (o[k] != null) o[k] = lockVal(k, o[k]);
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
/** V4: a step repeats up to 8 times inside itself. */
export const MAX_RATCHET = 8;
/** V4 ratchet spacing: even, speed-up (the gaps shrink), slow-down (they grow). */
export const RATCHET_CURVES = ['even', 'up', 'down'];
/** V4: where repeat k of n starts, as a fraction of the step (0 = on it, always < 1). Even: k/n. Slow-down: the n gaps
 *  (the last runs to the next step) grow evenly from ½ to 1½ of the even gap. Speed-up: the n − 1 gaps between the
 *  repeats shrink evenly from 1½ to ½ of it, and the last repeat sits where the even one does, a whole even gap before
 *  the next step (closer, it piled onto that step's hit). So no two repeats come closer than 1 / (2n) of a step: at ×8
 *  every repeat is still its own hit (a quadratic curve put two ×8 repeats 1/64 step apart: +9 dB on a kick).
 *  ×2: slow-down 0, ¼; speed-up has one gap, so it is even. */
export const ratchetTimes = (n, curve = 'even') => Array.from({ length: n }, (_, k) => {
  if (curve === 'down' && n > 1) return (k + (k * (k - 1)) / (n - 1)) / (2 * n);   // gap j = (1 + 2j / (n − 1)) / 2n
  if (curve === 'up' && n > 2) return (3 * k - (k * (k - 1)) / (n - 2)) / (2 * n);   // gap j = (3 − 2j / (n − 2)) / 2n, j < n − 1
  return k / n;
});
/** V4: the velocity factor of each repeat. A repeat closer than the even gap to its neighbour (the one before, or the one
 *  after: for the last that is the next step) plays softer by as much (n × the shorter gap, down to ½), so a curve
 *  carries the even ratchet's energy: the curve shapes the timing, not the level (without it, ×8 curves piled up over ×8
 *  even and a speed-up's last repeat stacked onto the next step's hit, pushing a busy dsp mix over full scale). The
 *  step's own hit (the first) and even repeats stay at 1. */
export const ratchetGains = (n, curve = 'even') => { const t = ratchetTimes(n, curve), gap = (k) => (k + 1 < n ? t[k + 1] : 1) - t[k]; return t.map((_, k) => (k ? Math.min(1, n * Math.min(gap(k - 1), gap(k))) : 1)); };
/** V3 euclid combine modes: replace = the fill is the pattern (the classic euclid knob, hand edits on top); and = only the
 *  hand hits the fill also has play; xor = the hand pattern flips the fill (a hand hit on a fill hit rests, one off it
 *  plays). With and / xor the hand pattern stays as you set it: the euclid knob moves only the mask. */
export const EUCLID_MODES = ['replace', 'and', 'xor'];
/** V5 slow modulator targets (lane sound keys) and timbre dice keys. */
export const MOD_TARGETS = ['tone', 'color', 'decay'], TIMBRE_KEYS = ['tone', 'color', 'decay'];
/** V5: the modulator's offset at phase ph (0..1 of its period): a sine, ± depth / 2 around the sound it moves. */
export const modValue = (depth, ph) => depth * 0.5 * Math.sin(2 * Math.PI * ph);
/** V5 scale snap: semitone degrees in an octave. just = the 12 just-intonation ratios (1, 16/15, 9/8 … 15/8) as semitones,
 *  so a tuned lane lands on pure intervals instead of equal-tempered ones. */
export const SCALES = {
  off: null, major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], penta: [0, 2, 4, 7, 9],
  just: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8].map(r => 12 * Math.log2(r)),
};
export const SCALE_KEYS = Object.keys(SCALES);
/** V5: a tune (−1..1, `semis` semitones per unit on this voice) moved to the nearest degree of `scale`, from the voice's
 *  own root; it stays in −1..1. */
export function snapTune(t, scale, semis = 12) {
  const deg = SCALES[scale]; if (!deg || !semis) return t;
  const s = t * semis, oct = Math.floor(s / 12), r = s - 12 * oct, all = [...deg, 12];
  const d = all.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
  let x = (12 * oct + d) / semis; if (x > 1 + 1e-9) x = (12 * oct + all.filter(v => (12 * oct + v) / semis <= 1 + 1e-9).at(-1)) / semis; if (x < -1 - 1e-9) x = -1;
  return clamp(x, -1, 1);
}
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

/**
 * Euclidean rhythm: k hits spread as evenly as possible over n steps, always starting on a hit. V3 note: this is the
 * "floor" (Bresenham) form, not Bjorklund's algorithm. Both give the same gaps, but not always in the same order or from
 * the same step: E(5,8) here is x.x.xx.x (gaps 2 2 1 2 1); Bjorklund / Toussaint's cinquillo is x.xx.xx. (2 1 2 1 2), the
 * same necklace started two steps later (rotation 6 here, or 2 the other way, gives the cinquillo). E(3,8) is the
 * tresillo x..x..x. in both. Saved patterns store the hits, so this can't change under them.
 */
export function euclid(k, n) {
  k = Math.max(0, Math.min(n, k)); if (n <= 0) return [];
  // a hit wherever floor(i·k/n) steps up: E(3,8) = 10010010 (tresillo), always starting on a hit
  return Array.from({ length: n }, (_, i) => k > 0 && Math.floor(i * k / n) !== Math.floor((i - 1) * k / n));
}

/** The ratio index of a saved lane: by its `ratio` value, else (older saves, links) its index into the pre-R2 table. */
const ratioFrom = (o) => { const i = ratioIndexOf(typeof o.ratio === 'number' ? o.ratio : OLD_RATIOS[o.ratioIndex] ?? 1); return i < 0 ? ratioIndexOf(1) : i; };

/** A loaded sample record, copied: a slice set keeps up to 16 string ids (an empty one is a single sample again, its
 *  id the first), start / end / rev are put back in range. Old records ({ id, name }) load as they are. */
const sampleFrom = (o) => {
  if (!o) return null; const s = JSON.parse(JSON.stringify(o));
  if (Array.isArray(s.slices)) { s.slices = s.slices.filter(x => typeof x === 'string').slice(0, MAX_SLICES); if (s.slices.length) s.id = s.slices[0]; else delete s.slices; } else delete s.slices;
  for (const k of ['start', 'end']) if (s[k] != null) s[k] = clamp(+s[k] || 0, 0, 1); if (s.rev != null) s.rev = !!s.rev;
  return s;
};

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
    // V3 euclid combine mode; V5 slow modulator { target, loops (0 = the whole cycle), depth } or null, timbre dice
    // { tone, color, decay: range 0..1 } or null, scale snap for tune (SCALES key)
    this.euclidMode = 'replace'; this.mod = null; this.tdice = null; this.scale = 'off';
    this.resetLoops();
  }
  /** V3: the euclid mask of the lane (cached on k and length). */
  mask() { const key = this.euclidK * 64 + this.length; if (this._maskKey !== key) { this._mask = euclid(this.euclidK, this.length); this._maskKey = key; } return this._mask; }
  /** V3: does stored step si play? The hand hit, through the euclid mask in and / xor mode. */
  played(si) { const h = this.hits[si]; if (this.euclidMode === 'replace' || si >= this.length) return h; const e = !!this.mask()[si]; return this.euclidMode === 'and' ? h && e : h !== e; }
  /** V3: in and / xor mode a stored hand hit the mask silences (shown dimmed). */
  maskedOut(si) { return this.euclidMode !== 'replace' && si < this.length && this.hits[si] && !this.played(si); }
  setEuclidMode(mode) { if (EUCLID_MODES.includes(mode)) this.euclidMode = mode; return this.euclidMode; }
  /** V5 slow modulator, put back in range (null = off). */
  setMod(o) { this.mod = modFrom(o); return this.mod; }
  /** V5 timbre dice ranges, put back in range (null = off). */
  setTimbreDice(o) { this.tdice = tdiceFrom(o); return this.tdice; }
  setScale(key) { this.scale = SCALE_KEYS.includes(key) ? key : 'off'; return this.scale; }
  /** V5: what the modulator does to a hit on absolute step `step` (tick = master ticks from the lane's origin, cycle = the
   *  pattern's cycle in ticks, for a modulator on the whole cycle): { k, d } (sound key, offset) or null. */
  modAt(step, tick, cycle) {
    const md = this.mod; if (!md?.depth) return null; const per = md.loops > 0 ? this.length * md.loops : 0;
    const ph = per ? (step % per) / per : cycle > 0 ? (tick % cycle) / cycle : 0; return { k: md.target, d: modValue(md.depth, ph) };
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
  /** S1: put a slice set { name, slices: [id…] } on the lane (as loadSample; `id` is its first slice, so everything that
   *  only knows one sample still finds audio). */
  loadSlices({ name, slices }) { const ids = slices.slice(0, MAX_SLICES); if (!ids.length) return; this.loadSample({ id: ids[0], name }); this.sample.slices = ids; }
  /** S1 / S2: a whole break (`sec` long) as the lane's slice set. A lane already playing a slice set with steps on keeps
   *  its chops (a new break in the same pattern, its decay / snap / color too); any other lane gets the break laid across
   *  it at the speed that makes its steps last the break (breakSpeed at `bpm`). True when it was laid out. */
  loadBreak({ name, slices, sec, bpm }) {
    const keep = this.sliceCount() > 0 && this.hits.some((h, i) => h && i < this.length); if (!slices?.length) return false;
    const own = pick(this.sound, SAMPLE_KEYS); this.loadSlices({ name, slices }); if (keep) { Object.assign(this.sound, own); return false; }
    const n = this.sliceCount(); this.layBreak(n, breakSpeed(n, sec, bpm)); return true;
  }
  /** S1 / S3: what a pad hit on stored step i plays: the step's slice and, on a sample lane, its start / end / direction
   *  under the hit's own `lock` (a pitch pad's tune), so a pad sounds as the step will. */
  padHit(i, lock = null) {
    const sl = this.voice === 'sample' ? this.locks[i] : null, part = sl ? Object.fromEntries(['start', 'end', 'rev'].filter(k => sl[k] != null).map(k => [k, sl[k]])) : {};
    return { lock: Object.keys(part).length ? { ...part, ...lock } : lock, slice: this.sliceAt(i, this.locks[i]) };
  }
  /** n slices across the lane, played straight as recorded: n steps, all on, from step 1, at speed ri, without swing,
   *  push, humanize, tune or chance, the filter open and no delay. The old pattern (hits, accents, locks, conditions)
   *  goes: one undo brings it back. */
  layBreak(n, ri) {
    this.clear(); Object.assign(this, { rotation: 0, swing: 0, offsetMs: 0, velHuman: 0, tune: 0, prob: 1 });
    this.setLength(n); this.setRatio(ri); this.setEuclid(this.length); Object.assign(this.sound, { tone: 1, send: 0 });
  }
  /** S3: something on the lane plays backwards (the lane, or a step's rev lock), so its reversed copies are worth making early. */
  usesRev() { return !!this.sample?.rev || this.locks.some(l => l?.rev === 1); }
  /** Slices in the lane's set, 0 for a single sample or none. */
  sliceCount() { return this.sample?.slices?.length || 0; }
  /** S1: the slice stored step `i` plays: its `slice` lock (kept in the set), else step i of the set (i mod N); null
   *  without a set. */
  sliceAt(i, lock) { const n = this.sliceCount(); if (!n) return null; const s = lock?.slice; return s != null ? Math.min(s, n - 1) : ((i % n) + n) % n; }
  /** The IndexedDB id of the audio slice `slice` plays (the single sample when the lane has no set). */
  sampleId(slice) { const s = this.sample; return s?.slices?.length ? s.slices[Math.max(0, Math.min(s.slices.length - 1, slice ?? 0))] : s?.id ?? null; }
  /** S3: the part of the sample a hit plays, from its locks over the lane's own: start / end 0..1 (start past end plays
   *  the gap between them), rev true = backwards. */
  trimAt(lock) { const s = this.sample || {}; return { start: lock?.start ?? s.start ?? 0, end: lock?.end ?? s.end ?? 1, rev: !!(lock?.rev ?? s.rev ?? 0) }; }
  /** S3: the lane's start / end (0..1) or rev (bool), saved on its sample record; the defaults are not stored. */
  setTrim(k, v) {
    const s = this.sample; if (!s || !['start', 'end', 'rev'].includes(k)) return null;
    const x = k === 'rev' ? !!v : clamp(+v || 0, 0, 1); if (x === (k === 'end' ? 1 : k === 'rev' ? false : 0)) delete s[k]; else s[k] = x; return x;
  }
  setSound(k, v) { if (!(k in this.sound)) return; this.sound[k] = Math.max(0, Math.min(1, v)); return this.sound[k]; }
  get ratio() { return RATIOS[this.ratioIndex]; }
  setLength(n) { this.length = Math.max(1, Math.min(MAX_STEPS, Math.round(n))); if (this.pos >= this.length) this.pos = 0; return this.length; }
  setRatio(i) { this.ratioIndex = Math.max(0, Math.min(RATIOS.length - 1, Math.round(i))); return this.ratioIndex; }
  /** The euclid knob: in replace mode a new fill (the hits), in and / xor mode only the mask (the hand hits stay). */
  setEuclid(k) { this.euclidK = Math.max(0, Math.min(this.length, Math.round(k))); if (this.euclidMode !== 'replace') return this.euclidK; const e = euclid(this.euclidK, this.length); for (let i = 0; i < MAX_STEPS; i++) this.hits[i] = i < this.length ? e[i] : false; return this.euclidK; }
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
    // V4 spacing and pitch ramp (−1..1 of tune over the repeats), stored only when set: older trigs stay as they were
    if (!RATCHET_CURVES.includes(t.curve) || t.curve === 'even') delete t.curve; t.ramp = clamp(+t.ramp || 0, -1, 1); if (!t.ramp) delete t.ramp;
    this.trigs[i] = t.cond === 'always' && t.ratchet === 1 ? null : t; return this.trigs[i];
  }
  trigAt(i) { return this.trigs[this.stepIndex(i)]; }
  /** Lock a parameter on one stored step (use stepIndex() for a visible position). */
  setLock(i, k, v) {
    if (!STEP_LOCKS.includes(k) || i < 0 || i >= MAX_STEPS) return; const x = lockVal(k, v);
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
   * ctx.origin: the master tick the lane's step 1 is on (the pattern's bar 1, or where a slot restarted it: P4); the
   * steps, loops and the playhead count from there, nothing steps before it.
   */
  at(tick, rng = Math.random, ctx = {}) {
    if (ctx.origin) tick -= ctx.origin; const st = this.stepTicks(); if (tick < 0 || tick % st) return null;
    const step = tick / st, i = step % this.length, lock = this.lockAt(i), trig = this.trigAt(i), loop = this.loopAt(step);
    const r = ctx.dice ? ctx.dice.at(ctx.li ?? 0, step, this.length) : rng();
    // the condition is judged on every active step, muted or not, so a mute doesn't change what pre / not pre read later
    const on = this.hitAt(i), pass = on && condPasses(trig?.cond, loop, ctx.fill, this.lastCond);
    const hit = pass && !this.muted && !ctx.silenced && r < (lock?.prob ?? this.prob) + (ctx.boost || 0);   // V2: a coupled lane's lift
    if (on && setsPrev(trig?.cond)) this.lastCond = pass;
    this.pos = (i + 1) % this.length; this.loopN = loop; this.lastTick = tick;
    // swing follows the absolute step (swungAt), not the loop index: on a 5-step lane the index restarts on an odd
    // step every other loop, which would swing the downbeat
    return { index: i, step, hit, accent: hit && this.accentAt(i), swung: this.swingAt(step), lock, lane: this.name, ratchet: hit ? trig?.ratchet || 1 : 0, fade: !!trig?.fade, curve: trig?.curve, ramp: trig?.ramp || 0, loop, slice: this.sliceAt(this.stepIndex(i), lock), mod: hit && this.mod ? this.modAt(step, tick, ctx.cycle) : null };
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
  hitAt(i) { return this.played(this.stepIndex(i)); }
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
    for (let i = 0; i < this.length; i++) { if (!this.played(i)) continue; any = true; const ab = /^(\d+):(\d+)$/.exec(this.trigs[i]?.cond || ''); if (ab) n = lcm(n, +ab[2]); }
    if (!any) return 1;
    if (this.swing > 0) n = lcm(n, lcm(this.length, this.swingPeriod()) / this.length);
    const rolls = humanize > 0 || this.velHuman > 0 || this.prob < 1 || this.locks.some((lk, i) => i < this.length && this.played(i) && lk?.prob != null && lk.prob < 1) || TIMBRE_KEYS.some(k => this.tdice?.[k] > 0);
    if (this.mod?.depth > 0 && this.mod.loops > 0) n = lcm(n, this.mod.loops);   // V5: the modulator's period, in loops
    return repeat > 1 && rolls ? lcm(n, repeat) : n;   // dice repeat counts loops too: 1:2 with repeat 2 is still 2
  }
  /** V1: is the lane exactly its euclid fill (no hand edits on the steps it loops over)? */
  isEuclid() { if (!this.euclidK) return false; const e = this.mask(); return e.every((h, i) => h === this.hits[i]); }
  /** Move stored step i's accent, locks and condition to stored step j (V1: they travel with their hit). */
  moveStepData(i, j) { for (const k of STEP_DATA) { this[k][j] = this[k][i]; this[k][i] = k === 'accents' ? false : null; } }
  /**
   * V1: a new euclid fill that keeps each hit's accent, locks and condition: an old hit the new fill drops hands its data
   * to the nearest new hit (round the loop) that has none of its own. With none free the data waits on its step, as a
   * hand toggle leaves it, and plays again when a hit comes back there; nothing is ever deleted.
   */
  refill(k) {
    const was = this.hits.slice(); this.setEuclid(k); const n = this.length, has = (j) => STEP_DATA.some(x => this[x][j]);
    for (let i = 0; i < n; i++) {
      if (!was[i] || this.hits[i] || !has(i)) continue;
      let to = -1; for (let d = 1; d < n && to < 0; d++) for (const j of [(i + d) % n, (i - d + n) % n]) if (to < 0 && this.hits[j] && !has(j)) to = j;
      if (to >= 0) this.moveStepData(i, to);
    }
    return this.euclidK;
  }
  /**
   * V1: evolve's 'hits' move. A pure euclid lane steps its fill (k ± 1, refill: the classic move, data kept with the
   * hits); a hand-edited euclid lane keeps your edits and adds (dir +1) a hit where the k + 1 fill has one, or takes away
   * (−1) a hit the k − 1 fill doesn't have; a hand lane toggles one random step, as evolve always did. Never the last hit.
   * A step whose hit goes keeps its accent, locks and condition (as a hand toggle does): they come back with the hit.
   */
  evolveHits(dir, rng) {
    const n = this.length, count = this.hits.slice(0, n).filter(Boolean).length;
    if (this.euclidMode !== 'replace') { this.setEuclid(clamp(this.euclidK + dir, 1, n)); return dir; }   // V3 mask mode: the mask moves, your hits stay
    if (this.isEuclid()) { this.refill(clamp(this.euclidK + dir, 1, n)); return dir; }
    if (this.euclidK) {
      const k = clamp(this.euclidK + dir, 1, n), e = euclid(k, n), idx = [...Array(n).keys()];
      if (dir < 0 && count <= 1) return 0;
      let c = idx.filter(i => (dir > 0 ? e[i] && !this.hits[i] : !e[i] && this.hits[i])); if (!c.length) c = idx.filter(i => (dir > 0 ? !this.hits[i] : this.hits[i]));
      if (!c.length) return 0; const i = c[Math.floor(rng() * c.length)]; this.hits[i] = dir > 0; this.euclidK = k; return dir;
    }
    const i = Math.floor(rng() * n); if (this.hits[i] && count <= 1) return 0;
    this.hits[i] = !this.hits[i]; return this.hits[i] ? 1 : -1;
  }
  /** V1: one random evolve move of `kind` in direction dir (±1). */
  mutate(kind, dir, rng) {
    if (kind === 'rotate') this.rotation = ((this.rotation + dir) % this.length + this.length) % this.length;
    if (kind === 'hits') this.evolveHits(dir, rng);
    // evolve keeps its old reach (2–16 steps): a 16-step lane never drifts to 17; a longer lane (L1) can only shrink back.
    // A pure euclid lane refills at the new length (as before); a hand-edited one keeps its hits
    if (kind === 'length') { const pure = this.isEuclid(); this.setLength(clamp(this.length + dir, 2, Math.max(16, this.length))); if (pure) this.refill(Math.min(this.euclidK, this.length)); this.rotation %= this.length; }
    if (kind === 'ratio') this.setRatio(ratioIndexOf(evolveRatio(this.ratio, dir)));
    if (kind === 'prob') this.prob = Math.round(clamp(this.prob + dir * 0.1, Math.min(0.3, this.prob), 1) * 100) / 100;
    if (kind === 'tune') this.tune = clamp(Math.round(this.tune * 12 + dir) / 12, -1, 1);   // a semitone (on a voice tuned ±12)
  }
  /** Stored steps where this lane differs from lane `h` (its home): the hit, or the step's data (also data waiting on a
   *  step without its hit: it would come back with a hit, so home has its own there too). */
  diffSteps(h) { const out = []; for (let i = 0; i < MAX_STEPS; i++) if (this.hits[i] !== h.hits[i] || STEP_DATA.some(k => JSON.stringify(this[k][i]) !== JSON.stringify(h[k][i]))) out.push(i); return out; }
  /** V1 gravity: does `kind` still differ from home lane h? Rotation waits for the length when home's doesn't fit yet. */
  awayFrom(h, kind) {
    if (kind === 'rotate') return this.rotation !== h.rotation && (this.length === h.length || h.rotation < this.length);
    if (kind === 'hits') return this.euclidK !== h.euclidK || this.diffSteps(h).length > 0;
    if (kind === 'length') return this.length !== h.length;
    if (kind === 'ratio') return this.ratioIndex !== h.ratioIndex;
    return Math.abs(this[kind] - h[kind]) > 1e-9;   // prob, tune
  }
  /** V1 gravity: one move of `kind` toward home lane h (the same size as a random one). Returns its direction. */
  homeStep(h, kind, rng) {
    const toward = (v, to, by) => (Math.abs(to - v) <= by + 1e-9 ? to : v + Math.sign(to - v) * by);
    if (kind === 'rotate') { const n = this.length, d = (((h.rotation - this.rotation) % n) + n) % n, dir = d <= n / 2 ? 1 : -1; this.rotation = (this.rotation + dir + n) % n; return dir; }
    if (kind === 'length') { const dir = Math.sign(h.length - this.length); this.setLength(this.length + dir); this.rotation %= this.length; return dir; }
    if (kind === 'ratio') { const r = ratioToward(this.ratio, h.ratio); this.setRatio(ratioIndexOf(r)); return Math.sign(r - this.ratio) || 1; }
    if (kind === 'prob' || kind === 'tune') { const was = this[kind]; this[kind] = toward(was, h[kind], kind === 'prob' ? 0.1 : 1 / 12); return Math.sign(this[kind] - was); }
    // hits: one differing step becomes home's (its hit, accent, locks and condition); once they all match, home's fill count
    const d = this.diffSteps(h); if (!d.length) { this.euclidK = h.euclidK; return 0; }
    const i = d[Math.floor(rng() * d.length)], dir = h.hits[i] ? 1 : -1; this.hits[i] = h.hits[i];
    for (const k of STEP_DATA) this[k][i] = k === 'accents' ? h.accents[i] : h[k][i] ? JSON.parse(JSON.stringify(h[k][i])) : null;
    if (d.length === 1) this.euclidK = h.euclidK; return dir;
  }
  /** Put back what evolve may change, from a toJSON copy (the max cycle guard refusing a move). */
  restore(o) { const b = Lane.from(o); for (const k of EVOLVE_FIELDS) this[k] = b[k]; if (this.pos >= this.length) this.pos = 0; }
  toJSON() { const { name, length, ratioIndex, hits, accents, rotation, swing, swingTpl, offsetMs, velHuman, prob, tune, muted, euclidK, sound, voice, locks, evolve, trigs, solo, choke, sample } = this; return { name, length, ratioIndex, ratio: RATIOS[ratioIndex], hits, accents, rotation, swing, swingTpl, offsetMs, velHuman, prob, tune, muted, euclidK, sound, voice, locks, evolve, trigs, solo, choke, sample: sample || null, ...this.genJSON() }; }
  /** V3 / V5 settings, saved only when set (an older lane saves as it always did). */
  genJSON() { const o = {}; if (this.euclidMode !== 'replace') o.euclidMode = this.euclidMode; if (this.mod) o.mod = this.mod; if (this.tdice) o.tdice = this.tdice; if (this.scale !== 'off') o.scale = this.scale; return o; }
  // copies everything it is given, so a lane loaded from a slot (or undo) never edits the stored one
  static from(o) { const l = new Lane(o.name, { length: o.length, ratioIndex: ratioFrom(o) }); Object.assign(l, { hits: Array.from({ length: MAX_STEPS }, (_, i) => !!o.hits?.[i]), accents: Array.from({ length: MAX_STEPS }, (_, i) => !!o.accents?.[i]), rotation: o.rotation, swing: o.swing, prob: o.prob, tune: o.tune, muted: o.muted, euclidK: o.euclidK }); l.sound = { ...DEFAULT_SOUND, ...(o.sound || {}) }; l.voice = o.voice || o.name; l.locks = Array.from({ length: MAX_STEPS }, (_, i) => lockFrom(o.locks?.[i])); l.evolve = o.evolve ?? true; l.trigs = Array.from({ length: MAX_STEPS }, (_, i) => (o.trigs?.[i] ? { ...o.trigs[i] } : null)); l.solo = !!o.solo; l.choke = Number.isInteger(o.choke) ? o.choke : -1; l.sample = sampleFrom(o.sample); l.setSwingTpl(o.swingTpl); l.setOffset(o.offsetMs); l.velHuman = clamp(+o.velHuman || 0, 0, 1); l.setEuclidMode(o.euclidMode); l.setMod(o.mod); l.setTimbreDice(o.tdice); l.setScale(o.scale); for (const t of l.trigs) if (t) { t.ratchet = clamp(Math.round(+t.ratchet || 1), 1, MAX_RATCHET); if (t.ramp != null) t.ramp = clamp(+t.ramp || 0, -1, 1); } return l; }   // older saves: no template (MPC), no offset
}

export class Machine {
  // a new machine plays the Common kit: lane names are ids, not voices ('perc' is not a voice)
  constructor(n = 4) { this.lanes = Array.from({ length: laneCountOf(n) }, (_, i) => freshLane(i)); this.selected = 0; this.humanize = 0; this.meter = '4/4'; this.origin = 0; this.couple = coupleFrom(null); this.boost = []; this.applyKit(KITS.common, DEFAULT_SOUND); }
  /** V2: how much a hit on lane a lifts lane b's next step (0..1). */
  coupleAmount(a, b) { const c = this.couple, n = this.lanes.length; return c.mode === 'next' ? (b === (a + 1) % n && a !== b ? c.amount : 0) : c.mode === 'matrix' ? c.matrix[a]?.[b] || 0 : 0; }
  /** V2, runtime (not saved): the lift waiting for lane li's next step. */
  boostOf(li) { return this.couple.mode === 'off' ? 0 : this.boost[li] || 0; }
  /** V2 after one master tick: the lanes in `used` used up their lift (Machine.tick: every lane that stepped), then each
   *  lane that sounded (`hit[li]`) lifts the lanes it is coupled to. A lane stepping on the same tick as the hit gets it
   *  on its following step, so the lane order never matters. Live play (export.js liveTick) passes the hits it plays. */
  coupleAfter(hit, used) {
    const b = this.boost, n = this.lanes.length; used.forEach((u, li) => { if (u) b[li] = 0; });
    hit.forEach((h, a) => { if (h) for (let k = 0; k < n; k++) { const x = this.coupleAmount(a, k); if (x) b[k] = Math.min(1, (b[k] || 0) + x); } });
  }
  /** V2: lane li's waiting lift, used up now (a step decided before its tick takes the lift it has then). */
  takeBoost(li) { const x = this.boostOf(li); if (x) this.boost[li] = 0; return x; }
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
  resetAll() { for (const l of this.lanes) l.reset(); this.boost = []; }
  /** Master ticks until every lane lines up again: in whole ticks (a ×5/4 loop is not a whole number of 12ths of a beat). */
  cycleTicks({ repeat = 1 } = {}) { return Math.max(1, this.lanes.reduce((acc, l) => lcm(acc, l.length * l.stepTicks() * l.loopsPerCycle({ repeat, humanize: this.humanize })), 1)); }
  /** Every lane's event at master tick `tick` (null where a lane doesn't step), its steps counted from `origin`. */
  /** ctx: { fill, dice, cycle, couple } — solo silences every lane that isn't soloed. couple: false leaves V2's lift
   *  bookkeeping to the caller (liveTick, which knows the steps decided early and what really sounded). */
  tick(tick, rng = Math.random, ctx = {}) {
    const solo = this.lanes.some(l => l.solo), r = tick - this.origin, cp = this.couple.mode !== 'off';
    // V5: a modulator over the whole cycle needs its length (the clock passes the one it has; else worked out here)
    const cycle = ctx.cycle ?? (this.lanes.some(l => l.mod?.depth > 0 && !(l.mod.loops > 0)) && this.steps(tick) ? this.cycleTicks() : 0);
    const evs = this.lanes.map((l, li) => r < 0 || r % l.stepTicks() ? null : l.at(tick, rng, { ...ctx, li, silenced: solo && !l.solo, origin: this.origin, boost: cp ? this.boost[li] || 0 : 0, cycle }));   // most ticks step no lane: nothing allocated
    if (cp && ctx.couple !== false && evs.some(Boolean)) this.coupleAfter(evs.map(e => !!e?.hit), evs.map(Boolean)); return evs;
  }
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
    this.lanes = n.lanes; this.selected = clamp(selected ?? n.selected, 0, n.lanes.length - 1); this.humanize = n.humanize; this.kit = n.kit; this.meter = n.meter; this.couple = n.couple; if (!keep) this.boost = []; return this;
  }
  /**
   * Evolve: nudge some lanes a little. scope 'rotate' = rotation only, 'hits' = + the fill, 'all' = + length, speed,
   * chance and tune. amount 0..1 = chance per lane. Lanes with evolve=false or muted are left alone. Returns what changed.
   * V1: weights = how likely each kind is (EVOLVE_WEIGHTS; 0 = never); gravity 0..1 = the chance a nudged lane takes a
   * step back toward its lane in `home` (a Machine JSON) instead of a random one, so a pattern wanders and comes back
   * without a hard reset (gravity 1: every nudge goes home; once home, the lane holds still); maxBars = the longest cycle
   * a move may make (bars of this meter; 0 = no limit): a move that goes past it (or past the cycle the pattern already
   * had, if that was longer) is put back. A step home never is: home is a pattern you made, and the way back to it can
   * pass a longer cycle for a while (7/7/7/7 → 8/8/8/8 goes through 8/7/7/7), so a guard on it could keep it away for
   * good. repeat: the locked dice repeat (the cycle counts it, as cycleTicks does).
   */
  evolve({ scope = 'hits', amount = 0.4, weights = EVOLVE_WEIGHTS, gravity = 0, home = null, maxBars = 0, repeat = 1 } = {}, rng = Math.random) {
    const changes = [], w = (k) => weights[k] ?? EVOLVE_WEIGHTS[k], kinds = (SCOPE_KINDS[scope] || SCOPE_KINDS.hits).filter(k => w(k) > 0);
    const homes = gravity > 0 && home?.lanes ? home.lanes.map(o => Lane.from(o)) : [], limit = maxBars > 0 ? maxBars * this.barTicks() : Infinity;
    this.lanes.forEach((l, li) => {
      if (!l.evolve || l.muted || rng() >= amount || !kinds.length) return;
      // the gravity roll only when there is gravity: a pattern evolved without it rolls what it always did
      const h = homes[li], pull = !!h && rng() < gravity; let kind, dir;
      if (pull) { const away = kinds.filter(k => l.awayFrom(h, k)); if (!away.length) return; kind = pickWeighted(away, w, rng()); }
      else { kind = pickWeighted(kinds, w, rng()); dir = rng() < 0.5 ? -1 : 1; }
      const before = limit < Infinity && !pull ? JSON.parse(JSON.stringify(l)) : null, cyc0 = before ? this.cycleTicks({ repeat }) : 0;
      if (pull) dir = l.homeStep(h, kind, rng); else l.mutate(kind, dir, rng);
      if (before && this.cycleTicks({ repeat }) > Math.max(limit, cyc0)) { l.restore(before); changes.push({ lane: li, kind, dir, held: true }); return; }
      changes.push({ lane: li, kind, dir, ...(pull ? { home: true } : {}) });
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
  /** A copy of the pattern that shares nothing with the lanes (toJSON hands out their step arrays): evolve's home, which
   *  must not move with evolve's own edits, or gravity could never bring a hit or its data back. */
  snapshot() { return structuredClone(this.toJSON()); }
  toJSON() { return { lanes: this.lanes.map(l => l.toJSON()), selected: this.selected, humanize: this.humanize, kit: this.kit, meter: this.meter, ...(this.couple.mode !== 'off' || this.couple.matrix.some(r => r.some(Boolean)) || this.couple.amount !== 0.5 ? { couple: this.couple } : {}) }; }
  static from(o) {
    // L2: the data keeps its lane count (4, or 6); a link edited to some other count is cut, or filled up with the lanes
    // of the kit it plays (as setLaneCount would add them)
    const m = new Machine(o?.lanes?.length); if (o?.lanes) { const n = m.lanes.length; m.lanes = o.lanes.slice(0, n).map(Lane.from); m.kit = o.kit; if (m.lanes.length < n) { const kit = KITS[m.kitKey()] || KITS.common; while (m.lanes.length < n) m.lanes.push(kitLane(m.lanes.length, kit)); } }
    m.selected = Math.max(0, Math.min(m.lanes.length - 1, o?.selected | 0)); m.humanize = o?.humanize ?? 0; m.setMeter(o?.meter); m.couple = coupleFrom(o?.couple);   // V2: older saves are uncoupled
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
