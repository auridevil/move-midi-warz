// The Move's view of a pattern: which steps the pad rows and the step buttons show (L5 pages), which lanes the four pad
// rows are (L2 window), what a track button selects, and which step a held step button holds. Pure (no DOM, no MIDI),
// so the rules are unit-tested; app.js keeps one MovePages and paints the LEDs from it.
import { condLoops, loopWindow } from './perform.js';
export const PAD_COLS = 8, PAD_ROWS = 4, STEP_BTNS = 16;
/** P7: a step button held this long is a look (the step buttons show its loops), not a tap, so its release doesn't
 *  toggle the step: as long as a long-press on screen (ui.js LONG_MS; a test keeps them equal). */
export const LOOK_MS = 450;

/** Pad pages of the longest lane (1–4): what Back + ◀ ▶ can pin. */
export const padPages = (lanes) => Math.max(1, ...lanes.map(l => Math.ceil(l.length / PAD_COLS)));
/**
 * Track button t (1 = top) → lane index: 4 − t (track 1 = lane 4, the top pad row, whatever the pad window shows).
 * With Shift on a 6-lane pattern track 4 / 3 = lane 5 / 6 (the bottom buttons, like lanes 1 / 2); otherwise Shift
 * changes nothing, as before L2 (it is held for the sound knobs too).
 */
export const trackLane = (t, shift, lanes) => (shift && lanes > PAD_ROWS && t >= 3 ? 8 - t : PAD_ROWS - t);

/** RD-10 the canvas focus (Yuki's one tab stop): the step it stands on in a lane of `len` steps. The wanted step is kept
 *  apart from this, so passing through a shorter lane (↓ then ↑) does not lose it. */
export const canvasStep = (step, len) => Math.max(0, Math.min(step, len - 1));
/** The canvas focus `{ li, step }` after a key, over lanes of `lens` steps: ↑ ↓ the lane (wrapping, the wanted step
 *  kept), ← → the step of that lane (wrapping, from where it stands); any other key leaves it. */
export function canvasKey({ li, step }, key, lens) {
  const n = lens.length, len = lens[li] || 1, at = canvasStep(step, len);
  if (key === 'ArrowUp' || key === 'ArrowDown') return { li: (li + (key === 'ArrowDown' ? 1 : n - 1)) % n, step };
  if (key === 'ArrowLeft' || key === 'ArrowRight') return { li, step: (at + (key === 'ArrowRight' ? 1 : len - 1)) % len };
  return { li, step };
}

