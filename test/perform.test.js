import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MuteQueue, FillLatch, Guard, HOLD_MS } from '../src/poly/perform.js';

test('P2 mute queue: lanes wait for the bar line with the mute asked, a second press takes one back', () => {
  const q = new MuteQueue(), lanes = [{ muted: false }, { muted: true }, { muted: false }];
  assert.equal(q.toggle(2, true), true); assert.equal(q.toggle(0, true), true); assert.equal(q.has(2), true); assert.equal(q.size, 2);
  assert.equal(q.target(0), true); assert.equal(q.target(1), undefined);
  assert.equal(q.toggle(2, true), false, 'pressed again before the bar: nothing waits'); assert.equal(q.has(2), false);
  q.toggle(5, true); q.trim(4); assert.equal(q.has(5), false, 'a lane the pattern lost drops out');
  q.toggle(1, false); assert.deepEqual(JSON.parse(JSON.stringify(q)), { 0: true, 1: false }, 'readable from the console');
  assert.deepEqual(q.apply(lanes), [0, 1], 'the bar line lands what waits'); assert.deepEqual(lanes.map(l => l.muted), [true, false, false]);
  assert.equal(q.size, 0); assert.deepEqual(q.apply(lanes), [], 'and only once');
  q.toggle(0, true); assert.deepEqual(q.apply(lanes), [], 'a lane already as asked doesn\'t change'); assert.equal(q.size, 0, 'but stops waiting');
});

test('P3 fill latch: armed → the next bar fills → off at the bar after', () => {
  const f = new FillLatch(); assert.equal(f.on, false);
  assert.equal(f.arm(), 'armed'); assert.equal(f.on, false, 'not before the bar line');
  assert.equal(f.bar(), true); assert.equal(f.on, true, 'the whole next bar');
  assert.equal(f.arm(), 'on', 'pressing while it fills changes nothing');
  assert.equal(f.bar(), true); assert.equal(f.on, false); assert.equal(f.bar(), false, 'idle bar lines do nothing');
  f.arm(); assert.equal(f.arm(), 'off', 'again before it starts = cancel'); f.arm(); f.clear(); assert.equal(f.state, 'off');
});

test('P1 guard: Shift acts at once, a hold acts once, a short tap cancels, a quick re-press is a new hold', () => {
  assert.equal(HOLD_MS, 600);
  const g = new Guard();
  assert.equal(g.press('capture', true).now, true); assert.equal(g.release('capture'), null, 'Shift already acted');
  const a = g.press('delete', false); assert.equal(a.now, false); assert.equal(g.held('delete'), true);
  assert.equal(g.fire('delete', a.id), true, 'held to the end: acts'); assert.equal(g.fire('delete', a.id), false, 'once');
  assert.equal(g.release('delete'), null);
  const b = g.press('delete', false); assert.equal(g.release('delete'), 'cancel', 'let go early: nothing');
  assert.equal(g.fire('delete', b.id), false, 'the timer of a released press does nothing');
  const c = g.press('delete', false); g.release('delete'); const d = g.press('delete', false);
  assert.equal(g.fire('delete', c.id), false, 'the first tap\'s timer can\'t fire the second press early');
  assert.equal(g.fire('delete', d.id), true);
});

test('P4 Lane.at with an origin: step 1 and loop 1 start there, nothing steps before it', async () => {
  const { Lane, PPQ } = await import('../src/poly/lanes.js');
  const l = new Lane('kick', { length: 3 }); l.setEuclid(3); l.trigs[0] = { cond: 'first', ratchet: 1 };
  const o = 7 * PPQ;   // a slot restarted on beat 8: not a multiple of the length
  assert.equal(l.at(o - PPQ, () => 0, { origin: o }), null, 'before the origin nothing steps');
  const ev = [0, 1, 2, 3].map(k => l.at(o + k * PPQ, () => 0, { origin: o }));
  assert.deepEqual(ev.map(e => e.index), [0, 1, 2, 0], 'step 1 on the origin');
  assert.deepEqual(ev.map(e => e.loop), [0, 0, 0, 1]); assert.equal(ev[0].hit, true, '"first" plays on the restart'); assert.equal(ev[3].hit, false, 'and not on loop 2');
  const free = new Lane('kick', { length: 3 }); free.setEuclid(3); free.trigs[0] = { cond: 'first', ratchet: 1 };
  assert.equal(free.at(o, () => 0).index, 1, 'without an origin it counts from tick 0'); assert.equal(free.at(o + 2 * PPQ, () => 0).hit, false, 'and its first loop is long gone');
  const { Machine } = await import('../src/poly/lanes.js'); const m = new Machine(); m.lanes[0].setLength(3); m.lanes[0].setEuclid(3); m.origin = o;
  assert.equal(m.tick(o)[0].index, 0, 'Machine.tick hands the origin to Lane.at'); assert.equal(m.tick(o - PPQ)[0], null);
});

