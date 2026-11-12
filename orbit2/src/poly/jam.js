// Jam takes and stems → WAV files. Pure helpers (no audio graph): the page records 16-bit chunks per lane (the
// worklet) or renders floats offline; this turns them into equal-length WAVs, a mix, and one zip.
import { zipStored } from '../punch/ablbundle.js';
import { encodeWav, insertChunk, withSmpl } from '../unasm/wav.js';

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
/** Offline renders start this long before their earliest hit: the master compressor + limiter start cold (a hit 10 ms
 *  into a render came out ~13 dB low, at 50 ms ~5 dB) and have settled after 0.2 s. */
export const PRE_ROLL = 0.5;
/** Seconds to render before tick 0: PRE_ROLL before the earliest hit (a nudge, a push or humanize can put it early). */
export const renderLead = (hits) => PRE_ROLL - hits.reduce((a, h) => Math.min(a, h.time), 0);
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
 * Tempo for DAWs: an ACID 'acid' chunk (tempo, number of beats, meter) inserted before 'data' of a 44-byte-header WAV.
 * beats count the meter's beat (its denominator): a 7/8 bar is 7, a 4/4 bar 4, so beats / num = bars; tempo stays
 * quarter-note bpm.
 * Readers that don't know it skip it (RIFF rule). Every Orbits file is whole bars at a known tempo, so all are tagged
 * stretchable (loop: true); the ACID one-shot flag means "don't follow tempo". Layout: u32 flags (1 = one-shot, 4 = stretch),
 * u16 root note, u16 0x8000, f32 0, u32 beats, u16 meter denominator, u16 numerator, f32 tempo.
 */
export function withAcid(wav, { bpm, beats, loop = true, num = 4, den = 4 }) {
  const body = new Uint8Array(24), v = new DataView(body.buffer);   // before 'data' in any header (PCM 44 bytes: at 36)
  v.setUint32(0, loop ? 4 : 1, true); v.setUint16(4, 60, true); v.setUint16(6, 0x8000, true); v.setFloat32(8, 0, true);
  v.setUint32(12, Math.round(beats), true); v.setUint16(16, den, true); v.setUint16(18, num, true); v.setFloat32(20, bpm, true);
  return insertChunk(wav, 'acid', body);
}
/** Frames in a WAV's 'data' chunk (any header). */
export function wavFrames(wav) {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength); let at = 12, bpf = 0;
  while (at + 8 <= wav.length) {
    const id = String.fromCharCode(...wav.subarray(at, at + 4)), sz = v.getUint32(at + 4, true);
    if (id === 'fmt ') bpf = v.getUint16(at + 20, true); if (id === 'data') return bpf ? sz / bpf : 0; at += 8 + sz + (sz & 1);
  }
  return 0;
}
/** The DAW tags of an export: `acid` ({ bpm, beats, … }, withAcid) and, for a loop, E6's 'smpl' loop over the whole
 *  file. Kit one-shots and ring-out files get neither (tempo-free). */
export const tagWav = (wav, sampleRate, { acid = null, smpl = false } = {}) => {
  let w = acid ? withAcid(wav, acid) : wav; if (smpl) w = withSmpl(w, { frames: wavFrames(wav), sampleRate }); return w;
};
/** Float stems (one [L, R] per lane, same length) → Int16 chunks, scaled together so the loudest never clips. */
export function floatStemsToInt16(stems) {
  let peak = 0; for (const [L, R] of stems) for (const d of [L, R]) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const g = peak > 0.98 ? 0.98 / peak : 1, q = (d) => { const s = new Int16Array(d.length); for (let i = 0; i < d.length; i++) s[i] = Math.round(d[i] * g * 32767); return s; };
  return { lanes: stems.map(([L, R]) => [[q(L)], [q(R)]]), gain: g };
}
export const safeName = (s) => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'lane';
/**
 * lanes: [[L chunks], [R chunks]] per lane (a jam take, 16-bit), names per lane → zip with one WAV per lane + mix-raw.wav
 * (their plain sum, no master compressor), all the same length. Every file is named after the folder (tempo, bars,
 * time) so stems of different exports never clash in a DAW's browser; `acid` ({ bpm, beats, loop }) tags each WAV with
 * the tempo, `smpl` adds the loop chunk. ring (E6): the same per lane past the take's end (splitChunks), as
 * "…-ringout.wav" files, untagged: drop each right after its lane's take to hear the echoes and decays it cut.
 */
