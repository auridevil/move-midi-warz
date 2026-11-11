// Voice library for Orbits. Each voice: make(T, out) → nodes (connected to `out`), hit(T, nodes, p, time) where
// p = { vel, tune (-1..1), dec (seconds), snap, color (0..1) } already derived from the lane's sound params.
const mf = (T, midi) => T.Frequency(midi, 'midi').toFrequency();
const V = {};
V.kick = { label: 'kick', make: (T, out) => ({ body: new T.MembraneSynth({ pitchDecay: 0.04, octaves: 7, envelope: { attack: 0.001, decay: 0.35, sustain: 0 }, volume: -2 }).connect(out), click: new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.02, sustain: 0 }, volume: -18 }).connect(out) }),
  hit: (T, n, p, t) => { n.body.set({ pitchDecay: 0.01 + p.color * 0.12, envelope: { decay: p.dec } }); n.body.triggerAttackRelease(mf(T, 36 + p.tune * 12), p.dec, t, p.vel); if (p.snap > 0.05) n.click.triggerAttackRelease(0.02, t, p.vel * p.snap); } };
V.sub = { label: 'sub', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.6, sustain: 0.2, release: 0.3 }, volume: 0 }).connect(out) }),
  hit: (T, n, p, t) => { n.o.set({ envelope: { decay: p.dec * 1.5, sustain: p.color * 0.4 } }); n.o.triggerAttackRelease(mf(T, 29 + p.tune * 12), p.dec * 1.5, t, p.vel); } };
V.snare = { label: 'snare', make: (T, out) => ({ noise: new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -8 }).connect(out), body: new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 }, volume: -12 }).connect(out) }),
  hit: (T, n, p, t) => { n.noise.set({ envelope: { decay: p.dec * 0.6 } }); n.body.set({ envelope: { decay: p.dec * 0.35 } }); n.noise.triggerAttackRelease(p.dec * 0.6, t, p.vel * (0.3 + p.color * 0.7)); n.body.triggerAttackRelease(mf(T, 57 + p.tune * 12), p.dec * 0.35, t, p.vel * (0.4 + (1 - p.color) * 0.6) * (0.5 + p.snap * 0.5)); } };
V.clap = { label: 'clap', make: (T, out) => ({ n: new T.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.09, sustain: 0 }, volume: -6 }).connect(out) }),
  hit: (T, n, p, t) => { const bursts = 2 + Math.round(p.snap * 3); for (let i = 0; i < bursts; i++) n.n.triggerAttackRelease(i === bursts - 1 ? p.dec * 0.8 : 0.02, t + i * 0.011, p.vel * (i === bursts - 1 ? 1 : 0.6)); } };
V.rim = { label: 'rim', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 }, volume: -10 }).connect(out), c: new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -14 }).connect(out) }),
  hit: (T, n, p, t) => { n.o.triggerAttackRelease(mf(T, 81 + p.tune * 12 + p.color * 7), Math.min(0.12, p.dec * 0.2), t, p.vel); n.c.triggerAttackRelease(0.03, t, p.vel * p.snap); } };
V.tom = { label: 'tom', make: (T, out) => ({ m: new T.MembraneSynth({ pitchDecay: 0.08, octaves: 3, envelope: { attack: 0.001, decay: 0.4, sustain: 0 }, volume: -4 }).connect(out) }),
  hit: (T, n, p, t) => { n.m.set({ pitchDecay: 0.03 + p.snap * 0.15, octaves: 1 + p.color * 4, envelope: { decay: p.dec } }); n.m.triggerAttackRelease(mf(T, 55 + p.tune * 24), p.dec, t, p.vel); } };
V.hat = { label: 'hat', make: (T, out) => ({ m: new T.MetalSynth({ envelope: { attack: 0.001, decay: 0.08, release: 0.02 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5, volume: -16 }).connect(out), n: new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.05, sustain: 0 }, volume: -22 }).connect(out) }),
  hit: (T, n, p, t) => { const d = p.artic === 1 ? 0.15 + p.dec * 0.6 : p.dec * 0.5; n.m.set({ envelope: { decay: d }, harmonicity: 3 + p.color * 6, modulationIndex: 10 + p.snap * 50 }); n.m.triggerAttackRelease(mf(T, 84 + p.tune * 12), d, t, p.vel * 0.8); if (p.color > 0.6) n.n.triggerAttackRelease(p.dec * 0.3, t, p.vel * (p.color - 0.6)); } };   // artic 1 = open
