// RD-8 light on the canvas, checked on the page (DECISION §2 "Read-only light on the canvas", "Arc labels", "The
// countdown", "First visit"; acceptance A9 and Yuki's ladder). Muted headless Chrome through cdp.mjs, ports 5400/9400.
//
//   node orbit2/tools/light-check.mjs [--assert] [--only LIGHT,LADDER,FRAME,REDUCED,CLICK,SUN] [--shots /tmp/orbit2-impl/] [--json x.json]
//
// LIGHT    1512×860, a first visit: the sun reads "press play" (then the beats), the one label is the demo's kick with
//          its extras, the caption is straight type; playing with evolve, dice, coupling and gravity on and three slots
//          saved: the arc's words, the crawl, the moons with every number, the caption's lines; the evolve pill reads
//          "evolve" (no countdown: the arc has it). Stopped: the crawl empty and "evolve in 4 bars" (what Play will do);
//          Play: the crawl starts empty. A tempo doubled / halved / doubled while playing (and in REDUCED): the crawl never
//          steps back, the sun never counts up. SUN (run last): a cycle of millions of beats keeps the sun inside the ring.
// LADDER   6 lanes with two 32-step lanes at 1512×860 (Yuki's mock): the selected 32-step lane reads its name-plate
//          alone, the moons keep their numbers, the arc its detail (room by measurement); 1280×720 (12 px outside the
//          ring): no words over the ring, the moons carry no number and the playing slot is in the caption; the phone.
//          At each size, and again with a jam take recording (one more line): no caption line within 4 px of a moon or
//          its number (scene.light.boxes); at 1512×860 the four lines and every moon's number together.
// FRAME    A9: playing 6 lanes / 32 steps with the generative layer and slots on, 10 s: the page's rAF work per frame
//          p95 (RD-1 0.8 ms; ≤ +1 ms) and the stress meter p95 (RD-1 0).
// REDUCED  prefers-reduced-motion: the crawl steps once per beat (few distinct values over two beats, against many
//          without), the play ring's pulse animation is off.
// CLICK    nothing on the canvas became clickable, with 4 lanes and 6: a click on the sun, a moon, the arc's words and
//          the caption edits nothing and leaves the transport, the playing slot and evolve (an empty-canvas click is one
//          Esc, RD-4); inside a ring's tap band it selects that lane, as it did before RD-8, never anything else.
import { launch } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const r2 = (x) => Math.round(x * 100) / 100;
const BASE = { frameMs: 0.8, stress: 0 }, THRESH = { frameMs: BASE.frameMs + 1, stress: BASE.stress };
const GEN = `(() => { const P = __poly; P.evo.every = 4; P.setEvolve(true); P.dice.locked = true; P.m.couple.mode = 'next'; P.evo.gravity = 40; P.saveSlot(0); P.saveSlot(2); P.saveSlot(5); P.recallSlot(2); P.sync(); })()`;
const SIX = `(() => { const P = __poly; P.setLaneCount(6); for (const li of [3, 4]) { const l = P.m.lanes[li]; l.setLength(32); l.setRatio(12); for (let i = 0; i < 32; i += 3) l.hits[i] = true; } P.m.lanes[3].prob = 0.85; P.m.lanes[3].offsetMs = -2; P.m.select(3); P.sync(); })()`;
const LIGHT = 'JSON.stringify(__poly.scene.light)';
const FRAMES = `(() => { const raf = window.__lcRaf ||= window.requestAnimationFrame.bind(window), per = new Map(); window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); per.set(t, (per.get(t) || 0) + performance.now() - s); }); return () => { window.requestAnimationFrame = raf; return [...per.values()]; }; })()`;
const light = async (p) => JSON.parse(await p.eval(LIGHT));
const openPage = (b, o) => b.open('orbit2/index.html', { ...o, ready: '!!window.__poly' });   // once its modules ran (a busy machine)
// the caption's glyph boxes vs the moons' and their numbers' (scene.light.boxes, as the frame drew them): px apart
const gapOf = (a, b) => Math.max(b.x - a.x - a.w, a.x - b.x - b.w, b.y - a.y - a.h, a.y - b.y - b.h);
const nearest = (L) => Math.min(Infinity, ...(L.boxes?.lines || []).flatMap(l => (L.boxes?.moons || []).map(m => gapOf(l, m))));
/** Round 3: the tempo doubled mid-play (and halved, and doubled), every frame for 500 ms around it: the crawl never steps
 *  back (a mutation's wrap aside) and the sun never counts up (its own wrap at 1 aside). Returns the faults, [] = none. */
