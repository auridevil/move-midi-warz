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
/** Unassembler → Orbits hand-off: key of the 8 slices, and a localStorage ping other tabs listen to. */
export const SLICES_KEY = 'unasm-slices', SLICES_PING = 'midi-warz.samples.slices';
