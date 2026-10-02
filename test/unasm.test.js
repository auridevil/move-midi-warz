import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTempo, nextGrid, barStep, barStart } from '../src/unasm/beats.js';

/** Synthetic track: kick-ish thumps on every beat (louder on the one), hats on offbeats, a bit of noise. */
function clicks(bpm, offset, seconds = 30, sr = 22050) {
  const x = new Float32Array(sr * seconds); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < x.length; i++) x[i] = rnd() * 0.01;
  const beat = 60 / bpm;
  for (let k = 0; offset + k * beat < seconds - 0.2; k++) {
    const t0 = Math.round((offset + k * beat) * sr), amp = k % 4 === 0 ? 1 : 0.6;
    for (let i = 0; i < sr * 0.08; i++) x[t0 + i] += amp * Math.sin(2 * Math.PI * 60 * i / sr) * Math.exp(-i / (sr * 0.03));
    const h = Math.round((offset + (k + 0.5) * beat) * sr); for (let i = 0; i < sr * 0.02; i++) x[h + i] += 0.15 * rnd() * Math.exp(-i / (sr * 0.005));
  }
  return { x, sr };
}

for (const [bpm, offset] of [[128, 0.31], [92, 0.05], [174, 0.6], [140, 1.1]]) {
  test(`tempo ${bpm} bpm, first downbeat ${offset}s`, () => {
    const { x, sr } = clicks(bpm, offset); const d = detectTempo(x, sr);
    assert.ok(Math.abs(d.bpm - bpm) < 0.6, `bpm ${d.bpm}`);
    const bar = 4 * 60 / bpm; const err = Math.abs(((d.offset - offset) % bar + bar * 1.5) % bar - bar / 2);
    assert.ok(err < 0.03, `offset ${d.offset} vs ${offset}`);
  });
}

test('grid: next sixteenth, bar/step, bar start', () => {
  const g = { bpm: 120, offset: 0.1 }; // a 16th = 0.125 s
  assert.equal(nextGrid(0.1, g, 0.25), 0.1); assert.ok(Math.abs(nextGrid(0.11, g, 0.25) - 0.225) < 1e-9);
  assert.deepEqual(barStep(0.1 + 2 + 0.125 * 3, g), { bar: 1, step: 3 });
  assert.equal(barStart(2, g), 4.1);
});

import { encodeWav, joinChunks } from '../src/unasm/wav.js';
test('wav: header, length, clipping', () => {
  const L = Float32Array.from([0, 0.5, -1, 2]), R = Float32Array.from([0, -0.5, 1, -2]);
  const w = encodeWav([L, R], 48000); const v = new DataView(w.buffer);
  assert.equal(new TextDecoder().decode(w.slice(0, 4)), 'RIFF'); assert.equal(v.getUint32(24, true), 48000); assert.equal(v.getUint16(22, true), 2);
  assert.equal(w.length, 44 + 4 * 2 * 2); assert.equal(v.getInt16(44 + 3 * 4, true), 32767); assert.equal(v.getInt16(44 + 3 * 4 + 2, true), -32768);
  const j = joinChunks([[Float32Array.from([1, 2]), Float32Array.from([3, 4])], [Float32Array.from([5])]]); assert.deepEqual([...j[0]], [1, 2, 5]); assert.deepEqual([...j[1]], [3, 4, 5]);
});
