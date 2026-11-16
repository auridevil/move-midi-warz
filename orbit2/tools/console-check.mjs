// RD-5 console check (DECISION A2 scripted, A5 / A7 with the console log, A8, Nils's rows on the page, Vera's mis-click
// run). Muted headless Chrome (cdp.mjs), the page as a set opens it (session.mjs openSet: ?setlog, the Move simulated).
//
//   node orbit2/tools/console-check.mjs                     # everything at 1512×860, a report on stdout
//   node orbit2/tools/console-check.mjs --assert --json /tmp/x.json --clicks 600 --shots /tmp/orbit2-impl/
//   --port 5400 --debug-port 9400   --only MOVE,A8,A2,LOG,MISCLICK
//
// MOVE      Noor's sequence and the touch / turn rows through __poly.move.receive (touch notes 0–8, encoder CCs, Shift,
//           steps): what the row draws, the chip, the header word, the held cell, the step untouched by a look.
// A8        a Move encoder touch → the peek painted: the `peek` performance measures (?setlog), p95 < 30 ms.
// A2        the scripted glance run (the DOM oracle; the player agents judge pictures in glance.mjs): select a lane on the
//           Move, Shift or not, touch a knob and turn it a click, look 300 ms later: the page drawn and the lane in the
//           header must be what the hands asked for; ≥ 18 of 20 per seed.
// LOG       the console log on and off: the visible controls (the face audit's selector) and the rings must not change.
// MISCLICK  Vera's run: random pointer clicks over the whole face while playing (a click a second for ten minutes,
//           compressed). A click that lands ON a destructive control (randomize, play while playing, a kick's M, init /
//           load / clear / a slot / a groove in the sheet…) is a hit, counted apart; every other click must leave 0
//           destructive changes in the setlog (A3's classes). Links, file pickers, the mic and MIDI access are skipped.
import { launch } from './cdp.mjs';
import { openSet } from './session.mjs';
import { bytes, trackOf, classOf } from './session-core.mjs';
import { mulberry32 } from '../src/poly/dice.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const send = (p, b) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(b)}))`);
const STATE = `(() => { const g = (i) => document.getElementById(i); return { row: g('knobs').dataset.page, chip: g('move-chip').textContent, own: g('move-chip').classList.contains('own'), word: g('lh-page').textContent, lane: parseInt(g('lh-lane').textContent, 10), held: [...document.querySelectorAll('#stepsui .st.held')].map(b => parseInt(b.getAttribute('aria-label').slice(5), 10)), peek: g('peek').hidden ? null : g('peek-name').textContent }; })()`;
export const THRESH = { peekMs: 30, glance: 18, destructive: 0 };

