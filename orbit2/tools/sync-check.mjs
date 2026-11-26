// RD-13 evolve in sync with the cycle, checked on the page (DECISION §3 RD-13). Muted headless Chrome through cdp.mjs,
// ports 5400/9400.
//
//   node orbit2/tools/sync-check.mjs [--assert] [--only UI,CLOCK,SWITCH,DICE,DRIFT,ORIGIN,RESYNC] [--cycles 10]
//        [--shots /tmp/orbit2-impl/] [--json x.json] [--port 5400 --debug-port 9400] [--root /tmp/x (a `git archive`)]
//
// UI     the sheet's evolve settings: the every switch reads bars · cycle; cycle hides the gauge and shows "every cycle · N
//        beats" (N = the sun's stopped number); bars brings the gauge back at its old count; the gauge's lowest detent
//        (Home) is cycle and hands the keys to the switch; the tooltip is the plain words; old settings load as bars.
// CLOCK  a 3 vs 4 vs 5 groove (rotation only, so the cycle holds) with evolve · cycle on, at 240 bpm: every mutation lands
//        on a tick where (t − origin) is a multiple of the cycle in force (the bloom's tick, the sun's 0), exactly one per
//        cycle, none on a bar line as such; the first frame the sun shows the new count against the heard mutation.
// SWITCH switching to bars mid-play: mutations come back on the bars (every 1), none in between.
// DICE   (round 1) the sheet's "every cycle · N beats" follows the sun when the dice change the cycle (a lock, a repeat).
// DRIFT  (round 1) ?drift, − held: knob 1 turned to its lowest detent stays on the row reading "cycle" (label "every"),
//        the peek says it in plain words; one click up is bars (every 1); let go, the sheet's gauge gives way to the line.
// ORIGIN (round 1) evolve · cycle, a long cycle: a slot coming in with "restart on change" and a new meter move the origin
//        mid-count: no mutation there; "full cycle": the slot comes in on the wrap and plays to its own first alignment
//        (no mutation on its tick, the next one new cycle later). Round 2: at each move the sun keeps its count until the
//        move is heard, then shows the new one.
// Each part runs in a browser of its own (a fresh profile), and a part that plays fails loudly when Play never starts.
// RESYNC (round 1) scope all (mutations change the cycle): the sun stays on its last beat until each mutation is heard,
//        frames read against the heard audio time (round 1: it left 1 up to 97 ms early).
import { launch } from './cdp.mjs';
import { bytes } from './session-core.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('--only', 'UI,CLOCK,SWITCH,DICE,DRIFT,ORIGIN,RESYNC').split(',');
const fails = [], report = {};
const check = (sec, ok, what) => { if (!ok) fails.push(`${sec}: ${what}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${sec}: ${what}`); return ok; };
const shots = arg('--shots', null); if (shots) mkdirSync(shots, { recursive: true });
const shot = (p, name) => (shots ? p.shot(join(shots, name)) : null);
const CYCLES = +arg('--cycles', 10);
const light = async (p) => JSON.parse(await p.eval('JSON.stringify(__poly.scene.light)'));
const ready = async (p) => { for (let i = 0; i < 240; i++) { if (await p.eval('!!window.__poly').catch(() => false)) return; await p.sleep(250); } throw new Error('orbit2 did not start'); };
const open = async (path = 'orbit2/index.html') => { const p = await b.open(path, { width: 1512, height: 860, ready: '!!window.__poly' }); await p.sleep(500); return p; };
const send = (p, x) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(x)}))`);
// every mutation: the tick it landed on (the wrap of the cycle in force before it, inside the block that ran it), the
// cycle before and after, the origin, and the audio time the tick plays at (heard when the context's heard time gets there)
const HOOK = `(() => { const P = __poly; window.__mut = []; const orig = P.m.evolve.bind(P.m), opts = () => ({ repeat: P.dice.locked ? P.dice.repeat : 1 });
  P.m.evolve = (...a) => { const before = P.m.cycleTicks(opts()), o = P.m.origin, c = P.clock(), t0 = c.clockRef.tick, at = o + Math.ceil((t0 - o) / before) * before, r = orig(...a);
    window.__mut.push({ t0, at, before, after: P.m.cycleTicks(opts()), origin: o, inBlock: at >= t0 && at < t0 + 35, aligned: at > o && (at - o) % before === 0, audio: c.clockRef.time + (at - t0) * P.tickSec() }); return r; }; })()`;
// every frame: the heard audio time and what the sun drew; every move of the origin (a slot that restarts the lanes, a
// new meter), with the audio time its tick plays at and the cycle then
const SAMPLER = `(() => { window.__fr = []; window.__oc = []; const ctx = Tone.getContext().rawContext; let o0 = __poly.m.origin; (function f() { const P = __poly, L = P.scene.light, o = P.m.origin;
  if (o !== o0) { const c = P.clock(); window.__oc.push({ origin: o, from: o0, audio: c.clockRef.time + (o - c.clockRef.tick) * P.tickSec(), cyc: P.m.cycleTicks({ repeat: P.dice.locked ? P.dice.repeat : 1 }) }); o0 = o; }
  window.__fr.push({ a: ctx.currentTime - (ctx.outputLatency || 0), s: L.sun }); if (window.__fr.length < 30000) requestAnimationFrame(f); })(); })()`;
// Play, and wait until the clock really runs (round 2: a part that judged a clock that never started passed nothing)
const play = async (p) => { await p.eval(`document.getElementById('btn-play').click()`); for (let i = 0; i < 60; i++) { if (await p.eval(`Tone.getTransport().state === 'started' && __poly.clock().tick > 0`)) return; await p.sleep(250); } throw new Error('Play did not start: the clock never ticked'); };
// each part in a browser of its own (a fresh profile): one part's saved data never reaches the next, and a later tab of
// one launch that loads a groove and presses Play can leave the clock stopped (round 2; the phase start does it too)
const port = +arg('--port', 5400), debugPort = +arg('--debug-port', 9400), root = arg('--root', undefined);
let b = null;
const part = async (on, name, fn) => { if (!on) return; if (b) await b.close(); b = await launch({ port, debugPort, root }); try { await fn(); } catch (e) { check(name, false, `stopped: ${e.message}`); } };
try {
  let p;
  // ---- UI ----
  await part(only.includes('UI'), 'UI', async () => {
    p = await open();
    const ui = () => p.eval(`(() => { const g = document.querySelector('.evo-every') || document.querySelector('#evo-gauges [role=slider]'), c = document.getElementById('evo-cycle'), seg = [...document.querySelectorAll('#evo-sync button')].map(x => [x.textContent, x.getAttribute('aria-checked')]); return { seg, gaugeShown: g.getBoundingClientRect().width > 0, gaugeNow: g.getAttribute('aria-valuenow'), label: g.querySelector('.g-label').textContent, focusSwitch: document.activeElement?.closest?.('#evo-sync') ? document.activeElement.textContent : null, line: c.hidden ? null : c.textContent, tip: c.title, segTip: document.getElementById('evo-sync').closest('.ctl').title, settings: JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /orbit2\\.settings/.test(k)) || '') || 'null')?.evo }; })()`);
    await p.eval(`(() => { __poly.setSheet('groove', true); document.getElementById('evolve-drawer').open = true; })()`); await p.sleep(300);
    let u = await ui();
    check('UI', u.seg.length === 2 && u.seg[0][0] === 'bars' && u.seg[1][0] === 'cycle' && u.seg[0][1] === 'true', `the switch reads bars · cycle, bars on by default: ${JSON.stringify(u.seg)}`);
    check('UI', u.gaugeShown && u.line === null && u.label === 'every · bars', `bars mode: the every gauge shows ("${u.label}"), no cycle line`);
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
    check('UI', u.seg[0][1] === 'true' && u.gaugeShown && u.line === null && u.gaugeNow === '4' && u.label === 'every · bars', `bars again: the gauge back at its old count (${u.gaugeNow}), no cycle line`);
    await shot(p, 'rd13-evolve-settings-bars-1512x860.png');
    // the gauge's lowest detent is cycle (the drift page's knob 1 turns this gauge); the keys go on to the switch
    await p.eval(`document.querySelector('.evo-every').focus()`); await p.key('Home'); await p.sleep(200); u = await ui();
    check('UI', u.settings?.sync === 'cycle' && u.seg[1][1] === 'true' && !u.gaugeShown && u.gaugeNow === '0', `Home on the gauge = its lowest detent = cycle (sync ${u.settings?.sync}, gauge ${u.gaugeNow})`);
    check('UI', u.focusSwitch === 'cycle', `the keys land on the switch's "cycle", not the page (focus: ${u.focusSwitch})`);
    await p.eval(`document.querySelectorAll('#evo-sync button')[0].click()`); await p.sleep(200); u = await ui();
    check('UI', u.settings?.sync === 'bars' && u.gaugeShown && u.gaugeNow === '4', `bars on the switch: the gauge back at 4 (${u.settings?.sync}, ${u.gaugeNow})`);
    // an old settings file (no sync) loads as bars
    await p.eval(`(() => { const k = Object.keys(localStorage).find(k => /orbit2\\.settings/.test(k)); const o = JSON.parse(localStorage.getItem(k)); delete o.evo.sync; o.evo.every = 8; localStorage.setItem(k, JSON.stringify(o)); })()`);
    await p.send('Page.reload'); await p.sleep(1500); await ready(p); await p.sleep(300);
    const evoOld = await p.eval('JSON.stringify({ sync: __poly.evo.sync, every: __poly.evo.every })');
    check('SETTINGS', evoOld === '{"sync":"bars","every":8}', `old settings (no sync, every 8) load as bars: ${evoOld}`);
    check('UI', p.errors.length === 0, `0 page errors (${p.errors.slice(0, 2).join(' | ')})`);
    p.close();
  });

  // ---- CLOCK: 3 vs 4 vs 5, rotation only (the cycle holds), evolve · cycle ----
  await part(only.includes('CLOCK') || only.includes('SWITCH'), 'CLOCK', async () => {
    p = await open();
    await p.eval(`(() => { const P = __poly; P.applyTempo(240); P.m.lanes.forEach((l, i) => { l.setLength([3, 4, 5, 4][i] || 4); l.setRatio(5); for (let k = 0; k < l.length; k += 2) l.hits[k] = true; }); P.evo.scope = 'rotate'; P.evo.amount = 100; P.evo.every = 1; P.evo.sync = 'cycle'; P.dice.locked = false; P.sync(); })()`);
    const cyc = await p.eval('__poly.m.cycleTicks()'); report.cycleTicks = cyc;
    await p.eval(HOOK); await p.eval(SAMPLER);
    await p.eval(`document.getElementById('btn-evolve').click()`); await play(p);
    const beatMs = 60000 / 240;
    if (only.includes('CLOCK')) {
      await p.sleep(Math.round((CYCLES + 1.3) * (cyc / 840) * beatMs));
      const L = await light(p); await shot(p, 'rd13-arc-sun-playing-1512x860.png');
      const M = JSON.parse(await p.eval('JSON.stringify(window.__mut)')), F = JSON.parse(await p.eval('JSON.stringify(window.__fr)'));
      report.mutations = M.length;
      check('CLOCK', /CYCLE/.test(L.gen) || L.gen === '', `the arc says "${L.gen}"`);
      check('CLOCK', (await p.eval(`document.getElementById('sp-evolve-go').textContent`)) === 'evolve · cycle', 'the pill says "evolve · cycle"');
      check('CLOCK', L.lines.some(x => /^evolve in \d+ beats?$/.test(x)), `the caption counts the sun's beats: ${JSON.stringify(L.lines)}`);
      check('CLOCK', M.length >= CYCLES && M.length <= CYCLES + 2, `${M.length} mutations in ${CYCLES + 1.3} cycles`);
      check('CLOCK', M.every(x => x.inBlock && x.aligned && x.before === cyc), 'every mutation is on a tick where the whole pattern lines up (the bloom\'s tick)');
      check('CLOCK', M.every((x, i) => i === 0 || x.at - M[i - 1].at === cyc), `exactly one per cycle: gaps ${M.slice(1).map((x, i) => (x.at - M[i].at) / cyc).join(',')} cycles`);
      check('CLOCK', M.every(x => x.at % 3360 !== 0 || x.at % cyc === 0), 'none on a plain bar line');
      // the first frame the sun shows the new count, against the heard time of the mutation (a frame is 16.7 ms; a tick 0.3 ms)
      const flips = M.map(x => { const i = F.findIndex(f => f.a >= x.audio); return i > 0 ? { last: F[i - 1].s, first: F[i].s, ms: (F[i].a - x.audio) * 1000 } : null; }).filter(Boolean);
      report.sunFlipMs = flips.map(f => Math.round(f.ms * 10) / 10);
      check('CLOCK', flips.length >= CYCLES - 1 && flips.every(f => f.last === '1' && f.first !== '1' && f.ms < 50), `the sun reads 1 up to each heard mutation and the new count from the next frame: ${report.sunFlipMs.join(', ')} ms`);
    }
    if (only.includes('SWITCH')) {   // ---- bars again, every 1: the mutations come back on the bar lines ----
      if (!only.includes('CLOCK')) await p.sleep(2000);
      await p.eval(`(() => { window.__mut.length = 0; __poly.evo.sync = 'bars'; __poly.evo.every = 1; })()`); await p.sleep(5 * 3360 / 840 * beatMs + 300);
      const M2 = JSON.parse(await p.eval('JSON.stringify(window.__mut)'));
      check('SWITCH', M2.length >= 4 && M2.every(x => x.t0 <= Math.ceil(x.t0 / 3360) * 3360 && Math.ceil(x.t0 / 3360) * 3360 < x.t0 + 35), `bars mode: ${M2.length} mutations in 5 bars, all on bar lines`);
    }
    check('PAGE', p.errors.length === 0, `0 page errors (${p.errors.length}: ${p.errors.slice(0, 2).join(' | ')})`);
    p.close();
  });

  // ---- DICE: the line follows the sun when the dice change the cycle ----
  await part(only.includes('DICE'), 'DICE', async () => {
    p = await open();
    const read = () => p.eval(`(() => { const P = __poly, n = Math.ceil(P.m.cycleTicks({ repeat: P.dice.locked ? P.dice.repeat : 1 }) / 840); return { line: document.getElementById('evo-cycle').textContent, n, aria: document.getElementById('cv').getAttribute('aria-label') }; })()`);
    await p.eval(`(() => { const P = __poly; P.setSheet('groove', true); document.getElementById('evolve-drawer').open = true; document.querySelectorAll('#evo-sync button')[1].click(); P.m.humanize = 0.1; P.dice.locked = false; P.dice.repeat = 3; P.sync(); })()`); await p.sleep(200);
    let d = await read(); check('DICE', d.line === `every cycle · ${d.n} beats`, `dice free: "${d.line}" (the sun's ${d.n})`);
    await p.eval(`document.getElementById('btn-dice').click()`); await p.sleep(200); d = await read();
    check('DICE', d.line === `every cycle · ${d.n} beats` && d.aria.includes(`aligns in ${d.n} beats`), `dice locked (repeat 3): "${d.line}" (the sun's ${d.n}; "${d.aria}")`);
    await p.eval(`(() => { const g = [...document.querySelectorAll('[role=slider]')].find(e => e.getAttribute('aria-label') === 'repeat'); __poly.reveal(g); g.focus(); })()`); await p.key('ArrowUp'); await p.sleep(200); d = await read();
    check('DICE', d.line === `every cycle · ${d.n} beats` && (await p.eval('__poly.dice.repeat')) === 4, `repeat 4 by its gauge: "${d.line}" (the sun's ${d.n})`);
    check('DICE', p.errors.length === 0, `0 page errors (${p.errors.slice(0, 2).join(' | ')})`);
    p.close();
  });

  // ---- DRIFT: knob 1's lowest detent on the drift page ----
  await part(only.includes('DRIFT'), 'DRIFT', async () => {
    p = await open('orbit2/index.html?drift');
    await p.eval(`(async () => { await __poly.wake(); __poly.move.transport = { send: () => {} }; __poly.move.inControl = true; __poly.loadGroove('techno'); __poly.sync(); })()`); await p.sleep(800);
    const knob = () => p.eval(`(() => { const g = document.getElementById('knobs').children[0]?.firstElementChild, pk = document.getElementById('peek'); return { sync: __poly.evo.sync, every: __poly.evo.every, on: __poly.evo.on, isEvery: !!g?.classList.contains('evo-every'), drawn: !!g && g.getBoundingClientRect().width > 0, val: g?.querySelector('.g-val')?.textContent, label: g?.querySelector('.g-label')?.textContent, peek: pk.hidden ? null : document.getElementById('peek-mean').textContent }; })()`);
    const every = await p.eval('__poly.evo.every'), on = await p.eval('__poly.evo.on');
    await send(p, bytes.btn('minus', true)); await p.sleep(600);
    for (let i = 0; i <= every; i++) { await send(p, bytes.enc(0, -1)); await p.sleep(60); }
    await p.sleep(100); let k = await knob();
    check('DRIFT', k.sync === 'cycle' && k.isEvery && k.drawn && k.val === 'cycle' && k.label === 'every', `− held, knob 1 down ${every + 1} clicks: cycle, knob 1 stays on the row reading "${k.val}" · "${k.label}" (drawn ${k.drawn})`);
    check('DRIFT', k.peek === 'a mutation each time every ring lines up again', `the peek's words: "${k.peek}"`);
    await shot(p, 'rd13-drift-knob1-cycle-1512x860.png');
    await send(p, bytes.enc(0, 1)); await p.sleep(160); k = await knob();
    check('DRIFT', k.sync === 'bars' && k.every === 1 && k.val === '1' && k.label === 'every · bars' && k.peek === 'a mutation every 1 bar', `one click up: bars, every ${k.every} ("${k.val}" · "${k.label}", "${k.peek}")`);
    await send(p, bytes.enc(0, -1)); await p.sleep(100); await send(p, bytes.btn('minus', false)); await p.sleep(700);
    const sheet = await p.eval(`(() => { const g = document.querySelector('.evo-every'); return { home: !!g.closest('#evo-gauges'), shown: getComputedStyle(g).display !== 'none', line: document.getElementById('evo-cycle').hidden ? null : document.getElementById('evo-cycle').textContent, sync: __poly.evo.sync, on: __poly.evo.on }; })()`);
    check('DRIFT', sheet.sync === 'cycle' && sheet.home && !sheet.shown && /^every cycle · \d+ beats?$/.test(sheet.line || ''), `let go at cycle: the gauge is back in the sheet, hidden there, the line reads "${sheet.line}"`);
    check('DRIFT', sheet.on === on, `the hold with knobs turned toggles nothing (evolve ${on} → ${sheet.on})`);
    check('DRIFT', p.errors.length === 0, `0 page errors (${p.errors.slice(0, 2).join(' | ')})`);
    p.close();
  });

  // ---- ORIGIN: a slot or a meter moving the origin mid-count; the "full cycle" switch ----
  await part(only.includes('ORIGIN'), 'ORIGIN', async () => {
    p = await open();
    // the sun across a move of the origin: the old count until the move is heard (nothing shows the new count before it),
    // the new count from then (round 2: a moved origin had no frame check; the round-1 code showed it up to 89 ms early)
    const moved = async (k, what) => {
      const oc = JSON.parse(await p.eval('JSON.stringify(window.__oc.filter(o => o.origin > 0))'))[k], F = JSON.parse(await p.eval('JSON.stringify(window.__fr)'));
      if (!oc) return check('ORIGIN', false, `${what}: no move of the origin seen`);
      const n = String(Math.ceil(oc.cyc / 840)), pre = F.filter(f => f.a >= oc.audio - 0.3 && f.a < oc.audio), early = pre.filter(f => f.s === n), shown = F.some(f => f.a >= oc.audio && f.a < oc.audio + 0.1 && f.s === n);
      check('ORIGIN', pre.length >= 5 && !early.length && shown, `${what}: the sun keeps its count until the move is heard, then reads ${n} (${pre.length} frames before it, ${early.length} early${early.length ? `, from ${Math.round((oc.audio - early[0].a) * 1000)} ms before` : ''})`);
    };
    await p.eval(`(() => { const P = __poly; P.loadGroove('techno'); P.applyTempo(240); [16, 12, 10, 16].forEach((n, i) => P.m.lanes[i]?.setLength(n)); P.evo.scope = 'rotate'; P.evo.amount = 100; P.evo.sync = 'cycle'; P.dice.locked = false; P.bank.switchAt = 'bar'; P.bank.restart = true; P.sync(); P.saveSlot(0); P.saveSlot(1); })()`);
    const cyc = await p.eval('__poly.m.cycleTicks()'); report.originCycleBeats = cyc / 840;
    await p.eval(HOOK); await p.eval('__poly.setEvolve(true)'); await play(p); await p.eval(SAMPLER); await p.sleep(2600);
    const sunA = (await light(p)).sun;
    await p.eval('__poly.recallSlot(0)'); await p.sleep(2200);   // slot 1 is the current one (saved last)
    const a = JSON.parse(await p.eval('JSON.stringify({ current: __poly.bank.current, origin: __poly.m.origin, mut: window.__mut.length, sun: __poly.scene.light.sun })'));
    check('ORIGIN', a.current === 0 && a.origin > 0 && a.mut === 0, `a slot with "restart on change" came in on a bar line (origin → ${a.origin}, the sun read ${sunA} before): ${a.mut} mutations (the cycle is ${cyc / 840} beats)`);
    await moved(0, 'the slot');
    await p.eval(`(() => { __poly.m.setMeter('3/4'); __poly.sync(); })()`); await p.sleep(2200);
    const bm = JSON.parse(await p.eval('JSON.stringify({ origin: __poly.m.origin, mut: window.__mut.length, bar: __poly.bars.len })'));
    check('ORIGIN', bm.origin !== a.origin && bm.bar === 2520 && bm.mut === 0, `a new meter's first bar line (origin → ${bm.origin}): ${bm.mut} mutations`);
    await moved(1, 'the new meter');
    // "full cycle": a 4-beat pattern, slot 2 holds a 3-beat one; the slot comes in on the wrap, restarts, plays its cycle
    await p.eval(`document.getElementById('btn-play').click()`); await p.sleep(400);
    await p.eval(`(() => { const P = __poly; P.m.setMeter('4/4'); P.m.lanes.forEach((l, i) => { l.setLength(3); l.setRatio(5); }); P.sync(); P.saveSlot(2); P.m.lanes.forEach((l, i) => l.setLength([2, 4, 4, 4][i])); P.sync(); P.bank.switchAt = 'cycle'; P.bank.restart = true; window.__mut.length = 0; window.__oc.length = 0; })()`);
    const c4 = await p.eval('__poly.m.cycleTicks()');
    await play(p); await p.sleep(2300);
    await p.eval('__poly.recallSlot(2)'); await p.sleep(2600);
    const f = JSON.parse(await p.eval('JSON.stringify({ current: __poly.bank.current, origin: __poly.m.origin, cyc: __poly.m.cycleTicks(), mut: window.__mut })'));
    const after = f.mut.filter(x => x.at >= f.origin), onSlot = f.mut.filter(x => x.at === f.origin);
    check('ORIGIN', f.current === 2 && f.origin > 0 && f.origin % c4 === 0, `"full cycle": slot 2 came in on the 4-beat pattern's wrap (tick ${f.origin})`);
    check('ORIGIN', onSlot.length === 0 && after.length >= 1 && after[0].at === f.origin + f.cyc && after.every(x => x.aligned), `no mutation on the slot's own tick; the next one new cycle (${f.cyc / 840} beats) after it: ${after.map(x => x.at - f.origin).join(', ')} ticks in`);
    await moved(0, 'the "full cycle" slot');
    check('ORIGIN', p.errors.length === 0, `0 page errors (${p.errors.slice(0, 2).join(' | ')})`);
    p.close();
  });

  // ---- RESYNC: mutations that change the cycle; the sun keeps the heard count ----
  await part(only.includes('RESYNC'), 'RESYNC', async () => {
    p = await open();
    await p.eval(`(() => { const P = __poly; P.applyTempo(240); P.m.lanes.forEach((l, i) => { l.setLength([2, 3, 2, 3][i] || 2); l.setRatio(5); l.hits[0] = true; }); P.evo.scope = 'all'; P.evo.amount = 100; P.evo.maxBars = 2; P.evo.home = 0; P.evo.gravity = 0; P.evo.sync = 'cycle'; P.dice.locked = true; P.dice.seed = 11; P.dice.repeat = 1; P.sync(); })()`);
    await p.eval(HOOK); await p.eval(SAMPLER); await p.eval('__poly.setEvolve(true)'); await play(p);
    await p.sleep(22000);
    const M = JSON.parse(await p.eval('JSON.stringify(window.__mut)')), F = JSON.parse(await p.eval('JSON.stringify(window.__fr)')), beat = 60 / 240;
    const judged = M.filter(x => x.inBlock).map(x => { const pre = F.filter(f => f.a >= x.audio - 0.9 * beat && f.a < x.audio), early = pre.filter(f => f.s !== '1'); return { changed: x.after !== x.before, frames: pre.length, early: early.length, ms: early.length ? Math.round((x.audio - early[0].a) * 1000) : 0 }; }).filter(x => x.frames > 2);
    const ch = judged.filter(x => x.changed);
    report.resync = { mutations: M.length, judged: judged.length, cycleChanges: ch.length, earlyMs: ch.filter(x => x.early).map(x => x.ms) };
    check('RESYNC', ch.length >= 2, `${M.length} mutations, ${ch.length} of them changed the cycle (judged: ${judged.length})`);
    check('RESYNC', judged.every(x => x.early === 0), `the sun reads 1 on every frame of each mutation's last beat until it is heard (early: ${judged.filter(x => x.early).map(x => `${x.ms} ms`).join(', ') || 'none'})`);
    check('RESYNC', p.errors.length === 0, `0 page errors (${p.errors.slice(0, 2).join(' | ')})`);
    p.close();
  });
} finally { await b?.close(); }
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
console.log(fails.length ? `\n${fails.length} failed:\n${fails.join('\n')}` : '\nall pass');
if (process.argv.includes('--assert') && fails.length) process.exit(1);
