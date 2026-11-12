// Live performance on the Move (ORBIT2-11): the rules that decide when a mute, a fill or a destructive button takes
// effect. Pure (no DOM, no MIDI, no timers), so they are unit-tested; app.js owns one of each and calls them from the
// Move handlers, the on-screen controls and the master clock.

import { condPasses } from './lanes.js';

/**
 * P7: which of the next `n` loops (loop 1 first) a step with condition `cond` plays on, for the step buttons while it
 * is held: true / false, or null where it depends on the moment (fill, pre / not pre).
 */
export function condLoops(cond, n = 16) {
  const live = cond === 'fill' || cond === 'not fill' || cond === 'pre' || cond === 'not pre';
  return Array.from({ length: n }, (_, loop) => (live ? null : condPasses(cond, loop)));
}

/** P1: how long Capture / Delete must be held to act without Shift. */
export const HOLD_MS = 600;

/**
 * P2 mutes that wait for the next bar line ("mute on next bar"). toggle() queues a lane (a second toggle before the
 * bar line takes it back); bar() at a bar line returns the lanes to flip now and empties the queue. Mutes are
 * performance moves: the app flips `lane.muted`, which stays out of undo (perfKey).
 */
export class MuteQueue {
  constructor() { this.lanes = new Set(); }
  has(li) { return this.lanes.has(li); }
  get size() { return this.lanes.size; }
  /** Queue lane li, or take it back if it already waits. Returns true when it now waits. */
  toggle(li) { if (this.lanes.delete(li)) return false; this.lanes.add(li); return true; }
  /** At a bar line: the lanes to flip (in lane order), queue emptied. */
  bar() { const out = [...this.lanes].sort((a, b) => a - b); this.lanes.clear(); return out; }
  /** Lanes a pattern no longer has (6 → 4, a slot) drop out of the queue. */
  trim(n) { for (const li of this.lanes) if (li >= n) this.lanes.delete(li); }
  clear() { this.lanes.clear(); }
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
