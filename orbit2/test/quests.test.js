// ORBIT2-16 learning and simple mode (I6, I7): every quest's check says yes only to your own move AND the result, and no
// otherwise; saved progress tolerates junk; a first visit starts simple; the plain words on the lane knobs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../src/poly/lanes.js';
import { QUESTS, QUESTS_KEY, PLAIN, paramLabel, questsFrom, currentQuest, startView, hintDrawer, threeAgainstFour, snareLanes, onTwoAndFour, sounding, loopQuarters } from '../src/poly/quests.js';

const quest = (id) => QUESTS.find(q => q.id === id);
const edit = (k, lane = 0) => ({ type: 'edit', lane, k });

test('I6 the five quests, in order, each with a title, a hint, a drawer and a check', () => {
  assert.deepEqual(QUESTS.map(q => q.id), ['three-four', 'backbeat', 'evolve', 'slot', 'export']);
  assert.deepEqual(QUESTS.map(q => q.title), ['make 3 against 4', 'rotate the snare onto 2 and 4', 'let it evolve 8 bars', 'save your first slot', 'export a loop']);
  for (const q of QUESTS) { assert.ok(q.hint.length > 20, q.id); assert.ok(q.drawer.endsWith('-drawer'), q.id); assert.equal(typeof q.check, 'function'); }
  assert.equal(QUESTS_KEY, 'midi-warz.orbit2.quests');
});

test('I6 "make 3 against 4": lengths 3 and 4, or one length at speeds 4 and 3; needs a length / speed move', () => {
  const q = quest('three-four'), m = new Machine();
  assert.equal(q.check(m, [edit('length')]), false, 'an empty pattern: nothing sounds');
  m.lanes[0].setEuclid(1); m.lanes[1].setEuclid(1);   // both 4 steps at ×1: 4 against 4
  assert.equal(threeAgainstFour(m), false); assert.equal(q.check(m, [edit('length')]), false);
  m.lanes[0].setLength(3);
  assert.equal(threeAgainstFour(m), true);
  assert.equal(q.check(m, [edit('length')]), true);
  assert.equal(q.check(m, []), false, 'a beat that already is 3 against 4 does not tick it by itself');
  assert.equal(q.check(m, [edit('tune')]), false, 'another knob is not the move');
  m.lanes[0].muted = true; assert.equal(q.check(m, [edit('length')]), false, 'a muted lane is not heard');
  // same length, speeds ×4/3 and ×1: loops 3 and 4 quarters long
  const s = new Machine(); s.lanes[0].setEuclid(1); s.lanes[1].setEuclid(1); s.lanes[0].setRatio(7);   // RATIOS[7] = 4/3
  assert.equal(loopQuarters(s.lanes[0]), 3); assert.equal(q.check(s, [edit('ratio')]), true);
});

test('I6 "rotate the snare onto 2 and 4": its hits land on beats 2 and 4 only; needs a shift of the snare', () => {
  const q = quest('backbeat'), m = new Machine(), sn = m.lanes[1];
  assert.deepEqual(snareLanes(m), [1]);
  sn.setEuclid(2);   // x.x. = beats 1 and 3
  assert.equal(onTwoAndFour(m, 1), false); assert.equal(q.check(m, [edit('rotation', 1)]), false);
  sn.rotation = 1;   // .x.x = beats 2 and 4
  assert.equal(onTwoAndFour(m, 1), true);
  assert.equal(q.check(m, [edit('rotation', 1)]), true);
  assert.equal(q.check(m, [edit('rotation', 0)]), false, 'shifting the kick is not the move');
  assert.equal(q.check(m, []), false, 'no move, no tick');
  sn.setEuclid(4); sn.rotation = 0; assert.equal(onTwoAndFour(m, 1), false, 'every beat is not a backbeat');
  sn.setEuclid(2); sn.rotation = 1; m.meter = '3/4'; assert.equal(q.check(m, [edit('rotation', 1)]), false, 'only in 4/4');
  // 8 steps at ×2 (eighths): hits on steps 2 and 6 = beats 2 and 4, an offbeat ghost on step 3 is fine
  const e = new Machine(), l = e.lanes[1]; l.setLength(8); l.setRatio(10);   // RATIOS[10] = 2
  for (let i = 0; i < 8; i++) l.hits[i] = [2, 6, 3].includes(i);
  assert.equal(sounding(l), true); assert.equal(onTwoAndFour(e, 1), true);
  l.hits[0] = true; assert.equal(onTwoAndFour(e, 1), false, 'a hit on beat 1 spoils it');
  // a snare voice on another lane counts as the snare
  const v = new Machine(); v.lanes[3].voice = 'clap'; assert.deepEqual(snareLanes(v), [1, 3]);
  v.lanes[1].voice = 'kick'; assert.deepEqual(snareLanes(v), [3], 'the voice decides, not the lane name');
});

