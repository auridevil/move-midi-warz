// Trainer modes. Each mode: start(ctx), stop(), onNote(ev) where ev = {note, velocity, t}.
// ctx = { grid, audio, metronome, ui: { target(text), feedback(text, ok), stats(obj) }, bpm }
import { noteName, INTERVALS, CHORDS, rand } from './theory.js';

class Stats {
  constructor() { this.hits = 0; this.misses = 0; this.streak = 0; this.times = []; }
  hit(ms) { this.hits++; this.streak++; if (ms != null) this.times.push(ms); }
  miss() { this.misses++; this.streak = 0; }
  get avg() { return this.times.length ? Math.round(this.times.reduce((a, b) => a + b, 0) / this.times.length) : null; }
}

class Base {
  constructor(ctx) { this.ctx = ctx; this.stats = new Stats(); this.active = false; }
  start() { this.active = true; this.push(); }
  stop() { this.active = false; this.ctx.grid.clear('target'); }
  push() { this.ctx.ui.stats(this.stats); }
}

/** Note hunt: a single scale note is shown; hit it on the pads as fast as you can. */
export class NoteHunt extends Base {
  start() { super.start(); this.next(); }
  next() {
    const pool = this.ctx.grid.notes();
    let n; do { n = rand(pool); } while (n === this.target && pool.length > 1);
    this.target = n; this.shownAt = performance.now();
    this.ctx.grid.clear('target'); this.ctx.grid.set(n, 'target', true);
    this.ctx.ui.target(noteName(n));
  }
  onNote(ev) {
    if (!this.active || ev.type !== 'noteon') return;
    if (ev.note === this.target) {
      const ms = Math.round(performance.now() - this.shownAt);
      this.stats.hit(ms); this.ctx.grid.flash(ev.note, 'hit');
      this.ctx.ui.feedback(`✓ ${noteName(ev.note)} in ${ms} ms`, true);
      this.push(); setTimeout(() => this.active && this.next(), 250);
    } else {
      this.stats.miss(); this.ctx.grid.flash(ev.note, 'wrong');
      this.ctx.ui.feedback(`✗ ${noteName(ev.note)} — wanted ${noteName(this.target)}`, false); this.push();
    }
  }
}

/** Intervals: given a root pad (lit), play the note N semitones above it. */
export class IntervalDrill extends Base {
  start() { super.start(); this.next(); }
  next() {
    const pool = this.ctx.grid.notes();
    for (let tries = 0; tries < 50; tries++) {
      const root = rand(pool); const [semi, name] = rand(INTERVALS);
      if (pool.includes(root + semi)) { this.root = root; this.target = root + semi; this.name = name; break; }
    }
    this.shownAt = performance.now();
    this.ctx.grid.clear('target'); this.ctx.grid.set(this.root, 'target', true);
    this.ctx.ui.target(`${this.name} ↑ from ${noteName(this.root)}`);
    this.ctx.audio.tone(this.root);
  }
  onNote(ev) {
    if (!this.active || ev.type !== 'noteon') return;
    if (ev.note === this.root) return; // replaying the root is free
    if (ev.note === this.target) {
      const ms = Math.round(performance.now() - this.shownAt);
      this.stats.hit(ms); this.ctx.grid.flash(ev.note, 'hit'); this.ctx.ui.feedback(`✓ ${noteName(ev.note)}`, true);
      this.push(); setTimeout(() => this.active && this.next(), 300);
    } else { this.stats.miss(); this.ctx.grid.flash(ev.note, 'wrong'); this.ctx.ui.feedback(`✗ that's ${noteName(ev.note)}`, false); this.push(); }
  }
}

/** Chords: hold all notes of the named chord at once (any octave on the grid). */
export class ChordDrill extends Base {
  start() { super.start(); this.held = new Set(); this.next(); }
  next() {
    const pool = this.ctx.grid.notes();
    for (let tries = 0; tries < 50; tries++) {
      const root = rand(pool); const [q, ivs] = rand(Object.entries(CHORDS));
      const notes = ivs.map(i => root + i);
      if (notes.every(n => pool.includes(n))) { this.notes = new Set(notes); this.label = `${noteName(root).replace(/-?\d+$/, '')}${q}`; break; }
    }
    this.shownAt = performance.now(); this.ctx.grid.clear('target');
    this.ctx.ui.target(this.label); this.ctx.ui.feedback(`${this.notes.size} notes — hold them together`, null);
  }
  onNote(ev) {
    if (!this.active) return;
    if (ev.type === 'noteon') this.held.add(ev.note); else if (ev.type === 'noteoff') this.held.delete(ev.note);
    if (ev.type !== 'noteon') return;
    const wantPC = new Set([...this.notes].map(n => n % 12));
    const heldPC = new Set([...this.held].map(n => n % 12));
    const extra = [...heldPC].filter(p => !wantPC.has(p));
    if (extra.length) { this.stats.miss(); this.ctx.grid.flash(ev.note, 'wrong'); this.ctx.ui.feedback(`✗ ${noteName(ev.note)} not in ${this.label}`, false); this.push(); return; }
    if ([...wantPC].every(p => heldPC.has(p))) {
      this.stats.hit(Math.round(performance.now() - this.shownAt));
      for (const n of this.held) this.ctx.grid.flash(n, 'hit', 400);
      this.ctx.ui.feedback(`✓ ${this.label}`, true); this.push();
      setTimeout(() => this.active && this.next(), 500);
    }
  }
}

/** Rhythm: metronome runs; hit any pad on each beat. Scores timing deviation in ms. */
export class RhythmDrill extends Base {
  constructor(ctx) { super(ctx); this.window = 120; }
  start() {
    super.start(); this.beats = [];
    this.ctx.metronome.onBeat = (i, wall, accent) => { this.beats.push({ i, wall, hit: false }); this.beats = this.beats.slice(-8); this.ctx.ui.target(accent ? '● 1' : `○ ${(i % 4) + 1}`); };
    this.ctx.metronome.start(this.ctx.bpm());
  }
  stop() { super.stop(); this.ctx.metronome.stop(); this.ctx.metronome.onBeat = null; }
  setBpm(bpm) { this.ctx.metronome.bpm = bpm; }
  onNote(ev) {
    if (!this.active || ev.type !== 'noteon') return;
    const now = performance.now();
    const period = 60000 / this.ctx.bpm();
    // nearest beat: last scheduled or the upcoming one
    let best = null, bestD = Infinity;
    for (const b of this.beats) for (const w of [b.wall, b.wall + period]) { const d = now - w; if (Math.abs(d) < Math.abs(bestD)) { bestD = d; best = b; } }
    if (best == null) return;
    const dev = Math.round(bestD);
    if (Math.abs(dev) <= this.window) { this.stats.hit(Math.abs(dev)); this.ctx.grid.flash(ev.note, 'hit'); this.ctx.ui.feedback(`✓ ${dev > 0 ? '+' : ''}${dev} ms ${dev > 15 ? '(late)' : dev < -15 ? '(early)' : '(tight!)'}`, true); }
    else { this.stats.miss(); this.ctx.grid.flash(ev.note, 'wrong'); this.ctx.ui.feedback(`✗ ${dev > 0 ? '+' : ''}${dev} ms off`, false); }
    this.push();
  }
}

export const MODES = { 'note-hunt': NoteHunt, 'interval': IntervalDrill, 'chord': ChordDrill, 'rhythm': RhythmDrill };