async function tempoJumps(p) {
  const faults = [], base = await p.eval('Math.round(Tone.getTransport().bpm.value)');
  for (const bpm of [base * 2, base, base * 2]) {
    const run = await p.eval(`new Promise(r => { const out = []; let k = 0; const t0 = performance.now(); (function f() { const L = __poly.scene.light; out.push([L.crawl, +L.sun]); if (++k === 4) __poly.applyTempo(${bpm}); if (performance.now() - t0 < 500) requestAnimationFrame(f); else r(out); })(); })`);
    for (let i = 1; i < run.length; i++) {
      const [c0, s0] = run[i - 1], [c1, s1] = run[i];
      if (c0 != null && c1 != null && c1 < c0 - 1e-9 && c0 - c1 < 0.5) faults.push(`→ ${bpm} bpm: the crawl ${c0.toFixed(4)} → ${c1.toFixed(4)}`);
      if (s1 > s0 && s0 !== 1) faults.push(`→ ${bpm} bpm: the sun ${s0} → ${s1}`);
    }
    await p.sleep(300);
  }
  await p.eval(`__poly.applyTempo(${base})`); return faults;
}
const fails = [];
const check = (sec, ok, what) => { if (!ok) fails.push(`${sec}: ${what}`); return ok; };
const shots = arg('--shots', null); if (shots) mkdirSync(shots, { recursive: true });
const shot = (p, name) => (shots ? p.shot(join(shots, name)) : null);

