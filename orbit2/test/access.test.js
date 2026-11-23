// RD-10 phone, access and clean-up: the canvas as one tab stop after the console (play stays the page's first stop),
// the phone rules in the CSS, and zero orphan ids in index.html (the acceptance of the phase). The page is read as
// text, as test/sheet.test.js reads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const url = (p) => new URL(p, import.meta.url);
const html = readFileSync(url('../index.html'), 'utf8');
const css = readFileSync(url('../styles.css'), 'utf8');
const app = readFileSync(url('../src/poly/app.js'), 'utf8');

test('RD-10 the canvas is one tab stop: role application, after the console, before the columns', () => {
  const cv = html.match(/<canvas id="cv"[^>]*>/)?.[0];
  assert.ok(cv, 'the canvas is on the page');
  assert.match(cv, /tabindex="0"/); assert.match(cv, /role="application"/);
  assert.match(cv, /aria-roledescription="orbit"/, 'Yuki: aria-roledescription orbit');
  assert.match(cv, /aria-describedby="cv-keys"/, 'its keys are described');
  assert.match(html, /id="cv-keys" class="sr-only"/);
  // Tab order (DECISION): play first, then the console in Move order, then the canvas, then the columns
  const at = (s) => html.indexOf(s);
  assert.ok(at('id="btn-play"') > at('id="topbar"'), 'play is in the console');
  assert.ok(at('id="btn-play"') < at('id="voice-select"') && at('id="voice-select"') < at('id="knobs"') && at('id="knobs"') < at('id="stepsui"') && at('id="stepsui"') < at('id="btn-undo"'), 'the console in Move order: transport, the lane, knobs, cells, actions');
  assert.ok(at('<canvas id="cv"') > at('id="btn-all"'), 'the canvas follows the console');
  assert.ok(at('<canvas id="cv"') < at('id="col-left"') && at('<canvas id="cv"') < at('id="legend"'), 'and comes before the columns');
  // no focusable element precedes the console (play is the page's first Tab)
  const before = html.slice(html.indexOf('<body'), at('id="topbar"'));
  assert.doesNotMatch(before, /<(button|canvas|a |input|select|textarea)/, 'nothing focusable before the console');
  // the app walks it: ↑↓ the lane, ←→ the steps, Enter the planet-tap cycle, the white focus ring, the spoken line
  for (const want of ["cv.addEventListener('keydown'", 'cvHalo', 'canvasTap(m.selected', 'focus: true']) assert.ok(app.includes(want), want);
});

test('RD-10 the phone (≤ 760): lane dots, the console as play + bar·beat + knobs + cells, the peek placed on narrow windows', () => {
  const phone = css.slice(css.indexOf('/* phone */'));
  assert.match(phone, /\.lane-list \.lane-tab \{ width: 44px; min-width: 44px; min-height: 44px;/, 'a lane dot is a 44 px target (ORBIT2-03/14)');
  assert.match(phone, /\.lane-list \.lane-m \{ display: none; \}/, 'the M lamps leave the phone face');
  assert.match(phone, /#btn-fill, body:has\(#sheet\) #btn-latch, body:has\(#sheet\) #btn-throw, body:has\(#sheet\) #fx-gauge, body:has\(#sheet\) \.console \.acts \{ display: none; \}/, 'the console strips to play + bar·beat + knobs + cells');
  assert.doesNotMatch(css, /\.peek \{ display: none !important; \}/, 'the peek is no longer dropped on narrow windows');
  assert.match(css, /@media \(max-width: 1100px\) \{ \.peek \{ position: fixed;/, 'RD-10 places the peek over the canvas');
  // the simple / everything switch is gone from the CSS and the app
  assert.doesNotMatch(css, /body\.simple/); assert.doesNotMatch(app, /setView|quests\.view/);
});

test('RD-10 zero orphan ids: every id in index.html is used by the code, the styles, the page itself, a tool or a test', () => {
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  // where an id may be used: the source and styles, tools and tests, and the page's own reference attributes
  const dir = (d, ext) => readdirSync(url(d)).filter(f => f.endsWith(ext)).map(f => readFileSync(url(`${d}/${f}`), 'utf8')).join('\n');
  const corpus = [dir('../src/poly', '.js'), dir('../src', '.js'), dir('../tools', '.mjs'), dir('../test', '.js'), css].join('\n');
  const refs = [...html.matchAll(/(?:aria-controls|aria-labelledby|aria-describedby|for|data-folded-into)="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/));
  const DYNAMIC = ['pg-rhythm', 'pg-sound'];   // built as $('pg-' + t) (renderPage; pg-step is also literal)
  const orphans = ids.filter(id => !corpus.includes(id) && !refs.includes(id) && !DYNAMIC.includes(id));
  assert.deepEqual(orphans, [], 'ids nothing refers to');
});