V.shaker = { label: 'shaker', make: (T, out) => ({ n: new T.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.01, decay: 0.07, sustain: 0 }, volume: -14 }).connect(out) }),
  hit: (T, n, p, t) => { n.n.set({ envelope: { attack: 0.003 + (1 - p.snap) * 0.03, decay: 0.03 + p.dec * 0.15 } }); n.n.triggerAttackRelease(0.03 + p.dec * 0.15, t, p.vel); } };
V.cowbell = { label: 'cowbell', make: (T, out) => ({ a: new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.3, sustain: 0 }, volume: -16 }).connect(out), b: new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.3, sustain: 0 }, volume: -16 }).connect(out) }),
  hit: (T, n, p, t) => { const f = 560 * Math.pow(2, p.tune); n.a.set({ envelope: { decay: p.dec * 0.5 } }); n.b.set({ envelope: { decay: p.dec * 0.5 } }); n.a.triggerAttackRelease(f, p.dec * 0.5, t, p.vel); n.b.triggerAttackRelease(f * (1.45 + p.color * 0.2), p.dec * 0.5, t, p.vel * 0.8); } };
V.wood = { label: 'wood', make: (T, out) => ({ p: new T.PluckSynth({ attackNoise: 2, dampening: 3000, resonance: 0.7, volume: -4 }).connect(out) }),
  hit: (T, n, p, t) => { n.p.set({ dampening: 800 + p.color * 6000, resonance: Math.min(0.99, 0.4 + p.dec * 0.55), attackNoise: 0.5 + p.snap * 4 }); n.p.triggerAttackRelease(mf(T, 60 + p.tune * 24), p.dec, t, p.vel); } };
V.blip = { label: 'blip', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0 }, volume: -8 }).connect(out) }),
  hit: (T, n, p, t) => { n.o.set({ oscillator: { type: p.color > 0.5 ? 'triangle' : 'sine' }, envelope: { decay: Math.min(0.3, p.dec * 0.3) } }); n.o.triggerAttackRelease(mf(T, 84 + p.tune * 24 + Math.round(p.snap * 12)), Math.min(0.3, p.dec * 0.3), t, p.vel); } };
V.bell = { label: 'bell', make: (T, out) => ({ f: new T.FMSynth({ harmonicity: 3.5, modulationIndex: 12, envelope: { attack: 0.001, decay: 1.2, sustain: 0 }, modulationEnvelope: { attack: 0.001, decay: 0.6, sustain: 0 }, volume: -12 }).connect(out) }),
  hit: (T, n, p, t) => { n.f.set({ harmonicity: 2.5 + p.color * 4.01, modulationIndex: 4 + p.snap * 20, envelope: { decay: p.dec * 2 } }); n.f.triggerAttackRelease(mf(T, 72 + p.tune * 24), p.dec * 2, t, p.vel); } };
V.gong = { label: 'gong', make: (T, out) => ({ m: new T.MetalSynth({ envelope: { attack: 0.002, decay: 1.5, release: 0.5 }, harmonicity: 1.4, modulationIndex: 20, resonance: 800, octaves: 2, volume: -18 }).connect(out) }),
  hit: (T, n, p, t) => { n.m.set({ envelope: { decay: p.dec * 3 }, harmonicity: 1.2 + p.color * 3, modulationIndex: 8 + p.snap * 30 }); n.m.triggerAttackRelease(mf(T, 48 + p.tune * 12), p.dec * 3, t, p.vel * 0.9); } };
V.zap = { label: 'zap', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0 }, volume: -10 }).connect(out) }),
  hit: (T, n, p, t) => { const f = mf(T, 48 + p.tune * 24), d = Math.max(0.05, p.dec * 0.4); n.o.set({ envelope: { decay: d } }); n.o.oscillator.frequency.setValueAtTime(f * (4 + p.snap * 12), t); n.o.oscillator.frequency.exponentialRampToValueAtTime(f * (0.5 + p.color), t + d * 0.6); n.o.triggerAttackRelease(f, d, t, p.vel); } };
V.glitch = { label: 'glitch', make: (T, out) => { const cr = new T.BitCrusher({ bits: 4 }).connect(out); return { cr, n: new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0 }, volume: -10 }).connect(cr) }; },
  hit: (T, n, p, t) => { n.cr.bits = 2 + Math.round((1 - p.color) * 6); const k = 1 + Math.round(p.snap * 5); for (let i = 0; i < k; i++) n.n.triggerAttackRelease(0.01 + p.dec * 0.05, t + i * (0.015 + p.dec * 0.02), p.vel * (1 - i / (k + 1))); } };