async function moveRows(p) {
  const st = () => p.eval(STATE), out = {};
  await p.eval(`(() => { const l = __poly.m.lane; l.resize(16); __poly.sync(); document.getElementById('pg-sound').click(); })()`); await sleep(100);
  const hits = () => p.eval('__poly.m.lane.hits.slice(0, 16).map(Boolean).join("")'), h0 = await hits();
  out.T0 = await st();
  await send(p, bytes.touch(2, true)); await sleep(40); out.T0p = await st(); await send(p, bytes.touch(2, false)); await sleep(150); out.T0p_tail = await st(); await sleep(400); out.T0p_after = await st();
  await send(p, bytes.touch(8, true)); await sleep(40); out.volumeTouch = await st(); await send(p, bytes.touch(8, false)); await sleep(500);
  const len0 = await p.eval('__poly.m.lane.length'); await send(p, bytes.enc(0, 1)); await sleep(40); out.turn = { ...(await st()), length: [len0, await p.eval('__poly.m.lane.length')] }; await sleep(500); out.turn_after = await st();
  await p.eval('(() => { __poly.m.lane.resize(16); __poly.sync(); })()'); await sleep(50);
  await send(p, bytes.step(6, true)); await sleep(40); out.T1a = await st(); await sleep(520); out.T1b = await st();
  await send(p, bytes.btn('shift', true)); await sleep(40); out.T2 = await st();
  await send(p, bytes.step(6, false)); await sleep(40); out.T3 = await st();
  await send(p, bytes.btn('shift', false)); await sleep(40); out.T4 = await st(); out.stepUntouched = (await hits()) === h0;
  // a quick tap with Shift on a rhythm latch: no page flashes, the step toggles
  await p.eval(`document.getElementById('pg-rhythm').click()`); await send(p, bytes.step(2, true)); await send(p, bytes.btn('shift', true)); await sleep(60); out.tap = await st();
  await send(p, bytes.step(2, false)); await send(p, bytes.btn('shift', false)); await sleep(40); out.tapToggled = (await hits()) !== h0;
  const want = { T0: ['sound', false, 'MOVE ⇢ RHYTHM'], T0p: ['rhythm', true, 'MOVE ⇢ RHYTHM'], T0p_tail: ['rhythm', true, 'MOVE ⇢ RHYTHM'], T0p_after: ['sound', false, 'MOVE ⇢ RHYTHM'], volumeTouch: ['sound', false, 'MOVE ⇢ RHYTHM'], turn: ['rhythm', true, 'MOVE ⇢ RHYTHM'], turn_after: ['sound', false, 'MOVE ⇢ RHYTHM'],
    T1a: ['sound', false, 'MOVE ⇢ RHYTHM'], T1b: ['step', true, 'MOVE ⇢ STEP 7'], T2: ['step', true, 'MOVE ⇢ STEP 7 ⇧'], T3: ['sound', true, 'MOVE ⇢ SOUND ⇧'], T4: ['sound', false, 'MOVE ⇢ RHYTHM'], tap: ['rhythm', true, 'MOVE ⇢ RHYTHM'] };
  const fails = Object.entries(want).filter(([k, [row, own, chip]]) => out[k].row !== row || out[k].own !== own || out[k].chip !== chip).map(([k]) => `${k}: ${JSON.stringify(out[k])}`);
  if (!out.T1a.held.includes(7)) fails.push('T1a: cell 7 not outlined at once');
  if (!out.T0p.peek?.startsWith('knob 3')) fails.push(`T0′: the peek shows ${out.T0p.peek}`);
  if (out.turn.length[1] !== out.turn.length[0] + 1) fails.push(`a turn did not move the length: ${out.turn.length}`);
  if (!out.stepUntouched) fails.push('a look (held ≥ 450 ms, no turn) toggled the step'); if (!out.tapToggled) fails.push('a quick tap did not toggle its step');
  return { rows: out, fails };
}

async function peekLatency(p, n = 40) {
  await p.eval(`performance.clearMeasures('peek'); performance.clearMarks('peek-touch')`);
  for (let i = 0; i < n; i++) { await send(p, bytes.touch(i % 8, true)); await sleep(80); await send(p, bytes.touch(i % 8, false)); await sleep(480); }
  const ms = await p.eval(`performance.getEntriesByName('peek', 'measure').map(e => e.duration)`);
  return { n: ms.length, p50: pct(ms, 50), p95: pct(ms, 95), max: Math.max(...ms), fails: ms.length < n * 0.9 ? [`${ms.length} of ${n} touches measured`] : pct(ms, 95) >= THRESH.peekMs ? [`peek p95 ${pct(ms, 95).toFixed(1)} ms`] : [] };
}

async function glance(p, { seed, trials = 20, shots }) {
  const rng = mulberry32(seed * 7919 + 3), rows = [];
  for (let t = 1; t <= trials; t++) {
    const lane = 1 + Math.floor(rng() * 4), page = rng() < 0.5 ? 'rhythm' : 'sound', knob = Math.floor(rng() * 7);
    await send(p, bytes.btn(trackOf(lane - 1), true)); await sleep(60); await send(p, bytes.btn(trackOf(lane - 1), false)); await sleep(150);
    if (page === 'sound') { await send(p, bytes.btn('shift', true)); await sleep(60); }
    await send(p, bytes.touch(knob, true)); await sleep(80); await send(p, bytes.enc(knob, 1)); await sleep(300);   // the 300 ms shutter
    const s = await p.eval(STATE); if (shots && t <= 2) await p.shot(join(shots, `glance-s${seed}-${t}-${page}-lane${lane}.png`));
    await send(p, bytes.enc(knob, -1)); await send(p, bytes.touch(knob, false)); if (page === 'sound') await send(p, bytes.btn('shift', false)); await sleep(500);
    rows.push({ trial: t, lane, page, knob: knob + 1, saw: { page: s.row, lane: s.lane }, ok: s.row === page && s.lane === lane });
  }
  const right = rows.filter(r => r.ok).length; return { seed, right, of: trials, rows, fails: right < THRESH.glance ? [`seed ${seed}: ${right}/${trials}`] : [] };
}

