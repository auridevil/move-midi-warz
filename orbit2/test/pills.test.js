// RD-7 the pills: the fixed order, the fold into "+N more", words that never move with the clock, which ones a × turns
// off, the quests' "show me" and the ghost hand's path (pure halves: pills.js, quests.js, scene.js ghostAt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PILL_ORDER, PILL_MAX, pillText, pillsOn, pillLayout, pillOff, focusAfter } from '../src/poly/pills.js';
import { QUESTS } from '../src/poly/quests.js';
import { ghostAt, ringGeo } from '../src/poly/scene.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const all = { rec: { armed: true, knobs: 'latch' }, chain: { chain: [0, 2], pending: 2, switchAt: 'bar', mutes: 0 }, solo: ['shaker'], evolve: { on: true, every: 4 },
  dice: { locked: true, seed: 4127, repeat: 1 }, clock: { follow: 'tempo', inName: 'Move' }, welcome: true, quest: { n: 1, of: 5, title: 'make 3 against 4' }, jam: { state: 'done', bars: 8 } };

test('RD-7 the order is the decision\'s (rec · chain · solo · evolve · dice · clock · welcome · quest · jam), at most 4 drawn', () => {
  assert.deepEqual(PILL_ORDER, ['rec', 'chain', 'solo', 'evolve', 'dice', 'clock', 'welcome', 'quest', 'jam']);
  assert.equal(PILL_MAX, 4);
  assert.deepEqual(pillsOn(all).map(p => p.k), PILL_ORDER, 'every pill on, in order');
  // any order in, the fixed order out
  assert.deepEqual(pillLayout(['jam', 'rec', 'quest']), { shown: ['rec', 'quest', 'jam'], folded: [], more: 0 });
  assert.deepEqual(pillLayout(['quest', 'welcome', 'evolve', 'chain', 'solo', 'rec']), { shown: ['rec', 'chain', 'solo', 'evolve'], folded: ['welcome', 'quest'], more: 2 });
  assert.deepEqual(pillLayout(['rec', 'chain', 'solo', 'evolve']), { shown: ['rec', 'chain', 'solo', 'evolve'], folded: [], more: 0 }, '4 fit: no "+N more"');
  assert.deepEqual(pillLayout(['rec', 'chain', 'solo', 'evolve', 'jam']).more, 1, 'the fifth folds');
  assert.deepEqual(pillLayout([]), { shown: [], folded: [], more: 0 });
  assert.deepEqual(pillLayout(['nonsense', 'rec']).shown, ['rec'], 'an unknown key is no pill');
  assert.deepEqual(pillLayout(PILL_ORDER, 2), { shown: ['rec', 'chain'], folded: PILL_ORDER.slice(2), more: 7 });
});

test('RD-7 a pill is off when its mode is: nothing on, no pill', () => {
  const none = { rec: { armed: false, knobs: 'latch' }, chain: { chain: [], pending: -1, switchAt: 'bar', mutes: 0 }, solo: [], evolve: { on: false, every: 4 },
    dice: { locked: false, seed: 1 }, clock: { follow: 'off', inName: 'Move' }, welcome: false, quest: null, jam: { state: 'idle' } };
  assert.deepEqual(pillsOn(none), []);
  assert.equal(pillText('clock', { clock: { follow: 'tempo', inName: '' } }), null, 'following no input: no pill');
  assert.equal(pillText('chain', { chain: { chain: [3], pending: -1, mutes: 0 } }), null, 'a chain of one slot is no chain');
});

test('RD-7 the words: state, never a counter that moves with the clock (A4: announced once, not per bar)', () => {
  assert.equal(pillText('rec', all), '● rec armed · latch'); assert.equal(pillText('rec', { rec: { armed: true, knobs: 'off' } }), '● rec armed');
  assert.equal(pillText('chain', all), 'chain 1 → 3', 'the slot it is on is not said (it moves with the clock)');
  assert.equal(pillText('chain', { chain: { chain: [], pending: 4, switchAt: 'bar', mutes: 0 } }), 'slot 5 · next bar');
  assert.equal(pillText('chain', { chain: { chain: [], pending: 4, switchAt: 'cycle', mutes: 2 } }), 'slot 5 · 2 mutes · next cycle');
  assert.equal(pillText('chain', { chain: { chain: [], pending: -1, switchAt: 'cycle', mutes: 1 } }), '1 mute · next bar', 'mutes land on the bar line');
  // RD-07 round 1 (Kai, Arjun): a running chain no longer hides the mutes waiting for the bar
  assert.equal(pillText('chain', { chain: { chain: [0, 2], pending: 2, switchAt: 'bar', mutes: 2 } }), 'chain 1 → 3 · 2 mutes · next bar');
  assert.equal(pillText('solo', { solo: ['kick', 'clap'] }), 'solo · kick, clap');
  assert.equal(pillText('evolve', all), 'evolve · every 4 bars'); assert.equal(pillText('evolve', { evolve: { on: true, every: 1 } }), 'evolve · every 1 bar');
  assert.equal(pillText('dice', all), 'dice 4127'); assert.equal(pillText('dice', { dice: { locked: true, seed: 9, repeat: 4 } }), 'dice 9 · repeat 4');
  assert.equal(pillText('clock', all), 'clock · Move');
  assert.equal(pillText('welcome', all), 'welcome back · play');
  assert.equal(pillText('quest', all), 'quest 1 of 5 · make 3 against 4');
  // the jam: the same words for the whole of each state (its beats count on the jam word and the canvas)
  const jamAt = (state, beats) => pillText('jam', { jam: { state, bars: 8, beats } });
  for (const st of ['armed', 'rec', 'finishing']) assert.equal(jamAt(st, 3), jamAt(st, 200), `${st}: no beat count`);
  assert.equal(jamAt('rec'), '● jam · recording'); assert.equal(jamAt('done'), 'take ready · 8 bars'); assert.equal(jamAt('idle'), null);
  // nothing that reads like a counter: no "beat", "to go", bpm
  for (const p of pillsOn(all)) assert.doesNotMatch(p.text, /beat|to go|bpm|\d+\s*\/\s*\d+/, p.k);
});

