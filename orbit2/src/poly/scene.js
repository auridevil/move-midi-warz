// Orbits visuals: a small solar system per pattern. Canvas 2D only, additive glow from pre-rendered
// sprites (no shadowBlur), so it stays cheap. Capped at 60 fps, and it stops drawing once stopped and settled. The app feeds it step events; the scene animates
// everything else (comet playheads, shockwaves, particles, beams, the core, the cycle bloom).

import { frameLoop } from '../frames.js';
import { MAX_LANES, MAX_STEPS, condParts, condPasses } from './lanes.js';

const TAU = Math.PI * 2;
const MUTED = '#8b84a8';
const CAPTION_FONT = '13px "Space Grotesk", system-ui, sans-serif';   // RD-2: Major Mono is the wordmark's alone; 13 px = the body size
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

/**
 * "aligns in N bars" for master tick `tick` (fractional: the tick being heard) of a `cycle`-tick machine; the last two
 * bars count in beats, so "2 bars" never stands for 5 beats. '' when the whole cycle fits in one bar (it aligns every
 * bar: nothing to wait for). bar / beat in ticks.
 */
export function alignText(tick, cycle, bar = 96, beat = 24) {
  if (!(cycle > bar)) return ''; const left = cycle - (((tick % cycle) + cycle) % cycle);
  const [n, unit] = left > 2 * bar ? [Math.ceil(left / bar), 'bar'] : [Math.ceil(left / beat), 'beat'];
  return `aligns in ${n} ${unit}${n > 1 ? 's' : ''}`;
}

/** V6: how long the ring of a missed step (it came round and stayed silent: the ghost flash) shows (ms). */
export const MISS_MS = 450;
/** V6: a planet's opacity for a chance of playing `p` (0..1): 100 % is solid, 0 % still a faint dot you can find. */
export const planetAlpha = (p) => 0.2 + 0.8 * Math.max(0, Math.min(1, +p || 0));
/** V6: the arcs round an a:b step, one per loop of b from 12 o'clock, or null for any other condition. plays: the loop
 *  it plays on (condPasses' own rule); here: the loop the lane is on now (`loop` of its latest step, null when stopped). */
export function condArcs(cond, loop) {
  const ab = condParts(cond); if (!ab) return null;
  return Array.from({ length: ab.b }, (_, k) => ({ plays: condPasses(cond, k), here: loop != null && loop % ab.b === k }));
}
/** V6: where master tick `tick` is inside a `cycle`-tick machine, 0..1 (the outer cycle arc). */
export const cyclePos = (tick, cycle) => (cycle > 0 ? (((tick % cycle) + cycle) % cycle) / cycle : 0);

// ---- I1 playing on the canvas: pure geometry, so the gestures can be tested without a page ----
/** I1: the angle of (dx, dy) from the centre as the rings count it: 0 at 12 o'clock, growing clockwise, 0..2π. */
export const ringAngle = (dx, dy) => { const a = Math.atan2(dy, dx) + Math.PI / 2; return ((a % TAU) + TAU) % TAU; };
/** I1: the visible step of a `len`-step ring whose mark is nearest to the point (dx, dy) from the centre (the one the
 *  finger is on). A mark is the step's tick, or, for a planet with a nudge (`nudge(i)`: G1, a fraction of a step), the
 *  place the planet is drawn, so a nudged planet is played where you see it. */
export function stepAtAngle(dx, dy, len, nudge = null) {
  const p = (ringAngle(dx, dy) / TAU) * len; if (!nudge) return Math.round(p) % len;
  let best = 0, gap = Infinity;
  for (let i = 0; i < len; i++) { const d = (((p - i - nudge(i)) % len) + len) % len, e = Math.min(d, len - d); if (e < gap) { gap = e; best = i; } }
  return best;
}
/** I1 / G1: how far off its tick lane step i's planet is drawn (its nudge lock, in steps); 0 for an empty step. */
export const planetNudge = (lane, i) => (lane.hitAt(i) && lane.lockAt(i)?.nudge) || 0;
/** I1: the ring at `d` px from the centre of geometry g (ringGeo): its lane, or -1 beyond half a gap from every ring. */
export function laneAtRadius(g, d) {   // | 0: just inside ring 0 rounds to −0
  const li = Math.round((d / g.R - 0.25) / g.gap) | 0; return li >= 0 && li < g.lanes && Math.abs(d - g.ring(li)) <= (g.gap * g.R) / 2 ? li : -1;
}
/** I1: the shortest signed turn from angle a0 to a1 (radians, −π..π), so a drag across 12 o'clock doesn't jump a turn. */
export const angleDelta = (a0, a1) => { const d = (((a1 - a0) % TAU) + TAU) % TAU; return d > Math.PI ? d - TAU : d; };
/** I1: the rotation after turning a `len`-step ring by `turn` radians (clockwise > 0) from rotation rot0: whole steps. */
export const turnRotation = (rot0, turn, len) => ((((rot0 + Math.round((turn / TAU) * len)) % len) + len) % len);
/** I1: how far a move of (mx, my) px goes outward (inward < 0) along the line from the centre through (dx, dy), where
 *  the drag started: a pull that crosses the centre keeps shortening the ring instead of growing it again. */
export const outward = (dx, dy, mx, my) => (mx * dx + my * dy) / (Math.hypot(dx, dy) || 1);
/** I1: the length after pulling a ring `dr` px outward (in < 0), a step every `stepPx`; 1..max. */
export const pullLength = (len0, dr, stepPx, max = MAX_STEPS) => Math.max(1, Math.min(max, len0 + Math.round(dr / Math.max(1, stepPx))));
/** I1: the length after a pinch that scaled the fingers' distance by `s` (2 = twice as far apart); 1..max. */
export const pinchLength = (len0, s, max = MAX_STEPS) => Math.max(1, Math.min(max, Math.round(len0 * (s > 0 ? s : 1))));
/** I1: which way a drag of (mx, my) px that started at (dx, dy) from the centre goes: 'turn' along the ring, 'pull'
 *  across it (toward or away from the centre). */
export const dragKind = (dx, dy, mx, my) => { const along = Math.abs((my * dx - mx * dy) / (Math.hypot(dx, dy) || 1)); return Math.abs(outward(dx, dy, mx, my)) > along ? 'pull' : 'turn'; };

/**
 * Where the rings go on a W × H canvas: centre, R, ring(li) = radius of lane li (the outer one is 0.85 R). On phones the
 * canvas is a square stage under the header (CSS), not the viewport: centre the system and use more of it. A stage set
 * by the app ({ x, y, w, h }: the free box between the panels on a wide window) wins: the outer ring and its glow fit
 * inside it with a margin (0.1 R), so no panel covers them.
 */
export function ringGeo(W, H, stage = null, lanes = 4) {
  // L2: the rings always span 0.25–0.85 R; 6 lanes sit closer (0.12 R apart instead of 0.2), so the system keeps its size
  const gap = 0.6 / Math.max(1, lanes - 1), ring = (R) => (li) => R * (0.25 + li * gap), out = (o) => ({ ...o, gap, lanes, ring: ring(o.R), outer: ring(o.R)(lanes - 1) });
  if (stage) { const R = Math.min(stage.w, stage.h) / 2 / 0.95; return out({ cx: stage.x + stage.w / 2, cy: stage.y + stage.h / 2, R }); }
  const narrow = W < 700, R = Math.min(W, H) * (narrow ? 0.44 : 0.42); return out({ cx: W * 0.5, cy: H * (narrow ? 0.5 : 0.56), R });
}

/**
 * RD-3 the rings' box from the stage cell alone (client px { x, y, w, h }, the grid's middle cell above the console) and
 * the window width: nothing that opens, closes or wraps around the cell can move them (DECISION A7). The outer ring is
 * D across: 12 % of a tall stage stays free (Greta: 630 px in the 716 px stage at 1512×860), never less than 630 when
 * the cell has room, always 38 px clear of the columns and 12 px of the console and the top (568 px at 1280×720).
 * Centred on the window when that ring fits there 12 px clear of both columns (x 756 at 1512×860), else in the cell
 * (x 578 at 1280×720). Returns the square box ringGeo() sizes the rings by (outer ring = 0.85 R, R = side / 2 / 0.95).
 */
export function ringBox(cell, winW, min = 120) {
  const D = Math.round(Math.max(min, Math.min(cell.w - 76, cell.h - 24, Math.max(630, 0.88 * cell.h))));
  const mid = winW / 2, cx = mid - D / 2 - 12 >= cell.x && mid + D / 2 + 12 <= cell.x + cell.w ? mid : cell.x + cell.w / 2;
  const side = D * 0.95 / 0.85;
  return { x: cx - side / 2, y: cell.y + cell.h / 2 - side / 2, w: side, h: side };
}

