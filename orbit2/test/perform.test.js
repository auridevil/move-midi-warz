import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MuteQueue, FillLatch, Guard, HOLD_MS } from '../src/poly/perform.js';

test('P2 mute queue: lanes wait for the bar line, a second press takes one back', () => {
  const q = new MuteQueue();
  assert.equal(q.toggle(2), true); assert.equal(q.toggle(0), true); assert.equal(q.has(2), true); assert.equal(q.size, 2);
  assert.equal(q.toggle(2), false, 'pressed again before the bar: nothing waits'); assert.equal(q.has(2), false);
  q.toggle(5); q.trim(4); assert.equal(q.has(5), false, 'a lane the pattern lost drops out');
  assert.deepEqual(q.bar(), [0], 'the bar line flips what waits'); assert.equal(q.size, 0); assert.deepEqual(q.bar(), [], 'and only once');
});

test('P3 fill latch: armed → the next bar fills → off at the bar after', () => {
  const f = new FillLatch(); assert.equal(f.on, false);
  assert.equal(f.arm(), 'armed'); assert.equal(f.on, false, 'not before the bar line');
  assert.equal(f.bar(), true); assert.equal(f.on, true, 'the whole next bar');
  assert.equal(f.arm(), 'on', 'pressing while it fills changes nothing');
  assert.equal(f.bar(), true); assert.equal(f.on, false); assert.equal(f.bar(), false, 'idle bar lines do nothing');
  f.arm(); assert.equal(f.arm(), 'off', 'again before it starts = cancel'); f.arm(); f.clear(); assert.equal(f.state, 'off');
});

test('P1 guard: Shift acts at once, a hold acts once, a short tap cancels, a quick re-press is a new hold', () => {
  assert.equal(HOLD_MS, 600);
  const g = new Guard();
  assert.equal(g.press('capture', true).now, true); assert.equal(g.release('capture'), null, 'Shift already acted');
  const a = g.press('delete', false); assert.equal(a.now, false); assert.equal(g.held('delete'), true);
  assert.equal(g.fire('delete', a.id), true, 'held to the end: acts'); assert.equal(g.fire('delete', a.id), false, 'once');
  assert.equal(g.release('delete'), null);
  const b = g.press('delete', false); assert.equal(g.release('delete'), 'cancel', 'let go early: nothing');
  assert.equal(g.fire('delete', b.id), false, 'the timer of a released press does nothing');
  const c = g.press('delete', false); g.release('delete'); const d = g.press('delete', false);
  assert.equal(g.fire('delete', c.id), false, 'the first tap\'s timer can\'t fire the second press early');
  assert.equal(g.fire('delete', d.id), true);
});