V.snap = { label: 'snap', make: (T, out) => ({ n: new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.03, sustain: 0 }, volume: -6 }).connect(out) }),
  hit: (T, n, p, t) => { n.n.set({ envelope: { decay: 0.01 + p.dec * 0.08 } }); n.n.triggerAttackRelease(0.01 + p.dec * 0.08, t, p.vel); } };
// ---- more kicks ----
V.kick909 = { label: 'kick 909', make: (T, out) => ({ body: new T.MembraneSynth({ pitchDecay: 0.02, octaves: 5, envelope: { attack: 0.001, decay: 0.25, sustain: 0 }, volume: -2 }).connect(out), click: new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.008, sustain: 0 }, volume: -8 }).connect(out) }),
  hit: (T, n, p, t) => { n.body.set({ pitchDecay: 0.01 + p.color * 0.05, envelope: { decay: Math.min(0.6, p.dec) } }); n.body.triggerAttackRelease(mf(T, 38 + p.tune * 12), Math.min(0.6, p.dec), t, p.vel); n.click.triggerAttackRelease(0.008, t, p.vel * (0.4 + p.snap * 0.6)); } };
V.kick808 = { label: 'kick 808', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 0.2 }, volume: 0 }).connect(out) }),
  hit: (T, n, p, t) => { const f = mf(T, 33 + p.tune * 12), d = 0.2 + p.dec * 1.4; n.o.set({ envelope: { decay: d } }); n.o.oscillator.frequency.setValueAtTime(f * (2 + p.snap * 3), t); n.o.oscillator.frequency.exponentialRampToValueAtTime(f, t + 0.03 + p.color * 0.08); n.o.triggerAttackRelease(f, d, t, p.vel); } };
V.hardkick = { label: 'hard kick', make: (T, out) => { const dist = new T.Distortion({ distortion: 0.85, wet: 1 }).connect(out); return { dist, body: new T.MembraneSynth({ pitchDecay: 0.05, octaves: 8, envelope: { attack: 0.001, decay: 0.35, sustain: 0 }, volume: -4 }).connect(dist) }; },
  hit: (T, n, p, t) => { n.dist.distortion = 0.5 + p.color * 0.5; n.body.set({ pitchDecay: 0.02 + p.snap * 0.08, envelope: { decay: Math.min(0.8, p.dec) } }); n.body.triggerAttackRelease(mf(T, 36 + p.tune * 12), Math.min(0.8, p.dec), t, p.vel); } };
V.softkick = { label: 'soft kick', make: (T, out) => { const lp = new T.Filter({ type: 'lowpass', frequency: 300 }).connect(out); return { lp, body: new T.MembraneSynth({ pitchDecay: 0.06, octaves: 3, envelope: { attack: 0.003, decay: 0.3, sustain: 0 }, volume: 0 }).connect(lp) }; },
  hit: (T, n, p, t) => { n.lp.frequency.value = 150 + p.color * 600; n.body.set({ envelope: { decay: p.dec } }); n.body.triggerAttackRelease(mf(T, 36 + p.tune * 12), p.dec, t, p.vel * 0.9); } };
// ---- snares, claps ----
V.snare808 = { label: 'snare 808', make: (T, out) => { const hp = new T.Filter({ type: 'highpass', frequency: 1500 }).connect(out); return { hp, n: new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -10 }).connect(hp), a: new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0 }, volume: -6 }).connect(out), b: new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0 }, volume: -9 }).connect(out) }; },
  hit: (T, n, p, t) => { const f = 180 * Math.pow(2, p.tune); n.n.triggerAttackRelease(p.dec * 0.5, t, p.vel * (0.4 + p.snap * 0.6)); n.a.triggerAttackRelease(f, p.dec * 0.3, t, p.vel); n.b.triggerAttackRelease(f * 1.6, p.dec * 0.25, t, p.vel * p.color); } };
V.brush = { label: 'brush', make: (T, out) => { const bp = new T.Filter({ type: 'bandpass', frequency: 3000, Q: 0.8 }).connect(out); return { bp, n: new T.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.02, decay: 0.25, sustain: 0 }, volume: 2 }).connect(bp) }; },
  hit: (T, n, p, t) => { n.bp.frequency.value = 1500 + p.color * 5000; n.n.set({ envelope: { attack: 0.005 + (1 - p.snap) * 0.05, decay: 0.1 + p.dec * 0.4 } }); n.n.triggerAttackRelease(0.1 + p.dec * 0.4, t, p.vel); } };
