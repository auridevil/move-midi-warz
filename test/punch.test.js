import test from 'node:test';
import assert from 'node:assert/strict';
import { GENRES, PARTS, GEN, PATTERNS, STEPS, frame, parseChord, chordPcs, voiceLead, genBass, genLead } from '../src/punch/gen.js';
import { writeMidi, readMidi, PPQ } from '../src/punch/smf.js';

const f8 = (o = {}) => frame({ key: 9, scale: 'minor', prog: 'i VI III VII', per: 1, bars: 8, ...o });

test('chords: degrees in A minor, borrowed chords, sevenths from the scale', () => {
  assert.deepEqual(chordPcs(f8(), 0), [9, 0, 4]);            // Am
  assert.deepEqual(chordPcs(f8(), 1), [5, 9, 0]);            // F
  assert.deepEqual(parseChord('V').tones, [0, 4, 7]);         // E major (harmonic minor)
  assert.equal(parseChord('bII').root, 1);                    // Bb in A minor
  assert.deepEqual(parseChord('i7').tones, [0, 3, 7, 10]);
  assert.deepEqual(parseChord('VI', { ext: 7 }).tones, [0, 4, 7, 11]); // Fmaj7, diatonic
});

test('every genre × part × pattern makes notes inside the loop, deterministic per seed', () => {
  for (const [id, g] of Object.entries(GENRES)) for (const bars of [8, 16]) {
    const f = frame({ key: 4, scale: g.scale, prog: g.prog, per: g.per, bars, ext: g.ext });
    for (const part of PARTS) for (const pattern of Object.keys(PATTERNS[part])) {
      const opts = { pattern, density: g.density, movement: g.movement, seed: 42 };
      const a = GEN[part](f, opts), b = GEN[part](f, opts);
      assert.ok(a.length > 0, `${id} ${part} ${pattern} is empty`);
      assert.deepEqual(a, b, `${id} ${part} ${pattern} not deterministic`);
      for (const n of a) { assert.ok(n.s >= 0 && n.d >= 1 && n.s + n.d <= bars * STEPS, `${id} ${part} ${pattern} out of loop`); assert.ok(n.p >= 0 && n.p <= 127 && n.v >= 1 && n.v <= 127); }
    }
  }
});

test('house donk sits on the offbeat eighths, never with the kick', () => {
  const b = genBass(f8(), { pattern: 'donk', density: 40, movement: 0, seed: 1 });
  for (const n of b) assert.ok([2, 6, 10, 14].includes(n.s % 16));
});

test('psytrance rolling bass: three notes per beat, one pitch per four bars, never on the kick', () => {
  const f = frame({ key: 4, scale: 'phrygian', prog: 'i', per: 4, bars: 8 });
  const b = genBass(f, { pattern: 'rolling', density: 100, movement: 0, seed: 3 });
  assert.equal(b.length, 12 * 8);
  for (const n of b) { assert.notEqual(n.s % 4, 0); assert.equal(n.d, 1); }
  assert.equal(new Set(b.map(n => n.p)).size, 1);
});

test('lead motif: chord tones on downbeats, within a narrow range, last half bar of each phrase empty', () => {
  for (let seed = 1; seed < 40; seed++) {
    const f = f8(); const l = genLead(f, { pattern: 'motif', density: 50, movement: 40, seed });
    for (const n of l) if (n.s % 16 === 0) assert.ok(chordPcs(f, n.s / 16).includes(n.p % 12), `seed ${seed}: downbeat ${n.p} not a chord tone`);
    const span = Math.max(...l.map(n => n.p)) - Math.min(...l.map(n => n.p)); assert.ok(span <= 12, `seed ${seed}: span ${span}`);
    for (const n of l) assert.ok(n.s % 64 < 56 || n.s % 64 >= 62, `seed ${seed}: note in the empty half bar (pickups of the next phrase allowed) at ${n.s}`);
    assert.ok(l.filter(n => n.s < 32).length >= 4 && l.filter(n => n.s < 32).length <= 7);
  }
});

test('pad voice leading keeps the top voice close', () => {
  const am = [9, 0, 4], f = [5, 9, 0];
  const a = voiceLead(am, null), b = voiceLead(f, a);
  assert.ok(Math.abs(b[b.length - 1] - a[a.length - 1]) <= 2);
});

test('.mid round trip: tempo, tracks, notes, ticks', () => {
  const parts = [{ name: 'Bass', ch: 1, notes: [{ p: 45, s: 2, d: 2, v: 100 }, { p: 45, s: 6, d: 2, v: 90 }] }, { name: 'Lead', ch: 3, notes: [{ p: 72, s: 0, d: 4, v: 110 }] }];
  const m = readMidi(writeMidi({ bpm: 124, parts }));
  assert.equal(m.format, 1); assert.equal(m.ppq, PPQ); assert.equal(m.tracks.length, 3);
  assert.equal(Math.round(m.tracks[0].tempo), 124);
  assert.equal(m.tracks[1].name, 'Bass'); assert.deepEqual(m.tracks[1].notes.map(n => [n.p, n.on, n.ch]), [[45, 48, 1], [45, 144, 1]]);
  assert.equal(m.tracks[2].notes[0].ch, 3); assert.equal(m.tracks[2].notes[0].off, 4 * 24 - 1);
});

