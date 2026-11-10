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
  const base = (ev.swung + (ev.lock?.nudge ?? 0)) * stepSec + (lane.offsetMs || 0) / 1000 + (r - 0.5) * humanize * 0.03, n = Math.max(1, ev.ratchet || 1), v = hitVel(ev.accent, ev.lock);
  return Array.from({ length: n }, (_, k) => ({ dt: base + (k * stepSec) / n, vel: ev.fade ? v * Math.pow(0.72, k) : v, accent: ev.accent && k === 0, lock: ev.lock }));
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

/** Hits → Standard MIDI File (one track per lane, notes/channels from the MIDI I/O settings), `bars` long. */
export function hitsToMidi(hits, { tempo, lanes, names, gateSec = 0.06, name = 'orbits', bars = 0 }) {
  const toSteps = (sec) => sec / (60 / tempo / 4);   // writeMidi counts sixteenths
  const parts = lanes.map((l, li) => ({ name: names[li] || `lane ${li + 1}`, ch: l.ch, notes: hits.filter(h => h.li === li).map(h => ({ p: l.note, s: toSteps(Math.max(0, h.time)), d: Math.max(0.05, toSteps(gateSec)), v: Math.max(1, Math.min(127, Math.round(h.vel * 127))), g: true })) }));
  return writeMidi({ bpm: tempo, name, parts, endStep: bars * 16 });   // the clip is the full N bars, not up to the last note
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
