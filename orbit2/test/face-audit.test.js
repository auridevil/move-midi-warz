// RD-1 face audit (orbit2/tools/face-audit.mjs): the pure parts. The thresholds of A1 / A5 / A6 / A7 judged on a report,
// the A9 render diff and fingerprint (a 1-LSB wobble keeps the fingerprint, a level change does not), the WAV reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdicts, THRESHOLDS, pcm16, pcmDiff, fingerprint, holdFrames } from '../tools/face-audit.mjs';
import { encodeWav } from '../src/unasm/wav.js';

const state = (o = {}) => ({ scroll: { scrollHeight: 860, innerHeight: 860, pageScrolls: false, inner: [] }, rings: { cx: 756, cy: 358, R: 330, outer: 315, diameter: 630, lanes: 4 }, ...o });
const size = (s, o = {}) => ({ size: s, errors: [], controls: { visible: 48, total: 60, dom: 120 }, controls6: { visible: 56, scroll: state().scroll },
  text: { n: 40, min: 6, fails: [] }, edges: { n: 48, min: 3.1, fails: [] }, light: { stopped: { controlMax: 0.4, canvasMax: 0.9 }, playing: { controlMax: 0.45, canvasMax: 1 } },
  states: { default: state(), drawers: state(), focus: state(), playing: state() }, ...o });
const report = (over = {}) => ({ sizes: ['1512x860', '1512x982', '1280x720', '390x844m'].map(s => size(s, over[s] || {})) });

test('RD-1 face audit: a page that meets the decision passes every threshold', () => {
  assert.deepEqual(verdicts(report()), []);
});

test('RD-1 face audit: each threshold fails on its own (A1 text, edge, light; A5; A6 page and inner scroll; A7 rings)', () => {
  const one = (o) => verdicts(report(o)).map(f => `${f.test} ${f.size}`);
  assert.deepEqual(one({ '1280x720': { text: { n: 1, min: 3.2, fails: [{ contrast: 3.2 }] } } }), ['A1 1280x720']);
  assert.deepEqual(one({ '390x844m': { edges: { n: 1, min: 2, fails: [{ edge: 2 }] } } }), ['A1 390x844m']);
  assert.deepEqual(one({ '1512x860': { light: { stopped: { controlMax: 0.5, canvasMax: 0.9 } } } }), ['A1 1512x860']);
  assert.deepEqual(one({ '1512x860': { light: { stopped: { controlMax: 0.4, canvasMax: 0.4 } } } }), ['A1 1512x860'], 'the canvas must be brighter than every control');
  assert.deepEqual(one({ '1512x982': { light: { stopped: { controlMax: 0.9, canvasMax: 1 } } } }), [], 'A1 is judged at 1512×860, 1280×720 and 390×844');
  assert.deepEqual(one({ '1512x860': { controls: { visible: THRESHOLDS.controls + 1, total: 60, dom: 120 } } }), ['A5 1512x860']);
  assert.deepEqual(one({ '1280x720': { controls: { visible: 90, total: 60, dom: 120 } } }), [], 'A5 counts at 1512×860');
  assert.deepEqual(one({ '1512x860': { controls6: { visible: THRESHOLDS.controlsWorst + 1, scroll: state().scroll } } }), ['A5 1512x860']);
  assert.deepEqual(one({ '1512x982': { states: { default: state(), drawers: state({ scroll: { scrollHeight: 990, innerHeight: 982, pageScrolls: true, inner: [] } }) } } }), ['A6 1512x982']);
  assert.deepEqual(one({ '1280x720': { states: { default: state({ scroll: { scrollHeight: 720, innerHeight: 720, pageScrolls: false, inner: [{ el: 'div.hud', sheet: false }] } }) } } }), ['A6 1280x720']);
  assert.deepEqual(one({ '1280x720': { states: { default: state({ scroll: { scrollHeight: 720, innerHeight: 720, pageScrolls: false, inner: [{ el: 'div#sheet', sheet: true }] } }) } } }), [], 'the sheet may scroll inside');
  assert.deepEqual(one({ '390x844m': { states: { default: state({ scroll: { scrollHeight: 3000, innerHeight: 844, pageScrolls: true, inner: [] } }) } } }), [], 'A6 is desktop only');
  assert.deepEqual(one({ '1512x860': { states: { default: state(), focus: state({ rings: { cx: 726, cy: 358, R: 330, outer: 315 } }) } } }), ['A7 1512x860']);
  assert.deepEqual(one({ '1512x860': { states: { default: state(), focus: state({ rings: { cx: 756.3, cy: 358.2, R: 330, outer: 315.1 } }) } } }), [], 'to the pixel');
});

test('RD-1 A9: the WAV reader, the render diff, and a fingerprint that a 1-LSB wobble keeps and a 1 dB change moves', () => {
  const n = 44100, ch = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { const env = Math.exp(-(i % 11025) / 2000); ch[0][i] = Math.sin(i * 0.05) * 0.5 * env; ch[1][i] = Math.sin(i * 0.031) * 0.4 * env; }
  const a = pcm16(encodeWav(ch, 44100, { bits: 16 })); assert.equal(a.length, 2 * n);
  const b = a.slice(); for (let i = 1000; i < 1050; i++) b[i * 7] += 1;
  assert.deepEqual(pcmDiff(a, a), { samples: 0, maxLsb: 0, firstSec: null });
  const d = pcmDiff(a, b); assert.equal(d.samples, 50); assert.equal(d.maxLsb, 1); assert.equal(d.firstSec, Math.round(7000 / 2 / 44100 * 1e4) / 1e4);
  assert.equal(fingerprint(a).hash, fingerprint(b).hash, '1-LSB wobble: same fingerprint');
  const loud = a.map(x => Math.round(x * 1.122)); assert.notEqual(fingerprint(a).hash, fingerprint(loud).hash, '+1 dB: another fingerprint');
  assert.equal(fingerprint(a).windows, 50);
  // the channels count: left and right swapped, or one channel's polarity flipped, is another sound
  const swap = a.slice(), flip = a.slice(); for (let i = 0; i < a.length; i += 2) { swap[i] = a[i + 1]; swap[i + 1] = a[i]; flip[i + 1] = -a[i + 1]; }
  assert.notEqual(fingerprint(swap).hash, fingerprint(a).hash, 'L/R swap'); assert.notEqual(fingerprint(flip).hash, fingerprint(a).hash, 'polarity of one channel');
});

test('RD-1 A9: frames held during a render wait and are handed back, so a loop that re-asks every frame keeps drawing', async () => {
  const real = [], win = { requestAnimationFrame(cb) { real.push(cb); return real.length; } }, own = win.requestAnimationFrame;
  let drawn = 0; const loop = () => { drawn++; win.requestAnimationFrame(loop); };
  win.requestAnimationFrame(loop);
  const frame = () => real.splice(0).forEach(cb => cb());   // the browser draws one frame
  const out = await holdFrames(win, async () => { frame(); frame(); return 'rendered'; });   // the render: frames come, none is called
  assert.equal(out, 'rendered'); assert.equal(win.requestAnimationFrame, own, 'the real one is back');
  assert.equal(drawn, 1, 'held during the render'); assert.equal(real.length, 1, 'the loop\'s next frame was handed back');
  frame(); frame(); assert.equal(drawn, 3, 'and it keeps drawing');
  await assert.rejects(holdFrames(win, async () => { throw new Error('render failed'); })); assert.equal(win.requestAnimationFrame, own);
});
