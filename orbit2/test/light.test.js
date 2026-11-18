// RD-8 light on the canvas (DECISION §2 "Read-only light on the canvas", "Arc labels", "The countdown", "First visit"):
// the sun's count, the cycle caption, the crawl's progress, the words on the arc and the label, Yuki's ladder, the moons'
// places, the straight caption, and the static half (read-only, type sizes and weights, reduced motion, the app's
// sources, the pill without the countdown).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beatsLeft, cycleBeats, cycleLine, genProgress, barsToEvolve, genWords, laneLabel, arcRoom, labelOffset, EXTRAS_MAX_STEPS, lightLevel, lightPlan, moonAngle, captionLines, captionFit, captionBoxes, MOON_DEG, LABEL_PX, NUMBER_PX, SUN_PX, CAPS_PX, LABEL_FONT, NUMBER_FONT, SUN_FONT, SUN_SMALL_FONT, LIGHT_ROOM, HINT_MS, LABEL_DEG, ringGeo, ringBox } from '../src/poly/scene.js';
import { pillText } from '../src/poly/pills.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
/** Space Grotesk 500 caps at 13 px tracked .14 em: about 8.3 px a glyph (Chrome measures "EVOLVE · DICE · COUPLING NEXT ·
 *  GRAVITY" at 248.5 px untracked, 6.4 a glyph; the browser measures on the page, the test uses this). */
const px = (text, size = LABEL_PX) => [...text].length * (size * 0.5 + 0.14 * size);

test('RD-8 the sun: beats until everything meets, 1 on the last beat; stopped, the cycle\'s length in beats', () => {
  assert.deepEqual([0, 24, 48, 72, 96].map(t => beatsLeft(t, 120, 24)), [5, 4, 3, 2, 1], 'the 3 vs 4 vs 5 demo counts 5 … 1');
  assert.equal(beatsLeft(119.5, 120, 24), 1, 'the heard tick is fractional'); assert.equal(beatsLeft(120, 120, 24), 5, 'the line: the whole cycle again');
  assert.equal(beatsLeft(96 * 3 + 1, 96 * 4, 24), 4); assert.equal(beatsLeft(-5, 96, 24), 1, 'never below 1');
  assert.equal(cycleBeats(96 * 4, 24), 16); assert.equal(cycleBeats(120, 24), 5); assert.equal(cycleBeats(10, 24), 1);
});

test('RD-8 the cycle caption is straight type: bars while it plays, the length stopped, beats only when not whole bars', () => {
  assert.equal(cycleLine(0, 96 * 16, 96, 24, false), 'cycle · 16 bars'); assert.equal(cycleLine(0, 96, 96, 24, false), 'cycle · one bar');
  assert.equal(cycleLine(96 * 6 + 10, 96 * 16, 96, 24, true), 'cycle · bar 7 of 16'); assert.equal(cycleLine(96 * 16 - 1, 96 * 16, 96, 24, true), 'cycle · bar 16 of 16');
  assert.equal(cycleLine(50, 96, 96, 24, true), 'cycle · every bar');
  assert.equal(cycleLine(30, 120, 96, 24, true), 'cycle · 5 beats', 'not whole bars: said in beats, once (the sun counts them)'); assert.equal(cycleLine(0, 120, 96, 24, false), 'cycle · 5 beats');
  assert.equal(cycleLine(0, 0, 96, 24, true), '');
});

test('RD-8 the crawl moves continuously toward the next mutation and starts again on the line; reduced motion steps per beat', () => {
  assert.equal(genProgress(0, 4, 0), 0); assert.equal(genProgress(1, 4, 0.5), 0.375); assert.ok(Math.abs(genProgress(3, 4, 0.999) - 0.99975) < 1e-9);
  assert.equal(genProgress(4, 4, 0), 0, 'the line it mutates on: from the start'); assert.equal(genProgress(5, 4, 0.25), 0.3125);
  // just after the scheduled line the ear is still in the old bar (frac a little negative): no jump back
  assert.ok(Math.abs(genProgress(4, 4, -0.02) - genProgress(3, 4, 0.98)) < 1e-9, 'continuous across the line');
  assert.ok(Math.abs(genProgress(1, 1, 0.3) - 0.3) < 1e-9, 'every bar'); assert.equal(genProgress(7, 0, 0.5), 0.5, 'every 0 reads as 1');
  // reduced motion: once per beat of a 4-beat bar
  assert.equal(genProgress(0, 4, 0.1, 4), 0); assert.equal(genProgress(0, 4, 0.26, 4), 0.0625); assert.equal(genProgress(0, 4, 0.99, 4), 0.1875); assert.equal(genProgress(1, 4, -0.02, 4), 0.25, 'never a step back');
  assert.deepEqual([0, 1, 3, 4, 5].map(b => barsToEvolve(b, 4)), [4, 3, 1, 4, 3]); assert.equal(barsToEvolve(2, 1), 1);
});

