// RD-8 the night run of the label ladder (DECISION §3 RD-8: "the label ladder checked at night (13 px word / 15 px number
// floors)"; run by agents, DECISION "Run by agents"). Pictures of the canvas with 4 and 6 lanes, the selected lane 16 or
// 32 steps, playing with the generative layer and the slots on, at 1512×860 (and the 6-lane / 32-step one at 1280×720,
// where the ladder's lower rungs go), darkened for a dark room and scaled for 70 cm (glance.mjs's treatment, no shutter:
// a reader takes as long as they like). The key is what the canvas drew (`__poly.scene.light` and the slots, read before
// and after the shot and shot again until they agree: the sun counts beats, a queued slot lands on the bar) as items with
// their px (`nightItems`). Fresh persona agents read every label and number; `score` checks the readings token by token
// against the floors (`scoreNight`). Muted (cdp.mjs).
//
//   node orbit2/tools/night-ladder.mjs --out /tmp/orbit2-night/ [--port 5400 --debug-port 9400] [--only 1,4]
//        → night-1.png …, key.json (never show it to a reader), brief.txt (the reader's brief)
//   node orbit2/tools/night-ladder.mjs score key.json answers.json [--record x.json --commit abc1234]
//        answers: [{ scene, reader, label, arc, sun, sunWord, moons: { numbers, playing, queued }, caption: [..], notes }]
//
// Give each reader brief.txt and ONE picture, nothing else (not the key, not the other pictures).
import { launch } from './cdp.mjs';
import { DARKEN } from './glance.mjs';
import { nightItems, scoreNight, NIGHT_FLOORS } from './session-core.mjs';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/** The scenes: lanes, the selected lane (0-based) and the edits that make it 16 or 32 steps (ratio = RATIOS index: 10
 *  ×2, 12 ×4; a hit every `every` steps), the generative layer, the slots saved, the one playing and the one queued. */
export const SCENES = [
  { scene: 1, title: '4 lanes · 16 steps', size: [1512, 860], lanes: 4, sel: 2, edits: [{ li: 2, len: 16, ratio: 12, every: 3, prob: 0.85, push: -2 }], gen: { evolve: true, dice: true, couple: 'next', gravity: 40 }, slots: [0, 2, 5], play: 2, queue: 5 },
  { scene: 2, title: '4 lanes · 32 steps', size: [1512, 860], lanes: 4, sel: 3, edits: [{ li: 3, len: 32, ratio: 12, every: 3 }], gen: { evolve: true, dice: false, couple: 'matrix', gravity: 40 }, slots: [1, 4], play: 1 },
  { scene: 3, title: '6 lanes · 16 steps', size: [1512, 860], lanes: 6, sel: 1, edits: [{ li: 1, len: 16, ratio: 10, every: 4, prob: 0.7 }], gen: { evolve: false, dice: true, couple: 'next' }, slots: [0, 1, 3, 8], play: 3, queue: 8 },
  { scene: 4, title: '6 lanes · 32 steps', size: [1512, 860], lanes: 6, sel: 3, edits: [{ li: 3, len: 32, ratio: 12, every: 3, prob: 0.85, push: -2 }, { li: 4, len: 32, ratio: 12, every: 3 }], gen: { evolve: true, dice: true, couple: 'next', gravity: 40 }, slots: [0, 2, 5], play: 2 },
  { scene: 5, title: '6 lanes · 32 steps at 1280×720', size: [1280, 720], lanes: 6, sel: 3, edits: [{ li: 3, len: 32, ratio: 12, every: 3, prob: 0.85, push: -2 }, { li: 4, len: 32, ratio: 12, every: 3 }], gen: { evolve: true, dice: true, couple: 'next', gravity: 40 }, slots: [0, 2, 5], play: 2 },
];
// the strip first, then the slots (a queued slot lands on the bar and would put the saved lanes back)
const SETUP = (s) => `(() => { const P = __poly; P.setLaneCount(${s.lanes});
  for (const e of ${JSON.stringify(s.edits)}) { const l = P.m.lanes[e.li]; l.setLength(e.len); l.setRatio(e.ratio); for (let i = 0; i < e.len; i++) l.hits[i] = i % e.every === 0; if (e.prob != null) l.prob = e.prob; if (e.push != null) l.offsetMs = e.push; }
  P.m.select(${s.sel}); P.evo.every = 8; P.evo.gravity = ${s.gen.gravity || 0}; P.setEvolve(${!!s.gen.evolve}); P.dice.locked = ${!!s.gen.dice}; P.m.couple.mode = ${JSON.stringify(s.gen.couple || 'off')};
  for (const k of ${JSON.stringify(s.slots)}) P.saveSlot(k); P.recallSlot(${s.play}); P.sync(); })()`;
