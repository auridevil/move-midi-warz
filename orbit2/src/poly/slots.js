// Pattern slots: 16 saved machines (patterns + sounds + kit), recalled on a musical boundary, optionally
// chained into a song. Pure logic: the app asks `due(tick)` on every master tick and loads what it returns.
import { BAR_TICKS } from './lanes.js';

export const SLOT_COUNT = 16;
export const SWITCH_MODES = ['now', 'bar', 'cycle'];
const BARS = { at: 0, len: BAR_TICKS };   // 4/4 from tick 0
/** Is master tick `tick` a bar line of `bars` ({ at, len })? */
export const onBar = (tick, { at, len }) => (((tick - at) % len) + len) % len === 0;
/**
 * R3 bar lines at master tick `t` when the pattern's bar is `len` ticks long: a new length starts on the next bar line
 * of the old one (a bar is never cut short) and waits in `next` until then; going back to the old length before that
 * cancels it. Pure, and it runs on every tick: returns `bars` itself when nothing changes, else a new { at, len, next }.
 * The app also starts the lanes from `at` (Machine.setOrigin), so the pattern's step 1 is on its bar line.
 */
export function trackBars(bars, t, len) {
  if (len === bars.len) return bars.next ? { ...bars, next: null } : bars;
  const next = bars.next?.len === len ? bars.next : { at: bars.at + Math.ceil((t - bars.at) / bars.len) * bars.len, len };
  return t >= next.at ? { at: next.at, len, next: null } : next === bars.next ? bars : { ...bars, next };
}

export class SlotBank {
  /** @param {{ getItem(k): string|null, setItem(k, v): void }} [store] */
  constructor(store = null, key = 'midi-warz.orbit2.slots.v1') {
    this.store = store; this.key = key;
    this.slots = new Array(SLOT_COUNT).fill(null);
    this.current = -1; this.pending = -1;      // slot playing / waiting for its boundary
    this.chain = []; this.chainPos = 0;        // song: slot indices played in order, `chainBars` bars each
    this.switchAt = 'bar'; this.chainBars = 4; this.barsInSlot = 0;
    // P4 "restart on change": a slot due() loads starts its lanes on step 1 at the tick it came in (`start`), so its
    // first loop is loop 1 again ('first' conditions fire). Off: it picks up where the master count is, as before.
    this.restart = true; this.start = 0;
    try { const o = JSON.parse(store?.getItem(key) || 'null'); if (o) this.fromJSON(o); } catch {}
  }
  persist() { try { this.store?.setItem(this.key, JSON.stringify(this)); } catch {} }
  filled(i) { return !!this.slots[i]; }
  save(i, machineJSON) { if (i < 0 || i >= SLOT_COUNT) return; this.slots[i] = JSON.parse(JSON.stringify(machineJSON)); this.current = i; this.persist(); }
  erase(i) { this.slots[i] = null; this.chain = this.chain.filter(s => s !== i); if (this.current === i) this.current = -1; if (this.pending === i) this.pending = -1; this.persist(); }
  /** Queue a single slot (cancels a running chain). */
  recall(i) { if (!this.filled(i)) return false; this.chain = []; this.pending = i; this.persist(); return true; }
  /** Play these slots in order, `chainBars` bars each, looping. Empty slots are skipped. */
  setChain(list) { this.chain = list.filter(i => this.filled(i)); this.chainPos = 0; this.barsInSlot = 0; if (this.chain.length) this.pending = this.chain[0]; this.persist(); }
  /**
   * Called on every master tick (before the tick's events are computed). Returns the slot index to load
   * now, or -1. `cycleTicks` = ticks until all lanes line up (for switchAt 'cycle'). `bars` = { at, len }: bar lines
   * fall on `at + k × len` (the app moves the anchor when the time signature changes); the lanes count from `at` too,
   * so they line up again at `at + k × cycleTicks`; `origin` = where the lanes count from now (a restarted slot's
   * start: the cycle lines up from there), the bar anchor if not given. A slot loaded here sets `start` = tick.
   */
  due(tick, cycleTicks, bars = BARS, origin = bars.at) {
    const bar = onBar(tick, bars);
    if (bar && tick > 0 && this.current >= 0) this.barsInSlot++;
    // a running chain moves on after `chainBars` bars, always on a bar line, so the song keeps its length
    let i = -1;
    if (this.chain.length > 1 && bar && this.pending < 0 && this.barsInSlot >= this.chainBars) { this.chainPos = (this.chainPos + 1) % this.chain.length; i = this.take(this.chain[this.chainPos]); }
    else if (this.pending >= 0 && (this.switchAt === 'now' || (this.switchAt === 'bar' ? bar : onBar(tick, { at: origin, len: Math.max(1, cycleTicks) })))) i = this.take(this.pending);
    if (i >= 0) this.start = tick;
    return i;
  }
  take(i) { this.pending = -1; this.current = i; this.barsInSlot = 0; return this.filled(i) ? i : -1; }
  /** The next master tick after `tick` where due() loads a slot (a queued one, or the chain moving on), else Infinity.
   *  Pure: live play leaves the steps from there on to the incoming slot (liveTick's cut). */
  nextSwitch(tick, cycleTicks, bars = BARS, origin = bars.at) {
    const next = (n, at = 0) => at + (Math.floor((tick - at) / n) + 1) * n;
    if (this.pending >= 0) return this.switchAt === 'now' ? tick + 1 : this.switchAt === 'bar' ? next(bars.len, bars.at) : next(Math.max(1, cycleTicks), origin);
    if (this.chain.length > 1 && this.current >= 0) return next(bars.len, bars.at) + Math.max(0, this.chainBars - this.barsInSlot - 1) * bars.len;
    return Infinity;
  }
  get(i) { return this.slots[i]; }
  toJSON() { const { slots, current, chain, switchAt, chainBars, restart } = this; return { slots, current, chain, switchAt, chainBars, restart }; }
  fromJSON(o) {
    if (Array.isArray(o.slots)) this.slots = Array.from({ length: SLOT_COUNT }, (_, i) => o.slots[i] || null);
    this.current = o.current ?? -1; this.chain = (o.chain || []).filter(i => this.slots[i]);
    if (SWITCH_MODES.includes(o.switchAt)) this.switchAt = o.switchAt; if (o.chainBars) this.chainBars = o.chainBars; if (typeof o.restart === 'boolean') this.restart = o.restart;   // older banks: on
  }
}
