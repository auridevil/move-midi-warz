// RD-1 setlog (DECISION A3): the ring buffer, reversal tagging, knob turns folded into one entry, the pattern diff, the
// JSON shape, and the page hooks (attachSetlog) with a fake window, clock and deferral.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../src/poly/lanes.js';
import { Setlog, attachSetlog, diffPattern, patternWords, brief, REVERSE_MS, MERGE_MS, SOURCES, SETLOG_FORMAT } from '../src/poly/setlog.js';

const e = (t, target, before, after, o = {}) => ({ t, source: 'pointer', target, before, after, ...o });

test('RD-1 the ring buffer keeps the newest `cap` entries in order and counts the dropped ones', () => {
  const log = new Setlog({ cap: 5 });
  for (let i = 0; i < 12; i++) log.add(e(i * 10000, `t${i}`, i, i + 1));
  const list = log.entries();
  assert.equal(list.length, 5); assert.equal(log.dropped, 7);
  assert.deepEqual(list.map(x => x.target), ['t7', 't8', 't9', 't10', 't11']);
  assert.deepEqual(list.map(x => x.id), [7, 8, 9, 10, 11]);
  assert.deepEqual([...log.back()].map(x => x.id), [11, 10, 9, 8, 7]);
});

test('RD-1 reversal: the same target set back within 5 s is tagged, later or elsewhere is not', () => {
  const log = new Setlog();
  const a = log.add(e(0, 'lane1.mute', false, true)), b = log.add(e(1200, 'lane1.mute', true, false));
  assert.equal(a.reversed, false); assert.equal(b.reversed, true); assert.equal(b.reverses, a.id);
  const c = log.add(e(10000, 'lane2.hits.5', false, true)), d = log.add(e(10000 + REVERSE_MS + 1, 'lane2.hits.5', true, false));
  assert.equal(d.reversed, false, 'past the window it is a new decision');
  log.add(e(20000, 'lane3.hits.1', false, true)); log.add(e(20100, 'lane3.hits.2', false, true));
  assert.equal(log.add(e(20200, 'lane3.hits.2', true, false)).reversed, true, 'the nearest entry of that target counts');
  // a reversal is not reversed again by its own undo-back (a double press = one slip, one fix)
  log.add(e(30000, 'transport', 'stopped', 'playing')); log.add(e(30500, 'transport', 'playing', 'stopped'));
  assert.equal(log.add(e(31000, 'transport', 'stopped', 'playing')).reversed, false);
  // an object value (a lock) compares by content
  log.add(e(40000, 'lane1.locks.3', null, { tune: 0.5 })); assert.equal(log.add(e(40500, 'lane1.locks.3', { tune: 0.5 }, null)).reversed, true);
  assert.equal(c.reversed, false);
});

test('RD-1 a knob turn folds into one entry (release value, start value); a pause or another source starts a new one', () => {
  const log = new Setlog();
  for (let i = 0; i <= 10; i++) log.add(e(i * 50, 'lane1.sound.tone', 0.5 + (i - 1) * 0.01, 0.5 + i * 0.01, { merge: true }));
  assert.equal(log.size, 1); const k = log.entries()[0];
  assert.equal(k.before, 0.49); assert.equal(k.after, 0.6); assert.equal(k.t, 0); assert.equal(k.end, 500);
  log.add(e(500 + MERGE_MS + 1, 'lane1.sound.tone', 0.6, 0.62, { merge: true }));
  assert.equal(log.size, 2);
  log.add({ ...e(1300, 'lane1.sound.tone', 0.62, 0.7, { merge: true }), source: 'move' });
  assert.equal(log.size, 3);
  // a turn back to where it started within 5 s is a reversal, tagged on the turn's merged entry
  log.add(e(10000, 'tempo', 120, 121, { merge: true })); log.add(e(10100, 'tempo', 121, 124, { merge: true }));
  const back = log.add(e(11500, 'tempo', 124, 120, { merge: true }));
  assert.equal(back.reversed, true);
  // step toggles never fold: a double press is two entries (the second reverses the first)
  log.add(e(20000, 'lane2.hits.3', false, true)); const dbl = log.add(e(20080, 'lane2.hits.3', true, false));
  assert.equal(dbl.reversed, true);
});

