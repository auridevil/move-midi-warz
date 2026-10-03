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
test('advance walks the lane, respects mute and probability', () => {
  const l = new Lane('hat', { length: 3 }); l.setEuclid(3);
  const out = [0, 1, 2, 3].map(() => l.advance(() => 0.5)); assert.deepEqual(out.map(o => o.index), [0, 1, 2, 0]); assert.ok(out.every(o => o.hit));
  l.prob = 0.3; assert.equal(l.advance(() => 0.9).hit, false); l.prob = 1; l.muted = true; assert.equal(l.advance().hit, false);
  l.swing = 0.25; l.muted = false; l.pos = 1; assert.equal(l.advance().swung, 0.25); assert.equal(l.advance().swung, 0);
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
  p.follow = 'tempo'; for (let i = 0; i < 25; i++) p.receive([0xF8], i * 20.8333); p.receive([0xFA], 0); assert.deepEqual(got, [120], '24 ticks in 500 ms = 120 bpm; start ignored in tempo mode');
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
  h.commit('a', 0); h.commit('b', 1000); h.commit('c', 1200); h.commit('d', 3000);   // b → c within 500 ms: one step
  assert.equal(h.undo(), 'c'); assert.equal(h.undo(), 'a', 'the knob turn b→c undoes in one go'); assert.equal(h.undo(), null);
  assert.equal(h.redo(), 'c'); h.commit('e', 9000); assert.equal(h.canRedo, false); assert.equal(h.undo(), 'c');
  assert.equal(h.commit('c', 9999), false, 'no change, no step');
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
  assert.deepEqual(names, ['take/1-kick.wav', 'take/2-snare.wav', 'take/3-hat-x.wav', 'take/4-demo.wav', 'take/mix.wav']);
});
test('library: named setups, overwrite by name, rename, delete, migrate the old single save, storage full', async () => {
  const { Library, LIB_KEY } = await import('../src/poly/library.js'); const mem = new Map(); const store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  mem.set('midi-warz.poly.saved.v1', JSON.stringify({ m: { lanes: [] }, tempo: 99, t: 1 }));
  const lib = new Library(store); assert.equal(lib.list()[0].name, 'saved', 'old save migrated'); assert.equal(lib.list()[0].tempo, 99);
  const a = lib.save('Dub 1', { m: { x: 1 }, tempo: 120 }, 10); const b = lib.save('', { m: { x: 2 }, tempo: 90 }, 20); assert.equal(b.name, 'pattern 3');
  assert.deepEqual(lib.list().map(e => e.name), ['pattern 3', 'Dub 1', 'saved'], 'newest first');
  const a2 = lib.save('dub 1 ', { m: { x: 3 }, tempo: 121 }, 30); assert.equal(a2.id, a.id, 'same name (any case) overwrites'); assert.equal(lib.items.length, 3); assert.equal(lib.get(a.id).m.x, 3);
  assert.equal(lib.rename(b.id, 'dub 1'), false, 'taken'); assert.equal(lib.rename(b.id, 'Night'), true); assert.equal(lib.get(b.id).name, 'Night');
  lib.overwrite(b.id, { m: { x: 9 } }, 40); assert.equal(lib.get(b.id).m.x, 9); assert.equal(lib.remove(a.id), true);
  const again = new Library(store); assert.deepEqual(again.list().map(e => e.name), ['Night', 'saved'], 'persisted'); assert.ok(mem.get(LIB_KEY));
  const full = new Library({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } }); assert.equal(full.save('x', { m: {} }), null); assert.equal(full.items.length, 0, 'rolled back');
});
