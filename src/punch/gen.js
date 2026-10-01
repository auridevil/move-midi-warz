// Punchliner: writes bass, pad and lead lines from a few parameters. Pure (no DOM, no audio) so it is testable.
// A note is { p: midi pitch, s: start step, d: length in steps, v: velocity 1–127, g?: glides into the next }.
// One step = a sixteenth, 16 steps per bar. Same params + same seed = same line.

export const STEPS = 16;
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (p) => `${NOTE_NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;

export const SCALES = {
  minor: { name: 'natural minor', iv: [0, 2, 3, 5, 7, 8, 10] },
  harmonic: { name: 'harmonic minor', iv: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { name: 'dorian', iv: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: 'phrygian', iv: [0, 1, 3, 5, 7, 8, 10] },
  major: { name: 'major', iv: [0, 2, 4, 5, 7, 9, 11] },
};

// Progressions in degrees. Minor ones are read against natural minor, major ones against major.
export const PROGRESSIONS = [
  { id: 'i VI III VII', mood: 'open, bright', genres: 'trance, pop, liquid dnb' },
  { id: 'i VII VI VII', mood: 'suspended, it turns', genres: 'prog psy, melodic techno' },
  { id: 'i VI VII i', mood: 'closes, epic', genres: 'melodic metal, trance' },
  { id: 'i VII VI V', mood: 'relentless descent', genres: 'metal, trance' },
  { id: 'i III VII VI', mood: 'melancholic, wide', genres: 'liquid dnb, prog house' },
  { id: 'i iv VII III', mood: 'circular, jazzy', genres: 'deep house, liquid' },
  { id: 'i VI iv VII', mood: 'soft, wide', genres: 'trip hop, prog' },
  { id: 'i VI v i', mood: 'lukewarm, modal', genres: 'neutral' },
  { id: 'i VI V i', mood: 'pulls home hard', genres: 'trance, melodic metal' },
  { id: 'i VI', mood: 'hypnotic, stable', genres: 'techno, dubstep, deep house' },
  { id: 'i iv', mood: 'dark, static', genres: 'sludge, doom, trip hop' },
  { id: 'i VII', mood: 'rolls forward', genres: 'psytrance, prog' },
  { id: 'i7 iv7', mood: 'soft, jazzy', genres: 'deep house, garage' },
  { id: 'i IV', mood: 'dorian, funky', genres: 'house, tech house, jungle' },
  { id: 'i bII', mood: 'menacing', genres: 'dark psy, black metal' },
  { id: 'i bII i VII', mood: 'ritual', genres: 'death metal, dark psy' },
  { id: 'i bV', mood: 'unstable, sick', genres: 'death metal, neurofunk' },
  { id: 'i', mood: 'pedal, no direction', genres: 'techno, psytrance, trap, neurofunk' },
  { id: 'i V', mood: 'tonic and dominant, it sways', genres: 'cumbia, tango, balkan' },
  { id: 'i iv V i', mood: 'old-school minor, closes', genres: 'cumbia, bolero' },
  { id: 'I V vi IV', mood: 'bright, familiar', genres: 'pop, vocal house', major: true },
  { id: 'ii V I', mood: 'jazz, resolves', genres: 'liquid dnb, deep house', major: true },
  { id: 'I IV', mood: 'sunny, static', genres: 'house, garage', major: true },
  { id: 'I V', mood: 'tonic and dominant, festive', genres: 'cumbia, ska', major: true },
  { id: 'I vi ii V', mood: 'the turnaround, round and round', genres: 'bossa nova, doo-wop, jazz', major: true },
  { id: 'I IV V IV', mood: 'dancefloor folk', genres: 'cumbia, ska, rocksteady', major: true },
];

export const BASS_PATTERNS = {
  donk: 'Offbeat: one note on every offbeat eighth. The bass answers the kick and leaves room for a lead.',
  double: 'Double offbeat: pairs of sixteenths after every kick. More push, less space for the rest.',
  rolling: 'Rolling sixteenths: three notes between kicks, none touching the next. Mono, short.',
  sub: 'Long sub: one held note per chord. Weight, not groove.',
  dub: 'Dub sub: few long notes, rarely with the snare. Two or three per four bars.',
  garage: 'Garage sub: long notes that answer the holes in the kick. Liquid against nervous drums.',
  '808': '808: root on the one, then a couple of syncopated notes, some gliding into the next.',
  halftime: 'Half-time: written at half tempo in your head. Two long notes a bar, sliding.',
  reese: 'Reese: held notes that change every bar or two, retriggered now and then.',
  roots: 'Roots: a two-bar reggae riff that often leaves the one empty, moving with the chords. Heavy and melodic.',
  boom: 'Boom: hip hop bass, root on the one, an answer on the "and" of two or three, a passing note into the next chord.',
  jumpup: 'Jump up: a two-bar call-and-response riff with octave jumps and slides. Bouncy, honky, a bit rude.',
  cumbia: 'Cumbia: root on one, fifth on three, a pickup on the "and" of four into the next bar.',
  octave: 'Octave: eighths jumping between the root and its octave. The italo disco engine.',
  bossa: 'Bossa: root on one, fifth on three, held, with an anticipation of the next chord. Soft, walking.',
  gfunk: 'G-funk: a funky two-bar line with octave pops and slides between notes. Melodic, laid back.',
  unison: 'Unison: doubles the lead/riff an octave or two down, cleaner. The metal bass.',
};
export const PAD_PATTERNS = {
  long: 'Long: each chord held for its whole length. Techno, trip hop, ambient: usually better than you think.',
  push: 'Pushed: every chord arrives an eighth early. House, garage, funk.',
  stabs: 'Stabs: short repeated chords inside the bar. The progression becomes percussion.',
  bossa: 'Bossa comping: the guitar rhythm of bossa nova, a syncopated two-bar figure of soft chords.',
  skank: 'Skank: short chords on beats two and four. Reggae and dub: the chord is percussion.',
  offbeat: 'Offbeat: short chords on every offbeat eighth. Cumbia guitar and accordion, ska.',
  drone: 'Drone: root and fifth held under everything, buried. Mood, not melody.',
};
export const LEAD_PATTERNS = {
  motif: 'Motif: 4–6 notes, chord tones on the downbeats, two bars of call and two of response.',
  pedal: 'Pedal: one note with an interesting rhythm. The chords change what it means.',
  anthem: 'Anthem: a motif doubled an octave up with a third above. Only works on a good motif.',
  bells: 'Bells: four notes looped every two bars, minor and repetitive. It serves the groove.',
  arp: 'Arp: the chord broken into sixteenths, up and down. Italo, hyperpop, synth pop.',
  acid: 'Acid: a one-bar sixteenth figure on four notes, accents and slides.',
  riff: 'Riff (sludge): two or three power-chord notes every two bars, left to ring. Repeat it until it weighs.',
  palm: 'Palm-muted riff (death): rhythm first, chugs on the root, chromatic accents in a narrow range. Riff B = same rhythm, new pitches.',
  tremolo: 'Tremolo (black): a slow stepwise melody inside a fifth, played as continuous sixteenths. Eight bars before it repeats.',
  chop: 'Chop (footwork): a half-bar fragment looped, notes grouped in threes against the four.',
};

// Genre presets: defaults drawn from each genre's rules (tempo, progression, bass engine, pad rhythm, lead).
export const GENRES = {
  house: { name: 'House', bpm: 124, scale: 'dorian', prog: 'i7 iv7', per: 2, ext: 9, bass: 'donk', pad: 'push', lead: 'motif', kick: 'four', swing: 54, density: 40, movement: 25 },
  techno: { name: 'Techno', bpm: 132, scale: 'minor', prog: 'i VI', per: 4, ext: 3, bass: 'donk', pad: 'drone', lead: 'pedal', kick: 'four', swing: 0, density: 35, movement: 10 },
  progtechno: { name: 'Progressive techno', bpm: 123, scale: 'minor', prog: 'i VII VI VII', per: 2, ext: 7, bass: 'rolling', pad: 'long', lead: 'motif', kick: 'four', swing: 0, density: 30, movement: 15 },
  trance: { name: 'Trance', bpm: 138, scale: 'harmonic', prog: 'i VI III VII', per: 2, ext: 3, bass: 'donk', pad: 'long', lead: 'anthem', kick: 'four', swing: 0, density: 55, movement: 30 },
  psytrance: { name: 'Psytrance', bpm: 145, scale: 'phrygian', prog: 'i', per: 4, ext: 3, bass: 'rolling', pad: 'drone', lead: 'acid', kick: 'four', swing: 0, density: 70, movement: 0 },
  fullon: { name: 'Full-on psytrance', bpm: 146, scale: 'harmonic', prog: 'i', per: 4, ext: 3, bass: 'rolling', pad: 'drone', lead: 'motif', kick: 'four', swing: 0, density: 80, movement: 35, sounds: { lead: 'supersaw' } },
  hardcore: { name: 'Hardcore (gabber)', bpm: 180, scale: 'minor', prog: 'i VI VII i', per: 2, ext: 3, bass: 'donk', pad: 'stabs', lead: 'anthem', kick: 'four', swing: 0, density: 60, movement: 30, sounds: { pad: 'stab', lead: 'supersaw', bass: 'fuzz' }, mute: ['bass'] },
  progpsy: { name: 'Progressive psy', bpm: 136, scale: 'minor', prog: 'i VII', per: 4, ext: 3, bass: 'donk', pad: 'long', lead: 'motif', kick: 'four', swing: 0, density: 35, movement: 10 },
  triphop: { name: 'Trip hop', bpm: 85, scale: 'minor', prog: 'i iv', per: 2, ext: 9, bass: 'dub', pad: 'long', lead: 'motif', kick: 'broken', swing: 56, density: 25, movement: 30 },
  dub: { name: 'Dub', bpm: 75, scale: 'minor', prog: 'i iv', per: 2, ext: 3, bass: 'roots', pad: 'skank', lead: 'motif', kick: 'onedrop', swing: 54, density: 45, movement: 50, sounds: { bass: 'sub', pad: 'organ', lead: 'flute' } },
  westcoast: { name: 'West coast hip hop (G-funk)', bpm: 92, scale: 'dorian', prog: 'i7 iv7', per: 2, ext: 9, bass: 'gfunk', pad: 'long', lead: 'motif', kick: 'boombap', swing: 58, density: 45, movement: 55, leadOct: 5, sounds: { bass: 'saw mono', pad: 'e-piano', lead: 'whistle' } },
  hiphop: { name: 'Hip hop (boom bap)', bpm: 90, scale: 'minor', prog: 'i iv', per: 2, ext: 7, bass: 'boom', pad: 'stabs', lead: 'motif', kick: 'boombap', swing: 56, density: 40, movement: 30, sounds: { pad: 'e-piano' } },
  lofi: { name: 'Lo-fi hip hop', bpm: 80, scale: 'dorian', prog: 'i7 iv7', per: 2, ext: 9, bass: 'boom', pad: 'long', lead: 'motif', kick: 'boombap', swing: 60, density: 30, movement: 25, sounds: { bass: 'sub', pad: 'lo-fi keys', lead: 'bell' }, chaos: { scatter: 12 } },
  abstract: { name: 'Abstract hip hop', bpm: 86, scale: 'minor', prog: 'i VI iv VII', per: 1, ext: 9, bass: 'boom', pad: 'stabs', lead: 'chop', kick: 'boombap', swing: 62, density: 35, movement: 55, sounds: { pad: 'e-piano', lead: 'bell' }, chaos: { mutate: 10, scatter: 25, glitch: 20 } },
  garage: { name: 'UK garage', bpm: 134, scale: 'minor', prog: 'i7 iv7', per: 2, ext: 7, bass: 'garage', pad: 'push', lead: 'motif', kick: 'twostep', swing: 60, density: 40, movement: 35 },
  dubstep: { name: 'Dubstep', bpm: 140, scale: 'minor', prog: 'i VI', per: 2, ext: 3, bass: 'sub', pad: 'long', lead: 'bells', kick: 'half', swing: 0, density: 20, movement: 20 },
  trap: { name: 'Trap', bpm: 144, scale: 'minor', prog: 'i', per: 4, ext: 3, bass: '808', pad: 'long', lead: 'bells', kick: 'half', swing: 0, density: 45, movement: 45 },
  jungle: { name: 'Jungle', bpm: 168, scale: 'dorian', prog: 'i IV', per: 2, ext: 3, bass: 'halftime', pad: 'stabs', lead: 'motif', kick: 'broken', swing: 0, density: 30, movement: 40 },
  dnb: { name: 'Drum & bass (liquid)', bpm: 174, scale: 'minor', prog: 'i III VII VI', per: 2, ext: 7, bass: 'sub', pad: 'long', lead: 'motif', kick: 'broken', swing: 0, density: 35, movement: 30 },
  footwork: { name: 'Footwork', bpm: 160, scale: 'minor', prog: 'i', per: 4, ext: 3, bass: 'dub', pad: 'stabs', lead: 'chop', kick: 'footwork', swing: 0, density: 30, movement: 20, mute: ['pad'] },
  jumpup: { name: 'Drum & bass (jump up)', bpm: 174, scale: 'phrygian', prog: 'i', per: 4, ext: 3, bass: 'jumpup', pad: 'drone', lead: 'pedal', kick: 'broken', swing: 0, density: 60, movement: 65, sounds: { bass: 'fm' }, mute: ['pad'] },
  neuro: { name: 'Neurofunk', bpm: 176, scale: 'phrygian', prog: 'i', per: 4, ext: 3, bass: 'reese', pad: 'drone', lead: 'acid', kick: 'broken', swing: 0, density: 50, movement: 25 },
  italodisco: { name: 'Italo disco', bpm: 118, scale: 'minor', prog: 'i VI III VII', per: 1, ext: 3, bass: 'octave', pad: 'long', lead: 'arp', kick: 'four', swing: 0, density: 50, movement: 30, sounds: { bass: 'saw mono', pad: 'strings', lead: 'square' } },
  hyperpop: { name: 'Hyperpop', bpm: 160, scale: 'major', prog: 'I V vi IV', per: 1, ext: 3, bass: '808', pad: 'stabs', lead: 'arp', kick: 'half', swing: 0, density: 65, movement: 55, sounds: { bass: '808', pad: 'stab', lead: 'supersaw' }, chaos: { mutate: 10, ratchet: 25, glitch: 25 } },
  bossanova: { name: 'Bossa nova', bpm: 130, scale: 'major', prog: 'I vi ii V', per: 1, ext: 9, bass: 'bossa', pad: 'bossa', lead: 'motif', kick: 'bossa', swing: 0, density: 35, movement: 35, sounds: { bass: 'pluck', pad: 'e-piano', lead: 'flute' } },
  cumbia: { name: 'Cumbia', bpm: 95, scale: 'harmonic', prog: 'i V', per: 2, ext: 3, bass: 'cumbia', pad: 'offbeat', lead: 'motif', kick: 'cumbia', swing: 0, density: 50, movement: 45, sounds: { bass: 'pluck', pad: 'organ', lead: 'flute' } },
  sludge: { name: 'Sludge', bpm: 64, scale: 'minor', prog: 'i iv', per: 2, ext: 5, bass: 'unison', pad: 'long', lead: 'riff', kick: 'broken', swing: 0, density: 30, movement: 30, leadOct: 2, bassOct: 1, mute: ['pad'] },
  ambientblack: { name: 'Ambient black metal', bpm: 100, scale: 'minor', prog: 'i VI III VII', per: 2, ext: 3, bass: 'sub', pad: 'long', lead: 'tremolo', kick: 'broken', swing: 0, density: 50, movement: 30, leadOct: 4 },
  death: { name: 'Death metal', bpm: 180, scale: 'phrygian', prog: 'i bII', per: 2, ext: 5, bass: 'unison', pad: 'long', lead: 'palm', kick: 'double', swing: 0, density: 55, movement: 45, leadOct: 2, bassOct: 1, mute: ['pad'] },
  black: { name: 'Black metal', bpm: 180, scale: 'phrygian', prog: 'i bII', per: 2, ext: 5, bass: 'sub', pad: 'drone', lead: 'tremolo', kick: 'blast', swing: 0, density: 50, movement: 25, leadOct: 4 },
};

// Kick guide for listening (steps in one bar); it is not exported.
export const KICKS = {
  four: { kick: [0, 4, 8, 12], snare: [4, 12] },
  broken: { kick: [0, 10], snare: [4, 12] },
  twostep: { kick: [0, 7, 10], snare: [4, 12] },
  half: { kick: [0, 11], snare: [8] },
  footwork: { kick: [0, 3, 6, 9, 12], snare: [4, 12] },
  onedrop: { kick: [8], snare: [8] },
  boombap: { kick: [0, 7, 10], snare: [4, 12] },
  cumbia: { kick: [0, 8], snare: [6, 14] },
  bossa: { kick: [0, 6, 8, 14], snare: [3, 6, 10, 12] },
  double: { kick: [...Array(16).keys()], snare: [4, 12] },
  blast: { kick: [0, 2, 4, 6, 8, 10, 12, 14], snare: [1, 3, 5, 7, 9, 11, 13, 15] },
};

/** Seeded PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r = { next, chance: (p) => next() < p, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (items, w) => { const tot = w.reduce((a, b) => a + b, 0); let x = next() * tot; for (let i = 0; i < items.length; i++) { x -= w[i]; if (x < 0) return items[i]; } return items[items.length - 1]; } };
  return r;
}

const NUM = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
const REF = { minor: SCALES.minor.iv, major: SCALES.major.iv };
const QUAL = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };

/** 'VI' / 'iv7' / 'bII' / 'ii°' → { label, root (semitones above the key), tones (semitones above chord root) }. */
export function parseChord(sym, { major = false, ext = 3 } = {}) {
  const m = /^(b?)([ivIV]+)(°?)(7?)$/.exec(sym); if (!m) throw new Error(`bad chord ${sym}`);
  const [, flat, num, dim, seven] = m; const deg = NUM[num.toLowerCase()];
  const ref = major ? REF.major : REF.minor;
  const root = (ref[deg] - (flat ? 1 : 0) + 12) % 12;
  const upper = num === num.toUpperCase();
  const quality = dim ? 'dim' : upper ? 'maj' : 'min';
  if (ext === 5) return { sym, root, quality: 'power', tones: [0, 7, 12] }; // no third: neither major nor minor
  const tones = [...QUAL[quality]];
  // sevenths and ninths come from the scale when the chord is diatonic, otherwise the usual colour
  const dia = (k) => flat ? null : (ref[(deg + k) % 7] - ref[deg] + 12) % 12;
  const want = Math.max(ext, seven ? 7 : 3);
  if (want >= 7) tones.push(dia(6) ?? (quality === 'maj' ? 11 : 10));
  if (want >= 9) tones.push(12 + (dia(1) ?? 2));
  return { sym, root, quality, tones };
}

/** The resolved song frame: chord per bar plus scale. */
export function frame({ key = 9, scale = 'minor', prog = 'i VI III VII', per = 1, bars = 8, ext = 3, ending = null }) {
  const P = PROGRESSIONS.find(x => x.id === prog); const major = P?.major || false;
  const chords = prog.split(/\s+/).map(s => parseChord(s, { major, ext }));
  const perBar = []; for (let b = 0; b < bars; b++) perBar.push(chords[Math.floor(b / per) % chords.length]);
  // turnaround: the last bar of each phrase moves to VII (V in harmonic minor, V in major) to pull back to the top
  if (ending?.type === 'turnaround') {
    const turn = parseChord(major ? 'V' : scale === 'harmonic' ? 'V' : 'VII', { major, ext });
    for (let b = (ending.every || 4) - 1; b < bars; b += ending.every || 4) if (perBar[b].root !== turn.root) perBar[b] = turn;
  }
  return { key, scale: SCALES[scale].iv, scaleId: scale, bars, per, chords, perBar, total: bars * STEPS, major };
}

const pc = (p) => ((p % 12) + 12) % 12;
/** Pitch classes of the chord in a given bar, absolute (0–11). */
export const chordPcs = (f, bar) => { const c = f.perBar[bar]; return c.tones.map(t => pc(f.key + c.root + t)); };
/** Scale for a bar, bent so borrowed chord tones win over the clashing scale note (e.g. G# over V in minor). */
export function barScale(f, bar) {
  const pcs = new Set(f.scale.map(i => pc(f.key + i)));
  for (const t of chordPcs(f, bar)) if (!pcs.has(t)) { pcs.delete(pc(t + 1)); pcs.delete(pc(t - 1)); pcs.add(t); }
  return [...pcs].sort((a, b) => a - b);
}
/** All MIDI notes of a pitch-class set between lo and hi. */
const notesIn = (pcs, lo, hi) => { const out = []; for (let p = lo; p <= hi; p++) if (pcs.includes(pc(p))) out.push(p); return out; };
const nearest = (cands, target) => !cands.length ? target : cands.reduce((b, p) => (Math.abs(p - target) < Math.abs(b - target) ? p : b), cands[0]);
const clampV = (v) => Math.max(1, Math.min(127, Math.round(v)));
/** Chord root at the given register (octave = MIDI octave of the C below). */
const rootIn = (f, bar, base) => base + pc(f.key + f.perBar[bar].root);
/** A chord starts where the chord changes (so a turnaround bar counts); chordLen = bars until the next change. */
const chordStart = (f, bar) => bar === 0 || f.perBar[bar] !== f.perBar[bar - 1];
const chordLen = (f, bar) => { let b = bar + 1; while (b < f.bars && f.perBar[b] === f.perBar[bar]) b++; return b - bar; };

// ---------------- bass ----------------
export function genBass(f, { pattern = 'donk', density = 40, movement = 25, octave = 1, seed = 1, lead = [] } = {}) {
  const r = rng(seed ^ 0xB455), D = density / 100, M = movement / 100, base = 12 * (octave + 1);
  const notes = [];
  // which pitch: mostly the root; movement brings in octave, fifth and an approach note before chord changes
  const pitchFor = (bar, step, strong) => {
    const root = rootIn(f, bar, base);
    if (pattern === 'rolling' || pattern === 'donk' && M < 0.15) return root;
    if (strong || !r.chance(M)) return root;
    const fifth = root + 7, oct = root + 12; const c = f.perBar[bar];
    const opts = [oct, fifth, root + c.tones[1]]; return r.weighted(opts, [3, 3, 1]);
  };
  const add = (p, s, d, v, g) => notes.push({ p, s, d, v: clampV(v), ...(g ? { g: true } : {}) });
  // psytrance rule: one note, at most a change every four bars
  const psyRoot = (bar) => rootIn(f, Math.floor(bar / 4) * 4, base);
  let rootsRiff = null, jumpRiff = null, gfunkRiff = null;
  if (pattern === 'unison') {
    // the lowest note of every lead onset, dropped into the bass octave; long notes stay long
    const byStart = new Map(); for (const n of lead) if (!byStart.has(n.s) || byStart.get(n.s).p > n.p) byStart.set(n.s, n);
    for (const n of byStart.values()) add(base + pc(n.p), n.s, n.d, clampV(n.v - 6));
    if (!notes.length) for (let bar = 0; bar < f.bars; bar++) if (chordStart(f, bar)) add(rootIn(f, bar, base), bar * STEPS, chordLen(f, bar) * STEPS, 96);
    return cleanup(notes, f.total, true);
  }
  for (let bar = 0; bar < f.bars; bar++) {
    const o = bar * STEPS;
    if (pattern === 'donk') {
      for (const s of [2, 6, 10, 14]) add(pitchFor(bar, s, s === 2), o + s, 2, 100 - (s === 10 ? 0 : 8));
      if (D > 0.6) for (const s of [3, 11]) if (r.chance(D - 0.5)) add(rootIn(f, bar, base), o + s, 1, 70);
    } else if (pattern === 'double') {
      for (const s of [2, 6, 10, 14]) { add(pitchFor(bar, s, true), o + s, 1, 104); if (r.chance(0.6 + D * 0.4)) add(pitchFor(bar, s + 1, false), o + s + 1, 1, 84); }
    } else if (pattern === 'rolling') {
      const p = M > 0.2 ? rootIn(f, bar, base) : psyRoot(bar);
      for (let s = 0; s < STEPS; s++) { if (s % 4 === 0) continue; if (D < 0.5 && r.chance((0.5 - D) * 0.6)) continue; add(p, o + s, 1, s % 4 === 1 ? 108 : s % 4 === 2 ? 88 : 96); }
    } else if (pattern === 'sub') {
      if (chordStart(f, bar)) { const cl = chordLen(f, bar), len = cl * STEPS; add(rootIn(f, bar, base), o, len, 100); if (D > 0.55 && cl > 1) { notes[notes.length - 1].d = len - 4; add(pitchFor(bar, 0, false), o + len - 3, 3, 80); } }
    } else if (pattern === 'dub') {
      if (bar % 4 === 0) {
        const n = D > 0.5 ? 3 : 2; const slots = [0, 6, 14, 22, 30, 38, 46, 54].filter(s => s < Math.min(4, f.bars - bar) * STEPS);
        const starts = [0, ...pickSorted(r, slots.slice(1), n - 1)];
        starts.forEach((s, i) => { const b = bar + Math.floor(s / STEPS); const end = starts[i + 1] ?? Math.min(4, f.bars - bar) * STEPS; add(pitchFor(b, s, i === 0), o + s, Math.max(2, end - s - 1), 96 - i * 6); });
      }
    } else if (pattern === 'garage') {
      if (bar % 2 === 0) {
        // kick on 1 and the "and" of 3 in a two-step: answer in the holes
        const holes = [3, 6, 13, 16 + 3, 16 + 6, 16 + 13].filter(s => s < Math.min(2, f.bars - bar) * STEPS);
        const n = D > 0.65 ? 4 : 3; const starts = pickSorted(r, holes, Math.min(n, holes.length));
        starts.forEach((s, i) => { const b = bar + Math.floor(s / STEPS); const end = starts[i + 1] ?? Math.min(2, f.bars - bar) * STEPS + 2; add(pitchFor(b, s % STEPS, i === 0), o + s, Math.max(2, end - s - 1), 98 - i * 5); });
      }
    } else if (pattern === '808') {
      const root = rootIn(f, bar, base);
      add(root, o, 5, 110);
      const syn = pickSorted(r, [6, 7, 10, 11, 14], D > 0.6 ? 3 : 2);
      syn.forEach((s, i) => {
        const glide = r.chance(0.25 + M * 0.5);
        const p = r.chance(M) ? r.pick([root + 12, root + 7, root - 2]) : root;
        const next = syn[i + 1] ?? STEPS; add(p, o + s, Math.max(1, next - s - (glide ? 0 : 1)) + (glide ? 1 : 0), 96, glide);
      });
    } else if (pattern === 'halftime') {
      add(rootIn(f, bar, base), o, 9, 100, r.chance(M)); add(pitchFor(bar, 10, false), o + 10, 5, 90);
      if (D > 0.6 && r.chance(D - 0.4)) { const last = notes[notes.length - 1]; last.d = 3; add(rootIn(f, bar, base), o + 14, 2, 80); }
    } else if (pattern === 'roots') {
      // a two-bar riff in semitones above the chord root, transposed with each chord and snapped to the scale
      if (bar % 2 === 0) {
        const riff = rootsRiff ??= makeRiff(r, D, M, [2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 18, 19, 20, 22, 24, 26, 27, 28, 30], [0, 0, 7, 12, 10, 3, 5], r.chance(0.6) ? 2 : 0);
        for (const n of riff) { const b = bar + Math.floor(n.s / STEPS); if (b >= f.bars) continue; const root = rootIn(f, b, base); add(snap(f, b, root + n.i), o + n.s, n.d, n.v); }
      }
    } else if (pattern === 'boom') {
      const root = rootIn(f, bar, base); const nextRoot = rootIn(f, Math.min(f.bars - 1, bar + 1), base);
      add(root, o, r.chance(0.5) ? 4 : 3, 110);
      add(r.chance(M) ? root + 12 : root, o + r.pick([6, 7]), 2, 92);
      if (D > 0.3) add(r.chance(M) ? root + 7 : root, o + 10, r.chance(0.5) ? 3 : 2, 96);
      if (nextRoot !== root || r.chance(M * 0.6)) add(snap(f, bar, nextRoot + (nextRoot > root ? -1 : 1) * r.pick([1, 2])), o + 14, 2, 84); // into the next chord
    } else if (pattern === 'jumpup') {
      if (bar % 2 === 0) {
        const riff = jumpRiff ??= (() => {
          const on = [0, ...pickSorted(r, [3, 6, 8, 10, 11, 14], 3 + Math.round(D * 2))]; const call = on.map((s, i) => ({ s, i: i === 0 ? 0 : r.weighted([0, 12, -12, 1, 6, 7], [3, 3, 1, M, M, 1]), d: Math.max(1, (on[i + 1] ?? 16) - s - (r.chance(0.4) ? 1 : 0)), g: r.chance(0.2 + M * 0.4) }));
          const resp = call.map((n, k) => ({ ...n, s: n.s + 16, i: k === call.length - 1 ? r.pick([12, 7, -5, 1]) : n.i }));
          return call.concat(resp);
        })();
        for (const n of riff) { const b = bar + Math.floor(n.s / STEPS); if (b >= f.bars) continue; add(rootIn(f, b, base) + n.i, o + n.s, n.d, n.s % 16 === 0 ? 112 : 96, n.g); }
      }
    } else if (pattern === 'cumbia') {
      const root = rootIn(f, bar, base); const fifth = root + 7 - (r.chance(0.5) ? 12 : 0); const nextRoot = rootIn(f, Math.min(f.bars - 1, bar + 1), base);
      add(root, o, 3, 108); add(fifth, o + 8, 3, 100);
      if (D > 0.4 && r.chance(D)) add(r.chance(0.5) ? root + 12 : fifth, o + 6, 1, 80);
      add(r.chance(M) ? snap(f, bar, nextRoot - 2) : fifth, o + 14, 2, 90); // pickup into the next bar
    } else if (pattern === 'octave') {
      const root = rootIn(f, bar, base);
      for (let s = 0; s < STEPS; s += 2) { const up = (s / 2) % 2 === 1; if (D < 0.4 && s % 4 === 2 && r.chance(0.4 - D)) continue; add(up ? root + 12 : root, o + s, 1 + (r.chance(D) ? 1 : 0), up ? 100 : 108); }
      if (M > 0.4 && r.chance(M - 0.3)) { const last = notes[notes.length - 1]; last.p = root + 7; } // a fifth now and then
    } else if (pattern === 'bossa') {
      const root = rootIn(f, bar, base); const nextRoot = rootIn(f, Math.min(f.bars - 1, bar + 1), base);
      const change = bar + 1 < f.bars && f.perBar[bar + 1] !== f.perBar[bar];
      add(root, o, 6, 96); add(root + 7 - 12 * (root + 7 > base + 19 ? 1 : 0), o + 8, change ? 5 : 7, 88);
      if (change) add(nextRoot, o + 14, 2, 84); // the anticipation: the next chord arrives an eighth early
      else if (D > 0.5) add(root + 12, o + 14, 2, 76);
    } else if (pattern === 'gfunk') {
      if (bar % 2 === 0) {
        const riff = gfunkRiff ??= makeRiff(r, D, M, [3, 4, 6, 7, 10, 11, 12, 14, 16, 19, 22, 23, 26, 28, 30], [12, 7, 10, 3, 5, 12, 0], 0).map(n => ({ ...n, g: r.chance(0.25 + M * 0.4) }));
        for (const n of riff) { const b = bar + Math.floor(n.s / STEPS); if (b >= f.bars) continue; add(snap(f, b, rootIn(f, b, base) + n.i), o + n.s, n.d, n.v, n.g); }
      }
    } else if (pattern === 'reese') {
      // held for the chord, retriggered every two bars (every bar with movement)
      const every = M > 0.5 ? 1 : 2;
      if (chordStart(f, bar) || (bar % f.per) % every === 0) { let cs = bar; while (!chordStart(f, cs)) cs--; const left = chordLen(f, cs) - (bar - cs); add(pitchFor(bar, 0, chordStart(f, bar)), o, Math.min(every, left, f.bars - bar) * STEPS - 1, 100); }
      if (D > 0.4 && r.chance(D * 0.6)) { const s = r.pick([10, 11, 14]); add(r.chance(M) ? rootIn(f, bar, base) + 12 : rootIn(f, bar, base), o + s, STEPS - s - 1, 88); }
    }
  }
  return cleanup(notes, f.total, true);
}
/** Nearest scale note of the bar (borrowed chord tones included). */
function snap(f, bar, p) { const sc = barScale(f, bar); return sc.includes(pc(p)) ? p : sc.includes(pc(p - 1)) ? p - 1 : p + 1; }
/** A riff as { s, i (semitones above the chord root), d, v }: rhythm from the slots, intervals from the pool, first note maybe late. */
function makeRiff(r, D, M, slots, pool, startAt) {
  const n = Math.round(5 + D * 4); const on = [...new Set([startAt, ...pickSorted(r, slots.filter(s => s > startAt), n - 1)])].sort((a, b) => a - b);
  return on.map((s, k) => ({ s, i: k === 0 ? 0 : r.chance(1 - M) ? r.pick([0, 0, 12, 7]) : r.pick(pool), d: Math.max(1, (on[k + 1] ?? 32) - s - 1), v: s % 16 === 2 || s % 8 === 0 ? 108 : 94 }));
}
function pickSorted(r, items, n) { const pool = [...items], out = []; while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r.next() * pool.length), 1)[0]); return out.sort((a, b) => a - b); }

// ---------------- pad ----------------
/** Voice a chord near the previous voicing: try inversions in the register, keep the top voice still. */
export function voiceLead(pcs, prev, lo = 52, hi = 76) {
  const cands = [];
  const n = pcs.length;
  for (let inv = 0; inv < n; inv++) {
    for (let start = lo; start <= hi - 7; start++) {
      if (pc(start) !== pcs[inv]) continue;
      const v = [start]; for (let k = 1; k < n; k++) { let p = v[k - 1] + 1; while (pc(p) !== pcs[(inv + k) % n]) p++; v.push(p); }
      if (v[n - 1] <= hi + 2) cands.push(v);
    }
  }
  if (!prev) { const mid = (lo + hi) / 2; return cands.reduce((b, v) => Math.abs(avg(v) - mid) < Math.abs(avg(b) - mid) ? v : b, cands[0]); }
  const cost = (v) => Math.abs(v[v.length - 1] - prev[prev.length - 1]) * 2 + v.reduce((a, p) => a + Math.min(...prev.map(q => Math.abs(p - q))), 0);
  return cands.reduce((b, v) => cost(v) < cost(b) ? v : b, cands[0]);
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export function genPad(f, { pattern = 'long', density = 40, octave = 3, seed = 1 } = {}) {
  const r = rng(seed ^ 0x9AD), D = density / 100; const lo = 12 * (octave + 1) + 4, hi = lo + 24;
  const notes = []; let prev = null;
  const chordAt = (bar) => { const v = voiceLead(chordPcs(f, bar), prev, lo, hi); prev = v; return v; };
  const addChord = (v, s, d, vel) => { for (const p of v) notes.push({ p, s, d, v: clampV(vel) }); };
  if (pattern === 'drone') {
    const root = 12 * octave + pc(f.key); const span = f.total; addChord([root, root + 7], 0, span, 70); return cleanup(notes, f.total);
  }
  // a rhythm for stabs, shared by every bar so it reads as a riff
  const stabRhythm = pickSorted(r, [0, 2, 3, 6, 7, 10, 11, 14], D > 0.6 ? 4 : 3);
  if (!stabRhythm.includes(0) && r.chance(0.5)) stabRhythm.unshift(0);
  for (let bar = 0; bar < f.bars; bar++) {
    const o = bar * STEPS;
    if (pattern === 'long' || pattern === 'push') {
      if (!chordStart(f, bar)) continue;
      const v = chordAt(bar); const cl = chordLen(f, bar), len = cl * STEPS;
      const early = pattern === 'push' && bar > 0 ? 2 : 0;
      addChord(v, o - early, len + early - (pattern === 'push' ? 2 : 0), 84);
      // density adds a re-strike halfway through long chords
      if (pattern === 'push' && D > 0.5 && cl >= 2) { const s = o + len / 2 - 2; addChord(v, s, 2, 70); }
    } else if (pattern === 'bossa') {
      const v = chordStart(f, bar) || !prev ? chordAt(bar) : prev;
      const hits = bar % 2 === 0 ? [0, 3, 6, 10, 12] : [2, 6, 9, 12]; // the two-bar comping figure
      for (const s of hits) addChord(v, o + s, s === 0 || s === 12 ? 2 : 1, s === 0 ? 86 : 74);
    } else if (pattern === 'skank' || pattern === 'offbeat') {
      const v = chordStart(f, bar) || !prev ? chordAt(bar) : prev;
      const hits = pattern === 'skank' ? [4, 12, ...(D > 0.6 ? [5, 13] : [])] : [2, 6, 10, 14];
      for (const s of hits) addChord(v, o + s, pattern === 'skank' && D > 0.4 ? 2 : 1, s % 4 === 0 ? 96 : 84);
    } else if (pattern === 'stabs') {
      const v = chordStart(f, bar) || !prev ? chordAt(bar) : prev;
      for (const s of stabRhythm) addChord(v, o + s, r.chance(D) ? 2 : 1, s === 0 ? 96 : 82);
    }
  }
  return cleanup(notes, f.total);
}

// ---------------- lead ----------------
export function genLead(f, { pattern = 'motif', density = 40, movement = 30, octave = 4, seed = 1 } = {}) {
  const r = rng(seed ^ 0x1EAD), D = density / 100, M = movement / 100;
  const center = 12 * (octave + 1) + pc(f.key) + 0; // tonic in the lead octave
  const notes = [];
  if (pattern === 'arp') return cleanup(arpPhrase(f, r, D, M, center).map(({ strong, ...n }) => n), f.total);
  const phraseBars = { acid: 1, bells: 2, riff: 2, palm: 4, tremolo: 8, chop: 1 }[pattern] ?? Math.min(4, f.bars);
  let phrase;
  if (pattern === 'acid') phrase = acidPhrase(f, r, D, M, center);
  else if (pattern === 'riff') phrase = riffPhrase(f, r, D, M, center);
  else if (pattern === 'palm') phrase = palmPhrase(f, r, D, M, center);
  else if (pattern === 'tremolo') phrase = tremoloPhrase(f, r, D, M, center);
  else if (pattern === 'chop') phrase = chopPhrase(f, r, D, M, center);
  else if (pattern === 'arp') phrase = arpPhrase(f, r, D, M, center);
  else if (pattern === 'pedal') phrase = pedalPhrase(f, r, D, center, phraseBars);
  else phrase = motifPhrase(f, r, D, M, center, phraseBars, pattern === 'bells');
  for (let start = 0; start < f.bars; start += phraseBars) {
    const varied = ['motif', 'pedal', 'anthem'].includes(pattern) && f.bars >= 16 && start >= f.bars / 2 && start + phraseBars >= f.bars; // the very last phrase of 16 bars: a small change
    for (const n of phrase) {
      const s = start * STEPS + n.s; if (s >= f.total) continue;
      const bar = Math.floor(Math.max(0, s) / STEPS);
      let p = n.p;
      // a repeat over different chords: keep downbeat notes on chord tones
      if (n.strong && !chordPcs(f, bar).includes(pc(p))) p = nearest(notesIn(chordPcs(f, bar), p - 4, p + 4), p);
      notes.push({ ...n, s, p });
    }
    if (varied) { const last = notes[notes.length - 1]; if (last) last.p = nearest(notesIn(chordPcs(f, Math.floor(last.s / STEPS)), last.p - 5, last.p - 1), last.p - 2); }
  }
  let out = notes.map(({ strong, ...n }) => n);
  if (pattern === 'anthem') {
    const up = []; for (const n of out) { const bar = Math.floor(Math.max(0, n.s) / STEPS); const sc = barScale(f, bar); const all = notesIn(sc, n.p + 12, n.p + 18); up.push({ ...n, p: n.p + 12, v: clampV(n.v - 6) }); const third = all.filter(p => p > n.p + 12)[1]; if (third) up.push({ ...n, p: third, v: clampV(n.v - 14) }); }
    out = out.concat(up);
  }
  return cleanup(out, f.total);
}

/** Rhythm first, then pitches. Call (2 bars) + response (same, last note changed). Ends early, may start on a pickup. */
function motifPhrase(f, r, D, M, center, bars, bells) {
  const half = bars >= 4 ? 2 : bars; const span = half * STEPS;
  const count = bells ? 4 : Math.round(4 + D * 2); // 4–6 notes
  // onset candidates with weights: downbeats strong, eighths medium, sixteenths low
  const cands = [], w = [];
  for (let s = 0; s < span - (bars >= 4 ? 0 : 6); s++) { cands.push(s); w.push(s % STEPS === 0 ? 6 : s % 4 === 0 ? 3 : s % 2 === 0 ? 2 : 0.6 + D); }
  const pickup = !bells && r.chance(0.55);
  const onsets = new Set(pickup ? [r.pick([-2, -1])] : []);
  onsets.add(0); // a downbeat anchor always
  while (onsets.size < count) onsets.add(r.weighted(cands, w));
  const on = [...onsets].sort((a, b) => a - b);
  // pitches: start on a chord tone near the centre, stay inside a fifth, mostly steps, one leap then step back
  const scaleAt = (s) => barScale(f, Math.floor(Math.max(0, s) / STEPS));
  const window5 = [];
  const firstChord = chordPcs(f, 0);
  const start = nearest(notesIn(firstChord, center - 3, center + 7), center + 2);
  const sc0 = scaleAt(0); const all = notesIn(sc0, start - 7, start + 9); const si = all.indexOf(start);
  for (let k = -2; k <= 2; k++) if (all[si + k] != null) window5.push(all[si + k]);
  let idx = window5.indexOf(start), leapt = false, back = 0;
  const pitches = [];
  on.forEach((s, i) => {
    if (i === 0) { pitches.push(start); return; }
    let step;
    if (back) { step = back; back = 0; }
    else if (!leapt && r.chance(0.25 + M * 0.4)) { step = r.pick([2, -2, 3, -3]); leapt = true; back = -Math.sign(step); }
    else step = r.weighted([1, -1, 0], [2, 2, 1 - M * 0.5]);
    idx = Math.max(0, Math.min(window5.length - 1, idx + step));
    let p = window5[idx];
    const bar = Math.floor(Math.max(0, s) / STEPS);
    if (s % STEPS === 0) { const ct = notesIn(chordPcs(f, bar), window5[0] - 2, window5[window5.length - 1] + 2); if (!ct.includes(p)) p = nearest(ct, p); }
    else { const sc = scaleAt(s); if (!sc.includes(pc(p))) p = nearest(notesIn(sc, p - 2, p + 2), p); }
    pitches.push(p);
  });
  const notes = on.map((s, i) => { const next = on[i + 1] ?? span - (bars >= 4 ? 0 : 4); const d = Math.max(1, Math.min(bells ? 3 : 6, next - s - (r.chance(0.3) ? 1 : 0))); return { p: pitches[i], s, d, v: clampV(s % 4 === 0 ? 100 : 86), strong: s % STEPS === 0 }; });
  if (bars < 4) return notes;
  // response: same rhythm and notes, last note changed, and the last half bar left empty
  const resp = notes.map(n => ({ ...n, s: n.s + span }));
  const last = resp[resp.length - 1];
  const prevP = resp.length > 1 ? resp[resp.length - 2].p : last.p;
  const alt = window5.filter(p => p !== last.p);
  last.p = nearest(alt, prevP + (last.p >= prevP ? -1 : 1) * 2);
  const out = notes.concat(resp).filter(n => n.s < bars * STEPS - 8);
  for (const n of out) if (n.s + n.d > bars * STEPS - 8) n.d = Math.max(1, bars * STEPS - 8 - n.s);
  return out;
}
/** Pedal: one pitch, the note the chords share most, with a rhythm that is not on the grid. */
function pedalPhrase(f, r, D, center, bars) {
  const counts = new Map(); for (let b = 0; b < f.bars; b++) for (const t of chordPcs(f, b)) counts.set(t, (counts.get(t) || 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] === pc(f.key) ? -1 : 1))[0][0];
  const p = nearest(notesIn([best], center, center + 11), center + 4);
  const cell = pickSorted(r, [0, 3, 6, 8, 10, 11, 14], 2 + Math.round(D * 3)); if (!cell.includes(0) && r.chance(0.5)) cell.unshift(0);
  const out = [];
  for (let b = 0; b < bars; b++) for (const s of cell) out.push({ p, s: b * STEPS + s, d: r.chance(0.5) ? 2 : 1, v: clampV(s === 0 ? 100 : 80 + r.int(0, 12)), strong: false });
  return out;
}
/** Acid: one bar of sixteenths on four notes (root, b2/b3, fifth, octave), rests, accents and slides. */
function acidPhrase(f, r, D, M, center) {
  const sc = barScale(f, 0); const root = center; const pool = notesIn(sc, root, root + 12);
  const four = [root, pool[1] ?? root + 1, pool[4] ?? root + 7, root + 12];
  const out = [];
  for (let s = 0; s < STEPS; s++) {
    if (s % 4 === 0 && r.chance(0.35)) continue; // leave kick spots open now and then
    if (!r.chance(0.35 + D * 0.55)) continue;
    const p = r.chance(0.5 - M * 0.3) ? four[0] : r.pick(four);
    out.push({ p, s, d: 1, v: clampV(r.chance(0.3) ? 118 : 84), g: r.chance(0.15 + M * 0.2), strong: false });
  }
  return out;
}

/** Sludge: 2–3 power-chord roots in two bars, long, left to ring; a b2 or b5 slide now and then. */
function riffPhrase(f, r, D, M, center) {
  const n = D > 0.6 ? 3 : r.chance(0.5) ? 2 : 3; const starts = [0, ...pickSorted(r, [6, 8, 10, 12, 16, 20, 22, 24], n - 1)];
  return starts.map((s, i) => {
    const bar = Math.floor(s / STEPS); const root = center + pc(f.key + f.perBar[bar].root - pc(center));
    const p = i === 0 ? root : r.chance(M) ? root + r.pick([1, 6, -2, 3]) : root + r.pick([0, 0, 12, 7]);
    const end = starts[i + 1] ?? 32; return { p, s, d: Math.max(2, end - s - (r.chance(0.3) ? 2 : 0)), v: clampV(i === 0 ? 112 : 100), strong: s % STEPS === 0 };
  });
}
/** Death: two bars of rhythm (chugs on the root, at least one syncopation), chromatic accents within a fifth; bars 3–4 = same rhythm, new pitches. */
function palmPhrase(f, r, D, M, center) {
  const root = center + pc(f.key - pc(center)); const span = 32; const on = new Set([0]);
  const count = Math.round(10 + D * 10);
  const w = []; for (let s = 0; s < span; s++) w.push(s % 4 === 0 ? 3 : s % 2 === 0 ? 2 : 1.4);
  while (on.size < count) on.add(r.weighted([...Array(span).keys()], w));
  if (![...on].some(s => s % 4 === 3 || s % 4 === 1)) on.add(r.pick([3, 7, 11, 19, 27]));
  const steps = [...on].sort((a, b) => a - b);
  const CHROM = [1, 6, 3, 7, 5, -1];
  const pitches = (salt) => steps.map((s, i) => (i === 0 || !r.chance(0.2 + M * 0.5) ? root : root + CHROM[(i * 7 + salt) % CHROM.length]));
  const a = pitches(0), b = pitches(3);
  const mk = (ps, off) => steps.map((s, i) => { const next = steps[i + 1] ?? span; const accent = ps[i] !== root || s % 8 === 0; return { p: ps[i], s: s + off, d: accent ? Math.min(next - s, 2) : 1, v: clampV(accent ? 112 : 84), strong: false }; });
  return mk(a, 0).concat(mk(b, span));
}
/** Black: a slow melody (a pitch per half bar or bar), stepwise inside a fifth, chord tones on downbeats, played as sixteenths. */
function tremoloPhrase(f, r, D, M, center) {
  const len = Math.min(8, f.bars) * STEPS, unit = D > 0.5 ? 8 : 16; const out = [];
  const sc = barScale(f, 0); const start = nearest(notesIn(chordPcs(f, 0), center - 2, center + 7), center + 2);
  const all = notesIn(sc, start - 7, start + 9); const si = all.indexOf(start); const win = all.slice(Math.max(0, si - 2), si + 3);
  let idx = win.indexOf(start);
  for (let s = 0; s < len; s += unit) {
    const bar = Math.floor(s / STEPS);
    if (s > 0) idx = Math.max(0, Math.min(win.length - 1, idx + r.weighted([1, -1, 0], [2, 2, 1.5 - M])));
    let p = win[idx];
    if (s % STEPS === 0) { const ct = notesIn(chordPcs(f, bar), win[0] - 2, win[win.length - 1] + 2); if (ct.length && !ct.includes(p)) p = nearest(ct, p); }
    for (let k = 0; k < unit; k++) out.push({ p, s: s + k, d: 1, v: clampV(k % 4 === 0 ? 100 : 82 + r.int(-6, 6)), strong: false });
  }
  return out;
}
/** Arp: every bar, the bar's chord in sixteenths over two octaves (up, down or up-down), some steps resting at low density. */
function arpPhrase(f, r, D, M, center) {
  const shape = r.pick(['up', 'updown', 'down', 'updown']); const out = [];
  for (let bar = 0; bar < f.bars; bar++) {
    const tones = notesIn(chordPcs(f, bar), center - 1, center + 13 + Math.round(M * 6)).slice(0, 7); if (!tones.length) continue;
    const seq = shape === 'up' ? tones : shape === 'down' ? [...tones].reverse() : [...tones, ...tones.slice(1, -1).reverse()];
    for (let s = 0; s < STEPS; s++) {
      if (D < 0.6 && s % 2 === 1 && r.chance(0.6 - D)) continue;
      out.push({ p: seq[(bar * STEPS + s) % seq.length], s: bar * STEPS + s, d: 1, v: clampV(s % 4 === 0 ? 104 : 80 + r.int(-6, 6)), strong: false });
    }
  }
  return out;
}
/** Footwork: a half-bar fragment, notes every three steps, looped. Two or three pitches, never transposed. */
function chopPhrase(f, r, D, M, center) {
  const sc = barScale(f, 0); const pool = notesIn(sc, center, center + 7); const cell = [];
  for (let s = 0; s < 8; s += 3) if (s === 0 || r.chance(0.6 + D * 0.4)) cell.push({ p: r.chance(0.5 + M * 0.3) ? r.pick(pool) : pool[0], s, d: r.chance(0.5) ? 2 : 1, v: clampV(s === 0 ? 104 : 90) });
  // the three-step grouping spills over the half bar on purpose: loop the cell every 8 steps
  return [...cell, ...cell.map(n => ({ ...n, s: n.s + 8 }))].map(n => ({ ...n, strong: false }));
}

/** Sort, clip to the loop, trim overlaps (monophonic parts), drop empties. */
function cleanup(notes, total, mono = false) {
  let out = notes.filter(n => n.s < total && n.s + n.d > 0).map(n => { const s = Math.max(0, n.s); return { ...n, s, d: Math.min(n.d - (s - n.s), total - s) }; }).filter(n => n.d > 0);
  out.sort((a, b) => a.s - b.s || a.p - b.p);
  if (mono) for (let i = 0; i < out.length - 1; i++) { const n = out[i], m = out[i + 1]; if (n.s + n.d > m.s && !n.g) n.d = Math.max(1, m.s - n.s); if (n.g) n.d = Math.max(1, m.s - n.s + 1); }
  return out;
}

export const PARTS = ['bass', 'pad', 'lead'];
export const GEN = { bass: genBass, pad: genPad, lead: genLead };
export const PATTERNS = { bass: BASS_PATTERNS, pad: PAD_PATTERNS, lead: LEAD_PATTERNS };
