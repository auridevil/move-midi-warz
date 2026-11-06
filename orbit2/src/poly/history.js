// Undo / redo of whole-machine snapshots (JSON strings). Edits closer together than `coalesceMs` (a knob being
// turned) fold into one step.
export class History {
  constructor({ limit = 100, coalesceMs = 700 } = {}) { this.limit = limit; this.coalesceMs = coalesceMs; this.past = []; this.future = []; this.cur = null; this.t = -Infinity; }
  /** Record the state after an edit. Returns true if it was a change. */
  commit(json, now = Date.now()) {
    if (this.cur === null) { this.cur = json; return false; }
    if (json === this.cur) return false;
    if (now - this.t > this.coalesceMs || !this.past.length) { this.past.push(this.cur); if (this.past.length > this.limit) this.past.shift(); }
    this.cur = json; this.future = []; this.t = now; return true;
  }
  undo() { if (!this.past.length) return null; this.future.push(this.cur); this.cur = this.past.pop(); this.t = -Infinity; return this.cur; }
  redo() { if (!this.future.length) return null; this.past.push(this.cur); this.cur = this.future.pop(); this.t = -Infinity; return this.cur; }
  get canUndo() { return this.past.length > 0; } get canRedo() { return this.future.length > 0; }
}
