// RD-9: the "?" overlay — the Move drawn with the current page's meanings (moveface.js), the Move table moved into
// help's second tab byte for byte, F mode keeping state, and the night tokens' wiring. The page is read as text
// (as sheet.test.js reads it); contrast and the rendered drawing are measured in the browser by the face audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KNOB_WORDS, knobWords, CELL_WORDS, PAD_WORDS, drawMoveHelp } from '../src/poly/moveface.js';

const here = (p) => new URL(p, import.meta.url);
const html = readFileSync(here('../index.html'), 'utf8'), css = readFileSync(here('../styles.css'), 'utf8');
const pane = (id) => { const a = html.indexOf(`id="${id}"`); return html.slice(a, html.indexOf('</div>', html.indexOf('</table>', a))); };

test('RD-9 the knob words are the Move table\'s', () => {
  // the table (help's Move tab) is the source of truth: knobs 1–4, 5–7, 8, and the Shift row
  const row = (th) => { const o = `<th>${th}</th><td>`, a = html.indexOf(o); assert.ok(a >= 0, `row ${th}`); return html.slice(a + o.length, html.indexOf('</td>', a)).replace(/<[^>]+>/g, ''); };
  assert.deepEqual(KNOB_WORDS.rhythm.slice(0, 4), row('Knobs 1–4').split(' · ').map(s => s.trim()));
  assert.deepEqual(KNOB_WORDS.rhythm.slice(4, 7), row('Knobs 5–7').split(' · ').map(s => s.trim()));
  assert.equal(KNOB_WORDS.rhythm[7], 'tempo');
  assert.deepEqual(KNOB_WORDS.sound, row('Shift + knobs').replace(/^sound of the selected lane: /, '').split(' · ').map(s => s.trim()));
  // a held step: knobs 1–7 its locks (the table's words), knob 8 its condition, repeats while Shift holds it too
  assert.deepEqual(KNOB_WORDS.step.slice(0, 7).join(' · '), 'tune · prob · velocity · decay · tone · snap · color');
  assert.equal(knobWords('step', 'condition')[7], 'condition');
  assert.equal(knobWords('step', 'repeats')[7], 'repeats');
  assert.equal(knobWords('rhythm', 'tempo')[7], 'tempo');
  assert.equal(knobWords('nonsense')[7], 'tempo', 'an unknown row falls back to rhythm');
});

