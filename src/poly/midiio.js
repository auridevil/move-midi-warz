// Orbits ↔ the rest of the studio: lane hits as MIDI notes, MIDI clock out (24 PPQ: one per MIDI_DIV master ticks),
// and MIDI clock in (follow tempo, optionally start/stop). Uses the page's Web MIDI access; ports are picked
// by name so the choice survives reloads. The Move's own port is never used as an output while it's in
// control mode: notes there would repaint its pads instead of playing anything.

import { MIDI_DIV } from './lanes.js';
import { ARTIC_MAX } from './voices.js';

export const DEFAULT_NOTES = [36, 38, 42, 39, 46, 49];   // GM drums: kick, snare, closed hat, clap, open hat, crash (L2 lanes 5–6)
/** A7: the CC each automated key is exported on (0 = not exported): tone = filter cutoff (74), snap = attack (73), color
 *  = timbre (71), decay = release-ish (75), tune 16 and drive 17 (general purpose), level = volume (7), pan (10), send =
 *  effects depth (91). Editable in the MIDI drawer. */
export const AUTO_CC = { tone: 74, decay: 75, snap: 73, color: 71, tune: 16, drive: 17, level: 7, pan: 10, send: 91 };
export const AUTO_CC_KEYS = Object.keys(AUTO_CC);
/** Saved CC numbers back in range: whole numbers 0..119 (120+ are channel mode messages), the default for anything missing. */
export const ccFrom = (o) => Object.fromEntries(AUTO_CC_KEYS.map(k => [k, Number.isFinite(+o?.[k]) && o?.[k] !== null ? Math.max(0, Math.min(119, Math.round(+o[k]))) : AUTO_CC[k]]));
/**
 * L3 strokes on MIDI: a lane's first stroke plays its own note, the others the next notes up that no lane's note and no
 * earlier stroke takes on the same channel (at the top of the range, the next free ones down), so a conga slap never
 * plays another lane's drum (with the default notes a conga on 36 is 36 / 37 / 40: 38 and 39 are lanes 2 and 4). Worked
 * out over the whole note map, whatever the voices, so live out, the export and every slot agree.
 * lanes: [{ note, ch }] → per lane [note of stroke 0, 1, 2].
 */
export function strokeNotes(lanes) {
  const at = (ch, n) => ch * 128 + n, taken = new Set(lanes.map(l => at(l.ch, l.note)));
  const free = (ch, n, dir) => { while (n >= 0 && n <= 127 && taken.has(at(ch, n))) n += dir; return n >= 0 && n <= 127 ? n : -1; };
  return lanes.map((l) => {
    const row = [l.note];
    while (row.length <= ARTIC_MAX) {
      let n = free(l.ch, Math.max(...row) + 1, 1); if (n < 0) n = free(l.ch, Math.min(...row) - 1, -1); if (n < 0) n = l.note;   // up; past 127, down
      taken.add(at(l.ch, n)); row.push(n);
    }
    return row;
  });
}
export const FOLLOW_MODES = ['off', 'tempo', 'transport', 'lock'];
/** P5: the MIDI out offset range, ms either way. */
export const LATENCY_MAX = 50;
/**
 * P5 auto offset, ms: how long after its scheduled time a hit leaves the speakers = the output's latency (Tone's
 * context is a standardized-audio-context wrapper with no `outputLatency`: the native context behind it has it) + the
 * master's look-ahead `masterSec` (compressor + limiter, measured by the app).
 */
export function autoLatencyMs(raw, masterSec = 0) {
  const out = raw?.outputLatency ?? raw?._nativeAudioContext?.outputLatency;
  return ((Number.isFinite(out) ? out : 0) + (Number.isFinite(masterSec) ? masterSec : 0)) * 1000;
}
/**
 * Phase lock: `drift` = our master tick − the incoming clock's tick at the same moment (positive = we're ahead).
 * Small drift trims the tempo (a gentle PLL, at most ±4 %); a big one (a missed start, a jump) snaps the clock.
 */
