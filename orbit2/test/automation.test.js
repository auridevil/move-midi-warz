// ORBIT2-18 parameter automation (docs/design/automation.md): step automation = step locks, curves = lane.auto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Lane, Machine, PPQ as P, MIDI_DIV, BAR_TICKS, AUTO_RES, AUTO_MAX, AUTO_KEYS, LOCK_KEYS, GHOST_VEL, autoFrom, autoHalf, autoChar, ratioIndexOf } from '../src/poly/lanes.js';
import { collectHits, collectChainRamps, autoRamps, liveTick, expandHits, timbreLock } from '../src/poly/export.js';
import { GROOVES } from '../src/poly/grooves.js';
import { Dice } from '../src/poly/dice.js';

const TICK = 60 / 120 / P;   // one master tick at 120 bpm
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);
/** A lane of `length` steps at ×1 with every step on (tests read curves, the hits only carry them). */
const laneOf = (length, o = {}) => { const l = new Lane('hat', { length, ratioIndex: ratioIndexOf(o.ratio ?? 1) }); l.setEuclid(length); return l; };
const lv = (i) => i / 63;   // the value of the curve char with index i

test('A2 autoAt: its points, linear between them, a "." neighbour counts as the lane value, none is null', () => {
  const l = laneOf(2); l.sound.tone = 0.5;
  l.auto = autoFrom({ loops: 1, len: 2, tone: 'A' + '_'.repeat(7) + '.'.repeat(8) });   // step 1: 0 then 1 · step 2: no points
  assert.equal(l.autoAt('tone', 0), 0); near(l.autoAt('tone', 1 / 16), 0.5, 1e-12, 'halfway between two points');
  assert.equal(l.autoAt('tone', 7 / 8), 1); near(l.autoAt('tone', 7 / 8 + 1 / 16), 0.75, 1e-12, 'toward the lane value past the last point');
  assert.equal(l.autoAt('tone', 1.5), null, 'no point on either side: the lane value plays');
  near(l.autoAt('tone', 2 - 1 / 16), 0.25, 1e-12, "the loop's last point leads to the next loop's first");
  assert.equal(l.autoAt('drive', 0), null, 'no curve on that key'); assert.equal(laneOf(4).autoAt('tone', 1), null, 'no curves at all');
  assert.equal(l.autoAt('tone', -1 / 16 * 0), 0); near(l.autoAt('tone', -1 / 16), 0.25, 1e-12, 'before step 1: the span wraps (what a loop hears)');
});
test('A2 autoAt: a span of N loops reads loop k % N; it counts from the origin; speed stretches it; rotation does not move it', () => {
  const l = laneOf(2); l.auto = autoFrom({ loops: 4, len: 2, tone: [0, 1, 2, 3].map(r => autoChar(r / 3).repeat(16)).join('') });
  near(l.autoAt('tone', 4.5), 2 / 3, 1e-12, 'step 4.5 of a 2-step lane: loop 3 of 4 (index 2)'); near(l.autoAt('tone', 12.5), 2 / 3, 1e-12, 'and again 4 loops later');
  assert.equal(l.autoAt('tone', 6.25), 1); assert.equal(l.autoAt('tone', 8), 0, 'the span starts again');
  l.rotation = 1; near(l.autoAt('tone', 4.5), 2 / 3, 1e-12, 'rotation moves the hits, not the curve');
  // on the master clock: positions from the origin, in the lane's steps (×1: 840 ticks, ×2: 420)
  const m = new Machine(); m.lanes = [l]; l.rotation = 0;
  const at = (t, origin = 0) => autoRamps(m, t, t + 1, origin)[0].v;
  near(at(4 * P), 2 / 3, 1e-12, 'tick 4 beats = step 4 at ×1'); near(at(5 * P, P), 2 / 3, 1e-12, 'the same step one beat later when the lanes start a beat later');
  l.setRatio(ratioIndexOf(2)); near(at(2 * P), 2 / 3, 1e-12, 'at ×2 the same step comes twice as soon');
});
test('A2 autoAt: a shorter lane never hears the rest of its rows, a longer one has no points past them (lane value)', () => {
  const l = laneOf(4); l.sound.level = 0.25; l.auto = autoFrom({ loops: 1, len: 4, level: Array.from({ length: 32 }, (_, j) => autoChar(j / 31)).join('') });
  near(l.autoAt('level', 3), lv(Math.round(24 / 31 * 63)), 1e-12);
  l.setLength(2); assert.equal(l.autoAt('level', 2), 0, 'a 2-step lane: step 3 is the next loop\'s step 1');
  l.setLength(6); assert.equal(l.autoAt('level', 4.5), null, 'steps 5–6 have no points: the lane value');
  near(l.autoAt('level', 4 - 1 / 16), (1 + 0.25) / 2, 1e-12, 'the last point leads to the lane value of the step after the rows');
});
test('A1 recordStepValue is a step lock (clamped; a nudge of 0 is none)', () => {
  const l = laneOf(4); assert.equal(l.recordStepValue(1, 'decay', 1.4), 1); assert.equal(l.locks[1].decay, 1);
  assert.equal(l.recordStepValue(2, 'tune', -3), -1); l.recordStepValue(3, 'nudge', 0); assert.equal(l.locks[3], null);
});
test('A2 recordCurve: the first write makes one lane loop; linear between the hand values; wraps; keeps the last span', () => {
  const l = laneOf(4); assert.equal(l.recordCurve('tone', 1, 0, 2, 1), 9, 'points 8..16 of the first curve');
  assert.deepEqual([l.auto.loops, l.auto.len, l.auto.tone.length], [1, 4, 32]);
  assert.equal(l.autoAt('tone', 1), 0); assert.equal(l.autoAt('tone', 2), 1); near(l.autoAt('tone', 1.5), lv(Math.round(0.5 * 63)), 1e-12);
  assert.equal(l.autoAt('tone', 0.5), null, 'where the gesture never went: no points');
  assert.equal(l.recordCurve('pan', 0.06, 0.3), 1, 'no point between: the nearest'); assert.equal(l.auto.pan[0], autoChar(0.3));
  l.recordCurve('tone', 3.5, 0.2, 4.5, 0.2); assert.equal(l.auto.tone[0], autoChar(0.2), 'wrapped onto step 1'); assert.equal(l.auto.tone[31], autoChar(0.2));
  assert.equal(l.recordCurve('tone', 0, 0, 10, 1), 32, 'a write longer than the span keeps its last span'); assert.equal(l.auto.tone[16], autoChar(1));
  assert.equal(l.recordCurve('decay', 0, 1), 0, 'decay is no curve key'); assert.equal(l.recordCurve('tone', 2, 0, 1, 0), 0, 'backwards: nothing');
});
test('A2 rows widen for a longer lane (when the cap allows), the span doubles and halves, at most 1024 points', () => {
  const l = laneOf(4); l.recordCurve('send', 0, 0.5, 4 - 1 / 8, 0.5); l.setLength(8); l.recordCurve('send', 5, 1);
  assert.equal(l.auto.len, 8); assert.equal(l.auto.send.slice(0, 32), autoChar(0.5).repeat(32), 'the old steps keep their points'); assert.equal(l.autoAt('send', 5), 1);
  const w = laneOf(32); w.recordCurve('level', 0, 1); assert.equal(w.auto.level.length, 256);
  assert.ok(w.spanAuto(1) && w.spanAuto(1)); assert.equal(w.auto.loops * w.auto.len * AUTO_RES, AUTO_MAX); assert.equal(w.spanAuto(1), false, 'over the cap');
  assert.equal(w.auto.level.slice(768), w.auto.level.slice(0, 256), 'doubling repeats the curve');
  const c = laneOf(16); c.recordCurve('pan', 0, 0.1); for (let i = 0; i < 3; i++) c.spanAuto(1); assert.equal(c.auto.loops, 8);
  c.setLength(32); assert.equal(c.recordCurve('pan', 20, 0.9), 0, 'rows can\'t widen past the cap: not written'); assert.equal(c.auto.len, 16);
  c.recordCurve('pan', 16 * 3 + 1, 0.9); assert.ok(c.spanAuto(-1)); assert.equal(c.auto.loops, 4); assert.equal(c.auto.pan.length, 4 * 16 * AUTO_RES, '½ keeps the first half');
  const d = laneOf(2); d.recordCurve('tone', 0, 1); d.spanAuto(1); d.recordCurve('tone', 2, 0.2); d.auto.tone = '.'.repeat(16) + d.auto.tone.slice(16);
  assert.ok(d.spanAuto(-1)); assert.equal(d.auto, null, 'a half without points: the curve goes, and with it the lane\'s auto'); assert.equal(laneOf(2).spanAuto(1), false);
});
test('A4 clearAuto: one curve, one key\'s locks, or the lane\'s automation; slice, stroke, trim, conditions and ghosts stay', () => {
  const l = laneOf(4); l.recordCurve('tone', 0, 0.2); l.recordCurve('level', 0, 0.2);
  l.setLock(0, 'decay', 0.9); l.setLock(1, 'decay', 0.1); l.setLock(1, 'tone', 0.3); l.setLock(2, 'slice', 3); l.setLock(2, 'artic', 1); l.setLock(3, 'start', 0.5); l.setTier(3, 'ghost'); l.setTrig(0, { cond: '1:2' });
  assert.ok(l.clearAuto('tone', 'curve')); assert.equal(l.auto.tone, undefined); assert.equal(l.locks[1].tone, 0.3, 'tone locks stay with kind "curve"');
  assert.ok(l.clearAuto('decay')); assert.equal(l.locks[0], null); assert.equal(l.locks[1].decay, undefined);
  assert.equal(l.clearAuto('decay'), false, 'nothing left to clear');
  assert.ok(l.clearAuto()); assert.equal(l.auto, null); assert.equal(l.locks[1], null);
  assert.deepEqual(l.locks[2], { slice: 3, artic: 1 }); assert.deepEqual(l.locks[3], { start: 0.5, vel: GHOST_VEL }); assert.equal(l.trigs[0].cond, '1:2');
});
test('A4 automates: a curve, or a lock of the key on a step that plays (not the ghost tier)', () => {
  const l = new Lane('hat', { length: 4 }); l.hits[0] = true; l.setTier(1, 'ghost'); l.setLock(2, 'decay', 0.3);
  assert.equal(l.automates('decay'), false, 'a lock on a step without a hit'); assert.equal(l.automates('vel'), false, 'the ghost is a tier');
  l.setLock(0, 'decay', 0.3); assert.ok(l.automates('decay')); l.recordCurve('drive', 0, 0.5); assert.ok(l.automates('drive')); assert.equal(l.automates('pan'), false);
});
test('A2 save format: round trip, independent copies, nothing new on an un-automated lane, loopsPerCycle counts the span', () => {
  const l = laneOf(4); assert.equal('auto' in l.toJSON(), false, 'no curve: the lane saves as it always did');
  l.recordCurve('tone', 0, 0.1, 3, 0.9); l.spanAuto(1); const o = JSON.parse(JSON.stringify(l.toJSON())), b = Lane.from(o);
  assert.deepEqual(b.auto, l.auto); b.recordCurve('tone', 0, 1); assert.notEqual(b.auto.tone, l.auto.tone, 'a loaded lane edits its own curves');
  const j = l.toJSON(); j.auto.loops = 16; assert.equal(l.auto.loops, 2, 'toJSON hands out a copy');
  assert.equal(l.loopsPerCycle(), 2); const m = new Machine(); m.lanes = [l, laneOf(4)]; assert.equal(m.cycleTicks(), 8 * P, 'a 2-loop curve: two loops of 4 beats');
});
test('A2 autoFrom: a hand-edited link cannot break play', () => {
  assert.equal(autoFrom(null), null); assert.equal(autoFrom('x'), null); assert.equal(autoFrom({ loops: 2, len: 4 }), null, 'no curve');
  assert.equal(autoFrom({ loops: 1, len: 4, tone: '....' }), null, 'a curve without points is dropped');
  const a = autoFrom({ loops: 3, len: 4, tone: 'A*B', foo: 'AAAA', level: 7 }); assert.deepEqual([a.loops, a.len, a.tone.length], [4, 4, 128]);
  assert.equal(a.tone.slice(0, 3), 'A.B', 'an unknown char is no point'); assert.equal(a.foo, undefined); assert.equal(a.level, undefined);
  assert.equal(autoFrom({ loops: 99, len: 4, pan: 'A' }).loops, 16); assert.equal(autoFrom({ loops: 99, len: 32, pan: 'A' }).loops, 4, 'the cap halves the span');
  assert.deepEqual([autoFrom({ loops: -2, len: 0, pan: 'A' }).loops, autoFrom({ len: 99, pan: 'A' }).len, autoFrom({ len: 'abc', pan: 'A' }).len], [1, 32, 1]);
  assert.equal(autoFrom({ loops: 1, len: 1, send: 'ABCDEFGHIJKLMNOP' }).send, 'ABCDEFGH', 'cut to its size');
});
test('A2 half-resolution link curves come back at full resolution (the points between: the mean, "." where a side has none)', () => {
  const l = laneOf(4); l.recordCurve('tone', 0, 0, 3, 1); const h = autoHalf(l.auto); assert.equal(h.res, 4); assert.equal(h.tone.length, 16);
  const back = autoFrom(JSON.parse(JSON.stringify(h))); assert.equal(back.tone.length, 32);
  for (let s = 0; s < 3; s += 1 / 8) near(back.tone ? Lane.from({ ...l.toJSON(), auto: back }).autoAt('tone', s) : 0, l.autoAt('tone', s), 1 / 63 + 1e-9, `step ${s}`);
  assert.equal(back.tone[25], '.', 'between a point and a "." : none');
});
// what an un-automated pattern saves and plays, from the code before this phase (fingerprints: sha256 of toJSON and of
// the hits of 4 bars at a fixed roll), for every groove and two older saves
const OLD = { lanes: [
  { name: 'kick', length: 4, ratioIndex: 5, hits: [true, false, true, false], accents: [true], rotation: 0, swing: 0, prob: 1, tune: 0, muted: false, euclidK: 2, sound: { decay: 0.6 }, voice: 'kick', locks: [null, null, { tune: 0.2, nudge: -0.1 }], evolve: true, trigs: [null, null, { cond: '1:2', ratchet: 3, fade: true }] },
  { name: 'snare', length: 4, ratioIndex: 5, hits: [false, true, false, true], accents: [], rotation: 0, swing: 0, prob: 0.8, tune: 0, muted: false, euclidK: 0, sound: {}, voice: 'snare', locks: [], evolve: true, trigs: [] },
  { name: 'hat', length: 8, ratioIndex: 7, hits: [true, true, true, true, true, true, true, true], accents: [], rotation: 1, swing: 0.2, prob: 1, tune: 0, muted: false, euclidK: 8, sound: { tone: 0.4 }, voice: 'hat', locks: [null, { vel: 0.35 }], evolve: true, trigs: [] },
  { name: 'perc', length: 5, ratioIndex: 7, hits: [true, false, true, false, false], accents: [], rotation: 0, swing: 0, prob: 1, tune: 0, muted: false, euclidK: 2, sound: {}, voice: 'perc', locks: [], evolve: true, trigs: [] },
], selected: 0, humanize: 0.3 };
const SIX = { lanes: [
  { name: 'kick', length: 16, ratio: 4, hits: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0].map(Boolean), accents: [true], rotation: 0, swing: 0.15, swingTpl: 'amapiano', offsetMs: 6, velHuman: 0.4, prob: 1, tune: 0, muted: false, euclidK: 0, sound: { decay: 0.4, tone: 0.6, drive: 0.3, send: 0.3, pan: 0.4, level: 0.9 }, voice: 'kick', locks: [{ decay: 0.9, tone: 0.2 }], evolve: true, trigs: [null, null, null, { cond: 'pre', ratchet: 4, curve: 'up', ramp: 0.5 }], mod: { target: 'tone', loops: 2, depth: 0.6 }, tdice: { decay: 0.3 } },
  { name: 'snare', length: 7, ratio: 5 / 4, hits: [0, 1, 0, 1, 1, 0, 1].map(Boolean), accents: [], rotation: 2, swing: 0, prob: 0.7, tune: 0.1, muted: false, euclidK: 4, sound: {}, voice: 'clap', locks: [], evolve: true, trigs: [], euclidMode: 'xor', scale: 'minor' },
  { name: 'hat', length: 12, ratio: 3, hits: Array(12).fill(true), accents: [], rotation: 0, swing: 0.3, swingTpl: 'triplet', prob: 0.9, tune: 0, muted: false, euclidK: 12, sound: {}, voice: 'hat', locks: [], evolve: true, trigs: [], tdice: { tone: 0.5, color: 0.2 } },
  { name: 'perc', length: 5, ratio: 7 / 4, hits: [1, 0, 1, 1, 0].map(Boolean), accents: [false, false, true], rotation: 0, swing: 0, prob: 1, tune: -0.3, muted: false, euclidK: 0, sound: {}, voice: 'conga', locks: [null, null, { artic: 2 }], evolve: true, trigs: [] },
  { name: 'open', length: 8, ratio: 2, hits: [0, 0, 1, 0, 0, 0, 1, 0].map(Boolean), accents: [], rotation: 0, swing: 0, prob: 1, tune: 0, muted: false, euclidK: 0, sound: {}, voice: 'openhat', locks: [], evolve: true, trigs: [], choke: 2 },
  { name: 'cymbal', length: 8, ratio: 1, hits: [true], accents: [true], rotation: 0, swing: 0, prob: 1, tune: 0, muted: false, euclidK: 0, sound: {}, voice: 'sample', locks: [], evolve: true, trigs: [] },
], selected: 2, humanize: 0.1, meter: '7/8', couple: { mode: 'next', amount: 0.4 } };
const BEFORE = { boombap: ['db1b613a003ed68f', '747cf2d992328672'], trap: ['ec9e99e557cdacbe', '79ea2814c8e4623e'], house: ['243ace3ef16276b3', 'aa0390a72c0b9530'], techno: ['82dd668ea024c88d', '00afba4dfacac397'], dnb: ['7d64e18d9a80e242', '766b5ddd90362e0d'], afro: ['7416fa23e316a122', 'f8c05f10c9360f4a'], poly345: ['255dd12c70ecfea0', 'd2317936790222f8'], 'old-v1': ['f99596275818054f', 'd723f42056f1fc13'], six: ['ef4d0a92248b818d', '69292c773c655392'] };
test('A2 old saves and grooves save and play byte-identically (no curve: nothing changed)', () => {
  const h = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
  for (const [key, json, tempo] of [...GROOVES.map(g => [g.key, g.m, g.tempo]), ['old-v1', OLD, 120], ['six', SIX, 133]]) {
    const m = Machine.from(json); assert.deepEqual([h(m.toJSON()), h(collectHits(m, { to: 4 * m.barTicks(), tempo, dice: Dice.take(11) }))], BEFORE[key], key);
    assert.equal(m.lanes.some(l => l.auto), false); assert.deepEqual(autoRamps(m, 0, 4 * m.barTicks()), [], `${key}: no ramps`);
  }
});
test('A1 recorded step values play per hit: collectHits carries each step lock (renders and MIDI read the same hits)', () => {
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const l = m.lanes[0]; l.setLength(4); l.setEuclid(4);
  [0.1, 0.4, 0.7, 1].forEach((v, i) => l.recordStepValue(i, 'decay', v));
  const hits = collectHits(m, { to: 2 * BAR_TICKS, tempo: 120, dice: Dice.take(3) }).filter(h => h.li === 0);
  assert.deepEqual(hits.map(h => h.lock?.decay), [0.1, 0.4, 0.7, 1, 0.1, 0.4, 0.7, 1]); assert.ok(hits.every(h => !('auto' in h)), 'no curve: no auto');
});
test('A2 every hit carries the curves where it sounds (swing and nudge included); a tone lock wins for its hit', () => {
  const l = laneOf(4); l.swing = 0.25; l.recordCurve('tone', 0, 0, 4 - 1 / 8, 1); l.recordCurve('level', 0, 0.5, 4 - 1 / 8, 0.5); l.setLock(2, 'tone', 0.9); l.setLock(3, 'nudge', -0.25);
  const ev = (s) => l.at(s * P, () => 0), hs = (s) => expandHits(ev(s), l, 0, { tickSec: TICK })[0];
  near(hs(1).auto.tone, l.autoAt('tone', 1.25), 1e-12, 'step 2 swung a quarter step late'); near(hs(0).auto.tone, l.autoAt('tone', 0), 1e-12);
  assert.equal(hs(2).auto.tone, undefined, 'the tone lock wins'); assert.equal(hs(2).lock.tone, 0.9); assert.equal(hs(2).auto.level, l.autoAt('level', 2));
  near(hs(3).auto.tone, l.autoAt('tone', 3.25 - 0.25), 1e-12, 'swung and nudged: where it sounds');
  const r = expandHits({ ...ev(0), ratchet: 2 }, l, 0, { tickSec: TICK }); near(r[1].auto.tone, l.autoAt('tone', 0.5), 1e-12, 'each repeat at its own time');
});
test('A3 a hand on a knob (live only) wins over the step\'s lock and the curve; renders never have one', () => {
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const l = m.lanes[0]; l.setLength(4); l.setEuclid(4);
  l.setLock(0, 'decay', 0.2); l.setLock(0, 'tone', 0.2); l.recordCurve('level', 0, 0.3, 3, 0.3); l.setLock(1, 'prob', 0);
  const hand = [{ decay: 0.9, tone: 0.8, level: 0.7, prob: 1 }], out = (t, o = {}) => liveTick(m, t, [], { tickSec: TICK, rng: () => 0.5, ...o })[0];
  const h = out(0, { hand }).hits[0]; assert.deepEqual([h.lock.decay, h.lock.tone, h.auto.level, h.auto.tone], [0.9, 0.8, 0.7, undefined]);
  assert.equal(l.locks[0].decay, 0.2, 'the step\'s own lock is not changed');
  assert.equal(out(P, { hand }).ev.hit, true, 'the hand\'s chance over a 0 % lock'); assert.equal(out(P).ev.hit, false);
  const r = collectHits(m, { to: P, tempo: 120, dice: Dice.take(1) }).find(x => x.li === 0); assert.deepEqual([r.lock.decay, r.auto.level], [0.2, l.autoAt('level', 0)]);
  near(r.auto.level, 0.3, 0.5 / 63, '64 levels');
});
test('A2 the sampler: one call or block by block, the same ramps; chains count each slot from its own origin', () => {
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const a = m.lanes[0], b = m.lanes[2];
  a.setLength(4); a.setEuclid(2); a.recordCurve('tone', 0, 0, 4 - 1 / 8, 1); b.setLength(3); b.setRatio(ratioIndexOf(3 / 2)); b.setEuclid(3); b.recordCurve('pan', 0.5, 0.2, 2.5, 0.8); b.recordCurve('drive', 0, 0.4);
  const all = autoRamps(m, 0, 2 * BAR_TICKS), blocks = []; for (let t = 0; t < 2 * BAR_TICKS; t++) blocks.push(...autoRamps(m, t, t + 1));
  const key = (r) => `${r.t}:${r.li}:${r.k}`, sort = (x) => [...x].sort((p, q) => p.t - q.t || p.li - q.li || p.k.localeCompare(q.k));
  assert.deepEqual(sort(blocks), sort(all)); assert.equal(all.length, (2 * BAR_TICKS / MIDI_DIV) * 3, 'one value per curve per block line');
  assert.ok(all.every(r => r.t % MIDI_DIV === 0)); assert.equal(new Set(all.map(key)).size, all.length);
  near(all.find(r => r.li === 0 && r.t === 2 * P).v, a.autoAt('tone', 2), 1e-12); assert.equal(all.find(r => r.li === 2 && r.k === 'pan' && r.t === 0).v, b.sound.pan, 'no point: the lane value');
  // a chain of two slots, one bar each: the second's curve starts on its own step 1 (restart) or goes on counting (not)
  const A = m.toJSON(), B = (() => { const n = Machine.from(A); n.lanes[0].clearAuto(); n.lanes[0].recordCurve('tone', 0, 1, 1, 0); n.lanes[0].setLength(3); return n.toJSON(); })();
  const at = (rs, t) => rs.find(r => r.li === 0 && r.k === 'tone' && r.t === t).v, Bl = Machine.from(B).lanes[0];
  assert.equal(at(collectChainRamps([A, B], { bars: 1, restart: true }), BAR_TICKS), Bl.autoAt('tone', 0)); assert.equal(Bl.autoAt('tone', 0), 1);
  assert.equal(at(collectChainRamps([A, B], { bars: 1, restart: false }), BAR_TICKS), Bl.autoAt('tone', 4), 'the bar anchor goes on: step 5 of the 3-step lane'); assert.equal(Bl.autoAt('tone', 4), 0);
  assert.equal(at(collectChainRamps([A, B], { bars: 1, restart: false }), BAR_TICKS + P), Bl.sound.tone, 'no point there: the lane value');
});
test('A2 a tone curve is what the V5 modulator moves (timbreLock), not the knob under it', () => {
  const l = laneOf(4); l.setMod({ target: 'tone', loops: 1, depth: 0.4 }); l.sound.tone = 0.9; l.recordCurve('tone', 0, 0.2, 3, 0.2);
  const ev = l.at(P, () => 0), lk = timbreLock(ev, l, 0, null, { tone: 0.2 }); near(lk.tone, 0.2 + ev.mod.d, 1e-12);
  near(expandHits(ev, l, 0, { tickSec: TICK })[0].lock.tone, l.autoAt('tone', 1) + ev.mod.d, 1e-9, 'expandHits passes the curve where the step sounds');
});
test('A2 keys: the curve keys are lane sound keys, the step keys are lock keys', () => {
  assert.deepEqual(AUTO_KEYS, ['tone', 'drive', 'pan', 'send', 'level']); for (const k of ['decay', 'snap', 'color', 'tune', 'prob', 'vel', 'nudge']) assert.ok(LOCK_KEYS.includes(k));
});
