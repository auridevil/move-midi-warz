// ORBIT2-13 seeing the structure (V6): Machine.tick reports the steps that stayed silent and why (`miss`), liveTick keeps
// an early-decided step's reason, and the scene's pure helpers (planet opacity, a:b arcs, position in the cycle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine, PPQ, CONDS, condParts, condPasses } from '../src/poly/lanes.js';
import { Dice } from '../src/poly/dice.js';
import { liveTick } from '../src/poly/export.js';
import { planetAlpha, condArcs, cyclePos, MISS_MS } from '../src/poly/scene.js';

/** One lane with hits only on step 0 and 2, every other lane silent. */
function oneLane() {
  const m = new Machine(); m.humanize = 0;
  m.lanes.forEach((l, li) => { l.hits.fill(false); l.velHuman = 0; if (!li) { l.length = 4; l.hits[0] = l.hits[2] = true; } });
  return m;
}
const steps = (m, n, rng, ctx) => { const st = m.lanes[0].stepTicks(), out = []; for (let s = 0; s < n; s++) out.push(m.tick(s * st, rng, ctx)[0]); return out; };

test('V6 Machine.tick reports missed steps with the reason; hits, mutes, solo and empty steps report none', () => {
  let m = oneLane(); let ev = steps(m, 4, () => 0.5);
  assert.deepEqual(ev.map(e => [e.hit, e.miss]), [[true, null], [false, null], [true, null], [false, null]], 'plain hits: nothing missed, an empty step is not a miss');

  m = oneLane(); m.lanes[0].prob = 0.4; ev = steps(m, 4, () => 0.5);
  assert.deepEqual(ev.map(e => e.miss), ['prob', null, 'prob', null], 'the roll said no: prob');
  m = oneLane(); m.lanes[0].prob = 0.4; m.lanes[0].setLock(2, 'prob', 0.9); ev = steps(m, 4, () => 0.5);
  assert.deepEqual(ev.map(e => [e.hit, e.miss]), [[false, 'prob'], [false, null], [true, null], [false, null]], 'a prob lock wins over the lane');

  const dice = new Dice(); dice.locked = true; m = oneLane(); m.lanes[0].prob = 0; ev = steps(m, 4, Math.random, { dice });
  assert.deepEqual(ev.map(e => e.miss), ['dice', null, 'dice', null], 'locked dice: dice');

  m = oneLane(); m.lanes[0].setTrig(2, { cond: '2:2' }); ev = steps(m, 8, () => 0.5);
  assert.deepEqual(ev.map(e => e.miss), [null, null, 'cond', null, null, null, null, null], '2:2 is silent on loop 1 (a condition), plays on loop 2');
  assert.deepEqual(ev.map(e => e.loop), [0, 0, 0, 0, 1, 1, 1, 1], 'the event carries its loop (the scene lights that arc)');
  assert.ok(ev[6].hit);

  m = oneLane(); m.lanes[0].prob = 0; m.lanes[0].muted = true; ev = steps(m, 4, () => 0.5);
  assert.ok(ev.every(e => !e.hit && e.miss === null), 'a muted lane is silent by choice: no ring');
  m = oneLane(); m.lanes[0].prob = 0; m.lanes[1].solo = true; ev = steps(m, 4, () => 0.5);
  assert.ok(ev.every(e => !e.hit && e.miss === null), 'silenced by a solo elsewhere: no ring');
});

test('V6 liveTick: a step decided early keeps its reason at its own tick; the hit path is unchanged', () => {
  const tickSec = 60 / 120 / PPQ, run = (prob, dice = null) => {
    const m = oneLane(), l = m.lanes[0]; l.prob = prob; l.setLock(2, 'nudge', -0.3);   // step 2 starts before its tick: decided early
    const ahead = [], st = l.stepTicks(), out = []; let t = 0;
    // free rolls: "no" while step 2 is decided early, "yes" on its own tick, so a fresh roll there would disagree
    const rng = () => (t === 2 * st ? 0.1 : 0.9);
    for (; t < 4 * st; t++) { const r = liveTick(m, t, ahead, { rng, dice, tickSec })[0]; if (r.ev) out.push({ i: r.ev.index, hit: r.ev.hit, miss: r.ev.miss, n: r.hits.length + r.early.length }); else if (r.early.length) out.push({ early: r.early.length }); }
    return out;
  };
  assert.deepEqual(run(0.5).filter(e => e.i === 2), [{ i: 2, hit: false, miss: 'prob', n: 0 }], 'the early decision (no) stands at its tick, with its reason');
  const dice = new Dice(); dice.locked = true;
  assert.deepEqual(run(0, dice).filter(e => e.i === 2), [{ i: 2, hit: false, miss: 'dice', n: 0 }], 'locked dice: dice');
  const loud = run(1);
  assert.deepEqual(loud.filter(e => e.i === 2), [{ i: 2, hit: true, miss: null, n: 0 }], 'played early: a hit at its tick, nothing missed');
  assert.equal(loud.filter(e => e.early).length, 1, 'its early part was sent once, ahead of the tick');
});