V.snap2 = { label: 'finger snap', make: (T, out) => { const bp = new T.Filter({ type: 'bandpass', frequency: 2200, Q: 3 }).connect(out); return { bp, n: new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.05, sustain: 0 }, volume: 6 }).connect(bp) }; },
  hit: (T, n, p, t) => { n.bp.frequency.value = 1500 + p.color * 2500; n.n.triggerAttackRelease(0.02 + p.dec * 0.06, t, p.vel); } };
// ---- cymbals ----
V.ophat = { label: 'open hat', make: (T, out) => ({ m: new T.MetalSynth({ envelope: { attack: 0.002, decay: 0.4, release: 0.1 }, harmonicity: 5.1, modulationIndex: 40, resonance: 5000, octaves: 1.5, volume: -18 }).connect(out) }),
  hit: (T, n, p, t) => { n.m.set({ envelope: { decay: 0.15 + p.dec * 0.6 }, resonance: 3000 + p.color * 5000 }); n.m.triggerAttackRelease(mf(T, 86 + p.tune * 12), 0.15 + p.dec * 0.6, t, p.vel * 0.8); } };
V.ride = { label: 'ride', make: (T, out) => ({ m: new T.MetalSynth({ envelope: { attack: 0.001, decay: 1.2, release: 0.4 }, harmonicity: 7.2, modulationIndex: 18, resonance: 6500, octaves: 1, volume: -22 }).connect(out) }),
  hit: (T, n, p, t) => { n.m.set({ envelope: { decay: 0.4 + p.dec * 1.6 }, harmonicity: 5 + p.color * 5 }); n.m.triggerAttackRelease(mf(T, 90 + p.tune * 12), 0.4 + p.dec * 1.6, t, p.vel * (0.6 + p.snap * 0.4)); } };
V.crash = { label: 'crash', make: (T, out) => { const hp = new T.Filter({ type: 'highpass', frequency: 4000 }).connect(out); return { hp, n: new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.5, sustain: 0 }, volume: -16 }).connect(hp), m: new T.MetalSynth({ envelope: { attack: 0.002, decay: 1.4, release: 0.5 }, harmonicity: 3.1, modulationIndex: 40, resonance: 4200, octaves: 2, volume: -24 }).connect(out) }; },
  hit: (T, n, p, t) => { const d = 0.5 + p.dec * 2; n.hp.frequency.value = 2500 + p.color * 5000; n.n.triggerAttackRelease(d, t, p.vel * 0.8); n.m.set({ envelope: { decay: d } }); n.m.triggerAttackRelease(mf(T, 80 + p.tune * 12), d, t, p.vel * 0.6); } };
V.tamb = { label: 'tambourine', make: (T, out) => { const hp = new T.Filter({ type: 'highpass', frequency: 6000 }).connect(out); return { hp, n: new T.NoiseSynth({ envelope: { attack: 0.002, decay: 0.12, sustain: 0 }, volume: -10 }).connect(hp), m: new T.MetalSynth({ envelope: { attack: 0.001, decay: 0.15, release: 0.05 }, harmonicity: 8, modulationIndex: 20, resonance: 7000, octaves: 0.5, volume: -26 }).connect(out) }; },
  hit: (T, n, p, t) => { const d = 0.05 + p.dec * 0.25; n.n.triggerAttackRelease(d, t, p.vel); for (let i = 0; i < 2 + Math.round(p.snap * 3); i++) n.m.triggerAttackRelease(mf(T, 96 + p.tune * 12), d, t + i * 0.012, p.vel * 0.5); } };
// ---- hand percussion ----
// conga / bongo: open (the lane's sound), mute (a hand left on the skin: short, a touch higher), slap (high, cracking:
// its own crack, white noise through a high-pass, so a slap peaks above the open tone, as the dsp twin does)
const crackLayer = (T, out, hz, decay) => { const hp = new T.Filter({ type: 'highpass', frequency: hz }).connect(out); return { hp, crack: new T.NoiseSynth({ envelope: { attack: 0.0005, decay, sustain: 0 }, volume: -5 }).connect(hp) }; };
V.conga = { label: 'conga', make: (T, out) => ({ ...crackLayer(T, out, 1200, 0.03), m: new T.MembraneSynth({ pitchDecay: 0.015, octaves: 1.5, envelope: { attack: 0.001, decay: 0.3, sustain: 0 }, volume: -4 }).connect(out), slap: new T.NoiseSynth({ envelope: { attack: 0.001, decay: 0.02, sustain: 0 }, volume: -18 }).connect(out) }),
  hit: (T, n, p, t) => { const a = p.artic ?? 0, d = [0.08 + p.dec * 0.4, 0.03 + p.dec * 0.05, 0.04 + p.dec * 0.08][a]; n.m.set({ envelope: { decay: d } }); n.m.triggerAttackRelease(mf(T, 52 + p.tune * 12 + p.color * 5 + [0, 1, 7][a]), d, t, p.vel * [1, 0.9, 1][a]); if (a === 2) n.crack.triggerAttackRelease(0.03, t, p.vel); else if (p.snap > 0.3) n.slap.triggerAttackRelease(0.02, t, p.vel * p.snap * (a ? 0.5 : 1)); } };
