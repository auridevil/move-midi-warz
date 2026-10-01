// Stochastic field: 32 cells (the Move's pads). Energy is injected by pads, diffuses to neighbours, decays,
// and each tick every cell may FIRE a note with probability ~ density × gate × energy. Pure logic, no audio.
export const ROWS = 4, COLS = 8, N = ROWS * COLS;
const INTERVALS = [-12, -7, -5, -3, 3, 5, 7, 12];
const SCALES = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 3, 5, 7, 9, 10], [0, 1, 4, 5, 7, 8, 11], [0, 2, 4, 6, 8, 10], [0, 3, 6, 9]];
export const FAMILIES = ['membrane', 'pluck', 'fm', 'am', 'metal', 'noise'];

export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Field {
  constructor(rng = Math.random) {
    this.rng = rng; this.energy = new Float32Array(N); this.pinned = new Set(); this.age = new Float32Array(N);
    this.params = { entropy: 0.12, diffusion: 0.16, decay: 0.06, density: 0.45, morph: 0.4, crush: 0.08, space: 0.35, arp: 0.5 };
    this.gate = new Array(16).fill(1); this.root = 48; this.octave = 0; this.scale = SCALES[1]; this.drift = 0; this.tick = 0; this.lastFires = [];
  }
  idx(r, c) { return r * COLS + c; }
  neighbours(i) { const r = Math.floor(i / COLS), c = i % COLS, n = []; if (r > 0) n.push(i - COLS); if (r < ROWS - 1) n.push(i + COLS); if (c > 0) n.push(i - 1); if (c < COLS - 1) n.push(i + 1); return n; }
  inject(i, amount = 1) { this.energy[i] = Math.min(1.5, this.energy[i] + amount); this.age[i] = 0; }
  pin(i, on = !this.pinned.has(i)) { on ? this.pinned.add(i) : this.pinned.delete(i); if (on) this.energy[i] = 1; }
  reset() { this.energy.fill(0); this.pinned.clear(); this.lastFires = []; }
  /** Note for a cell: row = octave-ish band, column = scale degree, plus global drift and entropy jumps. */
  /** pure = the cell's own note, no entropy jump (used for the immediate answer to a tap and for the arp). */
  noteFor(i, pure = false) {
    const r = Math.floor(i / COLS), c = i % COLS, s = this.scale;
    let n = this.root + 12 * (this.octave + r - 1) + s[c % s.length] + 12 * Math.floor(c / s.length) + this.drift;
    if (!pure && this.rng() < this.params.entropy) n += INTERVALS[Math.floor(this.rng() * INTERVALS.length)];
    return Math.max(12, Math.min(108, Math.round(n)));
  }
  familyFor(i, pure = false) { const r = Math.floor(i / COLS); const base = FAMILIES[r === 0 ? 0 : r === 1 ? 1 : r === 2 ? 2 : 3]; return !pure && this.rng() < this.params.entropy * 0.6 ? FAMILIES[Math.floor(this.rng() * FAMILIES.length)] : base; }
  /** Cells charged enough to take part in the arp, as sorted notes (pinned first, max 8). */
  arpNotes(threshold = 0.22) {
    const cells = []; for (let i = 0; i < N; i++) if (this.pinned.has(i) || this.energy[i] > threshold) cells.push(i);
    return cells.sort((a, b) => this.energy[b] - this.energy[a]).slice(0, 8).map(i => this.noteFor(i, true)).sort((a, b) => a - b);
  }
  setOctave(o) { this.octave = Math.max(-3, Math.min(3, Math.round(o))); return this.octave; }
  mutate() { // the scale itself drifts, slowly, like a bad memory
    if (this.rng() < this.params.entropy * 0.15) this.scale = SCALES[Math.floor(this.rng() * SCALES.length)];
    if (this.rng() < 0.1) this.drift = Math.max(-7, Math.min(7, this.drift + (this.rng() < 0.5 ? -1 : 1)));
  }
  /** One tick. Returns the fires: [{ cell, note, vel, family }]. */
  step() {
    const { diffusion, decay, density } = this.params; const e = this.energy; const next = new Float32Array(N);
    for (let i = 0; i < N; i++) { const nb = this.neighbours(i); let avg = 0; for (const j of nb) avg += e[j]; avg /= nb.length; next[i] = (e[i] + diffusion * (avg - e[i])) * (1 - decay); if (this.pinned.has(i)) next[i] = Math.max(next[i], 1); }
    this.energy = next;
    const g = this.gate[this.tick % 16]; const fires = [];
    for (let i = 0; i < N; i++) {
      const p = density * g * Math.pow(Math.min(1, this.energy[i]), 1.4);
      if (this.energy[i] > 0.03 && this.rng() < p) { const vel = Math.min(1, 0.3 + this.energy[i] * 0.7); fires.push({ cell: i, note: this.noteFor(i), vel, family: this.familyFor(i) }); this.energy[i] *= 0.55; }
      this.age[i] += 1;
    }
    this.mutate(); this.tick++; this.lastFires = fires; return fires;
  }
  totalEnergy() { let s = 0; for (const v of this.energy) s += v; return s; }
}