test('RD-8 the arc\'s words name what is on, in order, without numbers; the detail goes at rung 4', () => {
  assert.equal(genWords({ evolve: false, dice: null, coupling: 'off', gravity: 0 }), '');
  assert.equal(genWords({ evolve: true, dice: 4127, coupling: 'next', gravity: 40 }), 'EVOLVE · DICE · COUPLING NEXT · GRAVITY');
  assert.equal(genWords({ evolve: true, dice: 4127, coupling: 'next', gravity: 40 }, false), 'EVOLVE · DICE · COUPLING', 'Yuki: "coupling 1 → 2" becomes "coupling", gravity goes');
  assert.equal(genWords({ evolve: true, coupling: 'matrix' }), 'EVOLVE · COUPLING MATRIX'); assert.equal(genWords({ evolve: true, coupling: 'matrix' }, false), 'EVOLVE · COUPLING');
  assert.ok(px('EVOLVE · DICE · COUPLING MATRIX · GRAVITY') * 1.1 <= arcRoom(315 + 36), 'the longest fits the band over 630 px rings');
  assert.equal(genWords({ evolve: false, dice: 9, coupling: 'off', gravity: 50 }), 'DICE', 'gravity belongs to evolve');
  assert.doesNotMatch(genWords({ evolve: true, dice: 4127, coupling: 'next', gravity: 40 }), /\d/, 'numbers are never set on a curve');
});

test('RD-8 one arc label: the lane\'s name-plate, its extras (hits, chance, push) while the ladder keeps them', () => {
  const l = { name: 'conga', len: 16, ratio: '4', hits: 12, chance: 0.85, push: -12 };
  assert.equal(laneLabel(l), 'CONGA 16 × 4 · 12 HITS · 85 % · −12 MS'); assert.equal(laneLabel(l, false), 'CONGA 16 × 4');
  assert.equal(laneLabel({ ...l, len: 32 }), 'CONGA 32 × 4', 'a full strip (over 16 steps) is its name-plate alone, as in Yuki\'s mock'); assert.equal(EXTRAS_MAX_STEPS, 16);
  assert.equal(laneLabel({ name: 'soft kick', len: 4, ratio: '1', hits: 1, chance: 1, push: 0 }), 'SOFT KICK 4 × 1 · 1 HIT');
  assert.equal(laneLabel({ name: 'hat', len: 16, ratio: '3/2', hits: 8, chance: 1, push: 20 }), 'HAT 16 × 3/2 · 8 HITS · +20 MS');
  assert.equal(labelOffset(3, 6, 44), 22, 'mid-gap outside the ring'); assert.equal(labelOffset(5, 6, 44), -22, 'the outer lane: inside (outside is the moons\' and the arcs\')'); assert.equal(labelOffset(3, 4, 74), -37); assert.equal(labelOffset(0, 4, 74), 37);
  assert.equal(labelOffset(0, 2, 222), 37, 'never further than 37 px out'); assert.equal(labelOffset(0, 4, 34), 17, 'a phone');
  assert.ok(Math.abs(arcRoom(100) - 100 * 70 * Math.PI / 180) < 1e-9, '±35° of horizontal'); assert.equal(LABEL_DEG, 70);
});

test('RD-8 Yuki\'s ladder: things go in order, and the lowest rung gone takes every rung above it', () => {
  const fits = { label: { arc: 300, full: 200 }, slots: { gap: 30, num: 15, room: 43 }, gen: { arc: 550, full: 400, room: 43 } };
  assert.equal(lightLevel(fits), 1, 'everything fits: only the unselected labels are gone (the decision keeps one)');
  assert.equal(lightLevel({ ...fits, label: { arc: 180, full: 200 } }), 2, 'the label\'s extras go first');
  assert.equal(lightLevel({ ...fits, slots: { gap: 16, num: 15, room: 43 } }), 3, 'then the slot numbers (and the extras with them, though they fit)');
  assert.equal(lightLevel({ ...fits, slots: { gap: 30, num: 15, room: 12 } }), 3, 'no room under the ring: the numbers go');
  assert.equal(lightLevel({ ...fits, gen: { arc: 550, full: 600, room: 43 } }), 4, 'then the arc\'s detail (everything above it too)');
  assert.equal(lightLevel({ ...fits, gen: { arc: 550, full: 400, room: 12 } }), 4);
  assert.deepEqual(lightPlan(1), { extras: true, slotNumbers: 'all', genDetail: true });
  assert.deepEqual(lightPlan(2), { extras: false, slotNumbers: 'all', genDetail: true });
  assert.deepEqual(lightPlan(3, 43), { extras: false, slotNumbers: 'some', genDetail: true }, 'the playing and the queued slot keep theirs');
  assert.deepEqual(lightPlan(3, 12), { extras: false, slotNumbers: 'none', genDetail: true }, 'no room: the playing slot goes to the straight caption');
  assert.deepEqual(lightPlan(4, 43), { extras: false, slotNumbers: 'some', genDetail: false });
  assert.equal(LIGHT_ROOM, 40);
});

