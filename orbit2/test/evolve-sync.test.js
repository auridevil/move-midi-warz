// RD-13 evolve in sync with the cycle: nextEvolveTick (the one function the clock and the countdown share), the mutation
// tick = the cycle's wrap tick = the sun at 0 for 50 random machines, the re-sync after a cycle change, old settings,
// maxBars, and the app's wiring (source checks, as the light tests do).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextEvolveTick, evolveDue, cycleProgress, syncFrom, EVOLVE_SYNCS, HeardCycle } from '../src/poly/evolve-sync.js';
import { beatsLeft, cycleBeats, genWords, captionLines } from '../src/poly/scene.js';
import { pillText } from '../src/poly/pills.js';
import { Machine, PPQ, BAR_TICKS, RATIOS } from '../src/poly/lanes.js';
import { mulberry32, Dice } from '../src/poly/dice.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CONDS = ['always', '1:2', '2:2', '1:3', '1:4', 'first', 'not first'];

/** A random machine: 2–6 lanes, lengths 1–16, any speed, some conditions; dice repeat 1–3 when locked. */
function randomMachine(rng) {
  const m = new Machine(2 + Math.floor(rng() * 5));
  for (const l of m.lanes) {
    l.setLength(1 + Math.floor(rng() * 16)); l.ratioIndex = Math.floor(rng() * RATIOS.length);
    l.hits[0] = true; if (rng() < 0.5) l.setTrig(Math.floor(rng() * l.length), { cond: CONDS[Math.floor(rng() * CONDS.length)] });
  }
  return { m, repeat: rng() < 0.4 ? 1 + Math.floor(rng() * 3) : 1 };
}

test('RD-13 nextEvolveTick: cycle mode is the next alignment, strictly after the tick, from the pattern\'s origin', () => {
  assert.equal(nextEvolveTick(0, 120, 'cycle'), 120, 'Play: the first alignment is one cycle on');
  assert.equal(nextEvolveTick(119, 120, 'cycle'), 120); assert.equal(nextEvolveTick(119.5, 120, 'cycle'), 120, 'the heard tick is fractional');
  assert.equal(nextEvolveTick(120, 120, 'cycle'), 240, 'on the wrap itself: the next one (the mutation just fired)');
  assert.equal(nextEvolveTick(130, 120, 'cycle', 1, 0, 100), 220, 'counted from the origin (a new meter, a restarting slot)');
  assert.equal(nextEvolveTick(50, 0, 'cycle'), Infinity, 'no cycle, no mutation');
  assert.equal(nextEvolveTick(5, 120, 'cycle', 9, 9, 0), 120, 'every and bar are the bars mode\'s: ignored here');
});

test('RD-13 nextEvolveTick: bars mode is the next multiple of every × bar', () => {
  assert.equal(nextEvolveTick(0, 999, 'bars', 4, 96), 384); assert.equal(nextEvolveTick(383, 999, 'bars', 4, 96), 384); assert.equal(nextEvolveTick(384, 999, 'bars', 4, 96), 768);
  assert.equal(nextEvolveTick(10, 999, 'bars', 1, 96), 96); assert.equal(nextEvolveTick(10, 999, 'bars', 0, 96), 96, 'every under 1 counts as 1');
  assert.equal(nextEvolveTick(10, 999, 'bars', 4, 0), Infinity);
  assert.equal(nextEvolveTick(5, 999, undefined, 2, 96), 192, 'bars is the default mode');
});

test('RD-13 evolveDue: the clock\'s question, never on Play\'s own downbeat', () => {
  assert.equal(evolveDue(0, 120), false); assert.equal(evolveDue(120, 120), true); assert.equal(evolveDue(119, 120), false); assert.equal(evolveDue(121, 120), false);
  assert.equal(evolveDue(220, 120, 100), true, 'with an origin');
  assert.equal(evolveDue(1, 1), true, 'a 1-tick cycle: every tick after the first');
  const due = []; for (let t = 0; t < 600; t++) if (evolveDue(t, 120)) due.push(t); assert.deepEqual(due, [120, 240, 360, 480]);
});

