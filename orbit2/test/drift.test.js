// RD-11 drift (behind ?drift): the resolver's drift page (hold − owns the row and the cells, Nils §Q1: one page,
// momentary only), the LED table and the touched-knob meter (driftLeds / driftMeter, one source for the Move's lights
// and the on-screen cells), and the flag-off identity: without `drift` the resolver answers exactly as before, and
// app.js keeps the untouched "− toggles evolve on press" line for the unflagged mapping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePage, cellAction, driftLeds, driftMeter, DRIFT_KEYS, STEP_BTNS } from '../src/poly/pages.js';

test('RD-11 the drift page: − held owns the row and the cells, over every other hand', () => {
  const want = { row: 'drift', step: -1, cells: 'drift', move: 'drift', knob8: 'drift', row8: 'drift', own: true, chip: 'MOVE ⇢ DRIFT', word: 'drift · held on Move' };
  assert.deepEqual(resolvePage({ drift: true }), want);
  // a held step, Shift, a touch, Loop, a latched page: − still wins while it is down (one page, no sub-pages)
  for (const s of [{ held: { step: 6, looked: true } }, { shift: true }, { touch: true }, { loop: true }, { latch: 'sound' }, { latch: 'step', latchStep: 3 }])
    assert.deepEqual(resolvePage({ ...s, drift: true }), want, JSON.stringify(s));
});

test('RD-11 flag-off identity: without drift the resolver answers byte-for-byte as before, and never the drift page', () => {
  const states = [
    {}, { latch: 'sound' }, { shift: true }, { kbdShift: true }, { touch: true }, { loop: true },
    { latch: 'sound', held: { step: 6, looked: false } }, { latch: 'sound', held: { step: 6, looked: true } },
    { latch: 'sound', held: { step: 6, looked: true }, shift: true }, { latch: 'step', latchStep: 3, back: 'sound' },
    { loop: true, shift: true }, { touch: true, shift: true },
  ];
  for (const s of states) {
    const a = resolvePage(s), b = resolvePage({ ...s, drift: false });
    assert.deepEqual(a, b, JSON.stringify(s));
    assert.notEqual(a.row, 'drift'); assert.notEqual(a.cells, 'drift');
  }
});

test('RD-11 the LED table (Nils §Q1): lanes 1–6, nothing on 7–8, the countdown on 9–16', () => {
  // Noor's A10 scenario: 4 lanes, lanes 1, 2 and 4 evolving, nothing touched, just mutated (progress 0)
  const leds = driftLeds({ evolves: [true, true, false, true] });
  assert.deepEqual(leds.slice(0, 8), ['lane', 'lane', 'dim', 'lane', 'off', 'off', 'off', 'off']);
  assert.deepEqual(leds.slice(8), Array(8).fill('count'));   // full: 8 of 8 to the next mutation
  assert.equal(leds.length, STEP_BTNS);
  // six lanes fill all six LEDs
  assert.deepEqual(driftLeds({ evolves: [false, false, false, false, true, true] }).slice(0, 6), ['dim', 'dim', 'dim', 'dim', 'lane', 'lane']);
});

test('RD-11 the countdown drains one LED per ⅛ of "every"', () => {
  const lit = (progress) => driftLeds({ evolves: [], progress }).filter(s => s === 'count').length;
  assert.equal(lit(0), 8); assert.equal(lit(0.124), 8); assert.equal(lit(0.125), 7); assert.equal(lit(0.5), 4);
  assert.equal(lit(0.874), 2); assert.equal(lit(0.875), 1); assert.equal(lit(0.999), 1); assert.equal(lit(1), 1);
  assert.equal(lit(-1), 8);   // a frac the ear has not reached yet never over-fills
});

test('RD-11 the touched-knob meter: counts light one LED each, percentages in 16ths, all 16 LEDs are the meter', () => {
  assert.equal(driftMeter('evoEvery', 8), 8);       // every = 8 bars lights 8 LEDs (Nils)
  assert.equal(driftMeter('evoEvery', 32), 16);     // clamped to the 16 LEDs there are
  assert.equal(driftMeter('evoAmount', 50), 8);     // amount ≈ half → 8 (the A10 read)
  assert.equal(driftMeter('evoGravity', 100), 16);
  assert.equal(driftMeter('evoHome', 0), 0);        // "never" shows dark
  assert.equal(driftMeter('evoHome', 16), 16);
  assert.equal(driftMeter('evoMax', 64), 16);       // max cycle in 16ths of its 64 bars
  assert.equal(driftMeter('evoMax', 16), 4);
  assert.equal(driftMeter('coupleLift', 50), 8);
  assert.equal(driftMeter('humanize', 25), 4);
  assert.equal(driftMeter('diceRepeat', 1), 1); assert.equal(driftMeter('diceRepeat', 16), 16);
  assert.equal(DRIFT_KEYS.length, 8);
  // the meter replaces the whole table while the finger is on the knob
  const leds = driftLeds({ evolves: [true, true], meter: 1, value: 50, progress: 0.5 });
  assert.deepEqual(leds, [...Array(8).fill('meter'), ...Array(8).fill('off')]);
});

test('RD-11 the drift cells are read-only: a click (or a long press) edits nothing', () => {
  assert.equal(cellAction('drift', 0, 16), 'none');
  assert.equal(cellAction('drift', 3, 16, true), 'none');
  assert.equal(cellAction('drift', 12, 16), 'none');
});

test('RD-11 flag-off identity in app.js: the unflagged − still toggles evolve on press, and every drift branch is gated', () => {
  const src = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  // the RD-10 mapping line survives byte-for-byte (− = evolve on press, without the flag)
  assert.match(src, /if \(name === 'minus'\) \{ setEvolve\(!evo\.on\); return; \}/);
  // the drift branch of − runs only with the flag, and the one holder of minusHand.held sits inside it
  assert.match(src, /name === 'minus' && DRIFT/);
  assert.match(src, /const driftHeld = \(\) => DRIFT && minusHand\.held/);
  // the flag comes from the URL, like ?setlog
  assert.match(src, /const DRIFT = new URLSearchParams\(location\.search\)\.has\('drift'\)/);
});
