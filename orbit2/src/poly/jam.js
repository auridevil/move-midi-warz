// Jam takes and stems → WAV files. Pure helpers (no audio graph): the page records 16-bit chunks per lane (the
// worklet) or renders floats offline; this turns them into equal-length WAVs, a mix, and one zip.
import { zipStored } from '../punch/ablbundle.js';

export const JAM_BEATS = 256;

/** 16-bit stereo WAV from Int16 chunks per channel ([[L…], [R…]]) without building one big float copy. */
export function wavFromInt16(chunksL, chunksR, sampleRate) {
  const n = chunksL.reduce((a, c) => a + c.length, 0), bytes = 44 + n * 4, b = new ArrayBuffer(bytes), v = new DataView(b); let o = 0;
  const str = (s) => { for (const c of s) v.setUint8(o++, c.charCodeAt(0)); }, u32 = (x) => { v.setUint32(o, x, true); o += 4; }, u16 = (x) => { v.setUint16(o, x, true); o += 2; };
  str('RIFF'); u32(bytes - 8); str('WAVE'); str('fmt '); u32(16); u16(1); u16(2); u32(sampleRate); u32(sampleRate * 4); u16(4); u16(16); str('data'); u32(n * 4);
  for (let k = 0; k < chunksL.length; k++) { const L = chunksL[k], R = chunksR[k]; for (let i = 0; i < L.length; i++) { v.setInt16(o, L[i], true); v.setInt16(o + 2, R[i], true); o += 4; } }
  return new Uint8Array(b);
}
/** Sum of all lanes, per channel, clipped: [[L chunks], [R chunks]]. */
export function mixInt16(lanes) {
  const out = [[], []];
  for (let k = 0; k < lanes[0][0].length; k++) for (let c = 0; c < 2; c++) {
    const len = lanes[0][c][k].length, s = new Int16Array(len);
    for (let i = 0; i < len; i++) { let x = 0; for (const lane of lanes) x += lane[c][k][i]; s[i] = Math.max(-32768, Math.min(32767, x)); }
    out[c].push(s);
  }
  return out;
}
/**
 * A render with a lead-in of `pre` seconds and a ring-out tail → exactly `sec` seconds that loop seamlessly: the tail
 * past the end is added back onto the start, early hits (humanize before tick 0) onto the end. A DAW sees whole bars.
 */
export function foldLoop(d, sampleRate, sec, pre) {
  const len = Math.round(sec * sampleRate), p = Math.round(pre * sampleRate), out = new Float32Array(len);
  for (let i = 0; i < d.length; i++) out[(((i - p) % len) + len) % len] += d[i];
  return out;
}
/**
 * A render with a lead-in of `pre` seconds → a one-shot that starts on the downbeat and keeps its ring-out: trailing
 * silence (below -90 dBFS on every channel) trimmed, then the length rounded up to whole bars so a DAW still reads
 * the tempo right. Hits pushed before tick 0 by humanize fall before the downbeat and are dropped. Returns [ch…].
 */
export function oneShot(channels, sampleRate, sec, pre, barSec) {
  const p = Math.round(pre * sampleRate), floor = 10 ** (-90 / 20); let last = 0;
  for (const d of channels) for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > floor) { last = i; break; }
  const bars = Math.max(Math.round(sec / barSec), Math.ceil((last + 1 - p) / sampleRate / barSec - 1e-9));
  const len = Math.round(bars * barSec * sampleRate);
  return channels.map(d => { const out = new Float32Array(len); out.set(d.subarray(p, Math.min(d.length, p + len))); return out; });
}
/** Ticks to render for a whole number of bars that also holds whole polyrhythm cycles: the smallest common multiple,
 *  capped at maxBars (then `capped` is true and the loop point falls mid-cycle). */
export function wholeBarCycle(cycleTicks, barTicks, maxBars = 64) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a), l = (cycleTicks / gcd(cycleTicks, barTicks)) * barTicks;
  return l > maxBars * barTicks ? { ticks: maxBars * barTicks, capped: true } : { ticks: l, capped: false };
}
/** Cut every lane's chunk list ([[L chunks], [R chunks]]) to exactly `frames` frames, keeping the lanes aligned. */
export function trimChunks(lanes, frames) {
  return lanes.map(lane => lane.map(chunks => { const out = []; let left = frames; for (const c of chunks) { if (left <= 0) break; out.push(c.length > left ? c.slice(0, left) : c); left -= Math.min(left, c.length); } return out; }));
}
/**
 * Tempo for DAWs: an ACID 'acid' chunk (tempo, number of beats, 4/4) inserted before 'data' of a 44-byte-header WAV.
 * Readers that don't know it skip it (RIFF rule). Every Orbits file is whole bars at a known tempo, so all are tagged
 * stretchable (loop: true); the ACID one-shot flag means "don't follow tempo". Layout: u32 flags (1 = one-shot, 4 = stretch),
 * u16 root note, u16 0x8000, f32 0, u32 beats, u16 meter denominator, u16 numerator, f32 tempo.
 */
export function withAcid(wav, { bpm, beats, loop = true }) {
  const out = new Uint8Array(wav.length + 32), v = new DataView(out.buffer);
  out.set(wav.subarray(0, 36)); out.set(wav.subarray(36), 68);
  v.setUint32(4, out.length - 8, true); out.set([0x61, 0x63, 0x69, 0x64], 36); v.setUint32(40, 24, true);
  v.setUint32(44, loop ? 4 : 1, true); v.setUint16(48, 60, true); v.setUint16(50, 0x8000, true); v.setFloat32(52, 0, true);
  v.setUint32(56, Math.round(beats), true); v.setUint16(60, 4, true); v.setUint16(62, 4, true); v.setFloat32(64, bpm, true);
  return out;
}
/** Float stems (one [L, R] per lane, same length) → Int16 chunks, scaled together so the loudest never clips. */
export function floatStemsToInt16(stems) {
  let peak = 0; for (const [L, R] of stems) for (const d of [L, R]) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const g = peak > 0.98 ? 0.98 / peak : 1, q = (d) => { const s = new Int16Array(d.length); for (let i = 0; i < d.length; i++) s[i] = Math.round(d[i] * g * 32767); return s; };
  return { lanes: stems.map(([L, R]) => [[q(L)], [q(R)]]), gain: g };
}
/**
 * lanes: [[L chunks], [R chunks]] per lane, names per lane → zip with one WAV per lane + mix-raw.wav (their plain sum,
 * no master compressor), all the same length. Every file is named after the folder (tempo, bars, time) so stems of
 * different exports never clash in a DAW's browser; `acid` ({ bpm, beats, loop }) tags each WAV with the tempo.
 */
export function stemsZip(lanes, names, sampleRate, folder = 'orbits', acid = null) {
  const safe = (s) => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'lane';
  const tag = (w) => (acid ? withAcid(w, acid) : w), base = folder.split('/').pop();
  const files = lanes.map(([L, R], i) => ({ name: `${folder}/${base}-${i + 1}-${safe(names[i])}.wav`, data: tag(wavFromInt16(L, R, sampleRate)) }));
  const [mL, mR] = mixInt16(lanes); files.push({ name: `${folder}/${base}-mix-raw.wav`, data: tag(wavFromInt16(mL, mR, sampleRate)) });
  return zipStored(files);
}