test('P4 slots: restart persists (old banks: on); the cycle lines up from the origin', async () => {
  const { SlotBank } = await import('../src/poly/slots.js'); const { BAR_TICKS: B, PPQ } = await import('../src/poly/lanes.js');
  const store = new Map(), st = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const b = new SlotBank(st); assert.equal(b.restart, true); b.save(0, { lanes: [] }); b.save(1, { lanes: [] });
  b.recall(1); assert.equal(b.due(B + PPQ, 1, { at: 0, len: B }), -1, 'bar mode: not mid-bar'); assert.equal(b.due(2 * B, 1, { at: 0, len: B }), 1);
  b.restart = false; b.persist(); assert.equal(new SlotBank(st).restart, false);
  store.set('midi-warz.poly.slots.v1', JSON.stringify({ slots: [null], switchAt: 'bar' })); assert.equal(new SlotBank(st).restart, true, 'an older bank restarts');
  const c = new SlotBank(); c.save(0, { lanes: [] }); c.switchAt = 'cycle'; c.recall(0);
  const o = 3 * PPQ, cyc = 6 * PPQ;
  assert.equal(c.nextSwitch(o + PPQ, cyc, { at: 0, len: B }, o), o + cyc, 'next cycle counted from the origin');
  assert.equal(c.due(cyc, cyc, { at: 0, len: B }, o), -1, 'not on the bar anchor\'s cycle'); assert.equal(c.due(o + cyc, cyc, { at: 0, len: B }, o), 0);
});

test('P4 chain export with restart: every slot starts on step 1', async () => {
  const { collectChain } = await import('../src/poly/export.js'); const { Machine } = await import('../src/poly/lanes.js');
  const s = new Machine(); s.lanes.forEach(l => l.clear()); s.lanes[0].setLength(3); s.lanes[0].hits[0] = true; const j = s.toJSON();
  const at = (restart) => collectChain([j, j], { bars: 1, tempo: 120, restart }).filter(h => h.li === 0).map(h => Math.round(h.time * 2));   // in beats at 120 bpm
  assert.deepEqual(at(true), [0, 3, 4, 7], 'slot 2 restarts on its first beat'); assert.deepEqual(at(false), [0, 3, 6], 'without: the count runs on');
});

test('P5 MIDI out offset: notes, note-offs, clock and start move by it; auto = output latency; clamped and saved', async () => {
  const { PolyMidi, LATENCY_MAX } = await import('../src/poly/midiio.js'); const sent = [];
  const port = { name: 'DAW', send: (b, t) => sent.push([b[0], t]) };
  const p = new PolyMidi({ getAccess: () => ({ outputs: new Map([['a', port]]), inputs: new Map() }) }); p.setOutput('DAW'); p.clockOut = true; p.gateMs = 60;
  p.autoMs = 12.4; assert.equal(p.latencyMs, 12, 'auto: the output latency');
  p.note(0, 1, 1000); p.clockAt(0, 1000); p.start(1000);
  assert.deepEqual(sent, [[0x99, 1012], [0x89, 1072], [0xF8, 1012], [0xFA, 1012]]);
  sent.length = 0; p.offsetMs = -20; p.note(0, 1, 1000); assert.deepEqual(sent[0], [0x99, 980], 'a manual offset wins, earlier too');
  p.offsetMs = 400; assert.equal(p.latencyMs, LATENCY_MAX, 'clamped');
  const q = new PolyMidi({ getAccess: () => null }); q.fromJSON(JSON.parse(JSON.stringify({ ...p.toJSON(), offsetMs: -7 }))); assert.equal(q.offsetMs, -7);
  q.fromJSON({ outName: '' }); assert.equal(q.offsetMs, null, 'older settings: auto');
});

