// Pattern slots: 16 saved machines (patterns + sounds + kit), recalled on a musical boundary, optionally
// chained into a song. Pure logic: the app asks `due(tick)` on every master tick and loads what it returns.
import { BAR_TICKS } from './lanes.js';

export const SLOT_COUNT = 16;
export const SWITCH_MODES = ['now', 'bar', 'cycle'];

export class SlotBank {
  /** @param {{ getItem(k): string|null, setItem(k, v): void }} [store] */
  constructor(store = null, key = 'midi-warz.orbit2.slots.v1') {
    this.store = store; this.key = key;
    this.slots = new Array(SLOT_COUNT).fill(null);
    this.current = -1; this.pending = -1;      // slot playing / waiting for its boundary
    this.chain = []; this.chainPos = 0;        // song: slot indices played in order, `chainBars` bars each
    this.switchAt = 'bar'; this.chainBars = 4; this.barsInSlot = 0;
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
   * now, or -1. `cycleTicks` = ticks until all lanes line up (for switchAt 'cycle').
   */
  due(tick, cycleTicks) {
    const bar = tick % BAR_TICKS === 0;
    if (bar && tick > 0 && this.current >= 0) this.barsInSlot++;
    // a running chain moves on after `chainBars` bars, always on a bar line, so the song keeps its length
    if (this.chain.length > 1 && bar && this.pending < 0 && this.barsInSlot >= this.chainBars) { this.chainPos = (this.chainPos + 1) % this.chain.length; return this.take(this.chain[this.chainPos]); }
    if (this.pending < 0) return -1;
    const ok = this.switchAt === 'now' || (this.switchAt === 'bar' ? bar : tick % Math.max(1, cycleTicks) === 0);
    return ok ? this.take(this.pending) : -1;
  }
  take(i) { this.pending = -1; this.current = i; this.barsInSlot = 0; return this.filled(i) ? i : -1; }
  /** The next master tick after `tick` where due() loads a slot (a queued one, or the chain moving on), else Infinity.
   *  Pure: live play leaves the steps from there on to the incoming slot (liveTick's cut). */
  nextSwitch(tick, cycleTicks) {
    const next = (n) => (Math.floor(tick / n) + 1) * n;
    if (this.pending >= 0) return this.switchAt === 'now' ? tick + 1 : next(this.switchAt === 'bar' ? BAR_TICKS : Math.max(1, cycleTicks));
    if (this.chain.length > 1 && this.current >= 0) return next(BAR_TICKS) + Math.max(0, this.chainBars - this.barsInSlot - 1) * BAR_TICKS;
    return Infinity;
  }
  get(i) { return this.slots[i]; }
  toJSON() { const { slots, current, chain, switchAt, chainBars } = this; return { slots, current, chain, switchAt, chainBars }; }
  fromJSON(o) {
    if (Array.isArray(o.slots)) this.slots = Array.from({ length: SLOT_COUNT }, (_, i) => o.slots[i] || null);
    this.current = o.current ?? -1; this.chain = (o.chain || []).filter(i => this.slots[i]);
    if (SWITCH_MODES.includes(o.switchAt)) this.switchAt = o.switchAt; if (o.chainBars) this.chainBars = o.chainBars;
  }
}
