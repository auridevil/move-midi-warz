// The DSP engine's take on every Orbits voice: p = { vel, tune (-1..1), dec (s), snap, color (0..1) } → layers for
// dsp-core.js. Same knobs, same meaning as voices.js (decay = length, snap = transient, color = timbre, tune = pitch),
// just rendered with purpose-built drum maths: pitch sweeps with exponential curves, soft-clipped bodies, TPT filters,
// 808-style metallic hats, proper clap bursts.
const mf = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const D = {};
// ---- kicks ----
D.kick = (p) => [
  { kind: 0, wave: 0, f: mf(36 + p.tune * 12) * 1.02, sweep: 6 + p.color * 10, pd: 0.012 + p.color * 0.05, dec: p.dec, att: 0.0005, drive: 0.25 + p.color * 0.3, lp: 2500, q: 0.6, vel: p.vel, gain: 0.95 },
  { kind: 1, dec: 0.012, hp: 1200, lp: 7000, vel: p.vel * p.snap * 0.5, gain: 0.5 },
];
D.kick909 = (p) => [
  { kind: 0, wave: 0, f: mf(38 + p.tune * 12), sweep: 4.5 + p.color * 4, pd: 0.018 + p.color * 0.03, dec: Math.min(0.6, p.dec), att: 0.0003, drive: 0.35, lp: 3000, vel: p.vel, gain: 0.6 },
  { kind: 1, dec: 0.006, hp: 2500, vel: p.vel * (0.4 + p.snap * 0.6), gain: 0.6 },
  { kind: 0, wave: 0, f: mf(38 + p.tune * 12) * 4, sweep: 2, pd: 0.004, dec: 0.02, att: 0.0002, vel: p.vel * p.snap, gain: 0.25 },   // the 909's own tick
];
D.kick808 = (p) => [
  { kind: 0, wave: 0, f: mf(33 + p.tune * 12), sweep: 2.4 + p.snap * 3, pd: 0.03 + p.color * 0.08, dec: 0.2 + p.dec * 1.4, att: 0.0015, drive: 0.15 + p.color * 0.25, lp: 1200 + p.color * 2000, vel: p.vel, gain: 1 },
];
D.hardkick = (p) => [
  { kind: 0, wave: 0, f: mf(36 + p.tune * 12), sweep: 9 + p.snap * 10, pd: 0.02 + p.snap * 0.08, dec: Math.min(0.8, p.dec), att: 0.0003, drive: 0.6 + p.color * 0.4, lp: 1800 + p.color * 4000, q: 1.5, vel: p.vel, gain: 0.85 },
  { kind: 1, dec: 0.02, hp: 800, crush: 5, vel: p.vel * 0.5, gain: 0.35 },
];
D.softkick = (p) => [
  { kind: 0, wave: 0, f: mf(36 + p.tune * 12), sweep: 2.5, pd: 0.04, dec: p.dec, att: 0.004, drive: 0.1, lp: 150 + p.color * 600, q: 0.8, vel: p.vel, gain: 1.1 },
];
D.sub = (p) => [{ kind: 0, wave: 0, f: mf(29 + p.tune * 12), sweep: 1.3, pd: 0.02, dec: p.dec * 1.5 + 0.2, att: 0.005, drive: p.color * 0.3, lp: 400, vel: p.vel, gain: 1 }];
// ---- snares, claps ----
D.snare = (p) => [
  { kind: 0, wave: 1, f: mf(57 + p.tune * 12), sweep: 1.8, pd: 0.012, dec: p.dec * 0.35, att: 0.0005, drive: 0.2, vel: p.vel * (0.4 + (1 - p.color) * 0.6), gain: 0.6 },
  { kind: 0, wave: 0, f: mf(57 + p.tune * 12) * 1.58, sweep: 1.4, pd: 0.01, dec: p.dec * 0.25, vel: p.vel * 0.5, gain: 0.35 },
  { kind: 1, dec: p.dec * 0.6, att: 0.0005, hp: 900 + p.color * 2500, lp: 9000, bq: 0.8, vel: p.vel * (0.35 + p.color * 0.65) * (0.5 + p.snap * 0.5), gain: 0.75 },
];
D.snare808 = (p) => [
  { kind: 0, wave: 0, f: 180 * Math.pow(2, p.tune), sweep: 1.5, pd: 0.01, dec: p.dec * 0.3, vel: p.vel, gain: 0.5 },
  { kind: 0, wave: 0, f: 180 * Math.pow(2, p.tune) * 1.6, sweep: 1.3, pd: 0.01, dec: p.dec * 0.25, vel: p.vel * p.color, gain: 0.4 },
  { kind: 1, dec: p.dec * 0.5, hp: 1500, vel: p.vel * (0.4 + p.snap * 0.6), gain: 0.6 },
];
D.clap = (p) => [
  { kind: 1, pink: 0.5, bp: 1100 + p.color * 900, bq: 1.6, dec: p.dec * 0.8, bursts: 2 + Math.round(p.snap * 3), bsp: 0.011, bsd: 0.012, bgain: 0.75, vel: p.vel, gain: 1.6 },
];
D.brush = (p) => [{ kind: 1, pink: 1, bp: 1500 + p.color * 5000, bq: 0.8, att: 0.005 + (1 - p.snap) * 0.05, dec: 0.1 + p.dec * 0.4, vel: p.vel, gain: 2.2 }];
D.snap2 = (p) => [{ kind: 1, bp: 1500 + p.color * 2500, bq: 3, att: 0.0005, dec: 0.02 + p.dec * 0.06, vel: p.vel, gain: 0.9 }];
D.snap = (p) => [{ kind: 1, att: 0.0003, dec: 0.01 + p.dec * 0.08, hp: 300, vel: p.vel, gain: 0.7 }];
D.rim = (p) => [
  { kind: 0, wave: 3, f: mf(81 + p.tune * 12 + p.color * 7), dec: Math.min(0.12, p.dec * 0.2), att: 0.0003, drive: 0.3, bp: 1800, bq: 2, vel: p.vel, gain: 0.5 },
  { kind: 1, dec: 0.03, hp: 2000, vel: p.vel * p.snap, gain: 0.3 },
];
// ---- toms, hand drums ----
D.tom = (p) => [{ kind: 0, wave: 0, f: mf(55 + p.tune * 24), sweep: 1.6 + p.color * 2.5, pd: 0.03 + p.snap * 0.15, dec: p.dec, att: 0.0005, drive: 0.2, lp: 4000, vel: p.vel, gain: 0.9 }];
D.conga = (p) => [
  { kind: 0, wave: 0, f: mf(52 + p.tune * 12 + p.color * 5), sweep: 1.5, pd: 0.012, dec: 0.08 + p.dec * 0.4, att: 0.0005, drive: 0.15, vel: p.vel, gain: 0.9 },
  { kind: 1, dec: 0.02, hp: 1500, vel: p.vel * (p.snap > 0.3 ? p.snap : 0), gain: 0.25 },
];
D.bongo = (p) => [{ kind: 0, wave: 0, f: mf(64 + p.tune * 12 + p.color * 7), sweep: 1.4, pd: 0.008, dec: 0.05 + p.dec * 0.2, att: 0.0003, drive: 0.2, vel: p.vel, gain: 0.8 }];
D.tabla = (p) => [{ kind: 0, wave: 0, f: mf(50 + p.tune * 12), glide: 1.2 + p.color * 0.6, gd: (0.1 + p.dec * 0.6) * (0.3 + p.snap * 0.5), dec: 0.1 + p.dec * 0.6, att: 0.001, drive: 0.15, vel: p.vel, gain: 0.9 }];
D.cuica = (p) => [{ kind: 0, wave: 1, f: mf(70 + p.tune * 12), sweep: p.color > 0.5 ? 0.7 : 1.3, pd: (0.08 + p.dec * 0.3) * 0.35, dec: 0.08 + p.dec * 0.3, att: 0.01, drive: 0.4, vel: p.vel, gain: 0.6 }];
D.clave = (p) => [{ kind: 0, wave: 0, f: 2500 * Math.pow(2, p.tune * 0.5 + p.color * 0.3), dec: 0.02 + p.dec * 0.08, att: 0.0003, vel: p.vel, gain: 0.7 }];
D.wood = (p) => [
  { kind: 0, wave: 0, f: mf(60 + p.tune * 24), sweep: 1.15, pd: 0.004, dec: 0.03 + p.dec * 0.25, att: 0.0003, lp: 800 + p.color * 6000, q: 1.2, vel: p.vel, gain: 0.8 },
  { kind: 1, dec: 0.008, bp: 2000 + p.color * 3000, bq: 1.5, vel: p.vel * (0.2 + p.snap * 0.8), gain: 0.7 },
];
D.cowbell = (p) => { const f = 560 * Math.pow(2, p.tune); return [{ kind: 0, wave: 3, f, f2: 1.45 + p.color * 0.2, g2: 0.8, dec: p.dec * 0.5, att: 0.0005, drive: 0.25, bp: f * 1.3, bq: 1.4, vel: p.vel, gain: 0.4 }]; };
// ---- cymbals ----
D.hat = (p) => [
  { kind: 2, f: 205 * Math.pow(2, p.tune + (p.color - 0.5) * 0.6), dec: p.dec * 0.5, att: 0.0005, hp: 5000 + p.snap * 3000, bp: 9000, bq: 0.9, noise: p.color > 0.6 ? (p.color - 0.6) * 1.2 : 0, vel: p.vel, gain: 4.5 },
];
D.ophat = (p) => [
  { kind: 2, f: 205 * Math.pow(2, p.tune), dec: 0.15 + p.dec * 0.6, att: 0.001, hp: 4000 + p.color * 3000, bp: 8000, bq: 0.8, noise: 0.25, vel: p.vel, gain: 3.5 },
];
D.ride = (p) => [
  { kind: 2, f: 320 * Math.pow(2, p.tune + (p.color - 0.5) * 0.5), dec: 0.4 + p.dec * 1.6, att: 0.0005, hp: 3000, bp: 6500, bq: 0.6, noise: 0.35, vel: p.vel * (0.6 + p.snap * 0.4), gain: 2.6 },
  { kind: 0, wave: 0, f: 2900 * Math.pow(2, p.tune), dec: 0.1 + p.dec * 0.3, att: 0.0003, vel: p.vel * p.snap, gain: 0.12 },   // the stick's ping
];
D.crash = (p) => [
  { kind: 2, f: 260 * Math.pow(2, p.tune), dec: 0.5 + p.dec * 2, att: 0.002, hp: 2500 + p.color * 5000, bp: 7000, bq: 0.5, noise: 0.5, vel: p.vel * 0.7, gain: 1.6 },
  { kind: 1, dec: 0.5 + p.dec * 2, att: 0.002, hp: 2500 + p.color * 5000, vel: p.vel * 0.8, gain: 0.5 },
];
D.tamb = (p) => [
  { kind: 2, f: 700 * Math.pow(2, p.tune), dec: 0.05 + p.dec * 0.25, att: 0.001, hp: 6000, bursts: 2 + Math.round(p.snap * 3), bsp: 0.012, bsd: 0.02, bgain: 0.8, vel: p.vel * 0.6, gain: 1.6 },
  { kind: 1, dec: 0.05 + p.dec * 0.25, att: 0.002, hp: 6000, vel: p.vel, gain: 0.6 },
];
D.shaker = (p) => [{ kind: 1, pink: 0.6, att: 0.003 + (1 - p.snap) * 0.03, dec: 0.03 + p.dec * 0.15, hp: 2500 + p.color * 4000, vel: p.vel, gain: 1.1 }];
// ---- mallets, tonal ----
D.blip = (p) => [{ kind: 0, wave: p.color > 0.5 ? 1 : 0, f: mf(84 + p.tune * 24 + Math.round(p.snap * 12)), dec: Math.min(0.3, p.dec * 0.3), att: 0.0005, vel: p.vel, gain: 0.5 }];
D.bell = (p) => [{ kind: 0, wave: 0, f: mf(72 + p.tune * 24), pm: 0.6 + p.snap * 2.5, pmr: 2.5 + p.color * 4.01, pmd: p.dec, dec: p.dec * 2, att: 0.0005, vel: p.vel, gain: 0.45 }];
D.gong = (p) => [
  { kind: 2, f: 48 * Math.pow(2, p.tune), dec: p.dec * 3, att: 0.002, lp: 2500 + p.color * 3000, q: 0.7, noise: 0.1, vel: p.vel * 0.9, gain: 0.5 },
  { kind: 0, wave: 0, f: mf(48 + p.tune * 12), pm: 1 + p.snap * 3, pmr: 1.2 + p.color * 3, pmd: p.dec * 1.5, dec: p.dec * 3, att: 0.003, vel: p.vel * 0.8, gain: 0.35 },
];
D.marimba = (p) => [{ kind: 0, wave: 0, f: mf(60 + p.tune * 24 + Math.round(p.color * 12)), pm: 0.3 + p.snap * 1.5, pmr: 4, pmd: 0.08, dec: 0.2 + p.dec, att: 0.0005, vel: p.vel, gain: 0.8 }];
D.steel = (p) => [{ kind: 0, wave: 0, f: mf(67 + p.tune * 24), pm: 1.5, pmr: 1.9 + p.color * 0.4, pmd: 0.3, dec: 0.3 + p.dec * 1.2, att: 0.002, vel: p.vel, gain: 0.6 }];
D.kalimba = (p) => [
  { kind: 0, wave: 0, f: mf(72 + p.tune * 24), pm: 0.4, pmr: 6.1, pmd: 0.03, dec: 0.15 + p.dec * 1, att: 0.0005, vel: p.vel, gain: 0.7 },
  { kind: 1, dec: 0.004, bp: 2000 + p.color * 6000, bq: 2, vel: p.vel * 0.5, gain: 0.5 },
];
// ---- electronic ----
D.zap = (p) => { const f = mf(48 + p.tune * 24), d = Math.max(0.05, p.dec * 0.4); return [{ kind: 0, wave: 2, f: f * (0.5 + p.color), sweep: (4 + p.snap * 12) / (0.5 + p.color), pd: d * 0.25, dec: d, att: 0.0005, drive: 0.2, lp: 6000, vel: p.vel, gain: 0.35 }]; };
D.laser = (p) => { const f = mf(72 + p.tune * 24), d = 0.05 + p.dec * 0.3; return [{ kind: 0, wave: 3, f: f * (0.25 + p.color), sweep: 4 / (0.25 + p.color), pd: d * 0.4, dec: d, att: 0.0005, lp: 5000, vel: p.vel, gain: 0.2 }]; };
D.click = (p) => [{ kind: 0, wave: 3, f: mf(96 + p.tune * 12 + p.color * 12), dec: 0.006, att: 0.0002, vel: p.vel, gain: 0.6 }];
D.glitch = (p) => [{ kind: 1, crush: 2 + Math.round((1 - p.color) * 6), dec: 0.01 + p.dec * 0.05, att: 0.0005, bursts: 1 + Math.round(p.snap * 5), bsp: 0.015 + p.dec * 0.02, bsd: 0.01 + p.dec * 0.05, bgain: 0.8, hp: 300, vel: p.vel, gain: 0.35 }];
D.vinyl = (p) => [{ kind: 1, pink: 1, bp: 1000 + p.color * 6000, bq: 1.5, att: 0.0003, dec: 0.004 + p.dec * 0.01, bursts: 1 + Math.round(p.snap * 4), bsp: 0.02, bsd: 0.004 + p.dec * 0.01, bgain: 0.85, vel: p.vel, gain: 2.5 }];
D.noiseburst = (p) => [{ kind: 1, att: 0.005, dec: 0.05 + p.dec * 0.5, lp: 200 + p.color * 2000, q: 2.5, lfo: 2 + p.snap * 20, lfod: 4, vel: p.vel, gain: 0.5 }];
export const DSP_VOICES = D;
export const DSP_KEYS = Object.keys(D);
