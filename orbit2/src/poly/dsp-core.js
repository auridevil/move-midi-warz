// Orbits DSP engine: the maths behind the AudioWorklet voices, pure and allocation-free so it can run in the audio
// thread (dsp-worklet.js) and in Node tests. A hit is one or more *layers*; a layer is a plain object of numbers:
//   kind: 0 tone | 1 noise | 2 metal        vel 0..1   gain (layer level)   att (s)   dec (s, time to −60 dB)
//   tone:  wave 0 sine 1 tri 2 saw 3 square · f (Hz, where the pitch lands) · sweep (start = f·sweep, falls over pd s)
//          glide (end = f·glide, linear over gd s) · pm/pmr/pmd (phase modulation: index, ratio, index decay s)
//          f2/g2 (a second oscillator, ratio and level) · drive (0..1 soft clip) · lp/hp (Hz, 0 = off) · q
//   noise: pink (0..1 mix) · bp/bq (band-pass) · lp/hp · crush (bits, 0 = off) · bursts/bsp/bsd/bgain (claps)
//          lfo/lfod (low-pass wobble, Hz and octaves)
//   metal: six square waves at the 808 hat ratios × f · hp/bp/bq · noise (mix of white noise)
// Each slot keeps its own state; render() adds into the output. No objects are created after init().
const RATIOS = [1, 1.4827, 1.8003, 2.5461, 2.6303, 3.8967];   // 205.3 · 304.4 · 369.6 · 522.7 · 540 · 800 Hz
const TAU = Math.PI * 2;
const clip = (x) => (x > 3 ? 1 : x < -3 ? -1 : x * (27 + x * x) / (27 + 9 * x * x));   // tanh-ish, cheap

/** A voice slot: every field it will ever need, so triggering never allocates. */
export function makeSlot() {
  return {
    active: false, kind: 0, born: 0, t: 0, start: 0,
    vel: 0, gain: 1, env: 0, envK: 1, attN: 0, attInc: 0, dec: 0,
    // tone
    wave: 0, f: 100, freq: 100, sweep: 1, pe: 0, peK: 1, glide: 1, gdN: 0, pm: 0, pmr: 1, pmd: 0, pme: 0, pmeK: 1, f2: 0, g2: 0, drive: 0,
    ph: 0, ph2: 0, phm: 0,
    // noise
    pink: 0, rng: 0x9e3779b9, b0: 0, b1: 0, b2: 0, crush: 0, hold: 0, held: 0, holdN: 1,
    bursts: 0, bsp: 0, bsd: 0, bgain: 1, nextBurst: -1, burstsLeft: 0, lfo: 0, lfod: 0, lfoPh: 0, lpBase: 0,
    // metal
    p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, nmix: 0,
    // filters (two TPT state-variable filters: A = low/band, B = high)
    lp: 0, hp: 0, bp: 0, q: 0.7, bq: 1,
    aG: 0, aK: 1, aA1: 0, aA2: 0, aA3: 0, aS1: 0, aS2: 0, aMode: 0,   // mode 0 off 1 lp 2 bp
    bG: 0, bK: 1, bA1: 0, bA2: 0, bA3: 0, bS1: 0, bS2: 0, bOn: false,
    sr: 44100,
  };
}

function svfA(s, fc, q) { fc = Math.min(fc, s.sr * 0.45); const g = Math.tan(Math.PI * fc / s.sr), k = 1 / Math.max(0.3, q); s.aA1 = 1 / (1 + g * (g + k)); s.aA2 = g * s.aA1; s.aA3 = g * s.aA2; s.aK = k; }
function svfB(s, fc, q) { fc = Math.min(fc, s.sr * 0.45); const g = Math.tan(Math.PI * fc / s.sr), k = 1 / Math.max(0.3, q); s.bA1 = 1 / (1 + g * (g + k)); s.bA2 = g * s.bA1; s.bA3 = g * s.bA2; s.bK = k; }
function runA(s, x) { const v3 = x - s.aS2, v1 = s.aA1 * s.aS1 + s.aA2 * v3, v2 = s.aS2 + s.aA2 * s.aS1 + s.aA3 * v3; s.aS1 = 2 * v1 - s.aS1; s.aS2 = 2 * v2 - s.aS2; return s.aMode === 1 ? v2 : v1; }
function runB(s, x) { const v3 = x - s.bS2, v1 = s.bA1 * s.bS1 + s.bA2 * v3, v2 = s.bS2 + s.bA2 * s.bS1 + s.bA3 * v3; s.bS1 = 2 * v1 - s.bS1; s.bS2 = 2 * v2 - s.bS2; return x - s.bK * v1 - v2; }