test('RD-7 a × turns the mode off where it can: not on a slot or mute that only waits, not on the jam (download / discard)', () => {
  for (const k of ['rec', 'solo', 'evolve', 'dice', 'clock', 'welcome', 'quest']) assert.equal(pillOff(k, all), true, k);
  assert.equal(pillOff('chain', all), true, 'a running chain stops');
  assert.equal(pillOff('chain', { chain: { chain: [], pending: 2 } }), false, 'a queued slot just lands');
  assert.equal(pillOff('jam', all), false);
});

test('RD-7 the page: one status region, a node per pill in the fixed order, the old ids kept, the hint not announced', () => {
  const region = html.slice(html.indexOf('<div id="pills"'), html.indexOf('<section id="sheet"'));
  assert.match(region, /<div id="pills" class="pills" role="status"/);
  const order = [...region.matchAll(/data-pill="(\w+)"/g)].map(m => m[1]); assert.deepEqual(order, PILL_ORDER, 'the nodes in the fixed order');
  for (const id of ['welcome', 'wb-keep', 'wb-fresh', 'wb-close', 'quest', 'quest-n', 'quest-title', 'quest-hint', 'quest-skip', 'quest-x', 'quest-show', 'jam-panel', 'jam-text', 'jam-dl', 'jam-discard', 'sp-more']) assert.match(region, new RegExp(`id="${id}"`), id);
  assert.match(region, /<div id="quest-more" class="quest-more" aria-live="off"/, 'the hint changes with the beat on screen: never read out by itself');
  assert.doesNotMatch(html, /id="jam-fill"|class="jam-bar"/, 'no beat-by-beat progress bar in the region');
  assert.ok(html.indexOf('id="pills"') < html.indexOf('<section id="sheet"'), 'the sheet comes under the last pill');
  // RD-07 round 1 (Vera, Greta, Arjun): a pill that appears is read by itself, not the whole region again (a status region
  // is atomic by default); the "+N more" count is not read; the region is never display: none, even empty (a live
  // region that appears with its first pill does not read it)
  assert.match(region, /<div id="pills" [^>]*aria-atomic="false"/, 'not atomic');
  assert.match(region, /<button id="sp-more" [^>]*aria-live="off"/, '"+N more" counts without a word');
  const empty = css.split('\n').find(l => l.startsWith('.pills:not(:has('));
  assert.ok(empty && !/display:\s*none/.test(empty), `the empty region stays in the page: ${empty}`);
  assert.doesNotMatch(css, /(^|\n)\s*\.pills[^{\n]*\{[^}]*display:\s*none/, 'no rule takes the region out of the page');
});

test('RD-7 the focus goes on when what held it goes out of sight: never to the page, never left on a folded button', () => {
  const drawn = ['rec', 'solo', 'evolve', 'dice'];
  assert.equal(focusAfter('clock', drawn, true, true), 'more', 'Esc on "+N more" with the focus on a folded pill: back to "+N more"');
  assert.equal(focusAfter('jam', drawn, true, true), 'more', 'a folded take discarded while "+N more" is drawn: "+N more"');
  assert.equal(focusAfter('solo', ['rec', 'evolve', 'dice'], false), 'evolve', 'a × on a drawn pill: the next pill drawn');
  assert.equal(focusAfter('dice', ['rec', 'solo', 'evolve'], false), 'evolve', 'the last one drawn: the one before');
  assert.equal(focusAfter('jam', [], false), 'help', 'nothing left: "?" above the pills');
  assert.equal(focusAfter('jam', [], true, false), 'more', 'nothing drawn but "+N more"');
  assert.equal(focusAfter('hint', ['rec', 'quest'], false), 'quest', 'the hint closed (show me, Esc): its pill');
  assert.equal(focusAfter('hint', drawn, true, true), 'more', 'the hint of a folded quest: "+N more"');
  assert.equal(focusAfter('hint', ['rec', 'jam'], false), 'jam', 'the last quest skipped: the pill after the quest\'s place');
  assert.equal(focusAfter('chain', ['rec', 'chain', 'solo'], false), 'chain', 'a button of a pill still drawn went (the chain\'s ×): that pill');
  assert.equal(focusAfter('more', ['rec', 'solo'], false), 'rec', '"+N more" itself went (5 → 4 pills): the first pill');
  for (const k of [...PILL_ORDER, 'more', 'hint']) for (const more of [true, false]) {
    const to = focusAfter(k, drawn, more, false); assert.ok(drawn.includes(to) || to === 'more' || to === 'help', `${k}: ${to}`);
  }
  // RD-07 round 2 (Vera): never onto a pill whose first button acts: the take's stops it while it records, welcome's plays
  const acts = { skip: ['welcome', 'jam'] };
  assert.equal(focusAfter('solo', ['jam'], false, false, acts), 'help', 'a × with only a recording take left: "?", not the take\'s stop');
  assert.equal(focusAfter('rec', ['welcome', 'quest'], false, false, { skip: ['welcome'] }), 'quest', 'past welcome\'s play');
  assert.equal(focusAfter('jam', ['jam', 'rec'], false, false, acts), 'rec', 'not even its own pill when that button acts now');
  assert.equal(focusAfter('solo', ['jam'], false, false), 'jam', 'a finished take\'s first button only shows its download: allowed');
  // (Vera, Arjun) a folded quest's hint opened from "+N more": into the hint (show me), not back onto "+N more"
  assert.equal(focusAfter('quest', drawn, true, true, { hint: true }), 'hint');
  assert.equal(focusAfter('quest', drawn, true, true), 'more', 'the hint closed: "+N more"');
  assert.equal(focusAfter('hint', drawn, true, true, { hint: false }), 'more', 'show me from a folded quest\'s hint: "+N more"');
});

test('RD-7 "show me": every quest has one; a ring gesture names a lane, a sheet quest a control on the page', () => {
  const m = { selected: 1, meter: '4/4', lanes: [{}, {}].map((_, i) => ({ name: i ? 'snare' : 'kick', voice: i ? 'snare' : 'kick', length: 4, ratio: 1, rotation: 0, muted: false, euclidK: 2, euclidMode: 'replace', played: (s) => s % 2 === 0, hitAt: (s) => s % 2 === 0 })) };
  for (const q of QUESTS) {
    const g = q.show(m); assert.ok(g, q.id);
    if (g.id) assert.match(html, new RegExp(`id="${g.id}"`), `${q.id}: ${g.id} is on the page`);
    else { assert.ok(['pull', 'turn'].includes(g.kind), q.id); assert.ok(g.li >= 0 && g.li < m.lanes.length, q.id); }
  }
  assert.deepEqual(QUESTS.find(q => q.id === 'backbeat').show(m), { kind: 'turn', li: 1 }, 'along the snare\'s ring');
});

test('RD-7 the ghost hand: a pull goes straight out from its ring, a turn stays on it; it waits, moves, then rests', () => {
  const g = ringGeo(800, 800, { x: 0, y: 0, w: 800, h: 800 }, 4), d = (p) => Math.hypot(p.x - g.cx, p.y - g.cy), ang = (p) => Math.atan2(p.y - g.cy, p.x - g.cx);
  const pull = [0, 0.1, 0.5, 0.8, 1].map(p => ghostAt(g, 'pull', 1, p)), turn = [0, 0.1, 0.5, 0.8, 1].map(p => ghostAt(g, 'turn', 2, p));
  assert.ok(Math.abs(d(pull[0]) - g.ring(1)) < 1e-6, 'starts on the ring'); assert.deepEqual(pull[1], pull[0], 'waits first');
  assert.ok(d(pull[2]) > d(pull[0]) && d(pull[3]) > d(pull[2]), 'goes out'); assert.ok(Math.abs(d(pull[3]) - g.ring(1) - 0.18 * g.R) < 1e-6, 'by 0.18 R');
  assert.deepEqual(pull[4], pull[3], 'then rests');
  for (const p of pull) assert.ok(Math.abs(ang(p) - ang(pull[0])) < 1e-9, 'straight out');
  for (const p of turn) assert.ok(Math.abs(d(p) - g.ring(2)) < 1e-6, 'a turn stays on its ring');
  assert.ok(ang(turn[3]) > ang(turn[0]), 'clockwise'); assert.ok(Math.abs(ang(turn[3]) - ang(turn[0]) - 0.9) < 1e-6);
});
