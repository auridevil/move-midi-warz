// RD-1 player-agent session tools (orbit2/tools/session-core.mjs): the seeded performer, the slip injector, the accident
// tagger (DECISION A3's classes), the glance scorer (A2) and the Move drawing (A10). Pure; the browser runs are the tools'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performer, injectSlips, tagAccidents, classOf, emptied, bytes, trackOf, glanceTrials, scoreGlance, pageWord, ledsOf, drawMove, MOVE, SLIPS, MOUSE_GAUGE, KNOB_TARGETS } from '../tools/session-core.mjs';

test('RD-1 performer: seeded, timed, persona-shaped, and every action names what it means to change', () => {
  const a = performer({ seed: 3, minutes: 10, persona: 'kai' }), b = performer({ seed: 3, minutes: 10, persona: 'kai' });
  assert.deepEqual(a, b, 'the same seed plays the same set');
  assert.notDeepEqual(a, performer({ seed: 4, minutes: 10, persona: 'kai' }));
  assert.equal(a[0].kind, 'move.play'); assert.equal(a.at(-1).intent, 'end'); assert.ok(a.at(-2).at < 10 * 60000);
  for (let i = 1; i < a.length; i++) assert.ok(a[i].at > a[i - 1].at, 'in time order');
  for (const x of a) { assert.ok(Array.isArray(x.expect)); if (x.kind === 'move.mute') assert.match(x.expect[0], /^lane\d\.mute=(true|false)$/, 'a mute names the state it wants'); }
  const noor = performer({ seed: 3, minutes: 10, persona: 'noor' });
  assert.ok(noor.length < a.length, 'noor rests longer between moves than kai');
  const mouse = performer({ seed: 3, minutes: 10, persona: 'kai', mouse: true });
  assert.ok(mouse.every(x => !x.kind.startsWith('move.')), 'a mouse-only set never touches the Move');
  // a step on the Move edits the selected lane: the expectation follows the selection
  let sel = 0; for (const x of a) { if (x.kind === 'move.select') sel = x.lane; if (x.kind === 'move.step') assert.equal(x.expect[0], `lane${sel + 1}.hits.*`); }
});

test('RD-1 slip injector: rate 0 changes nothing; every slip is one of the four, sized as specified, intent kept', () => {
  const s = performer({ seed: 9, minutes: 20, persona: 'kai' }), m = performer({ seed: 9, minutes: 20, persona: 'kai', mouse: true });
  assert.deepEqual(injectSlips(s, { rate: 0 }), s);
  assert.deepEqual(injectSlips(s, { rate: 0.2, seed: 2 }), injectSlips(s, { rate: 0.2, seed: 2 }), 'seeded');
  const all = injectSlips(s, { rate: 1, seed: 1 }), allM = injectSlips(m, { rate: 1, seed: 1 });
  const kinds = new Set([...all, ...allM].filter(x => x.slip).map(x => x.slip.kind)); assert.deepEqual([...kinds].sort(), [...SLIPS].sort());
  for (const x of [...all, ...allM].filter(x => x.slip)) {
    const orig = [...s, ...m].find(o => o.id === x.id && o.kind === x.kind && o.at === x.at);
    if (x.slip.kind === 'offset') { const d = Math.hypot(x.slip.dx, x.slip.dy); assert.ok(d >= 19 && d <= 41, `offset ${d}`); assert.ok(['click', 'hold', 'drag'].includes(x.kind)); }
    if (x.slip.kind === 'wrong-row') { assert.equal(x.kind, 'move.mute'); assert.equal(Math.abs(x.slip.row - x.lane), 1); assert.ok(x.slip.row >= 0 && x.slip.row <= 3); }
    if (x.slip.kind === 'stray-knob') { assert.deepEqual(x.expect, [], 'a stray touch means nothing'); assert.ok(x.slip.of != null); assert.ok(x.kind === 'move.knob' || x.kind === 'drag'); }
    if (x.slip.kind !== 'stray-knob') assert.deepEqual(x.expect, orig.expect, 'the hand still meant the same thing');
  }
  assert.ok(all.filter(x => x.intent === 'start' || x.intent === 'end').every(x => !x.slip), 'start and end are played cleanly');
  const ids = all.map(x => x.id); assert.equal(new Set(ids).size, ids.length, 'stray actions get their own ids');
});