test('.mid never overlaps the same pitch', () => {
  const m = readMidi(writeMidi({ bpm: 120, parts: [{ name: 'x', ch: 1, notes: [{ p: 40, s: 0, d: 4, v: 100, g: true }, { p: 40, s: 2, d: 2, v: 100 }] }] }));
  assert.equal(m.tracks[1].notes.length, 2); assert.ok(m.tracks[1].notes[0].off <= m.tracks[1].notes[1].on);
});

test('metal: power chords have no third, the unison bass doubles the riff, tremolo is continuous sixteenths', () => {
  assert.deepEqual(parseChord('i', { ext: 5 }).tones, [0, 7, 12]);
  const f = frame({ key: 4, scale: 'phrygian', prog: 'i bII', per: 2, bars: 8, ext: 5 });
  const riff = genLead(f, { pattern: 'palm', density: 55, movement: 45, octave: 2, seed: 9 });
  const bass = genBass(f, { pattern: 'unison', octave: 1, seed: 9, lead: riff });
  assert.deepEqual(new Set(bass.map(n => n.s)), new Set(riff.map(n => n.s)));
  for (const n of bass) assert.equal(n.p % 12, riff.find(m => m.s === n.s).p % 12);
  const trem = genLead(f, { pattern: 'tremolo', density: 50, movement: 25, seed: 9 });
  assert.equal(trem.length, 8 * 16); assert.ok(trem.every(n => n.d === 1));
  const span = Math.max(...trem.map(n => n.p)) - Math.min(...trem.map(n => n.p)); assert.ok(span <= 9, `tremolo span ${span}`);
});

import { applyEnding, applyChaos, ENDINGS } from '../src/punch/vary.js';
import { genPad } from '../src/punch/gen.js';
import { SOUNDS, defaultSound } from '../src/punch/sounds.js';

test('phrase endings: drop empties the last half bar, fill runs into the next phrase, turnaround moves the harmony', () => {
  const f = f8(); const lead = genLead(f, { pattern: 'motif', density: 60, seed: 5 });
  const drop = applyEnding(f, 'lead', lead, { type: 'drop', every: 4 }, 5);
  for (const n of drop) for (const o of [3 * 16, 7 * 16]) assert.ok(!(n.s >= o + 8 && n.s < o + 16) && !(n.s < o + 8 && n.s + n.d > o + 8));
  const fill = applyEnding(f, 'lead', lead, { type: 'fill', every: 4 }, 5);
  assert.equal(fill.filter(n => n.s >= 3 * 16 + 12 && n.s < 4 * 16).length, 4);
  const t = frame({ key: 9, scale: 'minor', prog: 'i VI', per: 2, bars: 8, ending: { type: 'turnaround', every: 4 } });
  assert.deepEqual(chordPcs(t, 3), [7, 11, 2]); assert.deepEqual(chordPcs(t, 7), [7, 11, 2]); // G in A minor
  const pad = genPad(t, { pattern: 'long', seed: 1 }); assert.ok(pad.some(n => n.s === 3 * 16));
  for (const type of Object.keys(ENDINGS)) for (const part of PARTS) applyEnding(f, part, GEN[part](f, { seed: 2 }), { type, every: 8 }, 2);
});

test('chaos: deterministic per seed, stays in the loop and in MIDI range, zero = untouched', () => {
  const f = f8({ bars: 16 }); const lead = genLead(f, { pattern: 'motif', seed: 8 });
  assert.equal(applyChaos(f, 'lead', lead, {}, 1), lead);
  const c = { mutate: 100, ratchet: 100, scatter: 100, glitch: 100 };
  const a = applyChaos(f, 'lead', lead, c, 3), b = applyChaos(f, 'lead', lead, c, 3);
  assert.deepEqual(a, b); assert.notDeepEqual(a, lead);
  for (const n of a) assert.ok(n.s >= 0 && n.s + n.d <= 256 && n.p >= 0 && n.p <= 127 && n.v >= 1 && n.v <= 127);
});

test('sound library: 10 pads, a default for every pattern', () => {
  assert.equal(SOUNDS.pad.length, 10);
  for (const part of PARTS) for (const p of Object.keys(PATTERNS[part])) assert.ok(defaultSound(part, p) >= 0);
});

import { buildSong, makeBundle, crc32, setFileName } from '../src/punch/ablbundle.js';
import { readFileSync } from 'node:fs';

