import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euclid, Lane, Machine, RATIOS, OLD_RATIOS, ratioIndexOf, SOUND_KEYS, DEFAULT_SOUND, PPQ as P, MIDI_DIV } from '../src/poly/lanes.js';
/** Old 24-PPQ tick → master tick (every pre-R1 test is written in 24-PPQ ticks). */
const T = (n) => n * MIDI_DIV, TICK = 60 / 120 / P;   // TICK: one master tick at 120 bpm
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
  l.setLength(20); assert.equal(l.length, 20, 'L1: up to 32'); l.setLength(40); assert.equal(l.length, 32); l.setLength(0); assert.equal(l.length, 1);
});
test('a lane walks its loop from the master tick, respects mute and probability', () => {
  const l = new Lane('hat', { length: 3 }); l.setEuclid(3);
  const out = [0, 1, 2, 3].map(s => l.at(s * P, () => 0.5)); assert.deepEqual(out.map(o => o.index), [0, 1, 2, 0]); assert.ok(out.every(o => o.hit));
  l.prob = 0.3; assert.equal(l.at(0, () => 0.9).hit, false); l.prob = 1; l.muted = true; assert.equal(l.at(0).hit, false);
  l.swing = 0.25; l.muted = false; assert.equal(l.at(P).swung, 0.25); assert.equal(l.at(2 * P).swung, 0);
});
test('machine: step seconds follow ratio and tempo; cycle length; (de)serialisation', () => {
  const m = new Machine(); const [k, s] = m.lanes; k.setRatio(5); s.setRatio(ratioIndexOf(2)); // 1 and 2
  assert.equal(m.stepSeconds(k, 120), 0.5, 'ratio 1 = a quarter note'); assert.equal(m.stepSeconds(s, 120), 0.25, 'ratio 2 = an eighth');
  m.lanes.forEach(l => l.setRatio(5)); m.lanes[0].setLength(4); m.lanes[1].setLength(3); m.lanes[2].setLength(4); m.lanes[3].setLength(4); assert.equal(m.cycleSteps(), 12);
  m.randomize(() => 0.42); const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.deepEqual(copy.toJSON(), m.toJSON()); assert.equal(RATIOS.length, 15);
});

test('per-lane sound params clamp and survive save/load', () => {
  const m = new Machine(); const l = m.lanes[2]; assert.equal(SOUND_KEYS.length, 8);
  assert.equal(l.setSound('drive', 1.7), 1); assert.equal(l.setSound('pan', -2), 0); assert.equal(l.setSound('nope', 0.5), undefined);
  const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(copy.lanes[2].sound.drive, 1); assert.equal(copy.lanes[0].sound.tone, 0.75);
});

test('kits reference real voices and apply without touching patterns', () => {
  for (const [k, kit] of Object.entries(KITS)) { assert.equal(kit.lanes.length, 6, `${k}: L2 voices for lanes 5–6 too`); for (const l of kit.lanes) { assert.ok(VOICE_KEYS.includes(l.voice), `${k}: ${l.voice}`); for (const sk of Object.keys(l.sound || {})) assert.ok(SOUND_KEYS.includes(sk), `${k}: sound.${sk}`); } }
  const m = new Machine(); m.lanes[0].setEuclid(3); const hits = [...m.lanes[0].hits];
  m.applyKit(KITS.space, DEFAULT_SOUND); assert.equal(m.lanes[1].voice, 'bell'); assert.equal(m.lanes[0].sound.send, 0.4); assert.deepEqual(m.lanes[0].hits, hits); assert.equal(m.kit, 'Space');
  const copy = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(copy.lanes[2].voice, 'blip'); assert.equal(copy.kit, 'Space');
  assert.ok(VOICE_KEYS.length >= 14);
});

test('kits: every lane uses an existing voice and only known sound keys', async () => {
  const { VOICES } = await import('../src/poly/voices.js'); const { KITS } = await import('../src/poly/kits.js'); const { SOUND_KEYS } = await import('../src/poly/lanes.js');
  for (const [id, kit] of Object.entries(KITS)) { assert.equal(kit.lanes.length, 6, id); for (const l of kit.lanes) { assert.ok(VOICES[l.voice], `${id}: ${l.voice}`); for (const k of Object.keys(l.sound || {})) assert.ok(SOUND_KEYS.includes(k), `${id}: sound key ${k}`); } }
});