/** Start a layer in a slot. `start` = sample offset inside the next block, `born` = a running counter for voice stealing. */
export function trigger(s, L, sr, start, born) {
  s.active = true; s.sr = sr; s.t = 0; s.start = start; s.born = born; s.kind = L.kind | 0;
  s.vel = L.vel ?? 1; s.gain = L.gain ?? 0.5; s.dec = Math.max(0.004, L.dec ?? 0.2); s.envK = Math.exp(-6.9 / (s.dec * sr));
  const att = L.att ?? 0.0005; s.attN = Math.max(1, Math.round(att * sr)); s.attInc = s.vel / s.attN; s.env = 0;
  s.wave = L.wave | 0; s.f = L.f ?? 100; s.sweep = L.sweep ?? 1; s.pe = 1; s.peK = Math.exp(-1 / (Math.max(0.001, L.pd ?? 0.03) * sr));
  s.glide = L.glide ?? 1; s.gdN = Math.max(1, Math.round((L.gd ?? 0.1) * sr)); s.freq = s.f * s.sweep;
  s.pm = L.pm ?? 0; s.pmr = L.pmr ?? 1; s.pme = 1; s.pmeK = Math.exp(-1 / (Math.max(0.001, L.pmd ?? 0.2) * sr)); s.f2 = L.f2 ?? 0; s.g2 = L.g2 ?? 0; s.drive = L.drive ?? 0;
  s.ph = 0; s.ph2 = 0; s.phm = 0;
  s.pink = L.pink ?? 0; s.b0 = s.b1 = s.b2 = 0; s.crush = L.crush ?? 0; s.hold = 0; s.held = 0; s.holdN = s.crush ? Math.max(1, Math.round(8 - s.crush * 0.8)) : 1;
  s.bursts = L.bursts ?? 0; s.bsp = Math.max(1, Math.round((L.bsp ?? 0.011) * sr)); s.bsd = L.bsd ?? 0.012; s.bgain = L.bgain ?? 0.7; s.burstsLeft = s.bursts > 1 ? s.bursts - 1 : 0; s.nextBurst = s.burstsLeft ? s.bsp : -1;
  if (s.burstsLeft) s.envK = Math.exp(-6.9 / (s.bsd * sr));   // the early bursts are short; the last one takes the real decay
  s.lfo = L.lfo ?? 0; s.lfod = L.lfod ?? 0; s.lfoPh = 0; s.nmix = L.noise ?? 0;
  s.p0 = 0; s.p1 = 0.17; s.p2 = 0.41; s.p3 = 0.63; s.p4 = 0.79; s.p5 = 0.93;
  // filters
  s.lp = L.lp ?? 0; s.hp = L.hp ?? 0; s.bp = L.bp ?? 0; s.q = L.q ?? 0.7; s.bq = L.bq ?? 1; s.aS1 = s.aS2 = s.bS1 = s.bS2 = 0;
  s.lpBase = s.lp; s.aMode = s.bp ? 2 : s.lp ? 1 : 0; if (s.aMode) svfA(s, s.bp || s.lp, s.bp ? s.bq : s.q);
  s.bOn = s.hp > 0; if (s.bOn) svfB(s, s.hp, 0.7);
}