test('Move Set: stored zip with Song.abl, 4 tracks × 8 slots, beats, no same-pitch overlaps', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  const devices = JSON.parse(readFileSync(new URL('../src/punch/move-drift.json', import.meta.url)));
  const song = buildSong({ bpm: 128, key: 9, scale: 'phrygian', bars: 8, parts: [null, { name: 'Lead', color: 14, notes: [{ p: 69, s: 0, d: 4, v: 100 }, { p: 69, s: 2, d: 2, v: 90 }] }, { name: 'Pad', color: 6, notes: [] }, { name: 'Bass', color: 1, notes: [{ p: 33, s: 6, d: 2, v: 100 }] }] }, devices);
  assert.equal(song.tracks.length, 4); assert.ok(song.tracks.every(t => t.clipSlots.length === 8 && t.devices.length));
  assert.equal(song.scenes.length, 8); assert.equal(song.scale, 'Phrygian'); assert.equal(song.rootNote, 9);
  assert.equal(song.tracks[0].name, 'Drums'); assert.ok(song.tracks[0].clipSlots.every(c => c.clip === null));
  const lead = song.tracks[1].clipSlots[0].clip; assert.equal(lead.region.end, 32);
  assert.deepEqual(lead.notes.map(n => [n.startTime, n.duration]), [[0, 0.5], [0.5, 0.5]]);
  assert.equal(song.tracks[3].clipSlots[0].clip.notes[0].startTime, 1.5);
  const zip = makeBundle(song);
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(new TextDecoder().decode(zip.slice(30, 38)), 'Song.abl');
  assert.equal(setFileName('My / Set: 1'), 'My Set 1.ablbundle');
});

test('genre presets: every pattern, kick, progression and preferred sound exists', async () => {
  const { KICKS, PROGRESSIONS } = await import('../src/punch/gen.js');
  for (const [id, g] of Object.entries(GENRES)) {
    assert.ok(PATTERNS.bass[g.bass] && PATTERNS.pad[g.pad] && PATTERNS.lead[g.lead], id); assert.ok(KICKS[g.kick], `${id} kick`);
    assert.ok(PROGRESSIONS.some(p => p.id === g.prog), `${id} prog`);
    for (const [part, name] of Object.entries(g.sounds || {})) assert.ok(SOUNDS[part].some(s => s.name === name), `${id} ${part} sound ${name}`);
  }
});
test('cumbia bass: root on one, fifth on three; skank on two and four', () => {
  const f = frame({ key: 9, scale: 'harmonic', prog: 'i V', per: 2, bars: 8 });
  const b = genBass(f, { pattern: 'cumbia', density: 0, movement: 0, seed: 4 });
  assert.ok(b.some(n => n.s === 0 && n.p % 12 === 9) && b.some(n => n.s === 8 && n.p % 12 === 4));
  const sk = genPad(f, { pattern: 'skank', density: 0, seed: 4 }); assert.ok(sk.every(n => n.s % 16 === 4 || n.s % 16 === 12));
});

test('takes: Move Set puts take i in slot i on every track, named scenes; .mid markers round-trip', () => {
  const devices = JSON.parse(readFileSync(new URL('../src/punch/move-drift.json', import.meta.url)));
  const clip = (s) => ({ bars: 8, notes: [{ p: 60, s, d: 2, v: 100 }] });
  const parts = [null, { name: 'Lead', color: 14, clips: [{ name: 'a', ...clip(0) }, { name: 'b', ...clip(4) }, { name: 'c', bars: 16, notes: [] }] }];
  const song = buildSong({ bpm: 120, parts, scenes: ['verse', 'drop', 'weird'] }, devices);
  assert.deepEqual(song.scenes.slice(0, 4).map(x => x.name), ['verse', 'drop', 'weird', '']);
  const slots = song.tracks[1].clipSlots; assert.equal(slots[1].clip.notes[0].startTime, 1); assert.equal(slots[2].clip.region.end, 64); assert.equal(slots[3].clip, null);
  assert.ok(slots[0].clip.isPlaying && !slots[1].clip.isPlaying);
  const m = readMidi(writeMidi({ bpm: 120, parts: [{ name: 'L', ch: 1, notes: [{ p: 60, s: 128, d: 2, v: 90 }] }], markers: [{ s: 0, text: 'verse' }, { s: 128, text: 'drop' }] }));
  assert.deepEqual(m.tracks[0].markers.map(x => [x.t, x.text]), [[0, 'verse'], [128 * 24, 'drop']]);
});

test('italo octave bass, bossa anticipation, arp follows the chords', () => {
  const f = frame({ key: 9, scale: 'minor', prog: 'i VI III VII', per: 1, bars: 8 });
  const oct = genBass(f, { pattern: 'octave', density: 100, movement: 0, seed: 2 });
  assert.equal(oct.filter(n => n.s < 16).length, 8); assert.equal(oct[1].p - oct[0].p, 12);
  const fb = frame({ key: 0, scale: 'major', prog: 'I vi ii V', per: 1, bars: 8 });
  const bossa = genBass(fb, { pattern: 'bossa', density: 0, movement: 0, seed: 2 });
  assert.equal(bossa.find(n => n.s === 14).p % 12, 9); // A, the vi, arrives an eighth early
  const arp = genLead(f, { pattern: 'arp', density: 100, seed: 2 });
  for (const n of arp) assert.ok(chordPcs(f, Math.floor(n.s / 16)).includes(n.p % 12));
  assert.equal(arp.length, 8 * 16);
});