test('RD-8 the 6-lane / 32-step page at 1512×860 drops in Yuki\'s order: the conga\'s extras go, "CONGA 32 × 4" stays', () => {
  // the rings as RD-3 places them: the stage cell between the columns at 1512×860, 6 lanes
  const box = ringBox({ x: 300, y: 0, w: 784, h: 716 }, 1512), g = ringGeo(1512, 860, box, 6);
  assert.ok(Math.abs(g.outer - 315) < 1, `outer ${g.outer}`);
  // Yuki's mock: the conga (lane 4 of 6, 32 steps ×4, 12 hits, chance on two steps, a push) selected; evolve, dice and
  // coupling on. A 32-step ring is a full strip: its label is the name-plate (the console shows the rest); the moons'
  // numbers and the arc's detail fit (the ladder drops by room, in order, and here there is room)
  const conga = 3, gap = g.gap * g.R, r = g.ring(conga) + labelOffset(conga, 6, gap), l = { name: 'conga', len: 32, ratio: '4', hits: 12, chance: 0.85, push: -2 };
  assert.ok(Math.abs(gap - 44.5) < 0.5 && labelOffset(conga, 6, gap) === 22, `gap ${gap}`);
  const label = laneLabel(l, true), room = 716 - g.cy - g.outer, gen = genWords({ evolve: true, dice: 4127, coupling: 'next', gravity: 40 });   // room: px under the outer ring to the console
  assert.equal(label, 'CONGA 32 × 4'); assert.ok(px(label) * 1.1 <= arcRoom(r), 'the name-plate fits its band');
  const level = lightLevel({ label: { arc: arcRoom(r), full: px(label) }, slots: { gap: arcRoom(g.outer + 24, MOON_DEG) / 15, num: px('16'), room }, gen: { arc: arcRoom(g.outer + 36), full: px(gen) * 1.1, room } });
  assert.ok(Math.round(room) === 43 && room >= LIGHT_ROOM, `room under the ring ${room}`);
  assert.equal(level, 1); assert.deepEqual(lightPlan(level, room), { extras: true, slotNumbers: 'all', genDetail: true });
  // the rim (lane 2 of 6, 16 steps) with the same extras: they do not fit its ring's ±35° band, the name-plate does (rung 2)
  const full16 = laneLabel({ ...l, name: 'rim', len: 16 }, true), r1 = g.ring(1) + labelOffset(1, 6, gap); assert.equal(full16, 'RIM 16 × 4 · 12 HITS · 85 % · −2 MS');
  assert.ok(px(full16) * 0.9 > arcRoom(r1) && px('RIM 16 × 4') * 1.1 <= arcRoom(r1), `${px(full16)} vs ${arcRoom(r1)}`);
  assert.equal(lightLevel({ label: { arc: arcRoom(r1), full: px(full16) * 0.9 }, slots: { gap: arcRoom(g.outer + 24, MOON_DEG) / 15, num: px('16'), room }, gen: { arc: arcRoom(g.outer + 36), full: px(gen) * 1.1, room } }), 2);
  // 4 lanes (the demo): the kick's extras fit mid-gap outside the inner ring ("KICK 4 × 4 · 1 HIT", Chrome: 133 px, the band 158)
  const g4 = ringGeo(1512, 860, box, 4), gap4 = g4.gap * g4.R, r0 = g4.ring(0) + labelOffset(0, 4, gap4);
  assert.equal(labelOffset(0, 4, gap4), 37); assert.ok(px('KICK 4 × 4 · 1 HIT') <= arcRoom(r0), `${px('KICK 4 × 4 · 1 HIT')} in ${arcRoom(r0)}`);
  assert.equal(lightLevel({ label: { arc: arcRoom(r0), full: px('KICK 4 × 4 · 1 HIT') }, slots: { gap: arcRoom(g4.outer + 24, MOON_DEG) / 15, num: px('16'), room }, gen: { arc: arcRoom(g4.outer + 36), full: px(gen) * 1.1, room } }), 1);
  // 1280×720: 12 px outside the ring (DECISION: 568 px rings, 12 px clear): the words leave the curves, the moons carry no number
  const b7 = ringBox({ x: 256, y: 0, w: 644, h: 592 }, 1280), g7 = ringGeo(1280, 720, b7, 4), room7 = 592 - g7.cy - g7.outer;
  assert.ok(room7 < LIGHT_ROOM && Math.round(room7) === 12, `room ${room7}`);
  assert.deepEqual(lightPlan(lightLevel({ label: { arc: 300, full: 100 }, slots: { gap: 30, num: 15, room: room7 }, gen: { arc: 500, full: 100, room: room7 } }), room7), { extras: false, slotNumbers: 'none', genDetail: false });
});