test('V6 r1 liveTick: a step a pad just played is neither doubled nor ringed as missed', () => {
  const tickSec = 60 / 120 / PPQ, m = oneLane(); m.lanes[0].prob = 0;   // left alone, step 0 would be a 'prob' miss
  assert.equal(liveTick(oneLane(), 0, [], { rng: () => 0.5, tickSec })[0].ev.hit, true);
  const free = oneLane(); free.lanes[0].prob = 0;
  assert.equal(liveTick(free, 0, [], { rng: () => 0.5, tickSec })[0].ev.miss, 'prob');
  const pads = new Set(['0:0']), r = liveTick(m, 0, [], { rng: () => 0.5, tickSec, skip: pads })[0];
  assert.deepEqual([r.ev.hit, r.ev.miss, r.hits.length, r.early.length], [false, null, 0, 0], 'the pad played it: no hit, no ring');
  assert.equal(pads.size, 0, 'the pad key is used up at its tick');
});

test('V6 r1 one rule for the chance and the a:b loops: Lane.chanceAt is what Lane.at rolls, the lit arc plays iff condPasses', () => {
  const m = oneLane(), l = m.lanes[0]; l.prob = 0.4; l.setLock(2, 'prob', 0.9); l.rotation = 1;   // visible step 3 = stored step 2
  assert.equal(l.chanceAt(0), 0.4); assert.equal(l.chanceAt(3), 0.9, 'visible positions, through the rotation');
  for (const r of [0.39, 0.41, 0.89, 0.91]) {
    const ev = steps(m, 4, () => r).filter(e => e.index === 1 || e.index === 3);   // the visible hits (stored 0 and 2)
    for (const e of ev) assert.equal(e.hit, r < l.chanceAt(e.index), `roll ${r}, step ${e.index}`);
    l.resetLoops();
  }
  for (const cond of CONDS) {
    const ab = condParts(cond); assert.equal(!!condArcs(cond, 0), !!ab, cond);
    if (!ab) continue;
    for (let loop = 0; loop < 12; loop++) {
      const arcs = condArcs(cond, loop), lit = arcs.findIndex(a => a.here);
      assert.equal(arcs.length, ab.b); assert.equal(lit, loop % ab.b, `${cond} loop ${loop}: one lit arc, the lane's loop`);
      assert.equal(arcs[lit].plays, condPasses(cond, loop), `${cond} loop ${loop}: the lit arc is solid exactly when the step plays`);
      assert.equal(arcs.filter(a => a.plays).length, 1, `${cond}: one arc plays`);
    }
    assert.ok(condArcs(cond, null).every(a => !a.here), `${cond}: stopped, nothing lit`);
  }
  // the cycle reads the same parse: a lane with 1:3 and 2:4 repeats every 12 loops
  const c = oneLane().lanes[0]; c.setTrig(0, { cond: '1:3' }); c.setTrig(2, { cond: '2:4' }); assert.equal(c.loopsPerCycle(), 12);
});

test('V6 scene helpers: planet opacity by chance, a:b parse, position in the cycle', () => {
  assert.equal(planetAlpha(1), 1); assert.equal(planetAlpha(0), 0.2, '0 % stays findable'); assert.ok(Math.abs(planetAlpha(0.5) - 0.6) < 1e-9);
  assert.equal(planetAlpha(2), 1); assert.equal(planetAlpha(undefined), 0.2);
  assert.deepEqual(condParts('1:3'), { a: 1, b: 3 }); assert.deepEqual(condParts('4:4'), { a: 4, b: 4 });
  for (const c of [null, 'always', 'pre', 'not fill', 'first', '1:1']) assert.equal(condParts(c), null, c);
  assert.equal(cyclePos(0, 384), 0); assert.equal(cyclePos(96, 384), 0.25); assert.equal(cyclePos(384 + 192, 384), 0.5); assert.equal(cyclePos(-96, 384), 0.75); assert.equal(cyclePos(5, 0), 0);
  assert.ok(MISS_MS > 0 && MISS_MS < 1000);
});
