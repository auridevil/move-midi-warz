// RD-1 screen-off proxy (DECISION A10): the Move as its LEDs show it, nothing else. Reads the lights the page sent
// (movewire caches every pad, step and button colour in move.ledState) and draws the device's face with them, the
// display left dark. A fresh sub-agent sees only that image. Muted (cdp.mjs); the Move is simulated as connected.
//
//   node orbit2/tools/moveview.mjs --out /tmp/move.png                       # today's page, a groove, stopped
//   node orbit2/tools/moveview.mjs --play --hold minus --out /tmp/drift.png  # playing, − held while the shot is taken
//   node orbit2/tools/moveview.mjs --bytes "b0 31 7f;90 47 64" --out x.png   # any Move bytes first (hex, ; between)
//   import { moveShot } from './moveview.mjs'; await moveShot(page, '/tmp/m.png')   # from another tool's page
//
// RD-11 A10 (`a10`): each try starts from another hand's drift (session-core a10Trials: every, amount, the lanes that
// evolve, evolve on or off, put there through the Move), then a hand in the dark sets Noor's target through the Move
// with only the lights to go by: evolve on (the − LED magenta), play (the play LED white), hold −, touch knob 1 and
// count the meter's LEDs, turn, count again until 8 (every = 8 bars), the same on knob 2 (8 of 16: amount ≈ half), and
// tap lanes 1, 2, 4 in and 3 out where their LEDs (lit or dark) say otherwise. Playing on, it waits until the try's bars
// before the next mutation and draws three pictures: − held (the table), − held + a finger on knob 1, − held + a finger
// on knob 2. The truth: the model's every / amount / lanes, and the bars to the mutation the clock really makes next
// (m.evolve / m.assign wrapped: its bar line against the heard tick of the first picture). Each try's pictures go to
// a folder with a random name (--judges), away from key.json: give each judge brief.txt and its folder, nothing else.
//
//   node orbit2/tools/moveview.mjs a10 --tries 5 --seed 1 --out /tmp/orbit2-a10/noor --judges /tmp/orbit2-a10-judge
//   node orbit2/tools/moveview.mjs score /tmp/orbit2-a10/noor/key.json answers.json   # answers: [{ try, every, amount, lanes, bars, lit }]
//   score … --record setlog/a10-x.json --player noor --commit abc1234   also writes the run's record
import { launch } from './cdp.mjs';
import { ledsOf, drawMove, bytes, a10Trials, scoreA10, A10 } from './session-core.mjs';
import { openSet, SIM_MOVE } from './session.mjs';
import { TOUCH_HOLD_MS } from '../src/poly/pages.js';
import { paletteHex, nearestPaletteIndex, COLOR } from 'movewire';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** The page's Move lights → { leds, svg }. */
export async function moveState(p) { const leds = ledsOf(await p.eval('[...__poly.move.ledState]')); return { leds, svg: drawMove(leds, paletteHex) }; }

/** Draw `leds` as the Move and save it as a PNG (rendered by the page's own browser, on top, then removed). */
async function drawShot(p, leds, file) {
  await p.eval(`(() => { const d = document.createElement('div'); d.id = 'mv-shot'; d.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;background:#111;line-height:0'; d.innerHTML = ${JSON.stringify(drawMove(leds, paletteHex))}; document.body.append(d); })()`);
  await p.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const { result } = await p.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 980, height: 560, scale: 1 } });
  await p.eval(`document.getElementById('mv-shot').remove()`);
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(result.data, 'base64'));
}
/** Draw the Move as the page lit it and save it as a PNG. */
export async function moveShot(p, file) { const { leds } = await moveState(p); await drawShot(p, leds, file); return leds; }

