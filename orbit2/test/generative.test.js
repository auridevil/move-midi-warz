// ORBIT2-12 steerable generative: evolve weights / gravity / max cycle / euclid hand edits (V1), coupling (V2), euclid
// masks (V3), ratchet curves (V4), timbre modulation, timbre dice and scale snap (V5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine, Lane, euclid, EVOLVE_WEIGHTS, weightsFrom, BAR_TICKS, PPQ, RATIOS, ratchetTimes, ratchetGains, modValue, snapTune, SCALES } from '../src/poly/lanes.js';
import { mulberry32, Dice } from '../src/poly/dice.js';
import { collectHits, expandHits, liveTick } from '../src/poly/export.js';

const bits = (l) => Array.from({ length: l.length }, (_, i) => (l.hitAt(i) ? 'x' : '.')).join('');

test('V3 euclid masks: replace / AND / XOR with the hand pattern; the knob moves only the mask; euclid(5,8) vs the cinquillo', () => {
  const l = new Lane('hat', { length: 8 }); l.hits.fill(false); [0, 1, 2, 3].forEach(i => { l.hits[i] = true; });   // hand: xxxx....
  l.setEuclidMode('and'); l.setEuclid(4); assert.equal(bits(l), 'x.x.....', 'AND: hand ∧ E(4,8) = x.x.x.x.');
  assert.equal(l.hits.slice(0, 8).filter(Boolean).length, 4, 'the hand hits are not rewritten');
  l.setEuclidMode('xor'); assert.equal(bits(l), '.x.xx.x.', 'XOR: hand ⊕ E(4,8)');
  assert.ok(l.maskedOut(0) && !l.maskedOut(1), 'a hand hit the mask silences shows as masked');
  l.setEuclid(2); assert.equal(bits(l), '.xxxx...', 'the knob moves the mask: hand ⊕ E(2,8)');
  l.setEuclidMode('replace'); assert.equal(bits(l), 'xxxx....', 'back to replace: the hand pattern as it was'); l.setEuclid(3); assert.equal(bits(l), 'x..x..x.');
  const j = Lane.from(JSON.parse(JSON.stringify(Object.assign(new Lane('kick'), { euclidMode: 'xor' })))); assert.equal(j.euclidMode, 'xor');
  assert.equal(new Lane('kick').toJSON().euclidMode, undefined, 'replace is not saved: old lanes save as before');
  assert.equal(Lane.from({ name: 'kick', length: 4, euclidMode: 'nope' }).euclidMode, 'replace');
  // the floor form vs Bjorklund: the same necklace, read from another step
  assert.equal(euclid(5, 8).map(b => (b ? 'x' : '.')).join(''), 'x.x.xx.x');
  const c = new Lane('kick', { length: 8 }); c.setEuclid(5); c.rotation = 6; assert.equal(bits(c), 'x.xx.xx.', 'rotation 6 = the cinquillo');
  const m = new Machine(); m.lanes[2].setEuclidMode('and'); m.lanes[2].evolve = true; const hand = m.lanes[2].hits.join();
  for (let s = 0; s < 20; s++) m.evolve({ scope: 'hits', amount: 1, weights: { ...EVOLVE_WEIGHTS, rotate: 0 } }, mulberry32(s)); assert.equal(m.lanes[2].hits.join(), hand, 'evolve on a mask lane moves the mask, not your hits');
});

