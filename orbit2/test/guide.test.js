// RD-14 the hands-on guide: docs/GUIDE.md is the one source; the "guide" tab of the "?" dialog is generated from it
// (tools/build-guide.mjs). Here: the generated block is in sync, the shape every use case keeps, the tab's wiring, and
// ⌘K finding each use case by its title and by a "how do I …" phrase. The browser walk is tools/guide-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderGuide, parseGuide, withGuide, slug } from '../tools/build-guide.mjs';
import { GUIDE_HOW, entry, search } from '../src/poly/find.js';
import { QUESTS } from '../src/poly/quests.js';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const md = read('../docs/GUIDE.md'), html = read('../index.html'), app = read('../src/poly/app.js');
const secs = parseGuide(md).filter(s => s.id !== 'guide-intro');
const cases = secs.filter(s => /^\d+\. /.test(s.title));

test('the guide in index.html is generated from GUIDE.md (run: node orbit2/tools/build-guide.mjs)', () => {
  assert.equal(withGuide(html, md), html, 'GUIDE.md changed: run node orbit2/tools/build-guide.mjs');
});

test('the guide has first five minutes (12 lines) and the ten use cases in order, each with its parts', () => {
  assert.equal(secs[0].title, 'First five minutes'); assert.equal((secs[0].html.match(/<li>/g) || []).length, 12);
  assert.deepEqual(cases.map(s => s.title.match(/^\d+/)[0]), Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const s of cases) {
    const at = ['<b>Goal.</b>', '<b>You need:</b>', '<table class="gtable guide-steps">', '<b>If it doesn\'t:</b>', '<b>Go further:</b>'].map(k => s.html.indexOf(k));
    assert.ok(at.every(i => i >= 0) && at.every((i, j) => !j || i > at[j - 1]), `${s.title}: parts missing or out of order`);
    assert.equal((s.html.match(/<th scope="col">/g) || []).length, 2, `${s.title}: two columns`);
    assert.equal((s.html.match(/<td>/g) || []).length % 2, 0, `${s.title}: every row has both cells`);
    assert.equal((s.html.match(/<li>/g) || []).length, 2, `${s.title}: "if it doesn't" has two slips`);
    const far = s.html.slice(s.html.indexOf('<b>Go further:</b>')), links = (far.match(/<a href=/g) || []).length;
    assert.ok(links === 1 || (links === 0 && (far.match(/<b>/g) || []).length >= 2), `${s.title}: one link to the next case, or a sheet tab`);
  }
});

test('section ids are guide-<slug> and every link in the guide lands on one', () => {
  const ids = new Set(secs.map(s => s.id)); assert.equal(ids.size, secs.length);
  for (const s of cases) assert.equal(s.id, 'guide-' + slug(s.title.replace(/^\d+\.\s*/, '')));
  for (const m of md.matchAll(/\]\(#(guide-[a-z0-9-]+)\)/g)) assert.ok(ids.has(m[1]), `link to ${m[1]}`);
});

test('"show me" in the guide names a real quest, and the button reuses the quest\'s ghost gesture', () => {
  for (const m of md.matchAll(/\(show me: ([^)]+)\)/g)) assert.ok(QUESTS.some(q => q.title === m[1] && q.show), `quest "${m[1]}" with a show()`);
  assert.match(renderGuide(md), /class="small guide-show" data-quest="three-four"/);
  assert.match(app, /function showMe\(q = currentQuest\(quests\.done\)\)/); assert.match(app, /\$\('quest-show'\)\.onclick = \(\) => showMe\(\)/);
});

test('the guide tab follows the keys & Move pattern and adds nothing to the main screen (A5)', () => {
  assert.match(html, /role="tab" id="htab-guide" aria-controls="hpane-guide" aria-selected="false" tabindex="-1">guide</);
  assert.match(html, /role="tabpanel" id="hpane-guide" aria-labelledby="htab-guide" hidden/);
  assert.match(app, /HELP_TABS = \['keys', 'move', 'guide'\]/);
  const out = html.slice(0, html.indexOf('<dialog id="help"')) + html.slice(html.indexOf('</dialog>', html.indexOf('<dialog id="help"')));
  assert.ok(!/guide/i.test(out.replace(/<!--[\s\S]*?-->/g, '')), 'no guide control outside the help dialog');
  assert.ok(!/<(script|iframe|style|img)\b/i.test(renderGuide(md)), 'the generated block is plain text and tables');
});

test('⌘K: every section has a "how do I" phrase and is found by its title and by that phrase, below a real control of the name', () => {
  assert.deepEqual(Object.keys(GUIDE_HOW).sort(), secs.map(s => s.id).sort());
  const index = secs.map(s => Object.assign(entry({ key: s.id, name: s.title, where: 'help · guide', action: true, weak: true, extra: 'how do i ' + GUIDE_HOW[s.id] }), { guide: s.id }));
  for (const s of secs) {
    assert.equal(search(index, s.title)[0]?.key, s.id, `title: ${s.title}`);
    assert.equal(search(index, 'how do i ' + GUIDE_HOW[s.id])[0]?.key, s.id, `how do i ${GUIDE_HOW[s.id]}`);
  }
  const stems = entry({ key: 'exp-stems', name: 'export stems', where: 'export', action: true });
  assert.equal(search([...index, stems], 'stems')[0].key, 'exp-stems');
  assert.equal(search([...index, stems], 'export stems')[0].key, 'exp-stems');
  assert.match(app, /h\.guide[\s\S]{0,260}openHelp\('guide', h\.guide\)/);
});
