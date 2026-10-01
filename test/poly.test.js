import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euclid, Lane, Machine, RATIOS, SOUND_KEYS, DEFAULT_SOUND } from '../src/poly/lanes.js';
import { KITS } from '../src/poly/kits.js';
import { VOICE_KEYS } from '../src/poly/voices.js';

test('euclid spreads hits evenly and starts on a hit', () => {
  assert.deepEqual(euclid(3, 8).map(Number).join(''), '10010010');
  assert.deepEqual(euclid(5, 8).map(Number).join(''), '10101101');
  assert.deepEqual(euclid(2, 5).map(Number).join(''), '10010'); assert.deepEqual(euclid(3, 7).map(Number).join(''), '1001010');
  assert.equal(euclid(0, 7).filter(Boolean).length, 0); assert.equal(euclid(9, 4).filter(Boolean).length, 4);
});
test('lane length, rotation, toggles, accents', () => {
  const l = new Lane('kick', { length: 4 }); l.setEuclid(2); assert.deepEqual(l.hits.slice(0, 4), [true, false, true, false]);
  l.rotation = 1; assert.equal(l.hitAt(0), false); assert.equal(l.hitAt(1), true);
  assert.equal(l.toggle(3), true); assert.equal(l.toggle(9), false, 'beyond length is ignored');
  l.toggleAccent(0); assert.equal(l.accentAt(1), true, 'accents rotate with the hits');
  l.setLength(20); assert.equal(l.length, 16); l.setLength(0); assert.equal(l.length, 1);
});
test('advance walks the lane, respects mute and probability', () => {
  const l = new Lane('hat', { length: 3 }); l.setEuclid(3);
  const out = [0, 1, 2, 3].map(() => l.advance(() => 0.5)); assert.deepEqual(out.map(o => o.index), [0, 1, 2, 0]); assert.ok(out.every(o => o.hit));
  l.prob = 0.3; assert.equal(l.advance(() => 0.9).hit, false); l.prob = 1; l.muted = true; assert.equal(l.advance().hit, false);
  l.swing = 0.25; l.muted = false; l.pos = 1; assert.equal(l.advance().swung, 0.25); assert.equal(l.advance().swung, 0);
});
test('machine: step seconds follow ratio and tempo; cycle length; (de)serialisation', () => {
  const m = new Machine(); const [k, s] = m.lanes; k.setRatio(5); s.setRatio(7); // 1 and 2
  assert.equal(m.stepSeconds(k, 120), 0.5, 'ratio 1 = a quarter note'); assert.equal(m.stepSeconds(s, 120), 0.25, 'ratio 2 = an eighth');
  m.lanes.forEach(l => l.setRatio(5)); m.lanes[0].setLength(4); m.lanes[1].setLength(3); m.lanes[2].setLength(4); m.lanes[3].setLength(4); assert.equal(m.cycleSteps(), 12);
  m.randomize(() => 0.42); const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.deepEqual(copy.toJSON(), m.toJSON()); assert.equal(RATIOS.length, 10);
});

test('per-lane sound params clamp and survive save/load', () => {
  const m = new Machine(); const l = m.lanes[2]; assert.equal(SOUND_KEYS.length, 8);
  assert.equal(l.setSound('drive', 1.7), 1); assert.equal(l.setSound('pan', -2), 0); assert.equal(l.setSound('nope', 0.5), undefined);
  const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(copy.lanes[2].sound.drive, 1); assert.equal(copy.lanes[0].sound.tone, 0.75);
});

test('kits reference real voices and apply without touching patterns', () => {
  for (const [k, kit] of Object.entries(KITS)) { assert.equal(kit.lanes.length, 4, k); for (const l of kit.lanes) { assert.ok(VOICE_KEYS.includes(l.voice), `${k}: ${l.voice}`); for (const sk of Object.keys(l.sound || {})) assert.ok(SOUND_KEYS.includes(sk), `${k}: sound.${sk}`); } }
  const m = new Machine(); m.lanes[0].setEuclid(3); const hits = [...m.lanes[0].hits];
  m.applyKit(KITS.space, DEFAULT_SOUND); assert.equal(m.lanes[1].voice, 'bell'); assert.equal(m.lanes[0].sound.send, 0.4); assert.deepEqual(m.lanes[0].hits, hits); assert.equal(m.kit, 'Space');
  const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(copy.lanes[2].voice, 'blip'); assert.equal(copy.kit, 'Space');
  assert.ok(VOICE_KEYS.length >= 14);
});