test('P7 condition loops for the step buttons', async () => {
  const { condLoops } = await import('../src/poly/perform.js');
  const s = (c) => condLoops(c, 8).map(v => v === null ? '?' : v ? 'x' : '.').join('');
  assert.equal(s('always'), 'xxxxxxxx'); assert.equal(s(undefined), 'xxxxxxxx'); assert.equal(s('1:2'), 'x.x.x.x.'); assert.equal(s('3:4'), '..x...x.');
  assert.equal(s('first'), 'x.......'); assert.equal(s('not first'), '.xxxxxxx'); assert.equal(s('fill'), '????????'); assert.equal(s('not pre'), '????????');
  assert.equal(condLoops('2:3').length, 16);
});

test('P6 filter knob: centre is a wire, each side exponential, the wheel stops at the centre', async () => {
  const { fxFreqs, stepFilter, FX_LP_MIN, FX_HP_MIN, FX_HP_MAX } = await import('../src/poly/perform.js');
  assert.deepEqual(fxFreqs(0, 48000), { lp: 24000, hp: 0 }, 'off: low-pass at Nyquist, high-pass at 0 Hz (both pass everything)');
  assert.equal(Math.round(fxFreqs(-1).lp), FX_LP_MIN); assert.equal(Math.round(fxFreqs(1).hp), FX_HP_MAX); assert.equal(fxFreqs(-1).hp, 0); assert.equal(fxFreqs(1).lp, 22050);
  assert.ok(Math.abs(fxFreqs(-0.5).lp - Math.sqrt(22050 * FX_LP_MIN)) < 1, 'half way = the geometric middle'); assert.ok(fxFreqs(0.01).hp >= FX_HP_MIN);
  assert.equal(stepFilter(0, -1), -0.04); assert.equal(stepFilter(-0.04, 3), 0, 'crossing the centre stops on it'); assert.equal(stepFilter(0, 3), 0.12, 'and goes on from there');
  assert.equal(stepFilter(0.98, 5), 1); assert.equal(stepFilter(-1, -2), -1, 'clamped'); assert.equal(stepFilter(0.04, -1), 0, 'landing on the centre');
});

test('P2 mute on next bar: a mute queued mid-bar silences the lane from the bar line on, not before', async () => {
  const { Machine, BAR_TICKS: B, PPQ } = await import('../src/poly/lanes.js'); const { onBar } = await import('../src/poly/slots.js');
  const m = new Machine(); m.lanes.forEach(l => l.clear()); m.lanes[1].setLength(4); m.lanes[1].setEuclid(4);   // a hit on every beat
  const q = new MuteQueue(), bars = { at: 0, len: B }, heard = [];
  // the app's clock order: bar-line work (barPerf) before the lanes step on that tick
  for (let t = 0; t < 3 * B; t++) {
    if (t === B + PPQ + 5) q.toggle(1, !m.lanes[1].muted);   // pressed during bar 2, just after beat 2
    if (q.size && onBar(t, bars)) q.apply(m.lanes);
    const ev = m.tick(t, () => 0)[1]; if (ev?.hit) heard.push(t / PPQ);
  }
  assert.deepEqual(heard, [0, 1, 2, 3, 4, 5, 6, 7], 'bar 2 plays out whole; bar 3 is silent from its downbeat');
});

