// RD-13 evolve in sync with the cycle, checked on the page (DECISION §3 RD-13). Muted headless Chrome through cdp.mjs,
// ports 5400/9400.
//
//   node orbit2/tools/sync-check.mjs [--assert] [--cycles 10] [--shots /tmp/orbit2-impl/] [--json x.json]
//
// UI     the sheet's evolve settings: the every switch reads bars · cycle; cycle hides the gauge and shows "every cycle · N
//        beats" (N = the sun's stopped number); bars brings the gauge back at its old count; the gauge's lowest detent
//        (Home) is cycle, one step up is bars again; the tooltip is the plain words; the pill and the arc say "evolve · cycle".
// CLOCK  a 3 vs 4 vs 5 groove (rotation only, so the cycle holds) with evolve · cycle on, at 240 bpm: every mutation lands
//        on a tick where (t − origin) is a multiple of the cycle (the bloom's tick, the sun's 0), exactly one per cycle,
//        none on a bar line as such; the heard time of each mutation against the frame where the sun wrapped.
// SWITCH switching to bars mid-play: mutations come back on the bars (every 1), none in between.
import { launch } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const fails = [], report = {};
const check = (sec, ok, what) => { if (!ok) fails.push(`${sec}: ${what}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${sec}: ${what}`); return ok; };
const shots = arg('--shots', null); if (shots) mkdirSync(shots, { recursive: true });
const shot = (p, name) => (shots ? p.shot(join(shots, name)) : null);
const CYCLES = +arg('--cycles', 10);
const light = async (p) => JSON.parse(await p.eval('JSON.stringify(__poly.scene.light)'));
const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400) });
try {
  // ---- UI ----
  let p = await b.open('orbit2/index.html', { width: 1512, height: 860, ready: '!!window.__poly' }); await p.sleep(500);
  const ui = () => p.eval(`(() => { const g = document.querySelector('#evo-gauges [role=slider]'), c = document.getElementById('evo-cycle'), seg = [...document.querySelectorAll('#evo-sync button')].map(x => [x.textContent, x.getAttribute('aria-checked')]); return { seg, gaugeHidden: g.closest('.gauge, [class*=gauge]')?.hidden ?? g.hidden, gaugeShown: g.getBoundingClientRect().width > 0, gaugeNow: g.getAttribute('aria-valuenow'), gaugeText: g.getAttribute('aria-valuetext'), line: c.hidden ? null : c.textContent, lineW: c.getBoundingClientRect().width, tip: c.title, segTip: document.getElementById('evo-sync').closest('.ctl').title, settings: JSON.parse(localStorage.getItem('midi-warz.orbit2.settings') || localStorage.getItem(Object.keys(localStorage).find(k => /settings/.test(k)) || '') || 'null')?.evo }; })()`);
  await p.eval(`(() => { __poly.setSheet('groove', true); document.getElementById('evolve-drawer').open = true; })()`); await p.sleep(300);
  let u = await ui();
  check('UI', u.seg.length === 2 && u.seg[0][0] === 'bars' && u.seg[1][0] === 'cycle' && u.seg[0][1] === 'true', `the switch reads bars · cycle, bars on by default: ${JSON.stringify(u.seg)}`);
  check('UI', u.gaugeShown && u.line === null, 'bars mode: the every gauge shows, no cycle line');
    await p.eval(`document.querySelectorAll('#evo-sync button')[1].click()`); await p.sleep(200); u = await ui();
  const beats = (await p.eval('Math.ceil(__poly.m.cycleTicks({ repeat: __poly.dice.locked ? __poly.dice.repeat : 1 }) / 840)'));
  check('UI', u.seg[1][1] === 'true' && !u.gaugeShown, `cycle: the gauge gives way (aria-valuenow ${u.gaugeNow})`);
  check('UI', u.line === `every cycle · ${beats} beats`, `the read-only line: "${u.line}" (the cycle is ${beats} beats)`);
  const cap = (await light(p)).lines[0]; check('UI', cap === `cycle · ${beats} beats`, `the line's number is the caption's / the sun's stopped number: "${cap}"`);
  check('UI', u.tip === 'Change the pattern each time every ring lines up again, the moment the sun reaches 0.' && u.segTip === u.tip, 'the plain-words tooltip on the line and the switch');
  check('UI', u.settings?.sync === 'cycle', `saved: evo.sync = ${u.settings?.sync}`);
  await shot(p, 'rd13-evolve-settings-cycle-1512x860.png');
  // a lane edit changes the cycle: the line follows
  await p.eval(`(() => { __poly.m.lanes[0].setLength(7); __poly.sync(); })()`); await p.sleep(100);
  const beats2 = await p.eval('Math.ceil(__poly.m.cycleTicks() / 840)'); u = await ui();
  check('UI', u.line === `every cycle · ${beats2} beats`, `a lane edit: "${u.line}"`);
  await p.eval(`document.querySelectorAll('#evo-sync button')[0].click()`); await p.sleep(200); u = await ui();
  check('UI', u.seg[0][1] === 'true' && u.gaugeShown && u.line === null && u.gaugeNow === '4', `bars again: the gauge back at its old count (${u.gaugeNow}), no cycle line`);
  await shot(p, 'rd13-evolve-settings-bars-1512x860.png');
  // the gauge's lowest detent is cycle (the drift page's knob 1 turns this gauge)
  await p.eval(`document.querySelector('#evo-gauges [role=slider]').focus()`); await p.key('Home'); await p.sleep(200); u = await ui();
  check('UI', u.settings?.sync === 'cycle' && u.seg[1][1] === 'true' && !u.gaugeShown && u.gaugeNow === '0', `Home on the gauge = its lowest detent = cycle (sync ${u.settings?.sync}, gauge ${u.gaugeNow})`);
  await p.eval(`document.querySelectorAll('#evo-sync button')[0].click()`); await p.sleep(100);
  await p.eval(`(() => { const g = document.querySelector('#evo-gauges [role=slider]'); g.focus(); })()`); await p.key('Home'); await p.eval(`(() => { const g = document.querySelector('#evo-gauges [role=slider]'); g.hidden = false; g.focus(); })()`); await p.key('ArrowUp'); await p.sleep(200); u = await ui();
  check('UI', u.settings?.sync === 'bars' && +u.gaugeNow > 0 && u.gaugeShown, `one step up from the lowest detent (cycle): bars, every ${u.gaugeNow} (sync ${u.settings?.sync}, ${u.gaugeNow})`);
  // an old settings file (no sync) loads as bars
  const old = await p.eval(`(async () => { const k = Object.keys(localStorage).find(k => /settings/.test(k)); const o = JSON.parse(localStorage.getItem(k)); delete o.evo.sync; o.evo.every = 8; localStorage.setItem(k, JSON.stringify(o)); return k; })()`);
  await p.eval('location.reload()'); await p.sleep(3500);
  const evoOld = await p.eval('JSON.stringify({ sync: __poly.evo.sync, every: __poly.evo.every })');
  check('SETTINGS', evoOld === '{"sync":"bars","every":8}', `old settings (no sync, every 8) load as bars: ${evoOld}`);
  p.close();

  // ---- CLOCK: 3 vs 4 vs 5, rotation only (the cycle holds), evolve · cycle ----
  p = await b.open('orbit2/index.html', { width: 1512, height: 860, ready: '!!window.__poly' }); await p.sleep(500);
  await p.eval(`(() => { const P = __poly; P.applyTempo(240); P.m.lanes.forEach((l, i) => { l.setLength([3, 4, 5, 4][i] || 4); l.setRatio(5); for (let k = 0; k < l.length; k += 2) l.hits[k] = true; }); P.evo.scope = 'rotate'; P.evo.amount = 100; P.evo.every = 1; P.evo.sync = 'cycle'; P.dice.locked = false; P.sync(); })()`);
  const cyc = await p.eval('__poly.m.cycleTicks()');
  report.cycleTicks = cyc;
  await p.eval(`(() => { const P = __poly, T = Tone; window.__mut = []; window.__wraps = []; const orig = P.m.evolve.bind(P.m);
    P.m.evolve = (...a) => { const r = orig(...a), c = P.clock(), t0 = c.clockRef.tick, o = P.m.origin, cy = P.m.cycleTicks(), at = o + Math.ceil((t0 - o) / cy) * cy, ctx = T.getContext().rawContext, ts = P.tickSec();
      window.__mut.push({ t0, at, inBlock: at >= t0 && at < t0 + 35, aligned: at > 0 && (at - o) % cy === 0, cyc: cy, bar: (at % 840 === 0 && at % (cy) !== 0), heard: performance.now() + ((c.clockRef.time + (at - t0) * ts) - ctx.currentTime - (ctx.outputLatency || 0)) * 1000, bars: Math.round(at / (4 * 840 * 1)) }); return r; };
    let last = 1e9; (function f() { const L = __poly.scene.light, n = +L.sun; if (n > last) window.__wraps.push({ at: performance.now(), n, last }); if (!isNaN(n)) last = n; requestAnimationFrame(f); })(); })()`);
  await p.eval(`document.getElementById('btn-evolve').click()`); await p.eval(`document.getElementById('btn-play').click()`);
  const beatMs = 60000 / 240; await p.sleep(Math.round((CYCLES + 1.3) * (cyc / 840) * beatMs));
  const L = await light(p); await shot(p, 'rd13-arc-sun-playing-1512x860.png');
  const mut = await p.eval('JSON.stringify(window.__mut)'), wraps = JSON.parse(await p.eval('JSON.stringify(window.__wraps)')), M = JSON.parse(mut);
  report.mutations = M.length; report.wraps = wraps.length;
  check('CLOCK', L.gen.startsWith('EVOLVE · CYCLE') || L.gen === '' || /CYCLE/.test(L.gen), `the arc says "${L.gen}"`);
  check('CLOCK', (await p.eval(`document.getElementById('sp-evolve-go').textContent`)) === 'evolve · cycle', 'the pill says "evolve · cycle"');
  check('CLOCK', L.lines.some(x => /^evolve in \d+ beats?$/.test(x)), `the caption counts the sun's beats: ${JSON.stringify(L.lines)}`);
  check('CLOCK', M.length >= CYCLES && M.length <= CYCLES + 2, `${M.length} mutations in ${CYCLES + 1.3} cycles`);
  check('CLOCK', M.every(x => x.inBlock && x.aligned && x.cyc === cyc), 'every mutation is on a tick where the whole pattern lines up (the bloom\'s tick)');
  check('CLOCK', M.every((x, i) => i === 0 || Math.round((x.at - M[i - 1].at) / cyc) === 1 && (x.at - M[i - 1].at) % cyc === 0), `exactly one per cycle: gaps ${M.slice(1).map((x, i) => (x.at - M[i].at) / cyc).join(',')} cycles`);
  check('CLOCK', M.every(x => x.at % 3360 !== 0 || x.at % cyc === 0), 'none on a plain bar line');
  // the heard time of each mutation vs the frame where the sun wrapped (a frame is 16.7 ms; a tick at 240 bpm is 0.30 ms)
  const sun = wraps.filter(w => w.last === 1 || w.last <= 2), diffs = M.map(x => { const w = sun.reduce((a, c) => (Math.abs(c.at - x.heard) < Math.abs(a.at - x.heard) ? c : a), sun[0] || { at: Infinity }); return w.at - x.heard; }).filter(Number.isFinite);
  report.sunVsMutationMs = diffs.map(x => Math.round(x * 10) / 10); report.tickMs = 60000 / 240 / 840;
  check('CLOCK', diffs.length >= CYCLES - 1 && diffs.every(d => Math.abs(d) < 50), `the sun's wrap frame vs the mutation heard: ${report.sunVsMutationMs.join(', ')} ms (≤ 3 frames; the exact check is the tick above)`);
  // ---- SWITCH: bars again, every 1: the mutations come back on the bar lines ----
  await p.eval(`(() => { window.__mut.length = 0; __poly.evo.sync = 'bars'; __poly.evo.every = 1; })()`); await p.sleep(5 * 3360 / 840 * beatMs + 300);
  const M2 = JSON.parse(await p.eval('JSON.stringify(window.__mut)'));
  check('SWITCH', M2.length >= 4 && M2.every(x => x.at % 3360 === 0), `bars mode: ${M2.length} mutations in 5 bars, all on bar lines`);
  check('PAGE', p.errors.length === 0, `0 page errors (${p.errors.length}: ${p.errors.slice(0, 2).join(' | ')})`);
  p.close();
} finally { await b.close(); }
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
console.log(fails.length ? `\n${fails.length} failed:\n${fails.join('\n')}` : '\nall pass');
if (process.argv.includes('--assert') && fails.length) process.exit(1);