V.bongo = { label: 'bongo', make: (T, out) => ({ ...crackLayer(T, out, 1500, 0.025), m: new T.MembraneSynth({ pitchDecay: 0.01, octaves: 1.2, envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -6 }).connect(out) }),
  hit: (T, n, p, t) => { const a = p.artic ?? 0, d = [0.05 + p.dec * 0.2, 0.02 + p.dec * 0.03, 0.03 + p.dec * 0.05][a]; n.m.set({ envelope: { decay: d } }); n.m.triggerAttackRelease(mf(T, 64 + p.tune * 12 + p.color * 7 + [0, 1, 7][a]), d, t, p.vel * [1, 0.9, 1][a]); if (a === 2) n.crack.triggerAttackRelease(0.025, t, p.vel); } };
V.clave = { label: 'clave', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.0005, decay: 0.05, sustain: 0 }, volume: -6 }).connect(out) }),
  hit: (T, n, p, t) => { n.o.set({ envelope: { decay: 0.02 + p.dec * 0.08 } }); n.o.triggerAttackRelease(2500 * Math.pow(2, p.tune * 0.5 + p.color * 0.3), 0.02 + p.dec * 0.08, t, p.vel); } };
V.tabla = { label: 'tabla', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0 }, volume: -4 }).connect(out) }),
  hit: (T, n, p, t) => { const f = mf(T, 50 + p.tune * 12), d = 0.1 + p.dec * 0.6; n.o.set({ envelope: { decay: d } }); n.o.oscillator.frequency.setValueAtTime(f, t); n.o.oscillator.frequency.linearRampToValueAtTime(f * (1 + 0.2 + p.color * 0.6), t + d * (0.3 + p.snap * 0.5)); n.o.triggerAttackRelease(f, d, t, p.vel); } };
V.cuica = { label: 'cuíca', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.25, sustain: 0 }, volume: -8 }).connect(out) }),
  hit: (T, n, p, t) => { const f = mf(T, 70 + p.tune * 12), d = 0.08 + p.dec * 0.3; n.o.set({ envelope: { decay: d } }); n.o.oscillator.frequency.setValueAtTime(f * (p.color > 0.5 ? 0.7 : 1.3), t); n.o.oscillator.frequency.exponentialRampToValueAtTime(f, t + d * 0.7); n.o.triggerAttackRelease(f, d, t, p.vel); } };
// ---- L4 Afro / Amapiano (dsp-voices.js has the same four) ----
// djembe: bass / tone / slap from color (thirds) or an artic lock (0 / 1 / 2): strokeOf; the slap cracks like a conga's
V.djembe = { label: 'djembe', make: (T, out) => { const bp = new T.Filter({ type: 'bandpass', frequency: 2800, Q: 0.9 }).connect(out); return { bp, ...crackLayer(T, out, 1500, 0.04), m: new T.MembraneSynth({ pitchDecay: 0.01, octaves: 1.2, envelope: { attack: 0.001, decay: 0.3, sustain: 0 }, volume: -3 }).connect(out), n: new T.NoiseSynth({ envelope: { attack: 0.0005, decay: 0.04, sustain: 0 }, volume: -6 }).connect(bp) }; },
  hit: (T, n, p, t) => {
    const z = p.artic ?? strokeOf('djembe', null, p.color), d = [0.12 + p.dec * 0.5, 0.06 + p.dec * 0.3, 0.03 + p.dec * 0.12][z];
    n.m.set({ octaves: [1.6, 1, 1.4][z], pitchDecay: [0.02, 0.008, 0.005][z], envelope: { decay: d } }); n.m.triggerAttackRelease(mf(T, [41, 57, 64][z] + p.tune * 12), d, t, p.vel * [1, 0.85, 0.9][z]);
    if (z === 2) { const nd = 0.03 + p.dec * 0.06; n.crack.set({ envelope: { decay: nd } }); n.crack.triggerAttackRelease(nd, t, p.vel * (0.7 + p.snap * 0.3)); return; }
    n.bp.frequency.setValueAtTime(z === 0 ? 900 : 2800, t); n.n.set({ envelope: { decay: 0.012 } }); n.n.triggerAttackRelease(0.012, t, p.vel * p.snap * 0.4);
  } };
