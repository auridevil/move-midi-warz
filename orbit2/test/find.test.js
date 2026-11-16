// RD-4 find and one Escape: the pure half (src/poly/find.js) and what app.js reads it with. The index on the page is
// built from the DOM (app.js buildFindIndex); the browser check (orbit2/tools/find-check.mjs) holds it to every labelled
// control Chrome's accessibility tree names. Here: the synonyms, the ranking, the recents, the Esc order, and the
// static guards (every action is a button on the page, the selector covers every interactive role the page uses).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SYNONYMS, ACTIONS, FIND_DEFAULTS, FIND_UNASKED, RECENTS_MAX, ESC_ORDER, words, entry, search, recentsFrom, pushRecent, opensFind, escStep } from '../src/poly/find.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
const src = ['../src/ui.js', '../src/gauge.js', '../src/poly/app.js'].map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n') + html;

// the names the page gives these controls (read off orbit2/index.html at 1512×860 with __poly.findIndex()), in both views
// (I7: simple says hits / shift / speed / chance on the lane knobs, everything the technical words; app.js gives each
// lane knob its everything word as an alias, so "rotation" is the shift knob in both)
const lane = 'lane · Lane 1 · kick', weights = 'groove · how often each change', touches = 'groove · Evolve · touches';
const KNOBS = ['length', 'euclid hits', 'rotation', 'speed ×', 'probability', 'tune', 'push / pull', 'vel humanize', 'swing'], PLAIN = { 1: 'hits', 2: 'shift', 3: 'speed', 4: 'chance' };
const page = (simple) => [
  ...KNOBS.map((all, i) => ({ key: `knob-${i}`, name: (simple && PLAIN[i]) || all, alias: all, where: lane })),
  { key: 'snd-level', name: 'level', where: `${lane} · sound` },
  ...Array.from({ length: 16 }, (_, i) => ({ key: `step-${i}`, name: `step ${i + 1}`, where: `${lane} · steps` })),
  ...['AND', 'XOR'].map(name => ({ key: `mask-${name}`, name, where: `${lane} · euclid mask` })),
  ...['hits', 'rotation', 'speed', 'chance'].map(n => ({ key: `w-${n}`, name: `${n} weight`, where: weights })),
  ...[['+ hits', '+h'], [simple ? 'shift' : 'rotation', 'tr']].map(([name, k]) => ({ key: `t-${k}`, name, where: touches })),
  ...['4/4', '3/4', '5/4', '6/8', '7/8', '12/8'].map(name => ({ key: `meter-${name}`, name, where: 'pattern · Patterns · meter' })),
  { key: 'tempo', name: 'tempo', where: 'transport' },
  { key: 'exp-dry', name: 'dry stems', where: 'export · Export' },
  { key: 'kit-select', name: 'kit (all lanes)', where: lane, extra: '808 909 acoustic' },
  ...Object.entries(ACTIONS).map(([key, [name, extra]]) => ({ key, name, where: key.startsWith('exp-') ? 'export · Export' : '', action: true, extra })),
].map(entry);

test('RD-4 the synonyms test: euclid, rotation, ratio, probability, stems, 7/8 each find their control, in both views', () => {
  for (const simple of [true, false]) {
    const idx = page(simple), top = (q, n = 1) => search(idx, q).slice(0, n).map(e => e.key);
    assert.deepEqual(top('euclid'), ['knob-1'], 'euclid → the hits knob');
    assert.deepEqual(top('ratio'), ['knob-3'], 'ratio → the speed knob');
    assert.deepEqual(top('probability'), ['knob-4'], 'probability → the chance knob');
    assert.deepEqual(top('stems'), ['exp-stems'], 'stems → export stems (the action before the dry stems switch)');
    assert.deepEqual(top('7/8'), ['meter-7/8'], '7/8 → the meter');
    // simple view: an evolve weight is named "rotation weight", and the knob named "shift" still comes first (its alias
    // is its whole name)
    assert.deepEqual(top('rotation'), ['knob-2'], `rotation → the shift knob (${simple ? 'simple' : 'everything'})`);
  }
});

