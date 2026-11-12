// One place that turns lane events into concrete hits (swing, humanize, ratchets), used by live playback, the WAV
// render and the MIDI export, plus the share-link codec. Pure: no audio, no DOM.
import { Machine, PPQ, meterParts, ratchetTimes, ratchetGains, snapTune, TIMBRE_KEYS } from './lanes.js';
import { TUNE_SEMIS } from './voices.js';
import { trackBars } from './slots.js';
import { KITS } from './kits.js';
import { strokeNotes } from './midiio.js';
import { writeMidi } from '../punch/smf.js';

/** Velocity of a hit: a 'vel' lock wins, an accent adds on top. */
export const hitVel = (accent, lock) => lock?.vel != null ? Math.min(1, lock.vel + (accent ? 0.3 : 0)) : accent ? 1 : 0.7;

/**
 * The hits one lane event produces, as offsets in seconds from the tick's time: swing (through the lane's template),
 * the step's nudge lock (±½ step), the lane's push/pull offset (ms) and humanize, symmetric (early and late, up to
 * ±15 ms at 100%). dt can be negative: live play fires early hits from the step before (app.js), renders start early.
 */
export function expandHits(ev, lane, li, { humanize = 0, dice = null, tickSec }) {
  if (!ev?.hit) return [];
  const stepSec = lane.stepTicks() * tickSec, r = dice ? dice.at(li, ev.step, lane.length, 1) : Math.random();
  const base = (ev.swung + (ev.lock?.nudge ?? 0)) * stepSec + (lane.offsetMs || 0) / 1000 + (r - 0.5) * humanize * 0.03, n = Math.max(1, ev.ratchet || 1);
  // G3 velocity humanize: symmetric, up to ±20 % of the hit's own velocity at 100 % (a ghost wobbles as much in dB as an
  // accent), its own dice salt (locked dice repeat it); never over 1
  const vh = lane.velHuman || 0, v0 = hitVel(ev.accent, ev.lock), v = vh ? Math.min(1, v0 * (1 + ((dice ? dice.at(li, ev.step, lane.length, 3) : Math.random()) - 0.5) * 0.4 * vh)) : v0;
  // V4: repeats spaced by the step's curve (closer ones softer: ratchetGains), tune ramping from the hit's own to + ramp
  // on the last; V5 timbre on the lock
  const lock = timbreLock(ev, lane, li, dice), at = ratchetTimes(n, ev.curve), g = ratchetGains(n, ev.curve), ramp = n > 1 ? ev.ramp || 0 : 0;
  return Array.from({ length: n }, (_, k) => ({ dt: base + at[k] * stepSec, vel: (ev.fade ? v * Math.pow(0.72, k) : v) * g[k], accent: ev.accent && k === 0, lock: tuneLock(lane, lock, ramp * (k / Math.max(1, n - 1))), slice: ev.slice }));
}
/**
 * V5: the step lock a hit plays with its timbre moves on top: the slow modulator's offset (ev.mod) and the timbre dice
 * (± half the lane's range, own dice salts 10–12: locked dice repeat them) on whatever the hit would play (its lock, else
 * the lane's sound), kept in 0..1. The step's own lock object is never changed: a new one comes back when anything moved.
 */
export function timbreLock(ev, lane, li, dice) {
  const td = lane.tdice; if (!ev.mod && !td) return ev.lock;
  const o = { ...(ev.lock || {}) }, val = (k) => o[k] ?? lane.sound[k];
  if (ev.mod) o[ev.mod.k] = Math.max(0, Math.min(1, val(ev.mod.k) + ev.mod.d));
  if (td) TIMBRE_KEYS.forEach((k, j) => { if (td[k] > 0) o[k] = Math.max(0, Math.min(1, val(k) + ((dice ? dice.at(li, ev.step, lane.length, 10 + j) : Math.random()) - 0.5) * td[k])); });
  return o;
}
/** V4 / V5: the lock with its tune moved by `add` (a ratchet's pitch ramp) and snapped to the lane's scale on a pitched
 *  voice (voices.js TUNE_SEMIS); untouched when neither applies. */
export function tuneLock(lane, lock, add = 0) {
  const semis = lane.scale !== 'off' ? TUNE_SEMIS[lane.voice] : 0; if (!add && !semis) return lock;
  let t = Math.max(-1, Math.min(1, (lock?.tune ?? lane.tune) + add)); if (semis) t = snapTune(t, lane.scale, semis);
  return { ...(lock || {}), tune: t };
}

