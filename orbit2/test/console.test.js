// RD-5 the console's page model: Nils's state table (docs/redesign/proposals/nils/answers.md §Q2) as rows of a pure
// resolver (src/poly/pages.js resolvePage). Noor's sequence: SOUND latched with the mouse → hold step 7 → Shift → let go
// of step 7 → let go of Shift; plus T0′ (an encoder touch) and the decided edge cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePage, TOUCH_HOLD_MS, LOOK_MS } from '../src/poly/pages.js';

const pick = (r, ...k) => Object.fromEntries(k.map(x => [x, r[x]]));
const S = { latch: 'sound' };   // the mouse latched SOUND
const step7 = (looked) => ({ step: 6, looked });

test('RD-5 T0: SOUND latched, nothing held: the row draws sound, the Move\'s knobs still edit rhythm, the chip says so in grey', () => {
  const r = resolvePage(S);
  assert.deepEqual(pick(r, 'row', 'move', 'knob8', 'own', 'chip', 'cells', 'word'), { row: 'sound', move: 'rhythm', knob8: 'tempo', own: false, chip: 'MOVE ⇢ RHYTHM', cells: 'steps', word: 'sound' });
  // latched rhythm: the Move's knobs edit what is drawn, so the chip is white
  assert.deepEqual(pick(resolvePage({ latch: 'rhythm' }), 'row', 'own', 'chip'), { row: 'rhythm', own: true, chip: 'MOVE ⇢ RHYTHM' });
});

test('RD-5 T0′: an encoder touch flips the row to the Move\'s page (white chip) for the touch and TOUCH_HOLD_MS after it', () => {
  assert.equal(TOUCH_HOLD_MS, 400);
  const r = resolvePage({ ...S, touch: true });
  assert.deepEqual(pick(r, 'row', 'move', 'own', 'chip', 'word'), { row: 'rhythm', move: 'rhythm', own: true, chip: 'MOVE ⇢ RHYTHM', word: 'rhythm' });
  assert.equal(resolvePage({ latch: 'rhythm', shift: true, touch: true }).row, 'sound', 'Shift + a touch: the sound page');
  assert.equal(resolvePage({ ...S, touch: false }).row, 'sound', 'after the hold the row is the latch again');
});

test('RD-5 T1a / T1b / T2: a held step owns the row only once it is looked at (LOOK_MS or a knob); Shift then repaints knob 8 only', () => {
  assert.equal(LOOK_MS, 450);
  const a = resolvePage({ ...S, held: step7(false) });   // < 450 ms, no turn: it may be a tap
  assert.deepEqual(pick(a, 'row', 'move', 'knob8', 'own', 'chip', 'cells'), { row: 'sound', move: 'step', knob8: 'condition', own: false, chip: 'MOVE ⇢ RHYTHM', cells: 'steps' });
  const b = resolvePage({ ...S, held: step7(true) });
  assert.deepEqual(pick(b, 'row', 'step', 'move', 'knob8', 'own', 'chip', 'cells', 'word'), { row: 'step', step: 6, move: 'step', knob8: 'condition', own: true, chip: 'MOVE ⇢ STEP 7', cells: 'loops', word: 'step 7 · held on Move' });
  const c = resolvePage({ ...S, held: step7(true), shift: true });
  assert.deepEqual(pick(c, 'row', 'step', 'knob8', 'chip', 'word'), { row: 'step', step: 6, knob8: 'repeats', chip: 'MOVE ⇢ STEP 7 ⇧', word: 'step 7 · held on Move ⇧' });
  // Shift let go first (T2 → the step still held): knob 8 goes back to condition, nothing else changes
  assert.deepEqual(pick(resolvePage({ ...S, held: step7(true) }), 'row', 'knob8', 'chip'), { row: 'step', knob8: 'condition', chip: 'MOVE ⇢ STEP 7' });
  // a touch on a knob while the step is held is a lock edit: the step page at once
  assert.equal(resolvePage({ ...S, held: step7(false), touch: true }).row, 'step');
});

test('RD-5 T3: the step let go with Shift held: the sound page (the same as the latch, so only the header and the chip change)', () => {
  const r = resolvePage({ ...S, shift: true });
  assert.deepEqual(pick(r, 'row', 'move', 'knob8', 'own', 'chip', 'cells', 'word'), { row: 'sound', move: 'sound', knob8: 'level', own: true, chip: 'MOVE ⇢ SOUND ⇧', cells: 'steps', word: 'sound ⇧' });
  assert.equal(resolvePage({ latch: 'rhythm', shift: true }).row, 'sound', 'Shift shows sound over a rhythm latch too');
});

test('RD-5 T4: Shift let go: back to T0 (the latch, never rhythm)', () => {
  assert.deepEqual(resolvePage(S), resolvePage({ ...S, shift: false, held: null, touch: false }));
  assert.equal(resolvePage(S).row, 'sound');
});

test('RD-5 edge cases: a quick tap never flashes a page; the mouse changes the latch under a hold; a mouse step page comes back; Loop', () => {
  // step down, Shift, both up inside LOOK_MS with no turn: the row never leaves the latch (rhythm here: no sound flash)
  for (const latch of ['rhythm', 'sound']) assert.equal(resolvePage({ latch, held: step7(false), shift: true }).row, latch);
  // a tab clicked while a Move hold owns the row changes what you come back to, not what is drawn
  assert.equal(resolvePage({ latch: 'rhythm', held: step7(true) }).row, 'step');
  assert.equal(resolvePage({ latch: 'rhythm' }).row, 'rhythm');
  // a mouse step page (cell 3) under a Move hold on step 7: the Move wins while held, then step 3 again
  const m3 = { latch: 'step', latchStep: 2, back: 'sound' };
  assert.deepEqual(pick(resolvePage({ ...m3, held: step7(true) }), 'row', 'step'), { row: 'step', step: 6 });
  assert.deepEqual(pick(resolvePage(m3), 'row', 'step', 'word', 'own'), { row: 'step', step: 2, word: 'step 3', own: false });
  assert.equal(resolvePage({ ...m3, latchStep: -1 }).row, 'sound', 'closed (Esc), the step latch falls back to where it came from');
  // hold Loop: the cells show the slots, the knobs keep their meaning
  assert.deepEqual(pick(resolvePage({ ...S, loop: true }), 'row', 'cells', 'move'), { row: 'sound', cells: 'slots', move: 'rhythm' });
  // ⇧ on the keyboard: the sound page on screen; the Move's knobs unchanged (the chip grey)
  assert.deepEqual(pick(resolvePage({ latch: 'rhythm', kbdShift: true }), 'row', 'move', 'own'), { row: 'sound', move: 'rhythm', own: false });
});

test('RD-5 the console: the rhythm page is the Move\'s knob row in order (app.js RHYTHM_KEYS = the encoder handler\'s, 8 = tempo)', () => {
  const app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  assert.match(app, /const RHYTHM_KEYS = \['length', 'euclid', 'rotation', 'ratio', 'swing', 'prob', 'tune'\]/);
  assert.match(app, /if \(index === 7\) handTempo\(tempo \+ delta\); else nudge\(RHYTHM_KEYS\[index\]/, 'the Move\'s knobs 1–7 are the same keys');
  assert.match(app, /pg === 'sound' \? SOUND_KEYS\.map/, 'the sound page is Shift + knobs (SOUND_KEYS)');
});
