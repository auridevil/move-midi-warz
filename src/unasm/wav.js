// WAV writer. channels: Float32Array per channel (same length). E1: bits 16 / 24 (PCM) or 32 (IEEE float, format 3,
// with the 'fact' chunk non-PCM files need; float keeps anything over 0 dBFS, PCM clips at ±1).
export const WAV_BITS = [16, 24, 32];
export function encodeWav(channels, sampleRate, { bits = 16 } = {}) {
  const float = bits === 32, B = float ? 4 : bits === 24 ? 3 : 2, n = channels[0]?.length || 0, ch = channels.length;
  const fmt = float ? 18 : 16, head = 12 + 8 + fmt + (float ? 12 : 0) + 8, bytes = head + n * ch * B + ((n * ch * B) & 1);
  const b = new ArrayBuffer(bytes), v = new DataView(b); let o = 0;
  const str = (s) => { for (const c of s) v.setUint8(o++, c.charCodeAt(0)); }, u32 = (x) => { v.setUint32(o, x, true); o += 4; }, u16 = (x) => { v.setUint16(o, x, true); o += 2; };
  str('RIFF'); u32(bytes - 8); str('WAVE'); str('fmt '); u32(fmt); u16(float ? 3 : 1); u16(ch); u32(sampleRate); u32(sampleRate * ch * B); u16(ch * B); u16(bits);
  if (float) { u16(0); str('fact'); u32(4); u32(n); }   // cbSize 0, then the frame count
  str('data'); u32(n * ch * B);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const x = channels[c][i];
    if (float) { v.setFloat32(o, x, true); o += 4; continue; }
    const s = Math.max(-1, Math.min(1, x));   // rounded: setInt16 alone truncates toward zero, half an LSB of bias
    if (B === 2) { v.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7FFF), true); o += 2; }
    else { const q = Math.round(s < 0 ? s * 0x800000 : s * 0x7FFFFF); v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setInt8(o + 2, q >> 16); o += 3; }
  }
  return new Uint8Array(b);
}
/** A RIFF chunk (`id`, body bytes) inserted just before 'data' (any header layout: PCM, float with 'fact', tags already
 *  added). Readers that don't know a chunk skip it, so order is free; before 'data' is where Live and Logic look. */
export function insertChunk(wav, id, body) {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength); let at = 12;
  while (at + 8 <= wav.length && String.fromCharCode(...wav.subarray(at, at + 4)) !== 'data') at += 8 + v.getUint32(at + 4, true) + (v.getUint32(at + 4, true) & 1);
  const pad = body.length & 1, out = new Uint8Array(wav.length + 8 + body.length + pad), w = new DataView(out.buffer);
  out.set(wav.subarray(0, at)); for (let k = 0; k < 4; k++) out[at + k] = id.charCodeAt(k);
  w.setUint32(at + 4, body.length, true); out.set(body, at + 8); out.set(wav.subarray(at), at + 8 + body.length + pad);
  w.setUint32(4, out.length - 8, true); return out;
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
/**
 * E6: a 'smpl' chunk with one forward loop over the whole file (frames 0 … frames − 1, inclusive, as the spec counts),
 * so a sampler (Simpler, Kontakt, an MPC) loops the clip on load. Layout: 9 × u32 header (manufacturer, product, sample
 * period in ns, MIDI unity note 60, pitch fraction, SMPTE format, SMPTE offset, loop count 1, sampler data 0), then the
 * loop: cue id, type 0 (forward), start, end, fraction, play count 0 (forever).
 */
export function withSmpl(wav, { frames, sampleRate }) {
  const body = new Uint8Array(60), v = new DataView(body.buffer);
  v.setUint32(8, Math.round(1e9 / sampleRate), true); v.setUint32(12, 60, true); v.setUint32(28, 1, true);
  v.setUint32(48, Math.max(0, frames - 1), true);   // loop 0 at byte 36: cue 0, type 0, start 0 (44), end (48), 0, 0
  return insertChunk(wav, 'smpl', body);
}
/** Concatenate recorded chunks ([[L, R], ...]) into one Float32Array per channel. */
export function joinChunks(chunks, channels = 2) {
  const n = chunks.reduce((a, c) => a + c[0].length, 0); const out = Array.from({ length: channels }, () => new Float32Array(n)); let o = 0;
  for (const c of chunks) { for (let k = 0; k < channels; k++) out[k].set(c[k] || c[0], o); o += c[0].length; }
  return out;
}
