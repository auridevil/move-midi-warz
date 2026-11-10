import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euclid, Lane, Machine, RATIOS, SOUND_KEYS, DEFAULT_SOUND } from '../src/poly/lanes.js';
import { KITS } from '../src/poly/kits.js';
import { VOICE_KEYS } from '../src/poly/voices.js';

test('euclid spreads hits evenly and starts on a hit', () => {
  assert.deepEqual(euclid(3, 8).map(Number).join(''), '10010010');
  assert.deepEqual(euclid(5, 8).map(Number).join(''), '10101101');
  assert.deepEqual(euclid(2, 5).map(Number).join(''), '10010'); assert.deepEqual(euclid(3, 7).map(Number).join(''), '1001010');
  assert.equal(euclid(0, 7).filter(Boolean).length, 0); assert.equal(euclid(9, 4).filter(Boolean).length, 4);
});
test('lane length, rotation, toggles, accents', () => {
  const l = new Lane('kick', { length: 4 }); l.setEuclid(2); assert.deepEqual(l.hits.slice(0, 4), [true, false, true, false]);
  l.rotation = 1; assert.equal(l.hitAt(0), false); assert.equal(l.hitAt(1), true);
  assert.equal(l.toggle(3), true); assert.equal(l.toggle(9), false, 'beyond length is ignored');
  l.toggleAccent(0); assert.equal(l.accentAt(1), true, 'accents rotate with the hits');
  l.setLength(20); assert.equal(l.length, 16); l.setLength(0); assert.equal(l.length, 1);
});
test('a lane walks its loop from the master tick, respects mute and probability', () => {
  const l = new Lane('hat', { length: 3 }); l.setEuclid(3);
  const out = [0, 1, 2, 3].map(s => l.at(s * 24, () => 0.5)); assert.deepEqual(out.map(o => o.index), [0, 1, 2, 0]); assert.ok(out.every(o => o.hit));
  l.prob = 0.3; assert.equal(l.at(0, () => 0.9).hit, false); l.prob = 1; l.muted = true; assert.equal(l.at(0).hit, false);
  l.swing = 0.25; l.muted = false; assert.equal(l.at(24).swung, 0.25); assert.equal(l.at(48).swung, 0);
});
test('machine: step seconds follow ratio and tempo; cycle length; (de)serialisation', () => {
  const m = new Machine(); const [k, s] = m.lanes; k.setRatio(5); s.setRatio(7); // 1 and 2
  assert.equal(m.stepSeconds(k, 120), 0.5, 'ratio 1 = a quarter note'); assert.equal(m.stepSeconds(s, 120), 0.25, 'ratio 2 = an eighth');
  m.lanes.forEach(l => l.setRatio(5)); m.lanes[0].setLength(4); m.lanes[1].setLength(3); m.lanes[2].setLength(4); m.lanes[3].setLength(4); assert.equal(m.cycleSteps(), 12);
  m.randomize(() => 0.42); const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.deepEqual(copy.toJSON(), m.toJSON()); assert.equal(RATIOS.length, 10);
});

test('per-lane sound params clamp and survive save/load', () => {
  const m = new Machine(); const l = m.lanes[2]; assert.equal(SOUND_KEYS.length, 8);
  assert.equal(l.setSound('drive', 1.7), 1); assert.equal(l.setSound('pan', -2), 0); assert.equal(l.setSound('nope', 0.5), undefined);
  const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(copy.lanes[2].sound.drive, 1); assert.equal(copy.lanes[0].sound.tone, 0.75);
});

test('kits reference real voices and apply without touching patterns', () => {
  for (const [k, kit] of Object.entries(KITS)) { assert.equal(kit.lanes.length, 4, k); for (const l of kit.lanes) { assert.ok(VOICE_KEYS.includes(l.voice), `${k}: ${l.voice}`); for (const sk of Object.keys(l.sound || {})) assert.ok(SOUND_KEYS.includes(sk), `${k}: sound.${sk}`); } }
  const m = new Machine(); m.lanes[0].setEuclid(3); const hits = [...m.lanes[0].hits];
  m.applyKit(KITS.space, DEFAULT_SOUND); assert.equal(m.lanes[1].voice, 'bell'); assert.equal(m.lanes[0].sound.send, 0.4); assert.deepEqual(m.lanes[0].hits, hits); assert.equal(m.kit, 'Space');
  const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(copy.lanes[2].voice, 'blip'); assert.equal(copy.kit, 'Space');
  assert.ok(VOICE_KEYS.length >= 14);
});

test('kits: every lane uses an existing voice and only known sound keys', async () => {
  const { VOICES } = await import('../src/poly/voices.js'); const { KITS } = await import('../src/poly/kits.js'); const { SOUND_KEYS } = await import('../src/poly/lanes.js');
  for (const [id, kit] of Object.entries(KITS)) { assert.equal(kit.lanes.length, 4, id); for (const l of kit.lanes) { assert.ok(VOICES[l.voice], `${id}: ${l.voice}`); for (const k of Object.keys(l.sound || {})) assert.ok(SOUND_KEYS.includes(k), `${id}: sound key ${k}`); } }
});

test('master clock: lanes derive their step from the tick and stay phase-locked', async () => {
  const { PPQ, BAR_TICKS } = await import('../src/poly/lanes.js');
  const m = new Machine(); const [k, , h] = m.lanes; k.setRatio(5); k.setLength(4); k.setEuclid(4); h.setRatio(9); h.setLength(8); h.setEuclid(8); // ×1 and ×4
  assert.equal(PPQ, 24); assert.equal(BAR_TICKS, 96); assert.equal(k.stepTicks(), 24); assert.equal(h.stepTicks(), 6);
  const evs = []; for (let t = 0; t < BAR_TICKS; t++) { const e = m.tick(t, () => 0); if (e[0]) evs.push(['k', t, e[0].index]); if (e[2]) evs.push(['h', t, e[2].index]); }
  assert.equal(evs.filter(e => e[0] === 'k').length, 4); assert.equal(evs.filter(e => e[0] === 'h').length, 16);
  assert.deepEqual(evs.filter(e => e[0] === 'k').map(e => e[1]), [0, 24, 48, 72]);
  // change speed mid-play: the position comes from the tick, so ×2 at tick 96 is step 8 → index 0 of a 4-step lane, on the beat
  k.setRatio(7); const e = k.at(96, () => 0); assert.equal(e.step, 8); assert.equal(e.index, 0); assert.equal(k.at(100), null);
  for (const r of RATIOS) assert.ok(Number.isInteger(PPQ / r), `ratio ${r} is a whole number of ticks`);
  assert.equal(m.cycleTicks(), Math.round(m.cycleSteps() * 24));
});
test('step locks: clamp, read through rotation, override prob, survive save/load', () => {
  const l = new Lane('snare', { length: 4 }); l.setEuclid(4);
  assert.equal(l.setLock(1, 'tune', 3), 1); assert.equal(l.setLock(1, 'vel', -1), 0); assert.equal(l.setLock(1, 'nope', 1), undefined);
  l.setLock(2, 'prob', 0); assert.equal(l.at(48, () => 0.5).hit, false, 'prob lock 0 silences the step'); assert.equal(l.at(24, () => 0.5).hit, true);
  l.rotation = 1; assert.deepEqual(l.lockAt(2), { tune: 1, vel: 0 }, 'locks move with the rotation');
  const c = Lane.from(JSON.parse(JSON.stringify(l))); assert.deepEqual(c.locks[1], { tune: 1, vel: 0 }); assert.equal(c.locks[0], null);
  c.clearLocks(1); assert.equal(c.locks[1], null); l.clear(); assert.ok(l.locks.every(x => x === null));
});
test('live record quantize: nearest rounds forward, previous files under the last step', () => {
  const l = new Lane('kick', { length: 4 }); // ×1: 24 ticks per step
  assert.deepEqual(l.quantize(23), { step: 1, index: 1, ahead: true }); assert.deepEqual(l.quantize(23, 'previous'), { step: 0, index: 0, ahead: false });
  assert.equal(l.quantize(24 * 5 + 2).index, 1); assert.equal(l.quantize(-3).index, 0);
  assert.equal(l.quantize(12).step, 1, 'half way: the coming step');
  // swung lanes: a hit played with a swung step is filed under it (round 2: at 50 % it went to the next step)
  const h = new Lane('hat', { length: 8, ratioIndex: RATIOS.indexOf(4) }); h.swing = 0.5;   // 6 ticks per step, odd steps 3 ticks late
  for (const s of [1, 3, 5]) { assert.equal(h.quantize(s * 6 + 3).step, s, `on swung step ${s}`); assert.equal(h.quantize(s * 6 + 4, 'previous').step, s, `just after swung step ${s}`); }
  assert.equal(h.quantize(6 + 2, 'previous').step, 0, 'swung step 1 has not sounded yet'); assert.equal(h.quantize(6 * 2 - 1).step, 2, 'just before the beat: the beat');
  const t = new Lane('hat', { length: 4, ratioIndex: RATIOS.indexOf(3) }); t.swing = 0.5;   // ×3: 8 ticks, only the middle of each three swings
  assert.equal(t.quantize(8 + 4).step, 1); assert.equal(t.quantize(16 + 1).step, 2, 'the last of three is straight');
});
test('evolve nudges only lanes that allow it and stays in range', () => {
  const m = new Machine(); m.lanes.forEach(l => { l.setLength(8); l.setEuclid(3); }); m.lanes[0].evolve = false; m.lanes[1].muted = true;
  let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 200; n++) { const ch = m.evolve({ scope: 'all', amount: 1 }, rng); assert.ok(ch.every(c => c.lane >= 2)); }
  assert.equal(m.lanes[0].euclidK, 3); assert.equal(m.lanes[0].rotation, 0);
  for (const l of m.lanes.slice(2)) { assert.ok(l.length >= 2 && l.length <= 16); assert.ok(l.rotation < l.length); assert.ok(l.ratioIndex >= 3 && l.ratioIndex <= 8); assert.ok(l.hits.slice(0, l.length).some(Boolean)); }
  const r = new Machine(); r.lanes.forEach(l => l.setEuclid(2)); const before = JSON.stringify(r.lanes.map(l => l.hits)); r.evolve({ scope: 'rotate', amount: 1 }, rng); assert.equal(JSON.stringify(r.lanes.map(l => l.hits)), before, 'rotate scope never rewrites hits');
  const a = new Machine(); a.lanes[0].setEuclid(1); const b = new Machine(); b.assign(JSON.parse(JSON.stringify(a))); assert.deepEqual(b.toJSON(), a.toJSON());
});
test('slot bank: save, queue on bar / cycle, chains advance every N bars, persistence', async () => {
  const { SlotBank } = await import('../src/poly/slots.js'); const mem = new Map(); const store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const b = new SlotBank(store); b.save(0, { a: 1 }); b.save(3, { a: 2 }); assert.equal(b.current, 3);
  assert.equal(b.recall(5), false, 'empty slot'); b.recall(0); assert.equal(b.due(10, 192), -1); assert.equal(b.due(96, 192), 0); assert.equal(b.current, 0);
  b.switchAt = 'cycle'; b.recall(3); assert.equal(b.due(96, 192), -1); assert.equal(b.due(192, 192), 3);
  b.switchAt = 'now'; b.recall(0); assert.equal(b.due(5, 192), 0);
  b.switchAt = 'bar'; b.chainBars = 2; b.setChain([0, 7, 3]); assert.deepEqual(b.chain, [0, 3], 'empty slots are skipped');
  const loads = []; for (let t = 0; t <= 96 * 6; t++) { const i = b.due(t, 192); if (i >= 0) loads.push([t / 96, i]); }
  assert.deepEqual(loads, [[0, 0], [2, 3], [4, 0], [6, 3]]);
  const c = new SlotBank(store); assert.deepEqual(c.get(3), { a: 2 }); assert.deepEqual(c.chain, [0, 3]); assert.equal(c.chainBars, 2);
  c.erase(0); assert.deepEqual(c.chain, [3]); assert.equal(c.filled(0), false);
});
test('MIDI I/O: notes with gate, clock out only when enabled, clock in follows tempo and transport', async () => {
  const { PolyMidi } = await import('../src/poly/midiio.js'); const sent = []; const port = { name: 'DAW', send: (b, t) => sent.push([...b, t]) }; const move = { name: 'Ableton Move', send: () => sent.push('move!') };
  const access = { outputs: new Map([['a', port], ['b', move]]), inputs: new Map() };
  const p = new PolyMidi({ getAccess: () => access, isMovePort: (x) => /move/i.test(x.name) });
  assert.equal(p.setOutput('Ableton Move'), false, 'Move port refused in control mode'); p.note(0, 1, 0); assert.equal(sent.length, 0);
  p.setOutput('DAW'); p.lanes[1] = { note: 40, ch: 2 }; p.note(1, 0.5, 1000); assert.deepEqual(sent, [[0x91, 40, 64, 1000], [0x81, 40, 0, 1060]]);
  sent.length = 0; p.clock(5); assert.equal(sent.length, 0); p.clockOut = true; p.clock(5); p.start(6); assert.deepEqual(sent, [[0xF8, 5], [0xFA, 6]]);
  const got = []; p.handlers = { tempo: b => got.push(b), start: () => got.push('start'), stop: () => got.push('stop') };
  p.follow = 'tempo'; for (let i = 0; i < 49; i++) p.receive([0xF8], i * 20.8333); p.receive([0xFA], 0); assert.deepEqual(got, [120], '24 ticks per 500 ms = 120 bpm (first reading after half a beat); start ignored in tempo mode');
  p.follow = 'transport'; p.receive([0xFA], 0); p.receive([0xFC], 0); assert.deepEqual(got.slice(1), ['start', 'stop']);
  const q = new PolyMidi({ getAccess: () => null }); q.fromJSON(JSON.parse(JSON.stringify(p))); assert.equal(q.lanes[1].note, 40); assert.equal(q.follow, 'transport'); assert.equal(q.clockOut, true);
});

