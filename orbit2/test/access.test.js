// RD-10 phone, access and clean-up: the canvas as one tab stop after the console (play stays the page's first stop),
// the phone rules in the CSS, and zero orphan ids in index.html (the acceptance of the phase). The page is read as
// text, as test/sheet.test.js reads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { canvasKey, canvasStep, PAD_COLS, MovePages } from '../src/poly/pages.js';

const url = (p) => new URL(p, import.meta.url);
const html = readFileSync(url('../index.html'), 'utf8');
const css = readFileSync(url('../styles.css'), 'utf8');
const app = readFileSync(url('../src/poly/app.js'), 'utf8');

test('RD-10 the canvas focus keys (pages.js canvasKey): ↑↓ the lane, ←→ the step, both wrapping', () => {
  const lens = [4, 16, 3, 32];
  assert.deepEqual(canvasKey({ li: 0, step: 0 }, 'ArrowDown', lens), { li: 1, step: 0 });
  assert.deepEqual(canvasKey({ li: 0, step: 0 }, 'ArrowUp', lens), { li: 3, step: 0 }, 'up from the first lane wraps to the last');
  assert.deepEqual(canvasKey({ li: 3, step: 5 }, 'ArrowDown', lens), { li: 0, step: 5 });
  assert.deepEqual(canvasKey({ li: 1, step: 15 }, 'ArrowRight', lens), { li: 1, step: 0 }, 'past the last step: the first');
  assert.deepEqual(canvasKey({ li: 1, step: 0 }, 'ArrowLeft', lens), { li: 1, step: 15 }, 'before the first: the last');
  assert.deepEqual(canvasKey({ li: 0, step: 2 }, 'Enter', lens), { li: 0, step: 2 }, 'any other key leaves it');
});

test('RD-10 the canvas focus keeps its step through a shorter lane (round 1: step 20 of 32, ↓, ↑ was 16 of 32)', () => {
  const lens = [32, 16], down = canvasKey({ li: 0, step: 19 }, 'ArrowDown', lens);
  assert.equal(canvasStep(down.step, lens[down.li]), 15, 'it stands on the shorter lane\'s last step');
  const up = canvasKey(down, 'ArrowUp', lens);
  assert.deepEqual(up, { li: 0, step: 19 }, 'back on the long lane: step 20 again');
  // a real move from where it stands resets the wish: → on the 16-step lane goes from 16 to 1
  assert.deepEqual(canvasKey(down, 'ArrowRight', lens), { li: 1, step: 0 });
  assert.equal(canvasStep(7, 3), 2); assert.equal(canvasStep(-1, 3), 0); assert.equal(canvasStep(0, 1), 0);
});

