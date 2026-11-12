// Live performance on the Move (ORBIT2-11): the rules that decide when a mute, a fill or a destructive button takes
// effect. Pure (no DOM, no MIDI, no timers), so they are unit-tested; app.js owns one of each and calls them from the
// Move handlers, the on-screen controls and the master clock.

import { condPasses } from './lanes.js';

/**
 * P7: which of `n` loops, from loop `from` (0 = loop 1), a step with condition `cond` plays on, for the step buttons
 * while it is held: true / false, or null where it depends on the moment (fill, pre / not pre).
 */
export function condLoops(cond, n = 16, from = 0) {
  const live = cond === 'fill' || cond === 'not fill' || cond === 'pre' || cond === 'not pre';
  return Array.from({ length: n }, (_, i) => (live ? null : condPasses(cond, from + i)));
}
/** P7: the first loop of the window of `n` the step buttons show: the one holding loop `now` (0-based; < 0 = stopped,
 *  loops 1–n), so the white "now" marker always sits on its own loop (loop 17 is button 1 of loops 17–32). */
export const loopWindow = (now, n = 16) => (now > 0 ? now - (now % n) : 0);

/**
 * P6 master filter, one knob x in −1…1: left = low-pass from the top of the band (Nyquist: the biquad is a plain wire
 * there) down to 200 Hz, right = high-pass from 20 Hz up to 6 kHz, centre = both open (high-pass at 0 Hz: a wire too),
 * so "off" colours nothing. Exponential, so equal turns sound like equal steps. → { lp, hp } in Hz.
 */
export const FX_LP_MIN = 200, FX_HP_MIN = 20, FX_HP_MAX = 6000;
export function fxFreqs(x, sampleRate = 44100) {
  const nyq = sampleRate / 2;
  return { lp: x < 0 ? nyq * Math.pow(FX_LP_MIN / nyq, -x) : nyq, hp: x > 0 ? FX_HP_MIN * Math.pow(FX_HP_MAX / FX_HP_MIN, x) : 0 };
}
/** One click of the Move wheel on the filter: 4 % per click, and a stop at the centre on the way across (turning
 *  through "off" lands on it first, so it is easy to find on stage). Rounded to 1 %. */
export function stepFilter(x, delta, per = 0.04) {
  const n = Math.max(-1, Math.min(1, Math.round((x + delta * per) * 100) / 100));
  return x !== 0 && Math.sign(n) !== Math.sign(x) ? 0 : n;
}

/** P1: how long Capture / Delete must be held to act without Shift. */
export const HOLD_MS = 600;

/**
 * P2 mutes that wait for the next bar line ("mute on next bar"). A lane waits for the mute it was asked for (muted or
 * not), not for a flip: a slot or a chain coming in on the same bar line, or evolve going home, can change the lane's
 * mute in between, and the bar line still lands what was asked. toggle() queues it (again before the bar line = take it
 * back); apply() at the bar line (or at once, on stop) sets every waiting lane and empties the queue. Mutes are
 * performance moves: `lane.muted` stays out of undo (perfKey).
 */
export class MuteQueue {
  constructor() { this.lanes = new Map(); }   // lane index → the mute it gets on the bar line
  has(li) { return this.lanes.has(li); }
  /** The mute lane li waits for (true = muted), or undefined. */
  target(li) { return this.lanes.get(li); }
  get size() { return this.lanes.size; }
  /** Queue lane li to become `muted` on the bar line, or take it back if it already waits. Returns true when it now waits. */
  toggle(li, muted) { if (this.lanes.delete(li)) return false; this.lanes.set(li, !!muted); return true; }
  /** The bar line: every waiting lane of `lanes` gets its mute, the queue empties. Returns the lanes that changed. */
  apply(lanes) {
    const out = []; for (const [li, muted] of [...this.lanes].sort((a, b) => a[0] - b[0])) if (lanes[li] && lanes[li].muted !== muted) { lanes[li].muted = muted; out.push(li); }
    this.lanes.clear(); return out;
  }
  /** Lanes a pattern no longer has (6 → 4, a slot) drop out of the queue. */
  trim(n) { for (const li of this.lanes.keys()) if (li >= n) this.lanes.delete(li); }
  clear() { this.lanes.clear(); }
  toJSON() { return Object.fromEntries(this.lanes); }   // { lane: muted }, for a look from the console
}

/**
 * P3 fill latch (Shift + Layout): fill for the next whole bar, hands free. 'off' → arm() → 'armed' → the next bar line
 * → 'on' for one bar → the bar line after → 'off'. arm() while armed cancels; while on it does nothing (the bar is
 * already filling). bar() returns true when the latch changed.
 */
export class FillLatch {
  constructor() { this.state = 'off'; }
  get on() { return this.state === 'on'; }
  arm() { if (this.state === 'off') this.state = 'armed'; else if (this.state === 'armed') this.state = 'off'; return this.state; }
  bar() { const was = this.state; this.state = was === 'armed' ? 'on' : 'off'; return was !== this.state; }
  /** Stop or reset: nothing stays latched or armed. */
  clear() { this.state = 'off'; }
}

/**
 * P1 guarded buttons (Capture = randomize all, Delete = clear lane in live mode): with Shift they act at once, alone
 * they act once held HOLD_MS; a shorter tap does nothing but warn. press() → { now, id }: now = act at once (Shift),
 * else start the warning flash and a hold timer that calls fire(name, id). fire() is true once, only for the press
 * that set the timer and only while it is still down (a quick second press is a new hold, not the end of the first).
 * release() says whether the hold was cut short ('cancel') or had already acted (null).
 */
export class Guard {
  constructor() { this.down = new Map(); this.seq = 0; }   // name → { acted, id }
  press(name, shift) { const d = { acted: !!shift, id: ++this.seq }; this.down.set(name, d); return { now: d.acted, id: d.id }; }
  fire(name, id) { const d = this.down.get(name); if (!d || d.acted || d.id !== id) return false; d.acted = true; return true; }
  release(name) { const d = this.down.get(name); this.down.delete(name); return d && !d.acted ? 'cancel' : null; }
  held(name) { return this.down.has(name); }
}