async function LIGHTS(b, out) {
  const p = await openPage(b,{ width: 1512, height: 860 }); await p.sleep(500);
  let L = await light(p);
  check('LIGHT', L.hint === true, `a first visit: the sun reads "press play" (hint ${L.hint})`);
  check('LIGHT', L.label === 'KICK 4 × 4 · 1 HIT' && L.labelFits, `the demo's kick label with its extras: ${L.label} (fits ${L.labelFits})`);
  check('LIGHT', L.lines[0] === 'cycle · 5 beats' && L.lines.length === 1, `stopped: the cycle's length in the caption: ${JSON.stringify(L.lines)}`);
  check('LIGHT', L.gen === '' && !L.moons, 'nothing generative on, no slot saved: no arc, no moons');
  check('LIGHT', (await p.eval(`getComputedStyle(document.getElementById('btn-play')).animationName`)) === 'play-pulse', 'the play ring pulses on a first visit');
  await shot(p, 'light-01-first-visit-1512x860.png');
  await p.sleep(7200); L = await light(p);
  check('LIGHT', L.hint === false && L.sun === '5', `after HINT_MS the sun reads the cycle's beats: hint ${L.hint}, sun "${L.sun}"`);
  await p.key(' '); await p.sleep(1200); await p.eval(GEN); await p.sleep(2600); L = await light(p);
  const pill = await p.eval(`document.getElementById('sp-evolve-go').textContent.trim()`);
  check('LIGHT', pill === 'evolve', `the evolve pill reads "evolve", not a countdown: "${pill}"`);
  check('LIGHT', L.far && L.gen === 'EVOLVE · DICE · COUPLING NEXT · GRAVITY' && L.genFits, `the arc's words with their detail: "${L.gen}" (far ${L.far}, fits ${L.genFits})`);
  check('LIGHT', L.crawl != null && L.crawl > 0 && L.crawl < 1, `the crawl moves: ${L.crawl}`);
  check('LIGHT', L.moons && L.plan.slotNumbers === 'all' && L.level === 1, `the moons with every number (level ${L.level}, numbers ${L.plan.slotNumbers})`);
  check('LIGHT', /^\d+$/.test(L.sun) && +L.sun >= 1 && +L.sun <= 5, `the sun counts the beats to the cycle: "${L.sun}"`);
  check('LIGHT', L.lines[0] === 'cycle · 5 beats' && /^evolve in [1-4] bars?$/.test(L.lines[1] || '') && /^dice \d+$/.test(L.lines[2] || '') && L.lines.length === 3, `the caption's lines: ${JSON.stringify(L.lines)}`);
  // the fill flare: fill held from the button, then let go
  await p.eval('__poly.setFill(true)'); await p.sleep(300); await shot(p, 'light-02-playing-fill-1512x860.png'); await p.eval('__poly.setFill(false)');
  await p.sleep(300); await shot(p, 'light-03-playing-4-lanes-1512x860.png');
  // round 1: stopped, the countdown is what Play will do (not where the last run stopped); Play never starts it full
  await p.key(' '); await p.sleep(400); const S = await light(p);
  check('LIGHT', S.crawl === 0 && S.lines.includes('evolve in 4 bars'), `stopped: the crawl empty and "evolve in 4 bars" (every 4): crawl ${S.crawl}, ${JSON.stringify(S.lines)}`);
  // Play, three times: the crawl starts empty and never steps back before the first mutation (round 2: a start guess 0.1 s
  // early ran the heard tick ahead and the first block put it back, 7 Plays in 8)
  const PLAY = `new Promise(r => { const out = []; document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); const t0 = performance.now(); (function f() { const c = __poly.scene.light?.crawl; if (c != null) out.push(c); if (performance.now() - t0 < 900) requestAnimationFrame(f); else r(out); })(); })`;
  const plays = [];
  for (let k = 0; k < 3; k++) { if (k) { await p.key(' '); await p.sleep(300); } plays.push(await p.eval(PLAY)); }
  for (const [k, c] of plays.entries()) {
    const back = c.findIndex((x, i) => i && x < c[i - 1] - 1e-9);
    check('LIGHT', c.length > 5 && c[0] <= 0.01 && back < 0, `Play ${k + 1}: the crawl starts empty and never steps back: first ${c[0]?.toFixed(4)}, ${back < 0 ? 'no step back' : `back at frame ${back}: ${c[back - 1].toFixed(4)} → ${c[back].toFixed(4)}`} (${c.length} frames)`);
  }
  const jumps = await tempoJumps(p);
  check('LIGHT', !jumps.length, `a tempo jump while playing moves the light back: ${jumps.slice(0, 4).join('; ')}`);
  out.LIGHT = { label: L.label, gen: L.gen, lines: L.lines, sun: L.sun, level: L.level, pill, stopped: { crawl: S.crawl, lines: S.lines }, playMax: r2(Math.max(...plays.flat())), jumpFaults: jumps.length, errors: p.errors.slice() };
  check('LIGHT', !p.errors.length, `page errors: ${JSON.stringify(p.errors)}`);
  p.close();
}