// ---- A10 ----
export const A10_BRIEF = `You are holding the − button of an Ableton Move (a hardware groovebox) that plays a drum-machine web app,
"Orbits". The room is dark and the laptop screen is OFF: all you have is the Move's own lights. Your pattern has 4
lanes and it is playing. The app's manual (its Move table) says:
  −                                  evolve on/off · with ?drift: on the release, for a tap (under 0.45 s) with nothing else pressed, touched or turned while − was down; a longer hold is a look and toggles nothing
  Hold − + knobs 1–8 (with ?drift)   drift: every · amount · gravity · home after · max cycle · coupling lift · humanize · dice repeat · a touched knob turns all 16 step LEDs into its meter (counts light one LED each, percentages in 16ths)
  Hold − + steps (with ?drift)       step LEDs 1–6 = the lanes that evolve (lit in the lane colour; dark = steady), tap one to toggle it · LEDs 9–16 drain toward the next mutation, one per ⅛ of "every" (all dark while evolve is off)
(Evolve mutates the pattern every "every" bars; amount is how much of it a mutation may change.)

Three photos of the Move, each drawn from its lights at that moment. The display is dark, the 8 knobs and the wheel
have no lights, and the 16 step buttons are the row of small lights numbered 1–16 under the pads.
  photo-1.png  − held, no knob touched
  photo-2.png  − held, a finger resting on knob 1 (the leftmost of the 8 knobs), not turning it
  photo-3.png  − held, a finger resting on knob 2, not turning it
Look at these three images only (open them with the Read tool): do not open any other file and do not run anything.
Then answer, as JSON on one line:
{"every": N, "amount": P, "lanes": [..], "lit": L, "bars": B, "notes": "..."}
- every: the "every" setting, in bars
- amount: the "amount" setting, in percent
- lanes: the numbers of the lanes that evolve
- lit: how many of the countdown LEDs (steps 9–16) are lit in photo 1
- bars: roughly how many bars until the next mutation (one number; decimals are fine)
- notes: anything that was hard to read, in a sentence or two. If you cannot tell something, give your best guess.`;
/** The − LED while evolve is on (app.js MAGENTA_LED) and the play LED while playing: what the hand looks for. */
const MINUS_EVOLVING = nearestPaletteIndex('#f0abfc');
/** The tick the ear is at (app.js heardTick, from the clock's latest block), the bar's ticks and a tick's seconds. */
const HEARD = `(() => { const raw = Tone.getContext().rawContext, c = __poly.clock(), ts = __poly.tickSec(); return { heard: c.clockRef.tick + (raw.currentTime - (raw.outputLatency || 0) - c.clockRef.time) / ts, len: __poly.bars.len, ts }; })()`;
/** Every mutation the clock makes from now (evolveNow: m.evolve, or m.assign on the way home), by its bar line: the
 *  block it runs in starts on that line (a bar is a whole number of 35-tick blocks). */
const MUT_HOOK = `(() => { const m = __poly.m; window.__a10mut = []; for (const k of ['evolve', 'assign']) { const f = m[k]; m[k] = function (...a) { const len = __poly.bars.len; window.__a10mut.push({ k, line: Math.ceil(__poly.clock().clockRef.tick / len) * len }); return f.apply(this, a); }; } })()`;