// ---- RD-6 the ring answers the hand (Rio's idea, merged with Yuki's touched knob on the ring): while a knob is touched
// or dragged, and HAND_MS after, the selected ring shows what the change did. Read-only light: nothing here is clickable,
// and the hit test (locate) keeps the steps where they are. Pure helpers, so the rules are tested without a canvas ----
export const HAND_MS = 400, SLIDE_MS = 160, SPREAD_MS = 320, GROW_MS = 520;
/** What a knob's key makes the ring show: slide (shift), spread (hits), swing (the off-beat ticks), chance (an arc round
 *  each planet as long as its chance; the planet itself is already as solid as its chance, V6 planetAlpha), push (the
 *  ring leads or lags), grow (a longer loop's new ticks pulse); null: nothing. */
export const HAND_LOOK = { rotation: 'slide', euclid: 'spread', swing: 'swing', prob: 'chance', 'lock:prob': 'chance', offset: 'push', length: 'grow' };
export const handLook = (k) => HAND_LOOK[k] ?? null;
/** The shortest way round a `len`-step ring from rotation a to b, in steps (signed: + = clockwise). */
export const shortSteps = (a, b, len) => { const d = ((((b - a) % len) + len) % len); return d > len / 2 ? d - len : d; };
/** How far (steps) a push (− ms = early, + ms = late) moves a ring whose steps last `stepMs`: + = it lags (clockwise). */
export const pushSteps = (offsetMs, stepMs) => (stepMs > 0 ? offsetMs / stepMs : 0);
/** The steps a length change from `a` to `b` adds (they pulse once); none when it got shorter. */
export const newTicks = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);
// ---- RD-7 quest "show me" (Rio): the gesture drawn once as a ghost hand on lane li's ring. Read-only light, like the
// answers above: drawn, never hit-tested; the app hides it on any key or press ----
export const GHOST_MS = 2200;
/** Where the ghost hand is at p (0..1) of its gesture on geometry g (ringGeo): a pull goes out from the ring at two
 *  o'clock by 0.18 R (a longer loop), a turn goes along the ring a quarter-ish clockwise (a shift). It waits at the start
 *  (to 0.15), moves (to 0.8), then rests where it ended. */
export function ghostAt(g, kind, li, p) {
  const t = easeOut((Math.min(1, Math.max(0, p)) - 0.15) / 0.65), a0 = -Math.PI / 2 + Math.PI / 3, r0 = g.ring(li);
  const a = kind === 'turn' ? a0 + 0.9 * t : a0, r = kind === 'pull' ? r0 + 0.18 * g.R * t : r0;
  return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r };
}
/** Ease out (cubic): a slide starts fast and settles. */
const easeOut = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;

// ---- RD-8 light on the canvas (Yuki's light without the control surface; DECISION §2 "Read-only light on the canvas"):
// the sun numeral, the cycle caption in straight type, the generative arc with its crawling countdown, the slot moons,
// ONE arc label on the selected lane, "press play" on a first visit and the fill flare. Pure first: the words, the
// countdown and Yuki's ladder are tested without a canvas. Nothing here is hit-tested (locate is untouched) ----
const FAMILY = '"Space Grotesk", system-ui, sans-serif';
/** Type on the canvas: 13 px caps weight 500 for a word on a curve (Yuki's floor), 15 px for a number read in a glance,
 *  40 px weight 300 for the sun (300 only at 40 px and up), 11 px for the sun's own caption; tracking .14 em on caps. */
export const LABEL_PX = 13, NUMBER_PX = 15, SUN_PX = 40, SUN_SMALL_PX = 28, CAPS_PX = 11, TRACK = 0.14;
export const LABEL_FONT = `500 ${LABEL_PX}px ${FAMILY}`, NUMBER_FONT = `500 ${NUMBER_PX}px ${FAMILY}`, SUN_FONT = `300 ${SUN_PX}px ${FAMILY}`, SUN_SMALL_FONT = `400 ${SUN_SMALL_PX}px ${FAMILY}`, CAPS_FONT = `500 ${CAPS_PX}px ${FAMILY}`;
/** Type on a curve sits only where the curve runs within ±35° of horizontal: the bottom of a ring (the label) or the top
 *  (the generative arc); the moons spread ±30° round 6 o'clock (Yuki's mock ±31.5°; ±42° ran their right end into the
 *  straight caption's corner at 1512×860); the crawl's track is ±45° round 12. Degrees. */
export const LABEL_DEG = 70, GEN_DEG = 90, MOON_DEG = 60;
/** Px free outside the outer ring (to the stage's edge) before anything with words fits there: the arc's words and the
 *  moons' numbers need it (1512×860 has 43, 1280×720 has 12: there the crawl and the moons hug the ring, the words go to
 *  the straight caption). */
export const LIGHT_ROOM = 40;
/** "press play" in the sun on a visit that has never played: this long, then the numeral. */
export const HINT_MS = 7000;
/** The sun: beats until everything lines up again (the heard tick, fractional), 1 on the last beat. */
export const beatsLeft = (tick, cycle, beat) => Math.max(1, Math.ceil((cycle - (((tick % cycle) + cycle) % cycle)) / beat));
/** The sun, stopped: the cycle's length in beats (everything meets in N beats). */
export const cycleBeats = (cycle, beat) => Math.max(1, Math.ceil(cycle / beat));
/**
 * The cycle caption (straight type, never on a curve): where you are in the full cycle, in bars; stopped, how long it is.
 * A cycle that is not whole bars is said in beats (and only once: the sun counts them down).
 */
export function cycleLine(tick, cycle, bar, beat, playing) {
  if (!(cycle > 0)) return '';
  if (cycle % bar) { const n = cycleBeats(cycle, beat); return `cycle · ${n} beat${n === 1 ? '' : 's'}`; }
  const n = cycle / bar; if (!playing) return `cycle · ${n === 1 ? 'one bar' : `${n} bars`}`;
  return n === 1 ? 'cycle · every bar' : `cycle · bar ${Math.min(n, Math.floor((((tick % cycle) + cycle) % cycle) / bar) + 1)} of ${n}`;
}
/**
 * How far the generative clock is toward the next mutation, 0..1: bars = bar lines since Play, every = bars between
 * mutations, frac = how far into the bar the heard tick is (a little negative just after the line: the scheduler counts
 * the line before the ear reaches it, and the crawl must not jump). Continuous; `beats` > 0 (reduced motion) steps it
 * once per beat of the bar.
 */
export function genProgress(bars, every, frac, beats = 0) {
  const e = Math.max(1, every | 0), f = beats > 0 ? Math.floor(Math.max(0, frac) * beats) / beats : frac;
  return (((((bars % e) + f) % e) + e) % e) / e;
}
/** Bars until the next mutation (the straight caption's "evolve in N bars"): `every` on the line it just came. */
export const barsToEvolve = (bars, every) => { const e = Math.max(1, every | 0); return e - (((bars % e) + e) % e); };
/**
 * The generative arc's words (caps on the curve, names only: a number you read is in the straight caption): what is on,
 * in a fixed order. detail (Yuki's rung 4) says the coupling's shape and the gravity; without it "coupling 1 → 2" is
 * "coupling" and gravity goes. s = { evolve, dice, coupling: 'off' | 'next' | 'matrix', gravity }. '' = nothing on.
 * The longest ("EVOLVE · DICE · COUPLING MATRIX · GRAVITY") fits the ±35° band over 630 px rings.
 */
export function genWords(s, detail = true) {
  const w = [];
  if (s.evolve) w.push('EVOLVE');
  if (s.dice) w.push('DICE');
  if (s.coupling && s.coupling !== 'off') w.push(detail ? (s.coupling === 'next' ? 'COUPLING NEXT' : 'COUPLING MATRIX') : 'COUPLING');
  if (detail && s.evolve && s.gravity > 0) w.push('GRAVITY');
  return w.join(' · ');
}
/** A ring with more steps than this is a full strip (planets 11° apart): its label is the name-plate alone, as in Yuki's
 *  6-lane mock, where both 32-step lanes read "CONGA 32 × 4" and the console shows the rest. */
export const EXTRAS_MAX_STEPS = 16;
/** The one arc label (the selected lane): "CONGA 32 × 4", plus its extras (hits, chance, push) while they fit (rung 2)
 *  and the ring is not a full strip. */
export function laneLabel(l, extras = true) {
  const base = `${l.name} ${l.len} × ${l.ratio}`.toUpperCase(); if (!extras || l.len > EXTRAS_MAX_STEPS) return base;
  const x = [`${l.hits} HIT${l.hits === 1 ? '' : 'S'}`];
  if (l.chance < 1) x.push(`${Math.round(l.chance * 100)} %`);
  if (l.push) x.push(`${l.push < 0 ? '−' : '+'}${Math.abs(Math.round(l.push))} MS`);
  return [base, ...x].join(' · ');
}
/** Px along a curve of radius r within `deg` degrees (the ±35° band = 70). */
export const arcRoom = (r, deg = LABEL_DEG) => (r * deg * Math.PI) / 180;
/** The label sits in the middle of the gap outside the selected ring (as far from both rings' planets as it can be, at
 *  most 37 px out), or inside it for the outer lane (outside is the moons' and the arcs' room): a signed offset from the
 *  ring, px. gap = the px between two rings (ringGeo: gap × R; 74 with 4 lanes at 1512×860, 44 with 6). */