export function phaseCorrection(drift) {
  if (Math.abs(drift) >= 3) return { jump: -Math.round(drift), trim: 1 };
  return { jump: 0, trim: 1 - Math.max(-0.04, Math.min(0.04, drift * 0.02)) };
}

/**
 * Clock-in tempo follower: feed it every 0xF8 timestamp (ms); it returns the new bpm (a float, 0.01 resolution) only
 * when the tempo really moved, else null. Clocks are messier than they look, and each mess has its own answer:
 *  - jitter: the bpm is a least-squares fit over up to `window` ticks (16 beats); a change has to beat `k` standard
 *    errors of that fit, so a young window speaks up for big moves only. Its error bars come from the measured
 *    jitter (a robust spread of the residuals, kept between restarts) and grow when the residuals hang together
 *    (a wandering clock, a timestamp grid): independent jitter averages out, a drift does not.
 *  - a late burst, a bad first tick: least squares on the inliers only (Theil–Sen first, while the window is young).
 *  - a tick far off the line is held aside. If the clock comes back to the line it was a hiccup and is dropped. If
 *    `run` held ticks form a clean line of another slope, the tempo changed: start from them. A clean line of the
 *    same slope (a latency step, a lost tick, a timestamp grid wrapping) is the same tempo, shifted: start from them
 *    and widen the jitter to that shift, so a grid that keeps wrapping is taken as jitter from then on.
 *  - a pause (more than 3 ticks of silence) starts afresh; the bpm is kept, so the same tempo after it changes nothing.
 *  - a significant bend in the fit is a ramp: read at the newest tick, in steps that follow the ramp's speed.
 *  - a small leftover offset (under `big`) is corrected only when it holds on one side for `hold` ticks (4 beats),
 *    however late: the first reading comes from half a beat, and a tempo left 0.04 bpm off drifts a sixteenth away
 *    from the master in 10 minutes. Only `settle` (0.005 bpm, under the 0.01 display step) is never a change.
 */
