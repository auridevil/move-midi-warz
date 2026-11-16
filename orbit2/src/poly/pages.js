// The Move's view of a pattern: which steps the pad rows and the step buttons show (L5 pages), which lanes the four pad
// rows are (L2 window), what a track button selects, and which step a held step button holds. Pure (no DOM, no MIDI),
// so the rules are unit-tested; app.js keeps one MovePages and paints the LEDs from it.
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
export function resolvePage({ latch = 'rhythm', latchStep = -1, back = 'rhythm', shift = false, kbdShift = false, held = null, touch = false, loop = false } = {}) {
  // a step held but not yet looked at may still be a tap: it owns nothing (no page flashes) unless a knob is touched
  const holds = !!held && (held.looked || touch), quiet = !!held && !holds;
  // what the Move's knobs edit (app.js 'encoder': a held step makes 1–7 its locks and 8 its condition, + Shift repeats)
  const move = held ? 'step' : shift ? 'sound' : 'rhythm', knob8 = held ? (shift ? 'repeats' : 'condition') : shift ? 'level' : 'tempo';
  const owns = holds || (!quiet && (shift || touch)), seen = holds ? 'step' : shift && !held ? 'sound' : 'rhythm';   // seen: the Move's page as drawn
  const mine = latch === 'step' && latchStep < 0 ? back : latch, screen = kbdShift && mine !== 'step' ? 'sound' : mine;
  const row = owns ? seen : screen, step = row === 'step' ? (owns ? held.step : latchStep) : -1;
  // T1a / the quick tap: until the step is looked at, the chip says what it said before it went down
  const label = holds ? `STEP ${held.step + 1}${shift ? ' ⇧' : ''}` : seen === 'sound' ? 'SOUND ⇧' : 'RHYTHM';
  const own = owns || (row === seen && seen !== 'step');
  const word = row === 'step' ? `step ${step + 1}${owns ? ` · held on Move${shift ? ' ⇧' : ''}` : ''}` : row === 'sound' && shift && owns ? 'sound ⇧' : row;
  return { row, step, cells: loop ? 'slots' : row === 'step' ? 'loops' : 'steps', move, knob8, own, chip: `MOVE ⇢ ${label}`, word };
}
