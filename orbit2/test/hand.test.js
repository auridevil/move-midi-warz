// RD-6 the ring answers the hand (DECISION "Rio's 'ring answers the hand'"): which knob shows what on the selected ring,
// the slide's shortest way round, the push in steps, a longer loop's new ticks, and the static half (read-only: the hit
// test never moves; reduced motion; the app's sources; the plate, no echo bubble).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAND_MS, HAND_LOOK, handLook, shortSteps, pushSteps, newTicks, SLIDE_MS } from '../src/poly/scene.js';
import { TOUCH_HOLD_MS } from '../src/poly/pages.js';
import { Lane } from '../src/poly/lanes.js';

test('RD-6 each knob\'s answer: shift slides, hits re-spread, swing, chance, push, length; the rest show nothing', () => {
  assert.deepEqual(Object.fromEntries(['rotation', 'euclid', 'swing', 'prob', 'lock:prob', 'offset', 'length'].map(k => [k, handLook(k)])),
    { rotation: 'slide', euclid: 'spread', swing: 'swing', prob: 'chance', 'lock:prob': 'chance', offset: 'push', length: 'grow' });
  for (const k of ['tempo', 'ratio', 'tune', 'snd:decay', 'lock:tune', 'cond', 'knob', undefined]) assert.equal(handLook(k), null, String(k));
  assert.equal(Object.keys(HAND_LOOK).length, 7);
  assert.equal(HAND_MS, TOUCH_HOLD_MS, 'it stays as long as the row and the peek do after the hand lets go');
  assert.ok(SLIDE_MS <= 200, 'a slide is short: it settles before the next knob click');
});

test('RD-6 a shift slides the shortest way round; a push moves the ring by its share of a step; new ticks pulse', () => {
  assert.equal(shortSteps(0, 1, 16), 1); assert.equal(shortSteps(1, 0, 16), -1);
  assert.equal(shortSteps(15, 0, 16), 1, 'across step 1 it keeps going clockwise'); assert.equal(shortSteps(0, 15, 16), -1);
  assert.equal(shortSteps(0, 8, 16), 8); assert.equal(shortSteps(2, 2, 7), 0); assert.equal(shortSteps(0, 4, 7), -3);
  assert.equal(pushSteps(-30, 120), -0.25, '30 ms early on a 120 ms step: the ring leads by a quarter step');
  assert.equal(pushSteps(60, 120), 0.5); assert.equal(pushSteps(10, 0), 0);
  assert.deepEqual(newTicks(12, 16), [12, 13, 14, 15]); assert.deepEqual(newTicks(16, 12), []); assert.deepEqual(newTicks(4, 4), []);
  // the swing drawn is the model's own: an off-beat lands where Lane.swingAt says it sounds
  const l = new Lane('hat', { length: 16 }); l.swing = 0.5; assert.equal(l.swingAt(0), 0); assert.ok(l.swingAt(1) > 0);
});

test('RD-6 static: read-only, reduced motion, the app\'s hand sources, the halo, the plate (no echo bubble)', () => {
  const scene = readFileSync(new URL('../src/poly/scene.js', import.meta.url), 'utf8'), app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8'), css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  // the hit test is untouched: locate reads the nominal steps, never the hand's offsets
  const loc = scene.slice(scene.indexOf('function locate('), scene.indexOf('function stepXY('));
  assert.doesNotMatch(loc, /hand|slide|push|swing/i);
  // reduced motion: no glide (the trail only), the rings don't grow
  assert.match(scene, /const slideOff = sl && slP < 1 && !reduced \?/);
  assert.match(scene, /reduced \? 4 : spP \* 12/); assert.match(scene, /reduced \? 6 : gwP \* 14/);
  // the frame budget: an idle page still draws nothing (the hand, a held step, an answer fading, one clearing frame)
  assert.match(scene, /&& !hand && !held\.length && !answered && !slides\.some\(Boolean\)/);
  // the app: a Move touch, an untouched turn, a drag on any knob; the held steps for the halo
  assert.match(app, /sceneHand\('move' \+ index, on \? moveKey\(index\) : null\)/);
  assert.match(app, /sceneHand\('turn', moveKey\(index\)\); sceneHand\('turn', null\)/);
  assert.match(app, /addEventListener\('pointerdown', \(e\) => \{ const g = [^\n]*closest\('\.gauge'\); if \(g\) sceneHand\('drag'/);
  assert.match(app, /createScene\(\$\('cv'\), \{ held: \(\) =>/);
  // the touched knob's plate is the lane's colour, in the console; no echo bubble on the canvas (the number is the peek's)
  assert.match(css, /\.knobs > i\.plate \{ background: color-mix\(in srgb, var\(--lane/);
  assert.doesNotMatch(scene, /fillText\([^)]*hand|bubble/i);
});