export class MovePages {
  constructor() {
    this.follow = true;       // each pad row shows the page its own lane's playhead is on (page 1 while stopped)
    this.pad = 0;             // the pinned pad page (Back + ◀ ▶, Back + step), when not following
    this.back = false; this.backUsed = false;   // Back held; a page was pinned while it was (else its release = follow)
    this.base = 0;            // the first lane of the pad window: 0 (lanes 1–4), or 2 (lanes 3–6 of six)
    this.held = new Map();    // step button → { step, used }: the step it pressed, by its own number (17–32 on page 2)
    this.down = new Map();    // step button → when it went down (ms), for P7's tap or look
    this.hold = -1;           // the first step the step buttons showed when the first held one went down
  }
  /** The pad page a row of `lane` shows: following, the page its playhead is on (page 1 while stopped); pinned, the
   *  pinned page, or the lane's last one when it is shorter (a short lane's row stays lit and playable). */
  padPage(lane, playing) {
    const last = Math.max(0, Math.ceil(lane.length / PAD_COLS) - 1);
    return Math.min(last, this.follow ? (playing && lane.shown != null ? Math.floor(lane.shown / PAD_COLS) : 0) : this.pad);
  }
  /** The first step a pad row of `lane` shows. */
  padFirst(lane, playing) { return PAD_COLS * this.padPage(lane, playing); }
  /** The first step the 16 step buttons show of the selected lane: the 16 holding its pad page. While a step button is
   *  held they stay where it went down, so the step under the finger keeps its number and its light. */
  stepFirst(lane, playing) { return this.hold >= 0 ? this.hold : STEP_BTNS * Math.floor(this.padFirst(lane, playing) / STEP_BTNS); }
  /** The pad page Back + ◀ ▶ moves from: the pinned one, or the page `lane` shows now. */
  current(lane, playing) { return this.follow ? this.padPage(lane, playing) : this.pad; }
  /** Pin pad page p for every row (clamped to the longest lane): Back + ◀ ▶, or Back + a step button. */
  pin(p, lanes) { this.follow = false; this.pad = Math.max(0, Math.min(padPages(lanes) - 1, p)); this.backUsed = true; }
  /** Back goes down / comes up: alone (nothing pinned while it was held) it goes back to following the playheads. */
  backDown() { this.back = true; this.backUsed = false; }
  backUp() { this.back = false; if (!this.backUsed) this.follow = true; }
  /**
   * The first lane of the pad window for the selected lane `sel` of `n`: lanes 1–4, or 3–6 on six. It moves only when
   * the selection leaves it, so playing a row (a pad selects its lane) never moves the rows under the fingers.
   */
  window(sel, n) {
    if (n <= PAD_ROWS) return (this.base = 0);
    if (sel < this.base || sel >= this.base + PAD_ROWS) this.base = sel >= PAD_ROWS ? n - PAD_ROWS : 0;
    return (this.base = Math.min(this.base, n - PAD_ROWS));
  }
  /** Step button `btn` goes down on step `step` at `at` ms; `first` = the first step the buttons show now (kept while held). */
  press(btn, step, first, at = 0) { if (!this.held.size) this.hold = first; this.held.set(btn, { step, used: false }); this.down.set(btn, at); }
  /** P7: the held step whose loops the step buttons show at `at` ms: the first one a knob (or the wheel, or Delete)
   *  edited, or one held LOOK_MS; null while every press may still be a tap (the buttons keep showing the steps). */
  looked(at) { for (const [btn, h] of this.held) if (h.used || at - this.down.get(btn) >= LOOK_MS) return h; return null; }
  /** RD-6: every held step looked at (LOOK_MS, or edited) at `at` ms, the steps the canvas draws a halo round: a press
   *  that may still be a tap draws nothing there either. */
  lookedSteps(at) { const out = []; for (const [btn, h] of this.held) if (h.used || at - this.down.get(btn) >= LOOK_MS) out.push(h.step); return out; }
  /** Step button `btn` comes up at `at` ms: what it pressed ({ step, used }), or undefined; held LOOK_MS it was a look,
   *  so it comes back used (no toggle). A release always ends its own press, whatever happened since (the page turned,
   *  Back went down, the lane got shorter). */
  release(btn, at) {
    const h = this.held.get(btn); if (h && at - this.down.get(btn) >= LOOK_MS) h.used = true;
    this.held.delete(btn); this.down.delete(btn); if (!this.held.size) this.hold = -1; return h;
  }
}

// ---- RD-5 the console's knob row: which page it shows, and what the Move's knobs edit (Nils's state table,
// docs/redesign/proposals/nils/answers.md §Q2). One rule: a Move control held (Shift, a step looked at) or touched (an
// encoder, and TOUCH_HOLD_MS after it) owns the row while it lasts; let go, the row goes back to the page the screen
// latched (rhythm, sound, or a step the mouse opened), never to rhythm. The Move's mapping never changes: the chip names
// what its knobs edit, grey when that is not what the row draws. Pure: app.js feeds it the hands and draws the answer ----
export const TOUCH_HOLD_MS = 400;
export const PAGES = ['rhythm', 'sound', 'step'];
/**
 * @param {object} s
 * @param {'rhythm'|'sound'|'step'} [s.latch]  the page the screen latched (a tab, or a cell's long-press = step)
 * @param {number} [s.latchStep]   the step of a latched step page (-1: none, so 'step' falls back to `back`)
 * @param {'rhythm'|'sound'} [s.back]   where a latched step page came from
 * @param {boolean} [s.shift]      the Move's Shift held
 * @param {boolean} [s.kbdShift]   ⇧ held on the keyboard (a screen hold: the sound page, the Move unchanged)
 * @param {{ step: number, looked: boolean }|null} [s.held]   a Move step held: looked = held LOOK_MS or a knob turned
 * @param {boolean} [s.touch]      a Move encoder touched now, or let go less than TOUCH_HOLD_MS ago
 * @param {boolean} [s.loop]       Loop held: the cells show the slots, the knobs keep their meaning
 * @returns {{ row: string, step: number, cells: string, move: string, knob8: string, own: boolean, chip: string, word: string }}
 *   row: the page drawn · step: its step (-1) · cells: steps | loops | slots · move: what the Move's knobs 1–7 edit
 *   (rhythm | sound | step: a held step's locks, looked at or not) · knob8: tempo | level | condition | repeats · own:
 *   the chip white (the Move owns the row, or its knobs edit what is drawn) · chip: "MOVE ⇢ …" · word: the page's name
 *   in the header
 */
