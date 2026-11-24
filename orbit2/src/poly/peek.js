// RD-5 / RD-12 the peek's timing, apart from the DOM (app.js paintPeek draws it) so its orderings can be tested. A hand
// on a knob (a Move encoder touched or turned, a drag, keyboard focus) peeks that knob while it holds it and `ms` after
// the last hand lets go. A kit change borrows the peek for `ms`, over a held knob too (it is the newest thing the hands
// did), and a hand that comes to a knob takes it back. The knob and the kit each have their own timer: with one shared
// timer a kit change cancelled a released knob's hide, and a let-go the kit's, and either peek stayed on screen (RD-12
// review round 1).
export class Peek {
  constructor({ ms, paint = () => {}, timers = globalThis }) {
    this.ms = ms; this.paint = paint; this.timers = timers;
    this.slot = -1; this.el = null; this.why = new Set(); this.kit = null; this.mark = false; this.knobT = 0; this.kitT = 0;
  }
  /** A hand on knob `slot` (why: 'touch' | 'turn' | 'drag' | 'focus'; el: the knob a drag or the focus opened it for). */
  at(slot, why, el = null) {
    this.timers.clearTimeout(this.knobT); this.timers.clearTimeout(this.kitT);
    this.kit = null; this.slot = slot; this.el = el; this.why.add(why); this.paint();
  }
  /** That hand lets go: the knob stays peeked `ms` after the last one. */
  off(why) {
    this.why.delete(why); if (this.why.size) return;
    this.timers.clearTimeout(this.knobT);
    this.knobT = this.timers.setTimeout(() => { if (!this.why.size) { this.slot = -1; this.el = null; this.paint(); } }, this.ms);
  }
  /** A kit change (any route): "kit · name" for `ms`. */
  kitChange(name) {
    this.timers.clearTimeout(this.kitT); this.kit = name; this.paint();
    this.kitT = this.timers.setTimeout(() => { this.kit = null; this.paint(); }, this.ms);
  }
  /** What it shows now: the kit while it borrows the peek, else the knob a hand holds (or let go of under `ms` ago). */
  get shows() { return this.kit ? { kit: this.kit } : this.slot >= 0 || this.el ? { slot: this.slot, el: this.el } : null; }
}