test('ORBIT2-11 r1 P2: a queued mute lands as asked when a slot comes in on the same bar line', async () => {
  const { Machine } = await import('../src/poly/lanes.js');
  for (const ask of [false, true]) {   // lane 1 muted, "unmute ⇥ bar" / playing, "mute ⇥ bar"
    const m = new Machine(); m.lanes[0].muted = !ask; const q = new MuteQueue(); q.toggle(0, !m.lanes[0].muted);
    const slot = m.toJSON(); slot.lanes[0].muted = ask;   // the slot due on that line has lane 1 the way that was asked
    const next = Machine.from(slot); q.apply(next.lanes);   // the clock: bank.due loads the slot, then barPerf
    assert.equal(next.lanes[0].muted, ask, `asked ${ask ? 'mute' : 'unmute'} (a flip of the slot's lane gave ${!ask})`);
  }
});

test('ORBIT2-11 r1 P7: a step held LOOK_MS is a look (its release toggles nothing), a tap still toggles', async () => {
  const { MovePages, LOOK_MS } = await import('../src/poly/pages.js'); const { LONG_MS } = await import('../src/ui.js');
  assert.equal(LOOK_MS, LONG_MS, 'as long as a long-press on screen');
  const p = new MovePages();
  p.press(0, 0, 0, 1000); assert.equal(p.looked(1000 + LOOK_MS - 1), null, 'may still be a tap: the buttons keep showing the steps');
  assert.deepEqual(p.release(0, 1000 + LOOK_MS - 1), { step: 0, used: false }, 'a tap: the app toggles the step');
  p.press(1, 1, 0, 2000); assert.equal(p.looked(2000 + LOOK_MS).step, 1, 'held: the buttons show its loops');
  assert.deepEqual(p.release(1, 2000 + LOOK_MS + 300), { step: 1, used: true }, 'a look: nothing toggles');
  p.press(2, 2, 0, 3000); p.held.get(2).used = true; assert.equal(p.looked(3001).step, 2, 'a knob turned: its loops at once');
  p.release(2, 3002); assert.equal(p.held.size + p.down.size, 0); assert.equal(p.looked(9999), null);
});

test('ORBIT2-11 r1 P7: the white "now" marker sits on the loop playing, past loop 16 too', async () => {
  const { condLoops, loopWindow } = await import('../src/poly/perform.js'); const { condPasses } = await import('../src/poly/lanes.js');
  assert.deepEqual([-1, 0, 15, 16, 17, 33].map(n => loopWindow(n)), [0, 0, 0, 16, 16, 32], 'stopped: loops 1–16; else the 16 holding the loop playing');
  for (const c of ['1:3', '2:3', '3:3', '3:4', '1:2', 'first', 'not first', 'always'])
    for (let now = 0; now < 64; now++) { const from = loopWindow(now); assert.equal(condLoops(c, 16, from)[now - from], condPasses(c, now), `${c} on loop ${now + 1}`); }
  assert.equal(condLoops('first', 16, 16).some(Boolean), false, 'loops 17–32: "first" never plays again');
});

test('ORBIT2-11 r1 P5: auto = the native output latency + the master look-ahead; stop leaves after the last clock', async () => {
  const { autoLatencyMs, PolyMidi } = await import('../src/poly/midiio.js'); const { MIDI_DIV } = await import('../src/poly/lanes.js');
  assert.equal(autoLatencyMs({ _nativeAudioContext: { outputLatency: 0.02 } }, 0.012), 32, 'Tone\'s wrapper has none: the native context behind it');
  assert.equal(autoLatencyMs({ outputLatency: 0.01, _nativeAudioContext: { outputLatency: 0.5 } }), 10, 'a context that has it is read first');
  assert.equal(autoLatencyMs({}), 0); assert.equal(autoLatencyMs(null, NaN), 0);
  const sent = [], port = { name: 'DAW', send: (b, t) => sent.push([b[0], t]) };
  const p = new PolyMidi({ getAccess: () => ({ outputs: new Map([['a', port]]), inputs: new Map() }) }); p.setOutput('DAW'); p.clockOut = true; p.offsetMs = 30;
  p.stop(500); assert.deepEqual(sent.pop(), [0xFC, 530], 'the transport\'s stop + the offset, like the clocks');
  p.start(1000); p.clockAt(0, 1000); p.clockAt(MIDI_DIV, 1020); p.stop(1010);
  assert.deepEqual(sent.at(-1), [0xFC, 1050], 'never before a clock already scheduled (1020 + 30 ms)');
  p.stop(1100); assert.deepEqual(sent.at(-1), [0xFC, 1130]);
  p.start(1090); assert.deepEqual(sent.at(-1), [0xFA, 1131], 'r2: a quick restart\'s start never leaves before the stop on its way');
  p.start(1200); assert.deepEqual(sent.at(-1), [0xFA, 1230]);
  // the auto offset reads a private field of the vendored standardized-audio-context: a Tone update without it would
  // silently drop the output latency again
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../vendor/tone/Tone.js', import.meta.url), 'utf8'), /_nativeAudioContext/, 'Tone\'s wrapper keeps its native context where autoLatencyMs reads it');
});

