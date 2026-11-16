// RD-1 face audit (orbit2/tools/face-audit.mjs): the pure parts. The thresholds of A1 / A5 / A6 / A7 judged on a report,
// the A9 render diff and fingerprint (a 1-LSB wobble keeps the fingerprint, a level change does not), the WAV reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdicts, THRESHOLDS, pcm16, pcmDiff, fingerprint, holdFrames, typeCheck, positionDiff, layoutChanged, hueKind } from '../tools/face-audit.mjs';
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

test('RD-3 face audit A6: a panel its column cuts off fails (sideways at all; the sheet only past its body\'s bottom padding)', () => {
  const one = (clip) => verdicts(report({ '1280x720': { states: { default: state(), pills: state({ scroll: { ...state().scroll, clip } }) } } })).map(f => `${f.test} ${f.size} ${f.what}`);
  // what the audit's clipped() hands over: the round-1 jam take 24 px past the column's left edge; the sheet 11 px into its 16 px padding
  assert.match(one([{ el: 'div#jam-panel', x: 24, y: 0, pad: 0, cut: true }])[0], /^A6 1280x720 pills: cut off by its column: div#jam-panel 24 px sideways/);
  assert.deepEqual(one([{ el: 'section#sheet', x: 0, y: 11, pad: 16, cut: false }]), []);
  assert.equal(one([{ el: 'section#sheet', x: 0, y: 30, pad: 16, cut: true }]).length, 1, 'past the padding: a row of the sheet is out of reach');
});

test('RD-7 face audit PILLS: six pills keep the sheet ≥ 340 px under the last one and draw at most 4 (wide windows only)', () => {
  const pl = (o = {}) => ({ on: 6, drawn: 4, more: '+2 more ▾', sheet: 450, sheetTop: 142, pillsBottom: 132, wide: true, ...o });
  const one = (o) => verdicts(report(o)).map(f => `${f.test} ${f.size}`);
  assert.deepEqual(one({ '1280x720': { pills: pl() } }), []);
  assert.deepEqual(one({ '1280x720': { pills: pl({ sheet: THRESHOLDS.pillSheet - 1 }) } }), ['PILLS 1280x720']);
  assert.deepEqual(one({ '1512x860': { pills: pl({ drawn: 6, more: '' }) } }), ['PILLS 1512x860']);
  assert.deepEqual(one({ '1512x982': { pills: pl({ sheetTop: 100 }) } }), ['PILLS 1512x982'], 'the sheet comes under the pills, never over them');
  assert.deepEqual(one({ '390x844m': { pills: pl({ sheet: 0, wide: false }) } }), [], 'the phone\'s sheet is a bottom sheet');
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

test('RD-2 TYPE: three sizes under 40 px, 400 / 500, 300 only from 40 px, Major Mono only in the wordmark', () => {
  const run = (o) => ({ el: 'span', family: 'Space Grotesk', size: 13, weight: 400, mark: false, ...o });
  const ok = [run({ size: 11 }), run({ size: 13, weight: 500 }), run({ size: 15 }), run({ family: 'ui-monospace', size: 11 }), run({ size: 64, weight: 300 }), run({ el: 'a', family: 'Major Mono Display', size: 15, mark: true })];
  assert.deepEqual(typeCheck(ok).fails, []);
  const why = (o) => typeCheck([run(o)]).fails.map(f => f.what.split(': ').pop());
  assert.deepEqual(why({ size: 12 }), ['size 12 px']); assert.deepEqual(why({ size: 11.5 }), ['size 11.5 px']); assert.deepEqual(why({ size: 14 }), ['size 14 px']);
  assert.deepEqual(why({ weight: 700 }), ['weight 700']); assert.deepEqual(why({ size: 64, weight: 700 }), ['weight 700'], 'nothing heavier than 500, big or small');
  assert.deepEqual(why({ weight: 300 }), ['weight 300 under 40 px']);
  assert.deepEqual(why({ family: 'Major Mono Display', size: 11 }), ['Major Mono outside the wordmark'], 'the canvas captions and labels too');
  const t = typeCheck([run({ size: 12 }), run({ size: 12 }), run({ size: 13 })]);
  assert.equal(t.fails.length, 1); assert.equal(t.fails[0].n, 2, 'one kind, counted'); assert.deepEqual(t.sizes, { 'Space Grotesk 12': 2, 'Space Grotesk 13': 1 });
  // the verdicts: TYPE at any size, HIT where an action word's 40 px hit area misses
  const one = (o) => verdicts(report(o)).map(f => `${f.test} ${f.size}`);
  assert.deepEqual(one({ '1512x982': { type: t } }), ['TYPE 1512x982']);
  assert.deepEqual(one({ '1512x860': { hits: [{ el: 'button#btn-fill', w: 82, h: 32, ok: true, miss: [] }] } }), []);
  assert.deepEqual(one({ '1280x720': { hits: [{ el: 'button#btn-undo', w: 58, h: 32, ok: false, miss: [[2, -4, 'div']] }] } }), ['HIT 1280x720']);
});

test('RD-2 HUE: greys, a lane colour over the void at any amount, record red apart, anything else stray', () => {
  const V = [12, 9, 25], LANES = [[240, 171, 252], [103, 232, 249], [253, 224, 71], [167, 139, 250], [134, 239, 172], [253, 186, 116]], REC = [255, 107, 120];
  const mix = (c, p) => c.map((x, i) => Math.round(x * p + V[i] * (1 - p)));
  for (const g of [[184, 180, 199], [141, 136, 158], [110, 105, 130], [12, 9, 25], [139, 132, 168]]) assert.equal(hueKind(g, LANES, REC, V), 'grey', `${g}`);
  for (const l of LANES) for (const p of [1, 0.8, 0.62, 0.45, 0.22]) { const c = mix(l, p); assert.ok(['lane', 'grey'].includes(hueKind(c, LANES, REC, V)), `${l} at ${p}: ${c}`); }
  assert.equal(hueKind(mix(LANES[3], 0.8), LANES, REC, V), 'lane'); assert.equal(hueKind(mix(LANES[1], 0.22), LANES, REC, V), 'lane', 'a ghost cyan cell');
  assert.equal(hueKind(REC, LANES, REC, V), 'rec'); assert.equal(hueKind(mix(REC, 0.8), LANES, REC, V), 'rec');
  assert.equal(hueKind([203, 92, 111], LANES, REC, V), 'stray', 'the accent knob\'s rose (#fb7185 at 80 %), round 2');
  assert.equal(hueKind([94, 234, 212], LANES, REC, V), 'stray', 'the old --ok teal is no lane');
  assert.equal(hueKind([59, 130, 246], LANES, REC, V), 'stray', 'a blue that is no lane');
  assert.equal(hueKind([38, 26, 74], LANES, REC, V), 'lane', 'a dim purple is the purple lane, 19 % over the void');
  const one = (o) => verdicts(report(o)).map(f => `${f.test} ${f.size}`);
  assert.deepEqual(one({ '390x844m': { hues: [{ el: 'path', prop: 'stroke', rgb: [203, 92, 111], kind: 'stray' }] } }), ['HUE 390x844m']);
  assert.deepEqual(one({ '1512x860': { hues: [] } }), []);
});

test('RD-2 no layout change: every drawn control in page px when both sides have it; gone and new fail like a move', () => {
  const c = (el, name, x, y, w = 40, h = 32) => ({ el, name, x, y, w, h });
  const base = { sizes: [{ size: '390x844m', controls: { list: [c('a', 'home', 18, 10)], drawn: [c('a', 'home', 18, 10), c('summary', 'library', 16, 900, 358, 32), c('button#quest-skip', 'skip', 200, 1100)] } }] };
  const fell = { sizes: [{ size: '390x844m', controls: { list: [c('a', 'home', 18, 10), c('button#quest-skip', 'skip', 200, 830)], drawn: [c('a', 'home', 18, 10), c('summary', 'library', 16, 880, 358, 32), c('button#quest-skip', 'skip', 200, 1080)] } }] };
  const d = positionDiff(base, fell);
  assert.equal(d[0].basis, 'drawn'); assert.deepEqual(d[0].moved.map(m => [m.k, m.dy]), [['summary|library|0', -20], ['button#quest-skip|0', -20]], 'below the fold counts');
  assert.ok(layoutChanged(d));
  const inView = positionDiff({ sizes: [{ size: '390x844m', controls: { list: base.sizes[0].controls.list } }] }, fell);
  assert.equal(inView[0].basis, 'visible'); assert.deepEqual(inView[0].moved, []); assert.deepEqual(inView[0].added, ['button#quest-skip|0']);
  assert.ok(layoutChanged(inView), 'a control that came into view is a change too');
  assert.ok(!layoutChanged(positionDiff(base, base)));
  assert.ok(layoutChanged(positionDiff({ sizes: [] }, fell)), 'a size the baseline lacks cannot pass');
});

test('RD-2 no layout change, everything shown: a control gone from a drawer fails, a move there is listed, an id is itself', () => {
  const c = (el, name, x, y, w = 40, h = 32) => ({ el, name, x, y, w, h });
  const first = [c('a', 'home', 18, 10)], all = [c('a', 'home', 18, 10), c('div', 'accent above', 30, 400), c('summary', 'Evolve', 30, 470, 300, 32), c('input#dice-seed', '2451', 30, 900)];
  const base = { sizes: [{ size: '1512x860', controls: { list: first, drawn: first, all } }] };
  const now = (list) => ({ sizes: [{ size: '1512x860', controls: { list: first, drawn: first, all: list } }] });
  const lost = positionDiff(base, now([all[0], c('summary', 'Evolve', 30, 406, 300, 32), c('input#dice-seed', '1403', 30, 836)]));   // round 2: a knob's line lost its append
  assert.deepEqual(lost[0].all.gone, ['div|accent above|0']); assert.equal(lost[0].all.moved.length, 2); assert.deepEqual(lost[0].all.added, [], 'a seed field with another value is the same field');
  assert.ok(layoutChanged(lost));
  const reflow = positionDiff(base, now([all[0], all[1], c('summary', 'Evolve', 30, 473, 300, 32), c('input#dice-seed', '9', 30, 900)]));
  assert.equal(reflow[0].all.moved.length, 1); assert.ok(!layoutChanged(reflow), 'inside a drawer a move is listed, not a gate (the gate is the first load)');
});

// ---- RD-3 every control id of the RD-1 baseline ----
test('RD-3 the RD-1 baseline\'s control ids: 62, each once, and every one still named in the page or the code that builds it', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { baselineIds } = await import('../tools/face-audit.mjs');
  const ids = baselineIds(JSON.parse(readFileSync(new URL('../docs/redesign/baseline/rd01-controls.json', import.meta.url), 'utf8')));
  assert.equal(ids.length, 62); assert.equal(new Set(ids).size, ids.length);
  for (const id of ['btn-play', 'btn-help', 'btn-connect', 'lib-name', 'btn-rec', 'exp-wav', 'exp-all', 'btn-midi-enable', 'voice-select', 'btn-mute', 'btn-random', 'btn-focus']) assert.ok(ids.includes(id), id);
  // exists: an id="…" in the page, or one of the few the app mounts itself: today's seed chip and the groove chips
  // (`groove-${g.key}` for each groove in grooves.js). Only those may be missing from the page: a static id that was
  // deleted can't pass by being named somewhere in the code
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const code = readdirSync(new URL('../src/poly/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => readFileSync(new URL(`../src/poly/${f}`, import.meta.url), 'utf8')).join('\n');
  const mounted = (id) => id === 'seed-today' ? code.includes(`.id = 'seed-today'`) : id.startsWith('groove-') && code.includes('.id = `groove-${g.key}`') && code.includes(`key: '${id.slice(7)}'`);
  for (const id of ids) assert.ok(page.includes(`id="${id}"`) || mounted(id), `${id} is still in the page`);
  assert.deepEqual(ids.filter(id => !page.includes(`id="${id}"`)).sort(), ['seed-today', ...ids.filter(id => id.startsWith('groove-'))].sort(), 'only the mounted ids are missing from the markup');
});

test('RD-3 face audit IDS: an id gone, or not drawn with its tab open, fails; drawn on the face or in a tab passes', async () => {
  const { baselineIds } = await import('../tools/face-audit.mjs');
  assert.deepEqual(baselineIds({ sizes: [{ controls: { list: [{ el: 'button#a' }, { el: 'summary' }], drawn: [{ el: 'button#a' }, { el: 'input#b' }], all: [{ el: 'select#c' }] } }, { controls: { list: [{ el: 'button#d' }] } }] }), ['c', 'a', 'b', 'd']);
  const ok = [{ id: 'btn-play', exists: true, tab: null, drawn: true }, { id: 'exp-wav', exists: true, tab: 'export', drawn: true }];
  const ids = (reach) => verdicts(report({ '1512x860': { reach } })).filter(f => f.test === 'IDS').map(f => f.what);
  assert.deepEqual(ids(ok), []);
  assert.match(ids([...ok, { id: 'btn-x', exists: false, drawn: false }])[0], /^1 RD-1 control ids gone or not drawn.*btn-x \(gone\)/);
  assert.match(ids([...ok, { id: 'lib-name', exists: true, tab: 'pattern', drawn: false }])[0], /lib-name \(tab pattern\)/);
});