export const labelOffset = (li, lanes, gap = 44) => { const d = Math.min(37, Math.round(gap / 2)); return li >= lanes - 1 ? -d : d; };
/**
 * Yuki's ladder (`proposals/yuki/answers.md` §1; DECISION "Arc labels"): what goes when space runs out, in this order
 * and no other: 1 the unselected lanes' labels (never drawn: the decision keeps one), 2 the selected label's extras,
 * 3 the slot numbers (the playing and the queued slot keep theirs), 4 the generative arc's detail, 5 the cycle caption
 * off the curve (always straight here). The lowest rung that does not fit takes every rung above it with it, so the
 * canvas never shows a lower rung without the ones above. room (px) = { label: { arc, full }, slots: { gap, num, room },
 * gen: { arc, full, room } }: arc = the px the curve offers to type, full = the px the full words take, gap = the moons'
 * spacing and num = the widest number, room = px free outside the outer ring (LIGHT_ROOM for anything with words).
 * Returns 1..4 (1 = everything but the unselected labels).
 */
export function lightLevel(room) {
  const gone = [room.label.full > room.label.arc, room.slots.gap < room.slots.num + 4 || room.slots.room < LIGHT_ROOM, room.gen.full > room.gen.arc || room.gen.room < LIGHT_ROOM];
  const i = gone.lastIndexOf(true); return i < 0 ? 1 : i + 2;
}
/** What the level draws: the label's extras, which moons carry a number ('all' | 'some' = the playing and the queued |
 *  'none' = no room outside the ring: the playing slot goes to the straight caption), the arc's detail. */
export const lightPlan = (level, slotRoom = Infinity) => ({ extras: level < 2, slotNumbers: level < 3 ? 'all' : slotRoom >= LIGHT_ROOM ? 'some' : 'none', genDetail: level < 4 });
/** Where moon k of n sits: the angle (rings' convention, 0 at 12 o'clock, clockwise) along ±MOON_DEG/2 round 6 o'clock,
 *  slot 1 at the left. */
export const moonAngle = (k, n = 16, deg = MOON_DEG) => Math.PI + ((deg / 2 - (k * deg) / Math.max(1, n - 1)) * Math.PI) / 180;
/** The straight caption's lines (13 px, bottom right of the stage, numbers live here): the cycle, the generative facts,
 *  the playing slot when the moons carry no number, the take. s = { cycle: cycleLine's text, evolve: { bars } | null,
 *  dice: { seed, repeat } | null, slot: 1-based | null, jam: { beat, of } | null }. */
export function captionLines(s) {
  const out = [];
  if (s.cycle) out.push(s.cycle);
  if (s.evolve) out.push(`evolve in ${s.evolve.bars} bar${s.evolve.bars === 1 ? '' : 's'}`);
  if (s.dice) out.push(`dice ${s.dice.seed}${s.dice.repeat > 1 ? ` · repeat ${s.dice.repeat}` : ''}`);
  if (s.slot) out.push(`slot ${s.slot} playing`);
  if (s.jam) out.push(`jam · beat ${s.jam.beat} of ${s.jam.of}`);
  return out;
}
/**
 * How many of the caption's lines (from the first) the stage takes: the block is right-aligned at `right`, 17 px lines,
 * the last baseline 4 px over `bottom`. Each line's glyphs (its width × 13 px) stay `ring` px from the rings' centre and
 * `pad` px clear of every box the light drew there (the moons and their numbers), so nothing ever overlaps; lines go from
 * the end (a phone's square canvas). Pure. widths: px per line.
 */
export function captionFit(widths, { right, bottom, cx, cy, ring, boxes = [], LH = 17, pad = 5 }) {
  const near = (b) => Math.hypot(Math.max(b.x - cx, 0, cx - b.x - b.w), Math.max(b.y - cy, 0, cy - b.y - b.h));
  const hit = (a, b) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  for (let n = widths.length; n > 0; n--) if (captionBoxes(widths.slice(0, n), right, bottom, LH).every(b => near(b) >= ring && !boxes.some(o => hit(b, o)))) return n;
  return 0;
}
/** The glyph boxes of caption lines of these widths, as drawn (captionFit; the frame draws the baselines there). */
export const captionBoxes = (widths, right, bottom, LH = 17) => widths.map((w, k) => ({ x: right - w, y: bottom - (widths.length - k) * LH + 3, w, h: 13 }));

/** Soft round glow, white-hot centre fading to the colour: drawn with 'lighter' it reads as light. */
function glowSprite(hex, size = 96) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.12, rgba(hex, 0.9)); grad.addColorStop(0.35, rgba(hex, 0.28)); grad.addColorStop(1, rgba(hex, 0));
  g.fillStyle = grad; g.fillRect(0, 0, size, size); return c;
}

/**
 * @param {HTMLCanvasElement} cv
 * @param {{ machine: () => any, laneHex: string[], isPlaying: () => boolean, isBusy: () => boolean,
 *           stepMs: (lane) => number }} o
 *   isBusy: the app wants frames (playing, or something just changed); the scene adds its own live effects.
 */