async function LADDER(b, out) {
  const res = {};
  for (const [w, h, mobile] of [[1512, 860, false], [1280, 720, false], [390, 844, true]]) {
    const p = await openPage(b,{ width: w, height: h, mobile }); await p.sleep(300);
    await p.key(' '); await p.sleep(800); await p.eval(SIX); await p.eval(GEN); await p.sleep(2600);   // the strip first: a queued slot lands on the bar and would put the saved lanes back
    const L = await light(p), key = `${w}x${h}`; res[key] = { level: L.level, room: r2(L.room), far: L.far, plan: L.plan, label: L.label, labelFits: L.labelFits, gen: L.gen, genFits: L.genFits, lines: L.lines, errors: p.errors.slice() };
    check('LADDER', L.label === 'WOOD 32 × 4' && L.labelFits, `${key}: a 32-step lane reads its name-plate alone: "${L.label}" (fits ${L.labelFits})`);
    if (w === 1512) {
      check('LADDER', L.far && Math.round(L.room) === 43, `${key}: 43 px outside the outer ring (${L.room})`);
      check('LADDER', L.level === 1 && L.plan.slotNumbers === 'all' && L.plan.genDetail && L.genFits, `${key}: the moons' numbers and the arc's detail fit (level ${L.level}, ${JSON.stringify(L.plan)}, gen "${L.gen}" fits ${L.genFits})`);
      check('LADDER', /^cycle · bar \d+ of 10$/.test(L.lines[0]) && L.lines.length === 3 && !L.lines.some(l => /^slot/.test(l)), `${key}: the cycle in bars, the playing slot on its moon, not in the caption: ${JSON.stringify(L.lines)}`);
      // a lane that is not a full strip: the rim (lane 2 of 6, 5 steps) keeps its extras when they fit its band
      await p.eval('__poly.m.select(1); __poly.sync()'); await p.sleep(400); const R = await light(p);
      check('LADDER', /^RIM 5 × 4( · \d HITS?)?$/.test(R.label) && R.labelFits, `${key}: the rim's label: "${R.label}" (fits ${R.labelFits})`); res[key].rim = R.label;
      await p.eval('__poly.m.select(3); __poly.sync()'); await p.sleep(400);
    } else if (w === 1280) {
      check('LADDER', !L.far && L.room > 10 && L.room < 13, `${key}: about 12 px outside the outer ring (${L.room}), no words there`);
      check('LADDER', L.plan.slotNumbers === 'none' && !L.genFits && L.gen !== '' && L.crawl != null, `${key}: the moons carry no number, the words leave the curve, the crawl hugs the ring (${JSON.stringify(L.plan)}, genFits ${L.genFits}, crawl ${L.crawl})`);
      check('LADDER', /^cycle · bar \d+ of 10$/.test(L.lines[0]) && L.lines.includes('slot 3 playing'), `${key}: the playing slot moves into the caption: ${JSON.stringify(L.lines)}`);
    } else {
      check('LADDER', L.lines.length >= 1 && /^cycle/.test(L.lines[0]), `${key}: the caption keeps at least the cycle line clear of the rings: ${JSON.stringify(L.lines)}`);
    }
    check('LADDER', nearest(L) >= 4, `${key}: a caption line ${nearest(L).toFixed(1)} px from a moon or its number`);
    await shot(p, `light-04-6-lanes-32-steps-${key}.png`);
    // a jam take recording: one more line (its beat). At 1512×860 all four stay, clear of the numbered moons (the old
    // ±42° fan ran its right end into the first lines there); elsewhere lines may go, never overlap
    await p.eval('__poly.toggleJam()'); await p.sleep(3200); const J = await light(p); res[key].jam = { lines: J.lines, nearest: r2(nearest(J)) };
    check('LADDER', nearest(J) >= 4, `${key} jam: a caption line ${nearest(J).toFixed(1)} px from a moon or its number (${JSON.stringify(J.lines)})`);
    if (w === 1512) check('LADDER', J.lines.length === 4 && /^jam · beat \d+ of 256$/.test(J.lines[3]) && J.plan.slotNumbers === 'all', `${key} jam: the four lines and every moon's number: ${JSON.stringify(J.lines)} (${J.plan.slotNumbers})`);
    await shot(p, `light-06-jam-${key}.png`); await p.eval('__poly.stopJam()');
    check('LADDER', !p.errors.length, `${key} page errors: ${JSON.stringify(p.errors)}`);
    p.close();
  }
  out.LADDER = res;
}

