// RD-3 the sheet: every drawer and the old right column re-hosted (ids kept) in six tabs, as Greta's feature table maps
// them (proposals/greta/proposal.md "Where every feature goes"). The page is read as text: a tab's pane runs from its
// opening tag to the next pane, and a tag is read by its attributes (in any order), not by how it is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHEET_TABS, sheetFrom, tabMove } from '../src/poly/sheet.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const TABS = ['lane', 'pattern', 'groove', 'perform', 'export', 'setup'];
const sheet = html.slice(html.indexOf('<section id="sheet"'), html.indexOf('</section>', html.indexOf('<section id="sheet"')));   // the sheet's own close (RD-5's console is a section too)
const panes = Object.fromEntries(TABS.map((t, i) => { const a = sheet.indexOf(`id="pane-${t}"`), b = i < TABS.length - 1 ? sheet.indexOf(`id="pane-${TABS[i + 1]}"`) : sheet.length; return [t, sheet.slice(a, b)]; }));
// the opening tags called `name` in a piece of the page: their attributes (a bare one is true) and where the tag ends
const tags = (s, name) => [...s.matchAll(new RegExp(`<${name}\\b((?:[^>"]|"[^"]*")*)>`, 'g'))]
  .map(m => ({ end: m.index + m[0].length, a: Object.fromEntries([...m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(x => [x[1], x[2] ?? true])) }));

test('RD-3 six tabs in order, each a tab with its own pane (only the first shown in the markup)', () => {
  assert.deepEqual(SHEET_TABS, TABS);
  assert.deepEqual(tags(sheet, 'button').filter(t => t.a.role === 'tab').map(t => [t.a.id, t.a['aria-controls'], t.a['aria-selected']]), TABS.map((t, i) => [`tab-${t}`, `pane-${t}`, String(i === 0)]));
  const ps = tags(sheet, 'div').filter(t => t.a.role === 'tabpanel');
  assert.deepEqual(ps.map(t => [t.a.id, t.a['data-sheet'], t.a['aria-labelledby'], !!t.a.hidden]), TABS.map((t, i) => [`pane-${t}`, t, `tab-${t}`, i > 0]));
});

test('RD-3 the 13 drawers all live in the sheet, in the tab Greta\'s table gives them', () => {
  const where = {
    lane: ['lane-drawer'], pattern: ['patterns-drawer', 'lib-drawer'], groove: ['Humanize', 'evolve-drawer', 'evo-sub', 'dice-drawer'],
    perform: ['Record'], export: ['export-drawer'], setup: ['settings-drawer', 'midi-drawer', 'keys-pop', 'nerd'],
  };
  // a drawer by its id, else the evolve sub-drawer by its class, else by its summary's words
  const drawers = (s) => tags(s, 'details').map(t => t.a.id || (String(t.a.class).includes('evo-sub') ? 'evo-sub' : s.slice(t.end).match(/^\s*<summary\b[^>]*>([^<]*)/)?.[1].trim()));
  assert.equal(tags(html, 'details').length, 13, '13 drawers on the page');
  assert.equal(drawers(sheet).length, 13, 'all of them in the sheet');
  for (const t of TABS) assert.deepEqual(drawers(panes[t]), where[t], `tab ${t}`);
});

test('RD-3 the old right column\'s controls: init … clear and the grooves in pattern; what is on stays above the sheet (RD-5: the lane chips are the lane list, randomize an action word)', () => {
  assert.doesNotMatch(html, /id="lane-tabs"/);
  const left = html.slice(html.indexOf('id="col-left"'), html.indexOf('<div class="hud">')), face = html.slice(html.indexOf('id="topbar"'), html.indexOf('</section>', html.indexOf('id="topbar"')));
  assert.match(left, /id="legend"/, 'the lane list heads the left column');
  for (const id of ['btn-play', 'btn-fill', 'btn-latch', 'fx-gauge', 'btn-throw', 'voice-select', 'knobs', 'stepsui', 'btn-undo', 'btn-random', 'btn-jam', 'btn-share', 'btn-all']) assert.match(face, new RegExp(`id="${id}"`), `${id} on the console`);
  for (const id of ['btn-init', 'btn-save', 'btn-load', 'btn-redo', 'btn-tap', 'tempo-gauge', 'btn-wild', 'btn-clear', 'grooves']) assert.match(panes.pattern, new RegExp(`id="${id}"`), id);
  assert.match(panes.setup, /id="live-mode"/); assert.match(panes.setup, /class="wordmark"/);
  for (const id of ['view-mode', 'stress-meter']) assert.match(panes.setup, new RegExp(`id="${id}"`), id);
  const hud = html.slice(html.indexOf('<div class="hud">'), html.indexOf('<section id="sheet"'));
  for (const id of ['welcome', 'quest', 'jam-panel']) assert.match(hud, new RegExp(`id="${id}"`), `${id} above the sheet`);
  assert.doesNotMatch(html, /id="hud-left"|id="hud-bl"/, 'the old columns are gone');
});

test('RD-3 a saved sheet: only a known tab and a true / false open come back; any other value counts as nothing saved', () => {
  for (const bad of [null, '', 'null', '{bad', '"lane"', 'true', '7', '[]', '["lane"]', '{"tab":"zzz","open":"no"}', '{"tab":3,"open":1}']) assert.deepEqual(sheetFrom(bad), {}, `${bad}`);
  assert.deepEqual(sheetFrom('{"tab":"export","open":false}'), { tab: 'export', open: false });
  assert.deepEqual(sheetFrom('{"tab":"setup"}'), { tab: 'setup' });
  assert.deepEqual(sheetFrom('{"open":true,"tab":"nope","x":1}'), { open: true }, 'an unknown tab and stray fields drop');
  // what app.js does next: set open and tab on it and write it back, so it must be a plain object every time
  for (const v of ['"lane"', 'true', '7', '[]', '{"tab":"groove"}']) { const s = sheetFrom(v); s.open = true; s.tab = 'pattern'; assert.equal(JSON.stringify(s).startsWith('{'), true, v); }
});

test('RD-3 tab keys: ← → wrap round the six, Home and End go to the ends, any other key is not the tab row\'s', () => {
  assert.deepEqual([0, 1, 4, 5].map(i => tabMove('ArrowRight', i)), [1, 2, 5, 0]);
  assert.deepEqual([0, 1, 5].map(i => tabMove('ArrowLeft', i)), [5, 0, 4]);
  assert.deepEqual([tabMove('Home', 3), tabMove('End', 2), tabMove('End', 1, 3)], [0, 5, 2]);
  for (const k of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'a']) assert.equal(tabMove(k, 2), -1, k);
});

test('RD-3 one breakpoint, one test: the wide rules are the exact complement of the narrow test, in the CSS and in app.js', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8'), app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  // a zoomed window can be 1100.5 css px wide: (min-width: 1101px) and (max-width: 1100px) both miss it, and the page got
  // no layout at all (rings at 0, 0); `not all and (max-width: 1100px)` is wide exactly when narrow is not
  assert.doesNotMatch(css, /min-width:\s*1101px/);
  const at1100 = [...css.matchAll(/@media([^{]*1100px[^{]*)\{/g)].map(m => m[1].trim().replace(/\s+/g, ' '));
  assert.ok(at1100.length >= 8, `${at1100.length} rules at the breakpoint`);
  for (const q of at1100) assert.ok(q === '(max-width: 1100px)' || q === 'not all and (max-width: 1100px)', q);
  assert.match(app, /const NARROW = matchMedia\('\(max-width: 1100px\)'\)/);
  // the grid: two fixed rows, and a stray in-flow child of the body gets a 0 px implicit row, never a share of the stage's
  assert.match(css, /body\.chaos:has\(#stage\) \{[^}]*grid-template-rows: minmax\(0, 1fr\) var\(--console-h\); grid-auto-rows: 0;/);
});