export function makeBpmFollower({ window = 384, first = 12, run = 6, k = 4, settle = 0.005, big = 0.3, hold = 96, zc = 4, floor = 0.25 } = {}) {
  let pts = [], idx = 0, bpm = 0, jit = 2, calibrated = false, held = [], side = 0, slope = 0, cached = null, jumped = false;
  const median = (v) => { const s = Float64Array.from(v).sort(), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const spread = (r) => Math.max(floor, 1.4826 * median(r.map(Math.abs)));   // robust σ of residuals (MAD)
  // least squares t = a + b·x (+ c·x²) over points {x: tick index, t: ms}, x centred: b = ms per tick in the middle,
  // b + 2c·xe at the newest tick
  const fit = (P, quad) => {
    const n = P.length, t0 = P[0].t; let mx = 0; for (const p of P) mx += p.x; mx /= n;
    let s2 = 0, s3 = 0, s4 = 0, sy = 0, sxy = 0, sx2y = 0;
    for (const p of P) { const x = p.x - mx, y = p.t - t0, x2 = x * x; s2 += x2; s3 += x2 * x; s4 += x2 * x2; sy += y; sxy += x * y; sx2y += x2 * y; }
    const S = s4 - s2 * s2 / n - s3 * s3 / s2, c = quad ? (sx2y - s2 * sy / n - s3 * sxy / s2) / S : 0, b = (sxy - s3 * c) / s2, a = (sy - s2 * c) / n;
    return { n, b, c, s2, S, xe: P[n - 1].x - mx, at: (x) => t0 + a + b * (x - mx) + c * (x - mx) ** 2 };
  };
  /** The window's fit without its outliers, the jitter it shows, and how much to widen the error bars for correlation. */
  const robust = (P = pts) => {
    const n = P.length, quad = n >= 24; let at;
    if (n < 48) { const sl = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) sl.push((P[j].t - P[i].t) / (P[j].x - P[i].x)); const b = median(sl), a = median(P.map(p => p.t - b * p.x)); at = (x) => a + b * x; }
    else at = fit(P, quad).at;
    const r0 = P.map(p => p.t - at(p.x)), s0 = spread(r0); let use = P.filter((_, i) => Math.abs(r0[i]) <= 4 * s0); if (use.length < Math.max(4, n * 0.75)) use = P;
    const f = fit(use, quad), r = use.map(p => p.t - f.at(p.x));
    let num = 0, den = 0; for (let i = 0; i < r.length; i++) { den += r[i] * r[i]; if (i) num += r[i] * r[i - 1]; }
    const rho = den > 0 ? Math.min(0.95, Math.max(0, num / den)) : 0;
    return { f, s: spread(r), infl: Math.min(20, (1 + rho) / (1 - rho)) };
  };
  const restart = () => { pts = []; held = []; side = 0; cached = null; jumped = false; };
  const start = (P) => { pts = P.map(({ x, t }) => ({ x, t })); held = []; side = 0; };
  return {
    get bpm() { return bpm; },
    /** Start / Stop / Continue or a follow-mode change: measure afresh, keeping the bpm (the same tempo isn't announced
     *  again) and the jitter (same source). full (a new port) = forget both. */
    reset(full = false) { restart(); if (full) { bpm = 0; jit = 2; calibrated = false; } },
    tick(t) {
      const prevT = held.length ? held[held.length - 1].t : pts.length ? pts[pts.length - 1].t : null;
      if (prevT != null && t - prevT > Math.max(100, 3 * (bpm ? 2500 / bpm : slope || 80))) restart();
      const x = idx++;
      if (pts.length >= (calibrated ? 12 : 48)) {   // the jitter is known once a first window has filled
        const { f } = cached || robust(), n = f.n, r = t - f.at(x), spr = jit * Math.sqrt(1 + 1 / n + (f.xe + 1) ** 2 / f.s2);
        if (Math.abs(r) > 3.5 * spr) {
          if (held.length && Math.sign(r) !== held[0].sg) held = [];
          held.push({ x, t, sg: Math.sign(r) });
          if (held.length >= run) {   // judge the newest `run` held ticks
            const tail = held.slice(-run), pf = fit(tail, false), se = jit * Math.sqrt(12 / (run ** 3 - run));
            const clean = Math.sqrt(tail.reduce((a, q) => a + (q.t - pf.at(q.x)) ** 2, 0) / (run - 2)) <= 2.5 * Math.max(jit, floor);
            if (clean && Math.abs(pf.b - f.b) > 4 * se) { start(tail); jumped = true; }   // a new tempo: from the ticks since
            else if (clean && held.length >= 2 * run) { jit = Math.max(jit, Math.abs(held.reduce((a, q) => a + q.t - f.at(q.x), 0) / held.length) / 3); start(held); }   // same tempo, shifted
            else if (!clean && held.length >= 3 * run) start(tail);   // still messy after 3 runs: start over from the newest
          }
          if (held.length) return null;   // a verdict is pending: no reading meanwhile
        } else { held = []; pts.push({ x, t }); }   // back on the line: whatever was held was a hiccup
      } else pts.push({ x, t });
      cached = null; while (pts.length > window) pts.shift();
      const n = pts.length; if (n < (jumped && bpm ? run : first)) return null; if (n >= first) jumped = false;
      const { f, s, infl } = (cached = robust());
      if (n >= 48) calibrated = true; if (n >= 96) jit += (s - jit) * 0.05; if (s > jit) jit = s;   // the jitter: up at once, down slowly
      if (!bpm && s > 1.5 && n < 48) return null;   // the first reading waits for a clean window (or enough ticks)
      if (jumped && n < first && s > 2 * Math.max(jit, floor)) return null;   // an early reading after a jump only from a clean line
      const vb = jit ** 2 / f.s2 * infl, vc = n >= 24 ? jit ** 2 / f.S * infl : Infinity, ramp = n >= 24 && Math.abs(f.c) > zc * Math.sqrt(vc);
      const p = ramp ? f.b + 2 * f.c * f.xe : f.b, now = 2500 / p, err = now * Math.sqrt(vb + (ramp ? 4 * f.xe * f.xe * vc : 0)) / p; slope = f.b;
      if (!(now > 20 && now < 300)) return null;
      const d = now - bpm, v = Math.round(now * 100) / 100;
      if (bpm && ramp) { const rate = Math.abs(2500 / (p * p) * 2 * f.c * 24); if (Math.abs(d) < Math.max(Math.min(0.75, Math.max(0.15, rate / 2)), k * err)) return null; }   // about two steps per beat
      else if (bpm) {
        if (Math.abs(d) <= Math.max(settle, k * err)) { side = 0; return null; }
        if (Math.abs(d) < big) { side = Math.sign(d) === Math.sign(side) ? side + Math.sign(d) : Math.sign(d); if (Math.abs(side) < hold) return null; }
      }
      side = 0; return v === bpm ? null : (bpm = v);
    },
  };
}