/** Render samples [from, to) of the block, adding into `out`. Returns false once the slot has gone silent. */
export function render(s, out, from, to) {
  if (!s.active) return false;
  const sr = s.sr, kind = s.kind; let t = s.t, env = s.env;
  for (let i = from; i < to; i++) {
    // amplitude envelope: linear attack, then exponential decay (re-triggered by bursts)
    if (t < s.attN) env += s.attInc; else env *= s.envK;
    if (s.nextBurst > 0 && t === s.nextBurst) { env = s.vel * Math.pow(s.bgain, s.bursts - s.burstsLeft); s.burstsLeft--; s.nextBurst = s.burstsLeft ? s.nextBurst + s.bsp : -1; if (!s.burstsLeft) s.envK = Math.exp(-6.9 / (s.dec * sr)); }
    let x;
    if (kind === 0) {
      s.pe *= s.peK; let f = s.f * (1 + (s.sweep - 1) * s.pe); if (s.glide !== 1) f *= 1 + (s.glide - 1) * Math.min(1, t / s.gdN);
      let ph = s.ph + f / sr; if (ph >= 1) ph -= 1; s.ph = ph;
      if (s.pm) { let pm = s.phm + f * s.pmr / sr; if (pm >= 1) pm -= 1; s.phm = pm; s.pme *= s.pmeK; ph += s.pm * s.pme * Math.sin(TAU * pm) / TAU; ph -= Math.floor(ph); }
      x = s.wave === 0 ? Math.sin(TAU * ph) : s.wave === 1 ? (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) : s.wave === 2 ? 2 * ph - 1 : (ph < 0.5 ? 1 : -1);
      if (s.g2) { let p2 = s.ph2 + f * s.f2 / sr; if (p2 >= 1) p2 -= 1; s.ph2 = p2; x += s.g2 * (s.wave === 3 ? (p2 < 0.5 ? 1 : -1) : Math.sin(TAU * p2)); }
      if (s.drive) x = clip(x * (1 + s.drive * 8)) * (1 - s.drive * 0.35);
    } else {
      // xorshift32 white noise
      let r = s.rng; r ^= r << 13; r ^= r >>> 17; r ^= r << 5; s.rng = r; const w = (r >>> 0) / 2147483648 - 1;
      if (kind === 1) {
        x = w;
        if (s.pink) { s.b0 = 0.99765 * s.b0 + w * 0.0990460; s.b1 = 0.96300 * s.b1 + w * 0.2965164; s.b2 = 0.57000 * s.b2 + w * 1.0526913; const p = (s.b0 + s.b1 + s.b2 + w * 0.1848) * 0.25; x = w * (1 - s.pink) + p * s.pink; }
        if (s.crush) { if (s.hold-- <= 0) { s.hold = s.holdN; const q = 1 << s.crush; s.held = Math.round(x * q) / q; } x = s.held; }
        if (s.lfo && (t & 31) === 0) { s.lfoPh += 32 * s.lfo / sr; svfA(s, s.lpBase * Math.pow(2, s.lfod * Math.sin(TAU * s.lfoPh)), s.q); }
      } else {
        const f = s.f / sr; s.p0 += f * RATIOS[0]; s.p1 += f * RATIOS[1]; s.p2 += f * RATIOS[2]; s.p3 += f * RATIOS[3]; s.p4 += f * RATIOS[4]; s.p5 += f * RATIOS[5];
        if (s.p0 >= 1) s.p0 -= 1; if (s.p1 >= 1) s.p1 -= 1; if (s.p2 >= 1) s.p2 -= 1; if (s.p3 >= 1) s.p3 -= 1; if (s.p4 >= 1) s.p4 -= 1; if (s.p5 >= 1) s.p5 -= 1;
        x = ((s.p0 < 0.5 ? 1 : -1) + (s.p1 < 0.5 ? 1 : -1) + (s.p2 < 0.5 ? 1 : -1) + (s.p3 < 0.5 ? 1 : -1) + (s.p4 < 0.5 ? 1 : -1) + (s.p5 < 0.5 ? 1 : -1)) * 0.1667;
        if (s.nmix) x = x * (1 - s.nmix) + w * s.nmix;
      }
    }
    if (s.aMode) x = runA(s, x); if (s.bOn) x = runB(s, x);
    out[i] += x * env * s.gain; t++;
  }
  s.t = t; s.env = env;
  if (t > s.attN && env < 1e-4 && s.nextBurst < 0) { s.active = false; return false; }
  return true;
}

/** A pool of slots for one lane: trigger layers (stealing the oldest when full) and render all active ones. */
export function makeEngine(sr, size = 24) {
  const slots = Array.from({ length: size }, makeSlot); let born = 0;
  const pick = () => { let best = null; for (const s of slots) { if (!s.active) return s; if (!best || s.born < best.born) best = s; } return best; };
  return {
    slots,
    hit(layers, start = 0) { for (const L of layers) trigger(pick(), L, sr, start, born++); },
    render(out, from = 0, to = out.length) { let any = false; for (const s of slots) if (s.active) { const st = s.t === 0 ? Math.max(from, s.start) : from; if (st < to) any = render(s, out, st, to) || any; } return any; },
    active() { let n = 0; for (const s of slots) if (s.active) n++; return n; },
  };
}