async function FRAME(b, out) {
  const p = await openPage(b,{ width: 1512, height: 860 }); await p.sleep(300);
  await p.key(' '); await p.sleep(800); await p.eval(SIX); await p.eval(GEN); await p.sleep(1500);
  await p.eval(`window.__lcStop = ${FRAMES}; window.__lcStress = []; window.__lcT = setInterval(() => __lcStress.push(__poly.stress.level), 300)`);
  await p.sleep(10000);
  const frames = await p.eval('window.__lcStop()'), stress = await p.eval('(clearInterval(__lcT), __lcStress)');
  const f = { n: frames.length, p50: r2(pct(frames, 50)), p95: r2(pct(frames, 95)), max: r2(Math.max(...frames)) }, s = { n: stress.length, p95: r2(pct(stress, 95)), max: r2(Math.max(...stress)) };
  const sprites = await p.eval('__poly.scene.stats().sprites');
  check('FRAME', f.p95 <= THRESH.frameMs, `frame p95 ${f.p95} ms > ${THRESH.frameMs} (RD-1 ${BASE.frameMs} + 1)`);
  check('FRAME', s.p95 <= THRESH.stress, `stress p95 ${s.p95} > RD-1 ${BASE.stress}`);
  check('FRAME', sprites <= 32, `text sprites ${sprites} (bounded at 32)`);
  out.FRAME = { frame: f, stress: s, sprites, baseline: BASE, errors: p.errors.slice() };
  check('FRAME', !p.errors.length, `page errors: ${JSON.stringify(p.errors)}`);
  p.close();
}

async function REDUCED(b, out) {
  const sample = async (p) => { const v = new Set(); const end = Date.now() + 2600; while (Date.now() < end) { v.add(r2((await light(p)).crawl)); await p.sleep(50); } return v.size; };
  const p = await openPage(b,{ width: 1512, height: 860, reducedMotion: true }); await p.sleep(300);
  check('REDUCED', (await p.eval(`matchMedia('(prefers-reduced-motion: reduce)').matches`)) === true, 'the page sees prefers-reduced-motion');
  check('REDUCED', (await p.eval(`getComputedStyle(document.getElementById('btn-play')).animationName`)) === 'none', 'the play ring\'s pulse is off with reduced motion');
  await p.key(' '); await p.sleep(800); await p.eval(GEN); await p.sleep(600);
  const stepped = await sample(p);   // 100 bpm: a beat is 600 ms, two beats ≈ 4 steps + the one it started in
  const rJumps = await tempoJumps(p);
  check('REDUCED', !rJumps.length, `a tempo jump moves the stepped crawl or the sun back: ${rJumps.slice(0, 4).join('; ')}`);
  const q = await openPage(b,{ width: 1512, height: 860 }); await q.sleep(300); await q.key(' '); await q.sleep(800); await q.eval(GEN); await q.sleep(600);
  const smooth = await sample(q);
  check('REDUCED', stepped <= 7 && smooth >= 20, `the crawl steps once per beat with reduced motion (${stepped} values in 2.6 s) and moves continuously without (${smooth})`);
  await shot(p, 'light-05-reduced-motion-1512x860.png');
  out.REDUCED = { stepped, smooth, errors: p.errors.concat(q.errors) };
  check('REDUCED', !p.errors.length && !q.errors.length, `page errors: ${JSON.stringify(p.errors.concat(q.errors))}`);
  p.close(); q.close();
}

