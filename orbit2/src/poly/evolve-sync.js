// RD-13: when evolve fires. Pure helpers, no DOM, no clock: the master clock (app.js onTick) and the scene's countdown
// (the sun numeral, the generative arc, the caption) both ask nextEvolveTick, so the number on screen and the mutation
// can't disagree.

export const EVOLVE_SYNCS = ['bars', 'cycle'];
/** Old settings (no `sync`, or anything unknown) are the bars mode: nothing changes for them. */
export const syncFrom = (v) => (v === 'cycle' ? 'cycle' : 'bars');

/**
 * The next master tick (strictly after `tick`, which may be fractional) where evolve fires.
 *  - 'cycle': the next tick where the whole pattern lines up again, i.e. (t − origin) is a multiple of `cycle`
 *    (Machine.cycleTicks(cycleOpts())). That is the tick the sun numeral reaches 0 and the bloom fires: the pattern's
 *    origin is what every lane counts from. After a mutation that changes the cycle, the very next call already reads the
 *    NEW cycle, so the countdown re-syncs at once: the next alignment of the new pattern after the mutation tick.
 *  - 'bars': the next multiple of every × bar ticks (bars counted from Play, in one constant meter; the clock itself
 *    counts bar lines, so a meter change keeps its own count: this is for the display of a steady groove).
 * Infinity when there is nothing to count (no cycle, no bar).
 */
export function nextEvolveTick(tick, cycle, mode = 'bars', every = 1, bar = 0, origin = 0) {
  if (mode === 'cycle') return cycle > 0 ? origin + (Math.floor((tick - origin) / cycle) + 1) * cycle : Infinity;
  const span = Math.max(1, every | 0) * bar;
  return span > 0 ? (Math.floor(tick / span) + 1) * span : Infinity;
}

/** Cycle mode, on the clock: does evolve fire on tick t? Never on Play's own downbeat (t 0: nothing has run yet). */
export const evolveDue = (t, cycle, origin = 0) => t > 0 && nextEvolveTick(t - 1, cycle, 'cycle', 1, 0, origin) === t;

/** How far the clock is toward the next cycle mutation, 0..1 (0 right after one, then growing; `tick` counts from the
 *  pattern's origin): the generative arc's crawl and the drift LEDs, from the same nextEvolveTick as the sun. */
export const cycleProgress = (tick, cycle) => (cycle > 0 ? 1 - (nextEvolveTick(tick, cycle, 'cycle') - tick) / cycle : 0);