// log drum (Amapiano): a sub with a woody knock, gliding down by color over most of its length (color 1: an octave)
V.logdrum = { label: 'log drum', make: (T, out) => { const lp = new T.Filter({ type: 'lowpass', frequency: 2000 }).connect(out); return { lp, o: new T.FMSynth({ harmonicity: 2, modulationIndex: 2, envelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.05 }, modulationEnvelope: { attack: 0.001, decay: 0.04, sustain: 0 }, volume: 9 }).connect(lp), k: new T.NoiseSynth({ envelope: { attack: 0.0005, decay: 0.008, sustain: 0 }, volume: -16 }).connect(lp) }; },
  hit: (T, n, p, t) => {
    const f = mf(T, 40 + p.tune * 12), d = 0.15 + p.dec * 0.9; n.o.set({ modulationIndex: 0.8 + p.snap * 1.2, envelope: { decay: d } }); n.o.triggerAttackRelease(f, d, t, p.vel);
    // after the trigger (it sets the note at t): punch down onto the note, then the glide
    n.o.frequency.cancelScheduledValues(t); n.o.frequency.setValueAtTime(f * (1.8 + p.snap * 1.5), t); n.o.frequency.exponentialRampToValueAtTime(f, t + 0.03); n.o.frequency.linearRampToValueAtTime(f * (1 - p.color * 0.5), t + 0.03 + d * 0.6);
    n.k.triggerAttackRelease(0.008, t, p.vel * (0.3 + p.snap * 0.5));
  } };
// agogo / gankogui: two bells a fifth apart — low below color 0.5, high above, or an artic lock (0 low, 1 high)
V.agogo = { label: 'agogo', make: (T, out) => ({ f: new T.FMSynth({ harmonicity: 2.76, modulationIndex: 2, envelope: { attack: 0.0005, decay: 0.4, sustain: 0 }, modulationEnvelope: { attack: 0.0005, decay: 0.05, sustain: 0 }, volume: 2 }).connect(out) }),
  hit: (T, n, p, t) => { const hi = (p.artic ?? strokeOf('agogo', null, p.color)) === 1, d = 0.1 + p.dec * 0.6; n.f.set({ modulationIndex: 1 + p.snap * 2, envelope: { decay: d } }); n.f.triggerAttackRelease(640 * Math.pow(2, p.tune) * (hi ? 1.5 : 1), d, t, p.vel); } };
// shekere: a gourd of beads — shake (rolled noise bursts) or slap (artic 1: a palm on the gourd, then the beads). White
// noise: pink loses ~16 dB in the beads' band (5–8 kHz), which left the synth shekere 18 dB under its dsp twin
V.shekere = { label: 'shekere', make: (T, out) => { const bp = new T.Filter({ type: 'bandpass', frequency: 6000, Q: 0.7 }).connect(out); return { bp, n: new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.004, decay: 0.1, sustain: 0 }, volume: -4 }).connect(bp), m: new T.MembraneSynth({ pitchDecay: 0.006, octaves: 0.6, envelope: { attack: 0.0005, decay: 0.08, sustain: 0 }, volume: -5 }).connect(out) }; },
  hit: (T, n, p, t) => {
    const slap = p.artic === 1, d = 0.05 + p.dec * 0.2; n.bp.frequency.setValueAtTime(4500 + p.color * 3500, t); n.n.set({ envelope: { attack: slap ? 0.001 : 0.004 + (1 - p.snap) * 0.02, decay: d } });
    for (let i = 0; i < 3; i++) n.n.triggerAttackRelease(i === 2 ? d : 0.014, t + i * 0.009, p.vel * (slap ? 0.8 : 1) * Math.pow(0.85, i));
    if (slap) { n.m.set({ envelope: { decay: 0.05 + p.dec * 0.1 } }); n.m.triggerAttackRelease(mf(T, 50 + p.tune * 12), 0.05 + p.dec * 0.1, t, p.vel); }
  } };
// ---- mallets, tonal ----
V.marimba = { label: 'marimba', make: (T, out) => ({ f: new T.FMSynth({ harmonicity: 4, modulationIndex: 2, envelope: { attack: 0.001, decay: 0.5, sustain: 0 }, modulationEnvelope: { attack: 0.001, decay: 0.1, sustain: 0 }, volume: -1 }).connect(out) }),
  hit: (T, n, p, t) => { n.f.set({ modulationIndex: 1 + p.snap * 5, envelope: { decay: 0.2 + p.dec } }); n.f.triggerAttackRelease(mf(T, 60 + p.tune * 24 + Math.round(p.color * 12)), 0.2 + p.dec, t, p.vel); } };