test('RD-8 the moons: slot 1 at the left, 16 at the right, spread ±30° round 6 o\'clock; the caption\'s lines', () => {
  const deg = (a) => (a * 180) / Math.PI;
  assert.equal(MOON_DEG, 60, 'Yuki\'s mock spreads them ±31.5°');
  assert.ok(Math.abs(deg(moonAngle(0)) - 210) < 1e-9, 'slot 1 past 6 o\'clock clockwise = the left'); assert.ok(Math.abs(deg(moonAngle(15)) - 150) < 1e-9); assert.ok(Math.abs(deg(moonAngle(7.5)) - 180) < 1e-9);
  assert.deepEqual(captionLines({ cycle: 'cycle · bar 7 of 16', evolve: { bars: 3 }, dice: { seed: 4127, repeat: 1 }, slot: null, jam: null }), ['cycle · bar 7 of 16', 'evolve in 3 bars', 'dice 4127']);
  assert.deepEqual(captionLines({ cycle: 'cycle · one bar', evolve: { bars: 1 }, dice: { seed: 9, repeat: 2 }, slot: 3, jam: { beat: 120, of: 256 } }), ['cycle · one bar', 'evolve in 1 bar', 'dice 9 · repeat 2', 'slot 3 playing', 'jam · beat 120 of 256']);
  assert.deepEqual(captionLines({ cycle: '' }), []);
});

test('RD-8 the caption keeps clear of the moons and their numbers (captionFit): four lines at 1512×860, nothing overlaps', () => {
  // 1512×860, 6 lanes, every moon numbered (13 px, 12 px past the moon: the frame's own boxes), the caption at the stage
  // cell's bottom right with the jam recording: four long lines (13 px Space Grotesk ≈ 6.1 px a character on the page)
  const box = ringBox({ x: 300, y: 0, w: 784, h: 716 }, 1512), g = ringGeo(1512, 860, box, 6), rMoon = g.outer + 24;
  const moons = (deg) => Array.from({ length: 16 }, (_, k) => { const a = moonAngle(k, 16, deg) - Math.PI / 2, tx = g.cx + Math.cos(a) * (rMoon + 12), ty = g.cy + Math.sin(a) * (rMoon + 12); return { x: tx - 8, y: ty + 4.5 - 0.72 * 13, w: 16, h: 0.75 * 13 }; });
  const widths = ['cycle · bar 10 of 10', 'evolve in 16 bars', 'dice 4127 · repeat 2', 'jam · beat 128 of 256'].map(t => t.length * 6.1);
  const at = { right: 1084 - 14, bottom: 716 - 10, cx: g.cx, cy: g.cy, ring: g.outer + 6 };
  assert.equal(captionFit(widths, { ...at, boxes: moons(MOON_DEG) }), 4, 'every line, every moon numbered');
  assert.ok(captionFit(widths, { ...at, boxes: moons(84) }) < 4, 'the old ±42° fan ran its right end into the first lines');
  const lines = captionBoxes(widths, at.right, at.bottom), gapOf = (a, b) => Math.max(b.x - a.x - a.w, a.x - b.x - b.w, b.y - a.y - a.h, a.y - b.y - b.h);
  assert.ok(lines.every(l => moons(MOON_DEG).every(m => gapOf(l, m) >= 5)), 'at least 5 px between a line and a number');
  // where it must give: rings in the way (a phone's square canvas) take lines from the end; nothing in the way, all
  assert.equal(captionFit(widths, { ...at, ring: 1e4 }), 0); assert.equal(captionFit(widths, { ...at, boxes: [] }), 4);
  assert.equal(captionFit(widths, { ...at, boxes: [{ x: 960, y: 640, w: 20, h: 10 }] }), 3, 'a box by the first line: the last line goes, the rest slide down past it');
  assert.deepEqual(captionBoxes([100, 50], 1070, 706), [{ x: 970, y: 675, w: 100, h: 13 }, { x: 1020, y: 692, w: 50, h: 13 }], 'the last baseline 4 px over the bottom, 17 px lines');
});