async function logToggle(p) {
  const COUNT = `(() => { const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=slider], [role=button], [role=tab], [role=switch], [role=checkbox], [tabindex]:not([tabindex="-1"])'; const r = (e) => e.getBoundingClientRect(); return { controls: [...document.querySelectorAll(SEL)].filter(e => e.checkVisibility({ visibilityProperty: true }) && r(e).width > 0 && r(e).bottom > 0 && r(e).top < innerHeight && r(e).right > 0 && r(e).left < innerWidth).length, geo: JSON.stringify(__poly.scene.geo()), log: !document.getElementById('console-log').hidden, scroll: document.documentElement.scrollHeight - innerHeight }; })()`;
  const off = await p.eval(COUNT); await p.key('`', 'Backquote'); await sleep(200); const on = await p.eval(COUNT); await p.key('`', 'Backquote'); await sleep(200); const back = await p.eval(COUNT);
  const fails = []; if (!on.log || back.log) fails.push('` did not toggle the log'); if (on.controls !== off.controls) fails.push(`controls ${off.controls} → ${on.controls} with the log on`); if (on.geo !== off.geo) fails.push('the rings moved with the log on'); if (on.scroll > 0) fails.push('the page scrolls with the log on');
  return { off: { controls: off.controls }, on: { controls: on.controls }, ringsSame: on.geo === off.geo && back.geo === off.geo, fails };
}

// a destructive control's own box (A3's classes): a click on it is a hit, not a mis-click
const TARGET = `(x, y) => { const e = document.elementFromPoint(x, y); if (!e) return { what: 'nothing' };
  const c = e.closest('button, a[href], select, input, summary, [role=slider], label') || e, id = c.id || c.className || c.tagName;
  if (c.closest('a[href]') || c.closest('#btn-sample-file, #btn-break-file, #btn-mic, #btn-connect, #btn-midi-enable, input[type=file]')) return { what: 'skip', id };
  const playing = document.getElementById('btn-play').getAttribute('aria-label') === 'stop', m = c.closest('.lane-m'), li = m ? [...document.querySelectorAll('.lane-m')].indexOf(m) : -1;
  const dest = !!c.closest('#btn-random, #btn-wild, #btn-init, #btn-clear, #btn-load, #dice-make, #seed-today, #grooves button, .slot, #lib-list button, #wb-fresh, #gift-back') || (!!c.closest('#btn-play') && playing) || (li >= 0 && /kick/.test(__poly.m.lanes[li]?.voice || '') && !__poly.m.lanes[li].muted);
  return { what: dest ? 'destructive' : e.closest('#cv, #stage') && c === e ? 'canvas' : c === e && !c.matches('button, select, input, summary, [role=slider]') ? 'empty' : 'control', id }; }`;