/** What the frame drew that a reader reads (the crawl moves every frame and is not read). */
const DRAWN = `(() => { const L = __poly.scene.light, b = __poly.bank; return JSON.stringify({ label: L.label, labelFits: L.labelFits, gen: L.gen, genFits: L.genFits, sun: L.sun, lines: L.lines, plan: L.plan, level: L.level, room: Math.round(L.room * 10) / 10, far: L.far, moons: L.moons, hint: L.hint, slots: { current: b.current, pending: b.pending, count: b.slots.length } }); })()`;

export const BRIEF = `You are shown ONE photo of a laptop screen, taken in a dark room from about 70 cm. It is a drum machine: in the
middle, concentric rings (one ring per lane) round a glowing "sun". Take as long as you like. Read the light ON THE CANVAS
(the rings and the dark space round them), not the panels and buttons round the edges of the screen. Read only what you
can actually see: never fill in what you would expect. For each item say how sure you are: "sure", "guess" or "unreadable".
1. label: one ring is the selected one (drawn brighter, in its colour). Text curves along it near the bottom of the
   rings. Copy it exactly, word for word and number for number, separators included.
2. sun: the big number in the middle of the rings, and the small word under it (sunWord).
3. arc: words curved over the top of the rings, if any. Copy them exactly.
4. moons: a row of small dots under the rings, if any. numbers: every number you can actually read printed next to a dot
   (not counted, not inferred from the order); playing: the number printed by the brightest dot; queued: the number by a
   dot in a dashed circle (null if none).
5. caption: lines of straight text at the bottom right of the stage area (left of the right-hand panel, above the bottom
   console), top to bottom, each copied exactly.
Answer as JSON on one line, then one short paragraph of notes (what was hard to read, and why):
{"label": "...", "sun": "...", "sunWord": "...", "arc": "...", "moons": {"numbers": [...], "playing": N, "queued": N}, "caption": ["...", "..."], "sure": {"label": "...", "sun": "...", "sunWord": "...", "arc": "...", "moons": "...", "caption": "..."}}
Use "" or [] or null for anything that is not there; "unreadable" in "sure" for anything you see but cannot read.`;

export async function runNight({ port = 5400, debugPort = 9400, out, only = null, exposure = 0.55, gamma = 1.5, scale = 0.71 } = {}) {
  mkdirSync(out, { recursive: true });
  const key = [], errors = [];
  for (const s of SCENES.filter(x => !only || only.includes(x.scene))) {
    const b = await launch({ port, debugPort });   // a fresh browser per scene: a first visit, nothing saved by the one before
    try {
      const p = await b.open('orbit2/index.html', { width: s.size[0], height: s.size[1], ready: '!!window.__poly' }); await p.sleep(300);
      await p.key(' '); await p.sleep(800); await p.eval(SETUP(s)); await p.sleep(2600);   // playing; the recalled slot has landed
      let shot = null, moved = '';
      for (let k = 0; k < 30 && !shot; k++) {
        if (s.queue != null) await p.eval(`(() => { const b = __poly.bank; if (b.pending < 0) __poly.recallSlot(b.current === ${s.queue} ? ${s.play} : ${s.queue}); })()`);
        await p.sleep(120);   // the frame after: the queued moon drawn
        const a = await p.eval(DRAWN), { result } = await p.send('Page.captureScreenshot', { format: 'png' }), z = await p.eval(DRAWN);
        if (a === z && (s.queue == null || JSON.parse(a).slots.pending >= 0)) shot = { drawn: JSON.parse(a), png: result.data };
        else { const A = JSON.parse(a), Z = JSON.parse(z); moved = Object.keys(A).filter(x => JSON.stringify(A[x]) !== JSON.stringify(Z[x])).map(x => `${x}: ${JSON.stringify(A[x])} → ${JSON.stringify(Z[x])}`).join('; ') || 'no queued slot'; await p.sleep(200); }
      }
      if (!shot) throw new Error(`scene ${s.scene}: the canvas never held still for a shot (last: ${moved})`);
      const file = `night-${s.scene}.png`;
      writeFileSync(join(out, file), Buffer.from(await p.eval(`(${DARKEN})(${JSON.stringify(shot.png)}, ${exposure}, ${gamma}, ${scale})`), 'base64'));
      key.push({ scene: s.scene, title: s.title, size: s.size, file, drawn: shot.drawn, items: nightItems(shot.drawn, shot.drawn.slots), errors: p.errors.slice() });
      errors.push(...p.errors); p.close();
    } finally { await b.close(); }
  }
  writeFileSync(join(out, 'key.json'), JSON.stringify({ tool: 'orbit2/tools/night-ladder.mjs', exposure, gamma, scale, floors: NIGHT_FLOORS, scenes: key }, null, 1));
  writeFileSync(join(out, 'brief.txt'), BRIEF + '\n');
  return { key, errors };
}