async function a10Try(p, k, folder) {
  await p.eval('localStorage.clear()'); await p.send('Page.reload'); await sleep(1500);
  for (let i = 0; i < 120 && !(await p.eval('!!window.__poly').catch(() => false)); i++) await sleep(250);
  await p.eval(`(async () => { await __poly.wake(); ${SIM_MOVE} __poly.loadGroove('techno'); __poly.sync(); window.__a10try = ${k.try}; })()`); await sleep(1300);
  // src/dev-reload.js reloads the page when a repo file changes: a try it cut short must fail, not count
  const alive = async (at) => { if ((await p.eval('window.__a10try').catch(() => null)) !== k.try) throw new Error(`a10 try ${k.try}: the page reloaded (${at}); was a repo file edited during the run?`); };
  const send = (x) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(x)}))`);
  const tap = async (x) => { await send(x(true)); await sleep(60); await send(x(false)); await sleep(150); };
  const lights = async () => (await moveState(p)).leds, count = (a) => a.filter(Boolean).length;
  const model = () => p.eval('({ every: __poly.evo.every, amount: __poly.evo.amount, lanes: __poly.m.lanes.map(l => !!l.evolve), on: __poly.evo.on })');
  // the start: another hand's drift, through the Move (− held: knobs 1 and 2, lane taps; the release is a chord's)
  const s = k.start, was = await model();
  await send(bytes.btn('minus', true));
  await send(bytes.enc(0, s.every - was.every)); await send(bytes.enc(1, Math.round((s.amount - was.amount) / 2)));
  for (let i = 0; i < 4; i++) if (s.lanes[i] !== was.lanes[i]) await tap((d) => bytes.step(i, d));
  await send(bytes.btn('minus', false)); await sleep(300);
  if ((await model()).on !== s.evolve) await tap((d) => bytes.btn('minus', d));
  const st = await model(); k.startSeen = { every: st.every, amount: st.amount, lanes: st.lanes, evolve: st.on };
  // the hand in the dark: the lights only (the − LED magenta = evolving, the play LED white = playing)
  if ((await lights()).buttons.minus !== MINUS_EVOLVING) await tap((d) => bytes.btn('minus', d));
  if ((await lights()).buttons.play !== COLOR.WHITE) await tap((d) => bytes.btn('play', d));
  await sleep(400);
  await send(bytes.btn('minus', true)); await sleep(200);
  const meterTo = async (knob, want, perLed) => {   // touch, count the meter, turn, count again
    await send(bytes.touch(knob, true)); await sleep(150); let turns = 0;
    for (let n = count((await lights()).steps); n !== want && turns < 24; n = count((await lights()).steps)) { await send(bytes.enc(knob, (want - n) * perLed)); turns++; await sleep(120); }
    const n = count((await lights()).steps); await send(bytes.touch(knob, false)); return { lit: n, turns };
  };
  k.meters = { every: await meterTo(0, 8, 1), amount: await meterTo(1, 8, 3) };   // every: a click a bar (an LED); amount: 2 % a click, 6.25 % an LED
  await sleep(TOUCH_HOLD_MS + 100);   // the meter's tail: the table is back
  const lanes = (await lights()).steps;   // lit = evolving, dark = steady
  for (let i = 0; i < 4; i++) if (!!lanes[i] !== A10.lanes.includes(i + 1)) await tap((d) => bytes.step(i, d));
  await sleep(TOUCH_HOLD_MS + 100);
  // the pictures, playing on, when the ear is the try's bars before the next mutation (every = 8: the bar lines 8, 16 …)
  await p.eval(MUT_HOOK);
  const leftNow = () => p.eval(`(() => { const h = ${HEARD}, e = __poly.evo.every * h.len; return ((Math.floor(h.heard / e) + 1) * e - h.heard) / h.len; })()`);
  for (const t0 = Date.now(); Date.now() - t0 < 40000;) { const l = await leftNow(); if (l <= k.left && l > k.left - 0.15) break; await sleep(l - k.left > 0.6 ? 120 : 10); }
  const shot = async (file) => { const r = await p.eval(`(() => ({ leds: [...__poly.move.ledState], ...${HEARD} }))()`), leds = ledsOf(r.leds); await drawShot(p, leds, join(folder, file)); return { heard: r.heard, len: r.len, ts: r.ts, steps: leds.steps }; };
  await alive('before the pictures');
  const table = await shot('photo-1.png');
  await send(bytes.touch(0, true)); await sleep(150); const knob1 = await shot('photo-2.png'); await send(bytes.touch(0, false)); await sleep(TOUCH_HOLD_MS + 100);
  await send(bytes.touch(1, true)); await sleep(150); const knob2 = await shot('photo-3.png'); await send(bytes.touch(1, false));
  await alive('during the pictures');
  // the truth: the model as set, and the mutation the clock really made next (its bar line vs the ear at photo 1)
  let mut = null;
  for (const t0 = Date.now(); !mut && Date.now() - t0 < 30000; await sleep(100)) mut = await p.eval(`(window.__a10mut || []).find(x => x.line > ${table.heard}) || null`);
  await alive('waiting for the mutation');
  const end = await model(); await send(bytes.btn('minus', false)); await tap((d) => bytes.btn('play', d));
  k.truth = { every: end.every, amount: end.amount, lanes: end.lanes.map((on, i) => on && i + 1).filter(Boolean), left: mut ? +((mut.line - table.heard) / table.len).toFixed(3) : null };
  k.shots = { lit: { table: count(table.steps.slice(8)), knob1: count(knob1.steps), knob2: count(knob2.steps) }, steps: { table: table.steps, knob1: knob1.steps, knob2: knob2.steps }, bar: +(table.len * table.ts).toFixed(4), mutation: mut };
  k.folder = folder;
  return k;
}

export async function runA10({ port = 5400, debugPort = 9400, tries = 5, seed = 1, out, judges } = {}) {
  mkdirSync(out, { recursive: true });
  const key = a10Trials(tries, seed), b = await launch({ port, debugPort });
  try {
    const p = await b.open('orbit2/index.html?drift', { width: 1512, height: 860, ready: '!!window.__poly' });
    for (const k of key) await a10Try(p, k, join(judges, randomBytes(4).toString('hex')));
    writeFileSync(join(out, 'key.json'), JSON.stringify({ seed, groove: 'techno', path: 'orbit2/index.html?drift', target: A10, errors: p.errors, tries: key }, null, 1));
    writeFileSync(join(out, 'brief.txt'), A10_BRIEF + '\n');
    return { key, errors: p.errors };
  } finally { await b.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; }, has = (k) => process.argv.includes(k);
  if (process.argv[2] === 'score') {
    const key = JSON.parse(readFileSync(process.argv[3], 'utf8')), ans = JSON.parse(readFileSync(process.argv[4], 'utf8')), s = scoreA10(key.tries, ans);
    const was = (t) => `every ${t.every}, amount ${t.amount} %, lanes ${t.lanes.join(' ')}, ${t.left} bars`;
    for (const r of s.rows) console.log(`try ${r.try}: ${r.ok ? 'right' : 'WRONG'} · was ${was(r.truth)} · said ${r.said ? `every ${r.said.every}, amount ${r.said.amount} %, lanes ${r.said.lanes.join(' ')}, ${r.said.bars} bars` : 'nothing'}${r.ok ? '' : ` (${!r.reached ? 'target not reached; ' : ''}${['every', 'amount', 'lanes', 'bars'].filter(x => !r[x + 'Ok']).join(', ')} wrong)`}`);
    console.log(`${s.right} / ${s.of} right · A10 ${s.pass ? 'PASS' : 'FAIL'} (5 of 5)`);
    const rec = arg('--record', null);
    if (rec) writeFileSync(rec, JSON.stringify({ format: 'orbits-a10', v: 1, player: arg('--player', null), page: key.path, commit: arg('--commit', null), tool: 'orbit2/tools/moveview.mjs a10',
      judges: arg('--judges', 'one fresh sub-agent per try (model sonnet, the player persona), shown brief.txt and that try\'s three pictures only'), run: { seed: key.seed, groove: key.groove, target: key.target, errors: key.errors },
      brief: A10_BRIEF, score: { right: s.right, of: s.of, pass: s.pass },
      tries: s.rows.map(r => { const k = key.tries.find(x => x.try === r.try); return { try: r.try, start: k.startSeen, meters: k.meters, shots: k.shots, truth: r.truth, said: r.said, notes: ans.find(a => +a.try === r.try)?.notes ?? null, reached: r.reached, ok: r.ok }; }) }, null, 1) + '\n');
  } else if (process.argv[2] === 'a10') {
    const out = arg('--out', '/tmp/orbit2-a10'), r = await runA10({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400), tries: +arg('--tries', 5), seed: +arg('--seed', 1), out, judges: arg('--judges', '/tmp/orbit2-a10-judge') });
    for (const k of r.key) console.log(`try ${k.try} → ${k.folder} · set every ${k.truth.every}, amount ${k.truth.amount} %, lanes ${k.truth.lanes.join(' ')} · countdown ${k.shots.lit.table} lit, ${k.truth.left} bars to the mutation (asked ${k.left}) · meters ${k.shots.lit.knob1} / ${k.shots.lit.knob2}`);
    console.log(`key.json in ${out} (never show it to a judge); brief.txt is the judges' brief`);
    if (r.errors.length) { console.error(`page errors: ${r.errors.join(' | ')}`); process.exitCode = 2; }
  } else {
    const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400) });
    try {
      const p = await openSet(b, { path: arg('--path', 'orbit2/index.html'), groove: arg('--groove', 'techno') }), send = (x) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(x)}))`);
      if (has('--play')) { await send(bytes.btn('play', true)); await send(bytes.btn('play', false)); await sleep(1500); }
      for (const s of (arg('--bytes', '') || '').split(';').map(x => x.trim()).filter(Boolean)) { await send(s.split(/\s+/).map(h => parseInt(h, 16))); await sleep(80); }
      if (arg('--hold', null)) { await send(bytes.btn(arg('--hold'), true)); await sleep(600); }
      const leds = await moveShot(p, arg('--out', '/tmp/orbit2-moveview.png'));
      console.log(`${arg('--out', '/tmp/orbit2-moveview.png')} · ${leds.pads.filter(Boolean).length} pads, ${leds.steps.filter(Boolean).length} steps, ${Object.values(leds.buttons).filter(Boolean).length} buttons lit`);
      if (p.errors.length) { console.error(`page errors: ${p.errors.join(' | ')}`); process.exitCode = 2; }
    } finally { await b.close(); }
  }
}
