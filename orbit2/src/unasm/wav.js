// 16-bit PCM WAV writer. channels: Float32Array per channel (same length).
export function encodeWav(channels, sampleRate) {
  const n = channels[0]?.length || 0, ch = channels.length, bytes = 44 + n * ch * 2;
  const b = new ArrayBuffer(bytes), v = new DataView(b); let o = 0;
  const str = (s) => { for (const c of s) v.setUint8(o++, c.charCodeAt(0)); }, u32 = (x) => { v.setUint32(o, x, true); o += 4; }, u16 = (x) => { v.setUint16(o, x, true); o += 2; };
  str('RIFF'); u32(bytes - 8); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(sampleRate); u32(sampleRate * ch * 2); u16(ch * 2); u16(16); str('data'); u32(n * ch * 2);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
  return new Uint8Array(b);
}
/** Concatenate recorded chunks ([[L, R], ...]) into one Float32Array per channel. */
export function joinChunks(chunks, channels = 2) {
  const n = chunks.reduce((a, c) => a + c[0].length, 0); const out = Array.from({ length: channels }, () => new Float32Array(n)); let o = 0;
  for (const c of chunks) { for (let k = 0; k < channels; k++) out[k].set(c[k] || c[0], o); o += c[0].length; }
  return out;
}
