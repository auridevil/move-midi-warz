// Standard MIDI File writer (type 1): a tempo track plus one track per part. 96 ticks per quarter, 24 per step.
export const PPQ = 96;
const TPS = PPQ / 4;

const vlq = (n) => { const out = [n & 0x7F]; while ((n >>= 7)) out.unshift((n & 0x7F) | 0x80); return out; };
const str = (s) => [...new TextEncoder().encode(s)];
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id, data) => [...str(id), ...u32(data.length), ...data];
const meta = (type, data) => [0xFF, type, ...vlq(data.length), ...data];

/** Ticks for a step, with swing pushing every odd sixteenth late by swing% of a step (50 = straight). */
export const stepTicks = (s, swing = 50) => Math.round(s * TPS + (s % 2 === 1 ? Math.max(0, swing - 50) / 50 * TPS : 0));

function track(events, name) {
  // events: [tick, bytes]; note-offs sort before note-ons on the same tick
  events.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const data = [0x00, ...meta(0x03, str(name))]; let last = 0;
  for (const [t, bytes] of events) { data.push(...vlq(t - last), ...bytes); last = t; }
  data.push(0x00, ...meta(0x2F, []));
  return chunk('MTrk', data);
}

/** parts: [{ name, ch (1–16), notes: [{p, s, d, v}] }] → Uint8Array of a .mid file. markers: [{ s (step), text }] become
 *  marker meta events on the tempo track (Live shows them as locators). */
export function writeMidi({ bpm = 120, swing = 50, name = 'punchliner', parts, markers = [] }) {
  const usq = Math.round(60000000 / bpm);
  const head = [0x00, ...meta(0x03, str(name)), 0x00, ...meta(0x51, [(usq >> 16) & 255, (usq >> 8) & 255, usq & 255]), 0x00, ...meta(0x58, [4, 2, 24, 8])];
  let last = 0; for (const m of [...markers].sort((a, b) => a.s - b.s)) { const t = stepTicks(m.s, 50); head.push(...vlq(t - last), ...meta(0x06, str(m.text))); last = t; }
  const tempo = [...head, 0x00, ...meta(0x2F, [])];
  const tracks = [chunk('MTrk', tempo)];
  for (const part of parts) {
    const ch = (part.ch - 1) & 15, ev = [];
    const sorted = [...part.notes].sort((a, b) => a.s - b.s);
    for (const [k, n] of sorted.entries()) {
      const on = stepTicks(n.s, swing); let off = Math.max(on + 1, stepTicks(n.s + n.d, swing) - (n.g ? 0 : 1));
      const again = sorted.slice(k + 1).find(m => m.p === n.p && m.s > n.s); // never overlap the same pitch
      if (again) off = Math.min(off, stepTicks(again.s, swing));
      ev.push([on, [0x90 | ch, n.p, n.v], 1], [off, [0x80 | ch, n.p, 0], 0]);
    }
    tracks.push(track(ev, part.name));
  }
  const header = chunk('MThd', [0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255]);
  return Uint8Array.from([...header, ...tracks.flat()]);
}

/** Minimal reader for tests: returns { format, ppq, tracks: [{ name, notes: [{p, on, off, v, ch}] , tempo? }] }. */
export function readMidi(bytes) {
  let i = 0; const b = bytes; const rd32 = () => (b[i++] << 24 | b[i++] << 16 | b[i++] << 8 | b[i++]) >>> 0; const rd16 = () => b[i++] << 8 | b[i++];
  const rvlq = () => { let n = 0, c; do { c = b[i++]; n = (n << 7) | (c & 0x7F); } while (c & 0x80); return n; };
  i = 8; const format = rd16(), ntr = rd16(), ppq = rd16(); const tracks = [];
  for (let k = 0; k < ntr; k++) {
    i += 4; const len = rd32(), end = i + len; let t = 0, run = 0; const tr = { name: '', notes: [] }; const open = new Map();
    while (i < end) {
      t += rvlq(); let s = b[i];
      if (s === 0xFF) { i++; const type = b[i++], l = rvlq(); const d = b.slice(i, i + l); i += l; if (type === 0x03) tr.name = new TextDecoder().decode(d); if (type === 0x51) tr.tempo = 60000000 / (d[0] << 16 | d[1] << 8 | d[2]); if (type === 0x06) (tr.markers ??= []).push({ t, text: new TextDecoder().decode(d) }); continue; }
      if (s & 0x80) { run = s; i++; } else s = run;
      const hi = s & 0xF0, ch = (s & 15) + 1, d1 = b[i++], d2 = (hi === 0xC0 || hi === 0xD0) ? 0 : b[i++];
      if (hi === 0x90 && d2 > 0) open.set(`${ch}:${d1}`, { p: d1, on: t, v: d2, ch });
      else if (hi === 0x80 || hi === 0x90) { const o = open.get(`${ch}:${d1}`); if (o) { o.off = t; tr.notes.push(o); open.delete(`${ch}:${d1}`); } }
    }
    tracks.push(tr);
  }
  return { format, ppq, tracks };
}
