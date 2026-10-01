import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MoveDevice } from 'movewire';
import { MoveKeymap, RecordingSink, DomKeySink, keyByName, KEYS, PRESETS, ROLE_COLOR } from '../src/index.js';

const mkDevice = () => { const d = new MoveDevice({ send() {} }); d.inControl = true; return d; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('key lookup is tolerant', () => {
  assert.equal(keyByName('w').code, 'KeyW'); assert.equal(keyByName('W').code, 'KeyW'); assert.equal(keyByName('KeyW').keyCode, 87);
  assert.equal(keyByName('ctrl').code, 'ControlLeft'); assert.equal(keyByName('left').kbd, 263); assert.equal(keyByName('1').code, 'Digit1');
  assert.equal(keyByName(',').code, 'Comma'); assert.equal(keyByName('escape').kbd, 256); assert.equal(keyByName('nope'), null);
  assert.equal(KEYS.ArrowUp.kbd, 265); assert.equal(KEYS.ShiftLeft.kbd, 340); assert.equal(KEYS.F1.kbd, 290);
});

test('pad press/release becomes key down/up; hard hits add the run key', () => {
  const d = mkDevice(), s = new RecordingSink();
  new MoveKeymap(d, s, { pads: { 0: 'KeyW', 1: ['ShiftLeft', 'KeyA'] }, hardHit: { velocity: 100, keys: 'ShiftLeft' } });
  d.receive([0x90, 68, 50]); d.receive([0x80, 68, 0]);
  assert.deepEqual(s.log, [['down', 'KeyW'], ['up', 'KeyW']]); s.log.length = 0;
  d.receive([0x90, 68, 120]); d.receive([0x90, 68, 0]);
  assert.deepEqual(s.log, [['down', 'ShiftLeft'], ['down', 'KeyW'], ['up', 'KeyW'], ['up', 'ShiftLeft']]); s.log.length = 0;
  d.receive([0x90, 69, 60]); d.receive([0x80, 69, 0]);
  assert.deepEqual(s.log, [['down', 'ShiftLeft'], ['down', 'KeyA'], ['up', 'KeyA'], ['up', 'ShiftLeft']]);
  d.receive([0x90, 70, 60]); assert.equal(s.log.length, 4, 'unmapped pad does nothing');
});

test('buttons and steps map too; releaseAll lifts everything', () => {
  const d = mkDevice(), s = new RecordingSink();
  const km = new MoveKeymap(d, s, { buttons: { play: 'Enter' }, steps: { 3: 'Digit4' } });
  d.receive([0xB0, 85, 127]); d.receive([0x90, 19, 100]);
  assert.deepEqual(s.log, [['down', 'Enter'], ['down', 'Digit4']]);
  km.releaseAll(); assert.deepEqual(s.log.slice(2).sort(), [['up', 'Digit4'], ['up', 'Enter']].sort());
});

test('encoder ticks tap a key and extend the hold on repeated ticks', async () => {
  const d = mkDevice(), s = new RecordingSink();
  new MoveKeymap(d, s, { wheel: { cw: 'ArrowRight', ccw: 'ArrowLeft', tapMs: 30 } });
  d.receive([0xB0, 14, 1]); d.receive([0xB0, 14, 1]); // two clockwise ticks in a row
  assert.deepEqual(s.log, [['down', 'ArrowRight']]);
  await sleep(60);
  assert.deepEqual(s.log, [['down', 'ArrowRight'], ['up', 'ArrowRight']]);
  d.receive([0xB0, 14, 127]); await sleep(50);
  assert.deepEqual(s.log.slice(2), [['down', 'ArrowLeft'], ['up', 'ArrowLeft']]);
});

test('mouse turn uses relative motion', () => {
  const d = mkDevice(), s = new RecordingSink();
  new MoveKeymap(d, s, { encoders: { 0: { mouse: 'x', scale: 5 } } });
  d.receive([0xB0, 71, 2]); d.receive([0xB0, 71, 127]);
  assert.deepEqual(s.log, [['mouse', 10, 0], ['mouse', -5, 0]]);
});

test('learn mode assigns the next pressed control', () => {
  const d = mkDevice(), s = new RecordingSink();
  const km = new MoveKeymap(d, s, {});
  const learned = []; km.addEventListener('learned', (e) => learned.push(e.detail));
  km.startLearn(); d.receive([0x90, 75, 100]); // pad 7 pressed while learning: captured, not sent
  assert.equal(s.log.length, 0); assert.equal(km.learnKey('KeyE', 'use'), true);
  assert.deepEqual(learned[0].source, { type: 'pad', id: 7 }); assert.equal(km.mapping.pads[7].keys, 'KeyE');
  d.receive([0x90, 75, 100]); assert.deepEqual(s.log, [['down', 'KeyE']]);
  assert.equal(km.learnKey('KeyQ'), false, 'nothing to learn now');
});

test('LEDs follow roles (closest palette colour to the screen colour) and stay put while pressed', () => {
  const sent = []; const d = new MoveDevice({ send: (b) => sent.push([...b]) }); d.inControl = true;
  const km = new MoveKeymap(d, new RecordingSink(), { pads: { 0: { keys: 'ControlLeft', role: 'fire' }, 1: { keys: 'KeyQ', hex: '#00ff00' } }, buttons: { play: { keys: 'Enter', role: 'menu' } } });
  assert.ok(sent.some(m => m[0] === 0x90 && m[1] === 68 && m[2] === ROLE_COLOR.fire), 'fire pad in the fire colour');
  assert.equal(km.colorFor({ hex: '#00ff00' }), 126, 'explicit hex maps to the palette green');
  assert.ok(sent.some(m => m[0] === 0xB0 && m[1] === 85 && m[2] === ROLE_COLOR.menu), 'play button in the menu colour');
  sent.length = 0; d.receive([0x90, 68, 100]); d.receive([0x80, 68, 0]); assert.equal(sent.length, 0, 'no LED change on press/release');
  assert.equal(km.hexFor({ role: 'fire' }), '#fb7185');
});

test('DomKeySink dispatches keydown/keyup with code, key and legacy keyCode', () => {
  const got = [];
  class FakeKeyboardEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } }
  const target = { dispatchEvent: (e) => got.push(e) };
  const sink = new DomKeySink(target, { Ctor: FakeKeyboardEvent, MouseCtor: null });
  sink.down(KEYS.ArrowLeft); sink.up(KEYS.ArrowLeft);
  assert.equal(got[0].type, 'keydown'); assert.equal(got[0].code, 'ArrowLeft'); assert.equal(got[0].keyCode, 37); assert.equal(got[0].which, 37); assert.equal(got[1].type, 'keyup');
});

test('doom preset is complete and every action resolves', () => {
  const m = PRESETS.doom;
  for (const bucket of ['pads', 'steps', 'buttons']) for (const [id, a] of Object.entries(m[bucket])) assert.ok(keyByName(a.keys), `${bucket} ${id} -> ${a.keys}`);
  assert.equal(Object.keys(m.pads).length, 32);
  assert.equal(m.pads[0].keys, 'ControlLeft'); assert.equal(m.pads[25].keys, 'ArrowUp');
});