V.steel = { label: 'steel drum', make: (T, out) => ({ f: new T.FMSynth({ harmonicity: 2.03, modulationIndex: 6, envelope: { attack: 0.002, decay: 0.8, sustain: 0 }, modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0 }, volume: -3 }).connect(out) }),
  hit: (T, n, p, t) => { n.f.set({ harmonicity: 1.9 + p.color * 0.4, envelope: { decay: 0.3 + p.dec * 1.2 } }); n.f.triggerAttackRelease(mf(T, 67 + p.tune * 24), 0.3 + p.dec * 1.2, t, p.vel); } };
V.kalimba = { label: 'kalimba', make: (T, out) => ({ p: new T.PluckSynth({ attackNoise: 0.6, dampening: 5000, resonance: 0.9, volume: -2 }).connect(out) }),
  hit: (T, n, p, t) => { n.p.set({ dampening: 2000 + p.color * 6000, resonance: Math.min(0.99, 0.7 + p.dec * 0.25) }); n.p.triggerAttackRelease(mf(T, 72 + p.tune * 24), p.dec, t, p.vel); } };
// ---- electronic ----
V.laser = { label: 'laser', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -16 }).connect(out) }),
  hit: (T, n, p, t) => { const f = mf(T, 72 + p.tune * 24), d = 0.05 + p.dec * 0.3; n.o.set({ envelope: { decay: d } }); n.o.oscillator.frequency.setValueAtTime(f * 4, t); n.o.oscillator.frequency.exponentialRampToValueAtTime(f * (0.25 + p.color), t + d); n.o.triggerAttackRelease(f, d, t, p.vel); } };
V.click = { label: 'click', make: (T, out) => ({ o: new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.0002, decay: 0.006, sustain: 0 }, volume: -4 }).connect(out) }),
  hit: (T, n, p, t) => { n.o.triggerAttackRelease(mf(T, 96 + p.tune * 12 + p.color * 12), 0.006, t, p.vel); } };
V.vinyl = { label: 'crackle', make: (T, out) => { const bp = new T.Filter({ type: 'bandpass', frequency: 3000, Q: 1.5 }).connect(out); return { bp, n: new T.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.0005, decay: 0.01, sustain: 0 }, volume: 0 }).connect(bp) }; },
  hit: (T, n, p, t) => { n.bp.frequency.value = 1000 + p.color * 6000; const k = 1 + Math.round(p.snap * 4); let at = t; for (let i = 0; i < k; i++) { n.n.triggerAttackRelease(0.004 + p.dec * 0.01, at, p.vel * (0.5 + Math.random() * 0.5)); at += 0.012 + Math.random() * 0.03; } } }; // times must only move forward
V.noiseburst = { label: 'noise burst', make: (T, out) => { const f = new T.AutoFilter({ frequency: 8, baseFrequency: 400, octaves: 5, wet: 1 }).connect(out).start(); return { f, n: new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.3, sustain: 0 }, volume: -12 }).connect(f) }; },
  hit: (T, n, p, t) => { n.f.frequency.value = 2 + p.snap * 20; n.f.baseFrequency = 200 + p.color * 2000; n.n.triggerAttackRelease(0.05 + p.dec * 0.5, t, p.vel); } };
export const VOICES = V;
export const VOICE_KEYS = Object.keys(V);
/**
 * L3 articulations: the voices with more than one stroke, and their names. An `artic` step lock is an index here (0 is
 * the first stroke, not "no lock": an unlocked step plays the lane's own sound, which for djembe and agogo comes from
 * color). Both engines read p.artic (strokeOf below); MIDI gives every stroke a note of its own (midiio.js strokeNotes).
 */
export const ARTICS = { conga: ['open', 'mute', 'slap'], bongo: ['open', 'mute', 'slap'], djembe: ['bass', 'tone', 'slap'], hat: ['closed', 'open'], agogo: ['low', 'high'], shekere: ['shake', 'slap'] };
export const ARTIC_MAX = Math.max(...Object.values(ARTICS).map(a => a.length)) - 1;
/** The articulation a lock gives voice `key`, or null (no lock, or one this voice doesn't have: the lane changed voice). */
export const articAt = (key, lock) => { const a = lock?.artic; return a != null && a < (ARTICS[key]?.length ?? 0) ? a : null; };
/** djembe and agogo pick their stroke from color when no lock says otherwise: djembe by thirds, agogo high from ½. */
const COLOR_STROKE = { djembe: (c) => (c < 1 / 3 ? 0 : c < 2 / 3 ? 1 : 2), agogo: (c) => (c >= 0.5 ? 1 : 0) };
/**
 * The stroke a hit plays on voice `key`: its artic lock, else the one the color picks (djembe, agogo), else the first;
 * null for a voice without strokes. color = the hit's own (a color lock, else the lane's). Both engines, live MIDI and
 * the MIDI export ask this one rule, so the note sent is the stroke heard.
 */