test('RD-4 a beginner\'s plain words: louder, slower, faster, start over', () => {
  for (const simple of [true, false]) {
    const idx = page(simple), top = (q) => search(idx, q)[0]?.key;
    assert.equal(top('louder'), 'snd-level'); assert.equal(top('quiet'), 'snd-level');
    assert.equal(top('slower'), 'tempo'); assert.equal(top('faster'), 'tempo');
    assert.equal(top('start over'), 'btn-init');
    assert.equal(top('shift'), 'knob-2', 'the plain word finds the knob in everything too');
  }
  // an alias is found as the name but never shown: the list says what the page says
  const e = entry({ key: 'k', name: 'shift', alias: 'rotation' });
  assert.equal(e.name, 'shift'); assert.deepEqual(e.own, ['shift', 'rotation']);
});

test('RD-4 the keys that open find: ⌘K / Ctrl+K but not from a text field, / but not from a text field or a select', () => {
  const k = (key, mods = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  for (const at of ['', 'select']) { assert.ok(opensFind(k('k', { metaKey: true }), at), `⌘K ${at}`); assert.ok(opensFind(k('K', { ctrlKey: true }), at), `Ctrl+K ${at}`); }
  assert.ok(opensFind(k('/'))); assert.ok(!opensFind(k('/'), 'select'), '/ is type-ahead in a select');
  for (const e of [k('k', { metaKey: true }), k('k', { ctrlKey: true }), k('/')]) assert.ok(!opensFind(e, 'text'), 'a text field owns its keys');
  for (const e of [k('k'), k('k', { metaKey: true, shiftKey: true }), k('k', { ctrlKey: true, altKey: true }), k('/', { metaKey: true }), k('/', { altKey: true }), k('?')]) assert.ok(!opensFind(e), JSON.stringify(e));
});

test('RD-4 A4\'s search part: "stems" in under five keys (/ s t Enter), and the knob before "tap tempo"', () => {
  const idx = page(true);
  assert.equal(search(idx, 'st')[0].key, 'exp-stems', '/ s t Enter: 4 keys');
  assert.equal(search(idx, 'tempo')[0].key, 'tempo', 'the whole name wins');
  assert.equal(search(idx, 'bpm')[0].key, 'tempo', 'a one-word synonym of the whole name too');
  assert.equal(search(idx, 'export stems')[0].key, 'exp-stems', 'several words: every one must fit');
  assert.deepEqual(search(idx, 'zzzz'), [], 'nothing by that name');
  assert.equal(search(idx, '909')[0].key, 'kit-select', 'a select is found by its options');
});

test('RD-4 ranking: name before synonym before where; ties go to actions, then recents, then the shorter name', () => {
  const e = (key, name, o = {}) => entry({ key, name, ...o });
  const idx = [e('near', 'other', { where: 'euclid' }), e('syn', 'hits'), e('own', 'euclid mode')];
  assert.deepEqual(search(idx, 'euclid').map(x => x.key), ['own', 'syn', 'near']);
  const tie = [e('a', 'step 1'), e('b', 'step 2'), e('c', 'stems', { action: true })];
  assert.deepEqual(search(tie, 'st').map(x => x.key), ['c', 'a', 'b'], 'the action first');
  assert.deepEqual(search(tie, 'step', ['b']).map(x => x.key), ['b', 'a'], 'a recent before page order');
  assert.equal(search([e('l', 'longer name xx'), e('s', 'name')], 'name')[0].key, 's');
  assert.equal(search(Array.from({ length: 20 }, (_, i) => e(`k${i}`, `step ${i}`)), 'step').length, 8, 'eight at most');
});

test('RD-4 the words: lower case, accents and symbols dropped, 7/8 and 1:3 kept whole', () => {
  assert.deepEqual(words('⤓ Stems (.zip)'), ['stems', 'zip']);
  assert.deepEqual(words('meter 7/8 · plays 1:3'), ['meter', '7/8', 'plays', '1:3']);
  assert.deepEqual(words('speed ×4 Déjà'), ['speed', '4', 'deja']);
  assert.deepEqual(words(null), []);
  // every group is at least two words, no word twice in a group, and a one-word member keys at most a couple of groups
  for (const g of SYNONYMS) { assert.ok(g.length >= 2, g.join()); assert.equal(new Set(g).size, g.length, g.join()); }
});

test('RD-4 an empty search: the recents first, then the defaults; recents survive any saved value', () => {
  const idx = page(true);
  assert.deepEqual(search(idx, '').map(e => e.key), FIND_DEFAULTS);
  // RD-7: nothing destructive offered unasked (a stray click under the field stopped the music in Vera's run)
  for (const k of FIND_UNASKED) assert.ok(!FIND_DEFAULTS.includes(k), k);
  assert.equal(search(idx, 'play')[0]?.key, 'btn-play', 'still one word away');
  assert.deepEqual(search(idx, '  ', ['tempo', 'gone', 'btn-play']).slice(0, 3).map(e => e.key), ['tempo', 'btn-play', 'exp-all'], 'a recent no longer on the page drops');
  for (const bad of [null, '', '{', '"x"', '7', '{"a":1}', '[1,null,{}]']) assert.deepEqual(recentsFrom(bad), [], String(bad));
  assert.deepEqual(recentsFrom('["a","b","a","",3,"c"]'), ['a', 'b', 'c']);
  let r = []; for (const k of ['a', 'b', 'c', 'a', 'd', 'e', 'f', 'g']) r = pushRecent(r, k);
  assert.deepEqual(r, ['g', 'f', 'e', 'd', 'a', 'c']); assert.equal(r.length, RECENTS_MAX);
});

test('RD-4 one Esc order as a pure function: dialog → step page → sheet → focus mode → give the keys back', () => {
  assert.deepEqual(ESC_ORDER, ['dialog', 'step', 'sheet', 'focus', 'keys']);
  assert.equal(escStep({ dialog: true, step: true, sheet: true, focus: true }), 'dialog');
  assert.equal(escStep({ step: true, sheet: true, focus: true }), 'step');
  assert.equal(escStep({ sheet: true, focus: true }), 'sheet');
  assert.equal(escStep({ focus: true }), 'focus');
  assert.equal(escStep({}), 'keys'); assert.equal(escStep(), 'keys');
  // pressing Esc until nothing is open walks the order, one layer a press
  const s = { dialog: true, step: true, sheet: true, focus: true }, seen = [];
  for (let k = escStep(s); k !== 'keys'; k = escStep(s)) { seen.push(k); s[k] = false; }
  assert.deepEqual(seen, ['dialog', 'step', 'sheet', 'focus']);
});

test('RD-4 static guards: every action and default is a button on the page; the index selector covers every interactive role', () => {
  for (const id of [...Object.keys(ACTIONS), ...FIND_DEFAULTS]) assert.match(html, new RegExp(`<button\\b[^>]*\\bid="${id}"`), id);
  const sel = app.match(/const FIND_SEL = '([^']+)'/)[1];
  // the roles the page and its widgets set (not the selector's own text), the interactive ones each in the selector
  const INTERACTIVE = ['slider', 'tab', 'radio', 'switch', 'checkbox', 'button', 'link', 'spinbutton', 'textbox', 'searchbox', 'option', 'menuitem', 'combobox'];
  const roles = new Set([...src.replace(sel, '').matchAll(/role(?:=|', )["']([a-z]+)["']/g)].map(m => m[1]).filter(r => INTERACTIVE.includes(r)));
  assert.ok(['slider', 'tab', 'radio'].every(r => roles.has(r)), [...roles].join());
  // menuitem: the canvas's ring menu (out: a popup of the canvas); option / combobox: find's own list and field
  for (const r of roles) if (!['menuitem', 'option', 'combobox'].includes(r)) assert.ok(sel.includes(`[role=${r}]`), r);
  for (const tag of ['button', 'select', 'input', 'textarea', 'summary', 'a[href]']) assert.ok(sel.split(', ').includes(tag), tag);
  // the find field and the help / gift cards are out of the index; the page asks opensFind (tested above) where the focus is
  assert.match(app, /const FIND_OUT = '#find-box, dialog,/);
  assert.match(app, /opensFind\(e, [^\n]*closest\(TEXT_SEL\) \? 'text' : [^\n]*closest\('select'\) \? 'select'/);
  // one Escape handler on the window (popups keep their own, which stop the event first)
  const onWindow = [...app.matchAll(/^(?:window\.)?addEventListener\('keydown', \(e\) => \{([^\n]*\n){0,2}/gm)].map(m => m[0]);
  assert.equal(onWindow.filter(s => s.includes("'Escape'")).length, 1, 'one window Esc handler');
  assert.match(html, /id="find"[^>]*role="combobox"[^>]*aria-controls="find-list"/);
});
