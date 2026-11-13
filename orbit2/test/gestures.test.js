// ORBIT2-14 playing on the canvas (I1): the scene's pure geometry (angle → step, radius → lane, turns, pulls, pinches),
// the tap rule on a step (off → on → accent → off) and a gesture as one undo step of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lane, MAX_STEPS } from '../src/poly/lanes.js';
import { History } from '../src/poly/history.js';
import { ringGeo, ringAngle, stepAtAngle, laneAtRadius, angleDelta, turnRotation, pullLength, pinchLength, dragKind } from '../src/poly/scene.js';

const TAU = Math.PI * 2;
/** (dx, dy) of visible step i of a len-step ring at radius r: step 0 at 12 o'clock, clockwise (as the scene draws). */
const at = (i, len, r = 100) => { const a = (i / len) * TAU - Math.PI / 2; return [Math.cos(a) * r, Math.sin(a) * r]; };

test('I1 angle → step: 12 o\'clock is step 0, clockwise, nearest tick, every length 1..32', () => {
  assert.equal(ringAngle(0, -1), 0); assert.ok(Math.abs(ringAngle(1, 0) - Math.PI / 2) < 1e-12, '3 o\'clock = a quarter turn');
  assert.ok(Math.abs(ringAngle(-1, 0) - 1.5 * Math.PI) < 1e-12, '9 o\'clock = three quarters (never negative)');
  for (let len = 1; len <= MAX_STEPS; len++) for (let i = 0; i < len; i++) {
    assert.equal(stepAtAngle(...at(i, len), len), i, `on the tick: ${i} of ${len}`);
    const half = TAU / len / 2 * 0.98;   // just inside half a step either side still picks the same tick
    for (const s of [-1, 1]) { const a = (i / len) * TAU - Math.PI / 2 + s * half; assert.equal(stepAtAngle(Math.cos(a), Math.sin(a), len), i, `near ${i} of ${len}`); }
  }
  assert.equal(stepAtAngle(...at(15.6, 16), 16), 0, 'just before 12 o\'clock wraps to step 0, not 16');
});

test('I1 radius → lane: each ring owns half a gap either side; off the rings is -1 (4 and 6 lanes, a stage)', () => {
  for (const [lanes, stage] of [[4, null], [6, null], [4, { x: 300, y: 80, w: 700, h: 600 }], [6, { x: 0, y: 0, w: 390, h: 390 }]]) {
    const g = ringGeo(1440, 900, stage, lanes), band = (g.gap * g.R) / 2;
    for (let li = 0; li < lanes; li++) {
      assert.equal(laneAtRadius(g, g.ring(li)), li, `on ring ${li}`);
      assert.equal(laneAtRadius(g, g.ring(li) + band * 0.95), li); assert.equal(laneAtRadius(g, g.ring(li) - band * 0.95), li);
    }
    assert.equal(laneAtRadius(g, g.ring(0) - band * 1.05), -1, 'inside the first ring: the core, no lane');
    assert.equal(laneAtRadius(g, g.ring(lanes - 1) + band * 1.05), -1, 'beyond the outer ring: no lane');
    assert.equal(laneAtRadius(g, 0), -1);
  }
});

test('I1 a drag along a ring turns it by whole steps, across 12 o\'clock and past a full turn', () => {
  assert.ok(Math.abs(angleDelta(TAU - 0.1, 0.1) - 0.2) < 1e-12, 'clockwise across 12 o\'clock is a small turn, not −2π');
  assert.ok(Math.abs(angleDelta(0.1, TAU - 0.1) + 0.2) < 1e-12);
  const len = 8, st = TAU / len;
  assert.equal(turnRotation(0, st, len), 1, 'a step clockwise = rotation + 1 (the pattern follows the finger)');
  assert.equal(turnRotation(0, -st, len), 7, 'a step back wraps');
  assert.equal(turnRotation(3, st * 0.4, len), 3, 'less than half a step: no move (snaps)');
  assert.equal(turnRotation(3, st * 0.6, len), 4);
  assert.equal(turnRotation(2, TAU + 2 * st, len), 4, 'a whole turn and two steps');
  // a drag summed from small moves (as the app does) lands where the finger is
  let a = ringAngle(...at(0, len)), turn = 0; for (let k = 1; k <= 30; k++) { const b = ringAngle(...at(k * 0.1, len)); turn += angleDelta(a, b); a = b; }
  assert.equal(turnRotation(0, turn, len), 3, '3 steps clockwise');
  // the rotation moves the hits under the finger: the planet dragged from step 0 to step 3 is drawn at visible step 3
  const l = new Lane('kick', { length: len }); l.hits[0] = true; l.rotation = turnRotation(0, turn, len); assert.ok(l.hitAt(3) && !l.hitAt(0));
});