export const strokeOf = (key, lock, color = 0.5) => (ARTICS[key] ? articAt(key, lock) ?? COLOR_STROKE[key]?.(color) ?? 0 : null);
/**
 * G5 velocity shapes the sound, in both engines: below the normal velocity (0.7) a hit gets darker (tone, in octaves
 * down at velocity 0), a softer transient (snap scaled down) and a slightly shorter decay. Per voice, so kicks stay
 * solid; a sample keeps its length and its attack (only darker). Normal and accented hits sound as they always did.
 * Darker, not quieter: a voice whose whole band sits above the lane's low-pass (hats, cymbals, shaker, tambourine,
 * clave, click) loses ~12 dB per octave it closes, so those move a fraction of an octave. At the ghost tier a voice
 * lands within ~3 dB of the plain velocity drop in both engines, 4–5 dB for a few (snap, gong, ride and hats on a dark lane).
 * A sample can be anything, a hat too: gentle. A soft clap keeps its number of claps (snap sets the bursts, and one
 * burst fewer leaves a louder tail: a clap just under normal velocity came out louder than a normal one).
 */
const VT_DEFAULT = { tone: 2, snap: 0.6, dec: 0.3 };
export const VEL_TIMBRE = {
  kick: { tone: 0.6, snap: 0.4, dec: 0.08 }, kick909: { tone: 0.6, snap: 0.4, dec: 0.08 }, kick808: { tone: 0.5, snap: 0.3, dec: 0.05 },
  hardkick: { tone: 0.6, snap: 0.3, dec: 0.08 }, softkick: { tone: 0.4, snap: 0.2, dec: 0.05 }, sub: { tone: 0.3, snap: 0, dec: 0.05 },
  tom: { tone: 1.2, snap: 0.5, dec: 0.15 }, conga: { tone: 1.2, snap: 0.5, dec: 0.15 }, bongo: { tone: 1.2, snap: 0.5, dec: 0.15 },
  snare: { tone: 2.2, snap: 0.7, dec: 0.3 }, snare808: { tone: 2.2, snap: 0.7, dec: 0.3 }, clap: { tone: 1.4, snap: 0, dec: 0.25 }, rim: { tone: 1.6, snap: 0.6, dec: 0.2 },
  snap2: { tone: 1.4, snap: 0.6, dec: 0.3 }, glitch: { tone: 1.4, snap: 0.6, dec: 0.3 }, clave: { tone: 0.8, snap: 0.5, dec: 0.2 }, click: { tone: 1, snap: 0.5, dec: 0.2 },
  hat: { tone: 0.5, snap: 0.6, dec: 0.4 }, ophat: { tone: 0.5, snap: 0.6, dec: 0.35 }, shaker: { tone: 0.5, snap: 0.5, dec: 0.35 }, tamb: { tone: 0.5, snap: 0.5, dec: 0.35 },
  djembe: { tone: 1.2, snap: 0.5, dec: 0.15 }, logdrum: { tone: 0.4, snap: 0.3, dec: 0.05 }, agogo: { tone: 0.8, snap: 0.5, dec: 0.2 }, shekere: { tone: 0.5, snap: 0.5, dec: 0.35 },
  ride: { tone: 0.6, snap: 0.5, dec: 0.3 }, crash: { tone: 0.6, snap: 0.5, dec: 0.3 }, vinyl: { tone: 1.2, snap: 0.5, dec: 0.3 },
  sample: { tone: 0.6, snap: 0, dec: 0 },
};
/** p (the hit params) shaped by its velocity for voice `key`: { ...p, dec, snap, dark } — dark = octaves to darken. */
export function velShape(p, key) {
  const a = VEL_TIMBRE[key] || VT_DEFAULT, k = Math.max(0, Math.min(1, (0.7 - (p.vel ?? 0.7)) / 0.7));
  if (!k) return { ...p, dark: 0 };
  return { ...p, dec: p.dec * (1 - a.dec * k), snap: p.snap * (1 - a.snap * k), dark: a.tone * k };
}