test('RD-10 the cells follow the canvas focus: step 20 turns them to 17–32 (Yuki), and following comes back on blur', () => {
  const lanes = [{ length: 32 }], pg = new MovePages(), lane = { length: 32, shown: 3 };
  pg.pin(Math.floor(19 / PAD_COLS), lanes);
  assert.equal(pg.stepFirst(lane, true), 16, 'step 20 → the cells show 17–32');
  // app.js cvShow / blur: the page before the focus ({ follow, pad }) is put back unless something else pinned one
  for (const k of ['cvPinned ??= { follow: pages.follow, pad: pages.pad }', "cv.addEventListener('blur'", 'pages.follow = was.follow']) assert.ok(app.includes(k), k);
});

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
  // round 1: the controls the phone's console leaves out move into the sheet (T1: every one reachable by touch), the
  // same nodes, and go back on wider windows; only "all ⌘K" is off the phone (the dock is the way into the sheet)
  assert.match(app, /const PHONE = matchMedia\('\(max-width: 760px\)'\)/);
  const hosts = app.match(/const PHONE_HOSTS = \[(.*)\];/)?.[1] ?? '';
  for (const [el, host, pane] of [['btn-fill', 'ph-perform', 'perform'], ['btn-latch', 'ph-perform', 'perform'], ['fx-gauge', 'ph-perform', 'perform'], ['btn-throw', 'ph-perform', 'perform'], ['.console .acts', 'ph-acts', 'perform'], ['voice-select', 'ph-voice', 'lane'], ['move-status', 'ph-move', 'setup']]) {
    assert.ok(hosts.includes(`'${el}'), '${host}'`), `${el} → ${host}`);
    const at = html.indexOf(`id="${host}"`), paneAt = html.lastIndexOf('role="tabpanel"', at);
    assert.ok(at > 0 && html.slice(paneAt, at).includes(`data-sheet="${pane}"`), `${host} is in Sheet → ${pane}`);
  }
  assert.match(phone, /\.ph-host #btn-all \{ display: none; \}/);
  assert.doesNotMatch(phone, /#btn-fill, body:has\(#sheet\) #btn-latch[^{]*\{ display: none; \}/, 'nothing is merely hidden any more');
  assert.match(css, /\.ph-host:empty \{ display: none; \}/, 'the hosts draw nothing on wider windows');
  // A6 at 390×844: one row for play + bar·beat and the cells' header, the pills' line beside "?", no scrollbar under it
  assert.match(phone, /\.console \.tgroup \{ position: absolute;/); assert.match(phone, /\.hud \{ flex-direction: row;/);
  assert.match(phone, /\.pills \{[^}]*scrollbar-width: none;/);
  assert.doesNotMatch(css, /\.peek \{ display: none !important; \}/, 'the peek is no longer dropped on narrow windows');
  assert.match(css, /@media \(max-width: 1100px\) \{ \.peek \{ position: fixed;/, 'RD-10 places the peek over the canvas');
  // the simple / everything switch is gone from the CSS and the app
  assert.doesNotMatch(css, /body\.simple/); assert.doesNotMatch(app, /setView|quests\.view/);
});

test('RD-10 hidden quests have a way back (round 1: the removed switch was the only one)', () => {
  const settings = html.slice(html.indexOf('id="settings-drawer"'), html.indexOf('</details>', html.indexOf('id="settings-drawer"')));
  assert.match(settings, /<button id="quests-show"[^>]*hidden>show the quests again<\/button>/, 'Sheet → setup → settings, hidden until quests are');
  assert.match(app, /setHidden\(\$\('quests-show'\), !\(q && quests\.hidden\)\)/, 'shown while a quest is left and the quests are hidden');
  assert.match(app, /\$\('quests-show'\)\.onclick = \(\) => \{[^}]*quests\.hidden = false; saveQuests\(\); renderQuest\(\);/);
  assert.match(html, /id="quest-x"[^>]*title="Hide quests \(progress is kept; Sheet → setup → settings shows them again\)"/);
});

/** Comments out: an id named only in a comment is still an orphan (RD-10 round 1, architect). */
const strip = (s, kind) => kind === 'html' ? s.replace(/<!--[\s\S]*?-->/g, ' ') : kind === 'css' ? s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  : s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The ids of `page` nothing refers to: a real reference is the id quoted whole ($('x'), getElementById("x"), '#x'), a
 *  selector `#x` not running on into a longer name, or the page's own reference attributes. Not a substring of a class
 *  (`.lane-face` is not `#lane-face`), of a longer id, of a comment, or this test's own words. */
function orphanIds(page, code, styles) {
  page = strip(page, 'html'); code = strip(code, 'js'); styles = strip(styles, 'css');
  const ids = [...page.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  const refs = new Set([...page.matchAll(/(?:aria-controls|aria-labelledby|aria-describedby|for|data-folded-into|list|form)="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  const used = (id) => new RegExp(`['"\`]#?${esc(id)}['"\`]`).test(code) || new RegExp(`#${esc(id)}(?![\\w-])`).test(code + styles) || refs.has(id);
  return { ids, orphans: ids.filter(id => !used(id)) };
}

test('RD-10 zero orphan ids: every id in index.html is used by the code, the styles, the page itself, a tool or a test', () => {
  // where an id may be used: the source and styles, tools and tests (not this one), and the page's own references
  const dir = (d, ext, skip = '') => readdirSync(url(d)).filter(f => f.endsWith(ext) && f !== skip).map(f => readFileSync(url(`${d}/${f}`), 'utf8')).join('\n');
  const code = [dir('../src/poly', '.js'), dir('../src', '.js'), dir('../tools', '.mjs'), dir('../test', '.js', 'access.test.js')].join('\n');
  const { ids, orphans } = orphanIds(html, code, css);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  const DYNAMIC = ['pg-rhythm', 'pg-sound'];   // built as $('pg-' + t) (renderPage; pg-step is also literal)
  assert.deepEqual(orphans.filter(id => !DYNAMIC.includes(id)), [], 'ids nothing refers to');
});

test('RD-10 the orphan scan sees what a substring match missed (round 1: lane-face, page-tabs were used only as classes)', () => {
  const page = '<div id="lane-face" class="lane-face"><b id="real"></b><i id="noted"></i><u id="step"></u></div>';
  const code = "$('real'); // the 'noted' one is only named in a comment\nconst s = '#step-2';", styles = '.lane-face { } /* #noted */';
  assert.deepEqual(orphanIds(page, code, styles).orphans, ['lane-face', 'noted', 'step'], 'a class, a comment, a longer id are no use');
  assert.deepEqual(orphanIds('<a id="x"></a><label for="x"></label>', '', '').orphans, [], 'a label for it is a use');
});