export class PolyMidi {
  constructor({ getAccess, isMovePort = () => false }) {
    this.getAccess = getAccess; this.isMovePort = isMovePort;
    this.out = null; this.outName = ''; this.clockOut = false;
    this.lanes = DEFAULT_NOTES.map((note) => ({ note, ch: 10 })); this.gateMs = 60; this.cc = { ...AUTO_CC };   // cc: A7 export CC per automated key
    // P5 out offset: every scheduled note and clock goes out this many ms later (− = earlier). null = auto: the audio
    // output's latency (autoMs, set by the app), so notes leave when the speakers play the same hit
    this.offsetMs = null; this.autoMs = 0; this.lastClock = 0; this.stopAt = 0;   // when the last clock / start and the last stop leave: a stop goes after the clocks, a start after the stop
    this.inName = ''; this.follow = 'off'; this.input = null; this.onIn = null;
    this.handlers = { tempo: () => {}, start: () => {}, stop: () => {}, tick: () => {} };
    this.extTick = 0;   // incoming clock ticks since start (or since a Song Position Pointer), in MIDI ticks (24 PPQ): the app scales
    this.follower = makeBpmFollower();
  }
  get extBpm() { return this.follower.bpm; }
  outputs() { const a = this.getAccess(); return a ? [...a.outputs.values()] : []; }
  inputs() { const a = this.getAccess(); return a ? [...a.inputs.values()] : []; }
  setOutput(name) {
    this.outName = name || ''; const p = this.outputs().find(o => o.name === name) || null;
    this.out = p && !this.isMovePort(p) ? p : null; return !!this.out || !name;
  }
  setInput(name) {
    if (this.input && this.onIn) this.input.removeEventListener('midimessage', this.onIn);
    this.inName = name || ''; this.input = this.inputs().find(i => i.name === name) || null; this.follower.reset(true);
    if (!this.input) return;
    this.onIn = (e) => this.receive(e.data, e.timeStamp); this.input.addEventListener('midimessage', this.onIn);
  }
  /** Re-resolve ports after the device list changes (plug / unplug). */
  refresh() { this.setOutput(this.outName); if (this.inName && !this.input) this.setInput(this.inName); }
  send(bytes, at) { try { this.out?.send(bytes, at); } catch {} }
  /** P5: the offset in use, whole ms within ±LATENCY_MAX: the manual one, else the output latency. */
  get latencyMs() { return Math.max(-LATENCY_MAX, Math.min(LATENCY_MAX, Math.round(this.offsetMs ?? this.autoMs) || 0)); }
  note(li, vel01, at, artic = null) {   // artic: L3, the stroke (Lane.strokeAt) → its note (strokeNotes)
    if (!this.out) return; at += this.latencyMs; const { ch } = this.lanes[li], note = strokeNotes(this.lanes)[li][artic || 0], st = 0x90 | ((ch - 1) & 15), v = Math.max(1, Math.min(127, Math.round(vel01 * 127)));
    this.send([st, note & 127, v], at); this.send([0x80 | ((ch - 1) & 15), note & 127, 0], at + this.gateMs);
  }
  clock(at) { if (this.out && this.clockOut) this.sendClock(0xF8, at + this.latencyMs); }
  /** Master tick `tick` (any PPQ): a MIDI clock on every MIDI_DIV-th, so 24 per quarter. */
  clockAt(tick, at) { if (tick % MIDI_DIV === 0) this.clock(at); }
  /** Start at `at` + the P5 offset (ahead of the first clock), never before a stop still on its way: a quick stop → start
   *  (a master's, passed on) would start the gear and then stop it. */
  start(at) { if (this.out && this.clockOut) this.sendClock(0xFA, Math.max(at + this.latencyMs, this.stopAt + 1)); }
  /** Stop at `at` (the transport's stop, a Web MIDI timestamp) + the P5 offset like the clocks, and never before a clock
   *  already scheduled: the transport stops a look-ahead after the press and clocks until then. */
  stop(at = 0) { if (this.out && this.clockOut) { this.stopAt = Math.max(at + this.latencyMs, this.lastClock); this.send([0xFC], this.stopAt); } }
  sendClock(s, at) { this.lastClock = Math.max(this.lastClock, at); this.send([s], at); }
  /** Follow mode change: the ticks heard before (or while 'off') say nothing about now. */
  setFollow(mode) { this.follow = FOLLOW_MODES.includes(mode) ? mode : 'off'; this.follower.reset(); }
  /** Clock in: a smoothed float bpm (tempo handler only on a real change), plus start / stop when following the transport. */
  receive(data, t) {
    const s = data[0]; if (this.follow === 'off') return;
    if (s === 0xF8) {
      if (this.follow === 'lock') this.handlers.tick(this.extTick, t); this.extTick++;
      const bpm = this.follower.tick(t); if (bpm != null) this.handlers.tempo(bpm);
    } else if (s === 0xFA || s === 0xFB || s === 0xFC) {
      // the master stopped or (re)started: its clock may have paused, so measure afresh (in every mode); only the
      // transport modes start and stop with it
      this.follower.reset(); if (this.follow === 'tempo') return;
      if (s === 0xFC) this.handlers.stop(); else { if (s === 0xFA) this.extTick = 0; this.handlers.start(); }
    } else if (s === 0xF2) this.extTick = ((data[2] << 7) | data[1]) * 6;   // Song Position Pointer: sixteenths → 24 PPQ ticks
  }
  toJSON() { const { outName, clockOut, lanes, gateMs, inName, follow, offsetMs, cc } = this; return { outName, clockOut, lanes, gateMs, inName, follow, offsetMs, cc }; }
  fromJSON(o) {
    if (!o) return; Object.assign(this, { outName: o.outName || '', clockOut: !!o.clockOut, gateMs: o.gateMs || 60, inName: o.inName || '', follow: FOLLOW_MODES.includes(o.follow) ? o.follow : 'off' });
    this.offsetMs = Number.isFinite(o.offsetMs) ? Math.max(-LATENCY_MAX, Math.min(LATENCY_MAX, Math.round(o.offsetMs))) : null;   // older settings: auto
    if (Array.isArray(o.lanes)) this.lanes = DEFAULT_NOTES.map((n, i) => ({ note: o.lanes[i]?.note ?? n, ch: o.lanes[i]?.ch ?? 10 }));
    this.cc = ccFrom(o.cc);   // older settings: the defaults
  }
}