/** Per reading: tokens read at / under the floor; per class (word or number, px, on a curve or straight) over all. */
export function scoreAll(key, answers) {
  const rows = [], by = {};
  for (const a of answers) {
    const sc = key.scenes.find(x => x.scene === +a.scene); if (!sc) continue;
    const s = scoreNight(sc.items, a); rows.push({ scene: sc.scene, title: sc.title, reader: a.reader, read: s.read, of: s.of, floor: s.floor, by: s.by, missed: s.rows.filter(r => !r.read).map(r => `${r.item}: ${r.t}`), notes: a.notes || '' });
    for (const [k, v] of Object.entries(s.by)) { const t = (by[k] ||= { ...v, read: 0, of: 0 }); t.read += v.read; t.of += v.of; }
  }
  return { rows, by };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
  if (process.argv[2] === 'score') {
    const key = JSON.parse(readFileSync(process.argv[3], 'utf8')), ans = JSON.parse(readFileSync(process.argv[4], 'utf8')), s = scoreAll(key, ans);
    for (const r of s.rows) console.log(`scene ${r.scene} (${r.title}) · ${r.reader}: ${r.read} / ${r.of} · at the floor ${r.floor.at.read} / ${r.floor.at.of} · under it ${r.floor.below.read} / ${r.floor.below.of}${r.missed.length ? ` · missed ${r.missed.join(', ')}` : ''}`);
    for (const [k, v] of Object.entries(s.by).sort((x, y) => x[1].px - y[1].px)) console.log(`${k}: ${v.read} / ${v.of} read (${v.atFloor ? 'at or over' : 'UNDER'} the ${NIGHT_FLOORS[v.kind]} px ${v.kind} floor)`);
    const rec = arg('--record', null);
    if (rec) writeFileSync(rec, JSON.stringify({ format: 'orbits-night-ladder', v: 1, commit: arg('--commit', null), tool: 'orbit2/tools/night-ladder.mjs', readers: arg('--readers', 'one fresh sub-agent per picture and persona (noor, yuki; model sonnet), shown brief.txt and that picture only'), treatment: { exposure: key.exposure, gamma: key.gamma, scale: key.scale }, floors: NIGHT_FLOORS, brief: BRIEF, scenes: key.scenes.map(({ scene, title, size, drawn, items }) => ({ scene, title, size, drawn, items: items.map(({ item, text, px, curve }) => ({ item, text, px, curve })) })), readings: ans, score: s }, null, 1) + '\n');
  } else {
    const only = arg('--only', null)?.split(',').map(Number), out = arg('--out', '/tmp/orbit2-night');
    const r = await runNight({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400), out, only, exposure: +arg('--exposure', 0.55), gamma: +arg('--gamma', 1.5), scale: +arg('--scale', 0.71) });
    for (const k of r.key) console.log(`scene ${k.scene} (${k.title}) ${k.file}: level ${k.drawn.level}, room ${k.drawn.room} · ${k.items.map(i => `${i.item} "${i.text}" ${i.px} px`).join(' · ')}`);
    console.log(`${r.key.length} pictures in ${out} (key.json is the answer key: never show it to a reader; brief.txt is the reader's brief)`);
    if (r.errors.length) { console.error(`page errors: ${r.errors.join(' | ')}`); process.exitCode = 2; }
  }
}
