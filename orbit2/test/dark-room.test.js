// RD-2 light and type: the dark-room tokens in orbit2/styles.css hold DECISION §1.6 on their own (the face audit then
// measures the page), Major Mono is the wordmark's alone, and the "no layout change" diff of the face audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { positionDiff } from '../tools/face-audit.mjs';

const here = (p) => new URL(p, import.meta.url);
const css = readFileSync(here('../styles.css'), 'utf8'), html = readFileSync(here('../index.html'), 'utf8');
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const mix = (a, p, b) => '#' + rgb(a).map((v, i) => Math.round(v * p + rgb(b)[i] * (1 - p)).toString(16).padStart(2, '0')).join('');
const token = (k) => { const m = css.match(new RegExp(`--${k}: (#[0-9a-f]{6})`)); assert.ok(m, `--${k} is defined`); return m[1]; };
const LANES = JSON.parse(readFileSync(here('../src/poly/app.js'), 'utf8').match(/const LANE_HEX = (\[[^\]]+\])/)[1].replace(/'/g, '"'));

test('RD-2 tokens: --l is the cap, text greys ≥ 4.5:1, border and knob track ≥ 3:1, record red under the cap', () => {
  const v = token('v');
  assert.ok(lum(token('l')) <= 0.475, 'no control pixel above 0.475');
  for (const k of ['l', 'd', 'rec']) assert.ok(ratio(token(k), v) >= 4.5, `--${k} reads on the void`);
  for (const k of ['b', 'track']) assert.ok(ratio(token(k), v) >= 3, `--${k} is an edge`);
  assert.ok(lum(token('rec')) <= 0.475);
});

test('RD-2 lane ink: 80 % of every lane hue over the void is under the cap and reads as text', () => {
  assert.equal(LANES.length, 6);
  assert.match(css, /--ink: color-mix\(in srgb, var\(--lane, var\(--l\)\) 80%, var\(--v\)\)/);
  assert.match(css, /--gk: color-mix\(in srgb, var\(--gc, var\(--l\)\) 80%, var\(--v\)\)/);   // a knob's arc: the same ink
  for (const h of LANES) { const ink = mix(h, 0.8, token('v')); assert.ok(lum(ink) <= 0.475, `${h} ink ${lum(ink)}`); assert.ok(ratio(ink, token('v')) >= 4.5, `${h} ink contrast`); }
  // lit cells: accent (62 %) is the brightest, still under the cap
  for (const h of LANES) assert.ok(lum(mix(h, 0.62, token('v'))) <= 0.475);
});

// Sizes, weights and Major Mono on the page are measured where they render, by the face audit's TYPE gate (computed
// styles of every drawn text, first load and everything shown, four sizes; its rules are tested in face-audit.test.js):
// a stylesheet scan cannot tell the Orbits page's rules from the other pages' blocks this copy carries
test('RD-2 type: the font link has no unused weight, and the canvas captions are not in Major Mono', () => {
  assert.match(html, /family=Major\+Mono\+Display&family=Space\+Grotesk:wght@400;500&/);
  assert.doesNotMatch(readFileSync(here('../src/poly/scene.js'), 'utf8'), /"Major Mono/);
});

test('RD-2 red means recording: of the buttons in the record shape (.rec-btn), only the recorders turn red when armed', () => {
  const RECORDERS = ['btn-rec', 'btn-mic'];   // arm record, the mic take; evolve and locked dice record nothing
  const shaped = [...html.matchAll(/<button id="([\w-]+)" class="[^"]*\brec-btn\b/g)].map(m => m[1]);
  assert.deepEqual(shaped.filter(id => RECORDERS.includes(id)), RECORDERS);
  const plain = css.match(/^([^{\n]*)\{ color: var\(--l\); border-color: var\(--l\); box-shadow: inset 0 0 0 1px var\(--l\); \}/m);
  assert.ok(plain, 'the plain "on" for a record-shaped button');
  for (const id of shaped.filter(id => !RECORDERS.includes(id))) assert.ok(plain[1].includes(`#${id}.armed`), `${id} armed is the plain on, not red`);
  // the record red's only rules: an armed recorder, jam while it records (button, panel, progress); nothing at rest
  const red = css.split('\n').filter(l => /var\(--rec\)/.test(l) && !/^\s*--v:/.test(l)).map(l => l.trim().split(/\s*\{/)[0]);
  assert.deepEqual(red, ['.rec-btn.armed', '.jam-btn.on', '.jam-panel', '.jam-bar i']);
});

test('RD-2 lock knobs: the lane\'s ink, dotted where the step follows the lane (no translucent colour under the track)', () => {
  const app = readFileSync(here('../src/poly/app.js'), 'utf8'), at = app.indexOf('function renderLocks'), locks = app.slice(at, app.indexOf('\n}\n', at));
  assert.doesNotMatch(locks, /setColor\([^)]*rgba\(/, 'no dim rgba: the 80 % toning sank it under the track');
  assert.match(locks, /classList\.toggle\('follows', lk\[k\] == null\)/);
  assert.match(css, /\.gauge\.follows \.g-fill \{ stroke-dasharray: [^;]+; \}/);
});

test('RD-2 no layout change: the position diff matches controls by element, name and order and flags a centre > 2 px off', () => {
  const c = (el, name, x, y, w = 40, h = 32) => ({ el, name, x, y, w, h });
  const base = { sizes: [{ size: '1512x860', controls: { list: [c('button#a', 'play', 10, 10), c('button', 'x', 100, 10), c('button', 'x', 200, 10), c('button#gone', 'old', 0, 0)] } }] };
  const now = { sizes: [{ size: '1512x860', controls: { list: [c('button#a', 'play', 12, 10, 44), c('button', 'x', 100, 13), c('button', 'x', 201, 10), c('button#new', 'peek', 0, 830)] } }, { size: '1280x720', controls: { list: [] } }] };
  const [d, missing] = positionDiff(base, now);
  assert.equal(d.n, 4); assert.equal(d.max, 4);
  assert.deepEqual(d.moved.map(m => m.k), ['button#a|play|0', 'button|x|0']);   // play: 2 px right and 4 px wider = centre 4 px off; the first x 3 px down; the second x 1 px off: kept
  assert.deepEqual(d.gone, ['button#gone|old|0']); assert.deepEqual(d.added, ['button#new|peek|0']);
  assert.ok(missing.missing);
});