test('trig conditions and ratchets: loop counting, fill, first, repeats', async () => {
  const { condPasses, CONDS } = await import('../src/poly/lanes.js');
  assert.deepEqual([0, 1, 2, 3].map(l => condPasses('1:2', l)), [true, false, true, false]); assert.deepEqual([0, 1, 2, 3].map(l => condPasses('3:4', l)), [false, false, true, false]);
  assert.equal(condPasses('fill', 0, true), true); assert.equal(condPasses('not fill', 0, true), false); assert.equal(condPasses('first', 1), false); assert.equal(condPasses('not first', 1), true);
  assert.ok(CONDS.includes('always'));
  const l = new Lane('kick', { length: 2 }); l.setEuclid(2); l.setTrig(0, { cond: '1:2' }); l.setTrig(1, { ratchet: 9, fade: true });
  const hits = []; for (let t = 0; t < 24 * 8; t += 24) { const e = l.at(t, () => 0); hits.push(e.hit ? (e.ratchet > 1 ? 'R' : 'x') : '.'); }
  assert.equal(hits.join(''), 'xR.RxR.R', 'step 0 every other loop, step 1 always as a 4× ratchet'); assert.equal(l.trigs[1].ratchet, 4, 'clamped');
  assert.equal(l.setTrig(1, { ratchet: 1, fade: false }), null, 'back to a plain step');
  const c = Lane.from(JSON.parse(JSON.stringify(l))); assert.deepEqual(c.trigs[0], { cond: '1:2', ratchet: 1, fade: false });
});
test('solo silences the others; choke and sample survive save/load', () => {
  const m = new Machine(); m.lanes.forEach(l => l.setEuclid(l.length)); m.lanes[2].solo = true; m.lanes[1].choke = 3; m.lanes[0].sample = { id: 'x', name: 'boom.wav' };
  const ev = m.tick(0, () => 0); assert.deepEqual(ev.map(e => e.hit), [false, false, true, false]);
  const c = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(c.lanes[2].solo, true); assert.equal(c.lanes[1].choke, 3); assert.equal(c.lanes[0].sample.name, 'boom.wav'); assert.equal(c.lanes[3].choke, -1);
});
test('dice: locked rolls repeat (per loop period), free rolls do not; streams are seeded', async () => {
  const { Dice, hash01 } = await import('../src/poly/dice.js'); const d = new Dice(); d.locked = true; d.seed = 42; d.repeat = 2;
  assert.equal(d.at(0, 3, 4), d.at(0, 3 + 8, 4), 'same after length × repeat steps'); assert.notEqual(d.at(0, 3, 4), d.at(0, 7, 4)); assert.notEqual(d.at(0, 3, 4), d.at(1, 3, 4));
  const a = d.stream(5), b = d.stream(5); assert.equal(a(), b()); assert.ok(hash01(1, 2) >= 0 && hash01(1, 2) < 1);
  const m1 = new Machine(), m2 = new Machine(); m1.randomize(d.stream(0)); m2.randomize(d.stream(0)); assert.deepEqual(m1.toJSON(), m2.toJSON(), 'randomize from a seed is reproducible');
  const l = new Lane('hat', { length: 4 }); l.setEuclid(4); l.prob = 0.5; const run = () => [...Array(16)].map((_, s) => l.at(s * 24, Math.random, { dice: d, li: 0 }).hit).join(); assert.equal(run(), run());
});
test('history: undo/redo, coalescing, redo cleared by a new edit', async () => {
  const { History } = await import('../src/poly/history.js'); const h = new History({ coalesceMs: 500 });
  h.commit('a', { now: 0 }); h.commit('b', { now: 1000 }); h.commit('c', { now: 1200 }); h.commit('d', { now: 3000 });   // b → c within 500 ms: one step
  assert.equal(h.undo().json, 'c'); assert.equal(h.undo().json, 'a', 'the knob turn b→c undoes in one go'); assert.equal(h.undo(), null);
  assert.equal(h.redo().json, 'c'); h.commit('e', { now: 9000 }); assert.equal(h.canRedo, false); assert.equal(h.undo().json, 'c');
  assert.equal(h.commit('c', { now: 9999 }), false, 'no change, no step');
});
test('export: hits with swing, ratchets and fade; MIDI file; share link round-trip', async () => {
  const { collectHits, collectChain, hitsToMidi, encodeShare, decodeShare, expandHits } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js');
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(5); k.setLength(4); k.setEuclid(4); k.setTrig(2, { ratchet: 3, fade: true });
  const hits = collectHits(m, { from: 0, to: 96, tempo: 120 }); assert.equal(hits.length, 6, '3 single hits + one ×3');
  assert.deepEqual(hits.map(h => +h.time.toFixed(3)), [0, 0.5, 1, 1.167, 1.333, 1.5]); assert.ok(hits[3].vel < hits[2].vel, 'fade');
  const sw = new Lane('hat', { length: 2 }); sw.setEuclid(2); sw.swing = 0.5; const e = sw.at(24, () => 0); assert.equal(expandHits(e, sw, 0, { tickSec: 1 / 48 })[0].dt, 0.25, 'half a step late');
  const mid = readMidi(hitsToMidi(hits, { tempo: 120, lanes: [{ note: 36, ch: 10 }, { note: 38, ch: 10 }, { note: 42, ch: 10 }, { note: 39, ch: 10 }], names: ['kick', 's', 'h', 'p'] }));
  assert.equal(mid.tracks.find(t => t.name === 'kick').notes.length, 6); assert.equal(mid.tracks.find(t => t.name === 'kick').notes[0].p, 36);
  assert.equal(collectChain([m.toJSON(), m.toJSON()], { bars: 1, tempo: 120 }).length, 12);
  k.voice = 'sample'; k.sample = { id: 'local', name: 'x.wav' };
  const back = await decodeShare(await encodeShare(m.toJSON(), 133)); assert.equal(back.tempo, 133); assert.equal(back.m.lanes[0].voice, 'kick', 'samples stay home'); assert.equal(back.m.lanes[0].trigs[2].ratchet, 3);
  await assert.rejects(decodeShare('AAAA'));
});
test('clock phase lock: trims small drift, snaps big jumps; SPP and start reset the count', async () => {
  const { phaseCorrection, PolyMidi } = await import('../src/poly/midiio.js');
  assert.deepEqual(phaseCorrection(0), { jump: 0, trim: 1 }); assert.ok(phaseCorrection(1).trim < 1, 'ahead → slow down'); assert.ok(phaseCorrection(-1).trim > 1);
  assert.equal(phaseCorrection(0.5).trim, 0.99); assert.equal(phaseCorrection(-9).jump, 9); assert.equal(phaseCorrection(5).jump, -5);
  const p = new PolyMidi({ getAccess: () => null }); p.follow = 'lock'; const ticks = []; p.handlers.tick = (n) => ticks.push(n); p.handlers.start = () => {};
  p.receive([0xFA], 0); p.receive([0xF8], 1); p.receive([0xF8], 2); p.receive([0xF2, 4, 0], 3); p.receive([0xF8], 4); assert.deepEqual(ticks, [0, 1, 24], 'SPP 4 sixteenths = tick 24');
});
test('jam / stems: equal-length WAVs per lane + mix in one zip, no clipping', async () => {
  const { wavFromInt16, mixInt16, floatStemsToInt16, stemsZip } = await import('../src/poly/jam.js');
  const w = wavFromInt16([Int16Array.of(1, 2), Int16Array.of(3)], [Int16Array.of(-1, -2), Int16Array.of(-3)], 48000);
  const v = new DataView(w.buffer); assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF'); assert.equal(v.getUint32(40, true), 12, '3 frames × 4 bytes'); assert.equal(v.getInt16(44 + 8, true), 3); assert.equal(v.getInt16(44 + 10, true), -3);
  const lane = (x) => [[Int16Array.of(x, x)], [Int16Array.of(-x, -x)]];
  const mix = mixInt16([lane(20000), lane(20000), lane(1), lane(0)]); assert.equal(mix[0][0][0], 32767, 'clipped, not wrapped'); assert.equal(mix[1][0][1], -32768);
  const { lanes, gain } = floatStemsToInt16([[Float32Array.of(2, 0), Float32Array.of(0, 0)], [Float32Array.of(0.5, 0), Float32Array.of(0, 0)]]);
  assert.ok(Math.abs(gain - 0.49) < 1e-9, 'loudest lane scaled to 0.98'); assert.equal(lanes[1][0][0][0], Math.round(0.5 * 0.49 * 32767), 'same gain on every stem');
  const zip = stemsZip([lane(5), lane(6), lane(7), lane(8)], ['kick', 'snare', 'hat/x', '♪ demo'], 44100, 'take');
  const names = []; for (let i = 0; i < zip.length - 4; i++) if (zip[i] === 0x50 && zip[i + 1] === 0x4B && zip[i + 2] === 3 && zip[i + 3] === 4) { const n = zip[i + 26] | (zip[i + 27] << 8); names.push(new TextDecoder().decode(zip.slice(i + 30, i + 30 + n))); }
  assert.deepEqual(names, ['take/take-1-kick.wav', 'take/take-2-snare.wav', 'take/take-3-hat-x.wav', 'take/take-4-demo.wav', 'take/take-mix-raw.wav']);
});
test('oneShot: starts on the downbeat, keeps the ring-out, rounds up to whole bars', async () => {
  const { oneShot } = await import('../src/poly/jam.js');
  // sr 10, bar 1 s, 1-bar pattern, lead-in 0.2 s; sound rings to sample 2 + 14 → 1.5 bars of content → 2 bars
  const d = new Float32Array(30); d[2] = 1; d[16] = 0.01; const [o] = oneShot([d], 10, 1, 0.2, 1);
  assert.equal(o.length, 20); assert.equal(o[0], 1, 'downbeat on sample 0'); assert.equal(o[14], Math.fround(0.01), 'ring-out kept');
  const [q] = oneShot([new Float32Array(30).fill(0, 0)], 10, 2, 0.2, 1); assert.equal(q.length, 20, 'never shorter than the pattern');
});
test('wholeBarCycle: whole bars that hold whole cycles, capped', async () => {
  const { wholeBarCycle } = await import('../src/poly/jam.js');
  assert.deepEqual(wholeBarCycle(72, 96), { ticks: 288, capped: false }, '¾ bar cycle → 3 bars');
  assert.deepEqual(wholeBarCycle(96 * 5, 96), { ticks: 480, capped: false });
  assert.deepEqual(wholeBarCycle(96 * 35 / 2, 96, 64), { ticks: 96 * 35, capped: false }, '17.5 bars → 35');
  assert.deepEqual(wholeBarCycle(97, 96, 64), { ticks: 64 * 96, capped: true });
});
test('trimChunks cuts every lane to the same frame count', async () => {
  const { trimChunks } = await import('../src/poly/jam.js');
  const lane = () => [[Int16Array.of(1, 2, 3), Int16Array.of(4, 5)], [Int16Array.of(1, 2, 3), Int16Array.of(4, 5)]];
  const t = trimChunks([lane(), lane()], 4); assert.deepEqual(t[1][0].map(c => [...c]), [[1, 2, 3], [4]]); assert.deepEqual(t[0][1].map(c => c.length), [3, 1]);
  assert.deepEqual(trimChunks([lane()], 9)[0][0].map(c => c.length), [3, 2], 'longer than the take: unchanged');
});
test('withAcid: tempo chunk before data, valid RIFF', async () => {
  const { withAcid, wavFromInt16 } = await import('../src/poly/jam.js');
  const w = withAcid(wavFromInt16([Int16Array.of(7, 8)], [Int16Array.of(-7, -8)], 44100), { bpm: 128, beats: 16, loop: true }), v = new DataView(w.buffer);
  const id = (o) => String.fromCharCode(...w.slice(o, o + 4));
  assert.equal(v.getUint32(4, true), w.length - 8); assert.equal(id(12), 'fmt '); assert.equal(id(36), 'acid'); assert.equal(v.getUint32(40, true), 24);
  assert.equal(v.getUint32(44, true), 4, 'loop + stretch'); assert.equal(v.getUint32(56, true), 16); assert.equal(v.getUint16(62, true), 4); assert.equal(v.getFloat32(64, true), 128);
  assert.equal(id(68), 'data'); assert.equal(v.getUint32(72, true), 8); assert.equal(v.getInt16(76, true), 7);
});
test('MIDI export lasts the full pattern even when the last hit is early', async () => {
  const { hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js');
  const bytes = hitsToMidi([{ li: 0, time: 0, vel: 1 }], { tempo: 120, lanes: [{ note: 36, ch: 10 }], names: ['kick'], bars: 4 });
  // last event (end of track) of each track at 4 bars = 16 quarters × 96 ppq
  let i = 14, ends = []; for (let k = 0; k < 2; k++) { const len = (bytes[i + 4] << 24 | bytes[i + 5] << 16 | bytes[i + 6] << 8 | bytes[i + 7]) >>> 0; let t = 0, j = i + 8; const end = j + len; const rv = () => { let n = 0, c; do { c = bytes[j++]; n = (n << 7) | (c & 0x7F); } while (c & 0x80); return n; };
    while (j < end) { t += rv(); const st = bytes[j]; if (st === 0xFF) { j += 2; const l = rv(); j += l; } else j += 3; } ends.push(t); i = end; }
  assert.deepEqual(ends, [16 * 96, 16 * 96]); assert.equal(readMidi(bytes).tracks[1].notes.length, 1);
});
test('foldLoop: exactly the loop length, tail wraps onto the start, lead-in onto the end', async () => {
  const { foldLoop } = await import('../src/poly/jam.js');
  // sr 10, loop 1 s, lead-in 0.2 s: [early, early | 10 loop samples | tail, tail]
  const d = Float32Array.of(0.5, 0.25, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0.1, 0.2);
  const out = foldLoop(d, 10, 1, 0.2);
  assert.equal(out.length, 10, 'no silent tail: the file is the loop');
  assert.ok(Math.abs(out[0] - 1.1) < 1e-6 && Math.abs(out[1] - 0.2) < 1e-6, 'tail rings into the start');
  assert.equal(out[8], 0.5); assert.equal(out[9], 2.25, 'early hits land at the end');
  assert.equal(foldLoop(new Float32Array(500), 44100, 120 / 120 * 2, 0.05).length, 88200, '1 bar at 120 bpm = 2 s');
});
test('library: named setups, overwrite by name, rename, delete, migrate the old single save, storage full', async () => {
  const { Library, LIB_KEY } = await import('../src/poly/library.js'); const mem = new Map(); const store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  mem.set('midi-warz.orbit2.saved.v1', JSON.stringify({ m: { lanes: [] }, tempo: 99, t: 1 }));
  const lib = new Library(store); assert.equal(lib.list()[0].name, 'saved', 'old save migrated'); assert.equal(lib.list()[0].tempo, 99);
  const a = lib.save('Dub 1', { m: { x: 1 }, tempo: 120 }, 10); const b = lib.save('', { m: { x: 2 }, tempo: 90 }, 20); assert.equal(b.name, 'pattern 3');
  assert.deepEqual(lib.list().map(e => e.name), ['pattern 3', 'Dub 1', 'saved'], 'newest first');
  const a2 = lib.save('dub 1 ', { m: { x: 3 }, tempo: 121 }, 30); assert.equal(a2.id, a.id, 'same name (any case) overwrites'); assert.equal(lib.items.length, 3); assert.equal(lib.get(a.id).m.x, 3);
  assert.equal(lib.rename(b.id, 'dub 1'), false, 'taken'); assert.equal(lib.rename(b.id, 'Night'), true); assert.equal(lib.get(b.id).name, 'Night');
  lib.overwrite(b.id, { m: { x: 9 } }, 40); assert.equal(lib.get(b.id).m.x, 9); assert.equal(lib.remove(a.id), true);
  const again = new Library(store); assert.deepEqual(again.list().map(e => e.name), ['Night', 'saved'], 'persisted'); assert.ok(mem.get(LIB_KEY));
  const full = new Library({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } }); assert.equal(full.save('x', { m: {} }), null); assert.equal(full.items.length, 0, 'rolled back');
});

