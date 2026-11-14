// ORBIT2-18 parameter automation (docs/design/automation.md): step automation = step locks, curves = lane.auto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Lane, Machine, PPQ as P, MIDI_DIV, BAR_TICKS, AUTO_RES, AUTO_MAX, AUTO_KEYS, LOCK_KEYS, GHOST_VEL, autoFrom, autoHalf, autoChar, ratioIndexOf, RATIOS } from '../src/poly/lanes.js';
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
// Commit 0 (port-back) writes `ratioIndex` in the old 10-entry table so pages from before R2 read links right; the
// fingerprints below were taken before that, with the new-table index: map it back, everything else must be identical.
const asBefore = (j) => ({ ...j, lanes: j.lanes.map(l => { const o = {}; for (const [k, v] of Object.entries(l)) { if (k === 'ratioIndex') continue; o[k] = v; if (k === 'length') o.ratioIndex = RATIOS.findIndex(x => Math.abs(x - l.ratio) < 1e-9); } return o; }) });
test('A2 old saves and grooves save and play byte-identically (no curve: nothing changed)', () => {
  const h = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
  for (const [key, json, tempo] of [...GROOVES.map(g => [g.key, g.m, g.tempo]), ['old-v1', OLD, 120], ['six', SIX, 133]]) {
    const m = Machine.from(json); assert.deepEqual([h(asBefore(m.toJSON())), h(collectHits(m, { to: 4 * m.barTicks(), tempo, dice: Dice.take(11) }))], BEFORE[key], key);
    assert.equal(m.lanes.some(l => l.auto), false); assert.deepEqual(autoRamps(m, 0, 4 * m.barTicks()), [], `${key}: no ramps`);
  }
});
// links made by the page before this phase (encodeShare of two grooves, titled), opened by this one: the same hits
const OLD_LINKS = { boombap: '7ZbBjtMwEIZfBf3n2ZJUabfrJwABN26oB9eZNlYcO0qcwFL13ZGTtgRtEaUSklf0MnLG9nic-f1p9ughUoLnqnYQqyWhgtjDSMstxJc9rKwYAqVWJQiG7c4XECtCI712723O3yDS5PgNMScU2oe9vumYttK0JztxvJiLzK4JUim2ly_yquya0DgfimMhEkL7VdsdRDKbH8efawOBqlYguO22Zf-pHVb2bN51lRy31Y3bjFLpLA-eqvOcQ4xHgTtldP5hPMJ1Ng8yylnJ53DWckHwbtg4WxLyRvdjkNbKOjgXBOWMa47jlkOAZJYuCPWQQfAa7tkMIR4PhN5pFaTZuq0_ydOpMlTMdsZQvGZN4N6Z8AsGbcE3evc68m6dceeaq8KVDPGQElpZ1YYhwrIDnbHRWtnwX3LjN8h44Y7xWf7CjWsvEkHekWJjQo3V_Cc2ZtniVnKspuA4ifN6auxxjJMd7vD41_AopL-l5bjCRPC-ruk2_jiMzMbGjKebkZHNJ8x4SqfQKGTJzb3XiA8XNTfqP-RFBPlEw4zx9d9CjceL1DghI50AI70IjOWZF1NY9No-mzsrYmFFWMeG1SCLhFAE-ejvQ9WTFaHUHgIf3cNWg1Cx5wYC2dsMB4LXPgSCM_mbjXPVRtY4_AA', poly345: '7dfBjtMwEAbgV0H_2ZSkTbvUVy4gxI0b2oNxpq1V2xM5Tpal6rsjJ1XXu0JC7IUE9TJyHHviyJNP8Qk9ZCkQyTUMWRaFgIM8wSpPLeS3E7xyBImj0UcIWPL7eICsBIKKhj_5mn5AlsvL9XDnYGKaG0NHYqdsO8t4L6C0Jv9_vErgmLbHQxYC7YPx-6fW18ZCwjUaArzbtRS_tMPdnuzHzqlxUhP4-1grnaehx3WRasjxQaBOW1N_HtNy5-tURjVp9QhZLNYCkYd5i7u1QB1MPyZpvWouAzRbDpd2SylBsSjXAs2wgtRrqSeb2pvNWaBno_PSZH1Me-U7a8V0w70A9WzT6w9VhRjMfh7rbtnydb_1gY8E-bYUaJVrLEGmYWdxJaP1KlBmxvpmxnziHMzY_NGMKjPj_V1mRjDuRsb0yDiomIGxegFGeQVj9RyMpzCBL-fGxb_hosq82L7yH2OTebHdZl5cCvPmxbS8aCjoDIzlCzCKKxjLKxhj7rl-bc_ImMB6Zm7G6m-OJZvf_2Lk55JtlZnxwFzf0JgKGmkcWdJDcRQCh1RC5ue43UcTIfGBnWMPAUeRAiSqdxXOAtHElAZs6zcN28dVtcb5Fw' };
test('A5 share links from before this phase open and play byte-identically', async () => {
  const { decodeShare } = await import('../src/poly/export.js'), h = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
  for (const [key, link] of Object.entries(OLD_LINKS)) {
    const o = await decodeShare(link), m = Machine.from(o.m); assert.equal(o.title, `old ${key}`); assert.equal(m.lanes.some(l => l.auto), false);
    assert.equal(h(collectHits(m, { to: 4 * m.barTicks(), tempo: o.tempo, dice: Dice.take(11) })), BEFORE[key][1], key);
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
test('A3 / A6 wiring: the clock writes before the tick\'s steps, the hand rides liveTick and skips its curve, a recording gesture is one undo step, gauges and Move touch start gestures', async () => {
  const { readFileSync } = await import('node:fs'), src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8'), app = src('../src/poly/app.js'), gauge = src('../src/gauge.js');
  const at = (re) => app.search(re); assert.ok(at(/if \(knobGest\?\.rec\) autoRecordTick\(t, ts, cut\)/) > 0 && at(/if \(knobGest\?\.rec\) autoRecordTick/) < at(/if \(liveQuiet\(m, t, early/), 'step locks are written before the tick decides its steps');
  assert.match(app, /liveTick\(m, t, early, \{[^}]*hand: handNow \}\)/); assert.match(app, /if \(handNow\?\.\[r\.li\]\?\.\[r\.k\] == null\) rampAuto\(kit/, 'no ramp under a hand');
  assert.match(app, /const save = \(\) => \{ if \(knobGest\?\.rec && !restoring\) \{ knobGest\.dirty = true; return; \}/, 'nothing committed while a gesture records');
  assert.match(app, /if \(g\.wrote \|\| g\.dirty\) \{ if \(here\) applySound\(g\.li\); ownNext = true; save\(\); \}/, 'its end is one step of its own, committed before a load replaces the pattern');
  assert.match(app, /move\.addEventListener\('encoderTouch'/); assert.match(gauge, /onStart\?\.\(v\)/); assert.match(gauge, /onEnd\?\.\(v\)/);
  for (const fn of ['function loadSlot', 'function loadMachine', 'function rollPattern']) assert.match(app.slice(app.indexOf(fn), app.indexOf(fn) + 200), /gestEnd\(true/, `${fn} ends a gesture first`);
  assert.match(app, /const undo = \(\) => \{ gestEnd\(true\); applyState/);
});
// ---- A5 / A7: exports, links, slots ----
const midiOpts = (m, extra = {}) => { const lanes = [36, 38, 42, 39, 46, 49].map(note => ({ note, ch: 10 })).slice(0, m.lanes.length).map((l, i) => ({ ...l, ch: i + 1 })); return { tempo: 120, lanes, map: lanes, names: m.lanes.map(l => l.voice), bars: 2, ...extra }; };
test('A7 MIDI: a lane\'s step values go out as a CC just before each of its notes (the lock, else the lane value), curves as CCs where they change', async () => {
  const { hitsToMidi, autoCCs } = await import('../src/poly/export.js'), { readMidi } = await import('../src/punch/smf.js'), { AUTO_CC } = await import('../src/poly/midiio.js');
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0], h = m.lanes[1];
  k.setLength(4); k.setEuclid(4); k.sound.decay = 0.5; k.recordStepValue(1, 'decay', 1); k.recordStepValue(3, 'decay', 0);
  h.setLength(4); h.setEuclid(1); h.recordCurve('level', 0, 0, 4 - 1 / 8, 1);
  const ticks = 2 * BAR_TICKS, hits = collectHits(m, { to: ticks, tempo: 120, dice: Dice.take(2) }), ccs = autoCCs(m, hits, autoRamps(m, 0, ticks, 0), { tickSec: TICK });
  const f = readMidi(hitsToMidi(hits, { ...midiOpts(m), ccs })), kick = f.tracks[1], snare = f.tracks[2];
  assert.deepEqual(kick.ccs.map(c => [c.t, c.cc, c.v]), kick.notes.map((n, i) => [n.on, AUTO_CC.decay, [64, 127, 64, 0][i % 4]]), 'one decay CC on each kick note: the lock, else the lane value');
  const lv = snare.ccs.filter(c => c.cc === AUTO_CC.level); assert.ok(lv.length > 20 && lv.every((c, i) => !i || (c.v !== lv[i - 1].v && c.t > lv[i - 1].t)), 'level curve: a CC only where the value changes');
  assert.equal(lv[0].t, 0); assert.equal(lv[0].v, 0); assert.ok(lv.some(c => c.v === 127)); assert.equal(snare.ccs.filter(c => c.cc === AUTO_CC.decay).length, 0, 'no decay locks on that lane: no decay CC');
  // the CC comes before the note-on on the same tick (raw track order)
  const bytes = hitsToMidi(hits.filter(x => x.li === 0).slice(0, 1), { ...midiOpts(m), ccs: ccs.filter(c => c.li === 0).slice(0, 1) }), on = bytes.findIndex((b, i) => b === 0x90 && bytes[i + 1] === 36), cc = bytes.findIndex((b, i) => b === 0xB0 && bytes[i + 1] === AUTO_CC.decay);
  assert.ok(cc > 0 && cc < on, 'CC first, then the note');
  const merged = readMidi(hitsToMidi(hits, { ...midiOpts(m), ccs, merge: true })); assert.equal(merged.tracks[1].ccs, undefined, 'one Drum-Rack track: notes only');
  const off = autoCCs(m, hits, autoRamps(m, 0, ticks, 0), { cc: { ...AUTO_CC, decay: 0, level: 0 }, tickSec: TICK }); assert.equal(off.length, 0, 'CC 0 = left out');
});
test('A7 MIDI: a pattern without automation writes the same bytes as before this phase (every groove)', async () => {
  const { hitsToMidi, autoCCs } = await import('../src/poly/export.js'), h = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
  const BEFORE_MIDI = { boombap: '9712f56339a63ab2', trap: '3a4f746f18ec89f6', house: 'c53b46cbbc98c003', techno: '2cca798685985ee2', dnb: 'cbf83a66525c2969', afro: '62702e8c503cf26f', poly345: '14240472560e8428' };
  for (const g of GROOVES) {
    const m = Machine.from(g.m), ticks = 4 * m.barTicks(), hits = collectHits(m, { to: ticks, tempo: g.tempo, dice: Dice.take(5) }), lanes = [36, 38, 42, 39, 46, 49].map(note => ({ note, ch: 10 })).slice(0, m.lanes.length);
    const ccs = autoCCs(m, hits, autoRamps(m, 0, ticks, 0), { tickSec: 60 / g.tempo / P }); assert.equal(ccs.length, 0, g.key);
    assert.equal(h(hitsToMidi(hits, { tempo: g.tempo, lanes, map: lanes, names: m.lanes.map(l => l.voice), bars: 4, meter: m.meter, ccs })), BEFORE_MIDI[g.key], g.key);
  }
});
test('A7 MIDI of a chain: each slot\'s own lanes and curves (collectChainAuto)', async () => {
  const { collectChainAuto, collectChain } = await import('../src/poly/export.js'), { AUTO_CC } = await import('../src/poly/midiio.js');
  const a = new Machine(); a.lanes.forEach(l => l.clear()); a.lanes[0].setLength(4); a.lanes[0].setEuclid(4); a.lanes[0].recordCurve('pan', 0, 0, 3.9, 0);
  const b = Machine.from(a.toJSON()); b.lanes[0].clearAuto(); b.lanes[0].recordStepValue(0, 'snap', 1);
  const { hits, ccs } = collectChainAuto([a.toJSON(), b.toJSON()], { bars: 1, tempo: 120, dice: Dice.take(4), restart: true });
  assert.deepEqual(hits, collectChain([a.toJSON(), b.toJSON()], { bars: 1, tempo: 120, dice: Dice.take(4), restart: true }), 'the same hits as the chain export');
  const bar = BAR_TICKS * TICK, pan = ccs.filter(c => c.cc === AUTO_CC.pan && c.time >= bar); assert.deepEqual(pan.map(c => [c.time, c.v]), [[bar, 64]], 'slot B: the pan curve is slot A\'s; B sets its own lane value once where it comes in'); assert.equal(ccs.filter(c => c.cc === AUTO_CC.snap && c.time >= bar).length, 4, 'slot B: a snap CC on each of its 4 notes');
  assert.deepEqual(ccs.filter(c => c.cc === AUTO_CC.snap && c.time < bar).map(c => c.time), [0], 'slot A has no snap locks: its lane value once, at its start');
});
test('ORBIT2-18 r1: a chain\'s MIDI sets every automated key again where a slot without it comes in (its lane value)', async () => {
  const { collectChainAuto } = await import('../src/poly/export.js'), { AUTO_CC } = await import('../src/poly/midiio.js');
  const a = new Machine(); a.lanes.forEach(l => l.clear()); const k = a.lanes[0]; k.setLength(4); k.setEuclid(4); k.sound.decay = 0.5; k.sound.tone = 0.25; k.recordCurve('tone', 0, 0.2, 3.875, 0.8); k.recordStepValue(0, 'decay', 0.9);
  const b = Machine.from(a.toJSON()); b.lanes[0].clearAuto();
  const { ccs } = collectChainAuto([a.toJSON(), b.toJSON(), a.toJSON()], { bars: 1, tempo: 120, dice: Dice.take(4), restart: true }), bar = BAR_TICKS * TICK;
  const at = (cc, t) => ccs.filter(c => c.cc === cc && Math.abs(c.time - t) < 1e-9).map(c => c.v);
  assert.deepEqual(at(AUTO_CC.tone, bar), [32], 'slot 2 starts its tone at its lane value (0.25)'); assert.deepEqual(at(AUTO_CC.decay, bar), [64], 'and its decay (0.5)');
  assert.equal(ccs.filter(c => c.time > bar && c.time < 2 * bar).length, 0, 'nothing else in slot 2'); assert.equal(at(AUTO_CC.tone, 2 * bar).length, 1, 'slot 3 starts its curve again');
});
test('ORBIT2-18 r1: step CCs only for keys a lane has locks of (Decision 6): a scale-snapped lane without locks sends none; the saved curve keys come in one order', async () => {
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const l = m.lanes[0]; l.setVoice('marimba'); l.setScale('minor'); l.tune = 0.13; l.setLength(4); l.setEuclid(4);
  const hits = collectHits(m, { to: BAR_TICKS, tempo: 120, dice: Dice.take(1) }); assert.ok(hits.some(h => h.lock?.tune != null), 'the scale puts a tune on the hits');
  const { autoCCs } = await import('../src/poly/export.js'); assert.equal(autoCCs(m, hits, [], { tickSec: TICK }).length, 0);
  l.recordStepValue(1, 'tune', 0.5); assert.equal(autoCCs(m, collectHits(m, { to: BAR_TICKS, tempo: 120, dice: Dice.take(1) }), [], { tickSec: TICK }).length, 4, 'with a tune lock: a CC on every note');
  const r = laneOf(4); r.recordCurve('level', 0, 0.5); r.recordCurve('tone', 0, 0.5); assert.deepEqual(Object.keys(r.toJSON().auto), ['loops', 'len', 'tone', 'level']);
  assert.equal(JSON.stringify(Lane.from(JSON.parse(JSON.stringify(r.toJSON()))).toJSON()), JSON.stringify(r.toJSON()), 'a reload saves the same bytes (undo compares them)');
});
test('ORBIT2-18 r2 / r3: the knob is the lane value when not recording; the hand moves its param with exact ramps and hands it back on a line the clock has not scheduled', async () => {
  const { readFileSync } = await import('node:fs'), src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8'), app = src('../src/poly/app.js'), gauge = src('../src/gauge.js');
  const down = gauge.slice(gauge.indexOf("addEventListener('pointerdown'")); assert.ok(down.indexOf('onStart?.(v)') < down.indexOf('drag = {'), 'onStart may move the knob before the drag takes its start');
  assert.match(gauge, /addEventListener\('wheel', \(e\) => \{ e\.preventDefault\(\); prime\?\.\(\);/, 'a wheel step is primed'); assert.match(gauge, /if \(!KEYS\.has\(e\.key\)\) return; prime\?\.\(\);/, 'a key step is primed');
  assert.match(app, /function handPrime\(src, k\) \{ if \(playing && !recKnobs\(\) && !knobGest\?\.rec\) gaugeOf\(src, k\)\?\.set\(Math\.round\(laneValue\(m\.lane, k\) \* 100\)\)/);
  const fn = (name) => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}', app.indexOf(`function ${name}(`)));
  const hf = fn('handFrom'); assert.match(hf, /p\.cancelScheduledValues\(t \+ 1e-4\)/, 'the hand drops what was scheduled after its start: the clock\'s ramps after the one under way, the hits\' values of an older hand');
  assert.equal(hf.match(/return/g).length, 1, 'no way out of handFrom before that cancel');
  assert.doesNotMatch(fn('handGlide') + fn('handFrom') + fn('autoHandoff'), /cancelAndHoldAtTime|RampToValueAtTime/, 'no ramp cut, set on or started on the hand path: setTargets only');
  assert.match(fn('autoHandoff'), /while \(at < start \+ 0\.02\)/, 'the hand-off settles on a block line the clock has not scheduled'); assert.match(fn('rampAuto'), /if \(time <= st\.ev \+ 1e-9\) return;/, 'the clock leaves what a hand-off covers');
  assert.match(app, /if \(playing && recKnobs\(\)\) gestStart\(m\.selected, pk\.k, pk\.kind, \{ touch: true, v: playedValue/, 'not recording, a touch alone changes nothing');
});
test('ORBIT2-18 r1: the Move\'s ◀ ▶ are lit again (paintLeds, not inside a comment)', async () => {
  const { readFileSync } = await import('node:fs'), app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  const line = app.split('\n').find(s => s.includes("move.setButtonColor('left', LANE_DIM[m.selected])")); assert.ok(line);
  assert.ok(!line.includes('//') || line.indexOf('//') > line.indexOf("setButtonColor('right'"), 'the calls come before any comment on the line');
});
test('A5 share links carry curves; over the limit at half resolution, then without curves (locks always kept)', async () => {
  const { encodeShare, encodeShareFit, decodeShare } = await import('../src/poly/export.js');
  const m = new Machine(6); m.lanes.forEach(l => l.clear()); m.lanes[0].setLength(4); m.lanes[0].setEuclid(4); m.lanes[0].recordStepValue(2, 'decay', 0.9); m.lanes[0].recordCurve('tone', 0, 0.1, 3.9, 0.9);
  const back = Machine.from((await decodeShare(await encodeShare(m.toJSON(), 120))).m); assert.deepEqual(back.lanes[0].auto, m.lanes[0].auto); assert.equal(back.lanes[0].locks[2].decay, 0.9);
  assert.equal((await encodeShareFit(m.toJSON(), 120)).curves, 'full');
  // a busy pattern: noisy curves on every lane and key make a long link
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const l of m.lanes) { l.setLength(16); for (const k of AUTO_KEYS) for (let s = 0; s < 16; s += 1 / 8) l.recordCurve(k, s, rnd()); l.spanAuto(1); }
  const full = await encodeShare(m.toJSON(), 120), half = await encodeShareFit(m.toJSON(), 120, {}, full.length - 1), none = await encodeShareFit(m.toJSON(), 120, {}, 200);
  assert.ok(full.length > 4000, `a long link (${full.length})`); assert.equal(half.curves, 'half'); assert.ok(half.code.length < full.length); assert.equal(none.curves, 'none');
  const h = Machine.from((await decodeShare(half.code)).m).lanes[0], n = Machine.from((await decodeShare(none.code)).m).lanes[0];
  assert.equal(h.auto.tone.length, m.lanes[0].auto.tone.length, 'back at full resolution'); for (let s = 0; s < 32; s += 2) near(h.autoAt('tone', s), m.lanes[0].autoAt('tone', s), 1e-9, `kept points at step ${s}`);
  assert.equal(n.auto, null); assert.equal(n.locks[2].decay, 0.9, 'the locks stay');
  const fit = await encodeShareFit(m.toJSON(), 120); assert.ok(fit.code.length <= 4000, 'the default limit holds');
});
test('A5 a slot holds its own copy of the curves; evolve never touches them; a musical roll keeps them and clears the locks', async () => {
  const { SlotBank } = await import('../src/poly/slots.js');
  const m = new Machine(); const l = m.lanes[0]; l.recordCurve('send', 0, 0.3, 2, 0.6); l.recordStepValue(0, 'color', 0.2);
  const bank = new SlotBank(null); bank.save(0, m.toJSON()); l.recordCurve('send', 0, 1, 2, 1); l.auto.loops = 4;
  const s = Machine.from(bank.get(0)).lanes[0]; assert.equal(s.auto.loops, 1); near(s.autoAt('send', 1), 0.45, 1 / 63, 'the slot keeps the curve it was saved with');
  const e = Machine.from(bank.get(0)), before = JSON.stringify(e.lanes.map(x => x.auto)); let seed = 3; const rng = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < 60; i++) e.evolve({ scope: 'all', amount: 1, weights: { rotate: 1, hits: 1, length: 1, ratio: 1, prob: 1, tune: 1 } }, rng);
  assert.equal(JSON.stringify(e.lanes.map(x => x.auto)), before, 'evolve moves length, speed, rotation: never the curves');
  e.randomizeMusical(rng); assert.equal(JSON.stringify(e.lanes.map(x => x.auto)), before, 'a roll keeps the curves (sound stays)'); assert.ok(e.lanes.every(x => x.locks.every(lk => lk == null)), 'and clears the steps with their locks');
});
test('A2 keys: the curve keys are lane sound keys, the step keys are lock keys', () => {
  assert.deepEqual(AUTO_KEYS, ['tone', 'drive', 'pan', 'send', 'level']); for (const k of ['decay', 'snap', 'color', 'tune', 'prob', 'vel', 'nudge']) assert.ok(LOCK_KEYS.includes(k));
});
