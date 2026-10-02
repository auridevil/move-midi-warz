// A demo loop rendered offline (no samples, nothing copyrighted): 8 bars of drums, bass, chords and an arp at 124 bpm.
export const DEMO = { name: 'demo loop · 124 bpm', bpm: 124, bars: 8 };

export async function renderDemo(sampleRate = 44100) {
  const beat = 60 / DEMO.bpm, len = DEMO.bars * 4 * beat;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sampleRate), sampleRate);
  const master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; master.connect(comp).connect(ctx.destination);
  const noise = ctx.createBuffer(1, sampleRate, sampleRate); { const d = noise.getChannelData(0); let s = 1; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } }
  const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
  const kick = (t, v = 1) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g).connect(master); o.start(t); o.stop(t + 0.4); };
  const hit = (t, { hp = 7000, dur = 0.05, v = 0.25, bp = 0 } = {}) => { const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = bp || hp; const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02); };
  const snare = (t) => { hit(t, { bp: 1800, dur: 0.18, v: 0.5 }); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 190; g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(g).connect(master); o.start(t); o.stop(t + 0.15); };
  const synth = (t, notes, dur, { type = 'sawtooth', cut = 1800, v = 0.12, q = 2, pan = 0 } = {}) => {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q; f.frequency.setValueAtTime(cut * 2.5, t); f.frequency.exponentialRampToValueAtTime(cut * 0.5, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan; f.connect(g).connect(p).connect(master);
    for (const m of notes) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.connect(f); o.start(t); o.stop(t + dur + 0.05); }
  };
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]]; // Am7 Fmaj7 Cmaj7 G7
  const roots = [33, 29, 36, 31];
  for (let bar = 0; bar < DEMO.bars; bar++) {
    const b0 = bar * 4 * beat, ci = Math.floor(bar / 2) % 4;
    for (let q = 0; q < 4; q++) { kick(b0 + q * beat, q === 0 ? 1 : 0.85); hit(b0 + q * beat + beat / 2, { v: 0.22, dur: 0.12, hp: 6000 }); }
    for (let s = 0; s < 16; s++) if (s % 2) hit(b0 + s * beat / 4, { v: 0.08, dur: 0.03, hp: 9000 });
    snare(b0 + beat); snare(b0 + 3 * beat); if (bar % 4 === 3) { snare(b0 + 3.5 * beat); snare(b0 + 3.75 * beat); }
    for (const s of [2, 6, 10, 14]) synth(b0 + s * beat / 4, [roots[ci]], beat * 0.4, { cut: 500, v: 0.32, q: 4 });
    synth(b0 + beat * 0.5, chords[ci], beat * 0.9, { cut: 2200, v: 0.05, pan: -0.3 }); synth(b0 + beat * 2.5, chords[ci], beat * 0.9, { cut: 2200, v: 0.05, pan: -0.3 });
    const arp = [chords[ci][0] + 12, chords[ci][1] + 12, chords[ci][2] + 12, chords[ci][3] + 12];
    for (let s = 0; s < 16; s++) if (s % 3 !== 2) synth(b0 + s * beat / 4, [arp[s % 4]], beat / 4 * 0.9, { type: 'square', cut: 3000, v: 0.045, q: 1, pan: 0.35 });
  }
  return ctx.startRendering();
}