test('dsp engine: every voice renders finite audio that decays, without allocating per sample', async () => {
  const { makeEngine } = await import('../src/poly/dsp-core.js');
  const { DSP_VOICES, DSP_KEYS } = await import('../src/poly/dsp-voices.js');
  assert.deepEqual(DSP_KEYS.sort(), [...VOICE_KEYS].sort(), 'the dsp engine covers the whole voice library');
  const sr = 44100, p = { vel: 1, tune: 0, dec: 0.04 + 0.5 * 0.5 * 1.2, decayRaw: 0.5, snap: 0.5, color: 0.5 };
  for (const k of DSP_KEYS) {
    for (const q of [p, { ...p, tune: 1, snap: 1, color: 1, dec: 1.24 }, { ...p, tune: -1, snap: 0, color: 0, dec: 0.04 }]) {
      const eng = makeEngine(sr); const layers = DSP_VOICES[k](q);
      for (const L of layers) for (const [key, v] of Object.entries(L)) assert.ok(Number.isFinite(v), `${k}.${key} is ${v}`);
      eng.hit(layers, 5); const out = new Float32Array(sr * 6); let peak = 0, head = 0;
      for (let i = 0; i < out.length; i += 128) eng.render(out, i, i + 128);
      for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); assert.ok(Number.isFinite(out[i]), `${k}: NaN at ${i}`); if (a > peak) peak = a; if (i < sr * 0.05 && a > head) head = a; }
      assert.ok(peak > 0.02 && peak < 2, `${k} peak ${peak.toFixed(3)}`); assert.ok(head > 0.01, `${k} silent in its first 50 ms`);
      assert.equal(eng.active(), 0, `${k} still sounding after 6 s`);
      let tail = 0; for (let i = Math.round(sr * 5.9); i < out.length; i++) tail = Math.max(tail, Math.abs(out[i])); assert.ok(tail < 1e-3, `${k} tail ${tail}`);
    }
  }
  // scheduling: a hit at sample 100 of a block is silent before it; a second hit while the first rings adds a slot
  const eng = makeEngine(sr); eng.hit(DSP_VOICES.kick(p), 100); const out = new Float32Array(128); eng.render(out, 0, 128);
  assert.ok(out.slice(0, 100).every(v => v === 0) && out.slice(100).some(v => v !== 0));
  eng.hit(DSP_VOICES.clap(p), 0); assert.ok(eng.active() >= 3);
});

test('dsp worklet is generated from dsp-core.js (tools/build-worklet.mjs) and self-contained', async () => {
  const { readFileSync } = await import('node:fs');
  const core = readFileSync(new URL('../src/poly/dsp-core.js', import.meta.url), 'utf8').replace(/^export /gm, '');
  const w = readFileSync(new URL('../src/poly/dsp-worklet.js', import.meta.url), 'utf8');
  assert.ok(w.includes(core), 'run: node tools/build-worklet.mjs'); assert.ok(!/^import /m.test(w), 'no imports: Tone loads worklets from a blob URL');
});