test('V4 ratchet curves: times, spacing, up to ×8, pitch ramp', () => {
  const r4 = (a) => a.map(x => +x.toFixed(4));
  assert.deepEqual(ratchetTimes(4), [0, 0.25, 0.5, 0.75]);
  assert.deepEqual(r4(ratchetTimes(4, 'up')), [0, 0.375, 0.625, 0.75], 'speed up: gaps between the repeats shrink (3/8 → 1/8), the last where the even one is');
  assert.deepEqual(r4(ratchetTimes(4, 'down')), [0, 0.125, 0.3333, 0.625], 'slow down: gaps grow (1/8 → 3/8, the last to the next step)');
  assert.deepEqual([ratchetTimes(2, 'down'), ratchetTimes(2, 'up')], [[0, 0.25], [0, 0.5]], '×2 speed up has one gap: even');
  assert.deepEqual(r4(ratchetGains(8, 'up')), [1, 1, 1, 1, 0.8333, 0.6667, 0.5, 0.5]); assert.deepEqual(ratchetGains(8), Array(8).fill(1), 'even: all at 1');
  // r1 (sound): no two repeats closer than half the even gap; a speed-up ends a whole even gap before the next step;
  // a repeat closer than the even gap to a neighbour is softer by as much (the curve keeps the even ratchet's energy)
  for (let n = 1; n <= 8; n++) for (const c of ['even', 'up', 'down']) {
    const t = ratchetTimes(n, c), gaps = t.map((x, k) => (k + 1 < n ? t[k + 1] : 1) - x), g = ratchetGains(n, c), inner = gaps.slice(0, -1);
    assert.equal(t[0], 0); assert.ok(gaps.every(x => x >= 1 / (2 * n) - 1e-12), `×${n} ${c}: gaps ${r4(gaps)}`); assert.ok(Math.abs(gaps.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    if (c === 'up') { assert.ok(Math.abs(gaps.at(-1) - 1 / n) < 1e-12, 'the last a whole even gap before the next step'); if (n > 2) assert.ok(inner.every((x, k) => !k || x < inner[k - 1]), `×${n} up: shrinking`); }
    if (c === 'down' && n > 1) assert.ok(gaps.every((x, k) => !k || x > gaps[k - 1]), `×${n} down: growing`);
    assert.equal(g[0], 1); g.forEach((x, k) => { if (k) assert.ok(Math.abs(x - Math.min(1, n * Math.min(gaps[k - 1], gaps[k]))) < 1e-9 && x >= 0.5); });
    if (c === 'even') assert.ok(g.every(x => x === 1), `×${n} even: exactly 1`);
  }
  assert.deepEqual(ratchetGains(3, 'up'), [1, 0.5, 0.5], 'r2: the floor is exactly ½');
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const l = m.lanes[0]; l.setLength(4); l.setRatio(5); l.hits[0] = true; l.tune = 0.25;
  l.setTrig(0, { ratchet: 8, curve: 'up', ramp: 0.5 }); assert.deepEqual(l.trigs[0], { cond: 'always', ratchet: 8, fade: false, curve: 'up', ramp: 0.5 });
  l.setTrig(0, { curve: 'even', ramp: 0 }); assert.deepEqual(l.trigs[0], { cond: 'always', ratchet: 8, fade: false }, 'defaults are not stored');
  l.setTrig(0, { ratchet: 4, curve: 'up', ramp: 0.5 });
  const hits = collectHits(m, { to: PPQ, tempo: 120 }); assert.equal(hits.length, 4);
  assert.deepEqual(hits.map(h => +(h.time / 0.5).toFixed(4)), [0, 0.375, 0.625, 0.75], 'at the curve\'s times (a step = 0.5 s)');
  assert.deepEqual(hits.map(h => +h.vel.toFixed(4)), [0.7, 0.7, 0.35, 0.35], 'the two repeats ⅛ apart (half the even gap) at half (ratchetGains)');
  assert.deepEqual(hits.map(h => +(h.lock?.tune ?? l.tune).toFixed(4)), [0.25, 0.4167, 0.5833, 0.75], 'tune ramps from the lane\'s to + 0.5');
  const one = expandHits({ hit: true, step: 0, swung: 0, ratchet: 1, ramp: 0.5, lock: null }, l, 0, { tickSec: 1 / PPQ }); assert.equal(one[0].lock, null, 'one hit: no ramp, no lock');
});

test('V5 modulator: a sine over N loops or the cycle, ± depth / 2 around the sound, saved', () => {
  assert.equal(modValue(0.6, 0), 0); assert.ok(Math.abs(modValue(0.6, 0.25) - 0.3) < 1e-12); assert.ok(Math.abs(modValue(0.6, 0.75) + 0.3) < 1e-12);
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const l = m.lanes[0]; l.setLength(4); l.setRatio(5); l.setEuclid(4); l.sound.tone = 0.5;
  l.setMod({ target: 'tone', loops: 2, depth: 0.6 });   // a period of 8 steps
  const tone = collectHits(m, { to: PPQ * 8, tempo: 120 }).map(h => +h.lock.tone.toFixed(4));
  assert.deepEqual(tone, [0.5, 0.7121, 0.8, 0.7121, 0.5, 0.2879, 0.2, 0.2879], 'one period over 2 loops of 4 steps');
  assert.equal(m.lanes[0].loopsPerCycle(), 2, 'the cycle counts the modulator\'s period');
  l.setLock(2, 'tone', 0.9); assert.equal(collectHits(m, { to: PPQ * 8, tempo: 120 })[2].lock.tone, 1, 'around a step lock, kept in 0..1');
  l.setMod({ target: 'color', loops: 0, depth: 1 }); const k = new Machine(); k.lanes.forEach(x => x.clear()); Object.assign(k.lanes[0], { length: 4, euclidK: 0 }); k.lanes[0].setEuclid(4); k.lanes[1].setLength(3); k.lanes[1].setEuclid(1); k.lanes[0].setMod({ target: 'color', loops: 0, depth: 1 });
  const cyc = k.cycleTicks(), col = collectHits(k, { to: cyc, tempo: 120 }).filter(h => h.li === 0).map(h => h.lock.color);
  assert.equal(col.length, cyc / PPQ); assert.equal(col[0], 0.5); assert.ok(Math.max(...col) > 0.95 && Math.min(...col) < 0.05, 'over the whole cycle');
  assert.deepEqual(Lane.from(JSON.parse(JSON.stringify(l))).mod, { target: 'color', loops: 0, depth: 1 }); assert.equal(Lane.from({ name: 'x', mod: { target: 'pan' } }).mod, null);
});

test('V5 timbre dice: within the range, repeat with locked dice; scale snap on pitched voices only', () => {
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const l = m.lanes[0]; l.setLength(4); l.setRatio(5); l.setEuclid(4); l.setTimbreDice({ decay: 0.4 });
  const d = new Dice().fromJSON({ locked: true, seed: 3, repeat: 1 }), a = collectHits(m, { to: PPQ * 16, tempo: 120, dice: d }).map(h => h.lock.decay);
  assert.ok(a.every(x => x >= 0.3 - 1e-9 && x <= 0.7 + 1e-9), 'decay 0.5 ± 0.2'); assert.ok(new Set(a).size > 3);
  assert.deepEqual(collectHits(m, { to: PPQ * 16, tempo: 120, dice: d }).map(h => h.lock.decay), a, 'locked dice: the same rolls');
  assert.deepEqual(a.slice(0, 4), a.slice(4, 8), 'repeat 1: every loop the same'); assert.equal(Lane.from({ name: 'x', tdice: { tone: 0 } }).tdice, null);
  // scale snap: tune 0.3 on a ±12 voice = 3.6 semitones → major 4, minor 3, pentatonic 4, just 5/4 (3.86)
  assert.equal(snapTune(0.3, 'major', 12), 4 / 12); assert.equal(snapTune(0.3, 'minor', 12), 3 / 12);
  assert.equal(snapTune(-0.1, 'penta', 12), 0, '−1.2 semitones: the root is nearest'); assert.equal(snapTune(-0.2, 'penta', 12), -3 / 12, '−2.4: a minor third under (the 9 of the octave below)');
  assert.ok(Math.abs(snapTune(0.3, 'just', 12) - SCALES.just[4] / 12) < 1e-12, 'just: the 5/4 major third'); assert.equal(snapTune(0.3, 'major', 24), 7 / 24, '±24 voice: 7.2 → 7');
  assert.equal(snapTune(1, 'major', 12), 1); assert.equal(snapTune(0.3, 'off', 12), 0.3);
  const s = new Machine(); s.lanes.forEach(x => x.clear()); const c = s.lanes[0]; c.setLength(1); c.setRatio(5); c.hits[0] = true; c.tune = 0.3; c.setScale('minor');
  c.voice = 'conga'; assert.equal(collectHits(s, { to: PPQ, tempo: 120 })[0].lock.tune, 0.25, 'a conga snaps');
  c.voice = 'hat'; assert.equal(collectHits(s, { to: PPQ, tempo: 120 })[0].lock, null, 'a hat has no pitch to snap');
});

const shape = (m) => m.lanes.map(l => ({ hits: l.hits.join(''), accents: l.accents.join(''), locks: JSON.stringify(l.locks), trigs: JSON.stringify(l.trigs), rotation: l.rotation, length: l.length, ratioIndex: l.ratioIndex, prob: l.prob, tune: l.tune }));
const groove = () => { const m = new Machine(); m.lanes.forEach((l, i) => { l.setLength([8, 8, 16, 5][i]); l.setEuclid([3, 2, 7, 2][i]); }); m.lanes[0].toggle(5); m.lanes[0].setLock(0, 'tune', 0.5); m.lanes[2].setTrig(0, { cond: '1:2' }); m.lanes[1].accents[0] = true; return m; };

test('V1 default weights pick what the old uniform evolve picked (old seeded evolves keep their kinds)', () => {
  const kinds = [];
  for (let s = 1; s < 40; s++) { const m = groove(); for (const c of m.evolve({ scope: 'all', amount: 1 }, mulberry32(s))) kinds.push(c.kind); }
  assert.ok(kinds.length > 100); assert.ok(kinds.every(k => ['rotate', 'hits', 'length', 'ratio'].includes(k)), 'chance and tune start at weight 0');
  const only = groove(); for (let n = 0; n < 30; n++) for (const c of only.evolve({ scope: 'all', amount: 1, weights: { rotate: 0, hits: 0, length: 0, ratio: 0, prob: 1, tune: 0 } }, mulberry32(n))) assert.equal(c.kind, 'prob');
  assert.deepEqual(weightsFrom({ rotate: 9, hits: -2, prob: 'x' }), { ...EVOLVE_WEIGHTS, rotate: 4, hits: 0 }, 'saved weights clamp, junk falls back');
});

test('V1 evolve with gravity 1 returns home, then holds still', () => {
  const m = groove(), home = JSON.parse(JSON.stringify(m)), rng = mulberry32(7), w = { rotate: 1, hits: 1, length: 1, ratio: 1, prob: 1, tune: 1 };
  for (let n = 0; n < 60; n++) m.evolve({ scope: 'all', amount: 0.8, weights: w }, rng);
  assert.notDeepEqual(shape(m), shape(Machine.from(home)), 'it wandered');
  let n = 0; while (JSON.stringify(shape(m)) !== JSON.stringify(shape(Machine.from(home))) && n < 2000) { m.evolve({ scope: 'all', amount: 1, weights: w, gravity: 1, home }, rng); n++; }
  assert.deepEqual(shape(m), shape(Machine.from(home)), `home after ${n} nudges`);
  assert.deepEqual(m.evolve({ scope: 'all', amount: 1, weights: w, gravity: 1, home }, rng), [], 'at home nothing moves');
});

test('V1 max cycle guard holds over 500 seeded evolves (gravity 0 and 0.5; a step home is never held)', () => {
  for (const gravity of [0, 0.5]) {
    const m = groove(), home = JSON.parse(JSON.stringify(m)), rng = new Dice().fromJSON({ locked: true, seed: 42 }).stream(3), max = 32 * BAR_TICKS;
    assert.ok(m.cycleTicks() <= max); let held = 0, homes = 0;
    for (let n = 0; n < 500; n++) {
      const c0 = m.cycleTicks(), ch = m.evolve({ scope: 'all', amount: 0.7, gravity, home, maxBars: 32, weights: { ...EVOLVE_WEIGHTS, prob: 1, tune: 1 } }, rng);
      held += ch.filter(c => c.held).length; homes += ch.filter(c => c.home).length; assert.ok(!ch.some(c => c.held && c.home), 'a step home is never held');
      // a random move never takes the cycle past the limit (or past where it already was); only the way home may, for a while
      if (!ch.some(c => c.home)) assert.ok(m.cycleTicks() <= Math.max(max, c0), `step ${n}: ${m.cycleTicks() / BAR_TICKS} bars`);
      if (!gravity) assert.ok(m.cycleTicks() <= max, `step ${n}: ${m.cycleTicks() / BAR_TICKS} bars`);
    }
    assert.ok(held > 0, 'the guard had to step in'); assert.equal(homes > 0, gravity > 0);
  }
});

test('V1 a hand-edited euclid lane keeps its edits; a pure one refills and its accents / locks / conditions move with the hits', () => {
  const l = new Lane('hat', { length: 8 }); l.setEuclid(3); l.toggle(7);   // E(3,8) + a hand hit on 8
  for (let s = 0; s < 20; s++) { const c = Lane.from(JSON.parse(JSON.stringify(l))); c.evolveHits(1, mulberry32(s)); assert.ok(c.hits[7], 'hand hit kept'); assert.equal(c.hits.filter(Boolean).length, 5); }
  const d = Lane.from(JSON.parse(JSON.stringify(l))); d.evolveHits(-1, mulberry32(1)); assert.equal(d.hits.filter(Boolean).length, 3); assert.equal(d.euclidK, 2);
  const p = new Lane('kick', { length: 8 }); p.setEuclid(3); p.accents[3] = true; p.setLock(3, 'tune', 0.25); p.setTrig(6, { cond: '1:2' });   // E(3,8) = x..x..x.
  assert.deepEqual(euclid(3, 8).map(Number), [1, 0, 0, 1, 0, 0, 1, 0]);
  p.evolveHits(1, mulberry32(0)); assert.ok(p.isEuclid()); assert.equal(p.euclidK, 4);   // E(4,8) = x.x.x.x.
  assert.ok(p.locks.some((lk, i) => lk?.tune === 0.25 && p.hits[i]), 'the tune lock sits on a hit'); assert.ok(p.accents.some((a, i) => a && p.hits[i]), 'the accent too');
  assert.ok(p.trigs.some((t, i) => t?.cond === '1:2' && p.hits[i]), 'and the condition'); assert.equal(p.locks.filter(Boolean).length, 1);
});

test('V2 coupling: a hit lifts the next lane\'s next step; deterministic with locked dice; saved with the pattern', () => {
  const make = (mode) => { const m = new Machine(); m.lanes.forEach(l => { l.clear(); l.setLength(4); l.setRatio(5); }); m.lanes[0].setEuclid(4); m.lanes[1].setEuclid(4); m.lanes[1].prob = 0.2; m.couple.mode = mode; m.couple.amount = 0.6; return m; };
  const dice = new Dice().fromJSON({ locked: true, seed: 9, repeat: 1 });
  const count = (m) => collectHits(m, { to: 840 * 64, tempo: 120, dice }).filter(h => h.li === 1).length;
  const off = count(make('off')), on = count(make('next'));
  assert.ok(on > off + 10, `lane 2 plays more when lane 1 lifts it (${off} → ${on})`);
  assert.equal(count(make('next')), on, 'locked dice: the same every time');
  const a = make('next'); a.couple.mode = 'matrix'; a.couple.matrix[0][1] = 0.6; assert.equal(count(a), on, 'matrix 1 → 2 at 60 % = next lane at 60 % here');
  const j = Machine.from(JSON.parse(JSON.stringify(a))); assert.equal(j.couple.mode, 'matrix'); assert.equal(j.couple.matrix[0][1], 0.6);
  assert.equal(Machine.from({ lanes: a.toJSON().lanes }).couple.mode, 'off', 'older saves are uncoupled');
  assert.equal(new Machine().toJSON().couple, undefined, 'an uncoupled pattern saves as before');
  // the lift is for the next step only, and a lane stepping on the same tick gets it on its following step (live play's
  // liveTick keeps the lifts; Machine.tick only reads them, and alone leaves them as they are)
  const m = make('next'), ahead = [], r = () => 0.5, at = (t) => liveTick(m, t, ahead, { rng: r, tickSec: 60 / 120 / PPQ }).map(o => o.ev);
  m.lanes[1].prob = 0; at(0); assert.equal(m.boostOf(1), 0.6); const ev = at(840); assert.equal(ev[1].hit, true); assert.equal(m.boostOf(1), 0.6, 'lane 1 hit again on that tick');
  m.lanes[0].clear(); at(1680); assert.equal(m.boostOf(1), 0, 'used up'); assert.equal(at(2520)[1].hit, false);
  m.lanes[0].setEuclid(4); m.tick(3360, r); assert.equal(m.boostOf(1), 0, 'Machine.tick alone lifts nothing');
});

test('ORBIT2-12: live play = the render with every new feature on (locked dice: coupling, masks, ratchet curves + ramp, modulator, timbre dice, scale)', async () => {
  const { liveTick } = await import('../src/poly/export.js');
  const build = () => {
    const m = new Machine(6); m.lanes.forEach((l, i) => { l.clear(); l.setLength([4, 8, 16, 5, 6, 3][i]); l.setRatio([5, 10, 12, 10, 10, 5][i]); l.setEuclid([4, 3, 7, 2, 4, 1][i]); l.prob = [1, 0.4, 0.7, 0.5, 0.6, 1][i]; });
    m.couple.mode = 'matrix'; m.couple.matrix[0][1] = 0.5; m.couple.matrix[2][3] = 0.4; m.couple.matrix[3][4] = 0.7;
    const h = m.lanes[2]; h.setEuclidMode('xor'); h.hits[1] = h.hits[2] = true; h.setTrig(0, { ratchet: 6, curve: 'down', ramp: -0.5 });
    m.lanes[1].setTrig(2, { ratchet: 8, curve: 'up', ramp: 0.25 }); m.lanes[1].voice = 'conga'; m.lanes[1].setScale('just'); m.lanes[1].tune = 0.2;
    m.lanes[0].setMod({ target: 'tone', loops: 3, depth: 0.8 }); m.lanes[3].setMod({ target: 'decay', loops: 0, depth: 0.5 }); m.lanes[4].setTimbreDice({ tone: 0.5, color: 0.3 });
    return m;
  };
  const dice = new Dice().fromJSON({ locked: true, seed: 77, repeat: 2 }), tempo = 133, tickSec = 60 / tempo / PPQ, to = 4 * BAR_TICKS * 4;
  const key = (h) => `${h.li}@${h.time.toFixed(6)} v${h.vel.toFixed(4)} ${JSON.stringify(h.lock)}`;
  const m = build(), cycle = m.cycleTicks({ repeat: 2 }), ahead = [], live = [];
  for (let t = 0; t < to; t++) liveTick(m, t, ahead, { dice, tickSec, cycle }).forEach((r, li) => { for (const h of [...r.early, ...r.hits]) live.push({ li, time: t * tickSec + h.dt, vel: h.vel, lock: h.lock ?? null }); });
  const render = collectHits(build(), { to, tempo, dice }).map(h => ({ li: h.li, time: h.time, vel: h.vel, lock: h.lock ?? null }));
  const sort = (a) => a.map(key).sort();
  assert.ok(render.length > 200, `${render.length} hits`); assert.deepEqual(sort(live), sort(render));
});

test('ORBIT2-12 r1 V2: the lift follows the hits that play; a pushed or nudged coupled lane plays live what the render has', async () => {
  const { liveTick, liveQuiet } = await import('../src/poly/export.js');
  // the app's clock: quiet ticks skipped, no slot queued (cut ∞); hits compared up to a beat before the end
  const live = (m, { to, tempo, dice }) => { const tickSec = 60 / tempo / PPQ, ahead = [], out = []; for (let t = 0; t < to; t++) { if (liveQuiet(m, t, ahead, { humanize: m.humanize, tickSec })) continue; liveTick(m, t, ahead, { dice, tickSec }).forEach((r, li) => { for (const h of [...r.early, ...r.hits]) out.push({ li, time: t * tickSec + h.dt }); }); } return out; };
  const keys = (hs, end) => hs.filter(h => h.time < end).map(h => `${h.li}@${h.time.toFixed(6)}`).sort();
  // verifier: lane 2 pushed −30 ms at 30 %, lifted 70 % by lane 1 (matrix); architect: lane 2 nudged −0.4 on every step
  // at 0 %, lifted 100 % by lane 1's one hit a loop at ×¾ (at fac4c1d: 192 live vs 208 rendered; 8 vs 12)
  const a = () => { const m = new Machine(); m.lanes.forEach(l => l.clear()); const x = m.lanes[0], y = m.lanes[1]; x.setRatio(RATIOS.indexOf(3)); x.setLength(6); x.setEuclid(6); y.setRatio(RATIOS.indexOf(4)); y.setLength(16); y.setEuclid(16); y.prob = 0.3; y.setOffset(-30); m.couple.mode = 'matrix'; m.couple.matrix[0][1] = 0.7; return m; };
  const b = () => { const m = new Machine(); m.lanes.forEach(l => l.clear()); const x = m.lanes[0], y = m.lanes[1]; x.setRatio(RATIOS.indexOf(0.75)); x.setLength(1); x.setEuclid(1); y.setRatio(RATIOS.indexOf(1)); y.setLength(4); y.setEuclid(4); y.prob = 0; for (let i = 0; i < 4; i++) y.setLock(i, 'nudge', -0.4); m.couple.mode = 'matrix'; m.couple.matrix[0][1] = 1; return m; };
  for (const [mk, tempo, bars] of [[a, 200, 16], [b, 120, 4]]) {
    const dice = new Dice().fromJSON({ locked: true, seed: 5, repeat: 1 }), to = bars * BAR_TICKS, end = (to - PPQ) * 60 / tempo / PPQ;
    const render = keys(collectHits(mk(), { to, tempo, dice }), end); assert.deepEqual(keys(live(mk(), { to, tempo, dice }), end), render);
    assert.ok(render.filter(k => k.startsWith('1@')).length > 4, 'the lifted lane plays');
  }
  // free dice: lane 2 (0 %, lifted 100 % by lane 1's step before) sounds exactly after lane 1's heard hits, pushed or not
  for (const push of [0, -30]) {
    const m = new Machine(); m.lanes.forEach(l => l.clear()); const x = m.lanes[0], y = m.lanes[1];
    for (const l of [x, y]) { l.setRatio(RATIOS.indexOf(1)); l.setLength(4); l.setEuclid(4); } x.prob = 0.5; y.prob = 0; x.setOffset(push); m.couple.mode = 'next'; m.couple.amount = 1;
    const tickSec = 60 / 120 / PPQ, ahead = [], s = [new Set(), new Set()], st = x.stepTicks();
    for (let t = 0; t < 32 * BAR_TICKS; t++) { if (liveQuiet(m, t, ahead, { tickSec })) continue; liveTick(m, t, ahead, { tickSec }).forEach((r, li) => { if (li > 1) return; for (const h of r.early) s[li].add(Math.round(h.tick / st)); if (r.ev && r.hits.length) s[li].add(r.ev.step); }); }
    let bad = 0; for (let k = 1; k < 127; k++) if (s[1].has(k) !== s[0].has(k - 1)) bad++;
    assert.equal(bad, 0, `push ${push}: lane 2 follows the hits of lane 1 that played`); assert.ok(s[0].size > 30 && s[0].size < 100);
  }
});

test('ORBIT2-12 r1 V1: gravity brings a pattern home under the max cycle guard, also when home\'s own cycle is longer', () => {
  const m = new Machine(); m.lanes.forEach((l, i) => { l.setLength([7, 9, 11, 13][i]); l.setEuclid([3, 4, 5, 6][i]); });
  const home = JSON.parse(JSON.stringify(m)), w = { rotate: 1, hits: 1, length: 1, ratio: 1, prob: 1, tune: 1 }, same = (k) => JSON.stringify(shape(k)) === JSON.stringify(shape(Machine.from(home)));
  assert.ok(m.cycleTicks() > 32 * BAR_TICKS, 'home repeats after more than 32 bars');
  for (const seed of [7, 8, 9]) {   // at fac4c1d: not home after 3000 evolves, ~9000 moves held "(too long)"
    const k = Machine.from(home), rng = mulberry32(seed); for (let n = 0; n < 60; n++) k.evolve({ scope: 'all', amount: 0.8, weights: w, maxBars: 32, home }, rng);
    assert.ok(!same(k), 'it wandered');
    let n = 0; while (!same(k) && n < 300) { k.evolve({ scope: 'all', amount: 1, weights: w, gravity: 1, home, maxBars: 32 }, rng); n++; }
    assert.ok(same(k), `seed ${seed}: home after ${n} evolves`);
  }
});

test('ORBIT2-12 r1 V1: evolve never deletes a step\'s accent, locks or condition; they wait on their step and come back with the hit', () => {
  const data = (l) => JSON.stringify([l.accents, l.locks, l.trigs]);
  // E(4,8) with tune locks and accents on every hit and 1:2 on step 5, down to E(3,8) and back (fac4c1d: 0,4,6 left, no 1:2)
  const p = new Lane('kick', { length: 8 }); p.setEuclid(4); [0, 2, 4, 6].forEach(i => { p.accents[i] = true; p.setLock(i, 'tune', i / 10); }); p.setTrig(4, { cond: '1:2' });
  const before = data(p); p.evolveHits(-1, mulberry32(1)); assert.equal(p.euclidK, 3); assert.ok(p.isEuclid()); p.evolveHits(1, mulberry32(2)); assert.equal(data(p), before, 'E4 → E3 → E4: all back');
  // a hand lane's step toggled off and on by evolve (fac4c1d: back as a plain hit)
  const h = new Lane('perc', { length: 8 }); h.hits.fill(false); h.hits[2] = h.hits[5] = true; h.accents[2] = true; h.setLock(2, 'tone', 0.2); h.setTrig(2, { ratchet: 3 });
  const at2 = () => 2.5 / 8, d0 = data(h); h.evolveHits(-1, at2); assert.equal(h.hits[2], false); assert.equal(data(h), d0, 'off: the data waits'); h.evolveHits(1, at2); assert.ok(h.hits[2]); assert.equal(data(h), d0);
  // a hand-edited euclid lane: E(3,8) + a hand hit with data on 8, taken away and added back
  const e = new Lane('hat', { length: 8 }); e.setEuclid(3); e.toggle(7); e.setLock(7, 'decay', 0.9); e.setLock(3, 'tone', 0.1); const d1 = data(e);
  for (let s = 0; s < 8; s++) { const c = Lane.from(JSON.parse(JSON.stringify(e))); c.evolveHits(-1, mulberry32(s)); c.evolveHits(1, mulberry32(s + 50)); assert.equal(data(c), d1, `seed ${s}`); }
  // a dropped hit's data goes to the nearest new hit without data of its own, round the loop; none free: it waits
  const r = new Lane('kick', { length: 8 }); r.hits.fill(false); r.hits[7] = true; r.euclidK = 1; r.setLock(7, 'tune', 0.5); r.refill(2);   // E(2,8) = x...x...
  assert.deepEqual(r.locks.map((l, i) => (l ? i : -1)).filter(i => i >= 0), [0], 'step 8 → step 1 (1 away round the loop), not step 5');
  const q = new Lane('kick', { length: 8 }); q.hits.fill(false); q.hits[0] = q.hits[7] = true; q.euclidK = 2; q.setLock(0, 'tone', 0.4); q.setLock(7, 'tune', 0.5); q.refill(2);
  assert.equal(q.locks[0].tone, 0.4); assert.equal(q.locks[4]?.tune, 0.5, 'step 1 has its own data: step 5 takes it');
  const z = new Lane('kick', { length: 8 }); z.setEuclid(2); z.setLock(0, 'tone', 0.4); z.setLock(4, 'tune', 0.5); z.refill(1); assert.equal(z.locks[4]?.tune, 0.5, 'no free hit: it waits on step 5');
  // 64 default evolves (scope hits, 40 %) keep every entry (fac4c1d: 5,4,11,4 → 3,2,3,3)
  const m = new Machine(); m.lanes.forEach((l, i) => { l.setLength([8, 8, 16, 5][i]); l.setEuclid([3, 2, 7, 2][i]); for (let s = 0; s < l.length; s++) if (l.hits[s]) { l.accents[s] = s % 2 === 0; l.setLock(s, 'tune', 0.1); } }); m.lanes[3].toggle(1); m.lanes[3].setLock(1, 'tone', 0.3);
  const count = (k) => k.lanes.map(l => l.locks.filter(Boolean).length + l.accents.filter(Boolean).length + l.trigs.filter(Boolean).length).join();
  const c0 = count(m), rng = mulberry32(11); for (let n = 0; n < 64; n++) m.evolve({ scope: 'hits', amount: 0.4 }, rng); assert.equal(count(m), c0);
});

test('ORBIT2-12 r1 V1: evolve\'s home is a copy, so gravity brings back the hits and data evolve changed (the app takes it with m.snapshot())', async () => {
  const { readFileSync } = await import('node:fs');
  const m = groove(), shared = m.toJSON(), home = m.snapshot(); m.lanes[0].hits[1] = !m.lanes[0].hits[1]; m.lanes[0].setLock(0, 'tune', 0.9);
  assert.equal(shared.lanes[0].hits[1], m.lanes[0].hits[1], 'toJSON shares the step arrays: a home taken with it moves with every edit');
  assert.notEqual(home.lanes[0].hits[1], m.lanes[0].hits[1]); assert.equal(home.lanes[0].locks[0].tune, 0.5, 'the snapshot keeps its own');
  const k = groove(), h = k.snapshot(), w = { rotate: 1, hits: 1, length: 1, ratio: 1, prob: 1, tune: 1 }, rng = mulberry32(3);
  for (let n = 0; n < 40; n++) k.evolve({ scope: 'all', amount: 0.8, weights: w }, rng);
  let n = 0; while (JSON.stringify(shape(k)) !== JSON.stringify(shape(Machine.from(h))) && n < 500) { k.evolve({ scope: 'all', amount: 1, weights: w, gravity: 1, home: h }, rng); n++; }
  assert.deepEqual(shape(k), shape(Machine.from(h)), `home after ${n}`);
  // the page took home with m.toJSON() (fac4c1d): its hits moved with evolve and gravity only ever restored lengths and speeds
  const src = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  assert.ok(!/evoSnap\s*=\s*m\.toJSON\(\)/.test(src) && (src.match(/evoSnap\s*=\s*m\.snapshot\(\)/g) || []).length === 4, 'every home is m.snapshot() (bank.get hands out its own copy)');
});

test('ORBIT2-12 r1: a chance lock on a step only the euclid mask plays counts as a roll in the cycle', () => {
  const x = new Lane('hat', { length: 4 }); x.hits.fill(false); x.setEuclidMode('xor'); x.setEuclid(1);   // XOR with no hand hits: the mask plays step 1
  assert.ok(x.played(0) && !x.hits[0]); assert.equal(x.loopsPerCycle({ repeat: 4 }), 1, 'no roll yet');
  x.setLock(0, 'prob', 0.5); assert.equal(x.loopsPerCycle({ repeat: 4 }), 4, 'with locked dice repeat 4 it repeats every 4 loops (fac4c1d: 1)');
});