export function resolvePage({ latch = 'rhythm', latchStep = -1, back = 'rhythm', shift = false, kbdShift = false, held = null, touch = false, loop = false, drift = false } = {}) {
  // RD-11 (behind ?drift): − held owns the row and the cells outright, one page, momentary only (Nils §Q1: no other
  // way in). The knobs are the drift settings and the cells Nils's LED table; a held step, Shift or Loop waits under it.
  if (drift) return { row: 'drift', step: -1, cells: 'drift', move: 'drift', knob8: 'drift', row8: 'drift', own: true, chip: 'MOVE ⇢ DRIFT', word: 'drift · held on Move' };
  // a step held but not yet looked at (LOOK_MS, or a knob turned) may still be a tap: it owns nothing and changes nothing
  // on screen (no page flashes), whatever else the hands do; a touch alone is no turn (a finger can rest on a knob while
  // the other hand taps steps), so it keeps showing its own page (T0′) and Shift stays ignored
  const holds = !!held && held.looked, quiet = !!held && !holds;
  // what the Move's knobs edit (app.js 'encoder': a held step makes 1–7 its locks and 8 its condition, + Shift repeats)
  const move = held ? 'step' : shift ? 'sound' : 'rhythm', knob8 = held ? (shift ? 'repeats' : 'condition') : shift ? 'level' : 'tempo';
  const owns = holds || touch || (!quiet && shift), seen = holds ? 'step' : shift && !held ? 'sound' : 'rhythm';   // seen: the Move's page as drawn
  const mine = latch === 'step' && latchStep < 0 ? back : latch, screen = kbdShift && mine !== 'step' ? 'sound' : mine;
  const row = owns ? seen : screen, step = row === 'step' ? (owns ? held.step : latchStep) : -1;
  // T1a / the quick tap: until the step is looked at, the chip says what it said before it went down. RD-9: Loop held
  // names the slots ahead of the arrow ("SLOTS · MOVE ⇢ RHYTHM"), and the arrow still names what the knobs edit, grey
  // when that is not what is drawn (round 2: "MOVE ⇢ SLOTS" alone hid that the knobs edit sound under Shift)
  const slots = loop && row !== 'step';   // a step page (held, or the mouse's) keeps its own chip, word and tools
  const label = holds ? `STEP ${held.step + 1}${shift ? ' ⇧' : ''}` : seen === 'sound' ? 'SOUND ⇧' : 'RHYTHM';
  const own = owns || (row === seen && seen !== 'step');
  // RD-9 (A2): Loop held repaints the header line too (Nils §Q3: a page repaints the 16 cells and the header)
  const word = slots ? 'slots · held on Move' : row === 'step' ? `step ${step + 1}${owns ? ` · held on Move${shift ? ' ⇧' : ''}` : ''}` : row === 'sound' && shift && owns ? 'sound ⇧' : row;
  // RD-6 the row's knob 8: on a step page its condition, or its repeats while the Move holds it with Shift (T2: only slot
  // 8 repaints); a mouse step page shows the condition (the repeats are one knob turn away in "more…")
  const row8 = row === 'step' ? (owns && shift ? 'repeats' : 'condition') : row === 'sound' ? 'level' : 'tempo';
  return { row, step, cells: loop ? 'slots' : row === 'step' ? 'loops' : 'steps', move, knob8, row8, own, chip: `${slots ? 'SLOTS · ' : ''}MOVE ⇢ ${label}`, word };
}

// ---- RD-6 the step page: what the 16 cells show and what a click on them, or on a planet, does ----
/**
 * The 16 loop dots of a step (the step page's cells, and the Move's step LEDs while a step is looked at, P7): loop
 * `from + i` plays (true), rests (false) or depends on the moment (null: fill, pre / not pre); `now` = the dot of the loop
 * playing (-1 stopped). A step that never plays (off, or masked) plays on no loop.
 * @param {{ cond?: string, on: boolean, loopN?: number|null, playing?: boolean }} s
 */