// ---- ORBIT2-01 bug batch ----
test('B1 swing follows the absolute step: a length-5 lane never swings a downbeat, live and in exports', async () => {
  const { collectHits } = await import('../src/poly/export.js');
  const l = new Lane('hat', { length: 5 }); l.setEuclid(5); l.swing = 0.3;
  const evs = []; for (let t = 0; t < 24 * 5 * 10; t += 24) evs.push(l.at(t, () => 0));   // 10 loops at ×1
  assert.equal(evs.length, 50); assert.ok(evs.every(e => e.swung === (e.step % 2 ? 0.3 : 0)), 'odd absolute steps only');
  assert.ok(evs.some(e => e.index === 0 && e.step % 2), 'index 0 lands on odd steps too (and is swung there, it is an off-step)');
  const m = new Machine(); m.lanes.forEach(x => x.clear()); Object.assign(m.lanes[0], Lane.from({ ...l.toJSON(), name: 'kick' }));
  const hits = collectHits(m, { from: 0, to: 24 * 50, tempo: 120 }), beat = 0.5;
  for (const h of hits) { const step = Math.round(h.time / beat - (Math.abs(h.time / beat - Math.round(h.time / beat)) > 1e-6 ? 0.3 : 0)); assert.ok(Math.abs(h.time - (step + (step % 2 ? 0.3 : 0)) * beat) < 1e-9, `hit at ${h.time}`); }
  assert.equal(hits.filter(h => Math.abs(h.time / beat % 2) < 1e-9).length, 25, 'every even step (downbeat) on the grid');
});
test('B2 / B3 default voices exist, unknown voices migrate to the Common kit, kitKey tells kit from custom', async () => {
  const { VOICES } = await import('../src/poly/voices.js'); const { KITS } = await import('../src/poly/kits.js');
  const m = new Machine(); assert.ok(m.lanes.every(l => VOICES[l.voice]), m.lanes.map(l => l.voice).join()); assert.equal(m.lanes[3].voice, KITS.common.lanes[3].voice);
  assert.equal(m.kitKey(), 'common'); assert.equal(m.kit, 'Common');
  const old = m.toJSON(); old.lanes[3].voice = 'perc'; old.lanes[1].voice = 'sample'; old.lanes[1].sample = null; old.lanes[2].voice = 'hat';
  const back = Machine.from(JSON.parse(JSON.stringify(old)));
  assert.equal(back.lanes[3].voice, 'wood', 'perc → the Common kit voice of lane 4'); assert.equal(back.lanes[1].voice, 'snare', 'a sample lane without its sample'); assert.equal(back.lanes[2].voice, 'hat', 'real voices kept');
  m.lanes[0].setSound('decay', 0.9); assert.equal(m.kitKey(), null, 'a tweaked sound = custom');
  m.applyKit(KITS.common, DEFAULT_SOUND); assert.equal(m.kitKey(), 'common', 're-applying the kit puts it back');
  m.applyKit(KITS.trap, DEFAULT_SOUND); assert.equal(m.kitKey(), 'trap');
});
test('B4 the cycle includes trig conditions and the locked dice repeat', () => {
  const m = new Machine(); m.lanes.forEach(l => { l.clear(); l.setRatio(5); l.setLength(4); l.setEuclid(2); }); m.humanize = 0;
  assert.equal(m.cycleSteps(), 4); assert.equal(m.cycleTicks(), 96);
  m.lanes[1].setTrig(0, { cond: '1:3' }); assert.equal(m.cycleSteps(), 12, 'a 1:3 step triples the cycle'); assert.equal(m.cycleTicks(), 288);
  m.lanes[1].setTrig(1, { cond: '1:3' }); assert.equal(m.cycleSteps(), 12, 'only active steps count'); m.lanes[2].setTrig(0, { cond: '2:4' }); assert.equal(m.cycleSteps(), 48, 'lcm(3, 4) loops');
  m.lanes[2].setTrig(0, { cond: 'first' }); assert.equal(m.cycleSteps(), 12, 'first / fill are not periodic');
  assert.equal(m.cycleSteps({ repeat: 4 }), 12, 'dice repeat only matters when a roll can change something');
  m.lanes[0].prob = 0.5; assert.equal(m.cycleSteps({ repeat: 4 }), 48, 'lane 1 rolls: 4 loops = 16 beats, with lane 2 at 12 → 48'); assert.equal(m.cycleSteps({ repeat: 5 }), 60);
  m.lanes[0].prob = 1; m.lanes[0].setLock(0, 'prob', 0.5); assert.equal(m.cycleSteps({ repeat: 4 }), 48, 'a prob lock on an active step rolls too');
  m.lanes[0].clearLocks(0); m.humanize = 0.2; assert.equal(m.cycleTicks({ repeat: 2 }), 24 * 24, 'humanize: every lane rolls; lane 2 = lcm(3, 2) = 6 loops = 24 beats');
  m.lanes[1].setTrig(0, { cond: 'always' }); assert.equal(m.cycleSteps({ repeat: 2 }), 8, 'repeat 2 on 4-step lanes');
});
test('B5 one roll, one hit list: WAV hits and MIDI notes of the same take are identical; a new roll differs', async () => {
  const { collectHits, hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js'); const { Dice } = await import('../src/poly/dice.js');
  const m = new Machine(); m.lanes.forEach(l => { l.setLength(8); l.setRatio(7); l.setEuclid(6); l.prob = 0.5; }); m.humanize = 0.6;
  const take = (seed) => collectHits(m, { from: 0, to: 96 * 4, tempo: 120, dice: Dice.take(seed) });
  const wav = take(48213), again = take(48213), midiHits = take(48213);
  assert.deepEqual(again, wav, 'the same roll gives the same hits'); assert.ok(wav.length > 20 && wav.length < 96, `probability thinned the pattern (${wav.length})`);
  const lanes = [36, 38, 42, 39].map(note => ({ note, ch: 10 })), mid = readMidi(hitsToMidi(midiHits, { tempo: 120, lanes, names: ['a', 'b', 'c', 'd'], bars: 4 }));
  const notes = mid.tracks.flatMap(t => t.notes); assert.equal(notes.length, wav.length, 'same count');
  // a hit humanized before the downbeat wraps to the clip's end, as in the loop WAV (ORBIT2-05)
  const tickOf = (sec) => { const s = ((sec / (60 / 120 / 4)) % 64 + 64) % 64, t = Math.round(s * 24); return t >= 64 * 24 ? 0 : t; };
  const ons = notes.map(n => n.on).sort((a, b) => a - b), want = wav.map(h => tickOf(h.time)).sort((a, b) => a - b);
  assert.deepEqual(ons, want, 'same times (MIDI ticks)');
  assert.notDeepEqual(take(7), wav, 'another roll is another take');
  const free = [0, 1].map(() => collectHits(m, { from: 0, to: 96 * 4, tempo: 120 })); assert.notDeepEqual(free[0], free[1], 'without a roll every render differs (the old bug)');
});
test('B9 clock-in follower: pure, smooth, no flapping at 127.5 bpm with jitter, follows a real change', async () => {
  const { makeBpmFollower, PolyMidi } = await import('../src/poly/midiio.js'); const { mulberry32 } = await import('../src/poly/dice.js');
  // feed(bpmAt(i), ticks, jitter ms, seed, pauseAt, pauseMs) → [{ i, bpm }] for every tempo change
  const feed = (bpmAt, ticks, jitterMs, seed = 1, pauseAt = -1, pauseMs = 0) => { const f = makeBpmFollower(), rng = mulberry32(seed), out = []; let t = 1000; for (let i = 0; i < ticks; i++) { t += 60000 / bpmAt(i) / 24 + (i === pauseAt ? pauseMs : 0); const r = f.tick(t + (rng() * 2 - 1) * jitterMs); if (r != null) out.push({ i, bpm: r }); } return out; };
  for (const j of [1, 3]) for (let s = 1; s <= 5; s++) {
    const out = feed(() => 127.5, 24 * 64, j, s), late = out.filter(o => o.i >= 24 * 16);
    assert.ok(out.length >= 1 && out.length <= 5, `±${j} ms, seed ${s}: ${out.length} changes (was 767)`);
    // after 16 beats at most a touch-up of a few hundredths (the first reading comes from half a beat)
    late.forEach(o => { const before = out[out.indexOf(o) - 1]; assert.ok(late.length <= 2 && before && Math.abs(o.bpm - before.bpm) <= 0.03 + 1e-9, `±${j} ms, seed ${s}: late change ${before?.bpm} → ${o.bpm} at tick ${o.i}`); });
    assert.ok(Math.abs(out.at(-1).bpm - 127.5) <= 0.01 + 1e-9, `±${j} ms, seed ${s}: settles at ${out.at(-1).bpm}`); assert.notEqual(out.at(-1).bpm % 1, 0, 'kept as a float');
  }
  // a whole-number tempo from a clean clock ends on that tempo (round 2: a first reading 0.04 off stayed forever and
  // drifted up to 400 ms in 10 minutes in tempo mode). Up to ±1 ms within the 0.01 display step; noisier clocks
  // within 4 standard errors of a 16-beat fit (±2 ms at 174 bpm: 0.033)
  for (const bpm of [90, 120, 174]) for (const j of [0.1, 0.5, 1, 2]) for (let s = 1; s <= 8; s++) {
    const out = feed(() => bpm, 24 * 64, j, s), tol = j <= 1 ? 0.01 : 0.035;
    assert.ok(Math.abs(out.at(-1).bpm - bpm) <= tol + 1e-9 && out.length <= 4, `${bpm} ±${j} ms, seed ${s}: ${out.map(o => o.bpm)}`);
  }
  assert.ok(feed(() => 128, 24, 1)[0].i <= 12, 'the first reading comes after half a beat');
  assert.deepEqual(feed(() => 127.5, 500, 1, 9), feed(() => 127.5, 500, 1, 9), 'pure: same input, same output');
  // a real move is taken within a beat, in a few updates
  for (const [a, b] of [[120, 126], [120, 90], [174, 87], [120, 140]]) {
    const out = feed(i => (i < 24 * 8 ? a : b), 24 * 24, 1, 3), after = out.filter(o => o.i >= 24 * 8), near = after.find(o => Math.abs(o.bpm - b) < Math.max(1, Math.abs(b - a) * 0.1));
    assert.ok(near && near.i < 24 * 9, `${a}→${b}: near ${b} by tick ${near?.i} (step at ${24 * 8})`); assert.ok(after.length <= 8, `${a}→${b}: ${after.length} updates`); assert.ok(Math.abs(out.at(-1).bpm - b) < 0.05, `${a}→${b}: settles at ${out.at(-1).bpm}`);
  }
  // a ramp is followed closely, in steps (and settles within 16 beats of its end: the fit still holds ramp ticks)
  const ramp = feed(i => (i < 192 ? 120 : i < 576 ? 120 + 20 * (i - 192) / 384 : 140), 24 * 40, 1, 2), at = (i) => ramp.filter(o => o.i <= i).at(-1).bpm;
  for (const i of [300, 400, 500, 575]) assert.ok(Math.abs(at(i) - (120 + 20 * (i - 192) / 384)) < 1.5, `ramp at tick ${i}: ${at(i)}`);
  assert.ok(ramp.length <= 45, `ramp: ${ramp.length} updates`); assert.ok(Math.abs(ramp.at(-1).bpm - 140) < 0.05);
  // a pause in the clock (a master that stops sending it) is not a tempo change, however long
  for (const ms of [100, 300, 1000, 3000, 30000]) { const out = feed(() => 120, 24 * 16, 1, 4, 24 * 8, ms); assert.deepEqual(out.filter(o => o.i >= 24 * 8).map(o => o.bpm), [], `${ms} ms pause: no change after it`); }
  const back = feed(i => (i < 24 * 8 ? 120 : 100), 24 * 16, 1, 4, 24 * 8, 2000).filter(o => o.i >= 24 * 8); assert.ok(back.length >= 1 && back.length <= 4 && Math.abs(back.at(-1).bpm - 100) < 0.05, `back after a pause at 100 bpm: ${back.map(o => o.bpm)}`);
  // PolyMidi: Stop, silence and Start in 'tempo' mode (Start / Stop don't play, but measure afresh); a mode switch too
  const p = new PolyMidi({ getAccess: () => null }), got = []; p.handlers.tempo = b => got.push(b); p.follow = 'tempo';
  let t = 0; const beats = (n, bpm = 127.5) => { for (let i = 0; i < 24 * n; i++) p.receive([0xF8], (t += 60000 / bpm / 24)); };
  beats(16); assert.deepEqual(got, [127.5]); assert.equal(p.extBpm, 127.5);
  p.receive([0xFC], t); t += 3000; p.receive([0xFA], t); beats(8); assert.deepEqual(got, [127.5], 'stop, 3 s, start: nothing new');
  p.setFollow('off'); t += 10000; p.setFollow('tempo'); beats(8); assert.deepEqual(got, [127.5], 'off for 10 s, then tempo again: nothing new');
});

// ---- ORBIT2-01 review round 1 ----
test('B1 swing on 3-step speeds: the count restarts on every step that falls on the beat, so beats never swing', async () => {
  const { collectHits } = await import('../src/poly/export.js');
  const at = (ratio, length) => { const l = new Lane('hat', { length, ratioIndex: RATIOS.indexOf(ratio) }); l.setEuclid(length); l.swing = 0.5; return l; };
  for (const [ratio, length] of [[3, 3], [3, 4], [3, 5], [3 / 2, 3], [3 / 2, 4], [3 / 4, 3], [3 / 4, 5]]) {
    const l = at(ratio, length), st = l.stepTicks();
    for (let s = 0; s < 120; s++) { const ev = l.at(s * st, () => 0); if ((s * st) % 24 === 0) assert.equal(ev.swung, 0, `×${ratio} length ${length}: step ${s} is on a beat`); }
    assert.ok([...Array(120)].some((_, s) => l.at(s * st, () => 0).swung), `×${ratio}: something still swings`);
  }
  // the binary speeds keep plain step parity (×2: every second eighth, also on odd lengths)
  const e = at(2, 3); assert.deepEqual([0, 1, 2, 3, 4, 5].map(s => e.at(s * 12, () => 0).swung > 0), [false, true, false, true, false, true]);
  // in the export too: a ×3 lane of 3 at 120 bpm, every beat on the grid, the middle triplet late
  const m = new Machine(); m.lanes.forEach(x => x.clear()); Object.assign(m.lanes[0], Lane.from({ ...at(3, 3).toJSON(), name: 'kick' }));
  const hits = collectHits(m, { from: 0, to: 96 * 2, tempo: 120 }).map(h => +(h.time * 1000).toFixed(1));
  assert.deepEqual(hits.slice(0, 6), [0, 250, 333.3, 500, 750, 833.3], 'beats 1 and 2 on the grid');
});
test('B4 the cycle covers the swing period, and is a true period of what plays (brute force)', async () => {
  const { collectHits } = await import('../src/poly/export.js'); const { mulberry32 } = await import('../src/poly/dice.js');
  const m = new Machine(); m.lanes.forEach(l => { l.clear(); l.setLength(1); l.setRatio(RATIOS.indexOf(1)); }); m.lanes[0].setLength(3); m.lanes[0].setEuclid(3); m.lanes[1].setLength(5); m.lanes[1].setEuclid(2);
  assert.equal(m.cycleSteps(), 15); m.lanes[0].swing = 0.25; assert.equal(m.cycleSteps(), 30, 'a swung 3-step lane repeats every 2 loops');
  m.lanes[1].swing = 0.25; assert.equal(m.cycleSteps(), 30, '…and a swung 5-step one too: lcm(6, 10)');
  m.lanes[2].prob = 0.5; assert.equal(m.cycleSteps({ repeat: 3 }), 30, 'an empty lane rolls nothing: no dice repeat');
  m.lanes[2].setLength(4); assert.equal(m.cycleSteps(), 60, 'its length still counts (its ring has to line up too)');
  const rng = mulberry32(7), conds = ['always', 'always', '1:2', '2:3', '3:4'];
  let checked = 0;
  for (let k = 0; k < 400 && checked < 120; k++) {
    const r = new Machine(); r.lanes.forEach(l => { l.clear(); l.setLength(1 + Math.floor(rng() * 7)); l.setRatio(3 + Math.floor(rng() * 6)); for (let i = 0; i < l.length; i++) if (rng() < 0.6) l.hits[i] = true; l.swing = rng() < 0.5 ? 0.3 : 0; l.rotation = Math.floor(rng() * l.length); if (rng() < 0.3) l.setTrig(0, { cond: conds[Math.floor(rng() * conds.length)] }); });
    const C = r.cycleTicks(); if (C > 24 * 96) continue; checked++;
    const tickSec = 60 / 120 / 24, hits = collectHits(r, { from: 0, to: 2 * C, tempo: 120 }), half = hits.filter(h => h.time < C * tickSec - 1e-9), rest = hits.slice(half.length);
    assert.equal(rest.length, half.length, `machine ${k}: same number of hits in both cycles`);
    half.forEach((h, i) => { assert.equal(rest[i].li, h.li); assert.ok(Math.abs(rest[i].time - h.time - C * tickSec) < 1e-9, `machine ${k}: hit ${i}`); assert.equal(rest[i].vel, h.vel); });
  }
  assert.ok(checked >= 60, `${checked} random machines checked`);
});
test('B6 recordHit keeps the feel: ghost = vel lock, accent = its own flag, a soft overdub drops an old accent', () => {
  const l = new Lane('snare', { length: 4 });   // G4: the velocity lands on the nearest tier (ghost 0.35 / normal)
  l.recordHit(1, { vel: 0.31 }); assert.equal(l.hits[1], true); assert.equal(l.accents[1], false); assert.equal(l.locks[1].vel, 0.35);
  l.recordHit(1, { accent: true }); assert.equal(l.accents[1], true); assert.equal(l.locks[1], null, 'an accent plays full: the vel lock goes');
  l.recordHit(1, { vel: 0.4, tune: 0.2 }); assert.equal(l.accents[1], false, 'soft overdub on an accent'); assert.deepEqual(l.locks[1], { vel: 0.35, tune: 0.2 });
  l.recordHit(2, {}); assert.equal(l.locks[2], null, 'a computer key has no velocity: the lane default');
});
test('B7 a loaded sample plays whole; the drum it replaced comes back with a drum voice and in share links', async () => {
  const { encodeShare, decodeShare } = await import('../src/poly/export.js');
  const m = new Machine(); m.applyKit(KITS.trap, DEFAULT_SOUND); const l = m.lanes[1], drum = { ...l.sound }, voice = l.voice;
  l.setSound('decay', 0.3); l.loadSample({ id: 's1', name: 'break.wav' });
  assert.equal(l.voice, 'sample'); assert.deepEqual([l.sound.decay, l.sound.snap, l.sound.color], [1, 0.5, 0.5], 'whole, from its first sample, no swoop');
  l.setSound('decay', 0.6); l.setVoice('clap'); assert.equal(l.sound.decay, 0.3, 'the drum settings come back'); assert.equal(l.sound.snap, drum.snap);
  l.setVoice('sample'); assert.equal(l.sound.decay, 0.6, 'and the sample keeps its own');
  l.loadSample({ id: 's2', name: 'slice 2' }); assert.equal(l.sound.decay, 1, 'a new slice plays whole again'); assert.equal(l.sample.drum.voice, 'clap', 'the drum it last replaced is remembered');
  const back = await decodeShare(await encodeShare(m.toJSON(), 120)); assert.equal(back.m.lanes[1].voice, 'clap', 'a link falls back to that drum'); assert.equal(back.m.lanes[1].sound.decay, 0.3); assert.equal(back.m.lanes[1].sample, null);
  const fresh = new Machine(); fresh.applyKit(KITS.trap, DEFAULT_SOUND); fresh.lanes[1].loadSample({ id: 's3', name: 'x' });
  assert.equal((await decodeShare(await encodeShare(fresh.toJSON(), 120))).m.lanes[1].voice, voice, 'a Trap lane with a sample comes back as the Trap voice');
  const old = m.toJSON(); old.lanes[3].voice = 'sample'; old.lanes[3].sample = { id: 'x', name: 'y' };
  assert.equal((await decodeShare(await encodeShare(old, 120))).m.lanes[3].voice, KITS.common.lanes[3].voice, 'no memory of a drum: the Common voice');
});
test('B11 undo: mute / solo / selection never make a step; undoing a load brings the old pattern back with its own mutes', async () => {
  const { History } = await import('../src/poly/history.js'); const h = new History({ coalesceMs: 700 });
  const st = (p, muted) => [JSON.stringify({ p, muted }), { key: JSON.stringify({ p }) }];
  const commit = (s, o = {}) => h.commit(s[0], { ...s[1], ...o });
  commit(st('A', false), { now: 0 }); commit(st('A2', false), { now: 1000 });
  assert.equal(commit(st('A2', true), { now: 2000 }), false, 'a mute is not a step');
  let u = h.undo(); assert.equal(JSON.parse(u.json).p, 'A', 'undo after a mute undoes the edit'); assert.equal(u.keepPerf, true, '…and keeps the live mute');
  u = h.redo(); assert.deepEqual(JSON.parse(u.json), { p: 'A2', muted: true }, 'the step remembers the mute it had');
  commit(st('B', false), { now: 2100, load: true }); commit(st('B2', false), { now: 2200 });
  u = h.undo(); assert.equal(JSON.parse(u.json).p, 'B', 'an edit right after a load is its own step'); assert.equal(u.keepPerf, true);
  u = h.undo(); assert.deepEqual(JSON.parse(u.json), { p: 'A2', muted: true }); assert.equal(u.keepPerf, false, 'undoing a load: the old pattern with its own mutes');
  u = h.redo(); assert.equal(u.keepPerf, false, 'redoing the load brings its mutes back too');
});
test('slots and undo never share arrays with the loaded lane; a machine from nothing is the Common kit', () => {
  const m = new Machine(); m.lanes[0].setEuclid(2); m.lanes[0].loadSample({ id: 'a', name: 'b' }); const saved = JSON.parse(JSON.stringify(m.toJSON()));
  const n = Machine.from(saved); n.lanes[0].toggle(1); n.lanes[0].toggleAccent(0); n.lanes[0].sample.name = 'changed';
  assert.equal(saved.lanes[0].hits[1], false); assert.equal(saved.lanes[0].accents[0], false); assert.equal(saved.lanes[0].sample.name, 'b');
  assert.equal(Machine.from(null).kit, 'Common'); assert.equal(Machine.from({}).kit, 'Common');
});

test('F1 starter grooves: complete Machine JSON, real voices, round-trip, tempo in range, demo aligns within 2 bars', async () => {
  const { GROOVES, DEMO_GROOVE, grooveByKey } = await import('../src/poly/grooves.js'); const { VOICES } = await import('../src/poly/voices.js'); const { PPQ } = await import('../src/poly/lanes.js');
  const want = { boombap: [80, 95], trap: [130, 150], house: [118, 130], techno: [125, 140], dnb: [165, 180], afro: [110, 125], poly345: [60, 200] };
  assert.deepEqual(GROOVES.map(g => g.key).sort(), Object.keys(want).sort());
  for (const g of GROOVES) {
    const m = Machine.from(g.m); assert.deepEqual(m.toJSON(), g.m, g.key); assert.ok(g.desc && g.name && KITS[g.kit], g.key);
    assert.ok(g.tempo >= want[g.key][0] && g.tempo <= want[g.key][1], g.key);
    m.lanes.forEach(l => { assert.ok(VOICES[l.voice], `${g.key} ${l.voice}`); assert.ok(l.hits.some(Boolean), g.key); });
    assert.ok(m.lanes[0].hits[0], `${g.key} kick on 1`); assert.ok(m.cycleTicks() <= 16 * 4 * PPQ, g.key);
  }
  const demo = Machine.from(grooveByKey(DEMO_GROOVE).m); assert.ok(demo.cycleTicks() <= 8 * PPQ);
  assert.deepEqual(demo.lanes.map(l => l.length).sort(), [2, 3, 4, 5]);
  assert.ok(grooveByKey('trap').m.lanes[2].trigs.some(t => t?.ratchet > 1), 'trap hat rolls');
});

test('F4 musical randomize: 200 seeds → kick on step 1, cycle ≤ 16 bars, lengths from the family; seeded = repeatable', async () => {
  const { MUSICAL_FAMILIES, MAX_CYCLE_BARS, BAR_TICKS } = await import('../src/poly/lanes.js'); const { mulberry32 } = await import('../src/poly/dice.js');
  const seen = new Set();
  for (let s = 1; s <= 200; s++) {
    const m = new Machine(), voices = m.lanes.map(l => l.voice), f = m.randomizeMusical(mulberry32(s)), fam = MUSICAL_FAMILIES.find(x => x.key === f.key); seen.add(f.key);
    assert.ok(fam && f.name === fam.name, `seed ${s}`); assert.ok(m.lanes[0].hitAt(0), `seed ${s} ${f.key}: kick on 1`);
    assert.ok(m.cycleTicks() <= MAX_CYCLE_BARS * BAR_TICKS, `seed ${s} ${f.key}: ${m.cycleTicks() / BAR_TICKS} bars`);
    m.lanes.forEach((l, i) => { assert.ok(fam.lengths[i].includes(l.length), `seed ${s} ${f.key} lane ${i}: ${l.length}`); assert.ok(l.hits.some(Boolean)); });
    assert.deepEqual(m.lanes.map(l => l.voice), voices, 'voices stay'); assert.deepEqual(Machine.from(JSON.parse(JSON.stringify(m))).toJSON(), m.toJSON());
  }
  assert.equal(seen.size, MUSICAL_FAMILIES.length, 'every family comes up');
  for (const fam of MUSICAL_FAMILIES) { const m = new Machine(); assert.equal(m.randomizeMusical(mulberry32(3), fam.key).key, fam.key); }
  const a = new Machine(), b = new Machine(); a.randomizeMusical(mulberry32(42)); b.randomizeMusical(mulberry32(42)); assert.deepEqual(a.toJSON(), b.toJSON());
});

test('F5 alignment countdown text: bars, then beats for the last two bars, hidden for a one-bar cycle', async () => {
  const { alignText } = await import('../src/poly/scene.js');
  assert.equal(alignText(0, 96), ''); assert.equal(alignText(50, 48), '');
  assert.equal(alignText(0, 4 * 96), 'aligns in 4 bars'); assert.equal(alignText(1, 4 * 96), 'aligns in 4 bars'); assert.equal(alignText(95, 3 * 96), 'aligns in 3 bars');
  assert.equal(alignText(96 * 2 + 5, 4 * 96), 'aligns in 8 beats', 'two bars or less: beats'); assert.equal(alignText(96 * 3, 4 * 96), 'aligns in 4 beats'); assert.equal(alignText(4 * 96 - 1, 4 * 96), 'aligns in 1 beat');
  // the 3 vs 4 vs 5 demo (5 beats) counts 5, 4, 3, 2, 1: never "2 bars" for 5 beats
  assert.deepEqual([0, 24, 48, 72, 96].map(t => alignText(t, 120)), [5, 4, 3, 2, 1].map(n => `aligns in ${n} beat${n > 1 ? 's' : ''}`));
  assert.equal(alignText(119.5, 120), 'aligns in 1 beat', 'the heard tick is fractional');
});

// ---- ORBIT2-02 review round 1 ----
/** Ticks (over `ticks`) where two lanes hit the same grid position but sound apart: swing on two different grids. */
const flams = (m, ticks) => { const out = []; for (let t = 0; t < ticks; t++) { const offs = m.lanes.map(l => { const ev = l.at(t, () => 0); return ev?.hit ? ev.swung * l.stepTicks() : null; }).filter(x => x != null); if (offs.length > 1 && Math.max(...offs) - Math.min(...offs) > 1e-9) out.push(t); } return out; };
test('F1 grooves swing on one grid (no flams), techno has sixteenth hats, every groove opens its bright lanes', async () => {
  const { GROOVES, grooveByKey } = await import('../src/poly/grooves.js'); const { collectHits } = await import('../src/poly/export.js'); const { BAR_TICKS } = await import('../src/poly/lanes.js');
  for (const g of GROOVES) { const m = Machine.from(g.m); assert.deepEqual(flams(m, 2 * m.cycleTicks()), [], `${g.key}: lanes that share a grid position sound together`); }
  const bb = Machine.from(grooveByKey('boombap').m); assert.ok(bb.lanes.every(l => l.ratio === 2 && l.swing === 0.2), 'boom bap: every lane on swung eighths');
  const tech = Machine.from(grooveByKey('techno').m); tech.lanes.forEach((l, i) => { if (i !== 2) l.muted = true; });
  assert.equal(collectHits(tech, { from: 0, to: BAR_TICKS, tempo: 130 }).length, 16, 'techno: 16 hats a bar');
  assert.ok(grooveByKey('techno').m.lanes[2].accents.filter(Boolean).length === 4, 'the "and"s pushed');
  // the kits' hats / rides / shaker sit behind a 4 kHz tone filter by default (tone .75): the grooves open it
  for (const g of GROOVES) for (const l of g.m.lanes) if (['hat', 'ophat', 'ride', 'shaker', 'tamb'].includes(l.voice)) assert.ok(l.sound.tone >= 0.9, `${g.key} ${l.voice}: tone ${l.sound.tone}`);
});
test('F4 families: no flams over 400 rolls, a half-time snare never lands on a kick, boom bap never has a lone kick', async () => {
  const { MUSICAL_FAMILIES } = await import('../src/poly/lanes.js'); const { mulberry32 } = await import('../src/poly/dice.js');
  for (const fam of MUSICAL_FAMILIES) for (let s = 1; s <= 400; s++) {
    const m = new Machine(); m.randomizeMusical(mulberry32(s), fam.key);
    assert.deepEqual(flams(m, m.cycleTicks()), [], `${fam.key} seed ${s}`);
    const [k, sn] = m.lanes; if (sn.ratio === 1 && sn.length === 4 && !sn.hits[1]) assert.ok(!k.hits[2], `${fam.key} seed ${s}: half-time snare on 3 with a kick on 3`);
    if (fam.key === 'boombap') assert.ok(k.hits.filter(Boolean).length >= 2, `boom bap seed ${s}: one kick a bar`);
  }
});
test('F1 / F3 undo of a load brings the tempo back (redo the load\'s own), loads without a tempo leave it; restart forgets', async () => {
  const { History } = await import('../src/poly/history.js'); const h = new History();
  h.commit('mine', { now: 0 }); h.commit('mine2', { now: 5000 });            // your beat (97 bpm, not in history)
  h.commit('dnb', { load: true, tempo: 174, was: 97, now: 6000 });            // a groove: 174
  let u = h.undo({ tempo: 174 }); assert.deepEqual([u.json, u.tempo], ['mine2', 97], 'undo the groove: your beat at your tempo');
  let r = h.redo(); assert.deepEqual([r.json, r.tempo], ['dnb', 174], 'redo: the groove at its tempo');
  u = h.undo({ tempo: 160 }); assert.equal(u.tempo, 97); assert.equal(h.redo().tempo, 160, 'redo gives back the tempo it had when undone');
  h.commit('edit', { now: 9000 }); assert.equal(h.undo({ tempo: 160 }).tempo, null, 'an edit is not a load: tempo stays');
  h.commit('init', { load: true, now: 12000 }); assert.equal(h.undo({ tempo: 160 }).tempo, null, 'a load without a tempo (init) leaves it');
  h.restart(); assert.equal(h.canUndo, false); assert.equal(h.canRedo, false); h.commit('x', { now: 20000 }); assert.equal(h.undo().json, 'dnb');
});
test('F2 / F3 boot: a share link wins, a first visit gets the demo, a returning visit its own beat', async () => {
  const { bootMode } = await import('../src/poly/grooves.js');
  assert.equal(bootMode({ saved: false, hash: '' }), 'first'); assert.equal(bootMode({ saved: true, hash: '' }), 'return');
  assert.equal(bootMode({ saved: true, hash: '#p=abc_-1' }), 'link'); assert.equal(bootMode({ saved: false, hash: '#p=abc' }), 'link');
  assert.equal(bootMode({ saved: true, hash: '#p=' }), 'return', 'an empty link is no link'); assert.equal(bootMode({ saved: false, hash: '#x' }), 'first');
});
test('a tap cycles a step off → on → accent → ghost → off; a stale accent is dropped', () => {
  const l = new Lane('kick', { length: 4 });
  assert.deepEqual([0, 1, 2, 3, 4].map(() => l.cycleStep(1)), ['on', 'accent', 'ghost', 'off', 'on']); assert.equal(l.accents[1], false); assert.equal(l.locks[1], null, 'on again: no ghost lock left');
  l.cycleStep(2); l.cycleStep(2); l.cycleStep(2); l.cycleStep(2); assert.deepEqual([l.hits[2], l.accents[2]], [false, false]);
  l.accents[3] = true; assert.equal(l.cycleStep(3), 'on'); assert.equal(l.accents[3], false, 'turning on gives a plain hit');
  assert.equal(l.cycleStep(9), 'off', 'beyond length is ignored'); assert.equal(l.hits[9], false);
});
test('long press: fires after the hold, a move or an early release is a tap, the click after it is swallowed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { longPress, LONG_MS } = await import('../src/ui.js');
  const ev = (type, o = {}) => Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, button: 0, clientX: 0, clientY: 0, detail: 1 }, o);
  const el = new EventTarget(); let longs = 0, clicks = 0; longPress(el, () => longs++); el.addEventListener('click', () => clicks++);
  const press = (ms, moves = []) => { el.dispatchEvent(ev('pointerdown')); for (const [x, y] of moves) el.dispatchEvent(ev('pointermove', { clientX: x, clientY: y })); t.mock.timers.tick(ms); el.dispatchEvent(ev('pointerup')); el.dispatchEvent(ev('click')); };
  press(LONG_MS - 1); assert.deepEqual([longs, clicks], [0, 1], 'short = a tap');
  press(LONG_MS); assert.deepEqual([longs, clicks], [1, 1], 'held = long press, its click swallowed');
  press(600, [[5, 5]]); assert.deepEqual([longs, clicks], [2, 1], 'a wobble within 8 px still counts');
  press(600, [[9, 0]]); assert.deepEqual([longs, clicks], [2, 2], 'moved away = a tap (a scroll or a drag)');
  el.dispatchEvent(ev('pointerdown')); el.dispatchEvent(ev('pointercancel')); t.mock.timers.tick(600); assert.equal(longs, 2, 'cancel stops the timer');
  el.dispatchEvent(ev('pointerdown', { button: 2 })); t.mock.timers.tick(600); assert.equal(longs, 2, 'the right button waits for contextmenu');
  const cm = ev('contextmenu'); el.dispatchEvent(cm); assert.equal(longs, 3, 'right-click / menu key = long press'); assert.ok(cm.defaultPrevented);
  el.dispatchEvent(ev('click', { detail: 0 })); assert.equal(clicks, 3, 'a keyboard click always passes');
  el.dispatchEvent(ev('pointerdown')); t.mock.timers.tick(LONG_MS); el.dispatchEvent(ev('contextmenu')); el.dispatchEvent(ev('pointerup')); el.dispatchEvent(ev('click'));
  assert.deepEqual([longs, clicks], [4, 3], 'touch: the timer and the browser menu fire it once, no click');
});
test('long press: the mouse events a touch sends after it keep the focus where the long press put it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { longPress, LONG_MS } = await import('../src/ui.js');
  const ev = (type, o = {}) => Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, button: 0, clientX: 0, clientY: 0, detail: 1 }, o);
  const el = new EventTarget(); let longs = 0; longPress(el, () => longs++);
  el.dispatchEvent(ev('pointerdown')); t.mock.timers.tick(LONG_MS); el.dispatchEvent(ev('pointerup'));   // touch: hold, lift, then the mouse events
  const late = ev('mousedown'); el.dispatchEvent(late); el.dispatchEvent(ev('click'));
  assert.equal(longs, 1); assert.ok(late.defaultPrevented, "the touch's mousedown doesn't move the focus");
  el.dispatchEvent(ev('pointerdown')); const early = ev('mousedown'); el.dispatchEvent(early); t.mock.timers.tick(LONG_MS); el.dispatchEvent(ev('pointerup')); el.dispatchEvent(ev('click'));
  assert.equal(longs, 2); assert.equal(early.defaultPrevented, false, "a mouse's mousedown (before the hold) focuses as usual");
  el.dispatchEvent(ev('pointerdown')); el.dispatchEvent(ev('pointerup')); const tap = ev('mousedown'); el.dispatchEvent(tap); el.dispatchEvent(ev('click'));
  assert.equal(longs, 2); assert.equal(tap.defaultPrevented, false, 'a tap focuses as usual');
});
test('long press: the end of a fired press is swallowed wherever it lands, until the next press or key', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { longPress, LONG_MS } = await import('../src/ui.js');
  const ev = (type, o = {}) => Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, button: 0, clientX: 0, clientY: 0, detail: 1 }, o);
  // page = the window: every event passes it first (capture). The menu's click handler sits behind it: the menu slid
  // under the held finger (it scrolled into view), so the lift's click lands there, not on the slot.
  const page = new EventTarget(), slot = new EventTarget(); let longs = 0, menu = 0;
  longPress(slot, () => longs++, { root: page }); page.addEventListener('click', () => menu++);
  const down = () => { page.dispatchEvent(ev('pointerdown')); slot.dispatchEvent(ev('pointerdown')); };
  const hold = () => { down(); t.mock.timers.tick(LONG_MS); slot.dispatchEvent(ev('pointerup')); };
  hold(); const md = ev('mousedown'), click = ev('click'); page.dispatchEvent(md); page.dispatchEvent(click);
  assert.deepEqual([longs, menu], [1, 0], "the lift's click on the menu doesn't run it"); assert.ok(click.defaultPrevented); assert.ok(md.defaultPrevented, 'nor does its mousedown take the focus');
  page.dispatchEvent(ev('pointerdown')); page.dispatchEvent(ev('click')); assert.equal(menu, 1, 'the next tap is the user\'s');
  hold(); page.dispatchEvent(ev('pointerdown')); page.dispatchEvent(ev('click')); assert.deepEqual([longs, menu], [2, 2], 'no click after a long touch: the next tap still counts');
  hold(); page.dispatchEvent(ev('keydown')); page.dispatchEvent(ev('click')); assert.equal(menu, 3, 'a key press starts afresh too');
  hold(); page.dispatchEvent(ev('click', { detail: 0 })); assert.equal(menu, 4, 'a keyboard click always passes');
  page.dispatchEvent(ev('pointerdown')); slot.dispatchEvent(ev('contextmenu')); page.dispatchEvent(ev('click')); assert.deepEqual([longs, menu], [5, 5], 'a right-click holds nothing down: no click to swallow');
  down(); t.mock.timers.tick(LONG_MS - 1); slot.dispatchEvent(ev('pointerup')); page.dispatchEvent(ev('click')); assert.deepEqual([longs, menu], [5, 6], 'a short press is a tap');
});
test('a restart forgets the step on screen, so the playhead lights nothing until a step sounds', () => {
  const m = new Machine(); m.lanes.forEach((l, i) => { l.shown = i + 1; l.pos = 5; }); m.resetAll();
  assert.deepEqual(m.lanes.map(l => [l.shown, l.pos]), m.lanes.map(() => [null, 0]));
  assert.equal('shown' in m.lanes[0].toJSON(), false, 'not saved');
});

