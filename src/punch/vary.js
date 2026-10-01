// Post-processing on a generated line: phrase endings (how a 4/8-bar phrase closes) and chaos (controlled damage).
// Both are deterministic for a given seed, so the same knobs give the same result.
import { STEPS, rng, barScale, chordPcs } from './gen.js';

export const ENDINGS = {
  off: 'No ending: the loop just turns.',
  drop: 'Drop-out: the last half bar of the phrase is empty. Silence tells the ear the phrase is over and prepares the return.',
  fill: 'Fill: the last beat becomes a run (lead, bass) or stabs (pad) that leads into the next downbeat.',
  turnaround: 'Turnaround: the last bar of the phrase moves to VII (V in harmonic minor) so the loop pulls back to the top.',
  lift: 'Lift: the last bar jumps up an octave. Small, effective push into the repeat.',
  answer: 'Answer: the last note of the phrase changes. Same phrase, different full stop.',
};

const pc = (p) => ((p % 12) + 12) % 12;
const clampV = (v) => Math.max(1, Math.min(127, Math.round(v)));
const notesIn = (pcs, lo, hi) => { const out = []; for (let p = lo; p <= hi; p++) if (pcs.includes(pc(p))) out.push(p); return out; };
const nearest = (c, t) => (!c.length ? t : c.reduce((b, p) => (Math.abs(p - t) < Math.abs(b - t) ? p : b), c[0]));
/** Steps where a phrase's last bar starts, for phrases of `every` bars. */
const lastBars = (f, every) => { const out = []; for (let b = every - 1; b < f.bars; b += every) out.push(b * STEPS); return out; };
const cut = (notes, from, to) => notes.filter(n => n.s < from || n.s >= to).map(n => (n.s < from && n.s + n.d > from ? { ...n, d: from - n.s } : n));

/** Apply a phrase ending to one part. turnaround is handled in frame() (it changes the harmony), so here it is a no-op. */
export function applyEnding(f, part, notes, { type = 'off', every = 4 } = {}, seed = 1) {
  if (type === 'off' || type === 'turnaround' || !notes.length) return notes;
  const r = rng(seed ^ 0xE4D); let out = notes.map(n => ({ ...n }));
  for (const o of lastBars(f, every)) {
    const bar = o / STEPS;
    if (type === 'drop') out = cut(out, o + 8, o + STEPS);
    else if (type === 'lift') out = out.map(n => (n.s >= o && n.s < o + STEPS ? { ...n, p: Math.min(127, n.p + 12) } : n));
    else if (type === 'answer') {
      const inPhrase = out.filter(n => n.s >= o - (every - 1) * STEPS && n.s < o + STEPS); if (!inPhrase.length) continue;
      const lastS = Math.max(...inPhrase.map(n => n.s)); const ct = chordPcs(f, Math.min(f.bars - 1, Math.floor(lastS / STEPS)));
      out = out.map(n => { if (n.s !== lastS) return n; const cands = notesIn(ct, n.p - 7, n.p + 7).filter(p => p !== n.p); return { ...n, p: nearest(cands, n.p - 3) }; });
    } else if (type === 'fill') {
      out = cut(out, o + 12, o + STEPS);
      const next = notes.find(n => n.s >= o + STEPS) || notes[0]; const target = next.p; const sc = barScale(f, bar);
      if (part === 'pad') { const chord = out.filter(n => n.s < o + 12 && n.s + n.d >= o + 8).map(n => n.p); const v = chord.length ? [...new Set(chord)] : [target]; for (const s of [12, 14, 15]) for (const p of v) out.push({ p, s: o + s, d: 1, v: clampV(s === 15 ? 104 : 84) }); }
      else {
        // a stepwise run into the next phrase's first note, from above or below
        const scaleNotes = notesIn(sc, target - 12, target + 12); const i = scaleNotes.indexOf(nearest(scaleNotes, target)); const dir = r.chance(0.5) ? 1 : -1;
        for (let k = 0; k < 4; k++) { const p = scaleNotes[Math.max(0, Math.min(scaleNotes.length - 1, i + dir * (4 - k)))]; out.push({ p, s: o + 12 + k, d: 1, v: clampV(80 + k * 9) }); }
      }
    }
  }
  return out.sort((a, b) => a.s - b.s || a.p - b.p);
}

/** Chaos: mutate (pitch), ratchet (repeats), scatter (drops, nudges, velocity), glitch (stutter / reversed beats). 0–100 each. */
export function applyChaos(f, part, notes, { mutate = 0, ratchet = 0, scatter = 0, glitch = 0 } = {}, seed = 1) {
  if (!(mutate || ratchet || scatter || glitch) || !notes.length) return notes;
  const r = rng(seed ^ 0xC4A05); const M = mutate / 100, R = ratchet / 100, S = scatter / 100, G = glitch / 100; const total = f.bars * STEPS;
  let out = [];
  for (const n0 of notes) {
    let n = { ...n0 };
    const bar = Math.min(f.bars - 1, Math.floor(n.s / STEPS)); const sc = barScale(f, bar);
    if (S && r.chance(S * 0.35)) continue;                                          // dropped
    if (S && r.chance(S * 0.4)) n.s = Math.max(0, Math.min(total - 1, n.s + r.pick([-1, 1]))); // nudged a step
    if (S) n.v = clampV(n.v + (r.next() - 0.5) * 80 * S);
    if (M && r.chance(M * 0.6)) {
      if (r.chance(0.25 + M * 0.2)) n.p += r.pick([12, -12]);                       // octave jump
      else { const pool = notesIn(sc, n.p - 5, n.p + 5).filter(p => p !== n.p); if (pool.length) n.p = r.pick(pool); }
      if (M > 0.7 && r.chance((M - 0.7) * 1.5)) n.p += r.pick([1, -1]);           // out of the scale
    }
    if (R && n.d >= 2 && r.chance(R * 0.7)) {                                       // ratchet: the note becomes repeats
      const reps = Math.min(n.d, r.chance(R) ? n.d : 2); const len = Math.max(1, Math.floor(n.d / reps));
      for (let k = 0; k < reps; k++) out.push({ ...n, s: n.s + k * len, d: len, v: clampV(n.v - k * 6), g: undefined });
      continue;
    }
    out.push(n);
  }
  if (G) {
    // per beat: stutter (repeat the previous beat) or reverse the beat's pitches
    for (let beat = 1; beat < total / 4; beat++) {
      if (!r.chance(G * 0.3)) continue; const s0 = beat * 4;
      if (r.chance(0.5)) { const prev = out.filter(n => n.s >= s0 - 4 && n.s < s0).map(n => ({ ...n, s: n.s + 4 })); out = out.filter(n => n.s < s0 || n.s >= s0 + 4).concat(prev); }
      else { const seg = out.filter(n => n.s >= s0 && n.s < s0 + 4); const ps = seg.map(n => n.p).reverse(); seg.forEach((n, i) => { n.p = ps[i]; }); }
    }
  }
  out = out.filter(n => n.p >= 0 && n.p <= 127 && n.s < total).map(n => ({ ...n, d: Math.max(1, Math.min(n.d, total - n.s)) }));
  for (const n of out) if (n.g === undefined) delete n.g;
  return out.sort((a, b) => a.s - b.s || a.p - b.p);
}