test('I1 a pull across a ring and a pinch set its length, 1..32', () => {
  assert.equal(pullLength(8, 0, 20), 8); assert.equal(pullLength(8, 41, 20), 10, 'outward = longer, a step every 20 px (nearest)');
  assert.equal(pullLength(8, -60, 20), 5, 'inward = shorter'); assert.equal(pullLength(8, -1000, 20), 1); assert.equal(pullLength(8, 1000, 20), MAX_STEPS);
  assert.equal(pullLength(8, 3, 0), 11, 'a zero step size counts 1 px a step (never divides by 0)');
  assert.equal(pinchLength(8, 1), 8); assert.equal(pinchLength(8, 1.5), 12); assert.equal(pinchLength(8, 0.5), 4);
  assert.equal(pinchLength(8, 10), MAX_STEPS); assert.equal(pinchLength(8, 0.01), 1); assert.equal(pinchLength(8, 0), 8, 'a broken scale changes nothing');
  // which way: along the ring turns, across it pulls (at 12 o'clock, along = sideways; at 3 o'clock, along = up / down)
  assert.equal(dragKind(0, -100, 10, 2), 'turn'); assert.equal(dragKind(0, -100, 2, -10), 'pull');
  assert.equal(dragKind(100, 0, 1, 10), 'turn'); assert.equal(dragKind(100, 0, 10, 1), 'pull');
});

test('I1 a tap on a step: off → on → accent → off; a ghost goes off; other locks stay', () => {
  const l = new Lane('snare', { length: 8 });
  assert.deepEqual([1, 2, 3, 4].map(() => l.tapStep(2)), ['on', 'accent', 'off', 'on']);
  assert.ok(l.hits[2] && !l.accents[2], 'a full cycle: a plain hit again');
  l.setTier(5, 'ghost'); l.setLock(5, 'tune', 0.2); assert.equal(l.tierAt(5), 'ghost');
  assert.equal(l.tapStep(5), 'off'); assert.equal(l.locks[5].tune, 0.2, 'the tune lock stays with the step');
  assert.equal(l.tapStep(5), 'on', 'back on: a plain hit, not the old ghost'); assert.equal(l.tierAt(5), 'normal');
  assert.equal(l.tapStep(9), 'off', 'outside the loop: nothing');
});

test('I1 a gesture is one undo step of its own: never folded into the edit before it or after it', () => {
  const h = new History({ coalesceMs: 700 }); h.commit('a', { now: 0 });
  h.commit('b', { now: 1000 }); h.commit('c', { now: 1100 });   // a knob turn: b and c fold
  assert.equal(h.past.length, 1);
  h.commit('d', { now: 1200, own: true }); assert.equal(h.past.length, 2, 'the tap right after the knob turn is its own step');
  h.commit('e', { now: 1300 }); assert.equal(h.past.length, 3, 'and the knob turn right after the tap too');
  h.commit('f', { now: 1350, own: true }); h.commit('g', { now: 1360, own: true }); assert.equal(h.past.length, 5, 'two quick taps = two steps');
  assert.equal(h.undo().json, 'f'); assert.equal(h.undo().json, 'e'); assert.equal(h.undo().json, 'd');
  h.commit('d', { now: 2000, key: 'd', own: true }); assert.equal(h.past.length, 2, 'same key (only a selection moved): no step, even for a gesture');
});