test('I6 "let it evolve 8 bars": 8 bar lines with evolve on, not 7, not with evolve off', () => {
  const q = quest('evolve'), m = new Machine(), bar = (evolving) => ({ type: 'bar', evolving });
  assert.equal(q.check(m, Array.from({ length: 8 }, () => bar(true))), true);
  assert.equal(q.check(m, Array.from({ length: 7 }, () => bar(true))), false);
  assert.equal(q.check(m, Array.from({ length: 12 }, () => bar(false))), false);
});

test('I6 "save your first slot" and "export a loop": the save / the export, nothing else', () => {
  const m = new Machine();
  assert.equal(quest('slot').check(m, [{ type: 'slot-save', slot: 0 }]), true);
  assert.equal(quest('slot').check(m, [edit('length'), { type: 'export', what: 'wav' }]), false);
  for (const what of ['wav', 'midi', 'stems', 'all', 'share']) assert.equal(quest('export').check(m, [{ type: 'export', what }]), true, what);
  assert.equal(quest('export').check(m, [{ type: 'slot-save', slot: 1 }]), false);
});

test('I6 progress: junk dropped, quests in order, the next quest\'s drawer lit', () => {
  assert.deepEqual(questsFrom(null), { done: [], view: null, hidden: false });
  assert.deepEqual(questsFrom({ done: ['slot', 'nope', 'slot', 3], view: 'weird', hidden: 'yes' }), { done: ['slot'], view: null, hidden: false });
  assert.deepEqual(questsFrom({ done: 'x', view: 'all', hidden: true }), { done: [], view: 'all', hidden: true });
  assert.equal(currentQuest([]).id, 'three-four');
  assert.equal(currentQuest(['three-four']).id, 'backbeat');
  assert.equal(currentQuest(['three-four', 'slot']).id, 'backbeat', 'the first one not done');
  assert.equal(currentQuest(QUESTS.map(q => q.id)), null);
  assert.equal(hintDrawer([]), 'lane-drawer'); assert.equal(hintDrawer(['three-four', 'backbeat']), 'evolve-drawer'); assert.equal(hintDrawer(QUESTS.map(q => q.id)), null);
});

test('I7 a first visit starts simple, a page with a beat saved starts with everything, a choice is kept', () => {
  assert.equal(startView(null, true), 'simple'); assert.equal(startView(null, false), 'all');
  assert.equal(startView('all', true), 'all'); assert.equal(startView('simple', false), 'simple');
});

test('I7 plain words on the lane knobs in simple, the full names in everything', () => {
  assert.deepEqual(PLAIN, { euclid: 'hits', rotation: 'shift', ratio: 'speed', prob: 'chance' });
  assert.equal(paramLabel('euclid', 'euclid hits', true), 'hits'); assert.equal(paramLabel('euclid', 'euclid hits', false), 'euclid hits');
  assert.equal(paramLabel('rotation', 'rotation', true), 'shift'); assert.equal(paramLabel('ratio', 'speed ×', true), 'speed');
  assert.equal(paramLabel('prob', 'probability', true), 'chance'); assert.equal(paramLabel('prob', 'probability', false), 'probability');
  assert.equal(paramLabel('length', 'length', true), 'length', 'an unlisted knob keeps its name');
});