test('RD-13 evolveDue: never on an origin set mid-play (a slot that restarts the lanes, a new meter\'s first bar)', () => {
  assert.equal(evolveDue(5040, 2520, 5040), false, 'the origin itself (round 1: a slot with restart on fired here, the sun at 225)');
  assert.equal(evolveDue(7560, 2520, 5040), true, 'one cycle on: that pattern\'s first alignment');
  assert.equal(evolveDue(5040, 2520, 0), true, 'without the move 5040 is an alignment');
  // the clock's loop with the origin moved to a bar line mid-cycle: nothing there, then the new pattern's alignments
  const cyc = 4 * 2520, fired = []; let origin = 0;
  for (let t = 0; t < 40000; t++) { if (t === 3360) origin = t; if (evolveDue(t, cyc, origin)) fired.push(t); }
  assert.deepEqual(fired, [1, 2, 3].map(k => 3360 + k * cyc).filter(t => t < 40000));
});

test('RD-13 HeardCycle: the countdown keeps the cycle the ear is in until the clock\'s change of it is heard', () => {
  const h = new HeardCycle(), live = () => ({ cycle: 300, origin: 0 });
  assert.deepEqual(h.read(1, live), { cycle: 300, origin: 0 }, 'nothing held: the model\'s own');
  h.hold({ cycle: 120, origin: 0 }, 2.0);   // a mutation scheduled for audio time 2.0 s took the cycle 120 → 300
  assert.deepEqual(h.read(1.95, live), { cycle: 120, origin: 0 }, 'not heard yet: the cycle the ear is in');
  assert.deepEqual(h.read(2.0, live), { cycle: 300, origin: 0 }, 'heard: the new one');
  h.hold({ cycle: 120, origin: 0 }, 3.0); h.hold({ cycle: 200, origin: 0 }, 3.05);   // two in flight (a short cycle)
  assert.equal(h.read(2.99, live).cycle, 120); assert.equal(h.read(3.01, live).cycle, 200, 'each brings in what the next replaced'); assert.equal(h.read(3.06, live).cycle, 300);
  h.hold({ cycle: 1, origin: 5 }, 9); h.clear(); assert.equal(h.read(0, live).cycle, 300, 'Play or stop: nothing in flight');
  for (let i = 0; i < 100; i++) h.hold({ cycle: i, origin: 0 }, 10 + i); assert.ok(h.q.length <= 32, 'bounded');
});

test('RD-13 with the clock a lookahead ahead of the ear, the countdown names the tick of the next mutation, cycle changes included', () => {
  // the clock schedules tick t at audio time t × ts and runs 100 ms ahead; the screen reads at the heard time, each frame
  const rng = mulberry32(2113), ts = 60 / 240 / PPQ, ahead = 0.1; let frames = 0, changes = 0;
  for (let n = 0; n < 20; n++) {
    const { m, repeat } = randomMachine(rng), dice = new Dice(); dice.locked = true; dice.seed = n + 1;
    const snap = m.snapshot(), heard = new HeardCycle(), live = () => ({ cycle: m.cycleTicks({ repeat }), origin: m.origin }), fired = [];
    let cyc = m.cycleTicks({ repeat }), t = 0;
    for (let f = 0; f < 1800; f++) {
      const now = f / 60 + 1e-4;   // off the tick grid: a frame landing on the mutation's very instant reads either side by float error
      for (; t * ts <= now + ahead; t++) if (evolveDue(t, cyc, m.origin)) {   // the clock's rule (app.js onTick), ahead of the ear
        const was = { cycle: cyc, origin: m.origin }; m.evolve({ scope: 'all', amount: 1, home: snap, maxBars: 2, repeat }, dice.stream(1000 + t)); cyc = m.cycleTicks({ repeat }); fired.push(t);
        if (cyc !== was.cycle) { heard.hold(was, t * ts); changes++; }
      }
      const tau = now / ts, next = fired.find(x => x > tau); if (next == null) continue;   // the ear's next mutation, once the clock has made it
      const a = heard.read(now, live); assert.equal(nextEvolveTick(tau, a.cycle, 'cycle', 1, 0, a.origin), next, `machine ${n}, frame ${f}: the sun counts to the mutation`); frames++;
    }
  }
  assert.ok(changes >= 5 && frames >= 100, `exercised: ${changes} cycle changes, ${frames} frames read`);
});

test('RD-13 cycleProgress: 0 after a mutation, growing to 1 at the next', () => {
  assert.equal(cycleProgress(0, 120), 0); assert.equal(cycleProgress(60, 120), 0.5); assert.ok(cycleProgress(119.9, 120) > 0.99); assert.equal(cycleProgress(120, 120), 0, 'the wrap: starts again');
  assert.equal(cycleProgress(10, 0), 0);
});