test('RD-1 the JSON shape: format, v, meta, and every entry has time, source, target, before → after and a reversal flag', () => {
  const log = new Setlog();
  log.add(e(0, 'transport', 'stopped', 'playing')); log.add({ ...e(812.5, 'lane2.mute', false, true, { voice: 'snare', queued: false }), source: 'move' });
  log.add(e(900, 'lane2.mute', true, false)); log.add(e(1000, 'lane1.sound.tone', 0.4, 0.5, { merge: true }));
  const j = JSON.parse(JSON.stringify(log.toJSON({ started: '2026-11-14T10:00:00.000Z', page: '/orbit2/index.html' })));
  assert.equal(j.format, SETLOG_FORMAT); assert.equal(j.v, 1); assert.equal(j.page, '/orbit2/index.html'); assert.equal(j.dropped, 0);
  assert.equal(j.entries.length, 4);
  for (const x of j.entries) {
    for (const k of ['id', 't', 'source', 'target', 'before', 'after', 'reversed']) assert.ok(k in x, `${k} in every entry`);
    assert.ok(SOURCES.includes(x.source)); assert.equal(typeof x.reversed, 'boolean'); assert.ok(!('merge' in x), 'merge is internal');
  }
  assert.deepEqual(j.entries[1], { id: 1, t: 812.5, source: 'move', target: 'lane2.mute', before: false, after: true, reversed: false, voice: 'snare', queued: false });
  assert.equal(j.entries[2].reversed, true); assert.equal(j.entries[2].reverses, 1);
  assert.match(brief({ key: 'x'.repeat(300) }), /^#[0-9a-z]+ \(\d+ chars\)$/); assert.deepEqual(brief({ tune: 0.5 }), { tune: 0.5 });
});

test('RD-1 the pattern diff: a step, a knob, a sound, a lock, a mute, the selection; the steps a knob moved stay quiet', () => {
  const m = new Machine(); const a = structuredClone(m.toJSON());
  m.lanes[1].hits[4] = !m.lanes[1].hits[4]; let d = diffPattern(a, m.toJSON());
  assert.deepEqual(d, [{ target: 'lane2.hits.5', before: a.lanes[1].hits[4], after: !a.lanes[1].hits[4], merge: false }]);
  const b = structuredClone(m.toJSON()); m.lanes[0].setEuclid(5); d = diffPattern(b, m.toJSON());
  assert.deepEqual(d.map(x => x.target), ['lane1.euclidK'], 'euclid rewrites the steps: logged as the knob');
  const c = structuredClone(m.toJSON()); m.lanes[2].sound.tone = 0.2; m.lanes[3].muted = true; m.select(2); d = diffPattern(c, m.toJSON());
  assert.deepEqual(d.map(x => x.target).sort(), ['lane3.sound.tone', 'lane4.mute', 'select']);
  assert.equal(d.find(x => x.target === 'select').after, 3); assert.equal(d.find(x => x.target === 'lane3.sound.tone').merge, true);
  const f = structuredClone(m.toJSON()); m.lanes[0].setLock?.(2, 'tune', 0.5) ?? (m.lanes[0].locks[2] = { tune: 0.5 }); d = diffPattern(f, m.toJSON());
  assert.equal(d.length, 1); assert.equal(d[0].target, 'lane1.locks.3'); assert.equal(d[0].merge, true);
  const g = structuredClone(m.toJSON()); m.setLaneCount(6); d = diffPattern(g, m.toJSON());
  assert.deepEqual(d.find(x => x.target === 'lanes'), { target: 'lanes', before: 4, after: 6, merge: false });
  assert.deepEqual(diffPattern(m.toJSON(), structuredClone(m.toJSON())), []);
  assert.match(patternWords(m.toJSON()), /^6 lanes · \d+ hits?$/);
});

test('RD-1 the page hooks: sources from the window, an action absorbs its own diff, a clock change is not logged, nothing diffs until deferred', () => {
  const m = new Machine(); let clock = 0; const later = [], ls = {};
  const win = { addEventListener: (type, fn) => { (ls[type] ||= []).push(fn); } };
  const s = attachSetlog({ win, model: () => m.toJSON(), now: () => clock, defer: (f) => later.push(f) });
  const run = () => { while (later.length) later.shift()(); };
  assert.deepEqual(Object.keys(ls).sort(), ['keydown', 'pointerdown', 'wheel']);
  // a key edit: nothing diffs at save time (the save may run inside the audio callback), only when the deferral runs
  clock = 100; ls.keydown[0]({}); m.lanes[0].hits[1] = !m.lanes[0].hits[1]; s.dirty(false);
  assert.equal(s.log.size, 0); run();
  assert.deepEqual(s.log.entries().map(x => [x.target, x.source, x.t]), [['lane1.hits.2', 'key', 100]]);
  // a touch init: one 'init' entry, the hundred fields it changed absorbed
  clock = 2000; ls.pointerdown[0]({ pointerType: 'touch' }); const was = patternWords(m.toJSON());
  m.lanes.forEach(l => l.clear()); s.dirty(false); s.act('init', was, patternWords(m.toJSON())); run();
  assert.deepEqual(s.log.entries().slice(1).map(x => [x.target, x.source]), [['init', 'touch']]);
  // the clock's change (evolve, a slot, a waiting mute) saves with hush: absorbed
  clock = 3000; m.lanes[1].rotation = 3; s.dirty(true); run(); assert.equal(s.log.size, 2);
  // the Move marks its bytes; a knob turned over many saves folds into one entry
  s.from('move'); for (let i = 1; i <= 8; i++) { clock = 4000 + i * 30; m.lanes[2].sound.decay = i / 10; s.dirty(false); run(); }
  const k = s.log.entries().at(-1); assert.equal(k.target, 'lane3.sound.decay'); assert.equal(k.source, 'move'); assert.equal(k.after, 0.8); assert.equal(s.log.size, 3);
  const f = s.file({ tempo: 120 }); assert.match(f.name, /^orbits-setlog-\d{4}-\d\d-\d\d-\d{6}\.json$/);
  const j = JSON.parse(f.text); assert.equal(j.format, SETLOG_FORMAT); assert.equal(j.tempo, 120); assert.ok(j.started); assert.equal(j.entries.length, 3);
});