test('RD-1 accident tagger: intended, a double press, a slip, a side effect, outside any action; the A3 classes', () => {
  const script = [
    { id: 0, intent: 'start', kind: 'move.play', expect: ['transport'] },
    { id: 1, intent: 'build', kind: 'move.step', expect: ['lane2.hits.*'], slip: { kind: 'double' } },
    { id: 2, intent: 'mute', kind: 'move.mute', lane: 1, expect: ['lane2.mute'], slip: { kind: 'wrong-row', row: 0 } },
    { id: 3, intent: 'knobs', kind: 'move.knob', expect: ['lane1.sound.tone'] },
    { id: 4, intent: 'build', kind: 'click', expect: ['lane1.hits.*'] },
  ];
  const runs = [{ id: 0, t0: 0, t1: 400 }, { id: 1, t0: 1000, t1: 1400 }, { id: 2, t0: 2000, t1: 2400 }, { id: 3, t0: 3000, t1: 3900 }, { id: 4, t0: 5000, t1: 5400 }];
  const e = (id, t, target, before, after, o = {}) => ({ id, t, source: 'move', target, before, after, reversed: false, ...o });
  const entries = [
    e(0, 100, 'transport', 'stopped', 'playing'),
    e(1, 1100, 'lane2.hits.3', false, true), e(2, 1250, 'lane2.hits.3', true, false, { reversed: true }),
    e(3, 2100, 'lane1.mute', false, true, { voice: 'kick' }),
    e(4, 3100, 'lane1.sound.tone', 0.5, 0.6), e(5, 3200, 'lane1.sound.decay', 0.4, 0.5),
    e(6, 4500, 'randomize', '4 lanes · 9 hits', '4 lanes · 14 hits'),
    e(7, 5100, 'select', 2, 1), e(8, 5200, 'lane1.hits.1', true, false),
  ];
  const { entries: t, accidents } = tagAccidents(entries, runs, script), by = (id) => t.find(x => x.id === id);
  assert.equal(by(0).intended, true); assert.equal(by(1).intended, true);
  assert.deepEqual([by(2).class, by(2).cause], ['harmless', 'double'], 'the second press of a double is the accident');
  assert.deepEqual([by(3).class, by(3).cause], ['destructive', 'wrong-row'], 'a kick muted by mistake is destructive');
  assert.equal(by(4).intended, true); assert.deepEqual([by(5).class, by(5).cause], ['harmless', 'side effect']);
  assert.deepEqual([by(6).class, by(6).cause, by(6).action], ['destructive', 'unattributed', null]);
  assert.deepEqual([by(7).class, by(7).cause], ['silent', 'side effect']); assert.equal(by(8).intended, true);
  assert.deepEqual([accidents.destructive, accidents.harmless, accidents.silent], [2, 2, 1]);
  assert.deepEqual(accidents.byCause['wrong-row'], { destructive: 1, harmless: 0, silent: 0 });
  // the A3 classes
  assert.equal(classOf({ target: 'transport', after: 'stopped' }), 'destructive'); assert.equal(classOf({ target: 'transport', after: 'playing' }), 'harmless');
  for (const k of ['init', 'randomize', 'clear', 'load', 'slot']) assert.equal(classOf({ target: k }), 'destructive');
  assert.equal(classOf({ target: 'lane3.mute', after: true, voice: 'kick909' }), 'destructive'); assert.equal(classOf({ target: 'lane3.mute', after: true, voice: 'hat' }), 'harmless');
  assert.equal(classOf({ target: 'lane1.mute', after: false, voice: 'kick' }), 'harmless', 'unmuting the kick brings it back');
  for (const k of ['select', 'export', 'slot.save', 'record']) assert.equal(classOf({ target: k }), 'silent');
});

