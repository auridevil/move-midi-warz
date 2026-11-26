// RD-13: when evolve fires. Pure helpers, no DOM, no clock: the master clock (app.js onTick) and the scene's countdown
// (the sun numeral, the generative arc, the caption) both ask nextEvolveTick, so the number on screen and the mutation
// can't disagree; HeardCycle hands the countdown the cycle the ear is in while the clock runs ahead.

export const EVOLVE_SYNCS = ['bars', 'cycle'];
/** Old settings (no `sync`, or anything unknown) are the bars mode: nothing changes for them. */
export const syncFrom = (v) => (v === 'cycle' ? 'cycle' : 'bars');

/**
 * The next master tick (strictly after `tick`, which may be fractional) where evolve fires.
 *  - 'cycle': the next tick where the whole pattern lines up again, i.e. (t − origin) is a multiple of `cycle`
 *    (Machine.cycleTicks(cycleOpts())). That is the tick the sun numeral reaches 0 and the bloom fires: the pattern's
 *    origin is what every lane counts from. The re-sync rule: after a mutation that changes the cycle, the very next call
 *    already reads the NEW cycle, so the countdown re-syncs at once to the new pattern's next alignment, counted from the
 *    origin like the lanes, the bloom and the slots' "full cycle" (counting a whole new cycle from the mutation tick would
 *    land where nothing meets). So the first gap can be shorter than one new cycle, never longer.
 *  - 'bars': the next multiple of every × bar ticks, in one constant meter. Not read by the app: the bars mode's clock
 *    and its countdown count the bar lines as they come (onTick's barN, scene.js genClock / genProgress), so a meter
 *    change keeps its own count; it is the task's signature, and the tests' steady-meter reference.
 * Infinity when there is nothing to count (no cycle, no bar).
 */
export function nextEvolveTick(tick, cycle, mode = 'bars', every = 1, bar = 0, origin = 0) {
  if (mode === 'cycle') return cycle > 0 ? origin + (Math.floor((tick - origin) / cycle) + 1) * cycle : Infinity;
  const span = Math.max(1, every | 0) * bar;
  return span > 0 ? (Math.floor(tick / span) + 1) * span : Infinity;
}

/** Cycle mode, on the clock: does evolve fire on tick t? Never on the origin itself: Play's downbeat, a slot that restarts
 *  the lanes, a new meter's first bar line (round 1: those moved the origin to t and fired with the sun mid-count). A
 *  pattern that starts plays up to its first alignment before evolve changes it. */
export const evolveDue = (t, cycle, origin = 0) => t > origin && nextEvolveTick(t - 1, cycle, 'cycle', 1, 0, origin) === t;

/** How far the clock is toward the next cycle mutation, 0..1 (0 right after one, then growing; `tick` counts from the
 *  pattern's origin): the generative arc's crawl and the drift LEDs, from the same nextEvolveTick as the sun. */
export const cycleProgress = (tick, cycle) => (cycle > 0 ? 1 - (nextEvolveTick(tick, cycle, 'cycle') - tick) / cycle : 0);

/**
 * The { cycle, origin } the countdown counts with, as the ear has them. The clock changes them a lookahead ahead of the
 * speakers (a mutation, a slot, a new meter's first bar); the display keeps what was in force until the audio time of
 * each change is heard, so the sun, the arc and the caption never count to a tick the clock has already left (round 1:
 * a cycle-changing mutation flipped the sun 40–100 ms before it was heard). Several changes can wait at once (a short
 * cycle): each brings in the state the next one replaced.
 */
export class HeardCycle {
  constructor() { this.q = []; }
  /** The clock changed the cycle or the origin at audio time `at`; `was` = { cycle, origin } in force before it. */
  hold(was, at) { this.q.push({ was, at }); if (this.q.length > 32) this.q.shift(); }
  /** What to count with at heard audio time `now`; `live()` = the model's own, once every change has been heard. */
  read(now, live) { while (this.q.length && this.q[0].at <= now) this.q.shift(); return this.q.length ? this.q[0].was : live(); }
  /** Play or stop: nothing is in flight. */
  clear() { this.q.length = 0; }
}
