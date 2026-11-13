// ORBIT2-15 sharing (I2–I5): the share payload's lineage (title / from) round-trips and stays compatible with links made
// before it (both ways), Seed of the Day is one beat per UTC day, the ring shapes the card and the gallery draw, and the
// library's cached thumbnails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../src/poly/lanes.js';
import { encodeShare, decodeShare } from '../src/poly/export.js';
import { utcDay, daySeed, dayLabel, seedOfDay, ringShapes, shapesOf } from '../src/poly/share.js';
import { Library, LIB_KEY } from '../src/poly/library.js';

// a link as the page made it before lineage: { v: 1, tempo, m } deflated, base64url (export.js before ORBIT2-15)
const b64u = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deflate = async (o) => new Uint8Array(await new Response(new Blob([JSON.stringify(o)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
const inflate = async (str) => JSON.parse(await new Response(new Blob([Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64')]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
/** The decoder before ORBIT2-15, verbatim in what it checks: an old page opening a new link. */
const oldDecode = async (str) => { const o = await inflate(str); if (o?.v !== 1 || !o.m?.lanes) throw new Error('not an Orbits link'); return o; };

test('I5 a share link carries its title and lineage (from) and round-trips them', async () => {
  const m = new Machine(); m.lanes[0].setEuclid(3);
  const back = await decodeShare(await encodeShare(m.toJSON(), 128, { title: 'night bus', from: 'seed of the day · 2026-11-13' }));
  assert.equal(back.title, 'night bus'); assert.equal(back.from, 'seed of the day · 2026-11-13'); assert.equal(back.tempo, 128);
  assert.deepEqual(back.m.lanes[0].hits, m.toJSON().lanes[0].hits, 'the pattern is unchanged');
  assert.equal(back.v, 1, 'same version: lineage is optional fields, not a new format');
  const long = await decodeShare(await encodeShare(m.toJSON(), 120, { title: 'x'.repeat(200), from: '   ' }));
  assert.equal(long.title.length, 60, 'a title is capped'); assert.equal(long.from, null, 'a blank from is no lineage');
  const none = await decodeShare(await encodeShare(m.toJSON(), 120));
  assert.equal(none.title, null); assert.equal(none.from, null);
  assert.ok(!('title' in await inflate(await encodeShare(m.toJSON(), 120))), 'no meta, no extra bytes in the link');
});

test('I5 old links still open, and an old page still opens a new link', async () => {
  const m = new Machine(); m.lanes[1].setEuclid(5);
  const old = b64u(await deflate({ v: 1, tempo: 97, m: m.toJSON() }));
  const o = await decodeShare(old);
  assert.equal(o.tempo, 97); assert.equal(o.title, null); assert.equal(o.from, null); assert.deepEqual(o.m.lanes[1].hits, m.toJSON().lanes[1].hits);
  const fresh = await oldDecode(await encodeShare(m.toJSON(), 97, { title: 'a', from: 'b' }));
  assert.equal(fresh.tempo, 97); assert.deepEqual(fresh.m.lanes[1].hits, m.toJSON().lanes[1].hits);
  const odd = b64u(await deflate({ v: 1, tempo: 90, m: m.toJSON(), title: 42, from: { evil: true } }));
  const d = await decodeShare(odd); assert.equal(d.title, null, 'a non-string title is dropped'); assert.equal(d.from, null);
  await assert.rejects(decodeShare(b64u(await deflate({ v: 2, tempo: 90, m: m.toJSON() }))), /not an Orbits link/);
});

test('I5 Seed of the Day: one seed per UTC day, stable for a date, different across dates', () => {
  assert.equal(utcDay(new Date('2026-11-13T23:30:00Z')), '2026-11-13');
  assert.equal(utcDay(new Date('2026-11-13T23:30:00-05:00')), '2026-11-14', 'the UTC date, not the local one');
  assert.equal(dayLabel('2026-11-13'), '13 Nov');
  const a = seedOfDay('2026-11-13'), b = seedOfDay('2026-11-13'), c = seedOfDay('2026-11-14');
  assert.deepEqual(a, b, 'same day, same beat (pattern, tempo, seed)');
  assert.ok(a.seed >= 1 && a.seed <= 9999 && Number.isInteger(a.seed)); assert.ok(a.tempo >= 84 && a.tempo <= 128);
  assert.equal(a.title, 'seed of the day · 2026-11-13'); assert.equal(a.m.lanes.length, 4);
  assert.notEqual(a.seed, c.seed); assert.notDeepEqual(a.m, c.m, 'the next day is another beat');
  const seeds = new Set(); for (let d = 1; d <= 60; d++) seeds.add(daySeed(utcDay(new Date(Date.UTC(2026, 0, d)))));
  assert.ok(seeds.size >= 58, `60 days → ${seeds.size} seeds: almost never the same twice`);
  assert.ok(seedOfDay('2026-11-13').m.lanes.some(l => l.hits.some(Boolean)), 'the day has a beat in it');
});

test('I4 ring shapes: loop length, played hits (euclid included), accents; old saves through Machine.from', () => {
  const m = new Machine(); m.lanes.forEach(l => l.clear()); m.lanes[0].setLength(8); m.lanes[0].hits[0] = m.lanes[0].hits[3] = true; m.lanes[0].accents[3] = true; m.lanes[2].setEuclid(3);
  const s = ringShapes(m);
  assert.equal(s.length, 4); assert.deepEqual(s[0], { len: 8, hits: [0, 3], acc: [3], muted: false });
  assert.equal(s[2].hits.length, 3, 'euclid hits are drawn as they play');
  assert.deepEqual(shapesOf(m.toJSON()), s); assert.deepEqual(shapesOf(null), []); assert.deepEqual(shapesOf({ lanes: 'junk' }), []);
});

test('I4 the library caches a thumbnail per entry; a re-save drops it; a full store never loses a save to it', () => {
  const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const lib = new Library(store), e = lib.save('one', { m: new Machine().toJSON(), tempo: 100 });
  assert.equal(lib.setThumb(e.id, 'data:image/png;base64,AAA'), true);
  assert.equal(new Library(store).get(e.id).thumb, 'data:image/png;base64,AAA', 'kept in the stored entry');
  const again = lib.overwrite(e.id, { m: new Machine().toJSON(), tempo: 110 });
  assert.equal(again.thumb, undefined, 'a new pattern: the old thumbnail goes'); assert.ok(!('thumb' in JSON.parse(mem.get(LIB_KEY))[0]));
  const full = { getItem: store.getItem, setItem: (k, v) => { if (v.includes('data:image')) throw new Error('QuotaExceededError'); mem.set(k, v); } };
  const lib2 = new Library(full), e2 = lib2.items[0];
  assert.equal(lib2.setThumb(e2.id, 'data:image/png;base64,BBB'), false); assert.equal(lib2.get(e2.id).thumb, undefined, 'not kept in memory either');
  assert.ok(lib2.save('two', { m: new Machine().toJSON(), tempo: 90 }), 'the next save still fits');
});
