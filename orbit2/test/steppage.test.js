// RD-6 the step page: Nils's state table (docs/redesign/proposals/nils/answers.md §Q2) row by row with every column the
// resolver answers (row, knobs 1–7 / 8 of the Move, the row's knob 8, cells, chip, header word), every decided edge case,
// the loop dots (stepLoops), what a click on a cell or a planet does (cellAction / planetAction), and the static half:
// one lock editor (no radial menu), the step page's words, knob 8's condition / repeats gauges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePage, stepLoops, cellAction, planetAction, LOOK_MS, STEP_BTNS } from '../src/poly/pages.js';
import { condPasses } from '../src/poly/lanes.js';

const COLS = ['row', 'step', 'move', 'knob8', 'row8', 'cells', 'own', 'chip', 'word'];
const pick = (r) => Object.fromEntries(COLS.map(k => [k, r[k]]));
const S = { latch: 'sound' }, held7 = (looked) => ({ step: 6, looked });
const row = (row, step, move, knob8, row8, cells, own, chip, word) => ({ row, step, move, knob8, row8, cells, own, chip, word });

test('RD-6 Nils\'s table T0–T4, every column (Noor\'s sequence: SOUND latched → hold step 7 → Shift → let go of 7 → let go of Shift)', () => {
  const T = {
    T0: [S, row('sound', -1, 'rhythm', 'tempo', 'level', 'steps', false, 'MOVE ⇢ RHYTHM', 'sound')],
    "T0′": [{ ...S, touch: true }, row('rhythm', -1, 'rhythm', 'tempo', 'tempo', 'steps', true, 'MOVE ⇢ RHYTHM', 'rhythm')],
    T1a: [{ ...S, held: held7(false) }, row('sound', -1, 'step', 'condition', 'level', 'steps', false, 'MOVE ⇢ RHYTHM', 'sound')],
    T1b: [{ ...S, held: held7(true) }, row('step', 6, 'step', 'condition', 'condition', 'loops', true, 'MOVE ⇢ STEP 7', 'step 7 · held on Move')],
    T2: [{ ...S, held: held7(true), shift: true }, row('step', 6, 'step', 'repeats', 'repeats', 'loops', true, 'MOVE ⇢ STEP 7 ⇧', 'step 7 · held on Move ⇧')],
    T3: [{ ...S, shift: true }, row('sound', -1, 'sound', 'level', 'level', 'steps', true, 'MOVE ⇢ SOUND ⇧', 'sound ⇧')],
    T4: [S, row('sound', -1, 'rhythm', 'tempo', 'level', 'steps', false, 'MOVE ⇢ RHYTHM', 'sound')],
  };
  for (const [t, [hands, want]] of Object.entries(T)) assert.deepEqual(pick(resolvePage(hands)), want, t);
  // T1a → T1b: the same hands, only time (LOOK_MS) or a knob turn makes it a look; a touch on a knob is a turn coming
  assert.equal(LOOK_MS, 450);
  assert.equal(resolvePage({ ...S, held: held7(false), touch: true }).row, 'step', 'a knob touched on a held step: the page at once');
  // T2: only slot 8 repaints (the row stays the step page, the same step, the same 7 locks)
  const b = resolvePage(T.T1b[0]), c = resolvePage(T.T2[0]);
  assert.deepEqual([b.row, b.step, b.move], [c.row, c.step, c.move]); assert.notEqual(b.row8, c.row8);
});

test('RD-6 the edge cases Nils decided', () => {
  // Shift let go first (T2 → step still held): knob 8 goes back to the condition, slot 8 repaints, nothing else changes
  const t2 = resolvePage({ ...S, held: held7(true), shift: true }), back = resolvePage({ ...S, held: held7(true) });
  assert.deepEqual({ ...pick(t2), knob8: 'condition', row8: 'condition', chip: 'MOVE ⇢ STEP 7', word: 'step 7 · held on Move' }, pick(back));
  // a quick tap (step down, Shift, both up inside LOOK_MS, no turn): the row never leaves the latch, on either latch
  for (const latch of ['rhythm', 'sound']) for (const shift of [false, true]) {
    const r = resolvePage({ latch, held: held7(false), shift });
    assert.deepEqual([r.row, r.cells], [latch, 'steps'], `${latch}${shift ? ' + Shift' : ''}`);
  }
  // a page tab clicked while a Move hold owns the row changes the latch (where you come back), not what is drawn
  for (const latch of ['rhythm', 'sound']) assert.equal(resolvePage({ latch, held: held7(true) }).row, 'step');
  assert.equal(resolvePage({ latch: 'rhythm' }).row, 'rhythm');
  // a mouse step page (long-press cell 3) under a Move hold on step 7: the Move wins while held, then step 3; Esc closes it
  const m3 = { latch: 'step', latchStep: 2, back: 'sound' };
  assert.deepEqual(pick(resolvePage(m3)), row('step', 2, 'rhythm', 'tempo', 'condition', 'loops', false, 'MOVE ⇢ RHYTHM', 'step 3'));
  assert.deepEqual([resolvePage({ ...m3, held: held7(true) }).step, resolvePage({ ...m3, held: held7(true) }).own], [6, true]);
  assert.equal(resolvePage({ ...m3, held: held7(false) }).step, 2, 'a held step not yet looked at leaves the mouse page alone');
  assert.equal(resolvePage({ ...m3, latchStep: -1 }).row, 'sound', 'closed: back to where it came from');
  // a touch while the mouse holds a step page: the Move's page for the touch (its knobs edit rhythm), then step 3
  assert.equal(resolvePage({ ...m3, touch: true }).row, 'rhythm'); assert.equal(resolvePage({ ...m3, shift: true, touch: true }).row, 'sound');
  // hold Loop: the cells are the slots, the knobs keep their latched or Move meaning (Loop + knobs is dropped)
  for (const h of [S, { ...S, held: held7(true) }, { ...S, shift: true }, m3]) {
    const r = resolvePage({ ...h, loop: true }), w = resolvePage(h);
    assert.deepEqual({ ...pick(r), cells: w.cells }, pick(w)); assert.equal(r.cells, 'slots');
  }
  // ⇧ on the keyboard: the sound page on screen, the Move's knobs unchanged; never over a mouse step page
  assert.deepEqual([resolvePage({ latch: 'rhythm', kbdShift: true }).row, resolvePage({ latch: 'rhythm', kbdShift: true }).own], ['sound', false]);
  assert.equal(resolvePage({ ...m3, kbdShift: true }).row, 'step');
});