export function stepLoops({ cond = 'always', on, loopN = null, playing = false }) {
  const now = playing && loopN != null ? loopN : -1, from = loopWindow(now, STEP_BTNS), at = now < 0 ? -1 : now - from;
  const loops = on ? condLoops(cond, STEP_BTNS, from) : Array(STEP_BTNS).fill(false);
  return { from, now: at, loops };
}
/**
 * What a click (or a tap) on cell i does, by what the cells show: steps → cycle the step (off → on → accent → ghost);
 * loops (a step page) → open that cell's step page instead (the mouse never gets stuck on one step, and a dot is never
 * an edit); slots (Loop held on the Move) → nothing. A long-press, a right-click or Alt+click opens the step page in
 * both step and loop cells. A cell past the lane's loop does nothing.
 * @returns {'cycle'|'open'|'none'}
 */
export function cellAction(cells, i, length, long = false) {
  if (cells === 'slots' || cells === 'drift' || i >= length) return 'none';
  return long || cells === 'loops' ? 'open' : 'cycle';
}
/** A tap on a planet (a step with a hit): with a step page latched by the mouse it switches the page to that step;
 *  otherwise it cycles the step as before (I1). (A long-press or right-click always opens its step page: app.js
 *  planetStep, no choice to make.)
 *  @returns {'cycle'|'open'} */
export const planetAction = (stepLatched) => (stepLatched ? 'open' : 'cycle');

// ---- RD-11 drift (behind ?drift): the step LEDs while − is held (Nils's LED table, proposals/nils/answers.md §Q1).
// One source for the Move's lights and the on-screen cells, so what a player reads in the dark is what the page draws ----
/** The drift knobs 1–8 in order: every · amount · gravity · home after · max cycle · coupling lift · humanize · dice repeat. */
export const DRIFT_KEYS = ['evoEvery', 'evoAmount', 'evoGravity', 'evoHome', 'evoMax', 'coupleLift', 'humanize', 'diceRepeat'];
/** The drift knobs that are counts (bars, mutations, loops): one LED and one Move click each. The rest are percentages
 *  (16ths, 2 % a click), and max cycle (16ths of its 64 bars, 2 bars a click). */
export const DRIFT_COUNTS = new Set(['evoEvery', 'evoHome', 'diceRepeat']);
/** LEDs lit (0–16) for drift knob k at its gauge value v: counts light one LED each (every = 8 bars → 8 LEDs, home,
 *  dice repeat), percentages in 16ths (amount ≈ half → 8), max cycle in 16ths of its 64 bars. */
export const driftMeter = (k, v) => Math.max(0, Math.min(16, Math.round(DRIFT_COUNTS.has(k) ? v : k === 'evoMax' ? v / 4 : v / 100 * 16)));
/** What the hands do on the Move, as movewire's events: any of them while − is held (a press, a touch, a turn; not a
 *  release, and not a pad's aftertouch: the pressure of a pad already down, whose press counted if it came under −)
 *  makes the − release a chord's (app.js). A test checks the list against every event movewire emits. */
export const MOVE_HANDS = ['pad', 'step', 'encoder', 'encoderTouch', 'volume', 'wheel', 'wheelTouch', 'wheelPush', 'button'];
/**
 * The 16 step LEDs while − is held. A touched (or just-turned) drift encoder `meter` (0–7) turns them all into its
 * value meter; otherwise LEDs 1–6 are the lanes that evolve, lit in their lane colour, a steady lane (and a missing
 * one) dark (Nils: lit or dark is the whole read; round 1: a dim steady lane read as evolving, A10 0 / 5); 7–8 are dark,
 * and 9–16 count down to the next mutation: 8 LEDs that drain one per ⅛ of "every" (`progress` 0..1 toward the
 * mutation, scene.js genProgress; 0 while stopped, so the bar sits full), all dark while evolve is off (`on`: no
 * mutation is coming).
 * @param {{ evolves?: boolean[], meter?: number, value?: number, progress?: number, on?: boolean }} s
 * @returns {('off'|'lane'|'count'|'meter')[]} 16 symbols; 'lane' at i = lane i evolves
 */
export function driftLeds({ evolves = [], meter = -1, value = 0, progress = 0, on = true } = {}) {
  const out = Array(STEP_BTNS).fill('off');
  if (meter >= 0) { const n = driftMeter(DRIFT_KEYS[meter], value); for (let i = 0; i < n; i++) out[i] = 'meter'; return out; }
  for (let i = 0; i < 6 && i < evolves.length; i++) if (evolves[i]) out[i] = 'lane';
  const lit = on ? 8 - Math.floor(Math.max(0, Math.min(progress, 0.999)) * 8) : 0;
  for (let i = 0; i < lit; i++) out[8 + i] = 'count';
  return out;
}