/**
 * Live play (G1/G2): the step after master tick `t` when part of it sounds before tick t + 1 (nudged or pushed early;
 * humanize can pull it 15 ms further), else -1. It is decided then, at the last tick that can still schedule it, not a
 * step ahead, so a stop, a mute or a new pattern reaches it as soon as possible. Swing only delays: it is counted in.
 * cut: the tick where a queued slot takes over (SlotBank.nextSwitch). A step from there on is the next slot's: this
 * lane leaves it alone.
 */
export function earlyStep(lane, t, { humanize = 0, tickSec, cut = Infinity }) {
  const st = lane.stepTicks(), step = Math.floor(t / st) + 1, i = step % lane.length; if (step * st >= cut || !lane.hitAt(i)) return -1;
  const lead = -((lane.swingAt(step) + (lane.lockAt(i)?.nudge ?? 0)) * st * tickSec + (lane.offsetMs || 0) / 1000);
  if (lead <= 0) return -1;   // on time or late: it plays from its own tick (±15 ms of humanize fit the lookahead)
  return (step * st - t - 1) * tickSec < lead + humanize * 0.015 ? step : -1;
}

/** A step decided early stays decided, keyed on the master tick it falls on: by its own lane, or, once part of it has
 *  sounded, by whatever steps on that tick now (a lane that replaced it: an undo, a link; the same lane at another
 *  speed, which numbers its steps differently: evolve, the speed gauge), so a moment is never started twice. A lane
 *  replaced or re-timed before anything sounded decides afresh. */
const decided = (pre, lane, step, tick) => pre?.tick === tick && (pre.played || (pre.lane === lane && pre.step === step));
/**
 * Live play, one master tick: per lane { ev (the step at t, or null), hits (its own, dt in s from tick t), early (the
 * early part of a later step, decided now by earlyStep, dt from tick t) }. A step decided early plays on with the same
 * roll at its tick (an accent or a ratchet isn't rolled twice), unless its lane is muted or silenced now (what already
 * sounded stays). A queued slot or chain step is known in advance (cut, SlotBank.nextSwitch): the outgoing lanes leave
 * the steps from there on to it, so a switch plays what the chain render has.
 * ahead: the decisions between ticks, per lane a Map from the master tick a step falls on to its decision. A lane that
 * speeds up inside an early window holds two (the old speed's step, and a step of the new speed that comes first),
 * each used at its own tick only. A restart from tick 0 (the reset button) starts a fresh `ahead`: its keys are old ticks.
 * skip: 'lane:tick' keys of moments a pad just played (live record), on the master tick like `ahead`: neither the
 * early part nor the own hits of what steps there sound; a key goes at its tick.
 * The lanes count their steps from `m.origin` (bar 1 of the pattern's meter); `ahead`, `skip` and `cut` stay on the
 * master tick. The origin only moves on a cut (a new meter's first bar line), so no decision spans a move.
 * V2 coupling is done here, not in Machine.tick: the lift follows the hits that play (a step decided early plays that
 * decision, not the tick's own roll; a pad's recorded hit counts), and a step decided early takes the lift waiting
 * when it is decided, this tick's hits included; a hit after that lifts the lane's following step.
 */
export function liveTick(m, t, ahead, { rng = Math.random, fill = false, dice = null, tickSec, cut = Infinity, skip = null, cycle }) {
  const solo = m.lanes.some(l => l.solo), o = { humanize: m.humanize, dice, tickSec }, o0 = m.origin, cp = m.couple.mode !== 'off', hit = cp ? [] : null, used = cp ? [] : null;
  const outs = m.tick(t, rng, { fill, dice, cycle, couple: false }).map((ev, li) => {
    const lane = m.lanes[li], silenced = solo && !lane.solo, out = { ev, hits: [], early: [] }, due = (ahead[li] ??= new Map());
    const pre = due.get(t), padded = !!skip?.size && skip.delete(`${li}:${t}`);
    for (const k of due.keys()) if (k <= t) due.delete(k);   // its tick has come (or passed with no step on it)
    if (ev) {
      const early = decided(pre, lane, ev.step, t);
      if (padded) ev.hit = false;   // played live from a pad a moment ago: don't double it
      else if (!early) out.hits = expandHits(ev, lane, li, o);
      else if (!lane.muted && !silenced) { ev.hit = pre.hit; ev.accent = pre.accent; out.hits = pre.hits.filter(h => h.dt >= 0); }
      if (cp) { hit[li] = padded || ev.hit; used[li] = !early; }   // an early step used its lift when it was decided
    }
    return out;
  });
  if (cp && hit.length) m.coupleAfter(hit, used);
  // the steps that start sounding before their tick are decided now (after this tick's hits lifted their lanes)
  outs.forEach((out, li) => {
    const lane = m.lanes[li], silenced = solo && !lane.solo, due = ahead[li];
    const step = earlyStep(lane, t - o0, { ...o, cut: cut - o0 }), at = o0 + step * lane.stepTicks();
    if (step < 0 || decided(due.get(at), lane, step, at)) return;
    const pev = lane.peek(at - o0, rng, { fill, dice, li, silenced, boost: m.takeBoost(li), cycle: cycle ?? (lane.mod ? m.cycleTicks() : 0) }), hits = expandHits(pev, lane, li, o), lead = (at - t) * tickSec;
    if (!skip?.has(`${li}:${at}`)) out.early = hits.filter(h => h.dt < 0).map(h => ({ ...h, dt: lead + h.dt, tick: at }));   // tick: its step's (a jam take's end goes by steps)
    due.set(at, { lane, step, tick: at, hit: pev.hit, accent: pev.accent, hits, played: out.early.length > 0 });
  });
  return outs;
}