test('RD-1 baseline-set fixes: the mouse finds the knob it means, a drop says which way, chained slips, turns, emptied lanes', () => {
  // the mouse drags the gauge the expectation names: #sliders holds app.js PARAMS in order (euclid = euclidK, offset = offsetMs)
  const src = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8'), block = src.slice(src.indexOf('const PARAMS = ['), src.indexOf('];', src.indexOf('const PARAMS = [')));
  const order = [...block.matchAll(/\{ k: '(\w+)'/g)].map(x => ({ euclid: 'euclidK', offset: 'offsetMs' })[x[1]] || x[1]);
  for (const [t, n] of Object.entries(MOUSE_GAUGE)) assert.equal(order[n - 1], t, `#sliders .gauge:nth-child(${n}) is ${t}`);
  const mouse = performer({ seed: 5, minutes: 30, persona: 'kai', mouse: true }), drags = mouse.filter(x => x.kind === 'drag' && x.intent === 'knobs');
  assert.ok(drags.length > 5);
  for (const d of drags) { const n = +/nth-child\((\d+)\)/.exec(d.sel)[1]; assert.equal(`.${order[n - 1]}`, d.expect[0].slice(d.expect[0].indexOf('.'))); }
  // the length knob also clamps the hit count (Lane.resize): both are the turn
  const knobs = performer({ seed: 5, minutes: 30, persona: 'kai' }).filter(x => x.kind === 'move.knob' && !x.shift && x.knob === 0);
  assert.ok(knobs.length && knobs.every(x => /\.length$/.test(x.expect[0]) && /\.euclidK$/.test(x.expect[1])));
  // a drop is one intention: the mute and the unmute share g and say which way they go
  const drops = performer({ seed: 2, minutes: 30, persona: 'kai', intents: { drop: 1, listen: 1 } }).filter(x => x.intent === 'drop');
  assert.ok(drops.length >= 4 && drops.length % 2 === 0);
  for (let i = 0; i < drops.length; i += 2) { assert.equal(drops[i].g, drops[i + 1].g); assert.deepEqual([drops[i].expect, drops[i + 1].expect], [['lane1.mute=true'], ['lane1.mute=false']]); }
  const slipped = injectSlips(performer({ seed: 9, minutes: 20, persona: 'kai' }), { rate: 1, seed: 1 });
  for (const x of slipped.filter(x => x.slip?.kind === 'stray-knob')) assert.equal(x.g, slipped.find(o => o.id === x.slip.of).g, 'a stray touch belongs to the intention it brushed past');

  const e = (id, t, target, before, after, o = {}) => ({ id, t, source: 'move', target, before, after, reversed: false, ...o });
  const script = [
    { id: 0, g: 1, intent: 'drop', kind: 'move.mute', lane: 0, expect: ['lane1.mute=true'], slip: { kind: 'wrong-row', row: 1 } },
    { id: 1, g: 1, intent: 'drop', kind: 'move.mute', lane: 0, expect: ['lane1.mute=false'] },
    { id: 2, g: 2, intent: 'mute', kind: 'click', sel: '#lane-tabs button:nth-child(3)', expect: ['select'], slip: { kind: 'offset', dx: 30, dy: 0 } },
    { id: 3, g: 2, intent: 'mute', kind: 'click', sel: '#btn-mute', expect: ['lane3.mute=true'] },
    { id: 4, g: 3, intent: 'knobs', kind: 'drag', sel: '#sliders .gauge:nth-child(2)', expect: ['lane2.euclidK', 'lane2.hits*'] },
    { id: 5, g: 4, intent: 'knobs', kind: 'move.knob', knob: 1, turns: -1, expect: ['lane4.euclidK', 'lane4.hits*'] },
    { id: 6, g: 5, intent: 'build', kind: 'move.step', step: 2, expect: ['lane2.hits.*'] },
    { id: 7, g: 6, intent: 'build', kind: 'click', sel: '#stepsui button:nth-child(4)', expect: ['lane3.hits.*', 'lane3.accents.*', 'lane3.locks.*'], slip: { kind: 'double' } },
    { id: 8, g: 6, intent: 'build', kind: 'move.knob', knob: 1, turns: -2, expect: [], slip: { kind: 'stray-knob', of: 7 } },
  ];
  const runs = script.map((a, i) => ({ id: a.id, t0: i * 1000, t1: i * 1000 + 900 }));
  const { entries: t, accidents } = tagAccidents([
    e(0, 100, 'lane2.mute', false, true, { voice: 'clap' }),        // the wrong row: the clap went, the kick stayed
    e(1, 1100, 'lane1.mute', false, true, { voice: 'kick' }),       // "bring it back" muted the kick: the hand meant false
    e(2, 3100, 'lane2.mute', false, true, { voice: 'snare' }),      // the tab click missed: Mute hit the lane still selected
    e(3, 4100, 'lane2.euclidK', 1, 3), e(4, 4850, 'lane2.euclidK', 3, 5),   // one drag that rested: both are the drag
    e(5, 5100, 'lane4.hits', 'xx.x............', '................'),     // the hits knob down on a hand-drawn lane: its own re-fill
    e(6, 6100, 'lane2.hits.3', false, true), e(7, 6300, 'lane2.hits.3', true, false),
    e(8, 7100, 'lane3.hits.4', false, true), e(9, 7190, 'lane3.accents.4', false, true),   // a double click on an empty cell: on, then accent
    e(10, 8100, 'lane3.hits', '.x.x', '....'),                       // the brushed hits knob emptied the lane
  ], runs, script), by = (id) => t.find(x => x.id === id);
  assert.deepEqual([by(0).class, by(0).cause], ['harmless', 'wrong-row']);
  assert.deepEqual([by(1).intended, by(1).class, by(1).cause], [false, 'destructive', 'wrong-row'], 'the kick muted by the unmute, caused by the earlier wrong row');
  assert.deepEqual([by(2).class, by(2).cause], ['harmless', 'offset'], 'the wrong-lane mute is the missed click\'s');
  assert.equal(by(3).intended, true); assert.equal(by(4).intended, true);
  assert.deepEqual([by(5).intended, by(5).emptied], [true, true], 'what the turned knob does to the steps is the turn');
  assert.equal(by(6).intended, true); assert.deepEqual([by(7).class, by(7).cause], ['harmless', 'side effect'], 'a step entered twice by one press is still the second press');
  assert.equal(by(8).intended, true); assert.deepEqual([by(9).intended, by(9).class, by(9).cause], [false, 'harmless', 'double'], 'the second click of a double is the accident, whatever field it changed');
  assert.deepEqual([by(10).class, by(10).cause, by(10).emptied], ['harmless', 'stray-knob', true], 'an emptied lane is reported beside A3\'s classes, not as one');
  assert.deepEqual([accidents.destructive, accidents.harmless], [1, 5]); assert.deepEqual(accidents.emptied, { accident: 1, meant: 1 });
  // an emptied lane: every hit gone; thinning it is not
  assert.equal(emptied({ target: 'lane1.hits', before: 'x.x.', after: '....' }), true); assert.equal(emptied({ target: 'lane1.hits', before: 'x.x.', after: 'x...' }), false);
  assert.equal(emptied({ target: 'lane3.euclidK', before: 2, after: 0 }), true); assert.equal(emptied({ target: 'lane3.euclidK', before: 0, after: 0 }), false);
  assert.equal(classOf({ target: 'lane3.euclidK', before: 3, after: 0 }), 'harmless'); assert.equal(classOf({ target: 'chain', before: [1], after: [1, 2] }), 'destructive', 'a chain loads a slot');
  assert.equal(classOf({ target: 'lane1.locks.3', before: null, after: null }), 'silent', 'a turn that came back changed nothing');
  // the hits knob expects its re-fill too (Move and mouse); the Move protocol comes from movewire
  for (const x of performer({ seed: 5, minutes: 30, persona: 'kai' }).filter(x => x.kind === 'move.knob' && !x.shift && x.knob === 1)) assert.match(x.expect[1], /^lane\d\.hits\*$/);
  assert.equal(MOVE.PAD, 68); assert.equal(MOVE.BTN.track1, 43); assert.equal(KNOB_TARGETS[0], 'length');
});

test('RD-1 Move bytes, glance trials and scoring, the Move drawing', () => {
  assert.deepEqual(bytes.btn('mute', true), [0xB0, 88, 127]); assert.deepEqual(bytes.step(3, false), [0x80, 19, 0]); assert.deepEqual(bytes.pad(1, 2, true), [0x90, 78, 100]);
  assert.deepEqual(bytes.enc(2, -1), [0xB0, 73, 127]); assert.deepEqual(bytes.enc(2, 3), [0xB0, 73, 3]); assert.equal(trackOf(0), 'track4'); assert.equal(trackOf(3), 'track1');
  const k = glanceTrials(20, 1); assert.equal(k.length, 20); assert.deepEqual(k, glanceTrials(20, 1));
  for (const x of k) { assert.ok(['rhythm', 'sound', 'step', 'slots'].includes(x.page)); assert.ok(x.lane >= 1 && x.lane <= 4); }
  assert.equal(pageWord('Step 5'), 'step'); assert.equal(pageWord('the sound page'), 'sound'); assert.equal(pageWord('slots'), 'slots'); assert.equal(pageWord('rhythm'), 'rhythm'); assert.equal(pageWord('no idea'), null);
  const all = k.map(x => ({ trial: x.trial, page: x.page, lane: x.lane })), s = scoreGlance(k, all); assert.equal(s.right, 20); assert.equal(s.pass, true);
  const two = all.map((a, i) => (i < 3 ? { ...a, lane: a.lane === 1 ? 2 : 1 } : a)), s2 = scoreGlance(k, two); assert.equal(s2.right, 17); assert.equal(s2.pass, false); assert.equal(s2.pageRight, 20);
  assert.equal(scoreGlance(k, []).right, 0);
  const leds = ledsOf([[0x90 * 256 + MOVE.PAD, 120], [0x90 * 256 + MOVE.STEP + 15, 8], [0xB0 * 256 + MOVE.BTN.play, 120]]);
  assert.equal(leds.pads[0], 120); assert.equal(leds.pads[1], 0); assert.equal(leds.steps[15], 8); assert.equal(leds.buttons.play, 120); assert.equal(leds.buttons.mute, 0);
  const svg = drawMove(leds, (i) => `#${i.toString(16).padStart(6, '0')}`);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/); assert.equal((svg.match(/<rect x="\d+" y="(150|212|274|336)" width="58"/g) || []).length, 32, '32 pads');
  assert.ok(svg.includes('fill="#000078"'), 'a lit LED takes its palette colour');
});
