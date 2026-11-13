// ORBIT2-16 learning and simple mode (I6, I7): every quest's check says yes only to your own move AND the result, and no
// otherwise; saved progress tolerates junk; a first visit starts simple; the plain words on the lane knobs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine, ratioIndexOf } from '../src/poly/lanes.js';
import { GROOVES, DEMO_GROOVE, grooveByKey } from '../src/poly/grooves.js';
import { QUESTS, QUESTS_KEY, PLAIN, paramLabel, questsFrom, currentQuest, startView, hintDrawer, threeAgainstFour, snareLanes, onTwoAndFour, sounding, loopQuarters, backbeatSetup, backbeatLane } from '../src/poly/quests.js';

const quest = (id) => QUESTS.find(q => q.id === id);
const edit = (k, lane = 0) => ({ type: 'edit', lane, k });
// the card's words: the knob labels as the app shows them (simple / everything) and a lane as the screen names it
const FULL = { euclid: 'euclid hits', rotation: 'rotation', ratio: 'speed ×', prob: 'probability' };
const sayIn = (simple, m) => ({ word: (k) => paramLabel(k, FULL[k] ?? k, simple), lane: (i) => `lane ${i + 1} · ${m.lanes[i].voice}` });

test('I6 the five quests, in order, each with a title, a hint, a drawer, the moves that finish it and a check', () => {
  assert.deepEqual(QUESTS.map(q => q.id), ['three-four', 'backbeat', 'evolve', 'slot', 'export']);
  assert.deepEqual(QUESTS.map(q => q.title), ['make 3 against 4', 'rotate the snare onto 2 and 4', 'let it evolve 8 bars', 'save your first slot', 'export a loop']);
  const m = new Machine();
  for (const q of QUESTS) { assert.ok(q.hint(m, sayIn(true, m)).length > 20, q.id); assert.ok(q.drawer.endsWith('-drawer'), q.id); assert.equal(typeof q.check, 'function'); }
  // the app checks right after one of these: a bar line can't finish a knob quest (a later evolve isn't your move)
  assert.deepEqual(QUESTS.map(q => q.on), [['edit'], ['edit'], ['bar'], ['slot-save'], ['export']]);
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
  assert.equal(q.check(m, [edit('length'), edit('tune')]), false, 'your latest move counts: an old length move does not tick it later');
  assert.equal(q.check(m, [edit('tune'), { type: 'bar', evolving: false }, edit('length')]), true);
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
  assert.equal(q.check(m, [edit('rotation', 1), edit('length', 0)]), false, 'the shift has to be the move that just happened');
  assert.equal(q.check(m, []), false, 'no move, no tick');
  assert.equal(onTwoAndFour(m, 1, 0), false, 'a rotation can be asked for without moving the lane'); assert.equal(sn.rotation, 1);
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

// ORBIT2-16 round 1: the first visit's beat (the 3 vs 4 vs 5 demo) has no snare voice and its lane 2 rim (5 steps at ×4)
// can't be shifted onto 2 and 4. The hint names the lane as the screen does and what it lacks; doing what it says, in
// the knobs' own code (Lane.resize = the length knob), then turning shift, finishes the quest.
/** Do what backbeatSetup lists (in `order`), then turn shift step by step: the rotation that finishes the quest, or -1. */
function followHint(m, li, order = ['meter', 'mute', 'mode', 'length', 'ratio', 'euclid']) {
  const l = m.lanes[li], need = backbeatSetup(m, li), q = quest('backbeat');
  for (const k of order) {
    const n = need.find(x => x.k === k); if (!n) continue;
    if (k === 'meter') m.meter = n.v; else if (k === 'mute') l.muted = n.v; else if (k === 'mode') l.setEuclidMode(n.v); else if (k === 'length') l.resize(n.v); else if (k === 'ratio') l.setRatio(ratioIndexOf(n.v)); else l.setEuclid(n.v);
  }
  for (let r = 0; r < l.length; r++) { l.rotation = r; if (q.check(m, [edit('rotation', li)])) return r; }
  return -1;
}
test('I6 the backbeat hint names your snare and what it lacks; doing what it says finishes the quest', () => {
  const q = quest('backbeat'), demo = () => Machine.from(grooveByKey(DEMO_GROOVE).m);
  const m = demo(), li = backbeatLane(m);
  assert.equal(li, 1); assert.equal(m.lanes[1].voice, 'rim');
  assert.deepEqual(Array.from({ length: 5 }, (_, r) => onTwoAndFour(m, 1, r)), [false, false, false, false, false], 'no shift of the demo rim lands on 2 and 4');
  assert.deepEqual(backbeatSetup(m, 1), [{ k: 'length', v: 4 }, { k: 'ratio', v: 1 }, { k: 'euclid', v: 2 }]);
  assert.equal(q.hint(m, sayIn(true, m)), 'Your snare is lane 2 · rim. Pick it, set "length" to 4, "speed" to 1 and "hits" to 2; then turn "shift" (or drag along its ring) until it hits on beats 2 and 4, not 1 and 3.');
  assert.match(q.hint(m, sayIn(false, m)), /"speed ×" to 1 and "euclid hits" to 2; then turn "rotation"/, 'everything: the knobs as they read there');
  assert.ok(followHint(m, 1) >= 0, 'the demo, as a first visit gets it');
  const e = demo(); assert.ok(followHint(e, 1, ['euclid', 'ratio', 'length']) >= 0, 'any order of the knobs');
  const after = demo(); after.lanes[1].resize(3); assert.equal(threeAgainstFour(after), true, 'quest 1 done the obvious way (rim 5 → 3)');
  assert.ok(followHint(after, backbeatLane(after)) >= 0, 'after quest 1');
  for (const g of GROOVES) { const gm = Machine.from(g.m), gl = backbeatLane(gm); assert.ok(gl >= 0 && followHint(gm, gl) >= 0, g.key); }
  // a lane a shift away is told just that; an empty one, the hits it lacks; a muted one, to unmute; 3/4, the meter
  const f = new Machine(); f.lanes[1].setEuclid(2); f.lanes[1].voice = 'snare';
  assert.deepEqual(backbeatSetup(f, 1), []); assert.equal(q.hint(f, sayIn(true, f)), 'Your snare is lane 2 · snare: pick it and turn "shift" (or drag along its ring) until it hits on beats 2 and 4, not 1 and 3.');
  const z = new Machine(); z.lanes[1].setLength(4); z.lanes[1].setRatio(ratioIndexOf(1)); assert.deepEqual(backbeatSetup(z, 1), [{ k: 'euclid', v: 2 }]); assert.ok(followHint(z, 1) >= 0);
  f.lanes[1].muted = true; assert.deepEqual(backbeatSetup(f, 1), [{ k: 'mute', v: false }]); assert.match(q.hint(f, sayIn(true, f)), /Pick it, unmute it; then turn "shift"/);
  f.lanes[1].muted = false; f.meter = '3/4'; assert.deepEqual(backbeatSetup(f, 1), [{ k: 'meter', v: '4/4' }]); assert.ok(followHint(f, 1) >= 0);
});

// ORBIT2-16 round 2 (architect, verifier): an AND / XOR lane (from a link or a saved beat) is told to go back to replace
// first, hits set by hand get the hits knob, 2 hits in 4 already need only what's left, and a snare that already plays
// on 2 and 4 is told to turn it away and back (the quest wants the turn).
test('I6 the backbeat hint: AND / XOR lanes, hand-set hits, a snare already there', () => {
  const q = quest('backbeat'), demo = () => Machine.from(grooveByKey(DEMO_GROOVE).m);
  for (const mode of ['and', 'xor']) {
    const m = demo(); m.lanes[1].setEuclidMode(mode);
    assert.deepEqual(backbeatSetup(m, 1), [{ k: 'length', v: 4 }, { k: 'ratio', v: 1 }, { k: 'mode', v: 'replace' }, { k: 'euclid', v: 2 }], mode);
    assert.match(q.hint(m, sayIn(true, m)), /Pick it, set its "euclid" to "replace" \(under "generative", in "everything"\) and set "length" to 4, "speed" to 1 and "hits" to 2; then/);
    assert.ok(followHint(m, 1) >= 0, mode);
  }
  const h = new Machine(), l = h.lanes[1]; l.setLength(4); l.setRatio(ratioIndexOf(1)); l.setEuclid(2); l.hits[1] = true; l.hits[2] = false;   // x x . .
  assert.deepEqual(backbeatSetup(h, 1), [{ k: 'euclid', v: 2 }], 'the knob at 2, the steps moved by hand: the hits knob again'); assert.ok(followHint(h, 1) >= 0);
  const e = new Machine(), s = e.lanes[1]; s.setLength(4); s.setRatio(ratioIndexOf(2)); s.hits[0] = s.hits[2] = true;   // x.x. in eighths
  assert.deepEqual(backbeatSetup(e, 1), [{ k: 'ratio', v: 1 }], '2 hits in 4 already: only the speed'); assert.ok(followHint(e, 1) >= 0);
  const a = new Machine(); a.lanes[1].voice = 'snare'; a.lanes[1].setLength(4); a.lanes[1].setRatio(ratioIndexOf(1)); a.lanes[1].setEuclid(2); a.lanes[1].rotation = 1;
  assert.equal(onTwoAndFour(a, 1), true);
  assert.equal(q.hint(a, sayIn(true, a)), 'Your snare (lane 2 · snare) already plays on 2 and 4: pick it and turn "shift" away and back (or drag along its ring) to land it there yourself.');
  assert.equal(q.check(a, [edit('euclid', 1)]), false, 'there without a turn: not yet'); assert.equal(q.check(a, [edit('rotation', 1)]), true);
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
  assert.deepEqual(questsFrom(null), { done: [], skipped: [], view: null, hidden: false });
  assert.deepEqual(questsFrom({ done: ['slot', 'nope', 'slot', 3], view: 'weird', hidden: 'yes' }), { done: ['slot'], skipped: [], view: null, hidden: false });
  assert.deepEqual(questsFrom({ done: 'x', view: 'all', hidden: true }), { done: [], skipped: [], view: 'all', hidden: true });
  assert.deepEqual(questsFrom({ done: ['three-four', 'backbeat'], skipped: ['backbeat', 'export', 'backbeat', 'nope'] }).skipped, ['backbeat'], 'skipped ones are done ones (the order walks done)');
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
