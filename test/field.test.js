import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Field, mulberry32, N } from '../src/chaos/field.js';

test('energy spreads to neighbours and decays', () => {
  const f = new Field(mulberry32(1)); f.params.density = 0; f.inject(9, 1);
  f.step(); assert.ok(f.energy[9] < 1 && f.energy[9] > 0.5); assert.ok(f.energy[10] > 0 && f.energy[1] > 0 && f.energy[17] > 0); assert.equal(f.energy[31], 0);
  const e1 = f.totalEnergy(); for (let i = 0; i < 30; i++) f.step(); assert.ok(f.totalEnergy() < e1 * 0.2, 'decays');
});
test('density 0 never fires, density 1 with full energy fires', () => {
  const f = new Field(mulberry32(2)); f.params.density = 0; f.inject(0, 1); assert.equal(f.step().length, 0);
  const g = new Field(mulberry32(3)); g.params.density = 1; g.params.entropy = 0; for (let i = 0; i < N; i++) g.inject(i, 1);
  const fires = g.step(); assert.ok(fires.length > N * 0.7, `fired ${fires.length}`); assert.ok(fires.every(x => x.note >= 24 && x.note <= 96 && x.vel > 0 && x.family));
});
test('pinned cells stay charged; gate silences steps; reset clears', () => {
  const f = new Field(mulberry32(4)); f.params.density = 0; f.pin(5); for (let i = 0; i < 20; i++) f.step(); assert.ok(f.energy[5] >= 1);
  f.params.density = 1; f.gate.fill(0); f.inject(6, 1); assert.equal(f.step().length, 0, 'gate closed');
  f.reset(); assert.equal(f.totalEnergy(), 0); assert.equal(f.pinned.size, 0);
});
test('deterministic with a seeded rng', () => {
  const a = new Field(mulberry32(7)), b = new Field(mulberry32(7)); a.params.density = b.params.density = 0.8; a.inject(3, 1); b.inject(3, 1);
  const ra = [], rb = []; for (let i = 0; i < 10; i++) { ra.push(a.step().map(x => x.cell + ':' + x.note).join(',')); rb.push(b.step().map(x => x.cell + ':' + x.note).join(',')); }
  assert.deepEqual(ra, rb);
});