export function createScene(cv, o) {
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, DPR = 1, bg = null, stars = [];
  const sprites = new Map(); const sprite = (hex) => { if (!sprites.has(hex)) sprites.set(hex, glowSprite(hex)); return sprites.get(hex); };
  const white = glowSprite('#ece9f7');
  // RD-8 type on the canvas is cached as sprites (one drawImage per label per frame, never a fillText on a curve per
  // frame): keyed by the words, the radius, the colours and the DPR, and by whether the font was there when it was made
  // (a sprite made before Space Grotesk loaded is made again once it has). Bounded: the oldest goes past TEXT_SPRITES.
  const TEXT_SPRITES = 32, texts = new Map(), mctx = document.createElement('canvas').getContext('2d');
  const fontOk = (font) => { try { return document.fonts?.check(font) ?? true; } catch { return true; } };
  let wakeUntil = 0;   // frames after the fonts load, so the sprites are made again with them
  try { document.fonts?.addEventListener('loadingdone', () => { wakeUntil = performance.now() + 400; }); } catch {}
  function cached(key, make) {
    let s = texts.get(key); if (s) { texts.delete(key); texts.set(key, s); return s; }   // most recent last
    s = make(); texts.set(key, s); if (texts.size > TEXT_SPRITES) texts.delete(texts.keys().next().value); return s;
  }
  /** Glyph widths of `text` in `font` plus a tracking of `track` em (caps are tracked, the sun is not). */
  function glyphs(text, font, track) { mctx.font = font; const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1]) || 13, t = track * size; return [...text].map(ch => ({ ch, w: mctx.measureText(ch).width, t })); }
  const spanOf = (gl) => gl.reduce((a, g) => a + g.w + g.t, 0) - (gl.length ? gl[gl.length - 1].t : 0);
  /** Width (px) of segments [{ text, color }] in `font` with tracking, without making a sprite (the ladder measures first). */
  function typeWidth(segs, font, track = TRACK) { return segs.reduce((a, s) => a + spanOf(glyphs(s.text, font, track)) + (s.text ? track * 13 : 0), 0); }
  /**
   * Straight type as a sprite: segments [{ text, color }], tracked when `track` > 0. { c, w, h, base }: draw c with its
   * top left at (x, y − base) for the text's baseline at y (its left edge at x).
   */
  function textSprite(segs, font, track = 0) {
    const key = `t|${font}|${track}|${DPR}|${fontOk(font)}|${segs.map(s => `${s.color}:${s.text}`).join('|')}`;
    return cached(key, () => {
      const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1]) || 13, parts = segs.map(s => ({ ...s, gl: glyphs(s.text, font, track) }));
      const w = Math.ceil(parts.reduce((a, p) => a + spanOf(p.gl) + track * size, 0)) + 2, h = Math.ceil(size * 1.4), base = Math.round(size * 1.05);
      const c = document.createElement('canvas'); c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR); const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.font = font; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; let x = 1;
      for (const p of parts) { g.fillStyle = p.color; for (const gg of p.gl) { g.fillText(gg.ch, x, base); x += gg.w + gg.t; } x += track * size; }
      return { c, w, h, base };
    });
  }
  /**
   * Type on a curve as a sprite: segments along a circle of radius r centred on the rings, at the top (reads clockwise,
   * the tops out) or the bottom (reads left to right, the tops in), centred on 12 or 6 o'clock, 13 px caps tracked .14 em.
   * { c, x, y, w, h }: draw c at (cx + x, cy + y). Each glyph is set upright on its own tangent.
   */
  function arcSprite(segs, r, top, font = LABEL_FONT, track = TRACK) {
    const key = `a|${font}|${Math.round(r)}|${top}|${DPR}|${fontOk(font)}|${segs.map(s => `${s.color}:${s.text}`).join('|')}`;
    return cached(key, () => {
      const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1]) || 13, parts = segs.map(s => ({ ...s, gl: glyphs(s.text, font, track) }));
      const total = parts.reduce((a, p) => a + spanOf(p.gl) + track * size, 0) - track * size, span = total / r, half = span / 2;
      const x0 = -((r + size) * Math.sin(half) + size), w = -2 * x0, y0 = top ? -(r + size) : (r - size) * Math.cos(half) - size, y1 = top ? -(r - size) * Math.cos(half) + size : r + size, h = y1 - y0;
      const c = document.createElement('canvas'); c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR); const g = c.getContext('2d');
      g.setTransform(DPR, 0, 0, DPR, -x0 * DPR, -y0 * DPR); g.font = font; g.textBaseline = 'middle'; g.textAlign = 'center';
      let a = -half;   // along the arc from its start, in radians
      for (const p of parts) {
        g.fillStyle = p.color;
        for (const gg of p.gl) {
          const mid = a + gg.w / 2 / r, th = top ? -Math.PI / 2 + mid : Math.PI / 2 - mid;
          g.save(); g.translate(Math.cos(th) * r, Math.sin(th) * r); g.rotate(top ? th + Math.PI / 2 : th - Math.PI / 2); g.fillText(gg.ch, 0, 0); g.restore();
          a += (gg.w + gg.t) / r;
        }
        a += (track * size) / r;
      }
      return { c, x: x0, y: y0, w, h };
    });
  }
  const WORD = 'rgba(236,233,247,.78)', DIM = 'rgba(236,233,247,.55)', BRIGHT = 'rgba(236,233,247,.95)';   // 78 % white: ≈ 9:1 on the void
  let hintT0 = 0, hintShown = false;   // RD-8 "press play": when the sun first showed it (0 = not yet); drawn last frame (one more frame clears it)
  let lightNow = null;   // RD-8 what the last frame measured and drew (tools and tests read it: `light`)
  const plate = (() => {   // a soft dark disc under the sun's numeral, so it reads on a white-hot core (the glow stays round it)
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(12,8,28,.8)'); gr.addColorStop(0.55, 'rgba(12,8,28,.55)'); gr.addColorStop(1, 'rgba(12,8,28,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
  })();
  const last = [];        // per lane: { index, t } of the latest step, for the smooth playhead
  const energy = new Array(MAX_LANES).fill(0), flash = new Map();   // energy per lane (decays), flash per "lane:index"
  const misses = new Map();   // V6: "lane:index" → { t, why } of a step that came round and stayed silent (prob / cond / dice)
  const waves = [], sparks = [], beams = [], blooms = [], recent = [];
  let shake = 0, quality = 1, avgDt = 16, prev = performance.now(), lastAlign = 0;
  // RD-6: the hand on a knob { li, k, until } (until = Infinity while held); what its lane was when it came (rotation,
  // length, hits) and the answers still fading: slides { d, t }, spreads and grows { t, ticks }, per lane
  let hand = null, answered = false; const was = [], slides = [], spreads = [], grows = [];
  const snap = (l) => ({ rot: l.rotation, len: l.length, k: l.euclidK, hits: l.hits.slice(0, l.length).join() });
  let ghost = null;   // RD-7 "show me": { kind, li, t } while it draws (GHOST_MS), once
  /** The app: draw the gesture { kind: 'pull' | 'turn', li } once (null: hide it now). */
  function setGhost(gh) { ghost = gh && o.machine().lanes[gh.li] ? { kind: gh.kind, li: gh.li, t: performance.now() } : null; }
  /** The app: a knob with key k on lane li is touched or dragged (null: let go; the answer stays HAND_MS). */
  function setHand(h) {
    const now = performance.now();
    if (h) { const l = o.machine().lanes[h.li]; if (!hand || hand.li !== h.li || hand.until < now) { if (l) was[h.li] = snap(l); } hand = { li: h.li, k: h.k, until: Infinity }; }
    else if (hand && hand.until === Infinity) hand.until = now + HAND_MS;
  }

  let stage = null, cell = null;   // RD-8 cell: the stage cell between the columns (the light's room and the caption's corner)
  const geo = () => ringGeo(W, H, stage, o.machine().lanes.length);
  /** s: the rings' box { x, y, w, h } in client px (ringBox), or null for the whole canvas; c: the stage cell it came from. */
  function setStage(s, c = null) {
    const b = cv.getBoundingClientRect(), toCv = (r) => r && { x: Math.round(r.x - b.left), y: Math.round(r.y - b.top), w: Math.round(r.w), h: Math.round(r.h) }, n = toCv(s); cell = toCv(c);
    if (JSON.stringify(n) === JSON.stringify(stage)) return; stage = n; backdrop();   // same canvas: only the nebulae follow the rings
  }
  const nodeXY = (g, li, i, len) => { const a = (i / len) * TAU - Math.PI / 2, r = g.ring(li); return [g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r, a]; };

  function resize() {
    DPR = Math.min(1.75, devicePixelRatio || 1); W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;   // the canvas box, which CSS sizes
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = Math.round(Math.min(320, W * H / 5200));   // stars turn around the rings' centre, so a new stage keeps them
    stars = Array.from({ length: n }, () => ({ a: Math.random() * TAU, d: Math.sqrt(Math.random()) * Math.hypot(W, H) * 0.62, s: 0.3 + Math.random() ** 3 * 1.6, tw: Math.random() * TAU, sp: 0.4 + Math.random() * 1.6 }));
    backdrop();
  }
  // static backdrop: void gradient + two nebulae around the rings, rendered once per size and stage
  function backdrop() {
    if (!bg || bg.width !== cv.width || bg.height !== cv.height) { bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height; }
    const b = bg.getContext('2d'); b.setTransform(DPR, 0, 0, DPR, 0, 0);
    const { cx, cy, R } = geo();
    let gr = b.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75); gr.addColorStop(0, '#1a1236'); gr.addColorStop(0.5, '#0e0a20'); gr.addColorStop(1, '#050208');
    b.fillStyle = gr; b.fillRect(0, 0, W, H);   // opaque: covers the previous stage's backdrop
    for (const [x, y, rad, hex, a] of [[W * 0.18, H * 0.78, R * 1.3, '#67e8f9', 0.07], [W * 0.82, H * 0.25, R * 1.4, '#a78bfa', 0.1], [W * 0.62, H * 0.9, R, '#f0abfc', 0.05]]) {
      gr = b.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(1, rgba(hex, 0)); b.fillStyle = gr; b.fillRect(0, 0, W, H);
    }
  }
  addEventListener('resize', resize); new ResizeObserver(() => { if (cv.clientWidth !== W || cv.clientHeight !== H) resize(); }).observe(cv); resize();

  /** Called by the app for every lane step, at the moment it sounds. */
  function onStep(ev) {
    if (!o.machine().lanes[ev.lane]) return;   // a step drawn after its lane went (6 → 4 lanes while playing)
    const now = performance.now(); last[ev.lane] = { index: ev.index, t: now, loop: ev.loop };
    recent.push({ lane: ev.lane, index: ev.index, t: now }); while (recent.length > 16) recent.shift();
    if (ev.hit) burst(ev.lane, ev.index, ev.accent, now);
    else if (ev.miss) misses.set(`${ev.lane}:${ev.index}`, { t: now, why: ev.miss });
  }
  /** Light up a planet without moving the playhead (live-recorded hits). */
  function flashHit(li, index, accent) { burst(li, index, accent, performance.now()); }
  function burst(li, index, accent, now) {
    const ev = { lane: li, index, accent };
    const m = o.machine(), lane = m.lanes[ev.lane]; if (!lane) return;
    const g = geo(), [x, y, a] = nodeXY(g, ev.lane, ev.index + planetNudge(lane, ev.index), lane.length), hex = o.laneHex[ev.lane];   // from the planet, where it is drawn
    energy[ev.lane] = Math.min(1.6, energy[ev.lane] + (ev.accent ? 1 : 0.65)); flash.set(`${ev.lane}:${ev.index}`, now);
    waves.push({ x, y, hex, t: now, big: ev.accent });
    const n = Math.round((ev.accent ? 18 : 9) * quality * (reduced ? 0.4 : 1));
    for (let k = 0; k < n; k++) {   // sparks fly outward from the orbit, with a little tangential spin
      const dir = a + (Math.random() - 0.5) * 1.6, v = (ev.accent ? 160 : 90) * (0.4 + Math.random());
      sparks.push({ x, y, vx: Math.cos(dir) * v - Math.sin(a) * v * 0.4, vy: Math.sin(dir) * v + Math.cos(a) * v * 0.4, t: now, life: 450 + Math.random() * 500, hex, s: 0.6 + Math.random() * 1.4 });
    }
    if (sparks.length > 500) sparks.splice(0, sparks.length - 500);
    // conjunction: hits on different lanes landing together get a beam of light between them
    for (const w of waves) if (w !== waves[waves.length - 1] && now - w.t < 28 && w.hex !== hex) beams.push({ x1: w.x, y1: w.y, x2: x, y2: y, h1: w.hex, h2: hex, t: now });
    if (ev.lane === 0 && ev.accent && !reduced) shake = Math.min(6, shake + 3.5);
  }
  /** The app calls this when the master clock reaches a full cycle (Machine.cycleTicks, conditions and dice included). */
  function bloom() { const now = performance.now(); if (now - lastAlign < 400) return; lastAlign = now; blooms.push({ t: now }); }

  /** Which ring is under client point (x, y)? -1 if none (the same rings the gestures find). */
  function pick(x, y) { return locate(x, y).lane; }
  /** I1: what is under client point (x, y): { dx, dy } from the centre, its lane (-1 off the rings), that lane's
   *  visible step whose mark is nearest (a planet where it is drawn) and how far (px) the point is from that mark, plus
   *  the geometry (for pull distances). */
  function locate(x, y) {
    const b = cv.getBoundingClientRect(), g = geo(), dx = x - b.left - g.cx, dy = y - b.top - g.cy, li = laneAtRadius(g, Math.hypot(dx, dy)), lane = o.machine().lanes[li];
    if (!lane) return { dx, dy, g, lane: -1, step: -1, off: Infinity };
    const nd = (i) => planetNudge(lane, i), step = stepAtAngle(dx, dy, lane.length, nd), [tx, ty] = nodeXY(g, li, step + nd(step), lane.length);
    return { dx, dy, g, lane: li, step, off: Math.hypot(dx + g.cx - tx, dy + g.cy - ty) };
  }
  /** I1: client position of lane li's visible step i, its planet where it is drawn (tests and tools aim with it). */
  function stepXY(li, i) { const b = cv.getBoundingClientRect(), g = geo(), lane = o.machine().lanes[li], [x, y] = nodeXY(g, li, i + (lane ? planetNudge(lane, i) : 0), lane?.length || 1); return { x: x + b.left, y: y + b.top }; }

  function frame(now) {
    // stopped and nothing fading out: leave the last frame on screen (idle CPU ~0)
    // RD-6: a hand on a knob, a held step, an answer fading, or the frame after the last one (to clear it) keeps drawing
    const held = o.held?.() || [];
    // RD-8: "press play" for HINT_MS from the first frame it is asked for; a held fill flares; the fonts just loaded
    const hint = !!o.hint?.() && (hintT0 || (hintT0 = now), now - hintT0 < HINT_MS), fillOn = !!o.fill?.();
    if (!o.isBusy() && !o.isRecording?.() && o.jamProgress?.() == null && !waves.length && !sparks.length && !beams.length && !blooms.length && !misses.size && energy.every(e => e < 0.01) && !hand && !held.length && !answered && !slides.some(Boolean) && !spreads.some(Boolean) && !grows.some(Boolean) && !ghost && !hint && !hintShown && !fillOn && now >= wakeUntil) { prev = now; return; }
    hintShown = hint;
    const dt = Math.min(64, now - prev); prev = now; avgDt += (dt - avgDt) * 0.05;
    quality = avgDt > 26 ? 0.35 : avgDt > 20 ? 0.7 : 1;    // shed particles/stars when the machine struggles
    const m = o.machine(), g = geo(), playing = o.isPlaying(), sel = m.selected;
    if (hand && now >= hand.until) hand = null;
    answered = held.length > 0 || !!hand;
    for (let i = 0; i < energy.length; i++) energy[i] *= Math.pow(0.04, dt / 1000);   // ~0.6 s fall-off
    shake *= Math.pow(0.002, dt / 1000);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0, W, H);
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0; ctx.translate(sx, sy);

    // stars: the whole field turns very slowly around the core, twinkling; the kick makes them flare
    ctx.globalCompositeOperation = 'lighter';
    const rot = reduced ? 0 : now * 0.000012, kickE = energy[0];
    const sn = Math.round(stars.length * quality);
    for (let i = 0; i < sn; i++) {
      const s = stars[i], a = s.a + rot * s.sp, x = g.cx + Math.cos(a) * s.d, y = g.cy + Math.sin(a) * s.d * 0.9;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 0.001 * s.sp + s.tw));
      ctx.globalAlpha = Math.min(1, tw * (0.5 + kickE * 0.3)); ctx.fillStyle = '#ece9f7'; ctx.fillRect(x, y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // the core: a breathing sun fed by every lane's energy, tinted by the kick
    const tot = energy.reduce((a, b) => a + b, 0), coreR = g.R * (0.11 + kickE * 0.05 + tot * 0.01);
    ctx.globalAlpha = 0.35 + Math.min(0.65, tot * 0.25); ctx.drawImage(sprite(o.laneHex[0]), g.cx - coreR * 2, g.cy - coreR * 2, coreR * 4, coreR * 4);
    ctx.globalAlpha = 0.25 + energy[3] * 0.3; ctx.drawImage(sprite(o.laneHex[3]), g.cx - coreR * 3, g.cy - coreR * 3, coreR * 6, coreR * 6);
    ctx.globalAlpha = 1;
    // RD-8 the fill flare (Rio): while fill is held from anywhere (the button, key 0, the Move's Layout, a latched bar)
    // the sun flares: a brighter core and a four-point star turning slowly (still with reduced motion). Light, not a
    // target: the sun is a display.
    if (fillOn) {
      const L = g.R * 0.2, sp = reduced ? 0.4 : now * 0.0005, fr = coreR * 2.4;
      ctx.globalAlpha = 0.55; ctx.drawImage(white, g.cx - fr, g.cy - fr, fr * 2, fr * 2);
      ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(236,233,247,.7)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k < 2; k++) { const q = sp + k * Math.PI / 2; ctx.moveTo(g.cx - Math.cos(q) * L, g.cy - Math.sin(q) * L); ctx.lineTo(g.cx + Math.cos(q) * L, g.cy + Math.sin(q) * L); }
      ctx.stroke();
    }
    // cycle bloom: when every lane lines up, a chromatic shockwave leaves the core
    for (let i = blooms.length - 1; i >= 0; i--) {
      const age = (now - blooms[i].t) / 1600; if (age > 1) { blooms.splice(i, 1); continue; }
      const r = g.R * (0.08 + age * 1.15), e = 1 - age; ctx.lineWidth = 2 + e * 10;
      for (const [hex, off] of [['#67e8f9', -3], ['#f0abfc', 3], ['#ece9f7', 0]]) { ctx.strokeStyle = rgba(hex, e * (off ? 0.45 : 0.6)); ctx.beginPath(); ctx.arc(g.cx + off, g.cy, r, 0, TAU); ctx.stroke(); }
    }

    const anySolo = m.lanes.some(l => l.solo);
    m.lanes.forEach((lane, li) => {
      const hex = lane.muted || (anySolo && !lane.solo) ? MUTED : o.laneHex[li], r = g.ring(li) + energy[li] * 2.5, isSel = li === sel, len = lane.length;
      // radar sweep behind the selected lane's playhead
      const ph = phase(lane, li, now, playing);
      if (isSel && playing && ph != null && ctx.createConicGradient) {
        const a = (ph / len) * TAU - Math.PI / 2, cg = ctx.createConicGradient(a - 0.9, g.cx, g.cy);
        cg.addColorStop(0, rgba(hex, 0)); cg.addColorStop(0.143, rgba(hex, 0.13)); cg.addColorStop(0.1431, rgba(hex, 0)); cg.addColorStop(1, rgba(hex, 0));
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); if (li) ctx.arc(g.cx, g.cy, g.ring(li - 1), 0, TAU, true); ctx.fill();
      }
      // orbit: a wide faint glow under a crisp hairline
      ctx.strokeStyle = rgba(hex, (isSel ? 0.16 : 0.06) + energy[li] * 0.12); ctx.lineWidth = isSel ? 9 : 6; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = isSel ? rgba(hex, 0.75) : 'rgba(236,233,247,.16)'; ctx.lineWidth = isSel ? 1.4 : 1; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();
      // RD-6 the ring answers the hand on this lane's knob: what changed since the hand came (was), and where the steps are
      // drawn while it lasts (the push and the swing move ticks and planets; a slide eases the planets to their new place)
      const look = hand && hand.li === li ? handLook(hand.k) : null;
      if (hand && hand.li === li) {
        const w = was[li], s = snap(lane);
        if (w && look === 'slide' && s.rot !== w.rot) { const o0 = slides[li], left = o0 ? o0.d * (1 - easeOut((now - o0.t) / SLIDE_MS)) : 0; slides[li] = { d: shortSteps(w.rot, s.rot, len) + left, t: now }; }
        if (w && look === 'spread' && (s.k !== w.k || s.hits !== w.hits)) spreads[li] = { t: now };
        if (w && look === 'grow' && s.len > w.len) grows[li] = { t: now, ticks: newTicks(w.len, s.len) };
        was[li] = s;
      }
      const sl = slides[li], slP = sl ? (now - sl.t) / (reduced ? 2 * SLIDE_MS : SLIDE_MS) : 1; if (sl && slP >= 1) slides[li] = null;
      const slideOff = sl && slP < 1 && !reduced ? -sl.d * (1 - easeOut(slP)) : 0;   // reduced motion: no glide, the trail only
      const sp = spreads[li], spP = sp ? (now - sp.t) / SPREAD_MS : 1; if (sp && spP >= 1) spreads[li] = null;
      const gw = grows[li], gwP = gw ? (now - gw.t) / GROW_MS : 1; if (gw && gwP >= 1) grows[li] = null;
      if (look || slP < 1 || spP < 1 || gwP < 1) answered = true;
      const pushS = look === 'push' ? pushSteps(lane.offsetMs, o.stepMs(lane)) : 0, swingOf = (i) => (look === 'swing' ? lane.swingAt(i) : 0);
      const ang = (p) => (p / len) * TAU - Math.PI / 2;
      // the rhythm's shape: hits joined into a polygon inside the ring, flaring when the lane plays
      const pts = []; for (let i = 0; i < len; i++) if (lane.hitAt(i)) { const a = ang(i + pushS + swingOf(i) + slideOff); pts.push([g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r]); }
      if (pts.length >= 3) {   // two hits would just draw a diameter: skip
        ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = rgba(hex, 0.025 + energy[li] * 0.05); ctx.fill();
        ctx.strokeStyle = rgba(hex, (isSel ? 0.3 : 0.14) + energy[li] * 0.35); ctx.lineWidth = 1; ctx.stroke();
      }
      // step ticks and hit planets
      const tick = (a, w, alpha) => { const ca = Math.cos(a), sa = Math.sin(a), x = g.cx + ca * r, y = g.cy + sa * r; ctx.strokeStyle = `rgba(236,233,247,${alpha})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - ca * w, y - sa * w); ctx.lineTo(x + ca * w, y + sa * w); ctx.stroke(); };
      for (let i = 0; i < len; i++) {
        const moved = pushS + swingOf(i);   // RD-6: push / swing under the hand: the step drawn where it sounds, its grid tick a faint mark
        if (moved) tick(ang(i), 3, 0.14);
        const a = ang(i + moved), ca = Math.cos(a), sa = Math.sin(a); let x = g.cx + ca * r, y = g.cy + sa * r;
        if (!lane.hitAt(i)) { tick(a, 4, 0.28); continue; }
        // G1 a nudged hit sits off its tick by the nudge (a fraction of the step), the tick stays as a faint mark; RD-6 a
        // slide under the hand eases it from where the shift took it, with a short trail behind
        const nd = planetNudge(lane, i), off = nd + slideOff;
        if (nd) tick(a, 5, 0.35);
        if (off) { const an = ang(i + moved + off); x = g.cx + Math.cos(an) * r; y = g.cy + Math.sin(an) * r; }
        if (sl && slP < 1) {   // the trail: from where it was (at most 1.5 steps back) to where it is now, fading
          const now0 = i + moved + off, from = now0 - Math.sign(sl.d) * Math.min(1.5, Math.abs(reduced ? sl.d : sl.d * (1 - easeOut(slP)) + 0.6));
          ctx.strokeStyle = rgba(hex, 0.6 * (1 - slP)); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, Math.min(ang(from), ang(now0)), Math.max(ang(from), ang(now0))); ctx.stroke(); ctx.lineCap = 'butt';
        }
        // G4 a ghost (soft vel lock) is a smaller, dimmer planet
        const key = `${li}:${i}`, acc = lane.accentAt(i), ghost = lane.tierAt?.(lane.stepIndex(i)) === 'ghost', f = flash.get(key), fl = f ? Math.max(0, 1 - (now - f) / 380) : 0;
        const size = (acc ? 15 : ghost ? 7 : 10) * (1 + fl * 0.9);
        // V6 a planet is as solid as its chance of playing (its prob lock, else the lane's prob: what Lane.at rolls); a
        // hit that played still flares full
        const pa = planetAlpha(lane.chanceAt(i));
        ctx.globalAlpha = (ghost ? 0.35 : 0.55) * pa + fl * 0.45; ctx.drawImage(sprite(hex), x - size * 2, y - size * 2, size * 4, size * 4);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, pa + fl); ctx.fillStyle = fl > 0.4 ? '#ffffff' : hex; ctx.beginPath(); ctx.arc(x, y, (acc ? 5.5 : ghost ? 2.8 : 4) * (1 + fl * 0.4), 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
        const mi = misses.get(key), ma = mi ? 1 - (now - mi.t) / MISS_MS : 0;
        if (ma > 0) {   // V6 ghost flash: the step came round and stayed silent. Solid ring = the roll said no, dashed = its condition, dotted = locked dice
          const gr = size + 3 + (reduced ? 0 : (1 - ma) * 10); ctx.strokeStyle = rgba(hex, 0.85 * ma); ctx.lineWidth = 1.5;
          ctx.setLineDash(mi.why === 'cond' ? [3, 3] : mi.why === 'dice' ? [1, 3] : []); ctx.beginPath(); ctx.arc(x, y, gr, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        const tg = lane.trigAt?.(i), arcs = condArcs(tg?.cond, playing ? last[li]?.loop : null);
        if (arcs) {   // V6 a:b condition: b arcs round the planet, one per loop from 12 o'clock; the one it plays on is solid, the loop the lane is on now is lit
          const hr = size + 6, seg = TAU / arcs.length, gap = Math.min(0.35, seg * 0.25);
          ctx.lineWidth = 2;
          arcs.forEach(({ plays, here }, k) => {
            const a0 = -Math.PI / 2 + k * seg + gap / 2;
            ctx.strokeStyle = here ? (plays ? '#ffffff' : 'rgba(236,233,247,.75)') : rgba(hex, plays ? 0.85 : 0.22);
            ctx.beginPath(); ctx.arc(x, y, hr, a0, a0 + seg - gap); ctx.stroke();
          });
        } else if (tg && tg.cond !== 'always') {   // other conditions (pre, fill, first): a dashed halo (it doesn't always play)
          ctx.strokeStyle = rgba(hex, 0.7); ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(x, y, size + 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        if (tg && tg.ratchet > 1) for (let k = 1; k < tg.ratchet; k++) {   // repeats: small echoes trailing outward
          ctx.fillStyle = rgba(hex, 0.8 - k * 0.15); ctx.beginPath(); ctx.arc(x + ca * (size + 4 + k * 5), y + sa * (size + 4 + k * 5), 1.8, 0, TAU); ctx.fill();
        }
        if (lane.shownLock ? lane.shownLock(i) : lane.lockAt(i)) {   // step locks: a small cyan moon circling the planet (a ghost is its tier, not a lock)
          const q = now * 0.003 + i, mx = x + Math.cos(q) * (size + 3), my = y + Math.sin(q) * (size + 3);
          ctx.drawImage(sprite('#67e8f9'), mx - 6, my - 6, 12, 12);
        }
        if (acc) {   // accent: a four-point lens flare that turns slowly
          const L = 13 + fl * 16, sp = now * 0.0006; ctx.strokeStyle = rgba(hex, 0.55 + fl * 0.45); ctx.lineWidth = 1;
          ctx.beginPath(); for (let k = 0; k < 2; k++) { const q = sp + k * Math.PI / 2; ctx.moveTo(x - Math.cos(q) * L, y - Math.sin(q) * L); ctx.lineTo(x + Math.cos(q) * L, y + Math.sin(q) * L); } ctx.stroke();
        }
        // RD-6 hits re-spread: a ring leaves every planet once; chance: an arc round each planet as long as its chance
        if (spP < 1) { ctx.strokeStyle = rgba(hex, 0.8 * (1 - spP)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, size + 4 + (reduced ? 4 : spP * 12), 0, TAU); ctx.stroke(); }
        if (look === 'chance') {
          const c = Math.max(0, Math.min(1, lane.chanceAt(i))); ctx.lineWidth = 2;
          ctx.strokeStyle = rgba(hex, 0.18); ctx.beginPath(); ctx.arc(x, y, size + 8, 0, TAU); ctx.stroke();
          if (c > 0) { ctx.strokeStyle = rgba(hex, 0.85); ctx.beginPath(); ctx.arc(x, y, size + 8, -Math.PI / 2, -Math.PI / 2 + TAU * c); ctx.stroke(); }
        }
      }
      // RD-6 a longer loop: its new ticks pulse once; push: an arc at 12 o'clock from the grid to where the ring is drawn
      if (gwP < 1) for (const i of gw.ticks) if (i < len) {
        const a = ang(i + pushS + swingOf(i)), x = g.cx + Math.cos(a) * r, y = g.cy + Math.sin(a) * r, e = 1 - gwP;
        tick(a, 6, 0.4 + 0.55 * e); ctx.strokeStyle = rgba(hex, 0.8 * e); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 4 + (reduced ? 6 : gwP * 14), 0, TAU); ctx.stroke();
      }
      if (pushS) { ctx.strokeStyle = rgba(hex, 0.85); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(g.cx, g.cy, r + 9, Math.min(ang(0), ang(pushS)), Math.max(ang(0), ang(pushS))); ctx.stroke(); ctx.lineCap = 'butt'; }
      // RD-6 a held step (a Move step button down, or the step a knob of the step page edits): a halo round it
      for (const h of held) if (h.li === li && h.i < len) {
        const a = ang(h.i + pushS + swingOf(h.i) + (lane.hitAt(h.i) ? planetNudge(lane, h.i) + slideOff : 0)), x = g.cx + Math.cos(a) * r, y = g.cy + Math.sin(a) * r;
        // a ring only: a glow would read as a planet on an empty step
        ctx.strokeStyle = rgba(hex, 0.95); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.stroke();
      }
      // comet playhead: smooth between steps, with a fading tail along the orbit
      if (playing && ph != null) {
        const a = (ph / len) * TAU - Math.PI / 2, tail = Math.min(1.1, TAU / len * 1.4), segs = 14;
        ctx.lineCap = 'round';
        for (let k = 0; k < segs; k++) { const a0 = a - tail * (k + 1) / segs, a1 = a - tail * k / segs; ctx.strokeStyle = rgba(hex, 0.7 * (1 - k / segs) ** 2); ctx.lineWidth = 3.2 * (1 - k / segs) + 0.4; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, a0, a1); ctx.stroke(); }
        ctx.lineCap = 'butt';
        const hx = g.cx + Math.cos(a) * r, hy = g.cy + Math.sin(a) * r; ctx.drawImage(white, hx - 14, hy - 14, 28, 28); ctx.drawImage(sprite(hex), hx - 22, hy - 22, 44, 44);
      }
      // C5: no label on the ring: the app's fixed legend names the lanes (voice, length × speed)
    });

    // live record armed: the outer orbit breathes red
    if (o.isRecording?.()) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.006), r = g.outer + 20;   // RD-8: between the cycle arc and the crawl / the moons
      ctx.strokeStyle = `rgba(239,68,68,${0.25 + pulse * 0.35})`; ctx.lineWidth = 1.5 + pulse * 2; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -now * 0.02;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // ---- RD-8 the light that speaks without opening anything. Measured first (Yuki's ladder, lightLevel): the room
    // outside the outer ring (to the stage's edge, or the canvas's), the type each curve carries, what each label needs.
    // Then drawn, 'source-over' (type, not light). The old core pill ("aligns in N bars") is the sun now. ----
    const al = o.align?.() || null, room = Math.max(0, (cell ? Math.min(g.cy - cell.y, cell.y + cell.h - g.cy) : Math.min(g.cy, H - g.cy)) - g.outer);
    const gs = o.gen?.() || null, genOn = !!gs && !!(gs.evolve || gs.dice || (gs.coupling && gs.coupling !== 'off'));
    const ss = o.slots?.() || null, moonsOn = !!ss && (ss.filled.some(Boolean) || ss.current >= 0 || ss.pending >= 0);
    const far = room >= LIGHT_ROOM, rGen = g.outer + (far ? 24 : 7), rWords = g.outer + 36, rMoon = g.outer + (far ? 24 : 7);
    const lane = m.lanes[sel], lab = lane && o.laneLabel?.(sel), rLab = lane ? g.ring(sel) + labelOffset(sel, m.lanes.length, g.gap * g.R) : 0;
    const labOf = (extras) => laneLabel({ name: lab.name, len: lane.length, ratio: lab.ratio, hits: lane.hits.slice(0, lane.length).filter(Boolean).length, chance: lane.prob ?? 1, push: lane.offsetMs }, extras);
    const labelSegs = (t) => { const n = lab.name.toUpperCase(); return [{ text: n, color: lane.muted || (anySolo && !lane.solo) ? MUTED : o.laneHex[sel] }, { text: t.slice(n.length).trimStart(), color: WORD }]; };
    const genSegs = (t) => [{ text: t, color: WORD }];
    const level = lightLevel({
      label: { arc: arcRoom(rLab), full: lab ? typeWidth(labelSegs(labOf(true)), LABEL_FONT) : 0 },
      slots: { gap: moonsOn ? arcRoom(rMoon, MOON_DEG) / Math.max(1, ss.filled.length - 1) : Infinity, num: moonsOn ? typeWidth([{ text: '16', color: '' }], LABEL_FONT, 0) : 0, room: moonsOn ? room : Infinity },
      gen: { arc: arcRoom(rWords), full: genOn ? typeWidth(genSegs(genWords(gs, true)), LABEL_FONT) : 0, room: genOn ? room : Infinity } });
    const plan = lightPlan(level, room);
    lightNow = { level, room, far, plan, label: lab ? labOf(plan.extras) : '', labelFits: !!lab && typeWidth(labelSegs(labOf(plan.extras)), LABEL_FONT) <= arcRoom(rLab), gen: genOn ? genWords(gs, plan.genDetail) : '', genFits: genOn && far && typeWidth(genSegs(genWords(gs, plan.genDetail)), LABEL_FONT) <= arcRoom(rWords), moons: moonsOn, lines: [], hint, sun: '', crawl: null };
    ctx.globalCompositeOperation = 'source-over';
    // the sun: "press play" on a visit that has never played (HINT_MS, then the numeral; a cut with reduced motion), else
    // the beats until everything meets: counting down while it plays, the cycle's length stopped. 40 px weight 300 (28
    // px weight 400 inside a phone's small inner ring), "beats" under it, lit on the last beat. In the middle of the
    // core, inside the kick ring: no planet, comet or burst ever lands there (every ring's step 1 is at 12 o'clock).
    const small = g.ring(0) < 56, pr = small ? g.ring(0) * 0.95 : Math.min(g.ring(0) * 0.9, 56);
    if (hint || (al && al.cycle > 0)) ctx.drawImage(plate, g.cx - pr, g.cy - pr, pr * 2, pr * 2);
    if (hint) {
      const p = (now - hintT0) / HINT_MS, env = reduced ? 1 : Math.max(0, Math.min(1, p / 0.08, (1 - p) / 0.12)), s = textSprite([{ text: 'press play', color: BRIGHT }], NUMBER_FONT);
      ctx.globalAlpha = env; ctx.drawImage(s.c, g.cx - s.w / 2, g.cy + 5 - s.base, s.w, s.h); ctx.globalAlpha = 1;
    } else if (al && al.cycle > 0) {
      const n = playing ? beatsLeft(al.tick, al.cycle, al.beat) : cycleBeats(al.cycle, al.beat), lastBeat = playing && n === 1; lightNow.sun = String(n);
      const s = textSprite([{ text: String(n), color: BRIGHT }], small ? SUN_SMALL_FONT : SUN_FONT), c = textSprite([{ text: 'BEATS', color: lastBeat ? BRIGHT : DIM }], CAPS_FONT, TRACK);
      ctx.drawImage(s.c, g.cx - s.w / 2, g.cy + (small ? 5 : 8) - s.base, s.w, s.h); ctx.drawImage(c.c, g.cx - c.w / 2, g.cy + (small ? 10 : 16), c.w, c.h);
    }
    // V6 where you are in the full cycle (every lane, condition and locked dice repeat): a thin arc just outside the
    // outer ring fills from 12 o'clock and starts again when everything lines up (the bloom)
    if (playing && al && al.cycle > 0) {
      const r = g.outer + Math.min(16, g.R * 0.08), a0 = -Math.PI / 2, a1 = a0 + TAU * cyclePos(al.tick, al.cycle);
      ctx.strokeStyle = 'rgba(236,233,247,.16)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();   // the track: what is left to go
      ctx.strokeStyle = 'rgba(236,233,247,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, a0, Math.max(a0 + 0.01, a1)); ctx.stroke();
      ctx.fillStyle = 'rgba(236,233,247,.85)'; ctx.beginPath(); ctx.arc(g.cx + Math.cos(a1) * r, g.cy + Math.sin(a1) * r, 2, 0, TAU); ctx.fill();
    }
    // the generative arc (Yuki): over the top, read-only. Its words name what is on (evolve, dice, coupling, gravity; the
    // numbers are in the caption); the crawl under them moves continuously toward the next mutation (once per beat with
    // reduced motion) and starts again on the line. Without room over the ring (1280×720: 12 px) the crawl hugs the
    // ring and the words stay in the caption.
    if (genOn) {
      const a0 = -Math.PI / 2 - (GEN_DEG / 2) * Math.PI / 180, a1 = a0 + (GEN_DEG * Math.PI) / 180;
      if (gs.evolve) {
        const p = genProgress(gs.bars, gs.every, gs.frac, reduced ? gs.beats : 0), ah = a0 + (a1 - a0) * p; lightNow.crawl = p;
        ctx.strokeStyle = 'rgba(236,233,247,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(g.cx, g.cy, rGen, a0, a1); ctx.stroke();
        ctx.strokeStyle = 'rgba(236,233,247,.6)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(g.cx, g.cy, rGen, a0, Math.max(a0 + 0.004, ah)); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = BRIGHT; ctx.beginPath(); ctx.arc(g.cx + Math.cos(ah) * rGen, g.cy + Math.sin(ah) * rGen, 2.2, 0, TAU); ctx.fill();
      }
      if (far) { const t = genWords(gs, plan.genDetail); if (t && typeWidth(genSegs(t), LABEL_FONT) <= arcRoom(rWords)) { const s = arcSprite(genSegs(t), rWords, true); ctx.drawImage(s.c, g.cx + s.x, g.cy + s.y, s.w, s.h); } }
    }
    // the slot moons (Rio, Yuki): the 16 slots under the rings, slot 1 at the left; a saved slot a moon, an empty one a
    // ring, the playing one bright, the queued one in a dashed ring. Numbers by the ladder: all, the playing and the
    // queued only, or none (then the playing slot is in the caption). lit: their boxes (the caption keeps clear of them).
    const lit = [];
    if (moonsOn) {
      const n = ss.filled.length;
      for (let k = 0; k < n; k++) {
        const a = moonAngle(k, n) - Math.PI / 2, x = g.cx + Math.cos(a) * rMoon, y = g.cy + Math.sin(a) * rMoon, cur = k === ss.current, nx = k === ss.pending;
        if (cur) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(white, x - 9, y - 9, 18, 18); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = BRIGHT; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); }
        else if (ss.filled[k]) { ctx.fillStyle = DIM; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
        else { ctx.strokeStyle = 'rgba(236,233,247,.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.stroke(); }
        if (nx) { ctx.strokeStyle = 'rgba(236,233,247,.85)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
        const d = nx ? 8 : 5; lit.push({ x: x - d, y: y - d, w: 2 * d, h: 2 * d });
        if (plan.slotNumbers === 'all' || (plan.slotNumbers === 'some' && (cur || nx))) {
          const big = cur || nx, px = big ? NUMBER_PX : LABEL_PX, s = textSprite([{ text: String(k + 1), color: big ? BRIGHT : DIM }], big ? NUMBER_FONT : LABEL_FONT), ry = rMoon + (big ? 13 : 12);
          const tx = g.cx + Math.cos(a) * ry, ty = g.cy + Math.sin(a) * ry, base = ty + (big ? 5.5 : 4.5); ctx.drawImage(s.c, tx - s.w / 2, base - s.base, s.w, s.h);
          lit.push({ x: tx - s.w / 2, y: base - 0.72 * px, w: s.w, h: 0.75 * px });   // the digits' box (cap height)
        }
      }
    }
    // ONE arc label, the selected lane only (DECISION "Arc labels"): "CONGA 32 × 4" at the bottom of its ring, 13 px caps
    // weight 500, 78 % white (the name in the lane's colour), in the gap outside the ring (inside for the outer lane),
    // its extras while the ladder keeps them; nothing when even the short form does not fit the ±35° band
    if (lab && rLab > 0) {
      const segs = labelSegs(labOf(plan.extras));
      if (typeWidth(segs, LABEL_FONT) <= arcRoom(rLab)) { const s = arcSprite(segs, rLab, false); ctx.drawImage(s.c, g.cx + s.x, g.cy + s.y, s.w, s.h); }
    }
    // the straight caption (Yuki: numbers leave the curve): bottom right of the stage, right-aligned, 13 px: the cycle,
    // the generative facts, the playing slot when the moons carry no number, the take's beats (the jam pill has the
    // state, the canvas the count). Lines go from the end while one would touch the rings or the moons and their numbers
    // (captionFit: a phone's square canvas; never at 1512×860).
    const jp = o.jamProgress?.(), jamOf = o.jamBeats || 256;
    const lines = captionLines({ cycle: al && al.cycle > 0 ? cycleLine(al.tick, al.cycle, al.bar, al.beat, playing) : '', evolve: gs?.evolve ? { bars: barsToEvolve(gs.bars, gs.every) } : null, dice: gs?.dice ? { seed: gs.dice, repeat: gs.repeat || 1 } : null, slot: moonsOn && plan.slotNumbers === 'none' && ss.current >= 0 ? ss.current + 1 : null, jam: jp != null ? { beat: Math.floor(jp * jamOf), of: jamOf } : null });
    const rb = (b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
    lightNow.boxes = { moons: lit.map(rb), lines: [] };
    if (lines.length) {
      const LH = 17, right = (cell ? cell.x + cell.w : W) - 14, bottom = (cell ? cell.y + cell.h : H) - 10, sp = lines.map(t => textSprite([{ text: t, color: WORD }], CAPTION_FONT));
      const n = captionFit(sp.map(s => s.w), { right, bottom, cx: g.cx, cy: g.cy, ring: g.outer + 6, boxes: lit, LH });
      for (let k = 0; k < n; k++) { const s = sp[k]; ctx.drawImage(s.c, right - s.w, bottom - (n - k) * LH + 13 - s.base, s.w, s.h); }
      lightNow.lines = lines.slice(0, n); lightNow.boxes.lines = captionBoxes(sp.slice(0, n).map(s => s.w), right, bottom, LH).map(rb);
    }
    ctx.globalCompositeOperation = 'lighter';
    // jam: a red arc around everything fills up over the 256 beats, with a ticking head (just outside the outer ring, so
    // it is whole at 1280×720 too; its count is in the caption)
    if (jp != null) {
      const r = g.outer + 12, a0 = -Math.PI / 2, a1 = a0 + TAU * Math.max(0.002, jp), pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      ctx.strokeStyle = 'rgba(239,68,68,.18)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(239,68,68,${0.7 + pulse * 0.3})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, a0, a1); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.drawImage(sprite('#ef4444'), g.cx + Math.cos(a1) * r - 16, g.cy + Math.sin(a1) * r - 16, 32, 32);
    }
    // beams between simultaneous hits
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i], age = (now - b.t) / 420; if (age > 1) { beams.splice(i, 1); continue; }
      const lg = ctx.createLinearGradient(b.x1, b.y1, b.x2, b.y2); lg.addColorStop(0, rgba(b.h1, 0.8 * (1 - age))); lg.addColorStop(1, rgba(b.h2, 0.8 * (1 - age)));
      ctx.strokeStyle = lg; ctx.lineWidth = 1 + (1 - age) * 2.5; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    // shockwaves
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i], age = (now - w.t) / (w.big ? 700 : 520); if (age > 1) { waves.splice(i, 1); continue; }
      const e = 1 - age; ctx.strokeStyle = rgba(w.hex, e * 0.9); ctx.lineWidth = (w.big ? 3 : 1.6) * e + 0.3;
      ctx.beginPath(); ctx.arc(w.x, w.y, 6 + (1 - e * e) * (w.big ? 46 : 30), 0, TAU); ctx.stroke();
    }
    // sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i], age = (now - p.t) / p.life; if (age > 1) { sparks.splice(i, 1); continue; }
      const k = dt / 1000; p.vx *= Math.pow(0.08, k); p.vy *= Math.pow(0.08, k); p.x += p.vx * k; p.y += p.vy * k;
      const s = p.s * 6 * (1 - age); ctx.globalAlpha = 1 - age; ctx.drawImage(sprite(p.hex), p.x - s, p.y - s, s * 2, s * 2);
    }
    // RD-7 the ghost hand: its path so far as a dashed line, the hand a soft ring with a dot; it fades in and out. Reduced
    // motion: no travel, the whole path and the hand where it ends, for the same time
    if (ghost) {
      const p = (now - ghost.t) / GHOST_MS, lane = m.lanes[ghost.li];
      if (p >= 1 || !lane) ghost = null;
      else {
        const q = reduced ? 1 : p, env = Math.min(1, p / 0.1, (1 - p) / 0.15), end = ghostAt(g, ghost.kind, ghost.li, q);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = env; ctx.strokeStyle = 'rgba(236,233,247,.55)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.beginPath();
        for (let k = 0; k <= 24; k++) { const pt = ghostAt(g, ghost.kind, ghost.li, 0.15 + (q - 0.15) * k / 24); if (k) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y); }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(236,233,247,.16)'; ctx.strokeStyle = 'rgba(236,233,247,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(end.x, end.y, 15, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(236,233,247,.9)'; ctx.beginPath(); ctx.arc(end.x, end.y, 3, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (const [k, t] of flash) if (now - t > 400) flash.delete(k);
    for (const [k, mi] of misses) if (now - mi.t > MISS_MS || !playing) misses.delete(k);
  }
  /** Fractional step position of a lane right now, or null before its first step. */
  function phase(lane, li, now, playing) {
    const l = last[li]; if (!playing || !l) return null;
    const ms = o.stepMs(lane); return ((l.index % lane.length) + Math.min(1, (now - l.t) / ms)) % lane.length;
  }
  return { onStep, bloom, flash: flashHit, pick, locate, stepXY, setStage, geo, setHand, get hand() { return hand && { ...hand }; }, ghost: setGhost, get ghosting() { return !!ghost; }, get light() { return lightNow; }, start: () => frameLoop(frame), reset: () => { last.length = 0; misses.clear(); }, stats: () => ({ frameMs: avgDt, quality, sprites: texts.size }) };
}
