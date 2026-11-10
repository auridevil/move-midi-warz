// One place that turns lane events into concrete hits (swing, humanize, ratchets), used by live playback, the WAV
// render and the MIDI export, plus the share-link codec. Pure: no audio, no DOM.
import { Machine, BAR_TICKS } from './lanes.js';
import { KITS } from './kits.js';
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
  return Array.from({ length: n }, (_, k) => ({ dt: base + (k * stepSec) / n, vel: ev.fade ? v * Math.pow(0.72, k) : v, accent: ev.accent && k === 0, lock: ev.lock }));
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

/** A step decided early stays decided: by its own lane, or by a lane that replaced it since (an undo, a link) once part
 *  of it has sounded, so a step is never started twice. A lane replaced before anything sounded decides afresh. */
const decided = (pre, lane, step) => pre?.step === step && (pre.lane === lane || pre.played);
/**
 * Live play, one master tick: per lane { ev (the step at t, or null), hits (its own, dt in s from tick t), early (the
 * early part of a later step, decided now by earlyStep, dt from tick t) }. A step decided early plays on with the same
 * roll at its tick (an accent or a ratchet isn't rolled twice), unless its lane is muted or silenced now (what already
 * sounded stays). A queued slot or chain step is known in advance (cut, SlotBank.nextSwitch): the outgoing lanes leave
 * the steps from there on to it, so a switch plays what the chain render has. `ahead` keeps the decisions between ticks.
 */
export function liveTick(m, t, ahead, { rng = Math.random, fill = false, dice = null, tickSec, cut = Infinity }) {
  const solo = m.lanes.some(l => l.solo), o = { humanize: m.humanize, dice, tickSec };
  return m.tick(t, rng, { fill, dice }).map((ev, li) => {
    const lane = m.lanes[li], silenced = solo && !lane.solo, out = { ev, hits: [], early: [] };
    if (ev) {
      const pre = ahead[li]; ahead[li] = null;
      if (!decided(pre, lane, ev.step)) out.hits = expandHits(ev, lane, li, o);
      else if (!lane.muted && !silenced) { ev.hit = pre.hit; ev.accent = pre.accent; out.hits = pre.hits.filter(h => h.dt >= 0); }
    }
    const step = earlyStep(lane, t, { ...o, cut });
    if (step >= 0 && !decided(ahead[li], lane, step)) {
      const st = lane.stepTicks(), pev = lane.peek(step * st, rng, { fill, dice, li, silenced }), hits = expandHits(pev, lane, li, o), lead = (step * st - t) * tickSec;
      out.early = hits.filter(h => h.dt < 0).map(h => ({ ...h, dt: lead + h.dt }));
      ahead[li] = { lane, step, hit: pev.hit, accent: pev.accent, hits, played: out.early.length > 0 };
    }
    return out;
  });
}

/** Every hit between master ticks [from, to): [{ li, time (s from tick 0), vel, accent, lock }]. */
export function collectHits(m, { from = 0, to, tempo, dice = null, fill = false }) {
  const tickSec = 60 / tempo / 24, out = [];
  for (let t = from; t < to; t++) m.tick(t, Math.random, { dice, fill }).forEach((ev, li) => { for (const h of expandHits(ev, m.lanes[li], li, { humanize: m.humanize, dice, tickSec })) out.push({ li, time: t * tickSec + h.dt, vel: h.vel, accent: h.accent, lock: h.lock }); });
  return out.sort((a, b) => a.time - b.time);
}

/** A chain of slot states, `bars` each, on one continuous master clock (as it plays live). */
export function collectChain(slotStates, { bars, tempo, dice = null }) {
  const out = []; const span = bars * BAR_TICKS;
  slotStates.forEach((json, k) => { const m = Machine.from(json); out.push(...collectHits(m, { from: k * span, to: (k + 1) * span, tempo, dice })); });
  return out;
}

/**
 * Hits → Standard MIDI File (one track per lane, notes/channels from the MIDI I/O settings), `bars` long. loop (the
 * export's "render as loop"): a hit nudged or pushed out of the clip, before the downbeat or past the end, wraps
 * around like the loop WAV's audio, and no note rings past the end, so the clip stays N bars. Off (one-shot): a hit
 * before the downbeat starts on it, as in the one-shot WAV.
 */
export function hitsToMidi(hits, { tempo, lanes, names, gateSec = 0.06, name = 'orbits', bars = 0, loop = true }) {
  const toSteps = (sec) => sec / (60 / tempo / 4), len = bars * 16, gate = Math.max(0.05, toSteps(gateSec));   // writeMidi counts sixteenths (24 ticks)
  const place = (sec) => {
    if (!loop || !len) return { s: Math.max(0, toSteps(sec)), d: gate };
    let s = ((toSteps(sec) % len) + len) % len; if (Math.round(s * 24) >= len * 24) s = 0;   // rounds onto the end: the downbeat
    return { s, d: Math.min(gate, len - s) };
  };
  const parts = lanes.map((l, li) => ({ name: names[li] || `lane ${li + 1}`, ch: l.ch, notes: hits.filter(h => h.li === li).map(h => ({ p: l.note, ...place(h.time), v: Math.max(1, Math.min(127, Math.round(h.vel * 127))), g: true })) }));
  return writeMidi({ bpm: tempo, name, parts, endStep: len });   // the clip is the full N bars, not up to the last note
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
    if (l.voice === 'sample') { const d = l.sample?.drum; l.voice = d?.voice || KITS.common.lanes[i % 4].voice; if (d) for (const k of ['decay', 'snap', 'color']) if (d[k] != null) l.sound[k] = d[k]; }
    l.sample = null;
  });
  return b64u(await pipe(new TextEncoder().encode(JSON.stringify({ v: 1, tempo, m: o })), new CompressionStream('deflate-raw')));
}
export async function decodeShare(str) {
  const o = JSON.parse(new TextDecoder().decode(await pipe(unb64u(str), new DecompressionStream('deflate-raw'))));
  if (o?.v !== 1 || !o.m?.lanes) throw new Error('not an Orbits link'); return o;
}