async function misclick(p, { clicks = 600, seed = 11, w = 1512, h = 860 }) {
  const rng = mulberry32(seed), tally = { canvas: 0, empty: 0, control: 0, destructive: 0, skip: 0, nothing: 0 }, hits = [], accidents = [];
  await p.eval(`document.getElementById('btn-play').click()`); await sleep(1500);
  let n = await p.eval('(__poly.setlog.file(), __poly.setlog.log.entries().length)');
  for (let i = 0; i < clicks; i++) {
    const x = Math.round(rng() * (w - 1)), y = Math.round(rng() * (h - 1)), t = await p.eval(`(${TARGET})(${x}, ${y})`); tally[t.what]++;
    if (t.what === 'skip') continue;
    await p.click(x, y); await sleep(70);
    if (await p.eval(`!!document.querySelector('dialog[open]')`)) { await p.key('Escape'); await sleep(40); }   // help: closed again (Esc), as a hand would
    const fresh = await p.eval(`(() => { __poly.setlog.file(); const e = __poly.setlog.log.entries(); return e.slice(${n}); })()`); n += fresh.length;
    for (const e of fresh.filter(e => classOf(e) === 'destructive')) (t.what === 'destructive' ? hits : accidents).push({ click: i + 1, x, y, on: t.id, target: e.target, after: e.after });
    if (await p.eval(`document.getElementById('btn-play').getAttribute('aria-label') === 'play'`)) { await p.eval(`document.getElementById('btn-play').click()`); await sleep(300); n = await p.eval('(__poly.setlog.file(), __poly.setlog.log.entries().length)'); }   // back to playing (not a click of the run)
  }
  return { clicks, tally, hits, accidents, fails: accidents.length > THRESH.destructive ? [`${accidents.length} destructive changes from mis-clicks`] : [] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; }, has = (k) => process.argv.includes(k);
  const only = new Set(String(arg('--only', 'MOVE,A8,A2,LOG,MISCLICK')).split(',')), shots = arg('--shots', null), out = {};
  if (shots) mkdirSync(shots, { recursive: true });
  const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400) });
  try {
    const fresh = async () => openSet(b, { groove: 'techno' });
    if (only.has('MOVE')) out.MOVE = await moveRows(await fresh());
    if (only.has('A8')) out.A8 = await peekLatency(await fresh());
    if (only.has('A2')) { const p = await fresh(); out.A2 = [await glance(p, { seed: 1, shots }), await glance(p, { seed: 2, shots })]; }
    if (only.has('LOG')) out.LOG = await logToggle(await fresh());
    if (only.has('MISCLICK')) { const p = await fresh(); out.MISCLICK = await misclick(p, { clicks: +arg('--clicks', 600) }); out.MISCLICK.errors = p.errors.length; }
  } finally { await b.close(); }
  const fails = Object.entries(out).flatMap(([k, v]) => (Array.isArray(v) ? v.flatMap(x => x.fails) : v.fails).map(f => `${k}: ${f}`));
  if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
  const L = [];
  if (out.MOVE) L.push(`MOVE  ${Object.keys(out.MOVE.rows).length} rows · ${out.MOVE.fails.length ? out.MOVE.fails.join('; ') : 'all as Nils\'s table'}`);
  if (out.A8) L.push(`A8    peek after a touch: n ${out.A8.n}, p50 ${out.A8.p50?.toFixed(1)} ms, p95 ${out.A8.p95?.toFixed(1)} ms, max ${out.A8.max?.toFixed(1)} ms`);
  if (out.A2) L.push(`A2    scripted glance (rhythm / sound): ${out.A2.map(g => `seed ${g.seed} ${g.right}/${g.of}`).join(', ')}`);
  if (out.LOG) L.push(`LOG   controls ${out.LOG.off.controls} off / ${out.LOG.on.controls} on, rings ${out.LOG.ringsSame ? 'fixed' : 'MOVED'}`);
  if (out.MISCLICK) L.push(`MISCLICK ${out.MISCLICK.clicks} clicks: ${Object.entries(out.MISCLICK.tally).map(([k, v]) => `${k} ${v}`).join(', ')} · direct hits on destructive controls ${out.MISCLICK.hits.length} (${out.MISCLICK.hits.map(h => `${h.on}→${h.target}`).join(', ') || '—'}) · mis-click accidents ${out.MISCLICK.accidents.length}${out.MISCLICK.accidents.length ? ` (${out.MISCLICK.accidents.map(a => `#${a.click} ${a.on}→${a.target}`).join(', ')})` : ''} · page errors ${out.MISCLICK.errors}`);
  console.log(L.join('\n')); if (fails.length) console.log(`FAIL\n  ${fails.join('\n  ')}`);
  if (has('--assert') && fails.length) process.exit(1);
}