test('C1/C2: the rings and their glow stay inside the free box between the panels, under the legend', async () => {
  const { ringGeo, stageBox } = await import('../src/poly/scene.js');
  const fits = (g, s) => { const glow = g.ring(3) + 0.1 * g.R; return g.cx - glow >= s.x - 1e-9 && g.cx + glow <= s.x + s.w + 1e-9 && g.cy - glow >= s.y - 1e-9 && g.cy + glow <= s.y + s.h + 1e-9; };
  // wide windows as layoutHud measures them: the header ends at 87 px (+10), the left column is 24 + 340 px, the right
  // one 400 + 24 px; the legend wraps onto 1–4 lines of 18 px (+8) when voices are long or lanes muted
  for (const [W, H] of [[1280, 720], [1440, 900], [1101, 640]]) {
    const cols = { left: 24 + 340, right: W - 24 - 400, top: 97, bottom: H, gap: 16 };
    for (const lines of [1, 2, 3, 4]) {
      const legend = lines * 18 + 8, s = stageBox({ ...cols, legend }), g = ringGeo(W, H, s);
      assert.deepEqual([s.x, s.y, s.x + s.w, s.y + s.h], [cols.left + 16, cols.top + legend, cols.right - 16, H - 16], 'clear of both columns, under the legend, 16 px off the bottom');
      assert.ok(Math.abs(g.cx - (s.x + s.w / 2)) < 1e-9 && Math.abs(g.cy - (s.y + s.h / 2)) < 1e-9, 'centred in the stage');
      assert.ok(fits(g, s), `fits ${W}×${H} with ${lines} legend line(s)`);
    }
  }
  assert.ok(fits(ringGeo(1280, 720, { x: 10, y: 50, w: 900, h: 200 }), { x: 10, y: 50, w: 900, h: 200 }), 'a flat stage: sized by its height');
  assert.deepEqual(stageBox({ left: 0, right: 100, top: 0, bottom: 50 }), { x: 16, y: 0, w: 120, h: 120 }, 'never smaller than 120 px a side');
  const free = ringGeo(390, 390); assert.equal(free.cx, 195); assert.equal(free.cy, 195);   // no stage: the phone's square canvas
});