// A click on the light edits nothing and starts nothing: the pattern (all but the selected lane), the transport, the
// playing slot and evolve stay. A spot inside a ring's tap band (laneAtRadius, unchanged since I1: ± half a gap round
// each ring; with 4 lanes it reaches 37 px past the outer ring, over the moons and the arc's words) selects that lane, as
// a click there did before RD-8; anywhere else the selection stays too. Measured after the queued slot has landed (it
// lands on the bar and would read as a change). 4 lanes (the demo) and 6.
async function CLICK(b, out) {
  const res = {};
  for (const lanes of [4, 6]) {
    const p = await openPage(b,{ width: 1512, height: 860 }); await p.sleep(300);
    await p.key(' '); await p.sleep(800); await p.eval(`__poly.setLaneCount(${lanes}); __poly.sync()`); await p.eval(GEN);   // explicit: an earlier part saved 6 lanes
    for (let i = 0; i < 50 && (await p.eval('__poly.bank.pending')) >= 0; i++) await p.sleep(100);
    const g = JSON.parse(await p.eval('JSON.stringify(__poly.scene.geo())')), c = JSON.parse(await p.eval(`JSON.stringify(document.getElementById('cv').getBoundingClientRect())`));
    const state = async () => { const m = JSON.parse(await p.eval('JSON.stringify(__poly.m.toJSON())')), sel = m.selected; delete m.selected; return { sel, rest: JSON.stringify({ m, playing: await p.eval(`document.getElementById('btn-play').getAttribute('aria-pressed') ?? document.getElementById('btn-play').textContent`), slot: await p.eval('__poly.bank.current'), evo: await p.eval('__poly.evo.on') }) }; };
    const spots = { sun: [g.cx, g.cy], 'arc words': [g.cx, g.cy - g.outer - 36], 'a moon': [g.cx + Math.cos(Math.PI / 2 + 0.1) * (g.outer + 24), g.cy + Math.sin(Math.PI / 2 + 0.1) * (g.outer + 24)], caption: [g.cx + g.outer + 20, g.cy + g.outer + 30] };
    const got = {};
    for (const [name, [x, y]] of Object.entries(spots)) {
      const band = await p.eval(`__poly.scene.locate(${c.left + x}, ${c.top + y}).lane`), a = await state();
      await p.click(c.left + x, c.top + y); await p.sleep(250); const z = await state();
      check('CLICK', z.rest === a.rest, `${lanes} lanes: a click on ${name} changed the pattern, the transport, the slot or evolve`);
      check('CLICK', z.sel === a.sel || z.sel === band, `${lanes} lanes: a click on ${name} selected lane ${z.sel + 1} (its band: ${band < 0 ? 'none' : `lane ${band + 1}`})`);
      got[name] = band < 0 ? 'empty canvas' : `lane ${band + 1}'s band`;
    }
    res[lanes] = got; check('CLICK', !p.errors.length, `${lanes} lanes page errors: ${JSON.stringify(p.errors)}`); p.close();
  }
  out.CLICK = { spots: res };
}

// SUN (last: it saves lanes of millions of beats): the sun set smaller or short stays inside the kick ring, 1512×860 and
// a phone's small ring, and holds its size, form and plate while it counts (240 bpm, 3 s: round 2's per-beat flips)
async function SUN(b, out) {
  const res = {}, SAMPLE = `new Promise(r => { const out = []; const t0 = performance.now(); (function f() { const L = __poly.scene.light; if (L?.sun) out.push([L.sun, L.sunPx, L.sunW]); if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(out); })(); })`;
  for (const [w, h, mobile, lens] of [[1512, 860, false, [32, 31, 29, 27, 25, 23]], [390, 844, true, [32, 31, 29, 27, 25, 23]], [390, 844, true, [13, 11, 9, 7]]]) {
    const p = await openPage(b, { width: w, height: h, mobile }); await p.sleep(300);
    await p.eval(`(() => { const P = __poly; P.setLaneCount(${lens.length > 4 ? 6 : 4}); ${JSON.stringify(lens)}.forEach((n, i) => { const l = P.m.lanes[i]; l.setLength(n); l.hits[0] = true; }); P.applyTempo(240); P.sync(); })()`);
    await p.key(' '); await p.sleep(1200); const Z = await light(p), key = `${w}x${h} ${lens.join('/')}`;
    check('SUN', Z.sunW > 0 && Z.sunW <= Z.sunMax && Z.sunPx >= 15, `${key}: the sun inside the kick ring: "${Z.sun}" at ${Z.sunPx} px, ${Z.sunW} px reserved in ${Z.sunMax}`);
    const run = await p.eval(SAMPLE), counts = new Set(run.map(x => x[0])), forms = new Set(run.map(x => `${x[1]}|${x[2]}`));
    check('SUN', (counts.size >= 6 || /[kMG]$/.test(Z.sun)) && forms.size === 1, `${key}: one size and one plate over ${counts.size} counts (a short "111M" holds for millions of beats): ${[...forms].join(', ')}`);
    res[key] = { text: Z.sun, px: Z.sunPx, w: Z.sunW, max: Z.sunMax, counts: counts.size, sizes: forms.size }; await shot(p, `light-07-long-cycle-sun-${key.replace(/[ /]/g, '-')}.png`);
    check('SUN', !p.errors.length, `${key} page errors: ${JSON.stringify(p.errors)}`); p.close();
  }
  out.SUN = res;
}

