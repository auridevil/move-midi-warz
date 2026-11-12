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