// ---- ORBIT2-05 · groove and dynamics ----
test('G1 nudge lock: ±½ step, clamped, moves the hit in collectHits by the expected seconds', async () => {
  const { collectHits } = await import('../src/poly/export.js');
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(5); k.setLength(4); k.setEuclid(4);   // quarters: 0.5 s at 120
  assert.equal(k.setLock(1, 'nudge', 0.9), 0.5, 'clamped to half a step'); assert.equal(k.setLock(1, 'nudge', -0.9), -0.5);
  k.setLock(1, 'nudge', 0.2); k.setLock(2, 'nudge', -0.3);
  const t = collectHits(m, { from: 0, to: 96, tempo: 120 }).map(h => +h.time.toFixed(6));
  assert.deepEqual(t, [0, 0.6, 0.85, 1.5], '+20 % of 0.5 s = +0.1 s, −30 % = −0.15 s');
  k.setLock(0, 'nudge', -0.5); assert.equal(collectHits(m, { from: 0, to: 96, tempo: 120 })[0].time, -0.25, 'the first step can land before tick 0');
});
test('G2 lane offset: ±30 ms on every hit of the lane, rounded and clamped; old saves default to 0', async () => {
  const { collectHits } = await import('../src/poly/export.js');
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const s = m.lanes[1]; s.setRatio(5); s.setLength(4); s.setEuclid(2);
  assert.equal(s.setOffset(-45), -30); assert.equal(s.setOffset(12.4), 12);
  assert.deepEqual(collectHits(m, { from: 0, to: 96, tempo: 120 }).map(h => +h.time.toFixed(6)), [0.012, 1.012]);
  s.setOffset(-20); assert.deepEqual(collectHits(m, { from: 0, to: 96, tempo: 120 }).map(h => +h.time.toFixed(6)), [-0.02, 0.98]);
  const back = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(back.lanes[1].offsetMs, -20, 'saved and loaded');
});
test('G6 swing templates: data, MPC = the old rule, triplet at 50 % = exactly ⅓ step, straight ignores the amount', async () => {
  const { SWING_TEMPLATES, SWING_KEYS } = await import('../src/poly/lanes.js'); const { collectHits } = await import('../src/poly/export.js');
  assert.deepEqual(SWING_KEYS, ['straight', 'mpc', 'triplet', '3-3-2', 'amapiano', 'aksak']);
  for (const k of SWING_KEYS) { const sh = SWING_TEMPLATES[k].shift; if (sh) { assert.equal(sh[0], 0, `${k}: the group's first step stays on the grid`); assert.ok(sh.every(x => x >= 0 && x <= 1), k); } }
  const l = new Lane('hat', { length: 16, ratioIndex: 9 }); l.swing = 0.5;
  assert.deepEqual([0, 1, 2, 3].map(s => l.swingAt(s)), [0, 0.5, 0, 0.5], 'MPC by default');
  l.setSwingTpl('triplet'); assert.ok(Math.abs(l.swingAt(1) - 1 / 3) < 1e-12, 'triplet 50 % → ⅓');
  l.setSwingTpl('straight'); assert.equal(l.swingAt(1), 0); l.setSwingTpl('nope'); assert.equal(l.swingTpl, 'straight', 'an unknown key is ignored');
  l.setSwingTpl('amapiano'); assert.ok(l.swingAt(1) > l.swingAt(3) && l.swingAt(3) > 0, 'amapiano: the e is pushed further than the a'); assert.equal(l.swingAt(2), 0);
  l.setSwingTpl('aksak'); assert.equal(l.swingPeriod(), 7); l.setSwingTpl('3-3-2'); assert.equal(l.swingPeriod(), 8);
  // collectHits: a ×4 lane at 120 bpm, steps 0.125 s; triplet 50 % puts step 1 at 0.125 + 0.125/3
  const m = new Machine(); m.lanes.forEach(x => x.clear()); const h = m.lanes[2]; h.setRatio(9); h.setLength(4); h.setEuclid(4); h.swing = 0.5; h.setSwingTpl('triplet');
  const t = collectHits(m, { from: 0, to: 24, tempo: 120 }).map(x => x.time);
  assert.ok(Math.abs(t[1] - (0.125 + 0.125 / 3)) < 1e-9 && Math.abs(t[3] - (0.375 + 0.125 / 3)) < 1e-9 && t[2] === 0.25);
  // an odd lane with a 7-step template: the cycle covers the whole swing group
  const mm = new Machine(); mm.lanes.forEach(x => { x.clear(); x.setRatio(5); x.setLength(4); }); mm.lanes[0].setLength(4); mm.lanes[0].setEuclid(4); mm.lanes[0].swing = 0.3; mm.lanes[0].setSwingTpl('aksak');
  assert.equal(mm.cycleSteps(), 28, 'lcm(4, 7) steps');
});
test('ORBIT2-05: a save without the new fields loads unchanged (MPC swing, no offset, no nudge)', () => {
  const old = { lanes: [{ name: 'kick', length: 4, ratioIndex: 5, hits: [true, false, true, false], accents: [], rotation: 0, swing: 0.25, prob: 1, tune: 0, muted: false, euclidK: 2, sound: {}, voice: 'kick', locks: [{ vel: 0.5 }], trigs: [] }], selected: 0, humanize: 0 };
  const m = Machine.from(old), l = m.lanes[0]; assert.equal(l.swingTpl, 'mpc'); assert.equal(l.offsetMs, 0); assert.deepEqual(l.locks[0], { vel: 0.5 });
  assert.equal(l.at(24, () => 0).swung, 0.25, 'old swing plays as before');
  const j = l.toJSON(); assert.equal(j.swingTpl, 'mpc'); assert.equal(j.offsetMs, 0);
});
test('G4 velocity tiers: ghost / normal / accent from taps, from a vel lock and from recorded pad velocity', async () => {
  const { GHOST_VEL, tierOfVel } = await import('../src/poly/lanes.js'); const { hitVel } = await import('../src/poly/export.js');
  const l = new Lane('snare', { length: 4 });
  l.cycleStep(0); assert.equal(l.tierAt(0), 'normal'); assert.equal(hitVel(l.accents[0], l.locks[0]), 0.7);
  l.cycleStep(0); assert.equal(l.tierAt(0), 'accent'); assert.equal(hitVel(l.accents[0], l.locks[0]), 1);
  l.cycleStep(0); assert.equal(l.tierAt(0), 'ghost'); assert.equal(l.locks[0].vel, GHOST_VEL); assert.equal(hitVel(l.accents[0], l.locks[0]), 0.35);
  l.setLock(0, 'tune', 0.3); l.cycleStep(0); assert.equal(l.tierAt(0), 'off'); l.cycleStep(0); assert.deepEqual(l.locks[0], { tune: 0.3 }, 'other locks stay');
  assert.deepEqual([0.1, 0.35, 0.5, 0.53, 0.7, 0.9].map(tierOfVel), ['ghost', 'ghost', 'ghost', 'normal', 'normal', 'normal']);
  for (const [vel, tier] of [[0.25, 'ghost'], [0.6, 'normal'], [1, 'normal']]) { l.recordHit(2, { vel }); assert.equal(l.tierAt(2), tier, `pad ${vel}`); }
  l.recordHit(2, { accent: true }); assert.equal(l.tierAt(2), 'accent');
  l.setLock(3, 'vel', 0.5); l.hits[3] = true; assert.equal(l.tierAt(3), 'ghost', 'an old soft vel lock reads as a ghost');
});
test('G3 velocity humanize: per lane, symmetric around the tier (±20 % of the velocity), seeded by locked dice, saved', async () => {
  const { collectHits } = await import('../src/poly/export.js'); const { Dice } = await import('../src/poly/dice.js');
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const h = m.lanes[2]; h.setRatio(9); h.setLength(16); h.setEuclid(16);
  const plain = collectHits(m, { from: 0, to: 96 * 8, tempo: 120 }); assert.ok(plain.every(x => x.vel === 0.7), 'off: every hit at its tier');
  h.velHuman = 1; const d = Dice.take(7), a = collectHits(m, { from: 0, to: 96 * 8, tempo: 120, dice: d }), b = collectHits(m, { from: 0, to: 96 * 8, tempo: 120, dice: d });
  assert.deepEqual(a.map(x => x.vel), b.map(x => x.vel), 'locked dice: the same velocities'); assert.deepEqual(a.map(x => x.time), plain.map(x => x.time), 'velocity humanize leaves timing alone');
  const vs = a.map(x => x.vel), mean = vs.reduce((s, v) => s + v, 0) / vs.length;
  assert.ok(vs.every(v => v >= 0.56 - 1e-9 && v <= 0.84 + 1e-9), '±20 % of 0.7 at 100 %'); assert.ok(Math.abs(mean - 0.7) < 0.03, `symmetric (mean ${mean.toFixed(3)})`); assert.ok(new Set(vs).size > 20);
  // a ghost wobbles by the same ratio (dB), not by a fixed amount that would spread it over 11 dB
  for (let i = 0; i < 16; i++) h.setTier(i, 'ghost'); const gv = collectHits(m, { from: 0, to: 96 * 8, tempo: 120, dice: d }).map(x => x.vel);
  assert.ok(gv.every(v => v >= 0.28 - 1e-9 && v <= 0.42 + 1e-9), `ghosts ${Math.min(...gv).toFixed(3)}–${Math.max(...gv).toFixed(3)}`); for (let i = 0; i < 16; i++) h.setTier(i, 'normal');
  assert.equal(Machine.from(JSON.parse(JSON.stringify(m))).lanes[2].velHuman, 1); assert.equal(Machine.from({ lanes: [{ name: 'kick' }] }).lanes[0].velHuman, 0);
  h.prob = 1; const mm = new Machine(); mm.lanes.forEach(l => { l.clear(); l.setRatio(5); l.setLength(4); }); mm.lanes[0].setEuclid(4); mm.lanes[0].velHuman = 0.5; assert.equal(mm.cycleSteps({ repeat: 3 }), 12, 'velocity rolls count for the dice repeat');
});
test('G5 velocity shapes timbre per voice: soft = darker, softer snap, a little shorter; kicks barely change; normal untouched', async () => {
  const { velShape, VEL_TIMBRE } = await import('../src/poly/voices.js');
  const p = { vel: 0.7, tune: 0, dec: 0.34, decayRaw: 0.5, snap: 0.5, color: 0.5 };
  assert.deepEqual(velShape(p, 'snare'), { ...p, dark: 0 }, 'normal velocity: as before'); assert.equal(velShape({ ...p, vel: 1 }, 'hat').dark, 0, 'accent: as before');
  const g = (k) => velShape({ ...p, vel: 0.35 }, k), sn = g('snare'), kk = g('kick');
  assert.ok(sn.dark > 0 && sn.snap < p.snap && sn.dec < p.dec, 'a ghost snare is darker, softer, shorter');
  assert.ok(kk.dark < sn.dark && kk.dec > sn.dec && kk.dec > p.dec * 0.95, 'the kick stays solid');
  const smp = g('sample'); assert.equal(smp.dec, p.dec); assert.equal(smp.snap, p.snap, 'a sample keeps its length and attack');
  assert.ok(velShape({ ...p, vel: 0.1 }, 'hat').dark > velShape({ ...p, vel: 0.5 }, 'hat').dark, 'monotonic');
  for (const k of Object.keys(VEL_TIMBRE)) assert.ok(k === 'sample' || VOICE_KEYS.includes(k), `${k} is a voice`);
});
test('G5 dsp engine: a dark layer renders duller and never louder; a band-pass layer keeps its band (the rim, round 1)', async () => {
  const { makeEngine, makeSlot, trigger } = await import('../src/poly/dsp-core.js'); const { DSP_VOICES } = await import('../src/poly/dsp-voices.js');
  const sr = 44100, p = { vel: 0.35, tune: 0, dec: 0.3, decayRaw: 0.5, snap: 0.5, color: 0.5 };
  const hf = (voice, dark) => { const e = makeEngine(sr); e.hit(DSP_VOICES[voice](p).map(L => ({ ...L, dark })), 0); const o = new Float32Array(sr / 4); for (let i = 0; i < o.length; i += 128) e.render(o, i, Math.min(o.length, i + 128)); let d = 0, a = 0; for (let i = 1; i < o.length; i++) { d += (o[i] - o[i - 1]) ** 2; a += o[i] ** 2; } return { ratio: d / a, a }; };
  // lowering the rim's band-pass onto its 880 Hz square made a soft rim 3.5 dB louder than the plain velocity drop
  for (const v of ['hat', 'ophat', 'rim', 'clap', 'cowbell', 'snare', 'tom']) {
    const open = hf(v, 0), dull = hf(v, 1);
    assert.ok(dull.ratio < open.ratio * 0.97, `${v}: brightness ${dull.ratio.toFixed(3)} vs ${open.ratio.toFixed(3)}`);
    assert.ok(dull.a <= open.a * 1.0001 && dull.a > 0, `${v}: ${(10 * Math.log10(dull.a / open.a)).toFixed(2)} dB, never louder, still sounds`);
  }
  const s = makeSlot(); trigger(s, { kind: 1, bp: 1800, bq: 2, dark: 1 }, sr, 0, 0); assert.equal(s.bp, 1800, 'the band stays'); assert.ok(s.dkA > 0 && s.dkA < 1);
  trigger(s, { kind: 1, bp: 1800, bq: 2 }, sr, 0, 0); assert.equal(s.dkA, 0, 'a normal hit: no extra filter');
});