/**
 * Live play: true when liveTick at master tick `t` would do nothing (no lane steps there, no lane has an early step
 * still to decide: none, or already in `ahead`), so the clock can skip it. Most of the 840 ticks per beat are quiet.
 */
export function liveQuiet(m, t, ahead, { humanize = 0, tickSec, cut = Infinity }) {
  if (m.steps(t)) return false; const o0 = m.origin;
  return m.lanes.every((l, li) => { const s = earlyStep(l, t - o0, { humanize, tickSec, cut: cut - o0 }), at = o0 + s * l.stepTicks(); return s < 0 || decided(ahead[li]?.get(at), l, s, at); });
}

/** Every hit between master ticks [from, to): [{ li, time (s from tick 0), vel, accent, lock }], the lanes counting from
 *  `origin` (bar 1 of the pattern). Renders a copy of the machine, so its runtime counters (playhead, loop count) are
 *  the render's own and the live ones are left alone. It runs live play's own path (liveTick, skipping the quiet ticks
 *  as the clock does), so every step is decided where live play decides it (V2: a coupled lane's lift depends on when)
 *  and a render holds what plays. A step from `to` on is left alone (live play leaves it to a queued slot: the cut). */
export function collectHits(m, { from = 0, to, tempo, dice = null, fill = false, origin = 0 }) {
  const tickSec = 60 / tempo / PPQ, out = [], ahead = []; m = Machine.from(m.toJSON()); m.origin = origin;
  const cycle = m.cycleTicks({ repeat: dice?.locked && Number.isFinite(dice.repeat) ? dice.repeat : 1 });   // V5: as the clock has it
  const o = { fill, dice, tickSec, cut: to, cycle }, q = { humanize: m.humanize, tickSec, cut: to };
  for (let t = from; t < to; t++) {
    if (liveQuiet(m, t, ahead, q)) continue;
    liveTick(m, t, ahead, o).forEach(({ early, hits }, li) => {
      const add = (h) => out.push({ li, time: t * tickSec + h.dt, vel: h.vel, accent: h.accent, lock: h.lock, slice: h.slice, artic: m.lanes[li].strokeAt(h.lock) });
      early.forEach(add); hits.forEach(add);
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** A chain of slot states, `bars` each (in each slot's own time signature), on one continuous master clock, as it plays
 *  live: the bar anchor follows the app's rule (trackBars), so a slot whose bar is another length starts its lanes on
 *  its own first bar line and a slot in the same bar length goes on counting from where the anchor was; with `restart`
 *  (P4, the live "restart on change") every slot starts its lanes on step 1 where it comes in. */
export function collectChain(slotStates, { bars, tempo, dice = null, restart = false }) {
  const out = []; let from = 0, anchor = null;
  slotStates.forEach((json) => {
    const m = Machine.from(json), b = m.barTicks(), to = from + bars * b; anchor = anchor ? trackBars(anchor, from, b) : { at: 0, len: b, next: null };
    out.push(...collectHits(m, { from, to, tempo, dice, origin: restart ? from : anchor.at })); from = to;
  });
  return out;
}
/** The time signatures of a chain, `bars` each: [{ s (sixteenth it starts on), meter }], one per change (the MIDI
 *  file's FF 58 events). */
export const chainMeters = (slotStates, bars) => { const out = []; let s = 0; for (const json of slotStates) { const { num, den } = meterParts(json?.meter), meter = `${num}/${den}`; if (out.at(-1)?.meter !== meter) out.push({ s, meter }); s += bars * 16 * num / den; } return out; };
/** Sixteenths in a chain of slot states, `bars` each (the MIDI clip length). */
export const chainSixteenths = (slotStates, bars) => slotStates.reduce((n, json) => { const { num, den } = meterParts(json?.meter); return n + bars * 16 * num / den; }, 0);

/**
 * Hits → Standard MIDI File (one track per lane, notes/channels from the MIDI I/O settings), `bars` long in `meter`
 * (its time-signature event goes in the file; a 7/8 bar is 14 sixteenths), or `sixteenths` long with a time signature
 * wherever `meters` ([{ s, meter }], chainMeters) changes it (a chain). loop (the export's "render as loop"): a hit
 * nudged or pushed out of the clip, before the downbeat or past the end, wraps around like the loop WAV's audio, and no
 * note rings past the end, so the clip stays N bars. Off (one-shot): a hit before the downbeat starts on it, as in the
 * one-shot WAV.
 */
// L3: a hit's stroke (`artic`) plays its lane's stroke note (midiio.js strokeNotes, as live out), worked out over `map`
// (the whole note map, all lanes, when the file has fewer tracks)
// E3 merge: every lane on ONE track, on the first lane's channel, each lane (and stroke) on its own note from the MIDI
// settings: a Drum Rack in one clip. Off: a track per lane, as before.
export function hitsToMidi(hits, { tempo, lanes, map = lanes, names, gateSec = 0.06, name = 'orbits', bars = 0, loop = true, meter = '4/4', meters = null, sixteenths = null, merge = false }) {
  const { num, den } = meterParts(meter), toSteps = (sec) => sec / (60 / tempo / 4), len = sixteenths ?? bars * 16 * num / den, gate = Math.max(0.05, toSteps(gateSec));   // writeMidi counts sixteenths (24 ticks)
  const place = (sec) => {
    if (!loop || !len) return { s: Math.max(0, toSteps(sec)), d: gate };
    let s = ((toSteps(sec) % len) + len) % len; if (Math.round(s * 24) >= len * 24) s = 0;   // rounds onto the end: the downbeat
    return { s, d: Math.min(gate, len - s) };
  };
  const strokes = strokeNotes(map);
  const note = (h) => ({ p: strokes[h.li][h.artic || 0], ...place(h.time), v: Math.max(1, Math.min(127, Math.round(h.vel * 127))), g: true });
  const parts = merge ? [{ name: 'drum rack', ch: lanes[0]?.ch ?? 10, notes: hits.filter(h => h.li < lanes.length).map(note) }]
    : lanes.map((l, li) => ({ name: names[li] || `lane ${li + 1}`, ch: l.ch, notes: hits.filter(h => h.li === li).map(note) }));
  const sigs = meters?.map(({ s, meter: k }) => { const p = meterParts(k); return { s, num: p.num, den: p.den }; });
  return writeMidi({ bpm: tempo, name, parts, endStep: len, meter: [num, den], meters: sigs });   // the clip is the full N bars, not up to the last note
}

// ---- share links: the machine (+ tempo) as deflated JSON in the URL hash ----
const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pipe(bytes, stream) { const out = new Response(new Blob([bytes]).stream().pipeThrough(stream)); return new Uint8Array(await out.arrayBuffer()); }
/** Samples live in this browser only, so a shared lane that used one falls back to the drum it replaced (its voice and
 *  decay / snap / color, kept by Lane.loadSample), or to the Common kit's voice for that lane. */
export async function encodeShare(machineJSON, tempo) {
  const o = JSON.parse(JSON.stringify(machineJSON));
  (o.lanes || []).forEach((l, i) => {
    if (l.voice === 'sample') { const d = l.sample?.drum; l.voice = d?.voice || KITS.common.lanes[i].voice; if (d) for (const k of ['decay', 'snap', 'color']) if (d[k] != null) l.sound[k] = d[k]; }
    l.sample = null;
  });
  return b64u(await pipe(new TextEncoder().encode(JSON.stringify({ v: 1, tempo, m: o })), new CompressionStream('deflate-raw')));
}
export async function decodeShare(str) {
  const o = JSON.parse(new TextDecoder().decode(await pipe(unb64u(str), new DecompressionStream('deflate-raw'))));
  if (o?.v !== 1 || !o.m?.lanes) throw new Error('not an Orbits link'); return o;
}
