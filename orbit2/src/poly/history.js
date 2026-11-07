// Undo / redo of whole-machine snapshots (JSON strings). Edits closer together than `coalesceMs` (a knob being
// turned) fold into one step.
// Performance moves (mute, solo, which lane is selected) are not edits: commit(full, { key }) takes the snapshot
// without them as `key`, and a commit with the same key only refreshes the current step. Undo then keeps the live
// mutes (keepPerf), except across a load (setup, slot, link, init, groove: `load`), which brings back the pattern you
// had, exactly as it was, mutes included.
// Tempo is global, not part of a pattern, so edits never touch it; but a load that sets one (a groove, a setup, a
// link: commit(…, { tempo, was })) is undone with the tempo you had before it, and redone with its own.
export class History {
  constructor({ limit = 100, coalesceMs = 700 } = {}) { this.limit = limit; this.coalesceMs = coalesceMs; this.past = []; this.future = []; this.cur = null; this.t = -Infinity; }
  /** Record the state after an edit. Returns true if it made a step. tempo / was: the load's tempo and the one before. */
  commit(full, { key = full, load = false, now = Date.now(), tempo = null, was = null } = {}) {
    if (this.cur === null) { this.cur = { key, full, load, tempo }; return false; }
    if (key === this.cur.key && tempo == null) { this.cur.full = full; return false; }   // only performance state moved: same step
    if (load || now - this.t > this.coalesceMs || !this.past.length) {
      if (was != null) this.cur.tempo = was;   // the tempo you had when you left this step
      this.past.push(this.cur); if (this.past.length > this.limit) this.past.shift(); this.cur = { key, full, load, tempo };
    } else this.cur = { key, full, load: this.cur.load, tempo: this.cur.tempo };
    this.future = []; this.t = load ? -Infinity : now; return true;   // an edit right after a load is its own step
  }
  /** The current step's state after undo / redo put it back (with the live mutes, when they were kept). */
  refresh(full) { if (this.cur) this.cur.full = full; }
  /** Forget everything before the current step (a first visit: the demo is where your history starts). */
  restart() { this.past = []; this.future = []; this.t = -Infinity; }
  /**
   * → { json, keepPerf, tempo } or null. keepPerf: re-apply the live mutes / solos (false when undoing a load). tempo:
   * the bpm to go back to (null = leave it), only across a load that set one. now.tempo = the tempo right now, which
   * a redo of that load gives back.
   */
  undo(now = {}) {
    if (!this.past.length) return null; const from = this.cur; if (from.tempo != null && now.tempo != null) from.tempo = now.tempo;
    this.future.push(from); this.cur = this.past.pop(); this.t = -Infinity;
    return { json: this.cur.full, keepPerf: !from.load, tempo: from.load && from.tempo != null ? this.cur.tempo : null };
  }
  redo() {
    if (!this.future.length) return null; this.past.push(this.cur); this.cur = this.future.pop(); this.t = -Infinity;
    return { json: this.cur.full, keepPerf: !this.cur.load, tempo: this.cur.load && this.cur.tempo != null ? this.cur.tempo : null };
  }
  get canUndo() { return this.past.length > 0; } get canRedo() { return this.future.length > 0; }
}