// ---- ORBIT2-05 review round 1 ----
test('ORBIT2-05 r1: the MIDI export wraps a hit nudged or pushed out of the clip like the loop WAV; one-shot clamps', async () => {
  const { collectHits, hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js');
  const lanes = [36, 38, 42, 39].map(note => ({ note, ch: 10 })), notes = (hits, o = {}) => readMidi(hitsToMidi(hits, { tempo: 120, lanes, names: [], bars: 4, ...o })).tracks.flatMap(t => t.notes);
  // ×1 lane, 4 bars at 120 bpm = 1536 ticks (96 a beat): every step 1 nudged −½ step = 48 ticks early; the first wraps to 1488
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(5); k.setLength(4); k.setEuclid(4); k.setLock(0, 'nudge', -0.5);
  const hits = collectHits(m, { from: 0, to: 4 * 96, tempo: 120 }); assert.equal(hits[0].time, -0.25);
  const ons = notes(hits).map(n => n.on).sort((a, b) => a - b);
  assert.deepEqual(ons, [96, 192, 288, 336, 480, 576, 672, 720, 864, 960, 1056, 1104, 1248, 1344, 1440, 1488]);
  assert.deepEqual(notes(hits, { loop: false }).map(n => n.on).sort((a, b) => a - b)[0], 0, 'one-shot: onto the downbeat, as the one-shot WAV');
  // past the end wraps to the start; no note rings past the clip, so a DAW keeps it 4 bars
  const edge = notes([{ li: 1, time: 8.01, vel: 0.7 }, { li: 1, time: 7.99, vel: 0.7 }, { li: 1, time: -0.02, vel: 0.7 }, { li: 1, time: 7.9999, vel: 0.7 }]);
  assert.deepEqual(edge.map(n => n.on).sort((a, b) => a - b), [0, 2, 1532, 1534], 'a hit rounding onto the end lands on the downbeat');
  assert.ok(edge.every(n => n.off <= 1536 && n.off > n.on), JSON.stringify(edge.map(n => [n.on, n.off])));
});
test('ORBIT2-05 r1: live play = the render; an early step is decided at the last tick; a slot swap decides afresh; a mute drops the rest', async () => {
  const { collectHits, liveTick, earlyStep } = await import('../src/poly/export.js'); const { Dice } = await import('../src/poly/dice.js');
  const tickSec = 60 / 120 / 24, dice = Dice.take(99), r9 = (x) => Math.round(x * 1e9) / 1e9;
  const live = (m, to, { ahead = [], before } = {}) => {
    const out = []; let firstEarly = Infinity;
    for (let t = 0; t < to; t++) { before?.(t); liveTick(m, t, ahead, { dice, tickSec }).forEach((r, li) => { if (r.early.length) firstEarly = Math.min(firstEarly, ...r.early.map(h => h.dt)); for (const h of [...r.early, ...r.hits]) out.push({ li, time: r9(t * tickSec + h.dt), vel: h.vel }); }); }
    return { hits: out.sort((a, b) => a.time - b.time || a.li - b.li), firstEarly };
  };
  const same = (hs, upTo) => hs.filter(h => h.time < upTo).map(h => ({ li: h.li, time: r9(h.time), vel: h.vel })).sort((a, b) => a.time - b.time || a.li - b.li);
  // a busy machine: pushes both ways, nudges both ways, a template, a ratchet split by its nudge, humanize, probability, vel humanize
  const m = new Machine(); m.humanize = 0.5; m.lanes.forEach((l, i) => { l.clear(); l.setRatio(5 + (i % 2) * 2); l.setLength(8); l.setEuclid(5); l.prob = 0.8; });
  m.lanes[0].setOffset(-20); m.lanes[1].setOffset(25); m.lanes[1].setLock(2, 'nudge', -0.5); m.lanes[2].setLock(1, 'nudge', 0.4); m.lanes[2].setLock(3, 'nudge', -0.3);
  m.lanes[3].setTrig(0, { ratchet: 4 }); m.lanes[3].setLock(0, 'nudge', -0.3); m.lanes[3].swing = 0.4; m.lanes[3].setSwingTpl('amapiano'); m.lanes[2].velHuman = 1;
  const L = live(m, 96 * 8), want = collectHits(m, { from: 0, to: 96 * 8, tempo: 120, dice }), upTo = (96 * 8 - 48) * tickSec;
  assert.deepEqual(same(L.hits, upTo), same(want, upTo), 'live play holds exactly the hits of the render');
  assert.ok(L.firstEarly >= -1e-9 && L.firstEarly < tickSec + 0.015 * m.humanize, `early parts go out at the last tick that can hold them (${L.firstEarly})`);
  // when: −20 ms at 120 bpm (a tick is 20.8 ms) → one tick ahead; −½ step (0.25 s = 12 ticks) → at tick 12, not a step ahead
  const p = new Lane('kick', { length: 4, ratioIndex: 5 }); p.setEuclid(4); p.setOffset(-20);
  assert.deepEqual([22, 23].map(t => earlyStep(p, t, { tickSec })), [-1, 1]);
  p.setOffset(0); p.setLock(1, 'nudge', -0.5); assert.deepEqual([10, 12, 23].map(t => earlyStep(p, t, { tickSec })), [-1, 1, 1]);
  p.swing = 0.5; assert.equal(earlyStep(p, 23, { tickSec }), -1, 'MPC swing on step 2 cancels the −½ nudge'); p.swing = 0;
  p.toggle(1); assert.equal(earlyStep(p, 23, { tickSec }), -1, 'an empty step: nothing to decide');
  // the architect's repro: slot A (kick off, pushed −20 ms) → slot B (kick on every beat) on the bar line at tick 96
  const A = new Machine(); A.lanes.forEach(l => { l.clear(); l.setRatio(5); l.setLength(4); }); A.lanes[2].setEuclid(4); A.lanes[0].setOffset(-20);
  const B = Machine.from(A.toJSON()); B.lanes[0].setEuclid(4); const mm = Machine.from(A.toJSON());
  const kicks = live(mm, 96 * 2, { before: (t) => { if (t === 96) mm.assign(B.toJSON()); } }).hits.filter(h => h.li === 0).map(h => h.time);
  assert.deepEqual(kicks, [1.98, 2.48, 2.98, 3.48, 3.98], 'the new slot\'s downbeat kick plays (it was dropped)');
  // a ratchet ×4 nudged −0.3: two repeats go out early; muted before its tick, the other two are dropped
  const r = new Machine(); r.lanes.forEach(l => l.clear()); const R = r.lanes[1]; R.setRatio(5); R.setLength(4); R.toggle(0); R.setTrig(0, { ratchet: 4 }); R.setLock(0, 'nudge', -0.3);
  const count = (mute) => live(r, 97, { before: (t) => { if (t === 90 && mute) R.muted = true; } }).hits.filter(h => h.li === 1 && h.time > 1).length;
  assert.deepEqual([count(false), count(true)], [4, 2]);
});
test('ORBIT2-05 r1: tiers leave no trace; Shift lifts a ghost to a real accent; a loud hand-set vel lock survives; a ghost is not "locked"', async () => {
  const { GHOST_VEL } = await import('../src/poly/lanes.js'); const { hitVel } = await import('../src/poly/export.js');
  const l = new Lane('snare', { length: 4 });
  [0, 1, 2, 3].forEach(() => l.cycleStep(1)); assert.equal(l.tierAt(1), 'off'); assert.equal(l.locks[1], null, 'ghost → off: a clean step');
  l.toggle(1); assert.equal(l.tierAt(1), 'normal', 'a Move toggle or a euclid refill brings back a plain hit, not a ghost');
  l.setTier(2, 'ghost'); assert.equal(l.toggleAccent(2), true); assert.equal(l.tierAt(2), 'accent'); assert.equal(hitVel(l.accents[2], l.locks[2]), 1, 'Shift on a ghost: a real accent (was 0.65)');
  l.toggleAccent(2); assert.equal(l.tierAt(2), 'normal'); assert.equal(l.locks[2], null);
  l.toggle(3); l.setLock(3, 'vel', 0.9); assert.equal(l.cycleStep(3), 'accent'); assert.equal(l.locks[3].vel, 0.9, 'normal → accent keeps a loud hand-set lock (as before the phase)');
  assert.equal(l.cycleStep(3), 'ghost'); assert.equal(l.locks[3].vel, GHOST_VEL); assert.equal(l.cycleStep(3), 'off'); assert.equal(l.locks[3], null);
  l.setLock(0, 'vel', 0.9); l.recordHit(0, { vel: 0.7 }); assert.equal(l.locks[0], null, 'a recorded hit sets the velocity outright');
  l.setTier(1, 'ghost'); assert.equal(l.shownLock(1), null, 'a ghost shows as a ghost'); l.setLock(1, 'tune', 0.2); assert.ok(l.shownLock(1), 'plus a tune lock: locked');
  assert.equal(l.setLock(2, 'nudge', 0.2), 0.2); assert.equal(l.setLock(2, 'nudge', 0), 0); assert.equal(l.locks[2], null, 'a nudge back on the grid is no lock');
  // a share link is text: loaded locks go back into range (live play looks one step ahead, a nudge must stay within ½)
  const back = Lane.from({ name: 'kick', length: 4, locks: [{ nudge: -2, vel: 3, tune: -9 }, { nudge: 0 }, { vel: 0.5 }] });
  assert.deepEqual(back.locks.slice(0, 3), [{ nudge: -0.5, vel: 1, tune: -1 }, null, { vel: 0.5 }]);
});
test('ORBIT2-05 r1: G5 darker, not quieter: voices whose band sits above the lane filter move a fraction of an octave', async () => {
  const { velShape } = await import('../src/poly/voices.js'); const { GHOST_VEL } = await import('../src/poly/lanes.js');
  const p = { vel: GHOST_VEL, tune: 0, dec: 0.34, decayRaw: 0.5, snap: 0.5, color: 0.5 };
  for (const k of ['hat', 'ophat', 'tamb', 'ride', 'crash', 'clave', 'sample']) assert.ok(velShape(p, k).dark <= 0.4, `${k}: ${velShape(p, k).dark} octaves at the ghost tier`);
  for (const k of ['snare', 'rim', 'clap', 'tom']) assert.ok(velShape(p, k).dark >= 0.5, `${k} gets clearly darker`);
});

// ---- ORBIT2-05 review round 2 ----
test('ORBIT2-05 r2: SlotBank.nextSwitch names the tick where due() loads the next slot (queued now / bar / cycle, a chain)', async () => {
  const { SlotBank } = await import('../src/poly/slots.js'); const json = new Machine().toJSON();
  const run = (setup, acts = {}) => {
    const bank = new SlotBank(); [0, 1, 2].forEach(i => bank.save(i, json)); setup(bank); const loads = [], said = [], at = Object.keys(acts).map(Number);
    const end = 96 * 9; for (let t = 0; t < end; t++) { acts[t]?.(bank); if (bank.due(t, 72) >= 0) loads.push(t); said.push(bank.nextSwitch(t, 72)); }
    // right after due(t) it names the next tick that loads a slot (unless you recall something in between)
    said.forEach((s, t) => { const next = loads.find(x => x > t); if (at.some(a => a > t && a <= (next ?? end))) return; if (next == null) assert.ok(s >= end, `tick ${t}: ${s}`); else assert.equal(s, next, `tick ${t}`); });
    return loads;
  };
  assert.deepEqual(run(b => { b.chainBars = 2; b.setChain([0, 1, 2]); }), [0, 192, 384, 576, 768], 'a chain moves on every 2 bars');
  assert.deepEqual(run(b => b.recall(0), { 130: b => b.recall(1) }), [0, 192], 'bar: the next bar line');
  assert.deepEqual(run(b => { b.recall(0); b.switchAt = 'cycle'; }, { 130: b => b.recall(1) }), [0, 144], 'cycle: the next multiple of the cycle');
  assert.deepEqual(run(b => { b.recall(0); b.switchAt = 'now'; }, { 130: b => b.recall(1) }), [0, 130], 'now: the next tick');
  assert.equal(new SlotBank().nextSwitch(5, 72), Infinity, 'nothing queued');
});
test('ORBIT2-05 r2: a slot switch or a chain step plays what the chain render has; a lane replaced mid-step never doubles a hit', async () => {
  const { liveTick, collectChain, collectHits } = await import('../src/poly/export.js'); const { SlotBank } = await import('../src/poly/slots.js');
  const tickSec = 60 / 120 / 24, r4 = (x) => Math.round(x * 1e4) / 1e4;
  const kick = (f) => { const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(5); k.setLength(4); k.hits.fill(true, 0, 4); f?.(k); return m.toJSON(); };
  // the app's master tick (onTick): due() and its slot load first, then liveTick with the next switch as the cut
  const play = (bank, to, act) => {
    const m = new Machine(), ahead = [], out = [];
    for (let t = 0; t < to; t++) {
      act?.(t, m); const si = bank.due(t, 96); if (si >= 0) m.assign(bank.get(si));
      liveTick(m, t, ahead, { rng: () => 0, tickSec, cut: bank.nextSwitch(t, 96) }).forEach(({ early, hits }) => { for (const h of [...early, ...hits]) out.push(r4(t * tickSec + h.dt)); });
    }
    return out.sort((a, b) => a - b);
  };
  const push = (k) => k.setOffset(-20), cases = {
    'A pushed −20 ms → B on the grid': [kick(push), kick()], 'A and B the same pushed kick': [kick(push), kick(push)],
    'B without a downbeat': [kick(push), kick(k => { k.hits[0] = false; })], 'A step 1 nudged −½ → B plain': [kick(k => k.setLock(0, 'nudge', -0.5)), kick()],
    'A plain → B step 1 nudged −½': [kick(), kick(k => k.setLock(0, 'nudge', -0.5))],
  };
  for (const [name, [A, B]] of Object.entries(cases)) {   // round 2: 1.98 + 2.00, 1.98 twice, a kick B hasn't, 1.75 + 2.00
    const bank = new SlotBank(); bank.save(0, A); bank.save(1, B); bank.chainBars = 1; bank.setChain([0, 1]);
    const want = collectChain([A, B, A, B], { bars: 1, tempo: 120 }).map(h => r4(h.time)).filter(x => x >= 0);
    assert.deepEqual(play(bank, 96 * 4).filter(x => x >= 0), want, `chain: ${name}`);
  }
  // a slot recalled while playing (bar mode): the bar line plays the new slot's downbeat only
  const [A, B] = cases['A pushed −20 ms → B on the grid'], bank = new SlotBank(); bank.save(0, A); bank.save(1, B); bank.recall(0);
  assert.deepEqual(play(bank, 192, (t) => { if (t === 70) bank.recall(1); }).filter(x => x > 1.5), [2, 2.5, 3, 3.5]);
  // undo, redo, a link: nothing announces them. The same lanes again inside a step's early window: no second hit
  const u = kick(k => k.setLock(2, 'nudge', -0.5)), none = new SlotBank(), at40 = (json) => (t, m) => { if (t === 0) m.assign(u); if (t === 40) m.assign(json); };
  assert.deepEqual(play(none, 96, at40(u)), collectHits(Machine.from(u), { from: 0, to: 96, tempo: 120 }).map(h => r4(h.time)));
  // another pattern: what already sounded stays and the step isn't started again (whether B has it on the grid or not)
  assert.deepEqual(play(none, 96, at40(kick())), [0, 0.5, 0.75, 1.5]);
  assert.deepEqual(play(none, 96, at40(kick(k => { k.hits[2] = false; }))), [0, 0.5, 0.75, 1.5]);
});
// ---- ORBIT2-05 review round 3 ----
test('ORBIT2-05 r3: a lane that changes speed between an early decision and its tick plays that moment once', async () => {
  const { liveTick } = await import('../src/poly/export.js'); const { RATIOS } = await import('../src/poly/lanes.js');
  const tickSec = 60 / 120 / 24, r3 = (x) => Math.round(x * 1e3) / 1e3;
  // kick on every beat (×1), changed on the bar line (tick 96, before that tick plays: evolve, a slot) as in onTick
  const play = (f, change, { roll = () => 0.5 } = {}) => {
    const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(RATIOS.indexOf(1)); k.setLength(4); k.hits.fill(true, 0, 4); f(k);
    const ahead = [], out = [];
    for (let t = 0; t < 150; t++) { if (t === 96) change(m); liveTick(m, t, ahead, { rng: () => roll(t), tickSec }).forEach(({ early, hits }, li) => { if (!li) for (const h of [...early, ...hits]) out.push(r3(t * tickSec + h.dt)); }); }
    return out.filter(x => x > 1.5);
  };
  const push = (k) => k.setOffset(-20), speed = (r) => (m) => m.lanes[0].setRatio(RATIOS.indexOf(r));
  // round 3: 1.98 twice, or two downbeats (1.75 + 1.833): the lane at its new speed numbered the tick as another step
  assert.deepEqual(play(push, speed(3 / 2)), [1.98, 2.313, 2.647, 2.98], 'the speed gauge ×1 → ×3/2 inside the early window');
  assert.deepEqual(play(push, speed(3 / 4)), [1.98, 2.647], '×1 → ×¾');
  assert.deepEqual(play(push, (m) => m.evolve({ scope: 'all', amount: 1 }, () => 0.8)), [1.98, 2.313, 2.647, 2.98], 'evolve "all" changes the speed on the bar line');
  assert.deepEqual(play(k => [0, 1, 2, 3].forEach(i => k.setLock(i, 'nudge', -0.5)), speed(3 / 2)), [1.75, 2.167, 2.5, 2.833], 'one downbeat, nudged −½');
  assert.deepEqual(play(push, (m) => { const j = m.toJSON(); j.lanes[0].ratioIndex = RATIOS.indexOf(2); m.assign(j); }), [1.98, 2.23, 2.48, 2.73, 2.98], 'a slot, undo or a link at another speed');
  // nothing sounded yet (the early roll missed): the lane at its new speed decides its own step afresh
  const missed = (k) => { push(k); k.prob = 0.5; };
  assert.deepEqual(play(missed, speed(3 / 2), { roll: (t) => (t < 96 ? 0.9 : 0.1) }), [1.98, 2.313, 2.647, 2.98]);
});
test('ORBIT2-05 r3: live record: a step a pad just played sounds neither its early part nor its own hits (skip)', async () => {
  const { liveTick } = await import('../src/poly/export.js');
  const tickSec = 60 / 120 / 24, m = new Machine(); m.lanes.forEach(l => l.clear());
  const k = m.lanes[0]; k.setRatio(5); k.setLength(4); k.setOffset(-20); k.toggle(1); k.toggle(2); k.setTrig(1, { ratchet: 4 }); k.setLock(1, 'nudge', -0.3);
  // the pad played step 1 before its tick was scheduled (liveHit adds the key): its early repeats and its own go
  const skip = new Set(['0:1']), ahead = [], hits = [], shown = [];
  for (let t = 0; t < 130; t++) liveTick(m, t, ahead, { rng: () => 0, tickSec, skip }).forEach(({ ev, early, hits: own }, li) => {
    if (li) return; if (ev?.index === 1) shown.push(ev.hit); for (const h of [...early, ...own]) hits.push(Math.round((t * tickSec + h.dt) * 1e3) / 1e3);
  });
  assert.deepEqual(shown, [false, true], 'the scene shows the pad\'s hit, not a second one; the next loop plays it again');
  assert.equal(skip.size, 0, 'the key goes at its step\'s tick');
  assert.deepEqual(hits.filter(x => x < 2), [0.98], 'step 2 plays, pushed −20 ms; step 1 (a ×4 roll nudged −0.3, half of it early) not at all');
  assert.deepEqual(hits.filter(x => x > 2), [2.33, 2.455, 2.58, 2.705], 'a loop later step 1 rolls ×4 again');
});
test('ORBIT2-05 r2: a render starts PRE_ROLL before its earliest hit, so the master has settled when the first hit comes', async () => {
  const { renderLead, PRE_ROLL } = await import('../src/poly/jam.js');
  assert.ok(PRE_ROLL >= 0.2, 'the master compressor + limiter take ~0.2 s to settle');
  assert.equal(renderLead([{ time: 0 }, { time: 1 }]), PRE_ROLL); assert.equal(renderLead([{ time: 0.3 }]), PRE_ROLL); assert.equal(renderLead([]), PRE_ROLL);
  assert.equal(renderLead([{ time: 1 }, { time: -0.25 }]), PRE_ROLL + 0.25, 'a hit nudged before tick 0 is PRE_ROLL into the render too');
});
test('ORBIT2-05 r2: dsp G5 has no level step under normal velocity; a softer clap is never louder; the shaker is a bright voice', async () => {
  const { makeEngine, makeSlot, trigger } = await import('../src/poly/dsp-core.js'); const { DSP_VOICES } = await import('../src/poly/dsp-voices.js');
  const { velShape } = await import('../src/poly/voices.js'); const { GHOST_VEL } = await import('../src/poly/lanes.js');
  const sr = 44100, p = { vel: 0.7, tune: 0, dec: 0.3, decayRaw: 0.5, snap: 0.5, color: 0.5 };
  const energy = (voice, vel) => { const q = velShape({ ...p, vel }, voice), e = makeEngine(sr); e.hit(DSP_VOICES[voice](q).map(L => q.dark ? { ...L, dark: q.dark } : L), 0); const o = new Float32Array(sr / 2); for (let i = 0; i < o.length; i += 128) e.render(o, i, Math.min(o.length, i + 128)); let a = 0; for (const x of o) a += x * x; return a; };
  const beyond = (v, vel) => 10 * Math.log10(energy(v, vel) / energy(v, 0.7)) - 20 * Math.log10(vel / 0.7);   // dB past the plain velocity drop
  // round 2: an added filter came in whole at any darkness, so 0.69 was 1–2 dB under 0.70 (tambourine −2.1, shaker −1.9)
  for (const v of Object.keys(DSP_VOICES)) { const s = beyond(v, 0.69); assert.ok(s > -0.6 && s < 0.3, `${v}: 0.69 is ${s.toFixed(2)} dB past the plain drop`); }
  for (const vel of [0.69, 0.65, 0.6, 0.5, GHOST_VEL]) assert.ok(beyond('clap', vel) < 0.1, `a softer clap keeps its claps and is never louder (${vel})`);
  const s = makeSlot(); trigger(s, { kind: 1, bp: 1800, dark: 0.25 }, sr, 0, 0); assert.equal(s.dkW, 1, 'from a quarter octave on (every ghost tier): the whole filter');
  trigger(s, { kind: 1, dark: 0.05 }, sr, 0, 0); assert.ok(s.dkLp && Math.abs(s.dkW - 0.2) < 1e-9, 'a low-pass added to an open layer fades in too');
  assert.ok(velShape({ ...p, vel: GHOST_VEL }, 'shaker').dark <= 0.4, 'the shaker moves a fraction of an octave, like the hats');
});