test('master clock: lanes derive their step from the tick and stay phase-locked', async () => {
  const { PPQ, BAR_TICKS } = await import('../src/poly/lanes.js');
  const m = new Machine(); const [k, , h] = m.lanes; k.setRatio(5); k.setLength(4); k.setEuclid(4); h.setRatio(ratioIndexOf(4)); h.setLength(8); h.setEuclid(8); // ×1 and ×4
  assert.equal(PPQ, 840); assert.equal(BAR_TICKS, 3360); assert.equal(k.stepTicks(), 840); assert.equal(h.stepTicks(), 210);
  const evs = []; for (let t = 0; t < BAR_TICKS; t++) { const e = m.tick(t, () => 0); if (e[0]) evs.push(['k', t, e[0].index]); if (e[2]) evs.push(['h', t, e[2].index]); }
  assert.equal(evs.filter(e => e[0] === 'k').length, 4); assert.equal(evs.filter(e => e[0] === 'h').length, 16);
  assert.deepEqual(evs.filter(e => e[0] === 'k').map(e => e[1]), [0, 840, 1680, 2520]);
  // change speed mid-play: the position comes from the tick, so ×2 at tick 96 is step 8 → index 0 of a 4-step lane, on the beat
  k.setRatio(ratioIndexOf(2)); const e = k.at(BAR_TICKS, () => 0); assert.equal(e.step, 8); assert.equal(e.index, 0); assert.equal(k.at(BAR_TICKS + 4), null);
  for (const r of RATIOS) assert.ok(Number.isInteger(PPQ / r), `ratio ${r} is a whole number of ticks`);
  assert.equal(m.cycleTicks(), m.cycleSteps() * PPQ);
});
test('step locks: clamp, read through rotation, override prob, survive save/load', () => {
  const l = new Lane('snare', { length: 4 }); l.setEuclid(4);
  assert.equal(l.setLock(1, 'tune', 3), 1); assert.equal(l.setLock(1, 'vel', -1), 0); assert.equal(l.setLock(1, 'nope', 1), undefined);
  l.setLock(2, 'prob', 0); assert.equal(l.at(2 * P, () => 0.5).hit, false, 'prob lock 0 silences the step'); assert.equal(l.at(P, () => 0.5).hit, true);
  l.rotation = 1; assert.deepEqual(l.lockAt(2), { tune: 1, vel: 0 }, 'locks move with the rotation');
  const c = Lane.from(JSON.parse(JSON.stringify(l))); assert.deepEqual(c.locks[1], { tune: 1, vel: 0 }); assert.equal(c.locks[0], null);
  c.clearLocks(1); assert.equal(c.locks[1], null); l.clear(); assert.ok(l.locks.every(x => x === null));
});
test('live record quantize: nearest rounds forward, previous files under the last step', () => {
  const l = new Lane('kick', { length: 4 }); // ×1: 24 old ticks (840) per step
  assert.deepEqual(l.quantize(T(23)), { step: 1, index: 1, ahead: true }); assert.deepEqual(l.quantize(T(23), 'previous'), { step: 0, index: 0, ahead: false });
  assert.equal(l.quantize(T(24 * 5 + 2)).index, 1); assert.equal(l.quantize(T(-3)).index, 0);
  assert.equal(l.quantize(T(12)).step, 1, 'half way: the coming step');
  // swung lanes: a hit played with a swung step is filed under it (round 2: at 50 % it went to the next step)
  const h = new Lane('hat', { length: 8, ratioIndex: RATIOS.indexOf(4) }); h.swing = 0.5;   // 6 ticks per step, odd steps 3 ticks late
  for (const s of [1, 3, 5]) { assert.equal(h.quantize(T(s * 6 + 3)).step, s, `on swung step ${s}`); assert.equal(h.quantize(T(s * 6 + 4), 'previous').step, s, `just after swung step ${s}`); }
  assert.equal(h.quantize(T(6 + 2), 'previous').step, 0, 'swung step 1 has not sounded yet'); assert.equal(h.quantize(T(6 * 2 - 1)).step, 2, 'just before the beat: the beat');
  const t = new Lane('hat', { length: 4, ratioIndex: RATIOS.indexOf(3) }); t.swing = 0.5;   // ×3: 8 ticks, only the middle of each three swings
  assert.equal(t.quantize(T(8 + 4)).step, 1); assert.equal(t.quantize(T(16 + 1)).step, 2, 'the last of three is straight');
});
test('evolve nudges only lanes that allow it and stays in range', () => {
  const m = new Machine(); m.lanes.forEach(l => { l.setLength(8); l.setEuclid(3); }); m.lanes[0].evolve = false; m.lanes[1].muted = true;
  let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 200; n++) { const ch = m.evolve({ scope: 'all', amount: 1 }, rng); assert.ok(ch.every(c => c.lane >= 2)); }
  assert.equal(m.lanes[0].euclidK, 3); assert.equal(m.lanes[0].rotation, 0);
  for (const l of m.lanes.slice(2)) { assert.ok(l.length >= 2 && l.length <= 16); assert.ok(l.rotation < l.length); assert.ok(l.ratio >= 2 / 3 && l.ratio <= 3 && [2 / 3, 3 / 4, 1, 3 / 2, 2, 3].includes(l.ratio), `classic speeds only: ${l.ratio}`); assert.ok(l.hits.slice(0, l.length).some(Boolean)); }
  const r = new Machine(); r.lanes.forEach(l => l.setEuclid(2)); const before = JSON.stringify(r.lanes.map(l => l.hits)); r.evolve({ scope: 'rotate', amount: 1 }, rng); assert.equal(JSON.stringify(r.lanes.map(l => l.hits)), before, 'rotate scope never rewrites hits');
  const a = new Machine(); a.lanes[0].setEuclid(1); const b = new Machine(); b.assign(JSON.parse(JSON.stringify(a))); assert.deepEqual(b.toJSON(), a.toJSON());
});
test('slot bank: save, queue on bar / cycle, chains advance every N bars, persistence', async () => {
  const { SlotBank } = await import('../src/poly/slots.js'); const mem = new Map(); const store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const b = new SlotBank(store); b.save(0, { a: 1 }); b.save(3, { a: 2 }); assert.equal(b.current, 3);
  assert.equal(b.recall(5), false, 'empty slot'); b.recall(0); assert.equal(b.due(T(10), T(192)), -1); assert.equal(b.due(T(96), T(192)), 0); assert.equal(b.current, 0);
  b.switchAt = 'cycle'; b.recall(3); assert.equal(b.due(T(96), T(192)), -1); assert.equal(b.due(T(192), T(192)), 3);
  b.switchAt = 'now'; b.recall(0); assert.equal(b.due(T(5), T(192)), 0);
  b.switchAt = 'bar'; b.chainBars = 2; b.setChain([0, 7, 3]); assert.deepEqual(b.chain, [0, 3], 'empty slots are skipped');
  const loads = []; for (let t = 0; t <= T(96 * 6); t++) { const i = b.due(t, T(192)); if (i >= 0) loads.push([t / T(96), i]); }
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
  const hits = []; for (let t = 0; t < P * 8; t += P) { const e = l.at(t, () => 0); hits.push(e.hit ? (e.ratchet > 1 ? 'R' : 'x') : '.'); }
  assert.equal(hits.join(''), 'xR.RxR.R', 'step 0 every other loop, step 1 always as a ratchet'); assert.equal(l.trigs[1].ratchet, 8, 'clamped (V4: up to ×8)');
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
  const l = new Lane('hat', { length: 4 }); l.setEuclid(4); l.prob = 0.5; const run = () => [...Array(16)].map((_, s) => l.at(s * P, Math.random, { dice: d, li: 0 }).hit).join(); assert.equal(run(), run());
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
  const hits = collectHits(m, { from: 0, to: T(96), tempo: 120 }); assert.equal(hits.length, 6, '3 single hits + one ×3');
  assert.deepEqual(hits.map(h => +h.time.toFixed(3)), [0, 0.5, 1, 1.167, 1.333, 1.5]); assert.ok(hits[3].vel < hits[2].vel, 'fade');
  const sw = new Lane('hat', { length: 2 }); sw.setEuclid(2); sw.swing = 0.5; const e = sw.at(P, () => 0); assert.ok(Math.abs(expandHits(e, sw, 0, { tickSec: 1 / 48 / MIDI_DIV })[0].dt - 0.25) < 1e-12, 'half a step late');
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
  const { wavFromInt16, mixInt16, headroomGain, stemsZip } = await import('../src/poly/jam.js');
  const w = wavFromInt16([Int16Array.of(1, 2), Int16Array.of(3)], [Int16Array.of(-1, -2), Int16Array.of(-3)], 48000);
  const v = new DataView(w.buffer); assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF'); assert.equal(v.getUint32(40, true), 12, '3 frames × 4 bytes'); assert.equal(v.getInt16(44 + 8, true), 3); assert.equal(v.getInt16(44 + 10, true), -3);
  const lane = (x) => [[Int16Array.of(x, x)], [Int16Array.of(-x, -x)]];
  const mix = mixInt16([lane(20000), lane(20000), lane(1), lane(0)]); assert.equal(mix[0][0][0], 32767, 'clipped, not wrapped'); assert.equal(mix[1][0][1], -32768);
  const gain = headroomGain([Float32Array.of(2, 0), Float32Array.of(0, 0), Float32Array.of(0.5, 0), Float32Array.of(0, 0)]);
  assert.ok(Math.abs(gain - 0.49) < 1e-9, 'loudest lane scaled to 0.98'); assert.equal(headroomGain([Float32Array.of(0.5)]), 1, 'under 0.98: untouched');
  assert.equal(headroomGain([Float32Array.of(2)], 32), 1, '32-bit float: as rendered');
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
  const { ARTICS } = await import('../src/poly/voices.js');
  for (const k of DSP_KEYS) {
    // ORBIT2-08: every stroke of a voice that has them (L3), at the knob extremes too
    const strokes = (ARTICS[k] || []).flatMap((_, a) => [{ ...p, artic: a }, { ...p, artic: a, tune: 1, snap: 1, color: 1, dec: 1.24 }, { ...p, artic: a, tune: -1, snap: 0, color: 0, dec: 0.04 }]);
    for (const q of [p, { ...p, tune: 1, snap: 1, color: 1, dec: 1.24 }, { ...p, tune: -1, snap: 0, color: 0, dec: 0.04 }, ...strokes]) {
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
  // ORBIT2-08: the new voices allocate nothing while they render — no slot grows a field, and no garbage collection runs
  // during 20 s of them hit twice a second (allocating per sample would be ~900k objects: several scavenges)
  const { setFlagsFromString } = await import('node:v8'); const { runInNewContext } = await import('node:vm'); const { PerformanceObserver } = await import('node:perf_hooks');
  setFlagsFromString('--expose_gc'); const gc = runInNewContext('gc'); const fresh = Object.keys(makeEngine(sr).slots[0]).length;
  const e2 = makeEngine(sr), buf = new Float32Array(128), voices = ['djembe', 'logdrum', 'agogo', 'shekere'], hits = voices.flatMap(v => [p, { ...p, artic: 1 }, { ...p, artic: 2 }].map(q => DSP_VOICES[v](q)));
  gc(); await new Promise(r => setTimeout(r, 20)); let gcs = 0; const obs = new PerformanceObserver(l => { gcs += l.getEntries().length; }); obs.observe({ entryTypes: ['gc'] });
  for (let b = 0, n = 0; b < sr * 20 / 128; b++) { if (b % 172 === 0) e2.hit(hits[n++ % hits.length], 0); buf.fill(0); e2.render(buf, 0, 128); }
  await new Promise(r => setTimeout(r, 50)); obs.disconnect();
  assert.equal(gcs, 0, 'garbage collections while rendering'); assert.ok(e2.slots.every(s => Object.keys(s).length === fresh), 'slot shape');
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
  const evs = []; for (let t = 0; t < P * 5 * 10; t += P) evs.push(l.at(t, () => 0));   // 10 loops at ×1
  assert.equal(evs.length, 50); assert.ok(evs.every(e => e.swung === (e.step % 2 ? 0.3 : 0)), 'odd absolute steps only');
  assert.ok(evs.some(e => e.index === 0 && e.step % 2), 'index 0 lands on odd steps too (and is swung there, it is an off-step)');
  const m = new Machine(); m.lanes.forEach(x => x.clear()); Object.assign(m.lanes[0], Lane.from({ ...l.toJSON(), name: 'kick' }));
  const hits = collectHits(m, { from: 0, to: P * 50, tempo: 120 }), beat = 0.5;
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
  assert.equal(m.cycleSteps(), 4); assert.equal(m.cycleTicks(), T(96));
  m.lanes[1].setTrig(0, { cond: '1:3' }); assert.equal(m.cycleSteps(), 12, 'a 1:3 step triples the cycle'); assert.equal(m.cycleTicks(), T(288));
  m.lanes[1].setTrig(1, { cond: '1:3' }); assert.equal(m.cycleSteps(), 12, 'only active steps count'); m.lanes[2].setTrig(0, { cond: '2:4' }); assert.equal(m.cycleSteps(), 48, 'lcm(3, 4) loops');
  m.lanes[2].setTrig(0, { cond: 'first' }); assert.equal(m.cycleSteps(), 12, 'first / fill are not periodic');
  assert.equal(m.cycleSteps({ repeat: 4 }), 12, 'dice repeat only matters when a roll can change something');
  m.lanes[0].prob = 0.5; assert.equal(m.cycleSteps({ repeat: 4 }), 48, 'lane 1 rolls: 4 loops = 16 beats, with lane 2 at 12 → 48'); assert.equal(m.cycleSteps({ repeat: 5 }), 60);
  m.lanes[0].prob = 1; m.lanes[0].setLock(0, 'prob', 0.5); assert.equal(m.cycleSteps({ repeat: 4 }), 48, 'a prob lock on an active step rolls too');
  m.lanes[0].clearLocks(0); m.humanize = 0.2; assert.equal(m.cycleTicks({ repeat: 2 }), 24 * P, 'humanize: every lane rolls; lane 2 = lcm(3, 2) = 6 loops = 24 beats');
  m.lanes[1].setTrig(0, { cond: 'always' }); assert.equal(m.cycleSteps({ repeat: 2 }), 8, 'repeat 2 on 4-step lanes');
});
test('B5 one roll, one hit list: WAV hits and MIDI notes of the same take are identical; a new roll differs', async () => {
  const { collectHits, hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js'); const { Dice } = await import('../src/poly/dice.js');
  const m = new Machine(); m.lanes.forEach(l => { l.setLength(8); l.setRatio(ratioIndexOf(2)); l.setEuclid(6); l.prob = 0.5; }); m.humanize = 0.6;
  const take = (seed) => collectHits(m, { from: 0, to: T(96 * 4), tempo: 120, dice: Dice.take(seed) });
  const wav = take(48213), again = take(48213), midiHits = take(48213);
  assert.deepEqual(again, wav, 'the same roll gives the same hits'); assert.ok(wav.length > 20 && wav.length < 96, `probability thinned the pattern (${wav.length})`);
  const lanes = [36, 38, 42, 39].map(note => ({ note, ch: 10 })), mid = readMidi(hitsToMidi(midiHits, { tempo: 120, lanes, names: ['a', 'b', 'c', 'd'], bars: 4 }));
  const notes = mid.tracks.flatMap(t => t.notes); assert.equal(notes.length, wav.length, 'same count');
  // a hit humanized before the downbeat wraps to the clip's end, as in the loop WAV (ORBIT2-05)
  const tickOf = (sec) => { const s = ((sec / (60 / 120 / 4)) % 64 + 64) % 64, t = Math.round(s * 24); return t >= 64 * 24 ? 0 : t; };
  const ons = notes.map(n => n.on).sort((a, b) => a - b), want = wav.map(h => tickOf(h.time)).sort((a, b) => a - b);
  assert.deepEqual(ons, want, 'same times (MIDI ticks)');
  assert.notDeepEqual(take(7), wav, 'another roll is another take');
  const free = [0, 1].map(() => collectHits(m, { from: 0, to: T(96 * 4), tempo: 120 })); assert.notDeepEqual(free[0], free[1], 'without a roll every render differs (the old bug)');
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
    for (let s = 0; s < 120; s++) { const ev = l.at(s * st, () => 0); if ((s * st) % P === 0) assert.equal(ev.swung, 0, `×${ratio} length ${length}: step ${s} is on a beat`); }
    assert.ok([...Array(120)].some((_, s) => l.at(s * st, () => 0).swung), `×${ratio}: something still swings`);
  }
  // the binary speeds keep plain step parity (×2: every second eighth, also on odd lengths)
  const e = at(2, 3); assert.deepEqual([0, 1, 2, 3, 4, 5].map(s => e.at(s * P / 2, () => 0).swung > 0), [false, true, false, true, false, true]);
  // in the export too: a ×3 lane of 3 at 120 bpm, every beat on the grid, the middle triplet late
  const m = new Machine(); m.lanes.forEach(x => x.clear()); Object.assign(m.lanes[0], Lane.from({ ...at(3, 3).toJSON(), name: 'kick' }));
  const hits = collectHits(m, { from: 0, to: T(96 * 2), tempo: 120 }).map(h => +(h.time * 1000).toFixed(1));
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
    const r = new Machine(); r.lanes.forEach(l => { l.clear(); l.setLength(1 + Math.floor(rng() * 7)); l.setRatio(ratioIndexOf(OLD_RATIOS[3 + Math.floor(rng() * 6)])); for (let i = 0; i < l.length; i++) if (rng() < 0.6) l.hits[i] = true; l.swing = rng() < 0.5 ? 0.3 : 0; l.rotation = Math.floor(rng() * l.length); if (rng() < 0.3) l.setTrig(0, { cond: conds[Math.floor(rng() * conds.length)] }); });
    const C = r.cycleTicks(); if (C > P * 96) continue; checked++;
    const tickSec = TICK, hits = collectHits(r, { from: 0, to: 2 * C, tempo: 120 }), half = hits.filter(h => h.time < C * tickSec - 1e-9), rest = hits.slice(half.length);
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
  const t = collectHits(m, { from: 0, to: T(96), tempo: 120 }).map(h => +h.time.toFixed(6));
  assert.deepEqual(t, [0, 0.6, 0.85, 1.5], '+20 % of 0.5 s = +0.1 s, −30 % = −0.15 s');
  k.setLock(0, 'nudge', -0.5); assert.equal(collectHits(m, { from: 0, to: T(96), tempo: 120 })[0].time, -0.25, 'the first step can land before tick 0');
});
test('G2 lane offset: ±30 ms on every hit of the lane, rounded and clamped; old saves default to 0', async () => {
  const { collectHits } = await import('../src/poly/export.js');
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const s = m.lanes[1]; s.setRatio(5); s.setLength(4); s.setEuclid(2);
  assert.equal(s.setOffset(-45), -30); assert.equal(s.setOffset(12.4), 12);
  assert.deepEqual(collectHits(m, { from: 0, to: T(96), tempo: 120 }).map(h => +h.time.toFixed(6)), [0.012, 1.012]);
  s.setOffset(-20); assert.deepEqual(collectHits(m, { from: 0, to: T(96), tempo: 120 }).map(h => +h.time.toFixed(6)), [-0.02, 0.98]);
  const back = Machine.from(JSON.parse(JSON.stringify(m))); assert.equal(back.lanes[1].offsetMs, -20, 'saved and loaded');
});
test('G6 swing templates: data, MPC = the old rule, triplet at 50 % = exactly ⅓ step, straight ignores the amount', async () => {
  const { SWING_TEMPLATES, SWING_KEYS } = await import('../src/poly/lanes.js'); const { collectHits } = await import('../src/poly/export.js');
  assert.deepEqual(SWING_KEYS, ['straight', 'mpc', 'triplet', '3-3-2', 'amapiano', 'aksak']);
  for (const k of SWING_KEYS) { const sh = SWING_TEMPLATES[k].shift; if (sh) { assert.equal(sh[0], 0, `${k}: the group's first step stays on the grid`); assert.ok(sh.every(x => x >= 0 && x <= 1), k); } }
  const l = new Lane('hat', { length: 16, ratioIndex: ratioIndexOf(4) }); l.swing = 0.5;
  assert.deepEqual([0, 1, 2, 3].map(s => l.swingAt(s)), [0, 0.5, 0, 0.5], 'MPC by default');
  l.setSwingTpl('triplet'); assert.ok(Math.abs(l.swingAt(1) - 1 / 3) < 1e-12, 'triplet 50 % → ⅓');
  l.setSwingTpl('straight'); assert.equal(l.swingAt(1), 0); l.setSwingTpl('nope'); assert.equal(l.swingTpl, 'straight', 'an unknown key is ignored');
  l.setSwingTpl('amapiano'); assert.ok(l.swingAt(1) > l.swingAt(3) && l.swingAt(3) > 0, 'amapiano: the e is pushed further than the a'); assert.equal(l.swingAt(2), 0);
  l.setSwingTpl('aksak'); assert.equal(l.swingPeriod(), 7); l.setSwingTpl('3-3-2'); assert.equal(l.swingPeriod(), 8);
  // collectHits: a ×4 lane at 120 bpm, steps 0.125 s; triplet 50 % puts step 1 at 0.125 + 0.125/3
  const m = new Machine(); m.lanes.forEach(x => x.clear()); const h = m.lanes[2]; h.setRatio(ratioIndexOf(4)); h.setLength(4); h.setEuclid(4); h.swing = 0.5; h.setSwingTpl('triplet');
  const t = collectHits(m, { from: 0, to: P, tempo: 120 }).map(x => x.time);
  assert.ok(Math.abs(t[1] - (0.125 + 0.125 / 3)) < 1e-9 && Math.abs(t[3] - (0.375 + 0.125 / 3)) < 1e-9 && t[2] === 0.25);
  // an odd lane with a 7-step template: the cycle covers the whole swing group
  const mm = new Machine(); mm.lanes.forEach(x => { x.clear(); x.setRatio(5); x.setLength(4); }); mm.lanes[0].setLength(4); mm.lanes[0].setEuclid(4); mm.lanes[0].swing = 0.3; mm.lanes[0].setSwingTpl('aksak');
  assert.equal(mm.cycleSteps(), 28, 'lcm(4, 7) steps');
});
test('ORBIT2-05: a save without the new fields loads unchanged (MPC swing, no offset, no nudge)', () => {
  const old = { lanes: [{ name: 'kick', length: 4, ratioIndex: 5, hits: [true, false, true, false], accents: [], rotation: 0, swing: 0.25, prob: 1, tune: 0, muted: false, euclidK: 2, sound: {}, voice: 'kick', locks: [{ vel: 0.5 }], trigs: [] }], selected: 0, humanize: 0 };
  const m = Machine.from(old), l = m.lanes[0]; assert.equal(l.swingTpl, 'mpc'); assert.equal(l.offsetMs, 0); assert.deepEqual(l.locks[0], { vel: 0.5 });
  assert.equal(l.at(P, () => 0).swung, 0.25, 'old swing plays as before');
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
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const h = m.lanes[2]; h.setRatio(ratioIndexOf(4)); h.setLength(16); h.setEuclid(16);
  const plain = collectHits(m, { from: 0, to: T(96 * 8), tempo: 120 }); assert.ok(plain.every(x => x.vel === 0.7), 'off: every hit at its tier');
  h.velHuman = 1; const d = Dice.take(7), a = collectHits(m, { from: 0, to: T(96 * 8), tempo: 120, dice: d }), b = collectHits(m, { from: 0, to: T(96 * 8), tempo: 120, dice: d });
  assert.deepEqual(a.map(x => x.vel), b.map(x => x.vel), 'locked dice: the same velocities'); assert.deepEqual(a.map(x => x.time), plain.map(x => x.time), 'velocity humanize leaves timing alone');
  const vs = a.map(x => x.vel), mean = vs.reduce((s, v) => s + v, 0) / vs.length;
  assert.ok(vs.every(v => v >= 0.56 - 1e-9 && v <= 0.84 + 1e-9), '±20 % of 0.7 at 100 %'); assert.ok(Math.abs(mean - 0.7) < 0.03, `symmetric (mean ${mean.toFixed(3)})`); assert.ok(new Set(vs).size > 20);
  // a ghost wobbles by the same ratio (dB), not by a fixed amount that would spread it over 11 dB
  for (let i = 0; i < 16; i++) h.setTier(i, 'ghost'); const gv = collectHits(m, { from: 0, to: T(96 * 8), tempo: 120, dice: d }).map(x => x.vel);
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
  const hits = collectHits(m, { from: 0, to: T(4 * 96), tempo: 120 }); assert.equal(hits[0].time, -0.25);
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
  const tickSec = TICK, dice = Dice.take(99), r9 = (x) => Math.round(x * 1e9) / 1e9;
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
  const L = live(m, T(96 * 8)), want = collectHits(m, { from: 0, to: T(96 * 8), tempo: 120, dice }), upTo = T(96 * 8 - 48) * tickSec;
  assert.deepEqual(same(L.hits, upTo), same(want, upTo), 'live play holds exactly the hits of the render');
  assert.ok(L.firstEarly >= -1e-9 && L.firstEarly < tickSec + 0.015 * m.humanize, `early parts go out at the last tick that can hold them (${L.firstEarly})`);
  // when: −20 ms at 120 bpm (a tick is 0.595 ms, step 1 at tick 840) → from tick 806 (33.6 ticks ahead); −½ step
  // (0.25 s = 420 ticks) → from tick 420, not a step ahead
  const p = new Lane('kick', { length: 4, ratioIndex: 5 }); p.setEuclid(4); p.setOffset(-20);
  assert.deepEqual([805, 806].map(t => earlyStep(p, t, { tickSec })), [-1, 1]);
  p.setOffset(0); p.setLock(1, 'nudge', -0.5); assert.deepEqual([419, 420, 839].map(t => earlyStep(p, t, { tickSec })), [-1, 1, 1]);
  p.swing = 0.5; assert.equal(earlyStep(p, 839, { tickSec }), -1, 'MPC swing on step 2 cancels the −½ nudge'); p.swing = 0;
  p.toggle(1); assert.equal(earlyStep(p, 839, { tickSec }), -1, 'an empty step: nothing to decide');
  // the architect's repro: slot A (kick off, pushed −20 ms) → slot B (kick on every beat) on the bar line at tick 96
  const A = new Machine(); A.lanes.forEach(l => { l.clear(); l.setRatio(5); l.setLength(4); }); A.lanes[2].setEuclid(4); A.lanes[0].setOffset(-20);
  const B = Machine.from(A.toJSON()); B.lanes[0].setEuclid(4); const mm = Machine.from(A.toJSON());
  const kicks = live(mm, T(96 * 2), { before: (t) => { if (t === T(96)) mm.assign(B.toJSON()); } }).hits.filter(h => h.li === 0).map(h => h.time);
  assert.deepEqual(kicks, [1.98, 2.48, 2.98, 3.48, 3.98], 'the new slot\'s downbeat kick plays (it was dropped)');
  // a ratchet ×4 nudged −0.3: two repeats go out early; muted before its tick, the other two are dropped
  const r = new Machine(); r.lanes.forEach(l => l.clear()); const R = r.lanes[1]; R.setRatio(5); R.setLength(4); R.toggle(0); R.setTrig(0, { ratchet: 4 }); R.setLock(0, 'nudge', -0.3);
  const count = (mute) => live(r, T(97), { before: (t) => { if (t === T(90) && mute) R.muted = true; } }).hits.filter(h => h.li === 1 && h.time > 1).length;
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
    const bank = new SlotBank(); [0, 1, 2].forEach(i => bank.save(i, json)); setup(bank); const loads = [], said = [], at = Object.keys(acts).map(k => T(+k));
    const end = T(96 * 9); for (let t = 0; t < end; t++) { if (t % MIDI_DIV === 0) acts[t / MIDI_DIV]?.(bank); if (bank.due(t, T(72)) >= 0) loads.push(t); said.push(bank.nextSwitch(t, T(72))); }
    // right after due(t) it names the next tick that loads a slot (unless you recall something in between)
    said.forEach((s, t) => { const next = loads.find(x => x > t); if (at.some(a => a > t && a <= (next ?? end))) return; if (next == null) assert.ok(s >= end, `tick ${t}: ${s}`); else assert.equal(s, next, `tick ${t}`); });
    return loads.map(t => t / MIDI_DIV);   // in old ticks, as written below
  };
  assert.deepEqual(run(b => { b.chainBars = 2; b.setChain([0, 1, 2]); }), [0, 192, 384, 576, 768], 'a chain moves on every 2 bars');
  assert.deepEqual(run(b => b.recall(0), { 130: b => b.recall(1) }), [0, 192], 'bar: the next bar line');
  assert.deepEqual(run(b => { b.recall(0); b.switchAt = 'cycle'; }, { 130: b => b.recall(1) }), [0, 144], 'cycle: the next multiple of the cycle');
  assert.deepEqual(run(b => { b.recall(0); b.switchAt = 'now'; }, { 130: b => b.recall(1) }), [0, 130], 'now: the next tick');
  assert.equal(new SlotBank().nextSwitch(5, 72), Infinity, 'nothing queued');
});
test('ORBIT2-05 r2: a slot switch or a chain step plays what the chain render has; a lane replaced mid-step never doubles a hit', async () => {
  const { liveTick, collectChain, collectHits } = await import('../src/poly/export.js'); const { SlotBank } = await import('../src/poly/slots.js');
  const tickSec = TICK, r4 = (x) => Math.round(x * 1e4) / 1e4;
  const kick = (f) => { const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(5); k.setLength(4); k.hits.fill(true, 0, 4); f?.(k); return m.toJSON(); };
  // the app's master tick (onTick): due() and its slot load first, then liveTick with the next switch as the cut
  const play = (bank, to, act) => {
    const m = new Machine(), ahead = [], out = [];
    for (let t = 0; t < to; t++) {
      act?.(t, m); const si = bank.due(t, T(96)); if (si >= 0) m.assign(bank.get(si));
      liveTick(m, t, ahead, { rng: () => 0, tickSec, cut: bank.nextSwitch(t, T(96)) }).forEach(({ early, hits }) => { for (const h of [...early, ...hits]) out.push(r4(t * tickSec + h.dt)); });
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
    assert.deepEqual(play(bank, T(96 * 4)).filter(x => x >= 0), want, `chain: ${name}`);
  }
  // a slot recalled while playing (bar mode): the bar line plays the new slot's downbeat only
  const [A, B] = cases['A pushed −20 ms → B on the grid'], bank = new SlotBank(); bank.save(0, A); bank.save(1, B); bank.recall(0);
  assert.deepEqual(play(bank, T(192), (t) => { if (t === T(70)) bank.recall(1); }).filter(x => x > 1.5), [2, 2.5, 3, 3.5]);
  // undo, redo, a link: nothing announces them. The same lanes again inside a step's early window: no second hit
  const u = kick(k => k.setLock(2, 'nudge', -0.5)), none = new SlotBank(), at40 = (json) => (t, m) => { if (t === 0) m.assign(u); if (t === T(40)) m.assign(json); };
  assert.deepEqual(play(none, T(96), at40(u)), collectHits(Machine.from(u), { from: 0, to: T(96), tempo: 120 }).map(h => r4(h.time)));
  // another pattern: what already sounded stays and the step isn't started again (whether B has it on the grid or not)
  assert.deepEqual(play(none, T(96), at40(kick())), [0, 0.5, 0.75, 1.5]);
  assert.deepEqual(play(none, T(96), at40(kick(k => { k.hits[2] = false; }))), [0, 0.5, 0.75, 1.5]);
});
// ---- ORBIT2-05 review round 3 ----
test('ORBIT2-05 r3: a lane that changes speed between an early decision and its tick plays that moment once', async () => {
  const { liveTick } = await import('../src/poly/export.js'); const { RATIOS } = await import('../src/poly/lanes.js');
  const tickSec = TICK, r3 = (x) => Math.round(x * 1e3) / 1e3;
  // kick on every beat (×1), changed on the bar line (tick 96, before that tick plays: evolve, a slot) as in onTick
  const play = (f, change, { roll = () => 0.5 } = {}) => {
    const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(RATIOS.indexOf(1)); k.setLength(4); k.hits.fill(true, 0, 4); f(k);
    const ahead = [], out = [];
    for (let t = 0; t < T(150); t++) { if (t === T(96)) change(m); liveTick(m, t, ahead, { rng: () => roll(t), tickSec }).forEach(({ early, hits }, li) => { if (!li) for (const h of [...early, ...hits]) out.push(r3(t * tickSec + h.dt)); }); }
    return out.filter(x => x > 1.5);
  };
  const push = (k) => k.setOffset(-20), speed = (r) => (m) => m.lanes[0].setRatio(RATIOS.indexOf(r));
  // round 3: 1.98 twice, or two downbeats (1.75 + 1.833): the lane at its new speed numbered the tick as another step
  assert.deepEqual(play(push, speed(3 / 2)), [1.98, 2.313, 2.647, 2.98], 'the speed gauge ×1 → ×3/2 inside the early window');
  assert.deepEqual(play(push, speed(3 / 4)), [1.98, 2.647], '×1 → ×¾');
  assert.deepEqual(play(push, (m) => m.evolve({ scope: 'all', amount: 1 }, () => 0.8)), [1.98, 2.313, 2.647, 2.98], 'evolve "all" changes the speed on the bar line');
  assert.deepEqual(play(k => [0, 1, 2, 3].forEach(i => k.setLock(i, 'nudge', -0.5)), speed(3 / 2)), [1.75, 2.167, 2.5, 2.833], 'one downbeat, nudged −½');
  assert.deepEqual(play(push, (m) => { const j = m.toJSON(); j.lanes[0].ratio = 2; m.assign(j); }), [1.98, 2.23, 2.48, 2.73, 2.98], 'a slot, undo or a link at another speed');
  // nothing sounded yet (the early roll missed): the lane at its new speed decides its own step afresh
  const missed = (k) => { push(k); k.prob = 0.5; };
  assert.deepEqual(play(missed, speed(3 / 2), { roll: (t) => (t < T(96) ? 0.9 : 0.1) }), [1.98, 2.313, 2.647, 2.98]);
});
test('ORBIT2-05 r3: live record: a step a pad just played sounds neither its early part nor its own hits (skip)', async () => {
  const { liveTick } = await import('../src/poly/export.js');
  const tickSec = TICK, m = new Machine(); m.lanes.forEach(l => l.clear());
  const k = m.lanes[0]; k.setRatio(5); k.setLength(4); k.setOffset(-20); k.toggle(1); k.toggle(2); k.setTrig(1, { ratchet: 4 }); k.setLock(1, 'nudge', -0.3);
  // the pad played step 1 before its tick was scheduled (liveHit adds 'lane:tick', tick 24 here): its early repeats and its own go
  const skip = new Set([`0:${P}`]), ahead = [], hits = [], shown = [];
  for (let t = 0; t < T(130); t++) liveTick(m, t, ahead, { rng: () => 0, tickSec, skip }).forEach(({ ev, early, hits: own }, li) => {
    if (li) return; if (ev?.index === 1) shown.push(ev.hit); for (const h of [...early, ...own]) hits.push(Math.round((t * tickSec + h.dt) * 1e3) / 1e3);
  });
  assert.deepEqual(shown, [false, true], 'the scene shows the pad\'s hit, not a second one; the next loop plays it again');
  assert.equal(skip.size, 0, 'the key goes at its step\'s tick');
  assert.deepEqual(hits.filter(x => x < 2), [0.98], 'step 2 plays, pushed −20 ms; step 1 (a ×4 roll nudged −0.3, half of it early) not at all');
  assert.deepEqual(hits.filter(x => x > 2), [2.33, 2.455, 2.58, 2.705], 'a loop later step 1 rolls ×4 again');
});
// ---- ORBIT2-05 close (confirmation round) ----
test('ORBIT2-05 close: a lane that speeds up inside an early window plays the decided moment once, and the new speed\'s steps before it', async () => {
  const { liveTick } = await import('../src/poly/export.js'); const { RATIOS } = await import('../src/poly/lanes.js');
  const tickSec = TICK, r4 = (x) => Math.round(x * 1e4) / 1e4;
  // a kick on every step of 4 (all nudged, or only the downbeat), changed before tick `at` plays (as in onTick)
  const play = ({ ratio = 1, nudge = -0.5, steps = [0, 1, 2, 3] }, at, change) => {
    const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(RATIOS.indexOf(ratio)); k.setLength(4); k.hits.fill(true, 0, 4); steps.forEach(i => k.setLock(i, 'nudge', nudge));
    const ahead = [], out = [];
    for (let t = 0; t < T(120); t++) { if (t === T(at)) change(m); liveTick(m, t, ahead, { rng: () => 0, tickSec }).forEach(({ early, hits }, li) => { if (!li) for (const h of [...early, ...hits]) out.push(r4(t * tickSec + h.dt)); }); }
    return out.sort((a, b) => a - b).filter(x => x > 1.4);
  };
  const speed = (r) => (m) => m.lanes[0].setRatio(RATIOS.indexOf(r)), assign = (r) => (m) => { const j = m.toJSON(); j.lanes[0].ratio = r; m.assign(j); };
  // confirmation round: the new speed's step before the bar line (×4 step 15, tick 90) took the lane's one decision, so
  // the bar-line moment, sounded at 1.75 s, started again (×4 step 16 at 1.9375; ×3 1.9167, −0.3 1.9625, ×½ → ×2 1.875)
  assert.deepEqual(play({}, 89, speed(4)), [1.75, 1.8125, 2.0625, 2.1875, 2.3125, 2.4375], 'the speed gauge ×1 → ×4');
  assert.deepEqual(play({}, 89, assign(4)), [1.75, 1.8125, 2.0625, 2.1875, 2.3125, 2.4375], 'undo, a link or a "now" recall at ×4');
  assert.deepEqual(play({}, 86, speed(3)), [1.75, 1.75, 2.0833, 2.25, 2.4167], '×1 → ×3 (its step at tick 88, nudged −½, is another moment at the same time)');
  assert.deepEqual(play({ nudge: -0.3 }, 89, speed(4)), [1.8375, 1.85, 2.0875, 2.2125, 2.3375, 2.4625], 'nudged −0.3');
  assert.deepEqual(play({ ratio: 1 / 2 }, 80, speed(2)), [1.5, 1.625, 2.125, 2.375], '×½ → ×2');
  assert.deepEqual(play({ steps: [0] }, 89, speed(4)), [1.5, 1.75, 1.875, 2.125, 2.25, 2.375, 2.4375], 'only the downbeat nudged');
});
test('ORBIT2-05 close: a pad\'s moment is keyed on the master tick, so a speed change before it neither doubles it nor silences another', async () => {
  const { liveTick } = await import('../src/poly/export.js'); const { RATIOS } = await import('../src/poly/lanes.js');
  const tickSec = TICK, r3 = (x) => Math.round(x * 1e3) / 1e3;
  // a kick on every beat pushed −20 ms; the pad played the bar line (step 4, tick 96) before it was scheduled; the speed changes at tick 90
  const play = (r) => {
    const m = new Machine(); m.lanes.forEach(l => l.clear()); const k = m.lanes[0]; k.setRatio(RATIOS.indexOf(1)); k.setLength(4); k.hits.fill(true, 0, 4); k.setOffset(-20);
    const skip = new Set([`0:${4 * k.stepTicks()}`]), ahead = [], out = [];
    for (let t = 0; t < T(200); t++) { if (t === T(90)) k.setRatio(RATIOS.indexOf(r)); liveTick(m, t, ahead, { rng: () => 0, tickSec, skip }).forEach(({ early, hits }, li) => { if (!li) for (const h of [...early, ...hits]) out.push(r3(t * tickSec + h.dt)); }); }
    return { hits: out.filter(x => x > 1.5), left: skip.size };
  };
  // keyed on the step number: ×2 numbers tick 96 as step 8 and played it again (1.98); ×½ kept the key and silenced its step 4 (3.98)
  assert.deepEqual(play(2), { hits: [2.23, 2.48, 2.73, 2.98, 3.23, 3.48, 3.73, 3.98], left: 0 }, '×1 → ×2: the pad\'s moment once');
  assert.deepEqual(play(1 / 2), { hits: [2.98, 3.98], left: 0 }, '×1 → ×½: the key goes at its tick, a later moment plays');
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

// ---- ORBIT2-06 R1 / R2 ----
test('R1 840 PPQ: every ratio steps on whole ticks; a block of MIDI_DIV ticks = one MIDI clock; old positions ×35', () => {
  assert.equal(P, 840); assert.equal(MIDI_DIV, 35); assert.equal(P / MIDI_DIV, 24, '24 MIDI clocks per quarter');
  for (const r of RATIOS) { assert.ok(Number.isInteger(P / r), `×${r}`); }
  // the same pattern at the old resolution: the old hit ticks × 35 (step numbers, dice keys and loops unchanged)
  const m = new Machine(); [2 / 3, 3 / 2, 3, 4].forEach((r, i) => { const l = m.lanes[i]; l.setRatio(ratioIndexOf(r)); l.setLength(5 + i); l.setEuclid(3); l.swing = 0.2; });
  const old = []; for (let t = 0; t < 96 * 4; t++) m.tick(t * MIDI_DIV, () => 0).forEach((e, li) => { if (e?.hit) old.push([li, t, e.step]); });
  const fine = []; for (let t = 0; t < T(96 * 4); t++) m.tick(t, () => 0).forEach((e, li) => { if (e?.hit) fine.push([li, t / MIDI_DIV, e.step]); });
  assert.deepEqual(fine, old); assert.ok(fine.length > 20);
});
test('R2 new ratios: labels match, the knob order is slowest first; old saves and links map their index through the old table', async () => {
  const { RATIO_LABEL } = await import('../src/poly/lanes.js'); const { encodeShare, decodeShare } = await import('../src/poly/export.js');
  assert.equal(RATIO_LABEL.length, RATIOS.length); assert.deepEqual([...RATIOS].sort((a, b) => a - b), RATIOS);
  for (const r of [5 / 4, 4 / 3, 7 / 4, 5, 6, 3 / 2]) assert.ok(ratioIndexOf(r) >= 0, `×${r}`);
  // pre-R2 indices: 6 = 3/2, 7 = ×2, 8 = ×3, 9 = ×4
  const old = { lanes: [6, 7, 8, 9].map((ratioIndex, i) => ({ name: ['kick', 'snare', 'hat', 'perc'][i], length: 4, ratioIndex, hits: [true] })) };
  assert.deepEqual(Machine.from(old).lanes.map(l => l.ratio), [3 / 2, 2, 3, 4]);
  const m = new Machine(); m.lanes[0].setRatio(ratioIndexOf(5 / 4)); m.lanes[1].setRatio(ratioIndexOf(7 / 4));
  const back = Machine.from(JSON.parse(JSON.stringify(m.toJSON()))); assert.deepEqual(back.lanes.map(l => l.ratio), m.lanes.map(l => l.ratio), 'new saves by value');
  const link = await decodeShare(await encodeShare(old, 120)); assert.deepEqual(Machine.from(link.m).lanes.map(l => l.ratio), [3 / 2, 2, 3, 4], 'an old link');
  assert.equal(Machine.from({ lanes: [{ name: 'kick', ratioIndex: 99 }] }).lanes[0].ratio, 1, 'nonsense → ×1');
});

// ---- ORBIT2-06 tests ----
test('R1 ×5/4 against ×1: five against four on whole ticks, the grids meet every 4 beats (5 steps), never in between', () => {
  const m = new Machine(); m.lanes.forEach(l => { l.clear(); l.setLength(1); l.setRatio(ratioIndexOf(1)); }); const [q, b] = m.lanes; q.setRatio(ratioIndexOf(5 / 4)); q.setLength(5); q.setEuclid(5); b.setRatio(ratioIndexOf(1)); b.setLength(4); b.setEuclid(4);
  assert.equal(q.stepTicks(), 672); assert.ok(Number.isInteger(q.stepTicks()));
  const both = []; for (let t = 0; t < 12 * P; t++) { const e = m.tick(t, () => 0); if (e[0] && e[1]) both.push(t / P); }
  assert.deepEqual(both, [0, 4, 8], 'together on beat 1 of every 4 beats only');
  assert.equal(m.cycleSteps(), 4, 'the whole machine repeats after 4 beats = 5 quintuplet steps');
  const hits = []; for (let t = 0; t < 4 * P; t++) { const e = m.tick(t, () => 0)[0]; if (e?.hit) hits.push(t); } assert.deepEqual(hits, [0, 672, 1344, 2016, 2688], 'exact quintuplets');
  const s = new Lane('hat', { length: 7, ratioIndex: ratioIndexOf(7 / 4) }); assert.equal(s.stepTicks() * 7, 4 * P, '7 septuplet steps = 4 beats exactly');
});
test('R1 MIDI clock out: 24 clocks per quarter whatever the master PPQ, none when it is off', async () => {
  const { PolyMidi } = await import('../src/poly/midiio.js'); const sent = []; const port = { name: 'DAW', send: (b) => sent.push(b[0]) };
  const p = new PolyMidi({ getAccess: () => ({ outputs: new Map([['a', port]]), inputs: new Map() }) }); p.setOutput('DAW');
  for (let t = 0; t < 4 * P; t++) p.clockAt(t, t); assert.equal(sent.length, 0, 'clock out off');
  p.clockOut = true; for (let t = 0; t < 4 * P; t++) p.clockAt(t, t); assert.equal(sent.length, 96, '4 beats = 96 clocks'); assert.ok(sent.every(b => b === 0xF8));
  // the app sends one per block of MIDI_DIV ticks; the phase lock compares in MIDI ticks: a drift of 3 MIDI ticks snaps
  const { phaseCorrection } = await import('../src/poly/midiio.js'); assert.equal(phaseCorrection(T(3) / MIDI_DIV).jump, -3);
});
test('R3 time signatures: bar lengths, saved with the pattern, a 7/8 bar is 3½ beats of audio with ACID and MIDI meter 7/8', async () => {
  const { METERS, barTicks, BAR_TICKS } = await import('../src/poly/lanes.js'); const { withAcid, wavFromInt16, foldLoop, wholeBarCycle } = await import('../src/poly/jam.js');
  const { hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js');
  assert.deepEqual(METERS, ['4/4', '3/4', '5/4', '6/8', '7/8', '12/8']);
  assert.deepEqual(METERS.map(k => barTicks(k) / P), [4, 3, 5, 3, 3.5, 6]); assert.equal(barTicks('4/4'), BAR_TICKS);
  const m = new Machine(); assert.equal(m.meter, '4/4'); m.setMeter('7/8'); m.setMeter('9/9'); assert.equal(m.meter, '7/8', 'unknown meters ignored');
  assert.equal(Machine.from(JSON.parse(JSON.stringify(m.toJSON()))).meter, '7/8'); assert.equal(Machine.from({ lanes: [] }).meter, '4/4', 'old saves: 4/4');
  const n = new Machine(); n.assign(m.toJSON()); assert.equal(n.meter, '7/8', 'slots / undo carry it');
  // 1 bar of 7/8 at 120 bpm: 3.5 quarters = 1.75 s, exactly that long as a loop
  const sec = m.barTicks() * (60 / 120 / P); assert.ok(Math.abs(sec - 1.75) < 1e-12); assert.equal(foldLoop(new Float32Array(44100 * 3), 44100, sec, 0.05).length, Math.round(1.75 * 44100));
  assert.deepEqual(wholeBarCycle(4 * P, barTicks('7/8')), { ticks: 8 * barTicks('7/8'), capped: false }, 'a 4-beat cycle in 7/8: 8 bars = 28 beats');
  const w = withAcid(wavFromInt16([Int16Array.of(1)], [Int16Array.of(1)], 44100), { bpm: 120, beats: 7, num: 7, den: 8 }), v = new DataView(w.buffer);
  assert.equal(v.getUint32(56, true), 7, 'beats in the meter unit'); assert.equal(v.getUint16(60, true), 8, 'denominator'); assert.equal(v.getUint16(62, true), 7, 'numerator'); assert.equal(v.getFloat32(64, true), 120);
  const bytes = hitsToMidi([{ li: 0, time: 0, vel: 1 }], { tempo: 120, lanes: [{ note: 36, ch: 10 }], names: ['kick'], bars: 1, meter: '7/8' });
  const ts = bytes.findIndex((b, i) => b === 0xFF && bytes[i + 1] === 0x58); assert.deepEqual([...bytes.slice(ts + 3, ts + 7)], [7, 3, 12, 8], 'FF 58: 7/8, a click per eighth');
  assert.ok(readMidi(bytes).tracks[1].notes.length === 1);
  const ends = []; let i = 14; for (let k = 0; k < 2; k++) { const len = (bytes[i + 4] << 24 | bytes[i + 5] << 16 | bytes[i + 6] << 8 | bytes[i + 7]) >>> 0; let t = 0, j = i + 8; const end = j + len; const rv = () => { let x = 0, c; do { c = bytes[j++]; x = (x << 7) | (c & 0x7F); } while (c & 0x80); return x; }; while (j < end) { t += rv(); const st = bytes[j]; if (st === 0xFF) { j += 2; const l = rv(); j += l; } else j += 3; } ends.push(t); i = end; }
  assert.deepEqual(ends, [336, 336], '14 sixteenths = 3.5 quarters × 96');
});
test('R3 bar lines follow an anchor: slots switch, chains count and the chain render spans in each slot\'s own meter', async () => {
  const { SlotBank, onBar } = await import('../src/poly/slots.js'); const { barTicks } = await import('../src/poly/lanes.js'); const { collectChain, chainSixteenths } = await import('../src/poly/export.js');
  const b78 = { at: 0, len: barTicks('7/8') }; assert.ok(onBar(2940, b78) && !onBar(3360, b78)); assert.ok(onBar(5000 + 2940, { at: 5000, len: 2940 }));
  const bank = new SlotBank(); bank.save(0, {}); bank.save(1, {}); bank.recall(1);
  assert.equal(bank.nextSwitch(100, 1, b78), 2940, 'next bar line of 7/8'); assert.equal(bank.due(2939, 1, b78), -1); assert.equal(bank.due(2940, 1, b78), 1);
  const k = (meter) => { const m = new Machine(); m.lanes.forEach(l => l.clear()); m.lanes[0].setLength(1); m.lanes[0].hits[0] = true; m.setMeter(meter); return m.toJSON(); };
  const times = collectChain([k('4/4'), k('7/8'), k('4/4')], { bars: 1, tempo: 120 }).map(h => Math.round(h.time * 1e9) / 1e9);
  // round 1: the third slot's beats used to stay on the old grid (4, 4.5…), half a beat after its bar line
  assert.deepEqual(times, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 3.75, 4.25, 4.75, 5.25], 'the 7/8 slot spans 3½ beats: the next slot starts on its bar line at 3.75 s');
  assert.equal(chainSixteenths([k('4/4'), k('7/8')], 2), 2 * 16 + 2 * 14);
});
test('R4 the loop counter advances as the lane wraps: a length change mid-play keeps 1:2 on the same loops', () => {
  const l = new Lane('kick', { length: 4 }); l.setEuclid(4); l.setTrig(0, { cond: '1:2' });
  const run = (from, to) => { const out = []; for (let s = from; s < to; s++) { const e = l.at(s * P, () => 0); out.push(`${e.index}${e.index === 0 ? (e.hit ? 'x' : '.') : ''}@${e.loop}`); } return out; };
  assert.deepEqual(run(0, 8), ['0x@0', '1@0', '2@0', '3@0', '0.@1', '1@1', '2@1', '3@1']);
  // length 4 → 3 at step 8: the old derivation floor(9 / 3) = 3 would jump a loop; the counter goes on from loop 1
  l.setLength(3); const after = run(8, 14);
  assert.deepEqual(after, ['2@1', '0x@2', '1@2', '2@2', '0.@3', '1@3'], 'the next wrap is loop 2: step 1 plays (1:2 on loops 0, 2, 4…)');
  const p = new Lane('kick', { length: 4 }); p.setEuclid(4); for (let s = 0; s < 6; s++) p.at(s * P, () => 0);
  const before = [p.loopN, p.lastTick, p.lastCond]; assert.deepEqual(before, [1, 5 * P, false]); p.peek(6 * P, () => 0); assert.deepEqual([p.loopN, p.lastTick, p.lastCond], before, 'peek leaves the counter');
  p.reset(); assert.equal(p.at(9 * P, () => 0).loop, 2, 'a fresh count (Play, a slot) is the absolute one');
  const m = new Machine(); m.lanes[0].setLength(3); m.lanes[0].setEuclid(3); m.lanes[0].setTrig(0, { cond: '2:2' }); const hits = []; for (let t = 0; t < 12 * P; t++) { const e = m.tick(t, () => 0)[0]; if (e?.hit && e.index === 0) hits.push(e.loop); }
  assert.deepEqual(hits, [1, 3], 'a constant length: the same loops as before R4');
});
test('R4 PRE / not PRE truth table: play if the previous conditional step on this lane passed / failed', async () => {
  const { condPasses, CONDS } = await import('../src/poly/lanes.js');
  // round 1: the backlog's NEI ("previous failed") is stored as 'not pre' (Elektron's /PRE; its NEI is the neighbour track)
  assert.deepEqual(CONDS.slice(-2), ['pre', 'not pre'], 'appended: saved conditions keep their index');
  assert.deepEqual([true, false].map(prev => [condPasses('pre', 0, false, prev), condPasses('not pre', 0, false, prev)]), [[true, false], [false, true]]);
  assert.equal(condPasses('pre', 0), false, 'nothing before it: PRE rests'); assert.equal(condPasses('not pre', 0), true);
  const l = new Lane('snare', { length: 3 }); l.setEuclid(3); l.setTrig(0, { cond: '1:2' }); l.setTrig(1, { cond: 'pre' }); l.setTrig(2, { cond: 'not pre' });
  const row = () => [0, 1, 2].map(() => 0).map((_, k, a) => a); const seq = []; for (let s = 0; s < 12; s++) seq.push(l.at(s * P, () => 0).hit ? 'x' : '.'); row();
  assert.equal(seq.join(''), 'xx...xxx...x', 'loop 0: 1:2 passes → PRE plays, not PRE rests; loop 1: 1:2 fails → PRE rests, not PRE plays');
  // a muted conditional step still sets what PRE reads; PRE / not PRE never set it themselves; always doesn't count
  const q = new Lane('hat', { length: 2 }); q.setEuclid(2); q.setTrig(0, { cond: 'first' }); q.setTrig(1, { cond: 'pre' }); q.muted = true; q.at(0, () => 0); q.muted = false;
  assert.equal(q.at(P, () => 0).hit, true, 'the muted first-loop step passed'); assert.equal(q.at(2 * P, () => 0).hit, false); assert.equal(q.at(3 * P, () => 0).hit, false, 'after the first loop "first" fails');
  const c = Lane.from(JSON.parse(JSON.stringify(l))); assert.deepEqual(c.trigs.slice(0, 3).map(t => t.cond), ['1:2', 'pre', 'not pre'], 'saved');
});
test('ORBIT2-06: an old save and an old share link (24 PPQ, old ratio indices, no meter) play the very same hits', async () => {
  const { collectHits, encodeShare, decodeShare } = await import('../src/poly/export.js'); const { Dice } = await import('../src/poly/dice.js');
  // OLD: written by the pre-R1 app (ratioIndex 6 = 3/2, 3 = ⅔, 9 = ×4, 8 = ×3 in the old table); the digest below was
  // made by the pre-R1 code (commit 9f436da) over 768 of its ticks: 167 hits, hash f6361da0
  const OLD = {"lanes":[{"name":"kick","length":5,"ratioIndex":6,"hits":[true,false,true,true,false],"accents":[true],"rotation":1,"swing":0.2,"prob":0.7,"tune":0,"muted":false,"euclidK":0,"sound":{},"voice":"kick","locks":[null,{"nudge":-0.3},{"vel":0.35}],"trigs":[{"cond":"1:2","ratchet":1,"fade":false},null,{"cond":"always","ratchet":3,"fade":true}],"evolve":true,"solo":false,"choke":-1},{"name":"snare","length":4,"ratioIndex":3,"hits":[false,true,false,true],"accents":[false,true],"rotation":0,"swing":0,"prob":1,"tune":0,"muted":false,"euclidK":0,"sound":{},"voice":"snare","locks":[],"trigs":[null,{"cond":"2:3","ratchet":1,"fade":false}],"offsetMs":-12},{"name":"hat","length":7,"ratioIndex":9,"hits":[true,true,false,true,true,false,true],"accents":[],"rotation":2,"swing":0.4,"swingTpl":"amapiano","prob":0.85,"tune":0,"muted":false,"euclidK":0,"sound":{},"voice":"hat","locks":[],"trigs":[null,null,null,{"cond":"first","ratchet":2,"fade":false}],"velHuman":0.5},{"name":"perc","length":3,"ratioIndex":8,"hits":[true,false,true],"accents":[],"rotation":0,"swing":0.25,"prob":1,"tune":0,"muted":false,"euclidK":0,"sound":{},"voice":"wood","locks":[{"nudge":0.2}],"trigs":[]}],"selected":0,"humanize":0.3,"kit":"Common"};
  const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
  const digest = (m) => { const s = collectHits(m, { from: 0, to: T(768), tempo: 120, dice: Dice.take(1234) }).map(h => `${h.li}:${Math.round(h.time * 1e6)}:${Math.round(h.vel * 1e6)}`).join(','); return { n: s.split(',').length, hash: fnv(s), head: s.split(',').slice(0, 4).join(',') }; };
  const want = { n: 167, hash: 'f6361da0', head: '3:30150:700000,2:168162:714395,2:251527:680866,3:331088:700000' };
  const m = Machine.from(OLD); assert.deepEqual(m.lanes.map(l => l.ratio), [3 / 2, 2 / 3, 4, 3]); assert.equal(m.meter, '4/4');
  assert.deepEqual(digest(m), want, 'an old save');
  assert.deepEqual(digest(Machine.from((await decodeShare(await encodeShare(OLD, 120))).m)), want, 'an old share link');
  assert.deepEqual(digest(Machine.from(JSON.parse(JSON.stringify(m.toJSON())))), want, 'saved again in the new format');
});

// ---- ORBIT2-06 review round 1 ----
const slotOf = (meter, lanes) => { const m = new Machine(); m.lanes.forEach(l => l.clear()); lanes.forEach(([ratio, len, steps, edit], i) => { const l = m.lanes[i]; l.setRatio(ratioIndexOf(ratio)); l.setLength(len); for (const s of steps) l.hits[s] = true; edit?.(l); }); m.setMeter(meter); return m.toJSON(); };
test('ORBIT2-06 r1: a pattern in a new meter starts on its own bar line: chains render it, the live clock plays the same', async () => {
  const { collectChain, liveTick } = await import('../src/poly/export.js'); const { SlotBank, trackBars } = await import('../src/poly/slots.js'); const { Dice } = await import('../src/poly/dice.js');
  // verifier: [7/8: ×2, 7 steps, kick on 1] [4/4: ×1, 4 steps, kick on 1], 1 bar each, at 60 bpm (a beat = 1 s)
  const A = slotOf('7/8', [[2, 7, [0]]]), B = slotOf('4/4', [[1, 4, [0]]]), at = (hs, li = 0) => hs.filter(h => h.li === li).map(h => +h.time.toFixed(6));
  assert.deepEqual(at(collectChain([A, B, A, B], { bars: 1, tempo: 60 })), [0, 3.5, 7.5, 11], 'kicks on the bar lines (were 0, 4, 10.5, 12)');
  // sound: the 4/4 slot's snares on 2 and 4 of its own bar (bar lines 3.5 and 11; they were on +1.5 / +3.5 and the downbeat)
  const S = slotOf('4/4', [[1, 4, [0]], [1, 4, [1, 3]]]); assert.deepEqual(at(collectChain([A, S, A, S], { bars: 1, tempo: 60 }), 1), [4.5, 6.5, 12, 14]);
  // the same bar length goes on counting from the last bar 1, as before the phase: a 3-step lane runs through the switch
  const C = slotOf('4/4', [[1, 3, [0]]]); assert.deepEqual(at(collectChain([C, C], { bars: 1, tempo: 60 })), [0, 3, 6]);
  // live: the clock's rules (trackBars + setOrigin, the slot bank, the cut) through liveTick hold exactly the chain
  // render's hits, early ones too (a nudge before the beat, a push, humanize), over two meter changes and back
  const D = slotOf('7/8', [[2, 7, [0, 3], l => l.setLock(3, 'nudge', -0.4)], [7 / 4, 7, [1, 2, 5], l => l.setOffset(-12)]]), E = slotOf('4/4', [[1, 4, [0, 2]], [5 / 4, 5, [0, 1, 3], l => l.setLock(1, 'nudge', -0.3)]]), F = slotOf('6/8', [[3, 6, [0, 4]], [6, 12, [2, 7]]]);
  const states = [D, E, F, E].map(s => ({ ...s, humanize: 0.6 })), nb = 2, tempo = 120, ts = 60 / tempo / P, dice = Dice.take(5), r6 = (x) => x.toFixed(6);
  const bank = new SlotBank(); states.forEach((s, i) => bank.save(i, s)); bank.chainBars = nb; bank.setChain([0, 1, 2, 3]);
  const m = new Machine(), ahead = [], live = []; let bars = { at: 0, len: m.barTicks(), next: null };
  const track = (t) => { const b = trackBars(bars, t, m.barTicks()); if (b !== bars) { bars = b; m.setOrigin(bars.at); } };
  const span = states.reduce((n, s) => n + nb * Machine.from(s).barTicks(), 0); assert.equal(span, 29 * P, '2 bars each of 7/8, 4/4, 6/8, 4/4');
  for (let t = 0; t < span; t++) {
    track(t); const si = bank.due(t, m.cycleTicks(), bars); if (si >= 0) { m.assign(bank.get(si)); track(t); }
    const cut = Math.min(bank.nextSwitch(t, m.cycleTicks(), bars), bars.next ? bars.next.at : Infinity);
    liveTick(m, t, ahead, { dice, tickSec: ts, cut }).forEach(({ hits, early }, li) => { for (const h of [...early, ...hits]) live.push(`${li} ${r6(t * ts + h.dt)}`); });
  }
  const want = collectChain(states, { bars: nb, tempo, dice }).map(h => `${h.li} ${r6(h.time)}`);
  assert.deepEqual(live.sort(), want.sort()); assert.ok(want.length > 40, `${want.length} hits`);
});
test('ORBIT2-06 r1: trackBars waits for the old bar line, cancels on a change back, moves at once on a bar line; every bar line counts', async () => {
  const { trackBars, onBar } = await import('../src/poly/slots.js'); const { barTicks } = await import('../src/poly/lanes.js');
  const b0 = { at: 0, len: barTicks('4/4'), next: null };
  assert.equal(trackBars(b0, 100, b0.len), b0, 'nothing changes: the same object (it runs on every tick)');
  const p = trackBars(b0, 7490, barTicks('3/4')); assert.deepEqual(p, { at: 0, len: 3360, next: { at: 10080, len: 2520 } }, 'mid-bar: waits for the next 4/4 bar line');
  assert.equal(trackBars(p, 7491, barTicks('3/4')), p, 'still waiting: the same object');
  assert.deepEqual(trackBars(p, 7500, b0.len), { at: 0, len: 3360, next: null }, 'back to 4/4 before it: cancelled');
  assert.deepEqual(trackBars(p, 7500, barTicks('7/8')).next, { at: 10080, len: 2940 }, 'another meter meanwhile: the same bar line');
  assert.deepEqual(trackBars(p, 10080, barTicks('3/4')), { at: 10080, len: 2520, next: null }, 'there: 3/4 bars from 10080');
  assert.deepEqual(trackBars(b0, 6720, barTicks('7/8')), { at: 6720, len: 2940, next: null }, 'on a bar line (a slot switch): at once');
  // the verifier's evolve case (every 1 bar; 4/4 → 3/4 at tick 7490): the bar line where 3/4 starts is one of them
  let bars = b0; const lines = []; for (let t = 1; t < 21000; t++) { bars = trackBars(bars, t, t >= 7490 ? barTicks('3/4') : b0.len); if (onBar(t, bars)) lines.push(t); }
  assert.deepEqual(lines, [3360, 6720, 10080, 12600, 15120, 17640, 20160]);
});
test('ORBIT2-06 r1: R4 keeps counting through undo / redo / evolve home, a speed change and a new meter, and never goes below 0', () => {
  const mk = () => { const m = new Machine(); m.lanes.forEach(l => l.clear()); const l = m.lanes[0]; l.setLength(4); l.setRatio(ratioIndexOf(1)); l.setEuclid(4); l.setTrig(0, { cond: '1:2' }); return m; };
  const run = (m, to, at = {}) => { const out = []; for (let s = 0; s <= to; s++) { at[s]?.(m); const e = m.tick(s * P, () => 0)[0]; if (e?.index === 0) out.push(`${s}:${e.loop}${e.hit ? 'x' : '.'}`); } return out; };
  // the architect's repro: length 5 at step 22, the same state put back at step 38 (undo / redo, evolve's way home)
  assert.deepEqual(run(mk(), 45, { 22: m => m.lanes[0].setLength(5), 38: m => m.assign(m.toJSON(), { keep: true }) }).slice(-4), ['30:7.', '35:8x', '40:9.', '45:10x'], 'loop 9 after 8 (was 35:8x 40:8x)');
  assert.deepEqual(run(mk(), 45, { 22: m => m.lanes[0].setLength(5), 38: m => m.assign(m.toJSON()) }).slice(-2), ['40:8x', '45:9.'], 'a slot or a link starts fresh: the absolute count, as the chain render');
  const k = mk(); for (let s = 0; s < 3; s++) k.tick(s * P, () => 0); k.assign(k.toJSON(), { keep: true });   // step 0's 1:2 passed
  assert.deepEqual([k.lanes[0].loopN, k.lanes[0].lastTick, k.lanes[0].lastCond], [0, 2 * P, true], 'undo carries the count and the PRE memory');
  k.assign(k.toJSON()); assert.deepEqual([k.lanes[0].lastTick, k.lanes[0].lastCond], [null, false], 'a slot: fresh');
  // a speed change counts only the wraps it crosses (×1 → ×2 at beat 10: loop 2 → 3, it was 2 → 5)
  const sp = mk(), seen = []; for (let t = 0; t <= 20 * P; t += 420) { if (t === 10 * P) sp.lanes[0].setRatio(ratioIndexOf(2)); const e = sp.tick(t, () => 0)[0]; if (e) seen.push(e.loop); }
  assert.ok(seen.every((x, i) => !i || (x >= seen[i - 1] && x - seen[i - 1] <= 1)), seen.join(' ')); assert.equal(seen[seen.indexOf(2) + 2], 3);
  // ines: a long → short length change, then a slower speed, took the count below 0 (a:b and "after 1st" went silent)
  const n = mk(); n.lanes[0].setLength(16); let low = Infinity; for (let t = 0; t <= 200 * P; t += 210) { if (t === 32 * P) n.lanes[0].setLength(2); if (t === 40 * P) n.lanes[0].setRatio(ratioIndexOf(1 / 2)); const e = n.tick(t, () => 0)[0]; if (e) low = Math.min(low, e.loop); }
  assert.ok(low >= 0, `lowest loop ${low}`);
  // a new meter's first bar line restarts the lanes on step 1: one more wrap
  const o = mk(); for (let s = 0; s < 6; s++) o.tick(s * P, () => 0); o.setOrigin(6 * P + 420);
  assert.equal(o.tick(6 * P, () => 0)[0], null, 'nothing before the new bar 1'); const e = o.tick(6 * P + 420, () => 0)[0]; assert.deepEqual([e.index, e.loop], [0, 2]);
});
test('ORBIT2-06 r1: a chain\'s MIDI file carries a time signature wherever a slot changes it', async () => {
  const { chainMeters, hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js');
  const k = (meter) => { const m = new Machine(); m.setMeter(meter); return m.toJSON(); }, ms = chainMeters([k('4/4'), k('7/8'), k('7/8'), k('4/4')], 1);
  assert.deepEqual(ms, [{ s: 0, meter: '4/4' }, { s: 16, meter: '7/8' }, { s: 44, meter: '4/4' }]);
  const lanes = [{ note: 36, ch: 10 }], bytes = hitsToMidi([{ li: 0, time: 0, vel: 1 }], { tempo: 120, lanes, names: ['kick'], meters: ms, sixteenths: 60 });
  assert.deepEqual(readMidi(bytes).tracks[0].meters, [{ t: 0, num: 4, den: 4 }, { t: 384, num: 7, den: 8 }, { t: 1056, num: 4, den: 4 }]);
  assert.deepEqual(readMidi(hitsToMidi([], { tempo: 120, lanes, names: ['k'], bars: 1, meter: '7/8' })).tracks[0].meters, [{ t: 0, num: 7, den: 8 }], 'one pattern: one, as before');
});
test('ORBIT2-06 r1: evolve\'s speed moves are the pre-R2 ones for the old speeds; 5/4 · 4/3 · 7/4 step to a classic neighbour', () => {
  const move = (r, dir) => { const m = new Machine(); m.lanes.forEach((l, i) => { l.evolve = i === 0; }); m.lanes[0].setRatio(ratioIndexOf(r)); const seq = [0, 0.8, dir < 0 ? 0.2 : 0.7]; let k = 0; m.evolve({ scope: 'all', amount: 1 }, () => seq[k++]); return m.lanes[0].ratio; };
  // the pre-R2 rule was clamp(index ± 1) on ⅔…×3 of the old table: outside it a lane lands on the nearest end either way
  for (const [r, up, down] of [[1 / 4, 2 / 3, 2 / 3], [1 / 3, 2 / 3, 2 / 3], [1 / 2, 2 / 3, 2 / 3], [2 / 3, 3 / 4, 2 / 3], [3 / 4, 1, 2 / 3], [1, 3 / 2, 3 / 4], [3 / 2, 2, 1], [2, 3, 3 / 2], [3, 3, 2], [4, 3, 3]]) assert.deepEqual([move(r, 1), move(r, -1)], [up, down], `×${r}`);
  for (const [r, up, down] of [[5 / 4, 3 / 2, 1], [4 / 3, 3 / 2, 1], [7 / 4, 2, 3 / 2], [5, 3, 3], [6, 3, 3]]) assert.deepEqual([move(r, 1), move(r, -1)], [up, down], `×${r}`);
});
test('ORBIT2-06 r1: the clock also skips ticks whose early steps are decided, and plays exactly the same', async () => {
  const { liveTick, liveQuiet } = await import('../src/poly/export.js'); const { Dice } = await import('../src/poly/dice.js');
  const busy = () => { const m = Machine.from(slotOf('4/4', [[4, 16, [0, 3, 6, 9, 12], l => l.setOffset(-30)], [3, 12, [0, 4, 8], l => l.setLock(4, 'nudge', -0.5)], [2, 8, [1, 5]], [5 / 4, 10, [0, 2, 5, 7], l => l.setOffset(-20)]])); m.humanize = 1; return m; };
  const play = (skipQuiet) => { const m = busy(), ahead = [], out = [], dice = Dice.take(11), o = { dice, tickSec: TICK }; let ran = 0; for (let t = 0; t < 8 * P; t++) { if (skipQuiet && liveQuiet(m, t, ahead, { humanize: m.humanize, tickSec: TICK })) continue; ran++; liveTick(m, t, ahead, o).forEach(({ hits, early }, li) => { for (const h of [...early, ...hits]) out.push(`${li} ${(t * TICK + h.dt).toFixed(9)} ${h.vel.toFixed(6)}`); }); } return { out: out.sort(), ran }; };
  const all = play(false), skipped = play(true); assert.deepEqual(skipped.out, all.out); assert.ok(all.out.length > 20, `${all.out.length} hits`);
  assert.ok(skipped.ran < 8 * P * 0.02, `the lanes ran on ${skipped.ran} of ${8 * P} ticks (72; the rule before round 1: 1262)`);
});
test('ORBIT2-07 L1: 32-step lanes (euclid, rotation, playhead, locks and trigs on steps 17–32); evolve keeps its 16-step reach', async () => {
  const { MAX_STEPS } = await import('../src/poly/lanes.js'); assert.equal(MAX_STEPS, 32);
  assert.equal(euclid(5, 32).filter(Boolean).length, 5); assert.equal(euclid(32, 32).filter(Boolean).length, 32);
  assert.deepEqual(euclid(3, 32).map((h, i) => (h ? i : -1)).filter(i => i >= 0), [0, 11, 22], 'E(3,32) spread over the whole lane');
  const l = new Lane('hat', { length: 32 }); l.setEuclid(7); assert.equal(l.hits.filter(Boolean).length, 7); assert.equal(l.hits.length, 32);
  l.rotation = 20; for (let i = 0; i < 32; i++) assert.equal(l.hitAt(i), l.hits[((i - 20) % 32 + 32) % 32], `rotation over 32, step ${i}`);
  assert.equal(l.toggle(31), !euclid(7, 32)[31]); l.setLock(30, 'tune', 0.5); l.setTrig(29, { ratchet: 2 }); l.setLength(32);
  const seen = []; for (let s = 0; s < 40; s++) seen.push(l.at(s * P, () => 0).index); assert.deepEqual(seen.slice(28, 36), [28, 29, 30, 31, 0, 1, 2, 3], 'the playhead walks 32 steps, then wraps');
  const back = Lane.from(JSON.parse(JSON.stringify(l))); assert.deepEqual(back.hits, l.hits); assert.equal(back.locks[30].tune, 0.5); assert.equal(back.trigs[29].ratchet, 2);
  l.setLength(20); assert.equal(l.length, 20); assert.ok(l.hits[25] != null, 'steps past the length are kept, not cut');
  // evolve: a 16-step lane never grows past 16, a 32-step one only shrinks
  const m = new Machine(); m.lanes.forEach(x => { x.setLength(16); x.setEuclid(5); }); m.lanes[1].setLength(32);
  let seed = 3; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 300; n++) m.evolve({ scope: 'all', amount: 1 }, rng);
  for (const [i, x] of m.lanes.entries()) assert.ok(x.length >= 2 && x.length <= (i === 1 ? 32 : 16), `lane ${i}: ${x.length}`);
});
test('ORBIT2-07 L2: 4 or 6 lanes — Machine.from keeps the count, setLaneCount adds / drops lanes 5–6, collectHits plays them', async () => {
  const { MAX_LANES, laneCountOf } = await import('../src/poly/lanes.js'); const { collectHits, encodeShare, decodeShare } = await import('../src/poly/export.js');
  assert.equal(MAX_LANES, 6); assert.deepEqual([0, 3, 4, 5, 6, 9].map(laneCountOf), [4, 4, 4, 6, 6, 6]);
  assert.equal(new Machine().lanes.length, 4, 'default 4'); const m = new Machine(6); assert.equal(m.lanes.length, 6);
  assert.deepEqual(m.lanes.map(l => l.voice), KITS.common.lanes.map(k => k.voice), 'Common kit on all six'); assert.equal(m.kitKey(), 'common');
  m.lanes[4].setEuclid(3); m.lanes[5].hits[0] = true; m.lanes[5].accents[0] = true; m.lanes[5].choke = 4; m.selected = 5;
  const j = JSON.parse(JSON.stringify(m.toJSON())), r = Machine.from(j); assert.equal(r.lanes.length, 6); assert.deepEqual(r.toJSON(), m.toJSON(), '6-lane round-trip'); assert.equal(r.selected, 5);
  const link = Machine.from((await decodeShare(await encodeShare(m.toJSON(), 120))).m); assert.equal(link.lanes.length, 6, 'a link keeps 6 lanes');
  // collectHits: lanes 5–6 (li 4, 5) play, at their own times
  const hits = collectHits(r, { from: 0, to: 4 * 4 * P, tempo: 120 }); const five = hits.filter(h => h.li === 4), six = hits.filter(h => h.li === 5);
  assert.equal(five.length, 3 * 4, 'E(3,8) at ×2 = 3 hits a bar, 4 bars'); assert.equal(six.length, 2, 'lane 6: 8 steps at ×1, step 1 = every 2 bars'); assert.equal(six[0].time, 0); assert.equal(six[0].accent, true);
  // 6 → 4 drops lanes 5–6 and a choke into them; 4 → 6 brings fresh empty lanes with the kit's voices
  const d = Machine.from(j); d.lanes[0].choke = 5; d.setLaneCount(4); assert.equal(d.lanes.length, 4); assert.equal(d.lanes[0].choke, -1); assert.equal(d.selected, 3);
  d.applyKit(KITS.trap, DEFAULT_SOUND); d.setLaneCount(6); assert.deepEqual(d.lanes.slice(4).map(l => l.voice), [KITS.trap.lanes[4].voice, KITS.trap.lanes[5].voice]); assert.equal(d.kitKey(), 'trap');
  assert.ok(d.lanes.slice(4).every(l => !l.hits.some(Boolean)), 'new lanes come in empty');
  // a link edited to 5 or 9 lanes: filled up / cut to 6; a choke past the end goes
  const five5 = Machine.from({ ...j, lanes: j.lanes.slice(0, 5).map((l, i) => (i ? l : { ...l, choke: 7 })) }); assert.equal(five5.lanes.length, 6); assert.equal(five5.lanes[0].choke, -1);
  assert.equal(Machine.from({ ...j, lanes: [...j.lanes, ...j.lanes.slice(0, 3)] }).lanes.length, 6);
  // musical randomize: a 4-lane pattern rolls what it always did; 6 lanes add parts for 5–6 without touching lanes 1–4
  const roll = (n) => { let s = 42; const g = () => (s = (s * 16807) % 2147483647) / 2147483647; const x = new Machine(n); x.randomizeMusical(g, 'fourfloor'); return x; };
  const a4 = roll(4), a6 = roll(6); assert.deepEqual(a6.lanes.slice(0, 4).map(l => l.toJSON()), a4.lanes.map(l => l.toJSON()));
  assert.ok(a6.lanes[4].hits.some(Boolean) && a6.lanes[5].hits[0]); assert.ok(a6.cycleTicks() <= 16 * 4 * P);
});
test('ORBIT2-07: old 4-lane / 16-step saves load unchanged; MIDI lanes 5–6 default to 46 / 49 on channel 10; rings for 6 lanes', async () => {
  const { PolyMidi, DEFAULT_NOTES } = await import('../src/poly/midiio.js'); const { ringGeo } = await import('../src/poly/scene.js');
  const old = new Machine(); old.lanes.forEach(l => l.setEuclid(3)); const j = JSON.parse(JSON.stringify(old.toJSON()));
  for (const l of j.lanes) for (const k of ['hits', 'accents', 'locks', 'trigs']) l[k] = l[k].slice(0, 16);   // as a pre-L1 save holds them
  const m = Machine.from(j); assert.equal(m.lanes.length, 4); assert.equal(m.kitKey(), 'common', 'an old pattern still reads as its kit');
  for (const [i, l] of m.lanes.entries()) { assert.equal(l.hits.length, 32); assert.deepEqual(l.hits.slice(0, 16), j.lanes[i].hits); assert.ok(!l.hits.slice(16).some(Boolean)); assert.equal(l.length, old.lanes[i].length); }
  const p = new PolyMidi({ getAccess: () => null }); assert.deepEqual(DEFAULT_NOTES, [36, 38, 42, 39, 46, 49]);
  p.fromJSON({ lanes: [{ note: 40, ch: 2 }, { note: 41, ch: 3 }, { note: 42, ch: 10 }, { note: 43, ch: 10 }] }); assert.deepEqual(p.lanes.slice(4), [{ note: 46, ch: 10 }, { note: 49, ch: 10 }], 'old settings: lanes 5–6 get the defaults'); assert.equal(p.lanes[0].note, 40);
  const g4 = ringGeo(800, 800), g6 = ringGeo(800, 800, null, 6); assert.equal(g4.outer, g4.R * 0.85); assert.ok(Math.abs(g6.outer - g6.R * 0.85) < 1e-9, 'six rings fit where four did'); assert.ok(g6.ring(1) - g6.ring(0) > 0.1 * g6.R);
});
test('ORBIT2-07 r1: Move pages — a held step button keeps its step across a page turn, the pad window stays while it is played, track buttons, a pinned page per lane', async () => {
  const { MovePages, padPages, trackLane, PAD_COLS, STEP_BTNS } = await import('../src/poly/pages.js');
  const long = new Lane('hat', { length: 32 }), short = new Lane('kick', { length: 8 }), mid = new Lane('snare', { length: 20 });
  const p = new MovePages(); assert.equal(padPages([long, short]), 4); assert.equal(padPages([short]), 1); assert.equal(PAD_COLS * 2, STEP_BTNS);
  // following: each row its own playhead's page (page 1 while stopped), the step buttons the 16 holding it
  long.shown = 13; assert.equal(p.padFirst(long, true), 8); assert.equal(p.stepFirst(long, true), 0); assert.equal(p.padFirst(long, false), 0);
  long.shown = 21; assert.equal(p.padFirst(long, true), 16); assert.equal(p.stepFirst(long, true), 16);
  // a hold across a page turn: the release returns the step it went down on; the buttons stay on its page meanwhile
  long.shown = 3; const first = p.stepFirst(long, true); p.press(3, first + 3, first); long.shown = 18;
  assert.equal(p.stepFirst(long, true), 0, 'held: the step buttons stay on the page the finger went down on');
  p.press(5, p.stepFirst(long, true) + 5, p.stepFirst(long, true)); assert.deepEqual([...p.held.values()].map(h => h.step), [3, 5]);
  assert.deepEqual(p.release(3), { step: 3, used: false }); assert.equal(p.stepFirst(long, true), 0, 'one still held');
  p.back = true; assert.deepEqual(p.release(5), { step: 5, used: false }, 'a release while Back is held ends its press too'); p.back = false;
  assert.equal(p.held.size, 0); assert.equal(p.stepFirst(long, true), 16, 'all up: the buttons follow again'); assert.equal(p.release(5), undefined);
  // a pinned page: for every row, a shorter lane shows its last page; ◀ ▶ stay within the longest lane
  p.pin(3, [long, short, mid]); assert.equal(p.padFirst(long, true), 24); assert.equal(p.padFirst(short, true), 0); assert.equal(p.padFirst(mid, true), 16); assert.equal(p.stepFirst(long, true), 16);
  p.pin(9, [long, short]); assert.equal(p.pad, 3); p.pin(-2, [long]); assert.equal(p.pad, 0); assert.equal(p.current(long, true), 0);
  // Back: pressed and let go alone = follow again; with a page pinned while it was down = stay pinned
  p.backDown(); p.pin(2, [long]); p.backUp(); assert.equal(p.follow, false); assert.equal(p.pad, 2); assert.equal(p.back, false);
  p.backDown(); assert.equal(p.back, true); p.backUp(); assert.equal(p.follow, true, 'Back alone follows again');
  p.follow = true; mid.shown = 25; assert.equal(p.padFirst(mid, true), 16, 'a playhead left past a shortened lane: its last page');
  // the pad window: lanes 1–4, or 3–6 once lane 5 / 6 is selected; selecting a lane inside it keeps it
  const w = new MovePages();
  for (const [sel, base] of [[5, 2], [2, 2], [3, 2], [5, 2], [0, 0], [2, 0], [3, 0], [4, 2], [1, 0]]) assert.equal(w.window(sel, 6), base, `selected lane ${sel + 1}`);
  w.window(5, 6); assert.equal(w.window(3, 4), 0, 'four lanes: always lanes 1–4');
  // track buttons: 4 − t; Shift + track 4 / 3 = lanes 5 / 6 on six lanes, otherwise as without Shift (as before L2)
  assert.deepEqual([1, 2, 3, 4].map(t => trackLane(t, false, 6)), [3, 2, 1, 0]); assert.deepEqual([1, 2, 3, 4].map(t => trackLane(t, true, 6)), [3, 2, 5, 4]);
  assert.deepEqual([1, 2, 3, 4].map(t => trackLane(t, true, 4)), [3, 2, 1, 0]);
});
test('ORBIT2-07 r1: a state with fewer lanes keeps the selection inside it (slot, undo, evolve home); a link cut short gets its kit\'s lanes', () => {
  const m = new Machine(6); m.select(5); const four = new Machine(4).toJSON();
  m.assign(four, { selected: m.selected }); assert.equal(m.lanes.length, 4); assert.equal(m.selected, 3); assert.ok(m.lane, 'the selected lane exists');
  const six = new Machine(6); six.select(4); m.assign(six.toJSON()); assert.equal(m.selected, 4, 'not given: the state\'s own');
  m.assign(four, { keep: true, selected: 5 }); assert.equal(m.selected, 3); m.assign(six.toJSON(), { selected: 1 }); assert.equal(m.selected, 1);
  // Machine.from fills a link cut to 5 lanes with lane 6 of the kit it plays, as setLaneCount adds it
  const t = new Machine(6); t.applyKit(KITS.trap, DEFAULT_SOUND); const j = t.toJSON(); j.lanes = j.lanes.slice(0, 5);
  const back = Machine.from(j); assert.equal(back.lanes.length, 6); assert.equal(back.lanes[5].voice, KITS.trap.lanes[5].voice);
  assert.deepEqual(back.lanes[5].sound, { ...DEFAULT_SOUND, ...KITS.trap.lanes[5].sound }); assert.equal(back.kitKey(), 'trap'); assert.ok(!back.lanes[5].hits.some(Boolean));
});

// ---- ORBIT2-08 ----
test('ORBIT2-08 L4: djembe, log drum, agogo, shekere in both engines; Afro and Jungle kits; the old Afro set is "Hand drums"', async () => {
  const { VOICES, VEL_TIMBRE } = await import('../src/poly/voices.js'); const { DSP_VOICES } = await import('../src/poly/dsp-voices.js'); const { makeEngine } = await import('../src/poly/dsp-core.js');
  for (const k of ['djembe', 'logdrum', 'agogo', 'shekere']) { assert.ok(VOICES[k]?.make && VOICES[k].hit && DSP_VOICES[k] && VEL_TIMBRE[k], k); }
  assert.deepEqual(KITS.afro.lanes.slice(0, 4).map(l => l.voice), ['kick', 'logdrum', 'shekere', 'agogo']); assert.ok(KITS.afro.lanes.some(l => l.voice === 'djembe'));
  assert.equal(KITS.jungle.name, 'Jungle'); assert.ok(KITS.jungle.lanes[2].sound.decay <= 0.15, 'short hats'); assert.deepEqual(KITS.hands.lanes.map(l => l.voice), ['conga', 'shaker', 'tabla', 'cuica', 'cowbell', 'bongo']);
  const sr = 44100, p = { vel: 0.7, tune: 0, dec: 0.34, decayRaw: 0.5, snap: 0.5, color: 0.5 };
  const render = (layers) => { const e = makeEngine(sr); e.hit(layers, 0); const o = new Float32Array(sr); for (let i = 0; i < o.length; i += 128) e.render(o, i, i + 128); let pk = 0, dc = 0, ms = 0, W = sr * 0.05, acc = 0; for (let i = 0; i < o.length; i++) { pk = Math.max(pk, Math.abs(o[i])); dc += o[i]; acc += o[i] ** 2; if (i >= W) acc -= o[i - W] ** 2; ms = Math.max(ms, acc / W); } return { pk, dc: dc / o.length, rms: Math.sqrt(ms), head: Math.abs(o[0]) }; };
  const db = (x) => 20 * Math.log10(x), ref = (k) => render(DSP_VOICES[k](p));
  // levels: near their neighbours in the library (peak and 50 ms loudness within 6 dB), no DC, starts from silence
  for (const [k, r] of [['djembe', 'conga'], ['logdrum', 'kick808'], ['agogo', 'cowbell'], ['shekere', 'shaker']]) for (const q of [{}, { color: 0 }, { color: 1 }, { artic: 1 }]) {
    const a = render(DSP_VOICES[k]({ ...p, ...q })), b = ref(r);
    assert.ok(Math.abs(db(a.pk) - db(b.pk)) < 6, `${k} ${JSON.stringify(q)} peak ${db(a.pk).toFixed(1)} vs ${r} ${db(b.pk).toFixed(1)}`);
    assert.ok(Math.abs(db(a.rms) - db(b.rms)) < 6, `${k} ${JSON.stringify(q)} rms ${db(a.rms).toFixed(1)} vs ${r} ${db(b.rms).toFixed(1)}`);
    assert.ok(Math.abs(a.dc) < 2e-3 && a.head < 0.02, `${k}: dc ${a.dc}, first sample ${a.head}`);
  }
  // djembe: three strokes from color; agogo: two pitches; log drum: color glides it down
  const f0 = (layers) => layers[0].f; assert.ok(f0(DSP_VOICES.djembe({ ...p, color: 0 })) < f0(DSP_VOICES.djembe(p)) && f0(DSP_VOICES.djembe(p)) < f0(DSP_VOICES.djembe({ ...p, color: 1 })));
  assert.ok(Math.abs(f0(DSP_VOICES.agogo({ ...p, color: 1 })) / f0(DSP_VOICES.agogo({ ...p, color: 0 })) - 1.5) < 1e-9);
  assert.equal(DSP_VOICES.logdrum({ ...p, color: 0 })[0].glide, 1); assert.ok(DSP_VOICES.logdrum({ ...p, color: 1 })[0].glide < 0.7);
});
test('ORBIT2-08 L3: artic step lock — whole numbers in range, cycles per voice, survives a save, voices play it, MIDI on neighbouring notes', async () => {
  const { ARTICS, ARTIC_MAX, articAt, velShape } = await import('../src/poly/voices.js'); const { DSP_VOICES } = await import('../src/poly/dsp-voices.js'); const { makeEngine } = await import('../src/poly/dsp-core.js');
  const { collectHits, hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js'); const { STEP_LOCKS, LOCK_KEYS } = await import('../src/poly/lanes.js');
  assert.ok(STEP_LOCKS.includes('artic') && !LOCK_KEYS.includes('artic'), 'no knob or gauge of its own'); assert.equal(ARTIC_MAX, 2);
  for (const k of ['conga', 'djembe', 'hat']) assert.ok(ARTICS[k].length >= 2, k);
  const m = new Machine(); m.lanes.forEach(l => l.clear()); const c = m.lanes[3]; c.setVoice('conga'); c.setLength(4); c.setRatio(5); for (let i = 0; i < 4; i++) c.hits[i] = true;
  assert.equal(c.setLock(1, 'artic', 1.4), 1); assert.equal(c.setLock(2, 'artic', 9), 2, 'clamped'); assert.equal(c.setLock(3, 'artic', -3), 0);
  // cycle: lane sound → open → mute → slap → lane sound; a voice without strokes takes none
  const seen = []; for (let k = 0; k < 4; k++) seen.push(c.cycleArtic(0)); assert.deepEqual(seen, [0, 1, 2, null]); assert.equal(c.locks[0], null, 'back to no lock');
  const kk = m.lanes[0]; assert.equal(kk.cycleArtic(0), null); assert.equal(kk.locks[0], null);
  const h = m.lanes[2]; h.setVoice('hat'); assert.deepEqual([h.cycleArtic(0), h.cycleArtic(0), h.cycleArtic(0)], [0, 1, null], 'hat: closed, open, lane');
  // saves: kept, a hand-edited link is brought back in range; a lane that changed voice ignores a stroke it lacks
  const back = Machine.from(JSON.parse(JSON.stringify(m))); assert.deepEqual(back.lanes[3].locks.slice(0, 4).map(l => l?.artic ?? null), [null, 1, 2, 0]);
  const j = JSON.parse(JSON.stringify(m)); j.lanes[3].locks[1] = { artic: '7.6', tune: 0.5 }; assert.deepEqual(Machine.from(j).lanes[3].locks[1], { artic: 2, tune: 0.5 });
  assert.equal(articAt('conga', { artic: 2 }), 2); assert.equal(articAt('hat', { artic: 2 }), null); assert.equal(articAt('kick', { artic: 0 }), null); assert.equal(articAt('conga', null), null);
  assert.equal(velShape({ vel: 0.35, tune: 0, dec: 0.3, snap: 0.5, color: 0.5, artic: 2 }, 'conga').artic, 2, 'a soft hit keeps its stroke');
  // the dsp voices: a mute is shorter than an open tone, a slap brighter; an open hat rings longer than a closed one
  const sr = 44100, p = { vel: 0.7, tune: 0, dec: 0.34, decayRaw: 0.5, snap: 0.5, color: 0.5 };
  const len = (layers) => { const e = makeEngine(sr); e.hit(layers, 0); const o = new Float32Array(sr * 2); for (let i = 0; i < o.length; i += 128) e.render(o, i, i + 128); let last = 0; for (let i = 0; i < o.length; i++) if (Math.abs(o[i]) > 1e-3) last = i; return last / sr; };
  assert.ok(len(DSP_VOICES.conga({ ...p, artic: 1 })) < len(DSP_VOICES.conga(p)) * 0.5, 'mute');
  assert.ok(DSP_VOICES.conga({ ...p, artic: 2 })[0].f > DSP_VOICES.conga(p)[0].f * 1.4, 'slap higher');
  assert.ok(len(DSP_VOICES.hat({ ...p, artic: 1 })) > len(DSP_VOICES.hat(p)) * 1.5, 'open hat');
  assert.deepEqual(DSP_VOICES.conga({ ...p, artic: 0 }), DSP_VOICES.conga(p), 'open = the unlocked conga');
  // MIDI: every stroke on its own note (midiio.js strokeNotes); an unlocked conga plays open, on the lane's note
  const hits = collectHits(m, { from: 0, to: 4 * c.stepTicks(), tempo: 120 }).filter(x => x.li === 3); assert.deepEqual(hits.map(x => x.artic), [0, 1, 2, 0], 'the stroke each hit plays (round 1: an unlocked conga plays open, 0)');
  const lanes = [36, 38, 42, 60, 46, 49].map(note => ({ note, ch: 10 })), notes = readMidi(hitsToMidi(hits, { tempo: 120, lanes, names: [], bars: 1 })).tracks.flatMap(t => t.notes);
  assert.deepEqual(notes.map(n => n.p ?? n.note).sort(), [60, 60, 61, 62]);
});
test('ORBIT2-08 r1: the note sent is the stroke heard, stroke notes never land on another lane, synth slaps crack, the synth shekere is white noise', async () => {
  const { strokeOf, VOICES } = await import('../src/poly/voices.js'); const { DSP_VOICES } = await import('../src/poly/dsp-voices.js');
  const { collectHits, hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js'); const { strokeNotes, DEFAULT_NOTES, PolyMidi } = await import('../src/poly/midiio.js');
  // one stroke rule: a lock wins, else djembe by color thirds and agogo high from ½, else the first stroke; null without strokes
  assert.deepEqual([0, 0.32, 0.34, 0.66, 0.67, 1].map(c => strokeOf('djembe', null, c)), [0, 0, 1, 1, 2, 2]);
  assert.deepEqual([0.49, 0.5].map(c => strokeOf('agogo', null, c)), [0, 1]);
  assert.equal(strokeOf('djembe', { artic: 0 }, 1), 0, 'a lock wins over color'); assert.equal(strokeOf('conga', null, 0.9), 0); assert.equal(strokeOf('hat', { artic: 2 }, 0.5), 0, 'a stroke the voice lacks: its first');
  assert.equal(strokeOf('kick', { artic: 1 }, 0.5), null); assert.equal(strokeOf('sample', null, 0.5), null);
  // the dsp voices called without a stroke play what strokeOf says, so the engines and MIDI share one rule
  const p = { vel: 0.7, tune: 0, dec: 0.34, decayRaw: 0.5, snap: 0.5, color: 0.5 };
  for (const k of ['djembe', 'agogo']) for (const c of [0, 0.2, 0.4, 0.5, 0.6, 0.9, 1]) assert.deepEqual(DSP_VOICES[k]({ ...p, color: c }), DSP_VOICES[k]({ ...p, color: c, artic: strokeOf(k, null, c) }), `${k} at color ${c}`);
  // repro (verifier 1, architect 1): Afro kit, the djembe (lane 5, color 0.5) [no lock, bass, tone, color lock 0.9] plays
  // tone, bass, tone, slap and must send those strokes' notes; the agogo at color 0.7 rings high without a lock
  const map = DEFAULT_NOTES.map(note => ({ note, ch: 10 })), rows = strokeNotes(map);
  const sent = (m, li, locks) => {
    const l = m.lanes[li]; m.lanes.forEach(x => x.clear()); l.setLength(4); l.setRatio(5); locks.forEach((lk, i) => { l.hits[i] = true; l.locks[i] = lk && { ...lk }; });
    const hits = collectHits(m, { from: 0, to: 4 * l.stepTicks(), tempo: 120 }).filter(h => h.li === li);
    return readMidi(hitsToMidi(hits, { tempo: 120, lanes: map, names: [], bars: 1 })).tracks.flatMap(t => t.notes).map(n => n.p ?? n.note);
  };
  const afro = () => { const m = new Machine(6); m.applyKit(KITS.afro, DEFAULT_SOUND); return m; };
  assert.deepEqual(sent(afro(), 4, [null, { artic: 0 }, { artic: 1 }, { color: 0.9 }]), [1, 0, 1, 2].map(a => rows[4][a]));
  const ma = afro(); ma.lanes[3].sound.color = 0.7; assert.deepEqual(sent(ma, 3, [null, { artic: 0 }, { artic: 1 }, null]), [1, 0, 1, 1].map(a => rows[3][a]));
  // repro (verifier 2): with the default notes every stroke of every lane has a note of its own (none on another lane's)
  const all = rows.flat(); assert.equal(new Set(all).size, all.length); assert.deepEqual(rows[0], [36, 37, 40], 'lane 1: 36, 37, 40 (38, 39 = lanes 2, 4)');
  const mh = new Machine(6); mh.applyKit(KITS.hands, DEFAULT_SOUND); const ns = sent(mh, 0, [{ artic: 0 }, { artic: 1 }, { artic: 2 }, null]);
  assert.ok(!ns.slice(1, 3).some(n => DEFAULT_NOTES.includes(n)), `Hand drums conga mute / slap on ${ns.slice(1, 3)}`);
  // another channel is another instrument (no clash there); past 127 the strokes go down (round 2), still on free notes
  assert.deepEqual(strokeNotes([{ note: 36, ch: 10 }, { note: 37, ch: 1 }, { note: 38, ch: 10 }]).map(r => r.join()), ['36,37,39', '37,38,39', '38,40,41']);
  assert.deepEqual(strokeNotes([{ note: 126, ch: 10 }])[0], [126, 127, 125]);
  assert.deepEqual(strokeNotes([{ note: 125, ch: 10 }, { note: 127, ch: 10 }]), [[125, 126, 124], [127, 123, 122]]);
  const top = strokeNotes([120, 122, 124, 125, 126, 127].map(note => ({ note, ch: 10 }))).flat(); assert.equal(new Set(top).size, 18, `top of the range: ${top}`);
  // live out sends the notes the file has
  const out = [], pm = new PolyMidi({ getAccess: () => null }); pm.out = { send: (b) => out.push(b) }; pm.note(0, 0.8, 0, 2); pm.note(4, 0.8, 0, 1); pm.note(2, 0.8, 0, null);
  assert.deepEqual(out.filter(b => (b[0] & 0xf0) === 0x90).map(b => b[1]), [rows[0][2], rows[4][1], 42]);
  // synth (Tone) voices, structure only (their levels are measured in the browser): a slap fires a crack through a
  // high-pass, 12 dB or more over the open stroke's noise, with the body at (nearly) full velocity; the shekere's beads
  // are white noise (pink lost ~16 dB in their band)
  const fakeT = () => {
    const calls = []; class N { constructor(o = {}) { this.o = o; this.frequency = { setValueAtTime() {}, cancelScheduledValues() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; } connect(x) { this.to = x; return this; } set(o) { Object.assign(this.o, o); } triggerAttackRelease(...a) { calls.push({ n: this, vel: a[a.length - 1] }); } }
    return { calls, T: { Filter: class extends N {}, MembraneSynth: class extends N {}, NoiseSynth: class extends N {}, FMSynth: class extends N {}, Frequency: (x) => ({ toFrequency: () => 440 * 2 ** ((x - 69) / 12) }) } };
  };
  const strike = (k, artic) => {
    const { T, calls } = fakeT(), n = VOICES[k].make(T, {}); VOICES[k].hit(T, n, { ...p, artic }, 0);
    const noise = calls.filter(c => c.n instanceof T.NoiseSynth), body = calls.find(c => c.n instanceof T.MembraneSynth);
    return { noise: Math.max(0, ...noise.map(c => 10 ** ((c.n.o.volume ?? 0) / 20) * c.vel)), hp: noise.some(c => c.n.to?.o?.type === 'highpass' && c.n.to.o.frequency >= 1000), body: body?.vel ?? 0 };
  };
  for (const k of ['conga', 'bongo', 'djembe']) {
    const s = strike(k, 2), o = strike(k, 0);
    assert.ok(s.hp && s.noise >= 4 * o.noise && s.noise >= 0.25, `${k} slap crack ${s.noise.toFixed(3)} vs open ${o.noise.toFixed(3)}`); assert.ok(s.body >= 0.85 * p.vel, `${k} slap body ${s.body}`);
  }
  const { T: fT } = fakeT(), sk = VOICES.shekere.make(fT, {}); assert.equal(sk.n.o.noise?.type, 'white'); assert.ok(sk.n.o.volume >= -6);
});
test('ORBIT2-08 r2: every live MIDI note (the clock and a pad played while recording) goes out as the stroke it plays', async () => {
  // repro (verifier, round 2): a pad hit (liveHit) sent the lane's first-stroke note: the Afro djembe at color 0.5 sent 46
  // (bass) while it played its tone (50). app.js now has one path to pmidi.note, which adds the stroke; both live callers use it
  const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  const calls = src.match(/pmidi\.note\([^;]*\)/g) || []; assert.equal(calls.length, 1, `one pmidi.note call: ${calls}`); assert.match(calls[0], /strokeAt\(lock\)/);
  assert.match(src, /function liveHit[\s\S]*?midiHit\(li, lane, [^;]*, lock\)/, 'liveHit sends through midiHit with its lock');
  // the stroke a pad hit plays: liveHit's lock is null or { tune } (pitch pads): the color's stroke either way
  const { DEFAULT_SOUND: DS } = await import('../src/poly/lanes.js'); const { strokeNotes, PolyMidi } = await import('../src/poly/midiio.js');
  const m = new Machine(6); m.applyKit(KITS.afro, DS); const dj = m.lanes[4]; assert.equal(dj.strokeAt(null), 1); assert.equal(dj.strokeAt({ tune: 0.3 }), 1);
  const out = [], pm = new PolyMidi({ getAccess: () => null }); pm.out = { send: (b) => out.push(b) }; pm.note(4, 0.7, 0, dj.strokeAt({ tune: 0.3 }));
  assert.equal(out[0][1], strokeNotes(pm.lanes)[4][1]); assert.equal(out[0][1], 50);
});
test('S1 / S3 slice sets: a slice per step, slice / start / end / rev locks, kept through save/load', async () => {
  const { collectHits } = await import('../src/poly/export.js');
  const m = new Machine(), l = m.lanes[0]; l.setLength(8); l.setEuclid(8);
  l.loadSlices({ name: 'break', slices: ['a', 'b', 'c', 'd'] }); assert.equal(l.voice, 'sample'); assert.equal(l.sample.id, 'a', 'id = first slice'); assert.equal(l.sliceCount(), 4);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => l.sliceAt(i, null)), [0, 1, 2, 3, 0, 1], 'default: step i plays slice i mod N');
  l.setLock(5, 'slice', 3.4); assert.equal(l.locks[5].slice, 3, 'a whole number'); assert.equal(l.sliceAt(5, l.locks[5]), 3, 'the lock wins');
  assert.equal(l.sliceAt(0, { slice: 9 }), 3, 'a lock past a smaller set plays its last slice'); assert.equal(l.setLock(0, 'slice', 40), 15, 'at most 16 slices');
  assert.equal(l.sampleId(2), 'c'); l.unlock(0, 'slice');
  const hits = collectHits(m, { to: P * 8, tempo: 120 }).filter(h => h.li === 0); assert.deepEqual(hits.map(h => h.slice), [0, 1, 2, 3, 0, 3, 2, 3], 'renders carry the slice');
  l.rotation = 1; assert.equal(l.at(P * 1).slice, 0, 'the slice follows the stored step through the rotation'); l.rotation = 0;
  assert.deepEqual(l.trimAt(null), { start: 0, end: 1, rev: false }, 'whole and forwards by default');
  l.setTrim('start', 0.25); l.setTrim('rev', true); l.setLock(2, 'end', 0.5); l.setLock(3, 'rev', 0);
  assert.deepEqual(l.trimAt(l.locks[2]), { start: 0.25, end: 0.5, rev: true }); assert.equal(l.trimAt(l.locks[3]).rev, false, 'rev 0 = forwards on a reversed lane');
  l.setTrim('start', 0); assert.equal('start' in l.sample, false, 'a default is not stored');
  const back = Machine.from(JSON.parse(JSON.stringify(m))).lanes[0];
  assert.deepEqual(back.sample.slices, ['a', 'b', 'c', 'd']); assert.equal(back.sample.rev, true); assert.equal(back.locks[5].slice, 3); assert.equal(back.locks[2].end, 0.5); assert.equal(back.locks[3].rev, 0);
  const old = m.toJSON(); old.lanes[1].voice = 'sample'; old.lanes[1].sample = { id: 'x', name: 'one.wav' }; old.lanes[2].voice = 'sample'; old.lanes[2].sample = { id: 'y', name: 'z', slices: [1, 'q'], start: 7 };
  const mm = Machine.from(old); assert.equal(mm.lanes[1].sliceCount(), 0, 'an old single sample stays one'); assert.equal(mm.lanes[1].sliceAt(3, null), null); assert.equal(mm.lanes[1].sampleId(null), 'x');
  assert.deepEqual(mm.lanes[2].sample.slices, ['q'], 'bad ids dropped'); assert.equal(mm.lanes[2].sample.id, 'q'); assert.equal(mm.lanes[2].sample.start, 1, 'clamped');
});
test('S2 hand-off: v1 (8 slices) and v2 (a region + cuts, up to 16) read as one shape; a break cuts into equal slices', async () => {
  const { readSlices, chopEqual, MAX_HANDOFF } = await import('../src/samples.js');
  const f = (n, v = 0) => Float32Array.from({ length: n }, (_, i) => v + i);
  const v1 = readSlices({ name: 'a.wav', sampleRate: 44100, slices: Array.from({ length: 8 }, (_, k) => [f(10, k * 10)]) });
  assert.equal(v1.slices.length, 8); assert.equal(v1.mode, 'tiles'); assert.equal(v1.slices[3][0][0], 30);
  assert.equal(readSlices({ sampleRate: 44100, slices: Array.from({ length: 20 }, () => [f(4)]) }).slices.length, MAX_HANDOFF, 'at most 16');
  assert.equal(readSlices({ sampleRate: 44100, slices: [[f(4)], [], [new Float32Array(0)], 'x'] }).slices.length, 1, 'bad slices dropped');
  assert.equal(readSlices(null), null); assert.equal(readSlices({ slices: [[f(4)]] }), null, 'no rate'); assert.equal(readSlices({ sampleRate: 1, slices: [] }), null);
  const v2 = readSlices({ v: 2, name: 'b', sampleRate: 48000, channels: [f(160), f(160, 1000)], cuts: [40, 120, 80, 80, 0, 999, 10.4], mode: 'set' });
  assert.deepEqual(v2.slices.map(s => s[0].length), [10, 30, 40, 40, 40], 'sorted, deduplicated, out-of-range dropped, rounded');
  assert.equal(v2.slices[1][1][0], 1010, 'every channel cut at the same points'); assert.equal(v2.mode, 'set');
  const many = readSlices({ v: 2, sampleRate: 1, channels: [f(100)], cuts: Array.from({ length: 30 }, (_, k) => (k + 1) * 3) });
  assert.equal(many.slices.length, 16); assert.equal(many.slices[15][0][0], 45, '16th slice starts at the 15th cut'); assert.equal(many.slices[15][0].length, 3, 'and ends at the 16th');
  assert.equal(readSlices({ v: 2, sampleRate: 1, channels: [f(100)] }).slices.length, 1, 'no cuts = one slice'); assert.equal(readSlices({ v: 2, sampleRate: 1, channels: [] }), null);
  const brk = { sampleRate: 10, channels: [f(103), f(103, 500)] }, ch = chopEqual(brk, 16);
  assert.equal(ch.length, 16); assert.deepEqual(ch.slice(0, 15).map(s => s[0].length), Array(15).fill(6)); assert.equal(ch[15][0].length, 13, 'the remainder goes to the last slice');
  assert.equal(ch[2][1][0], 512); assert.equal(chopEqual(brk, 8).length, 8); assert.equal(chopEqual({ channels: [f(3)] }, 16).length, 3, 'never an empty slice');
});
test('ORBIT2-09 r1: slices join without a hole, a break lies across its lane at its own speed, a pad plays its step\'s slice, a recalled set loads', async () => {
  const { sampleWindow } = await import('../src/samples.js'), { collectHits } = await import('../src/poly/export.js'), { breakSpeed } = await import('../src/poly/lanes.js');
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
  // sound 1: a slice (played from its copy with the next slice's start appended, app.js padBuf, 70 ms) stays at full level
  // to its cut, then fades out over that audio as the next slice fades in (the same attack): in order the two are the
  // same audio, so they sum back to the break
  const PAD = 0.07, sl = sampleWindow({ dur: 0.125, pad: PAD, slice: true });
  assert.equal(sl.follow, 'same'); near(sl.offset, 0, 'from its start'); near(sl.hold, 0.125, 'full level to the cut'); near(sl.play - sl.hold, sl.attack, 'fades as the next fades in');
  const tuned = sampleWindow({ dur: 0.125, pad: PAD, tune: -1, slice: true }); near(tuned.hold, 0.25, 'an octave down: twice as long'); assert.equal(tuned.follow, 'same');
  const soft = sampleWindow({ dur: 0.125, pad: PAD, snap: 0, tune: 1, slice: true }); near(soft.attack, 0.031, 'snap 0'); near(soft.play - soft.hold, soft.attack, 'the padding holds the longest fade at twice the speed');
  // nothing after it (the next slice not loaded yet): a 2 ms guard on a slice (it was 10 ms, a 5.5 ms hole at every join)
  const lone = sampleWindow({ dur: 0.125, slice: true }); assert.equal(lone.follow, null); near(lone.play - lone.hold, 0.002, 'a slice\'s guard');
  near(sampleWindow({ dur: 0.5, rev: true }).play - sampleWindow({ dur: 0.5, rev: true }).hold, 0.002, 'the reversed attack keeps its crack');
  // backwards the part sits at its mirror and fades over what came before it; an end point fades over what follows it
  const back = sampleWindow({ dur: 0.1, start: 0.25, end: 0.75, rev: true }); near(back.offset, 0.025, 'mirror of the end'); assert.equal(back.follow, 'same');
  assert.equal(sampleWindow({ dur: 0.1, pad: PAD, rev: true, slice: true }).follow, 'same', 'a reversed slice fades over the reversed end of the one before');
  const trimmed = sampleWindow({ dur: 0.2, end: 0.5 }); assert.equal(trimmed.follow, 'same'); near(trimmed.hold, 0.1, 'to the end point'); near(trimmed.play, 0.101, 'then 1 ms over what follows');
  near(sampleWindow({ dur: 0.125, start: 0.5, end: 0.5 }).hold, 0.005, 'start = end still plays 5 ms (not 0.5 % of the part)');
  // a whole sample and every lower decay: the formula from before the phase, unchanged
  const old = ({ dur, snap, tune, decay }) => { const skip = snap > 0.5 ? (snap - 0.5) * 0.6 * dur : 0, attack = snap < 0.5 ? 0.001 + (0.5 - snap) * 0.06 : 0.001, rate = 2 ** tune, avail = (dur - skip) / rate, play = Math.min(avail, 0.03 + decay ** 1.5 * avail); return { offset: skip, rate, attack, hold: decay >= 0.99 ? Math.max(attack, play - 0.01) : Math.max(attack, play * 0.75), play }; };
  for (const dur of [0.05, 0.5, 3]) for (const snap of [0, 0.3, 0.5, 0.8, 1]) for (const tune of [-1, 0, 0.5]) for (const decay of [0, 0.4, 0.99, 1]) {
    const w = sampleWindow({ dur, snap, tune, decay }), o = old({ dur, snap, tune, decay }); assert.equal(w.follow, null);
    for (const k of ['offset', 'rate', 'attack', 'hold', 'play']) near(w[k], o[k], `${k} at ${dur} s, snap ${snap}, tune ${tune}, decay ${decay}`);
  }
  // sound 2: a break lies across the lane at the speed that makes its steps last it at this tempo
  const R = (i) => RATIOS[i];
  assert.equal(R(breakSpeed(16, 2, 120)), 4, '16 slices of a bar: 16ths'); assert.equal(R(breakSpeed(8, 2, 120)), 2, '8: 8ths'); assert.equal(R(breakSpeed(16, 4, 120)), 2, 'two bars: 8ths');
  assert.equal(R(breakSpeed(8, 4, 120)), 1); assert.equal(R(breakSpeed(8, 1, 120)), 4, 'half a bar'); assert.equal(R(breakSpeed(16, (60 / 170) * 4, 100)), 4, 'a 170 bpm bar at 100 bpm is still a bar');
  assert.equal(R(breakSpeed(12, 2, 120)), 3); assert.equal(R(breakSpeed(11, 2, 120)), 3, 'no bar fits: the nearest speed'); assert.equal(R(breakSpeed(16, 2, 0)), 4, 'no tempo: a bar');
  const m = new Machine(), l = m.lanes[0]; l.setLength(4); l.setRatio(ratioIndexOf(4)); l.hits[0] = true; l.rotation = 1; l.tune = 0.3; l.swing = 0.3; l.setLock(0, 'vel', 0.2);
  const ids = Array.from({ length: 8 }, (_, k) => 'b' + k);
  assert.equal(l.loadBreak({ name: 'brk', slices: ids, sec: 2, bpm: 120 }), true, 'a drum lane with a pattern gets the break laid out');
  assert.deepEqual([l.length, l.ratio, l.hits.slice(0, 8).every(Boolean), l.rotation, l.tune, l.swing, l.locks[0], l.sound.tone, l.sound.send], [8, 2, true, 0, 0, 0, null, 1, 0]);
  // the reviewer's repro (8 slices of a 2 s bar on a ×4 lane): now once a bar, in order, 250 ms apart, one at a time
  const hits = collectHits(m, { to: P * 4, tempo: 120 }).filter(h => h.li === 0); assert.deepEqual(hits.map(h => h.slice), [0, 1, 2, 3, 4, 5, 6, 7]); hits.forEach((h, k) => near(h.time, k * 0.25, 'slice ' + k));
  // a lane already playing a slice set with steps on keeps its chops for a new break; an empty one is laid out again
  l.setLock(3, 'slice', 6); l.toggle(5);
  assert.equal(l.loadBreak({ name: 'other', slices: ['c0', 'c1', 'c2', 'c3'], sec: 1, bpm: 120 }), false); assert.equal(l.locks[3].slice, 6, 'locks stay'); assert.equal(l.hits[5], false, 'hits stay');
  assert.equal(l.sample.slices.length, 4); assert.equal(l.sliceAt(3, l.locks[3]), 3, 'a lock past the new set plays its last slice');
  l.clear(); assert.equal(l.loadBreak({ name: 'third', slices: ids, sec: 2, bpm: 120 }), true);
  // S3: the app makes reversed copies early when something plays backwards (a rev lock of 0 is forwards)
  assert.equal(l.usesRev(), false); l.setLock(2, 'rev', 0); assert.equal(l.usesRev(), false); l.setLock(2, 'rev', 1); assert.equal(l.usesRev(), true); l.unlock(2, 'rev'); l.setTrim('rev', true); assert.equal(l.usesRev(), true);
  // app.js has no unit seam for the wiring (checked in the page, see the review file; what a pad plays is Lane.padHit,
  // tested in "ORBIT2-09 r2"): a pad hit plays what the step it lands on plays (architect 1), and every buildVoice of a
  // sample lane loads its set, even on a chain that already plays a sample, as after a slot recall (dex 1)
  const { readFileSync } = await import('node:fs'), app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  const live = app.slice(app.indexOf('function liveHit('), app.indexOf('function setRec('));
  assert.match(live, /ph = lane\.padHit\(idx, lock\)/); assert.match(live, /hitSound\([^;]*ph\.lock[^;]*ph\.slice[,)]/, 'liveHit plays its step\'s slice'); assert.ok(live.indexOf('lane.quantize(') < live.indexOf('hitSound('), 'the step is known before the hit sounds');
  const bv = app.slice(app.indexOf('function buildVoice('), app.indexOf('// ---- engines')), at = bv.indexOf('ensureSample(lane)');
  assert.ok(at > 0 && at < bv.indexOf('&& c.v) return'), 'ensureSample runs before the early return');
});
test('ORBIT2-09 r2: what a pad hit plays, the padded slice audio, a new break keeps a chopping lane\'s knobs', async () => {
  const { padChannels } = await import('../src/samples.js');
  // Lane.padHit: the step's slice and, on a sample lane, its start / end / direction under the pad's own lock
  const m = new Machine(), l = m.lanes[0]; l.loadBreak({ name: 'b', slices: ['a', 'b', 'c', 'd'], sec: 2, bpm: 120 });
  l.setLock(1, 'slice', 3); l.setLock(1, 'rev', 1); l.setLock(1, 'vel', 0.2); l.setLock(2, 'start', 0.5);
  assert.deepEqual(l.padHit(0), { lock: null, slice: 0 }, 'an unlocked step: its own slice, no lock');
  assert.deepEqual(l.padHit(1), { lock: { rev: 1 }, slice: 3 }, 'the slice lock and the direction, not the step\'s other locks');
  assert.deepEqual(l.padHit(2, { tune: 0.3 }), { lock: { start: 0.5, tune: 0.3 }, slice: 2 }, 'a pitch pad\'s tune on top');
  assert.deepEqual(l.padHit(5), { lock: null, slice: 1 }, 'step 6 of a 4-slice set: slice 2');
  const d = m.lanes[1]; d.setLock(0, 'start', 0.5); assert.deepEqual(d.padHit(0, { tune: 0.1 }), { lock: { tune: 0.1 }, slice: null }, 'a drum lane: the pad\'s lock only');
  // padChannels: the slice, then the next one's start; backwards the slice reversed, then the reversed end of the one before
  const x = [Float32Array.of(1, 2, 3), Float32Array.of(-1, -2, -3)], y = [Float32Array.of(4, 5, 6, 7), Float32Array.of(-4, -5, -6, -7)];
  assert.deepEqual(padChannels(x, y, 2).map(c => [...c]), [[1, 2, 3, 4, 5], [-1, -2, -3, -4, -5]]);
  assert.deepEqual(padChannels(x, y, 2, true).map(c => [...c]), [[3, 2, 1, 7, 6], [-3, -2, -1, -7, -6]]);
  assert.deepEqual(padChannels(x, y, 9).map(c => c.length), [7, 7], 'never more than the neighbour holds');
  assert.deepEqual([...padChannels(x, [y[0]], 1)[1]], [-1, -2, -3, 4], 'a mono neighbour pads both channels');
  // sound (r2): a new break on a lane already chopping a set keeps its chops and its decay / snap / color
  l.setSound('decay', 0.4); l.setSound('snap', 0.7); l.setSound('color', 0.6);
  assert.equal(l.loadBreak({ name: 'b2', slices: ['e', 'f'], sec: 1, bpm: 120 }), false);
  assert.deepEqual([l.sound.decay, l.sound.snap, l.sound.color, l.sample.slices.join()], [0.4, 0.7, 0.6, 'e,f']);
  l.clear(); l.loadBreak({ name: 'b3', slices: ['g', 'h'], sec: 1, bpm: 120 }); assert.deepEqual([l.sound.decay, l.sound.snap, l.sound.color], [1, 0.5, 0.5], 'laid out: the sample defaults');
});
test('ORBIT2-10 E1: 24-bit and 32-bit float WAVs round-trip through parseWav; tags land before data in any header', async () => {
  const { encodeWav, wavFrames } = await import('../src/unasm/wav.js'); const { parseWav } = await import('../tools/cdp.mjs'); const { tagWav } = await import('../src/poly/jam.js');
  const L = Float32Array.of(0, 0.5, -0.25, 1.5, -1), R = Float32Array.of(0, -0.5, 0.25, 0.75, 0.125);
  const read = (w, bits, f, ch) => { const v = new DataView(w.buffer), o = w.length - 5 * 2 * (bits / 8); return bits === 32 ? v.getFloat32(o + (f * 2 + ch) * 4, true) : (v.getUint8(o + (f * 2 + ch) * 3) | v.getUint8(o + (f * 2 + ch) * 3 + 1) << 8 | v.getInt8(o + (f * 2 + ch) * 3 + 2) << 16) / 8388608; };
  const w24 = encodeWav([L, R], 48000, { bits: 24 }), p24 = parseWav(w24);
  assert.deepEqual([p24.format, p24.bits, p24.channels, p24.sampleRate, p24.frames, p24.firstOnset], [1, 24, 2, 48000, 5, 1]);
  assert.ok(Math.abs(read(w24, 24, 1, 0) - 0.5) < 1e-6 && Math.abs(read(w24, 24, 2, 1) - 0.25) < 1e-6, '24-bit keeps the value'); assert.ok(read(w24, 24, 3, 0) <= 1, 'PCM clips at full scale');
  const w32 = encodeWav([L, R], 44100, { bits: 32 }), p32 = parseWav(w32);
  assert.deepEqual([p32.format, p32.bits, p32.frames, p32.chunks.join()], [3, 32, 5, 'fmt ,fact,data'], 'float: format 3 + fact');
  assert.equal(read(w32, 32, 3, 0), 1.5, 'float keeps over 0 dBFS'); assert.equal(new DataView(w32.buffer).getUint32(w32.indexOf(0x66, 36) + 8, true), 5, 'fact = frames');
  assert.equal(new DataView(w24.buffer).getUint32(4, true), w24.length - 8); assert.equal(wavFrames(w32), 5);
  const t = tagWav(w32, 44100, { acid: { bpm: 120, beats: 8 }, smpl: true }), pt = parseWav(t);
  assert.deepEqual(pt.chunks, ['fmt ', 'fact', 'acid', 'smpl', 'data']); assert.equal(pt.acid.bpm, 120); assert.equal(pt.frames, 5); assert.equal(new DataView(t.buffer).getUint32(4, true), t.length - 8);
  const odd = encodeWav([Float32Array.of(0.1)], 44100, { bits: 24 }); assert.equal(odd.length % 2, 0, 'an odd data chunk is padded');
});
test('ORBIT2-10 E6: smpl chunk = one forward loop over the whole file', async () => {
  const { encodeWav, withSmpl } = await import('../src/unasm/wav.js');
  const w = withSmpl(encodeWav([new Float32Array(100), new Float32Array(100)], 48000), { frames: 100, sampleRate: 48000 }), v = new DataView(w.buffer), id = (o) => String.fromCharCode(...w.slice(o, o + 4));
  assert.equal(id(36), 'smpl'); assert.equal(v.getUint32(40, true), 60, '36-byte header + one 24-byte loop');
  assert.equal(v.getUint32(44 + 8, true), Math.round(1e9 / 48000), 'sample period ns'); assert.equal(v.getUint32(44 + 12, true), 60, 'unity note');
  assert.equal(v.getUint32(44 + 28, true), 1, 'one loop'); assert.equal(v.getUint32(44 + 40, true), 0, 'forward');
  assert.deepEqual([v.getUint32(44 + 44, true), v.getUint32(44 + 48, true), v.getUint32(44 + 56, true)], [0, 99, 0], 'start 0, end last frame (inclusive), forever');
  assert.equal(id(104), 'data'); assert.equal(v.getUint32(4, true), w.length - 8);
});
test('ORBIT2-10 E6: a jam take\'s zip gets -ringout files (untagged) only when it has a ring-out', async () => {
  const { trimChunks, ringOut, stemsZip } = await import('../src/poly/jam.js'); const { unzipStored, parseWav } = await import('../tools/cdp.mjs');
  const lane = () => [[Int16Array.of(1, 2, 3), Int16Array.of(4, 5)], [Int16Array.of(1, 2, 3), Int16Array.of(4, 5)]];
  const take = trimChunks([lane(), lane()], 4), ring = ringOut([[Float32Array.of(0.5, 0.25), Float32Array.of(0, 0)], [Float32Array.of(0, 0), Float32Array.of(0, 0)]], 0, 2);
  const files = unzipStored(stemsZip(take, ['kick', 'snare'], 44100, 'take', { bpm: 120, beats: 4 }, { smpl: true, ring }));
  assert.deepEqual(files.map(f => f.name), ['take/take-1-kick.wav', 'take/take-2-snare.wav', 'take/take-mix-raw.wav', 'take/take-1-kick-ringout.wav', 'take/take-2-snare-ringout.wav', 'take/take-mix-raw-ringout.wav']);
  const [a, r] = [parseWav(files[0].bytes), parseWav(files[3].bytes)];
  assert.deepEqual([a.frames, a.chunks.join()], [4, 'fmt ,acid,smpl,data']); assert.deepEqual([r.frames, r.chunks.join()], [2, 'fmt ,data'], 'ring-out: untagged');
  assert.equal(unzipStored(stemsZip(take, ['k', 's'], 44100, 'take', null, { ring: null })).length, 3, 'no ring-out: no files');
});
test('ORBIT2-10 E3: one Drum-Rack track holds every lane on its own note, one channel', async () => {
  const { hitsToMidi } = await import('../src/poly/export.js'); const { readMidi } = await import('../src/punch/smf.js');
  const lanes = [{ note: 36, ch: 10 }, { note: 38, ch: 3 }, { note: 42, ch: 10 }, { note: 39, ch: 5 }];
  const hits = [0, 1, 2, 3].flatMap(li => [{ li, time: li * 0.125, vel: 1 }, { li, time: 1 + li * 0.125, vel: 0.7 }]);
  const one = readMidi(hitsToMidi(hits, { tempo: 120, lanes, names: ['k', 's', 'h', 'c'], bars: 1, merge: true })), notes = one.tracks.flatMap(t => t.notes);
  assert.equal(one.tracks.filter(t => t.notes.length).length, 1, 'one note track'); assert.equal(notes.length, 8, 'every hit');
  assert.deepEqual([...new Set(notes.map(n => n.ch))], [10], 'lane 1\'s channel'); assert.deepEqual([...new Set(notes.map(n => n.p ?? n.note))].sort(), [36, 38, 39, 42]);
  const per = readMidi(hitsToMidi(hits, { tempo: 120, lanes, names: ['k', 's', 'h', 'c'], bars: 1 }));
  assert.equal(per.tracks.filter(t => t.notes.length).length, 4, 'off: a track per lane, as before'); assert.deepEqual(per.tracks.flatMap(t => t.notes).map(n => n.on).sort(), notes.map(n => n.on).sort(), 'same times');
});
test('ORBIT2-10 E2: dry stems + the delay return add up to the wet mix; stemFiles names and scales them together', async () => {
  const { sumStems, stemFiles } = await import('../src/poly/jam.js'); const { parseWav } = await import('../tools/cdp.mjs');
  // a rendered fixture, in miniature: each lane = its dry sound + its echoes; the echoes of every lane on one return
  const N = 64, sig = (f, a) => Float32Array.from({ length: N }, (_, i) => a * Math.sin(i * f)), echo = (d, k, g) => Float32Array.from(d, (_, i) => i >= k ? d[i - k] * g : 0);
  const dry = [0.3, 0.5, 0.7, 1.1].map((f, i) => [sig(f, 0.4 + i * 0.1), sig(f * 1.3, 0.3)]), echoes = dry.map(([L, R], i) => [echo(L, 5 + i, 0.3), echo(R, 7, 0.3)]);
  const wet = dry.map(([L, R], i) => [L.map((x, j) => x + echoes[i][0][j]), R.map((x, j) => x + echoes[i][1][j])]), ret = sumStems(echoes);
  const a = sumStems(wet), b = sumStems([...dry, ret]); for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) assert.ok(Math.abs(a[c][i] - b[c][i]) < 1e-6, `sample ${i}`);
  const { files, gain } = stemFiles(dry, ['kick', 'snare', 'hat', 'clap'], 48000, 'x/all', { bits: 24, ret, acid: { bpm: 120, beats: 4 }, smpl: true });
  assert.deepEqual(files.map(f => f.name), ['x/all/all-1-kick.wav', 'x/all/all-2-snare.wav', 'x/all/all-3-hat.wav', 'x/all/all-4-clap.wav', 'x/all/all-delay-return.wav', 'x/all/all-mix-raw.wav']);
  const p = parseWav(files[5].data); assert.deepEqual([p.bits, p.sampleRate, p.frames, p.chunks.join()], [24, 48000, N, 'fmt ,acid,smpl,data']);
  assert.ok(gain < 1 && gain > 0, 'the summed mix peaks over 0.98: everything scaled by one gain');
  assert.equal(stemFiles(dry, ['a', 'b', 'c', 'd'], 48000, 'f', { bits: 32, ret }).gain, 1, 'float: as rendered');
});
test('ORBIT2-10 E4: a kit one-shot starts at its onset, ends where it falls silent, at most 2 s with a fade', async () => {
  const { trimOneShot } = await import('../src/poly/jam.js');
  const sr = 100, d = new Float32Array(400); d[10] = 1; d[60] = 0.5; d[61] = 1e-6;   // pre 0.1 s = 10 samples
  const [a] = trimOneShot([d, new Float32Array(400)], sr, { pre: 0.1, maxSec: 2 }); assert.equal(a.length, 51, 'onset → last sample over -90 dBFS (1e-6 is under it)'); assert.equal(a[0], 1, 'onset on sample 0');
  const loud = Float32Array.from({ length: 400 }, () => 0.5), [b] = trimOneShot([loud], sr, { pre: 0.1, maxSec: 2 });
  assert.equal(b.length, 200, 'capped at 2 s'); assert.equal(b[199], 0, 'faded out, no click'); assert.equal(b[100], 0.5);
  assert.equal(trimOneShot([new Float32Array(50)], sr, { pre: 0.1 })[0].length, 1, 'silence: one sample, not an empty file');
  const late = new Float32Array(400); late[10] = 1e-5; late[14] = 0.8; late[20] = 0.1; const [c] = trimOneShot([late], sr, { pre: 0.1 }); assert.deepEqual([c.length, c[0]], [7, Math.fround(0.8)], 'a voice that speaks late still starts on sample 0 (under -80 dBFS before it is dropped)');
  const { readFileSync } = await import('node:fs'), app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8'), kit = app.slice(app.indexOf('async function exportKit('), app.indexOf('/** Open a #p= link'));
  assert.match(kit, /orbits-kit-\$\{li \+ 1\}-\$\{safeName\(names\[li\]\)\}/, 'named like the stems'); assert.match(kit, /c\.send\.gain\.value = 0/, 'no delay'); assert.doesNotMatch(kit, /tagWav|withAcid|withSmpl/, 'tempo-free');
});
test('ORBIT2-10 r1: a jam ring-out is the take\'s own tails (no new hits), one-shots fade at any cut, the kit keeps headroom', async () => {
  const { ringPlan, ringOut, joinRing, logHit, trimOneShot, headroomGain } = await import('../src/poly/jam.js');
  // which hits ring past the end: sr 100, the take ends on frame 1000 (10 s); lane 1 holds a long sample (reach 5 s)
  const reach = (li) => (li === 1 ? 5 : 2), log = [{ li: 0, time: 7 }, { li: 1, time: 6 }, { li: 2, time: 7.5 }, { li: 0, time: 9.503 }, { li: 0, time: 10 }, { li: 3, time: 10.5 }];
  const plan = ringPlan(log, { endFrame: 1000, sampleRate: 100, reach });
  assert.deepEqual(plan.hits.map(h => [h.li, h.time]), [[1, 6], [0, 9.503]], 'silent by the end (7 + 2, 7.5 + 2): out; on the end or after it: the music going on, out');
  assert.ok(plan.lead >= 405 && plan.lead <= 406, 'the render starts 50 ms before the first one'); assert.equal(plan.frames, 151, 'as far past the end as the longest can sound (9.503 + 2: 150.3 frames, rounded up)');
  for (const h of plan.hits) assert.ok(Math.abs(h.at * 100 - (plan.lead - (1000 - h.time * 100))) < 1e-9, 'placed on the take\'s frame grid: the end on frame `lead`');
  assert.ok(Math.abs(((plan.hits[1].at * 100) % 1) - 0.3) < 1e-6, 'a hit keeps its sub-sample place');
  assert.equal(ringPlan([{ li: 0, time: 3 }, { li: 0, time: 10 }], { endFrame: 1000, sampleRate: 100, reach }), null, 'nothing rings past the end: no ring-out');
  // the render → 16-bit lanes like a take: rounded and clamped as the recorder does, all cut after the last sound
  const r = ringOut([[Float32Array.of(9, 9, 0.5, 0.25, 1e-6, 0, 0), Float32Array.of(0, 0, 1.5, -1.5, 0, 0, 0)], [new Float32Array(7), Float32Array.of(0, 0, 0, 0, 0.001, 0, 0)]], 2, 5);
  assert.deepEqual(r.map(l => l.map(c => [...c[0]])), [[[16384, 8192, 0], [32767, -32768, 0]], [[0, 0, 0], [0, 0, 33]]], 'from frame 2, three frames: the last over -90 dBFS on any lane');
  assert.deepEqual(ringOut([[new Float32Array(4), new Float32Array(4)]], 1, 3).map(l => l.map(c => c[0].length)), [[1, 1]], 'silence: one frame');
  // the seam: the ring-out's first frames bent onto the line the take ends on (120 after 110 → 130), the rest untouched
  const rg = joinRing([[[Int16Array.of(100, 110), Int16Array.of(120)], [Int16Array.of(0)]]], [[[Int16Array.of(200, 200, 200, 200, 50)], [Int16Array.of(0, 0, 0)]]], 4);
  assert.deepEqual(rg.map(l => l.map(c => [...c[0]])), [[[130, 148, 165, 183, 50], [0, 0, 0]]], 'no step at the join, the offset gone after n frames');
  // the hit log keeps every hit within `keep` of the newest, in bounded size
  const hl = []; for (let t = 0; t < 300; t++) logHit(hl, { li: 0, time: t }, 10);
  assert.ok(hl.length < 300 && hl.at(-1).time === 299 && hl.some(h => h.time === 289), 'old hits go, the last 10 s stay');
  // E4: a voice that speaks late (onset 5 samples after pre) and is still going where the render ends: faded, no click
  const late = new Float32Array(200); late.fill(0.5, 15); const [c] = trimOneShot([late], 100, { pre: 0.1, maxSec: 2 });
  assert.deepEqual([c.length, c[0], c[c.length - 1]], [185, 0.5, 0], 'cut by the render\'s end: faded out');
  assert.ok(Math.abs(headroomGain([Float32Array.of(0.4, -1.2), Float32Array.of(0.9)], 24) - 0.98 / 1.2) < 1e-6, 'a kit over 0 dBFS: one gain for all its one-shots');
  // wiring: the recorder keeps exactly the take (ring-out off: no tail, as before the phase), a ring-out is rendered only
  // for a take that asked for one; every offline render goes through offline() (no Tone global swap across awaits)
  const { readFileSync } = await import('node:fs'), src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8'), app = src('../src/poly/app.js');
  assert.doesNotMatch(src('../src/poly/jam-worklet.js'), /ring/, 'the recorder records the take, nothing past its end');
  assert.match(app, /if \(data\.frames != null\) jam\.chunks = trimChunks\(jam\.chunks, data\.frames\);/); assert.match(app, /jam\.log = exp\.ring \? \[\] : null/); assert.match(app, /if \(any && jam\.log && data\.frames != null\)/);
  assert.doesNotMatch(app, /T\.Offline\(/, 'one render path'); assert.match(app, /headroomGain\(shots\.flatMap/); assert.match(app, /KIT_PRE \+ KIT_SEC \+ 0\.1/);
  // a chain's static params are set at time 0, not at now + look-ahead (lost on a silent chain: the live lane played the
  // constructor values while the exports and the ring-out played the settings)
  for (const p of ['c\\.drive\\.wet', 'c\\.pan\\.pan', 'c\\.level\\.gain', 'c\\.send\\.gain']) assert.match(app, new RegExp(`holdParam\\(${p},`));
});
test('ORBIT2-10 r2 / r3: a ring-out goes by when each step was due: the next downbeat played early stays out, a pushed last step stays in, restarted ticks change nothing', async () => {
  const { ringPlan } = await import('../src/poly/jam.js'), { liveTick } = await import('../src/poly/export.js');
  // the take ends at 10 s (frame 1000 at sr 100); reach 2 s, the lane's own (a sample) 5 s; step = when its step was due
  const A = { name: 'a' }, B = { name: 'b', r: 5 }, B2 = { name: 'b2', r: 5 }, C = { name: 'c' }, reach = (li, lane) => lane?.r ?? 2;
  const log = [{ li: 2, lane: B, step: 7.5, time: 7.5 }, { li: 2, lane: B2, step: 8.75, time: 8.75 },
    { li: 1, lane: A, step: 9.99, time: 10.02 },   // the take's last step, pushed 30 ms past the end
    { li: 0, lane: A, step: 10, time: 9.995 },     // the next bar's downbeat, humanized 5 ms early
    { li: 0, lane: A, step: 10.2, time: 10.2 },    // after a reset: its tick counts from 0 again, its step is due after the end
    { li: 3, lane: C, step: 9.8, time: 9.8 }];     // a pad just before the end
  const plan = ringPlan(log, { endFrame: 1000, endTime: 10, sampleRate: 100, reach });
  assert.deepEqual(plan.hits.map(h => [h.li, h.step]), [[2, 7.5], [2, 8.75], [1, 9.99], [3, 9.8]],
    'the downbeat due on the end, played 5 ms early, is the next bar: out; the take\'s step pushed 30 ms past the end: in; a hit due after the end, whatever its tick: out');
  assert.deepEqual([plan.lanes[0], plan.lanes[1], plan.lanes[2], plan.lanes[3]], [undefined, A, B2, C], 'each index as it played its last hit of the take');
  assert.ok(Math.abs(plan.hits[2].at * 100 - (plan.lead + 2)) < 1e-9, 'the pushed step lands 2 frames past the end in the render');
  assert.equal(plan.frames, 375, 'the longest reach is the sample lane\'s own: 8.75 s + 5 s = 3.75 s past the end');
  assert.equal(ringPlan([{ li: 0, lane: A, step: 10, time: 9.9 }], { endFrame: 1000, endTime: 10, sampleRate: 100, reach }), null, 'only the next bar: no ring-out');
  assert.equal(ringPlan([{ li: 0, lane: A, step: 10, time: 9.99 }], { endFrame: 1001, endTime: 10, sampleRate: 100, reach }), null, 'the exact end time decides, not the frame-rounded end');
  assert.equal(ringPlan([{ li: 0, lane: A, step: 9.99, time: 9.99 }], { endFrame: 1000, endTime: 10, sampleRate: 100, reach }).hits.length, 1, 'a step due just before the end (over half a frame) is the take\'s');
  // the scheduler hands every early part its own step's tick (a lane pushed 20 ms early: its step on tick P sounds from ~P - 34)
  const m = new Machine(); m.lanes.forEach(l => { l.clear(); l.setLength(4); l.setRatio(ratioIndexOf(1)); }); const l = m.lanes[0]; l.hits[1] = true; l.setOffset(-20);
  const early = [], ahead = []; for (let t = 0; t < P + 8; t++) liveTick(m, t, ahead, { tickSec: TICK }).forEach((r, li) => { for (const h of r.early) early.push({ li, t, tick: h.tick }); });
  assert.ok(early.length > 0 && early.every(e => e.tick === P && e.t < P), 'early parts are tagged with their step (tick P), played before it');
  // wiring: the scheduler passes when each hit's step is due, the log keeps it, every posted end is remembered and decides
  const { readFileSync } = await import('node:fs'), app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  assert.match(app, /for \(const h of soon\) \{ const e = play\(li, lane, h, time \+ \(h\.tick - t\) \* ts\)/); assert.match(app, /for \(const h of hits\) play\(li, lane, h, time\)/);
  assert.match(app, /step: step \?\? time,/); assert.match(app, /renderRing\(jam\.log, jam\.ramps, Math\.round\(jam\.startTime \* jam\.sr\) \+ data\.frames, jam\.endTime\)/);
  assert.equal((app.match(/jam\.endTime = [^;]+; jam\.node\.port\.postMessage\(\{ end: (jam\.endTime|time) \}\)/g) || []).length, 3, 'all three ends are remembered: a stop, the clock on the stop tick, the cap');
  assert.doesNotMatch(app, /postMessage\(\{ end: (?!jam\.endTime|time)/, 'no end is posted without being remembered');
  assert.match(app, /headroomGain\(shots\.flatMap\(s => s\.chans\), exp\.bits\)/, 'the kit gain follows the chosen bits (32f: as rendered)');
  assert.match(app, /clearTimeout\(timer\)/, 'the download timeout is cleared');
});
test('ORBIT2-10 r4: an early part\'s step gets the time its tick really came at: a tempo move while a take closes keeps the next downbeat out', async () => {
  const { ringPlan, pendingSteps } = await import('../src/poly/jam.js'), { liveTick } = await import('../src/poly/export.js');
  // hits wait by their step's tick and get its time when it comes; a tick passed without coming drops its hits
  const pd = pendingSteps(), a = { step: 1 }, b = { step: 2 }, c = { step: 3 }, d = { step: 4 };
  pd.add(50, a); pd.add(100, b); pd.add(100, c); pd.add(200, d); pd.settle(50, 1.5);
  assert.deepEqual([a.step, pd.size], [1.5, 2], 'tick 50 came: its hit gets the time it came at');
  pd.settle(150, 9); assert.deepEqual([b.step, c.step, pd.size], [2, 3, 1], 'tick 100 never came (a clock snap jumped it): its hits keep their estimate and go');
  pd.clear(); pd.settle(200, 9); assert.deepEqual([d.step, pd.size], [4, 0], 'a restart from tick 0 clears it: the old ticks never come');
  // the scheduler as app.js runs it: a kick pushed 30 ms early on every bar line, a snare pushed 30 ms early on beat 4;
  // the take ends on the bar-2 line (tick E); the tempo drops 86 → 80 bpm after the kick's early part, before its tick
  const m = new Machine(); m.lanes.forEach(l => { l.clear(); l.setLength(4); l.setRatio(ratioIndexOf(1)); });
  m.lanes[0].hits[0] = true; m.lanes[1].hits[3] = true; m.lanes[0].setOffset(-30); m.lanes[1].setOffset(-30);
  const E = 4 * P, sr = 48000, ahead = [], log = [], est = [], pend = pendingSteps(), tsAt = (t) => 60 / (t < E - 20 ? 86 : 80) / P;
  let time = 0, endTime = null;
  for (let t = 0; t <= E + 40; t++) {
    const ts = tsAt(t); if (t === E) endTime = time;   // the clock posts the end on the stop tick, at the time it came at
    pend.settle(t, time);
    liveTick(m, t, ahead, { tickSec: ts }).forEach(({ ev, hits, early }, li) => {
      for (const h of early) { const e = { li, lane: m.lanes[li], time: time + h.dt, step: time + (h.tick - t) * ts }; log.push(e); est.push({ ...e }); pend.add(h.tick, e); }
      if (ev) for (const h of hits) { const e = { li, lane: m.lanes[li], time: time + h.dt, step: time }; log.push(e); est.push({ ...e }); }
    });
    time += ts;
  }
  const opts = { endFrame: Math.round(endTime * sr), endTime, sampleRate: sr, reach: () => 2 }, kick = (p) => p.hits.filter(h => h.li === 0 && h.time > endTime - 0.05);
  assert.ok(est.some(h => h.li === 0 && h.step < endTime - 1e-3), 'the kick\'s step estimated at 86 bpm lands over 1 ms before the end that came at 80');
  assert.equal(kick(ringPlan(est, opts)).length, 1, 'by the estimate alone the next bar\'s downbeat would ring out');
  const plan = ringPlan(log, opts);
  assert.equal(kick(plan).length, 0, 'settled: the downbeat due on the end is the next bar\'s, out of the ring-out');
  assert.ok(plan.hits.some(h => h.li === 1), 'the take\'s own snare, pushed early on beat 4, rings on');
  // wiring: the scheduler settles every tick (before a quiet tick returns), hands each early part to `pending`, clears it
  // on a restart from tick 0 (Play, reset); hitSound returns the entry it logged
  const { readFileSync } = await import('node:fs'), app = readFileSync(new URL('../src/poly/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(pending\.size\) pending\.settle\(t, time\);[^]*if \(liveQuiet\(/);
  assert.match(app, /const e = play\(li, lane, h, time \+ \(h\.tick - t\) \* ts\); if \(e\) pending\.add\(h\.tick, e\);/);
  assert.equal((app.match(/early\.length = 0; pending\.clear\(\);/g) || []).length, 2, 'Play and the reset button restart the ticks');
  assert.match(app, /return logged;\n\}/);
});