test('RD-13 the sun is the same countdown: beatsLeft reaches its last beat one beat before the mutation tick', () => {
  const cycle = 120, beat = 24;
  for (let t = 0; t < 3 * cycle; t++) {
    const next = nextEvolveTick(t, cycle, 'cycle'), left = beatsLeft(t, cycle, beat);
    assert.equal(left, Math.max(1, Math.ceil((next - t) / beat)), `tick ${t}`);
    if (left === 1) assert.ok(next - t <= beat && next - t > 0, 'the sun shows 1 for the last beat, then the mutation lands at 0');
  }
  assert.equal(beatsLeft(cycle, cycle, beat), cycleBeats(cycle, beat), 'at the wrap the sun shows the whole cycle again');
});

test('RD-13 50 random machines: the mutation tick = the cycle wrap tick = where the sun counts down to 0', () => {
  const rng = mulberry32(1313);
  for (let n = 0; n < 50; n++) {
    const { m, repeat } = randomMachine(rng), cyc = m.cycleTicks({ repeat }), beat = PPQ;
    assert.ok(cyc >= 1, 'a cycle');
    // the clock's rule over the first three cycles (capped), against the bloom's own test ((t − origin) % cycle === 0)
    const end = Math.min(3 * cyc, 40000), fired = [], bloom = [];
    for (let t = 0; t < end; t++) { if (evolveDue(t, cyc, m.origin)) fired.push(t); if (t > 0 && (t - m.origin) % cyc === 0) bloom.push(t); }
    assert.deepEqual(fired, bloom, `machine ${n}: every mutation is a bloom tick`);
    assert.deepEqual(fired, [1, 2, 3].map(k => k * cyc).filter(t => t < end), `machine ${n}: one per cycle`);
    // the countdown names that very tick, and the sun reads its last beat just before it
    if (fired.length) { const t = fired[0]; assert.equal(nextEvolveTick(t - 1, cyc, 'cycle', 1, 0, m.origin), t); assert.equal(beatsLeft(t - 1, cyc, beat), 1, 'the sun is on its last beat'); assert.equal(beatsLeft(t, cyc, beat), cycleBeats(cyc, beat), 'and the next count starts'); }
  }
});

test('RD-13 after a mutation that changes the cycle, the next countdown is the NEW pattern\'s (measured from the origin the sun counts from)', () => {
  const rng = mulberry32(77); let changed = 0;
  for (let n = 0; n < 50; n++) {
    const { m, repeat } = randomMachine(rng), dice = new Dice(); dice.locked = true; dice.seed = n + 1;
    const snap = m.snapshot(); let cyc = m.cycleTicks({ repeat }), last = 0, fires = [];
    // the clock's own loop: cyc is re-read after a mutation, within the same tick
    for (let t = 0; t < 40000 && fires.length < 4; t++) {
      if (evolveDue(t, cyc, m.origin)) {
        const before = cyc; m.evolve({ scope: 'all', amount: 1, home: snap, repeat }, dice.stream(1000 + Math.floor(t / PPQ))); cyc = m.cycleTicks({ repeat });
        fires.push({ t, before, after: cyc, gap: t - last }); if (cyc !== before) changed++; last = t;
        // the countdown, asked at the mutation tick itself, already names the new cycle's next alignment
        assert.equal(nextEvolveTick(t, cyc, 'cycle', 1, 0, m.origin), (Math.floor((t - m.origin) / cyc) + 1) * cyc + m.origin);
      }
    }
    for (const f of fires) assert.equal((f.t - m.origin) % f.before, 0, `machine ${n}: fired on the cycle then in force`);
    for (let k = 1; k < fires.length; k++) assert.ok(fires[k].t - fires[k - 1].t <= fires[k - 1].after, `machine ${n}: the next one is at most one NEW cycle later`);
  }
  assert.ok(changed > 0, 'at least one random mutation changed the cycle (the case is exercised)');
});