test('ORBIT2-11 r1 wiring: cues unlike any lane colour, a clicked throw leaves Space to play, auto latency, print at the heard cutoffs', async () => {
  const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  const { nearestPaletteIndex, COLOR } = await import('movewire');
  const leds = JSON.parse(src.match(/const LANE_HEX = (\[[^\]]+\])/)[1].replace(/'/g, '"')).map(nearestPaletteIndex), cue = COLOR[src.match(/const CUE_LED = COLOR\.(\w+)/)[1]];
  assert.equal(leds.includes(cue), false, 'no lane LED has the cue colour'); assert.equal(leds.includes(nearestPaletteIndex('#67e8f9')), true, 'cyan is lane 2\'s: why the cue isn\'t cyan');
  assert.match(src, /mute\.held \? \(muteQ\.has\(li\) \? CUE_LED/, 'Mute held: a waiting mute in the cue colour'); assert.match(src, /loops\[i\] === null \? CUE_LED/, 'P7: "depends" in the cue colour');
  assert.match(src, /th\.addEventListener\('keydown', \(e\) => \{ if \(\(e\.key === ' ' \|\| e\.key === 'Enter'\) && !e\.repeat && controlOwnsKey\(e\)\)/, 'keys hold the throw only when the keyboard owns the button');
  assert.match(src, /pmidi\.autoMs = autoLatencyMs\(raw, /); assert.doesNotMatch(src, /autoMs = \(T\.getContext\(\)\.rawContext\.outputLatency/);
  assert.match(src, /pages\.press\(btn, step, first, performance\.now\(\)\)/); assert.match(src, /pages\.release\(btn, performance\.now\(\)\)/); assert.match(src, /pages\.looked\(performance\.now\(\)\)/);
  assert.match(src, /muteQ\.toggle\(li, !m\.lanes\[li\]\.muted\)/); assert.match(src, /muteQ\.apply\(m\.lanes\)/);
  assert.match(src, /new T\.Gain\(fx\.throw \? THROW\.send : 0\)/, 'a throw held while the kit is built starts thrown');
  assert.match(src, /fxFreqs\(fx\.filter, fx\.sr \|\| raw\.sampleRate\)/); assert.match(src, /\{ filter: pfx\.filter, sr: T\.getContext\(\)\.rawContext\.sampleRate \}/, 'a print keeps the cutoffs heard live');
  // the clock order a waiting mute relies on: the slot due on a bar line loads, evolve (its way home brings back the
  // home lanes' mutes) runs, then barPerf lands the mutes, then the lanes step (r2: evolve came after the mutes)
  const tick = src.slice(src.indexOf('function onTick('), src.indexOf('function retime(')), at = (s) => tick.indexOf(s);
  assert.ok(at('bank.due(') < at('evolveNow(') && at('evolveNow(') < at('barPerf()') && at('barPerf()') < at('liveQuiet('), 'slot → evolve → mutes → the lanes step');
  // r2: MIDI stop goes with the transport's own stop time (start keeps its lead on the first clock, guarded in PolyMidi);
  // the first Play waits for the look-ahead measure
  assert.match(src, /T\.getTransport\(\)\.start\('\+0\.05'\); pmidi\.start\(performance\.now\(\) \+ 50\)/); assert.match(src, /const at = T\.now\(\); T\.getTransport\(\)\.stop\(at\); pmidi\.stop\(perfAt\(at\)\)/);
  assert.match(src, /buildLoops\(\); await setAutoLatency\(\); \}/);
});
