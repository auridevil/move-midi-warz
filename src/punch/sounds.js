// Preview sounds for Punchliner (Tone.js, global `Tone`). Only for listening: the .mid carries notes, not sounds.
// make(T, out) builds the voice into `out` and returns { synth, dispose }. Mono voices can glide (portamento).
const mono = (T, out, opts, chain = []) => {
  const synth = new T.MonoSynth(opts); let last = synth;
  for (const n of chain) { last.connect(n); last = n; } last.connect(out);
  return { synth, mono: true, dispose: () => [synth, ...chain].forEach(n => n.dispose()) };
};
const poly = (T, out, Voice, opts, chain = [], max = 10) => {
  const synth = new T.PolySynth(Voice, { maxPolyphony: max, ...opts }); let last = synth;
  for (const n of chain) { last.connect(n); last = n; } last.connect(out);
  return { synth, mono: false, dispose: () => [synth, ...chain].forEach(n => n.dispose()) };
};
const env = (attack, decay, sustain, release) => ({ attack, decay, sustain, release });

export const SOUNDS = {
  bass: [
    { name: 'sub', make: (T, o) => mono(T, o, { volume: -4, oscillator: { type: 'sine' }, filter: { type: 'lowpass', frequency: 400 }, envelope: env(0.005, 0.2, 0.8, 0.08), filterEnvelope: { baseFrequency: 300, octaves: 1, attack: 0.01, decay: 0.1, sustain: 1, release: 0.1 } }) },
    { name: 'saw mono', make: (T, o) => mono(T, o, { volume: -8, oscillator: { type: 'sawtooth' }, filter: { Q: 2, type: 'lowpass', rolloff: -24 }, envelope: env(0.004, 0.18, 0.5, 0.06), filterEnvelope: { attack: 0.004, decay: 0.16, sustain: 0.25, release: 0.1, baseFrequency: 90, octaves: 3.2 } }) },
    { name: '808', make: (T, o) => mono(T, o, { volume: -4, oscillator: { type: 'sine' }, filter: { type: 'lowpass', frequency: 900 }, envelope: env(0.002, 0.9, 0.35, 0.3), filterEnvelope: { baseFrequency: 600, octaves: 1, attack: 0.01, decay: 0.2, sustain: 1, release: 0.2 } }, [new T.Distortion({ distortion: 0.35, wet: 0.5 })]) },
    { name: 'reese', make: (T, o) => mono(T, o, { volume: -10, oscillator: { type: 'fatsawtooth', count: 3, spread: 30 }, filter: { Q: 1, type: 'lowpass', rolloff: -24 }, envelope: env(0.01, 0.3, 0.8, 0.1), filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.5, release: 0.2, baseFrequency: 160, octaves: 2.5 } }, [new T.Distortion({ distortion: 0.3, wet: 0.4 })]) },
    { name: 'acid', make: (T, o) => mono(T, o, { volume: -10, oscillator: { type: 'sawtooth' }, filter: { Q: 9, type: 'lowpass', rolloff: -24 }, envelope: env(0.003, 0.15, 0.3, 0.05), filterEnvelope: { attack: 0.003, decay: 0.12, sustain: 0.1, release: 0.1, baseFrequency: 180, octaves: 4 } }) },
    { name: 'fm', make: (T, o) => { const synth = new T.FMSynth({ volume: -8, harmonicity: 1, modulationIndex: 6, envelope: env(0.003, 0.25, 0.4, 0.08), modulationEnvelope: env(0.002, 0.15, 0.2, 0.1) }).connect(o); return { synth, mono: true, dispose: () => synth.dispose() }; } },
    { name: 'pluck', make: (T, o) => mono(T, o, { volume: -6, oscillator: { type: 'square' }, filter: { Q: 1, type: 'lowpass' }, envelope: env(0.002, 0.14, 0, 0.05), filterEnvelope: { attack: 0.002, decay: 0.1, sustain: 0, release: 0.05, baseFrequency: 200, octaves: 3 } }) },
    { name: 'fuzz', make: (T, o) => mono(T, o, { volume: -14, oscillator: { type: 'fatsquare', count: 2, spread: 12 }, filter: { type: 'lowpass', frequency: 1800 }, envelope: env(0.005, 0.3, 0.9, 0.2), filterEnvelope: { baseFrequency: 900, octaves: 1.5, attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.2 } }, [new T.Distortion({ distortion: 0.8, wet: 0.9 })]) },
  ],
  pad: [
    { name: 'warm saw', make: (T, o) => poly(T, o, T.Synth, { volume: -16, options: { oscillator: { type: 'fatsawtooth', count: 3, spread: 22 }, envelope: env(0.08, 0.3, 0.7, 0.7) } }, [new T.Filter({ type: 'lowpass', frequency: 2200, Q: 0.6 })]) },
    { name: 'strings', make: (T, o) => poly(T, o, T.Synth, { volume: -17, options: { oscillator: { type: 'fatsawtooth', count: 4, spread: 35 }, envelope: env(0.45, 0.4, 0.8, 1.4) } }, [new T.Filter({ type: 'lowpass', frequency: 3200, Q: 0.4 }), new T.Chorus({ frequency: 1.2, delayTime: 3.5, depth: 0.6, wet: 0.5 }).start()]) },
    { name: 'glass', make: (T, o) => poly(T, o, T.FMSynth, { volume: -18, options: { harmonicity: 3.01, modulationIndex: 8, envelope: env(0.01, 1.2, 0.3, 1.5), modulationEnvelope: env(0.01, 0.6, 0.2, 1) } }) },
    { name: 'choir', make: (T, o) => poly(T, o, T.AMSynth, { volume: -14, options: { harmonicity: 1.5, oscillator: { type: 'sine' }, envelope: env(0.35, 0.5, 0.8, 1.2), modulation: { type: 'triangle' } } }, [new T.Filter({ type: 'bandpass', frequency: 1100, Q: 0.7 })]) },
    { name: 'organ', make: (T, o) => poly(T, o, T.Synth, { volume: -20, options: { oscillator: { type: 'custom', partials: [1, 0.6, 0.4, 0, 0.3, 0, 0.2, 0.15] }, envelope: env(0.01, 0.1, 1, 0.12) } }, [new T.Tremolo({ frequency: 5.5, depth: 0.25 }).start()]) },
    { name: 'e-piano', make: (T, o) => poly(T, o, T.FMSynth, { volume: -14, options: { harmonicity: 1, modulationIndex: 3.5, oscillator: { type: 'sine' }, envelope: env(0.003, 1.4, 0.15, 0.8), modulationEnvelope: env(0.002, 0.4, 0, 0.3) } }) },
    { name: 'dark drone', make: (T, o) => poly(T, o, T.Synth, { volume: -14, options: { oscillator: { type: 'fattriangle', count: 3, spread: 18 }, envelope: env(1.2, 0.5, 0.9, 2) } }, [new T.AutoFilter({ frequency: '2m', baseFrequency: 180, octaves: 2.5, wet: 1 }).start()]) },
    { name: 'shimmer', make: (T, o) => poly(T, o, T.Synth, { volume: -19, options: { oscillator: { type: 'fatsine', count: 3, spread: 14 }, envelope: env(0.6, 0.4, 0.8, 2.2) } }, [new T.FeedbackDelay({ delayTime: '4n', feedback: 0.45, wet: 0.35 }), new T.Reverb({ decay: 7, wet: 0.6 })]) },
    { name: 'stab', make: (T, o) => poly(T, o, T.Synth, { volume: -14, options: { oscillator: { type: 'fatsquare', count: 2, spread: 10 }, envelope: env(0.002, 0.18, 0.05, 0.12) } }, [new T.Filter({ type: 'lowpass', frequency: 2600, Q: 2 })]) },
    { name: 'lo-fi keys', make: (T, o) => poly(T, o, T.Synth, { volume: -14, options: { oscillator: { type: 'triangle' }, envelope: env(0.01, 0.8, 0.3, 0.6) } }, [new T.BitCrusher({ bits: 6, wet: 0.5 }), new T.Vibrato({ frequency: 0.6, depth: 0.12 }), new T.Filter({ type: 'lowpass', frequency: 2400 })]) },
  ],
  lead: [
    { name: 'square', make: (T, o) => poly(T, o, T.Synth, { volume: -14, options: { oscillator: { type: 'square' }, envelope: env(0.01, 0.2, 0.4, 0.25) } }, [new T.Filter({ type: 'lowpass', frequency: 3200, Q: 1 })], 6) },
    { name: 'supersaw', make: (T, o) => poly(T, o, T.Synth, { volume: -16, options: { oscillator: { type: 'fatsawtooth', count: 5, spread: 40 }, envelope: env(0.01, 0.3, 0.6, 0.4) } }, [new T.Filter({ type: 'lowpass', frequency: 4500 })], 8) },
    { name: 'bell', make: (T, o) => poly(T, o, T.FMSynth, { volume: -14, options: { harmonicity: 3.5, modulationIndex: 10, envelope: env(0.002, 0.8, 0, 1), modulationEnvelope: env(0.002, 0.3, 0, 0.5) } }, [], 6) },
    { name: 'pluck', make: (T, o) => poly(T, o, T.Synth, { volume: -10, options: { oscillator: { type: 'triangle' }, envelope: env(0.002, 0.25, 0, 0.2) } }, [], 6) },
    { name: 'acid', make: (T, o) => mono(T, o, { volume: -12, oscillator: { type: 'sawtooth' }, filter: { Q: 10, type: 'lowpass', rolloff: -24 }, envelope: env(0.003, 0.15, 0.4, 0.05), filterEnvelope: { attack: 0.003, decay: 0.15, sustain: 0.15, release: 0.1, baseFrequency: 300, octaves: 3.5 } }) },
    { name: 'flute', make: (T, o) => poly(T, o, T.Synth, { volume: -10, options: { oscillator: { type: 'sine' }, envelope: env(0.06, 0.2, 0.8, 0.3) } }, [new T.Vibrato({ frequency: 5, depth: 0.08 })], 6) },
    { name: 'whistle', make: (T, o) => ({ ...mono(T, o, { volume: -12, portamento: 0.09, oscillator: { type: 'sine' }, filter: { type: 'lowpass', frequency: 5000 }, envelope: env(0.03, 0.2, 0.9, 0.3), filterEnvelope: { baseFrequency: 3000, octaves: 1, attack: 0.01, decay: 0.2, sustain: 1, release: 0.2 } }, [new T.Vibrato({ frequency: 5.5, depth: 0.1 })]), glide: 0.09 }) },
    { name: 'guitar', make: (T, o) => mono(T, o, { volume: -16, oscillator: { type: 'fatsawtooth', count: 2, spread: 15 }, filter: { type: 'lowpass', frequency: 3000 }, envelope: env(0.003, 0.4, 0.7, 0.15), filterEnvelope: { baseFrequency: 1200, octaves: 1.5, attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.2 } }, [new T.Distortion({ distortion: 0.9, wet: 1 }), new T.Filter({ type: 'highpass', frequency: 120 })]) },
  ],
};
const BY_PATTERN = { sub: 'sub', dub: 'sub', garage: 'sub', halftime: 'sub', '808': '808', reese: 'reese', unison: 'fuzz', rolling: 'saw mono', donk: 'saw mono', double: 'saw mono',
  drone: 'dark drone', stabs: 'stab', push: 'e-piano', long: 'warm saw',
  octave: 'saw mono', bossa: 'pluck', gfunk: 'saw mono', arp: 'square',
  roots: 'sub', boom: 'fm', jumpup: 'fm', cumbia: 'pluck', skank: 'organ', offbeat: 'stab',
  bells: 'bell', acid: 'acid', anthem: 'supersaw', riff: 'guitar', palm: 'guitar', tremolo: 'guitar', chop: 'pluck', pedal: 'pluck', motif: 'square' };
/** Default sound index for a part playing a pattern. */
export const defaultSound = (part, pattern, prefer) => { const i = SOUNDS[part].findIndex(s => s.name === prefer); return i >= 0 ? i : Math.max(0, SOUNDS[part].findIndex(s => s.name === BY_PATTERN[pattern])); };