test('RD-13 settings: `sync` is saved, old settings (no sync, every a number) load as bars', () => {
  assert.deepEqual(EVOLVE_SYNCS, ['bars', 'cycle']);
  assert.equal(syncFrom(undefined), 'bars'); assert.equal(syncFrom('cycle'), 'cycle'); assert.equal(syncFrom('weekly'), 'bars'); assert.equal(syncFrom(null), 'bars');
  const old = JSON.parse('{"evo":{"on":false,"every":8,"amount":40,"scope":"hits","home":0}}');
  const evo = { on: false, sync: 'bars', every: 4 }; Object.assign(evo, old.evo, { on: false }); evo.sync = syncFrom(evo.sync);
  assert.deepEqual([evo.sync, evo.every], ['bars', 8], 'old file: bars mode, its every kept');
  const saved = JSON.parse(JSON.stringify({ evo: { ...evo, sync: 'cycle' } })); assert.equal(syncFrom(saved.evo.sync), 'cycle', 'round trip');
});

test('RD-13 maxBars still caps a cycle-synced mutation (the model is untouched)', () => {
  const rng = mulberry32(5);
  for (let n = 0; n < 20; n++) {
    const { m } = randomMachine(rng), cap = 16, limit = cap * m.barTicks();
    for (let k = 0; k < 6; k++) { const before = m.cycleTicks(); m.evolve({ scope: 'all', amount: 1, maxBars: cap }, rng); if (before <= limit) assert.ok(m.cycleTicks() <= limit, 'a change that would pass the cap is not made'); }
  }
});

test('RD-13 the words: arc, caption, pill; the plain-words tooltip', () => {
  assert.equal(genWords({ evolve: true, sync: 'cycle' }), 'EVOLVE · CYCLE'); assert.equal(genWords({ evolve: true, sync: 'bars' }), 'EVOLVE'); assert.equal(genWords({ evolve: true }), 'EVOLVE', 'old state: as before');
  assert.equal(genWords({ evolve: true, sync: 'cycle', dice: 7, gravity: 10 }), 'EVOLVE · CYCLE · DICE · GRAVITY');
  assert.deepEqual(captionLines({ cycle: 'cycle · 5 beats', evolve: { beats: 3 } }), ['cycle · 5 beats', 'evolve in 3 beats']); assert.deepEqual(captionLines({ evolve: { beats: 1 } }), ['evolve in 1 beat']);
  assert.deepEqual(captionLines({ evolve: { bars: 2 } }), ['evolve in 2 bars'], 'bars mode as before');
  assert.equal(pillText('evolve', { evolve: { on: true, every: 4, sync: 'cycle' } }), 'evolve · cycle'); assert.equal(pillText('evolve', { evolve: { on: true, every: 4 } }), 'evolve'); assert.equal(pillText('evolve', { evolve: { on: false, sync: 'cycle' } }), null);
});

test('RD-13 the app: one clock rule, one countdown, the switch, the gauge\'s lowest detent', () => {
  const app = read('../src/poly/app.js'), scene = read('../src/poly/scene.js'), html = read('../index.html');
  assert.match(app, /evo\.sync === 'cycle' \? si < 0 && evolveDue\(t, cyc, m\.origin\) : line && barN % evo\.every === 0/, 'the clock: cycle mode on the wrap tick (not on a slot\'s own tick), bars mode on the bar line as before');
  assert.match(app, /heardCyc\.hold\(\{ cycle: c0, origin: o0 \}, time\)/, 'the clock hands the countdown the cycle the ear is in'); assert.match(app, /align: alignNow/, 'the scene reads it');
  assert.match(app, /sync: 'bars', every: 4/, 'default bars'); assert.match(app, /evo\.sync = syncFrom\(evo\.sync\)/, 'the settings load');
  assert.match(app, /sliders\.evoEvery = makeGauge\(\{ label: 'every · bars', min: 0,/, 'knob 1\'s lowest detent (0) is cycle'); assert.match(app, /fmt: v => v \|\| 'cycle'/);
  assert.match(app, /every cycle · \$\{n\} beat/, 'the read-only line follows the sun\'s beats');
  assert.match(app, /'evolve sync': 'Change the pattern each time every ring lines up again, the moment the sun reaches 0\.'/);
  assert.match(scene, /nextEvolveTick\(tick, cycle, 'cycle'\)/, 'the sun counts down with the clock\'s function'); assert.match(scene, /cycleProgress\(/, 'the arc too');
  assert.match(html, /id="evo-sync"/); assert.match(html, /id="evo-cycle"/);
});