test('RD-9 drawMoveHelp: every meaning on its control, by page', () => {
  for (const [row, cells] of [['rhythm', 'steps'], ['sound', 'steps'], ['step', 'loops'], ['rhythm', 'slots']]) {
    const svg = drawMoveHelp({ row, cells, word: row });
    for (const w of KNOB_WORDS[row]) assert.ok(svg.includes(`>${w}</text>`), `${row}: ${w}`);
    assert.ok(svg.includes(CELL_WORDS[cells]?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') ?? ''), `${row}: cells ${cells}`);
  }
  const svg = drawMoveHelp({ row: 'step', row8: 'repeats', cells: 'loops', word: 'step 5 · held on Move' });
  assert.ok(svg.includes('>repeats</text>'), 'Shift + held step: knob 8 = repeats');
  assert.ok(svg.includes('step 5 · held on Move'), 'the display names the page as the console does');
  assert.ok(/aria-hidden="true"/.test(svg), 'decoration: the table beside it is read instead');
  for (let s = 1; s <= 16; s++) assert.ok(svg.includes(`>${s}</text>`), `step number ${s}`);
  assert.ok(svg.includes(PAD_WORDS.live), 'pads in live mode');
  assert.ok(drawMoveHelp({ live: false }).includes(PAD_WORDS.edit), 'pads in editing mode');
  // the plate under the pad words is 360 px of 13 px type (~6.7 px a glyph): a line longer than ~50 runs off it
  for (const [k, w] of Object.entries(PAD_WORDS)) assert.ok(w.length <= 50, `pad words (${k}) fit their plate: ${w.length} glyphs`);
});

test('RD-9 round 1: the knobs wear the words the console gives (its own gauges), the table\'s only as a fallback', () => {
  const knobs = (svg) => [...svg.matchAll(/data-knob="(\d)">([^<]*)</g)].map(m => [+m[1], m[2]]);
  // the simple view (a first visit) says hits / shift / speed / chance on the console: the drawing says the same
  const simple = ['length', 'hits', 'shift', 'speed', 'swing', 'chance', 'tune', 'tempo'];
  assert.deepEqual(knobs(drawMoveHelp({ row: 'rhythm', words: simple })), simple.map((w, k) => [k + 1, w]));
  const full = ['length', 'euclid hits', 'rotation', 'speed ×', 'swing', 'probability', 'tune', 'tempo'];
  assert.deepEqual(knobs(drawMoveHelp({ row: 'rhythm', words: full })).map(x => x[1]), full);
  assert.deepEqual(knobs(drawMoveHelp({ row: 'step', row8: 'repeats', words: [...KNOB_WORDS.step.slice(0, 6), 'x7', 'repeats'] })).map(x => x[1])[6], 'x7', 'whatever the console says, as given');
  // no words (or not eight): the Move table's
  assert.deepEqual(knobs(drawMoveHelp({ row: 'sound' })).map(x => x[1]), KNOB_WORDS.sound);
  assert.deepEqual(knobs(drawMoveHelp({ row: 'sound', words: ['a', 'b'] })).map(x => x[1]), KNOB_WORDS.sound);
  assert.ok(drawMoveHelp({ words: ['<b>', '', '', '', '', '', '', ''] }).includes('>&lt;b&gt;</text>'), 'a word is escaped');
});

test('RD-9 round 1: Capture and Delete say what a tap does by live mode; Duplicate as the table names it', () => {
  const live = drawMoveHelp({ live: true }), edit = drawMoveHelp({ live: false });
  assert.ok(live.includes('>hold: randomize</text>') && live.includes('>hold: clear lane</text>'), 'live mode: a tap does nothing (P1), a hold or ⇧ acts');
  assert.ok(!live.includes('>randomize</text>') && !live.includes('>clear lane</text>'));
  assert.ok(edit.includes('>randomize</text>') && edit.includes('>clear lane</text>'), 'editing: at once');
  assert.ok(live.includes('>Duplicate</text>') && !live.includes('>Copy</text>'), 'the Move table says "Hold Duplicate + step"');
  assert.ok(html.includes('<th>Hold Duplicate + step</th>'), 'that row is in the table');
});

test('RD-9 the drawing wears only the mf- classes (tokens in styles.css): no colour or size of its own', () => {
  const svg = drawMoveHelp({});
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,6}|rgb|style=|font-size|fill="[^n]|stroke=/, 'colours and sizes come from styles.css');
  for (const c of ['mf-body', 'mf-box', 'mf-pad', 'mf-plate', 'mf-word', 'mf-small', 'mf-dim', 'mf-big']) {
    assert.ok(svg.includes(c), `class ${c} used`);
    assert.ok(css.includes(`.${c}`), `class ${c} styled`);
  }
  // the type scale (TYPE gate measures it rendered): 11 / 13 / 15, nothing else, weight 500 only on the page word
  assert.match(css, /\.mf-word { fill: var\(--l\); font-size: var\(--t-m\); }/);
  assert.match(css, /\.mf-big { fill: var\(--l\); font-size: var\(--t-l\); font-weight: 500; }/);
  const meanings = drawMoveHelp({ row: 'rhythm', word: '<sound> & "steps"' });
  assert.ok(meanings.includes('&lt;sound&gt; &amp; "steps"'), 'the page word is escaped');
});

test('RD-9 help has two tabs: the keys (unchanged), the Move (the drawing over the full table)', () => {
  const help = html.slice(html.indexOf('<dialog id="help"'), html.indexOf('</dialog>', html.indexOf('<dialog id="help"')));
  assert.match(help, /role="tablist"/);
  assert.match(help, /id="htab-keys" aria-controls="hpane-keys" aria-selected="true"/);
  assert.match(help, /id="htab-move" aria-controls="hpane-move" aria-selected="false" tabindex="-1"/);
  assert.match(help, /<div role="tabpanel" id="hpane-keys"/); assert.match(help, /<div role="tabpanel" id="hpane-move"[^>]*hidden/);
  // the keys tab keeps the keyboard help (must not regress)
  for (const th of ['Space', 'F', '?', 'Esc', 'knobs', 'rings', 'steps', 'slots']) assert.ok(pane('hpane-keys').includes(`<th>${th}</th>`), `keys row ${th}`);
  // the Move table moved whole: its rows live in the Move tab now, none in the sheet
  const move = pane('hpane-move');
  assert.ok(move.includes('id="move-draw"'), 'the drawing above the table');
  for (const th of ['Live mode', 'Hold step + knob 8', 'Hold a step', 'Capture', 'Wheel', 'Hold +', 'Volume']) assert.ok(move.includes(`<th>${th}</th>`), `Move row ${th}`);
  assert.equal((move.match(/<tr>/g) || []).length, 35, 'all 35 rows of the Move table');
  assert.ok(!html.includes('keys-pop'), 'the setup drawer is gone');
});

test('RD-9 F mode hides controls, never state (styles.css): pills and peek stay, console/legend/Move pill/"?"/sheet go', () => {
  assert.match(css, /body\.focus-mode #topbar { visibility: hidden; }/, 'the console by visibility (the grid keeps its cell: A7)');
  assert.match(css, /body\.focus-mode #legend, body\.focus-mode \.hud-top, body\.focus-mode #sheet { display: none !important; }/);
  assert.doesNotMatch(css, /body\.focus-mode [^{]*(?<![-\w])\.hud(?![-\w])[^{]*{[^}]*display: none/, 'the right column stays (the pills)');
  assert.doesNotMatch(css, /body\.focus-mode [^{]*#col-left[^{]*{[^}]*display: none/, 'the left column stays (the peek)');
  assert.doesNotMatch(css, /body\.focus-mode[^{]*#pills[^{]*{[^}]*display: none/, 'every pill stays');
  // app.js: focus leaves only what hides (the pills keep theirs)
  const app = readFileSync(here('../src/poly/app.js'), 'utf8');
  assert.ok(app.includes(`a?.closest('#topbar, #legend, .hud-top, #sheet')`), 'the blur list matches what hides');
});