test('RD-8 static: read-only, the type rules, reduced motion, the sources, sprites, the evolve pill without a countdown', () => {
  const scene = read('../src/poly/scene.js'), app = read('../src/poly/app.js'), css = read('../styles.css');
  // the hit test is untouched: nothing on the canvas became clickable
  const loc = scene.slice(scene.indexOf('function locate('), scene.indexOf('function stepXY('));
  assert.doesNotMatch(loc, /sun|moon|label|caption|gen\b/i);
  assert.doesNotMatch(scene, /addEventListener\('(pointer|click|mouse|touch)/, 'the scene listens to no pointer');
  // the type: 13 px caps weight 500 on a curve, 15 px for a number, 300 only at 40 px, the sun's caption 11 px
  assert.equal(LABEL_PX, 13); assert.equal(NUMBER_PX, 15); assert.equal(SUN_PX, 40); assert.equal(CAPS_PX, 11);
  assert.match(LABEL_FONT, /^500 13px/); assert.match(NUMBER_FONT, /^500 15px/); assert.match(SUN_FONT, /^300 40px/); assert.match(SUN_SMALL_FONT, /^400 28px/, 'under 40 px never 300');
  assert.doesNotMatch(scene, /ctx\.fillText/, 'no fillText per frame: every word is a cached sprite'); assert.match(scene, /function arcSprite\(/); assert.match(scene, /function textSprite\(/);
  assert.match(scene, /TEXT_SPRITES = 32/, 'the cache is bounded');
  // reduced motion: the crawl steps per beat, the hint cuts, the flare stands still
  assert.match(scene, /genProgress\(gs\.bars, gs\.every, gs\.frac, reduced \? gs\.beats : 0\)/); assert.match(scene, /env = reduced \? 1 :/); assert.match(scene, /sp = reduced \? 0\.4 : now \* 0\.0005/);
  // the frame budget: an idle page still draws nothing (the hint, a held fill and a font load wake it)
  assert.match(scene, /&& !ghost && !hint && !hintShown && !fillOn && now >= wakeUntil\)/); assert.match(scene, /\n    hintShown = hint;/, 'the frame after the hint ends clears it');
  assert.ok(HINT_MS >= 4000 && HINT_MS <= 10000, 'a few seconds');
  // the app's sources: the generative clock from the last bar line, the slots, fill from anywhere, the first visit
  assert.match(app, /if \(line\) \{ barN\+\+; barAt = t; \}/); assert.match(app, /frac: playing \? \(heardTick\(\) - barAt\) \/ bars\.len : 0/);
  assert.match(app, /slots: \(\) => \(\{ filled: bank\.slots\.map\(Boolean\), current: bank\.current, pending: bank\.pending \}\)/);
  assert.match(app, /fill: \(\) => fill, hint: \(\) => neverPlayed/); assert.match(app, /\$\('btn-play'\)\.classList\.add\('pulse'\); neverPlayed = true;/); assert.match(app, /classList\.remove\('pulse'\); neverPlayed = false;/);
  assert.match(app, /scene\.setStage\(ringBox\([^\n]*\), \{ x: c\.left, y: c\.top, w: c\.width, h: c\.height \}\)/, 'the stage cell is the light\'s room, not the rings\' box');
  assert.match(scene, /room = Math\.max\(0, \(cell \? Math\.min\(g\.cy - cell\.y, cell\.y \+ cell\.h - g\.cy\)/);
  assert.match(css, /#btn-play\.pulse \{ animation: play-pulse 2\.6s/, 'a slow outline pulse'); assert.match(css, /prefers-reduced-motion: reduce\) \{ #btn-play\.pulse \{ animation: none; \}/);
  // the evolve pill reads "evolve" once the arc ships (DECISION "The countdown")
  assert.equal(pillText('evolve', { evolve: { on: true, every: 4 } }), 'evolve'); assert.doesNotMatch(app, /evolve · every 4 bars/);
});
