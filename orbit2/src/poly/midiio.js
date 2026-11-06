// Orbits ↔ the rest of the studio: lane hits as MIDI notes, MIDI clock out (24 PPQ, from the master clock),
// and MIDI clock in (follow tempo, optionally start/stop). Uses the page's Web MIDI access; ports are picked
// by name so the choice survives reloads. The Move's own port is never used as an output while it's in
// control mode: notes there would repaint its pads instead of playing anything.

export const DEFAULT_NOTES = [36, 38, 42, 39];   // GM drums: kick, snare, closed hat, clap
export const FOLLOW_MODES = ['off', 'tempo', 'transport', 'lock'];
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
 * when the tempo really moved, else null. The bpm is fitted over the last `window` ticks (24 = a beat), and a
 * change smaller than `hysteresis` bpm is jitter, not a tempo change: 127.5 bpm with ±1 ms jitter stays 127.5.
 */
export function makeBpmFollower({ window = 96, minTicks = 48, hysteresis = 0.3, settle = 0.05 } = {}) {
  let times = [], bpm = 0, side = 0;
  return {
    get bpm() { return bpm; },
    /** Start / Continue: measure afresh, but keep the bpm so the same tempo isn't re-announced. full = forget it too. */
    reset(full = false) { times = []; side = 0; if (full) bpm = 0; },
    tick(t) {
      times.push(t); if (times.length > window + 1) times.shift();
      const n = times.length - 1; if (n < minTicks) return null;
      // least-squares slope (ms per tick) over the whole window: jitter on single ticks averages out, unlike first→last
      let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i <= n; i++) { const y = times[i] - times[0]; sx += i; sy += y; sxx += i * i; sxy += i * y; }
      const k = n + 1, msPerTick = (k * sxy - sx * sy) / (k * sxx - sx * sx), now = 60000 / 24 / msPerTick;
      if (!(now > 20 && now < 300)) return null;
      // a small offset that stays on one side for a whole window is real (the end of a ramp), jitter flips sides
      const d = now - bpm; side = Math.abs(d) >= settle ? (Math.sign(d) === Math.sign(side) ? side + Math.sign(d) : Math.sign(d)) : 0;
      if (bpm && Math.abs(d) < hysteresis && Math.abs(side) < window) return null;
      side = 0; return (bpm = Math.round(now * 100) / 100);
    },
  };
}

export class PolyMidi {
  constructor({ getAccess, isMovePort = () => false }) {
    this.getAccess = getAccess; this.isMovePort = isMovePort;
    this.out = null; this.outName = ''; this.clockOut = false;
    this.lanes = DEFAULT_NOTES.map((note) => ({ note, ch: 10 })); this.gateMs = 60;
    this.inName = ''; this.follow = 'off'; this.input = null; this.onIn = null;
    this.handlers = { tempo: () => {}, start: () => {}, stop: () => {}, tick: () => {} };
    this.extTick = 0;   // incoming clock ticks since start (or since a Song Position Pointer)
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
  note(li, vel01, at) {
    if (!this.out) return; const { note, ch } = this.lanes[li], st = 0x90 | ((ch - 1) & 15), v = Math.max(1, Math.min(127, Math.round(vel01 * 127)));
    this.send([st, note & 127, v], at); this.send([0x80 | ((ch - 1) & 15), note & 127, 0], at + this.gateMs);
  }
  clock(at) { if (this.out && this.clockOut) this.send([0xF8], at); }
  start(at) { if (this.out && this.clockOut) this.send([0xFA], at); }
  stop() { if (this.out && this.clockOut) this.send([0xFC]); }
  /** Clock in: a smoothed float bpm (tempo handler only on a real change), plus start / stop when following the transport. */
  receive(data, t) {
    const s = data[0]; if (this.follow === 'off') return;
    if (s === 0xF8) {
      if (this.follow === 'lock') this.handlers.tick(this.extTick, t); this.extTick++;
      const bpm = this.follower.tick(t); if (bpm != null) this.handlers.tempo(bpm);
    } else if (this.follow !== 'tempo' && (s === 0xFA || s === 0xFB)) { if (s === 0xFA) this.extTick = 0; this.follower.reset(); this.handlers.start(); }
    else if (this.follow !== 'tempo' && s === 0xFC) this.handlers.stop();
    else if (s === 0xF2) this.extTick = ((data[2] << 7) | data[1]) * 6;   // Song Position Pointer: sixteenths → 24 PPQ ticks
  }
  toJSON() { const { outName, clockOut, lanes, gateMs, inName, follow } = this; return { outName, clockOut, lanes, gateMs, inName, follow }; }
  fromJSON(o) {
    if (!o) return; Object.assign(this, { outName: o.outName || '', clockOut: !!o.clockOut, gateMs: o.gateMs || 60, inName: o.inName || '', follow: FOLLOW_MODES.includes(o.follow) ? o.follow : 'off' });
    if (Array.isArray(o.lanes)) this.lanes = DEFAULT_NOTES.map((n, i) => ({ note: o.lanes[i]?.note ?? n, ch: o.lanes[i]?.ch ?? 10 }));
  }
}
