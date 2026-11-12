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

test('P4 Lane.at with an origin: step 1 and loop 1 start there, nothing steps before it', async () => {
  const { Lane, PPQ } = await import('../src/poly/lanes.js');
  const l = new Lane('kick', { length: 3 }); l.setEuclid(3); l.trigs[0] = { cond: 'first', ratchet: 1 };
  const o = 7 * PPQ;   // a slot restarted on beat 8: not a multiple of the length
  assert.equal(l.at(o - PPQ, () => 0, { origin: o }), null, 'before the origin nothing steps');
  const ev = [0, 1, 2, 3].map(k => l.at(o + k * PPQ, () => 0, { origin: o }));
  assert.deepEqual(ev.map(e => e.index), [0, 1, 2, 0], 'step 1 on the origin');
  assert.deepEqual(ev.map(e => e.loop), [0, 0, 0, 1]); assert.equal(ev[0].hit, true, '"first" plays on the restart'); assert.equal(ev[3].hit, false, 'and not on loop 2');
  const free = new Lane('kick', { length: 3 }); free.setEuclid(3); free.trigs[0] = { cond: 'first', ratchet: 1 };
  assert.equal(free.at(o, () => 0).index, 1, 'without an origin it counts from tick 0'); assert.equal(free.at(o + 2 * PPQ, () => 0).hit, false, 'and its first loop is long gone');
  const { Machine } = await import('../src/poly/lanes.js'); const m = new Machine(); m.lanes[0].setLength(3); m.lanes[0].setEuclid(3); m.origin = o;
  assert.equal(m.tick(o)[0].index, 0, 'Machine.tick hands the origin to Lane.at'); assert.equal(m.tick(o - PPQ)[0], null);
});

test('P4 slots: a slot due() loads records its start; restart persists (old banks: on); the cycle lines up from the origin', async () => {
  const { SlotBank } = await import('../src/poly/slots.js'); const { BAR_TICKS: B, PPQ } = await import('../src/poly/lanes.js');
  const store = new Map(), st = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const b = new SlotBank(st); assert.equal(b.restart, true); b.save(0, { lanes: [] }); b.save(1, { lanes: [] });
  b.recall(1); assert.equal(b.due(B + PPQ, 1, { at: 0, len: B }), -1, 'bar mode: not mid-bar'); assert.equal(b.due(2 * B, 1, { at: 0, len: B }), 1); assert.equal(b.start, 2 * B);
  b.restart = false; b.persist(); assert.equal(new SlotBank(st).restart, false);
  store.set('midi-warz.orbit2.slots.v1', JSON.stringify({ slots: [null], switchAt: 'bar' })); assert.equal(new SlotBank(st).restart, true, 'an older bank restarts');
  const c = new SlotBank(); c.save(0, { lanes: [] }); c.switchAt = 'cycle'; c.recall(0);
  const o = 3 * PPQ, cyc = 6 * PPQ;
  assert.equal(c.nextSwitch(o + PPQ, cyc, { at: 0, len: B }, o), o + cyc, 'next cycle counted from the origin');
  assert.equal(c.due(cyc, cyc, { at: 0, len: B }, o), -1, 'not on the bar anchor\'s cycle'); assert.equal(c.due(o + cyc, cyc, { at: 0, len: B }, o), 0);
});

test('P4 chain export with restart: every slot starts on step 1', async () => {
  const { collectChain } = await import('../src/poly/export.js'); const { Machine } = await import('../src/poly/lanes.js');
  const s = new Machine(); s.lanes.forEach(l => l.clear()); s.lanes[0].setLength(3); s.lanes[0].hits[0] = true; const j = s.toJSON();
  const at = (restart) => collectChain([j, j], { bars: 1, tempo: 120, restart }).filter(h => h.li === 0).map(h => Math.round(h.time * 2));   // in beats at 120 bpm
  assert.deepEqual(at(true), [0, 3, 4, 7], 'slot 2 restarts on its first beat'); assert.deepEqual(at(false), [0, 3, 6], 'without: the count runs on');
});

test('P5 MIDI out offset: notes, note-offs, clock and start move by it; auto = output latency; clamped and saved', async () => {
  const { PolyMidi, LATENCY_MAX } = await import('../src/poly/midiio.js'); const sent = [];
  const port = { name: 'DAW', send: (b, t) => sent.push([b[0], t]) };
  const p = new PolyMidi({ getAccess: () => ({ outputs: new Map([['a', port]]), inputs: new Map() }) }); p.setOutput('DAW'); p.clockOut = true; p.gateMs = 60;
  p.autoMs = 12.4; assert.equal(p.latencyMs, 12, 'auto: the output latency');
  p.note(0, 1, 1000); p.clockAt(0, 1000); p.start(1000);
  assert.deepEqual(sent, [[0x99, 1012], [0x89, 1072], [0xF8, 1012], [0xFA, 1012]]);
  sent.length = 0; p.offsetMs = -20; p.note(0, 1, 1000); assert.deepEqual(sent[0], [0x99, 980], 'a manual offset wins, earlier too');
  p.offsetMs = 400; assert.equal(p.latencyMs, LATENCY_MAX, 'clamped');
  const q = new PolyMidi({ getAccess: () => null }); q.fromJSON(JSON.parse(JSON.stringify({ ...p.toJSON(), offsetMs: -7 }))); assert.equal(q.offsetMs, -7);
  q.fromJSON({ outName: '' }); assert.equal(q.offsetMs, null, 'older settings: auto');
});

test('P7 condition loops for the step buttons', async () => {
  const { condLoops } = await import('../src/poly/perform.js');
  const s = (c) => condLoops(c, 8).map(v => v === null ? '?' : v ? 'x' : '.').join('');
  assert.equal(s('always'), 'xxxxxxxx'); assert.equal(s(undefined), 'xxxxxxxx'); assert.equal(s('1:2'), 'x.x.x.x.'); assert.equal(s('3:4'), '..x...x.');
  assert.equal(s('first'), 'x.......'); assert.equal(s('not first'), '.xxxxxxx'); assert.equal(s('fill'), '????????'); assert.equal(s('not pre'), '????????');
  assert.equal(condLoops('2:3').length, 16);
});

test('P6 filter knob: centre is a wire, each side exponential, the wheel stops at the centre', async () => {
  const { fxFreqs, stepFilter, FX_LP_MIN, FX_HP_MIN, FX_HP_MAX } = await import('../src/poly/perform.js');
  assert.deepEqual(fxFreqs(0, 48000), { lp: 24000, hp: 0 }, 'off: low-pass at Nyquist, high-pass at 0 Hz (both pass everything)');
  assert.equal(Math.round(fxFreqs(-1).lp), FX_LP_MIN); assert.equal(Math.round(fxFreqs(1).hp), FX_HP_MAX); assert.equal(fxFreqs(-1).hp, 0); assert.equal(fxFreqs(1).lp, 22050);
  assert.ok(Math.abs(fxFreqs(-0.5).lp - Math.sqrt(22050 * FX_LP_MIN)) < 1, 'half way = the geometric middle'); assert.ok(fxFreqs(0.01).hp >= FX_HP_MIN);
  assert.equal(stepFilter(0, -1), -0.04); assert.equal(stepFilter(-0.04, 3), 0, 'crossing the centre stops on it'); assert.equal(stepFilter(0, 3), 0.12, 'and goes on from there');
  assert.equal(stepFilter(0.98, 5), 1); assert.equal(stepFilter(-1, -2), -1, 'clamped'); assert.equal(stepFilter(0.04, -1), 0, 'landing on the centre');
});
