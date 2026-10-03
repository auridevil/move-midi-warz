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
/** Float stems (one [L, R] per lane, same length) → Int16 chunks, scaled together so the loudest never clips. */
export function floatStemsToInt16(stems) {
  let peak = 0; for (const [L, R] of stems) for (const d of [L, R]) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const g = peak > 0.98 ? 0.98 / peak : 1, q = (d) => { const s = new Int16Array(d.length); for (let i = 0; i < d.length; i++) s[i] = Math.round(d[i] * g * 32767); return s; };
  return { lanes: stems.map(([L, R]) => [[q(L)], [q(R)]]), gain: g };
}
/** lanes: [[L chunks], [R chunks]] per lane, names per lane → zip with one WAV per lane + mix.wav, all the same length. */
export function stemsZip(lanes, names, sampleRate, folder = 'orbits') {
  const safe = (s) => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'lane';
  const files = lanes.map(([L, R], i) => ({ name: `${folder}/${i + 1}-${safe(names[i])}.wav`, data: wavFromInt16(L, R, sampleRate) }));
  const [mL, mR] = mixInt16(lanes); files.push({ name: `${folder}/mix.wav`, data: wavFromInt16(mL, mR, sampleRate) });
  return zipStored(files);
}
