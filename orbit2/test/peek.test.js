// RD-12 round 1: the peek's timing (peek.js) on a clock moved by hand. A knob a hand holds peeks while held and PEEK_MS
// after the let-go; a kit change borrows the peek for PEEK_MS (over a held knob too); nothing ever stays on screen. The
// two sequences the panel found stuck (verifier: a let-go then a kit change; architect: a kit change under a held knob,
// then the let-go) are here as they were played on the Move; the browser half is kit-check.mjs PEEK.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Peek } from '../src/poly/peek.js';

const MS = 400;
/** setTimeout / clearTimeout over a list, run in time order by tick(ms). */
function clock() {
  let now = 0, id = 0; const q = new Map();
  return {
    setTimeout(fn, ms) { q.set(++id, { at: now + ms, fn }); return id; }, clearTimeout(i) { q.delete(i); },
    tick(ms) {
      const end = now + ms;
      for (;;) { let n = null; for (const [i, t] of q) if (t.at <= end && (!n || t.at < n[1].at)) n = [i, t]; if (!n) break; q.delete(n[0]); now = n[1].at; n[1].fn(); }
      now = end;
    },
  };
}
const setup = () => { const t = clock(), p = new Peek({ ms: MS, timers: t }); return { t, p, says: () => (p.shows?.kit ? `kit · ${p.shows.kit}` : p.shows ? `knob ${p.shows.slot + 1}` : '—') }; };

test('RD-12 the peek: a knob held shows while held and PEEK_MS after the let-go (RD-5, unchanged)', () => {
  const { t, p, says } = setup();
  p.at(0, 'touch'); t.tick(3000); assert.equal(says(), 'knob 1');
  p.off('touch'); t.tick(MS - 1); assert.equal(says(), 'knob 1'); t.tick(1); assert.equal(says(), '—');
  // two hands on it (a touch and a drag): it waits for the last one
  p.at(2, 'touch'); p.at(2, 'drag'); p.off('touch'); t.tick(MS * 2); assert.equal(says(), 'knob 3'); p.off('drag'); t.tick(MS); assert.equal(says(), '—');
});

test('RD-12 the peek: a kit change alone shows "kit · name" for PEEK_MS (the select, ⌘K, the Move tap)', () => {
  const { t, p, says } = setup();
  p.kitChange('Space'); assert.equal(says(), 'kit · Space'); t.tick(MS - 1); assert.equal(says(), 'kit · Space'); t.tick(1); assert.equal(says(), '—');
  // a second change inside the first's PEEK_MS: the newest name, PEEK_MS from it
  p.kitChange('Trap'); t.tick(200); p.kitChange('Gabber'); t.tick(MS - 1); assert.equal(says(), 'kit · Gabber'); t.tick(1); assert.equal(says(), '—');
});

test('RD-12 round 1 (verifier): a let-go, then a kit change inside its PEEK_MS: the kit shows, then nothing stays', () => {
  const { t, p, says } = setup();
  p.at(0, 'touch'); t.tick(150); p.off('touch'); t.tick(50);   // touch encoder 1, let go, Shift + ▶ 50 ms later
  p.kitChange('Industrial'); assert.equal(says(), 'kit · Industrial', 'the newest thing the hands did');
  t.tick(MS); assert.equal(says(), '—', 'the knob\'s hide was not cancelled (it stayed at +3 s before)');
  t.tick(3000); assert.equal(says(), '—');
});

test('RD-12 round 1 (architect): a kit change under a held knob borrows the peek; the let-go hides it on time', () => {
  const { t, p, says } = setup();
  p.at(0, 'touch'); t.tick(100);
  p.kitChange('Wood & skin'); assert.equal(says(), 'kit · Wood & skin', 'over a held knob too');
  t.tick(100); p.off('touch');   // the finger lifts during the kit's PEEK_MS
  t.tick(MS - 100); assert.equal(says(), 'knob 1', 'the kit\'s time is up: the knob, PEEK_MS after its let-go');
  t.tick(100); assert.equal(says(), '—', 'and nothing stays (the kit stayed at +4.5 s before)');
});

test('RD-12 the peek: a hand that comes to a knob takes the peek back from a kit change at once', () => {
  const { t, p, says } = setup();
  p.kitChange('Latin'); t.tick(100); p.at(4, 'turn'); assert.equal(says(), 'knob 5');
  p.off('turn'); t.tick(MS); assert.equal(says(), '—', 'the kit\'s timer went with it: no late "kit · Latin"');
  // keyboard focus on a knob holds its peek; a kit change (the Move's Shift + ▶) borrows it, then the focus has it back
  p.at(1, 'focus'); p.kitChange('Boombox'); assert.equal(says(), 'kit · Boombox'); t.tick(MS); assert.equal(says(), 'knob 2');
  p.off('focus'); t.tick(MS); assert.equal(says(), '—');
});

test('RD-12 the peek paints on every change it makes (its own timers included)', () => {
  const t = clock(); let n = 0; const p = new Peek({ ms: MS, timers: t, paint: () => n++ });
  p.kitChange('Space'); t.tick(MS); p.at(0, 'touch'); p.off('touch'); t.tick(MS);
  assert.equal(n, 4, 'kit on, kit off, the touch, the knob gone');
});