const only = new Set(String(arg('--only', 'LIGHT,LADDER,FRAME,REDUCED,CLICK,SUN')).split(',')), out = {};
const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400) });
try {
  if (only.has('LIGHT')) await LIGHTS(b, out);
  if (only.has('LADDER')) await LADDER(b, out);
  if (only.has('FRAME')) await FRAME(b, out);
  if (only.has('REDUCED')) await REDUCED(b, out);
  if (only.has('CLICK')) await CLICK(b, out);
  if (only.has('SUN')) await SUN(b, out);
} finally { await b.close(); }
const L = [];
if (out.LIGHT) L.push(`LIGHT first visit: "press play" then the beats · label "${out.LIGHT.label}" · playing: arc "${out.LIGHT.gen}", sun "${out.LIGHT.sun}", caption ${JSON.stringify(out.LIGHT.lines)}, level ${out.LIGHT.level}, pill "${out.LIGHT.pill}" · stopped: crawl ${out.LIGHT.stopped.crawl}, ${JSON.stringify(out.LIGHT.stopped.lines)} · Play: crawl max ${out.LIGHT.playMax} · tempo ×2 / ÷2 / ×2 while playing: ${out.LIGHT.jumpFaults} steps back`);
if (out.SUN) L.push(`SUN ${Object.entries(out.SUN).map(([k, v]) => `${k}: "${v.text}" ${v.px} px, ${v.w} in ${v.max} px, ${v.sizes} size over ${v.counts} counts`).join(' · ')}`);
if (out.LADDER) for (const [k, v] of Object.entries(out.LADDER)) L.push(`LADDER ${k}: room ${v.room} px, level ${v.level}, ${JSON.stringify(v.plan)} · label "${v.label}" (fits ${v.labelFits})${v.rim ? ` · rim "${v.rim}"` : ''} · arc "${v.gen}" (drawn ${v.genFits}) · caption ${JSON.stringify(v.lines)}`);
if (out.FRAME) L.push(`FRAME 6 lanes / 32 steps, generative on, 10 s: per frame p50 ${out.FRAME.frame.p50} p95 ${out.FRAME.frame.p95} max ${out.FRAME.frame.max} ms (${out.FRAME.frame.n} frames; RD-1 ${BASE.frameMs}, budget ${THRESH.frameMs}) · stress p95 ${out.FRAME.stress.p95} max ${out.FRAME.stress.max} (RD-1 ${BASE.stress}) · ${out.FRAME.sprites} text sprites`);
if (out.REDUCED) L.push(`REDUCED crawl values in 2.6 s: ${out.REDUCED.stepped} with reduced motion, ${out.REDUCED.smooth} without · pulse off`);
if (out.CLICK) for (const [n, s] of Object.entries(out.CLICK.spots)) L.push(`CLICK ${n} lanes: ${Object.entries(s).map(([k, v]) => `${k} (${v})`).join(', ')}: no edit, the transport, slot and evolve unchanged`);
L.push(fails.length ? `FAIL (${fails.length}):\n  ${fails.join('\n  ')}` : 'all pass');
console.log(L.join('\n'));
const json = arg('--json', null); if (json) writeFileSync(json, JSON.stringify({ out, fails }, null, 2));
if (fails.length && process.argv.includes('--assert')) process.exit(1);
