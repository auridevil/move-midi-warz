// Repeatable randomness. Free dice = Math.random. Locked dice = a hash of (seed, lane, step), so a probabilistic
// groove plays the same every time; `repeat` loops later it may differ again (step is taken modulo length × repeat).
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Deterministic 0..1 from a few integers. */
export function hash01(...xs) { let h = 0x811C9DC5; for (const x of xs) { h ^= (x | 0) + 0x9E3779B9 + (h << 6) + (h >>> 2); h = Math.imul(h, 0x01000193); } return mulberry32(h)(); }
export class Dice {
  constructor() { this.locked = false; this.seed = 1 + Math.floor(Math.random() * 9999); this.repeat = 1; }
  /** rng for a lane's step (probability) — salt separates uses (0 prob, 1 humanize, 2 ratchet…) */
  at(li, step, length, salt = 0) { return this.locked ? hash01(this.seed, li, step % (length * Math.max(1, this.repeat)), salt) : Math.random(); }
  /** rng stream for a whole operation (evolve at bar n, randomize) */
  stream(n = 0) { return this.locked ? mulberry32(this.seed * 7919 + n) : Math.random; }
  reroll() { this.seed = 1 + Math.floor(Math.random() * 9999); return this.seed; }
  toJSON() { const { locked, seed, repeat } = this; return { locked, seed, repeat }; }
  fromJSON(o) { if (o) { this.locked = !!o.locked; this.seed = o.seed | 0 || this.seed; this.repeat = Math.max(1, o.repeat | 0 || 1); } return this; }
}