test('RD-6 the loop dots: the Move\'s P7 loops of a step, the playing loop ringed (stepLoops)', () => {
  const s = (c, o) => stepLoops({ cond: c, on: true, ...o }).loops.map(v => v === null ? '?' : v ? 'x' : '.').join('');
  assert.equal(s('always'), 'x'.repeat(16)); assert.equal(s('1:2'), 'x.'.repeat(8)); assert.equal(s('2:4'), '.x..'.repeat(4));
  assert.equal(s('first'), 'x' + '.'.repeat(15)); assert.equal(s('fill'), '?'.repeat(16));
  assert.deepEqual(stepLoops({ on: false }).loops, Array(16).fill(false), 'a step that never plays: no loop lit');
  const stopped = stepLoops({ cond: '1:3', on: true, loopN: 9, playing: false });
  assert.deepEqual([stopped.from, stopped.now], [0, -1], 'stopped: loops 1–16, no ring');
  for (const n of [0, 5, 15, 16, 21, 40]) {
    const r = stepLoops({ cond: '2:3', on: true, loopN: n, playing: true });
    assert.equal(r.from + r.now, n, `loop ${n + 1} is ringed`); assert.ok(r.now >= 0 && r.now < STEP_BTNS);
    r.loops.forEach((v, k) => assert.equal(v, condPasses('2:3', r.from + k)));
  }
});

test('RD-6 a click on a cell or a planet: never an edit on a dot, the mouse never stuck on one step', () => {
  // steps: a tap cycles, a long-press / right-click / Alt+click opens the step page
  assert.equal(cellAction('steps', 3, 16), 'cycle'); assert.equal(cellAction('steps', 3, 16, true), 'open');
  // loop dots (a step page): any click opens that cell's step page (switches the step), never edits
  assert.equal(cellAction('loops', 3, 16), 'open'); assert.equal(cellAction('loops', 3, 16, true), 'open');
  // past the loop, or a slot while Loop is held: nothing
  assert.equal(cellAction('loops', 9, 8), 'none'); assert.equal(cellAction('steps', 9, 8, true), 'none');
  assert.equal(cellAction('slots', 3, 16), 'none'); assert.equal(cellAction('slots', 3, 16, true), 'none');
  // a planet: tapped it cycles (I1); with a step page latched it switches the page; held / right-clicked it opens it
  assert.equal(planetAction(false), 'cycle'); assert.equal(planetAction(true), 'open'); assert.equal(planetAction(false, true), 'open');
});

test('RD-6 static: one lock editor on the console (no radial menu), its words and knob 8, the old panel as "more…"', () => {
  const app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8'), html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(app + html + css, /ring-menu|openRingMenu|RING_ITEMS/, 'the radial menu is gone');
  for (const f of ['openStep', 'editLocks', 'planetStep']) assert.doesNotMatch(/function \w+\([^)]*\) \{[^\n]*/.exec(app.slice(app.indexOf(`function ${f}(`)))[0], /reveal\(|setSheet\(/, `${f} never opens the sheet`);
  assert.match(app, /\$\('st-more'\)\.onclick = \(\) => \{ if \(lockStep >= 0\) reveal\('lockpanel'\)/, '"more…" opens the rest in the sheet');
  for (const id of ['st-clear', 'st-more', 'st-done']) assert.match(html, new RegExp(`<button type="button" id="${id}" class="aword"`), id);
  assert.match(html, /<span id="step-tools" class="step-tools" role="group" aria-label="step page" hidden>/);
  assert.doesNotMatch(html, /id="lock-close"|id="lock-clear"/, 'the panel\'s own close and clear went to the page');
  // knob 8: the condition in the Move's order (CONDS, as hold step + knob 8), the repeats with Shift
  assert.match(app, /sliders\['lock:cond'\] = makeGauge\(\{ label: 'condition', min: 0, max: CONDS\.length - 1/);
  assert.match(app, /sliders\['lock:ratchet'\] = makeGauge\(\{ label: 'repeats', min: 1, max: MAX_RATCHET/);
  assert.match(app, /sliders\[r8 === 'repeats' \? 'lock:ratchet' : 'lock:cond'\]/);
  // the rings: a page reads by its shape (arc / pie / ring); solid where locked, dashed where the step follows the lane
  assert.match(app, /pg === 'sound' \? 'pie' : pg === 'step' \? 'ring' : 'arc'/);
  assert.match(css, /\.gauge\.ring \.g-track \{ stroke: var\(--gk\);[^}]*\} \.gauge\.ring\.follows \.g-track \{ stroke-dasharray/);
  // the Move's LEDs and the cells draw the loops from one function
  assert.equal(app.match(/stepLoops\(/g).length, 2);
});
