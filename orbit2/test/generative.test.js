// ORBIT2-12 steerable generative: evolve weights / gravity / max cycle / euclid hand edits (V1), coupling (V2), euclid
// masks (V3), ratchet curves (V4), timbre modulation, timbre dice and scale snap (V5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine, Lane, euclid, EVOLVE_WEIGHTS, weightsFrom, BAR_TICKS, PPQ, ratchetTimes, modValue, snapTune, SCALES } from '../src/poly/lanes.js';
import { mulberry32, Dice } from '../src/poly/dice.js';
import { collectHits, expandHits } from '../src/poly/export.js';

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
  assert.deepEqual(ratchetTimes(4), [0, 0.25, 0.5, 0.75]);
  assert.deepEqual(ratchetTimes(4, 'up'), [0, 0.4375, 0.75, 0.9375], 'speed up: gaps shrink');
  assert.deepEqual(ratchetTimes(4, 'down'), [0, 0.0625, 0.25, 0.5625], 'slow down: gaps grow');
  for (const c of ['even', 'up', 'down']) { const t = ratchetTimes(8, c); assert.equal(t[0], 0); assert.ok(t.every(x => x < 1)); assert.ok(t.every((x, k) => !k || x > t[k - 1])); }
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const l = m.lanes[0]; l.setLength(4); l.setRatio(5); l.hits[0] = true; l.tune = 0.25;
  l.setTrig(0, { ratchet: 8, curve: 'up', ramp: 0.5 }); assert.deepEqual(l.trigs[0], { cond: 'always', ratchet: 8, fade: false, curve: 'up', ramp: 0.5 });
  l.setTrig(0, { curve: 'even', ramp: 0 }); assert.deepEqual(l.trigs[0], { cond: 'always', ratchet: 8, fade: false }, 'defaults are not stored');
  l.setTrig(0, { ratchet: 4, curve: 'up', ramp: 0.5 });
  const hits = collectHits(m, { to: PPQ, tempo: 120 }); assert.equal(hits.length, 4);
  assert.deepEqual(hits.map(h => +(h.time / 0.5).toFixed(4)), [0, 0.4375, 0.75, 0.9375], 'at the curve\'s times (a step = 0.5 s)');
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

test('V1 max cycle guard holds over 500 seeded evolves (gravity 0 and 0.5)', () => {
  for (const gravity of [0, 0.5]) {
    const m = groove(), home = JSON.parse(JSON.stringify(m)), rng = new Dice().fromJSON({ locked: true, seed: 42 }).stream(3), max = 32 * BAR_TICKS;
    assert.ok(m.cycleTicks() <= max); let held = 0;
    for (let n = 0; n < 500; n++) { held += m.evolve({ scope: 'all', amount: 0.7, gravity, home, maxBars: 32, weights: { ...EVOLVE_WEIGHTS, prob: 1, tune: 1 } }, rng).filter(c => c.held).length; assert.ok(m.cycleTicks() <= max, `step ${n}: ${m.cycleTicks() / BAR_TICKS} bars`); }
    assert.ok(held > 0, 'the guard had to step in');
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
  // the lift is for the next step only, and a lane stepping on the same tick gets it on its following step
  const m = make('next'); m.lanes[1].prob = 0; const r = () => 0.5; m.tick(0, r); assert.equal(m.boostOf(1), 0.6); const ev = m.tick(840, r); assert.equal(ev[1].hit, true); assert.equal(m.boostOf(1), 0.6, 'lane 1 hit again on that tick');
  m.lanes[0].clear(); m.tick(1680, r); assert.equal(m.boostOf(1), 0, 'used up'); assert.equal(m.tick(2520, r)[1].hit, false);
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
