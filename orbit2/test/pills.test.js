// RD-7 the pills: the fixed order, the fold into "+N more", words that never move with the clock, which ones a × turns
// off, the quests' "show me" and the ghost hand's path (pure halves: pills.js, quests.js, scene.js ghostAt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PILL_ORDER, PILL_MAX, pillText, pillsOn, pillLayout, pillOff } from '../src/poly/pills.js';
import { QUESTS } from '../src/poly/quests.js';
import { ghostAt, ringGeo } from '../src/poly/scene.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
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
