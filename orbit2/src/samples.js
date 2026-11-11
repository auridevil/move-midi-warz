// Audio samples shared between pages (same origin): IndexedDB store of { name, sampleRate, channels: Float32Array[] }.
// Orbits keeps lane samples here; Unassembler drops its 8 slices here for Orbits to pick up.
const DB = 'midi-warz-samples';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function putSample(key, val) { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
export async function getSample(key) { try { const db = await idb(); return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result ?? null); r.onerror = () => res(null); }); } catch { return null; } }
/** AudioBuffer (or anything with numberOfChannels/getChannelData) → storable record. */
export const fromAudioBuffer = (b, name) => ({ name, sampleRate: b.sampleRate, channels: Array.from({ length: Math.min(2, b.numberOfChannels) }, (_, c) => new Float32Array(b.getChannelData(c))) });
export function toAudioBuffer(rec, ctx) { const b = ctx.createBuffer(rec.channels.length, rec.channels[0].length, rec.sampleRate); rec.channels.forEach((d, c) => b.copyToChannel(d, c)); return b; }
/** Drop leading silence (below `thr`) and cap the length; keeps a 2 ms pre-roll so the attack isn't clipped. */
export function trimRecord(rec, { thr = 0.02, maxSec = 4 } = {}) {
  const d = rec.channels[0]; let s = 0; while (s < d.length && Math.abs(d[s]) < thr) s++;
  s = Math.max(0, s - Math.round(rec.sampleRate * 0.002)); const e = Math.min(d.length, s + Math.round(maxSec * rec.sampleRate));
  return { ...rec, channels: rec.channels.map(c => c.slice(s, e)) };
}
/** Unassembler → Orbits hand-off: key of the slices, and a localStorage ping other tabs listen to. */
export const SLICES_KEY = 'unasm-slices', SLICES_PING = 'midi-warz.samples.slices';
/** S2: the most slices a hand-off (or an auto-sliced break) brings: a bar of 16ths. */
export const MAX_HANDOFF = 16;
const isCh = (chs) => Array.isArray(chs) && chs.length > 0 && chs.every(d => d instanceof Float32Array && d.length > 0);
/**
 * S2: what Unassembler left under SLICES_KEY, in one shape: { name, sampleRate, slices: [[Float32Array per channel]…]
 * (1–16), mode: 'tiles' | 'set' }, or null. Two payloads (docs/design/slices-handoff.md): v1 { name, sampleRate,
 * slices } (8 equal slices, what Unassembler sends today) and v2 { v: 2, name, sampleRate, channels, cuts, mode } (the
 * region once and where it is cut, up to 16 slices of any length). Anything past 16 slices is left out.
 */
export function readSlices(rec) {
  if (!rec || !(rec.sampleRate > 0)) return null; const name = String(rec.name || 'track');
  if (rec.v === 2) {
    if (!isCh(rec.channels)) return null; const len = rec.channels[0].length;
    // more than 15 cuts: the 16th slice ends at the 16th cut
    const cuts = [...new Set((rec.cuts || []).map(Math.round).filter(x => x > 0 && x < len))].sort((a, b) => a - b), edges = [0, ...cuts, len].slice(0, MAX_HANDOFF + 1);
    const slices = edges.slice(1).map((e, k) => rec.channels.map(d => d.slice(edges[k], e)));
    return { name, sampleRate: rec.sampleRate, slices, mode: rec.mode === 'set' ? 'set' : 'tiles' };
  }
  const slices = (Array.isArray(rec.slices) ? rec.slices : []).filter(isCh).slice(0, MAX_HANDOFF);
  return slices.length ? { name, sampleRate: rec.sampleRate, slices, mode: 'tiles' } : null;
}
/** S2: a whole break cut into `n` equal slices (its last few samples, under one slice of n, go to the last one). */
export function chopEqual(rec, n) {
  const len = rec.channels[0].length; n = Math.max(1, Math.min(MAX_HANDOFF, Math.round(n), len)); const w = Math.floor(len / n);
  return Array.from({ length: n }, (_, k) => rec.channels.map(d => d.slice(k * w, k === n - 1 ? len : (k + 1) * w)));
}