export function stemsZip(lanes, names, sampleRate, folder = 'orbits', acid = null, { smpl = false, ring = null } = {}) {
  const base = folder.split('/').pop(), files = [];
  const add = (set, sfx, tags) => {
    set.forEach(([L, R], i) => files.push({ name: `${folder}/${base}-${i + 1}-${safeName(names[i])}${sfx}.wav`, data: tagWav(wavFromInt16(L, R, sampleRate), sampleRate, tags) }));
    const [mL, mR] = mixInt16(set); files.push({ name: `${folder}/${base}-mix-raw${sfx}.wav`, data: tagWav(wavFromInt16(mL, mR, sampleRate), sampleRate, tags) });
  };
  add(lanes, '', { acid, smpl }); if (ring?.[0]?.[0]?.some(c => c.length)) add(ring, '-ringout', {});
  return zipStored(files);
}
/** A jam recording that ran past the take (the ring-out) → { head: the take, `frames` long, tail: the rest }, per lane. */
export function splitChunks(lanes, frames) {
  const cut = (chunks) => { const head = [], tail = []; let left = frames; for (const c of chunks) { if (left >= c.length) head.push(c); else if (left <= 0) tail.push(c); else { head.push(c.slice(0, left)); tail.push(c.slice(left)); } left -= c.length; } return [head, tail]; };
  const parts = lanes.map(lane => lane.map(cut));
  return { head: parts.map(l => l.map(([h]) => h)), tail: parts.map(l => l.map(([, t]) => t)) };
}
/** E2: the sum of float stems ([L, R] each, same length): the raw mix, and the check that dry stems plus the delay
 *  return add up to the wet mix. */
export function sumStems(stems) {
  const n = stems[0]?.[0].length || 0, out = [new Float32Array(n), new Float32Array(n)];
  for (const st of stems) for (let c = 0; c < 2; c++) { const d = st[c], o = out[c]; for (let i = 0; i < n; i++) o[i] += d[i]; }
  return out;
}
/**
 * Offline stems (float [L, R] per lane, + `ret`, the delay return pair, for dry stems) → WAV files in `bits` (16 / 24 /
 * 32 float) named after `folder`, + mix-raw.wav (their plain sum: sumStems). 16 and 24-bit share one gain that keeps the
 * loudest stem and the mix under 0.98 (32-bit float keeps the levels as rendered: nothing clips). Returns
 * { files: [{ name, data }], gain }.
 */
export function stemFiles(stems, names, sampleRate, folder = 'orbits', { bits = 16, acid = null, smpl = false, ret = null } = {}) {
  const base = folder.split('/').pop(), all = ret ? [...stems, ret] : stems, mix = sumStems(all);
  let peak = 0; for (const d of [...all.flat(), ...mix]) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  const g = bits !== 32 && peak > 0.98 ? 0.98 / peak : 1, sc = (d) => g === 1 ? d : d.map(x => x * g);
  const file = (name, [L, R]) => ({ name: `${folder}/${base}-${name}.wav`, data: tagWav(encodeWav([sc(L), sc(R)], sampleRate, { bits }), sampleRate, { acid, smpl }) });
  const files = stems.map((st, i) => file(`${i + 1}-${safeName(names[i])}`, st));
  if (ret) files.push(file('delay-return', ret)); files.push(file('mix-raw', mix));
  return { files, gain: g };
}
/** E4: a one-shot render → from its onset (the first sample over -80 dBFS from `pre` s in: some voices speak a few ms
 *  after the hit's time, a sampler wants the sound on sample 0) to the last sample above -90 dBFS, at most `maxSec`; a
 *  cut that lands on sound fades out over 10 ms instead of clicking. Returns [ch…]. */
export function trimOneShot(channels, sampleRate, { pre = 0, maxSec = 2 } = {}) {
  const p0 = Math.round(pre * sampleRate), cap = Math.round(maxSec * sampleRate), floor = 10 ** (-90 / 20), on = 1e-4, n = channels[0]?.length || 0;
  let p = p0; while (p < n && !channels.some(d => Math.abs(d[p]) > on)) p++; if (p >= n) p = p0;
  let last = -1;
  for (const d of channels) for (let i = Math.min(d.length, p + cap) - 1; i > p + last; i--) if (Math.abs(d[i]) > floor) { last = i - p; break; }
  const len = Math.max(1, last + 1), out = channels.map(d => d.slice(p, p + len)), cut = len >= cap;
  if (cut) { const f = Math.min(len, Math.round(0.01 * sampleRate)); for (const d of out) for (let i = 0; i < f; i++) d[len - 1 - i] *= i / f; }
  return out;
}
