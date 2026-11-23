// RD-11 drift check (DECISION §2 "The Move mapping", the ?drift block; Nils §Q1). Muted headless Chrome (cdp.mjs),
// Move input injected as MIDI bytes (__poly.move.receive), the LED state read back from movewire's cache
// (__poly.move.ledState) — the scripted LED-state tests of the phase, and the flag-off identity of the mapping.
//
//   node orbit2/tools/drift-check.mjs                     # everything but RENDER, a report on stdout
//   node orbit2/tools/drift-check.mjs --assert --only FLAG,TABLE,METER,DRAIN,TAP
//   node orbit2/tools/drift-check.mjs --only RENDER --minutes 40   # the offline evolve take (clicks, level drift)
//   --port 5400 --debug-port 9400 --json /tmp/x.json --root /tmp/x (a `git archive`)
//
// FLAG    without ?drift the mapping is byte-identical to RD-10: − toggles evolve ON THE PRESS, the step LEDs while −
//         is held are the ordinary steps (full dump equal), a knob turned while − is held still edits rhythm, a step
//         tap still toggles the step.
// TABLE   with ?drift, − held: the − LED white; step LEDs 1–6 the lanes that evolve in their lane colour (toggling one
//         by its step button turns exactly that LED dark — round 1: a steady lane was lit dim and read as evolving — and
//         flips lane.evolve; the cell on screen and the sheet's lane chip follow), 7–8 dark, 9–16 the full countdown
//         while stopped with evolve on, all dark with evolve off; the row is the drift page and comes back on release.
// METER   a touched drift encoder turns all 16 step LEDs into its meter (amount 40 % → 6, turned to 50 % → 8, in one
//         colour from LED 1), and the table returns as the finger lets go; a touchless turn shows the meter too and
//         drops it after its 400 ms tail.
// DRAIN   playing with evolve on and every = 1, the countdown LEDs 9–16 drain within the bar and refill at the line,
//         and the on-screen cells 9–16 drain with them (round 1: they sat still). Read every 40 ms: a full countdown
//         lasts ⅛ bar (231 ms at 130 bpm), so it is always seen (round 1: 220 ms reads could miss it).
// TAP     with ?drift the evolve toggle moved to the release of a tap: unchanged while − is held, flipped on a clean
//         release, and NOT flipped by a chord (a knob turned or touched, a lane, a step past the lanes, a pad), a hold
//         past LOOK_MS (a look), or a release without its press.
// RENDER  the 40-minute evolve take, rendered offline in one pass (the clock's own mutation cadence replayed on the
//         model, every segment's hits shifted into one list, __poly.renderPattern) and scanned sample by sample:
//         0 clicks (no one-sample jump > 0.5), no clipping, and no ENGINE level drift: the home pattern is rendered
//         again as the last bar (after a silent ring-out bar), with the same locked dice, so the first bar and the
//         last are the same notes 40 minutes apart — their RMS must agree within 0.5 dB. The whole take's first-vs-
//         last-5-minutes dB is reported unjudged: evolve wanders the pattern's density, and that is the music, not
//         the engine. --rate (default 22050) keeps a 40-minute float buffer inside the renderer's memory; --engine
//         defaults to dsp: the synth engine's offline render cost grows with the square of the length (the RD-9
//         "memory grows while a dense groove plays" backlog item seen from the render side: 32 bars 151 s, 64 bars
//         past 240 s), so a 40-minute synth render is out of reach until that lands. dsp is linear (~21× realtime).
import { launch } from './cdp.mjs';
import { bytes, ledsOf } from './session-core.mjs';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('--only', 'FLAG,TABLE,METER,DRAIN,TAP').split(','), port = +arg('--port', 5400), debugPort = +arg('--debug-port', 9400), root = arg('--root', undefined), minutes = +arg('--minutes', 40);
const out = {}, fails = [];
const check = (sec, ok, what) => { if (!ok) fails.push(`${sec}: ${what}`); };
const ready = async (p) => { for (let i = 0; i < 240; i++) { if (await p.eval('!!window.__poly')) return; await p.sleep(250); } throw new Error('orbit2 did not start'); };
// a fresh first visit, the Move simulated as connected (session.mjs SIM_MOVE: LEDs painted), the techno groove (4 lanes)
const SIM = `__poly.move.transport = { send: () => {} }; __poly.move.inControl = true;`;
const fresh = async (b, { drift = true } = {}) => {
  const p = await b.open(`orbit2/index.html${drift ? '?drift' : ''}`, { width: 1512, height: 860 });
  await ready(p); await p.eval('localStorage.clear()'); await p.send('Page.reload'); await p.sleep(1500); await ready(p);
  await p.eval(`(async () => { await __poly.wake(); ${SIM} __poly.loadGroove('techno'); __poly.sync(); })()`); await p.sleep(1300);
  return p;
};
const send = (p, b) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(b)}))`);
// movewire caches every light it was sent (ledState); ledsOf (session-core) splits pads / steps / buttons, so this
// check reads the same lights the A10 moveview pictures draw
const lights = async (p) => ledsOf(await p.eval('[...__poly.move.ledState]'));

const b = await launch({ port, debugPort, root });
try {
  const stepRead = async (p) => (await lights(p)).steps;

  if (only.includes('FLAG')) {   // ---- without the flag, byte-identical to RD-10 ----
    const p = await fresh(b, { drift: false });
    const before = await p.eval('({ evo: __poly.evo.on, len: __poly.m.lanes[0].length, hit: __poly.m.lanes[__poly.m.selected].hitAt(0) })');
    const idle = await stepRead(p);
    await send(p, bytes.btn('minus', true)); await p.sleep(250);
    const onPress = await p.eval('__poly.evo.on'), heldLeds = await stepRead(p);
    check('FLAG', onPress === !before.evo, `− toggles evolve on the press without the flag (was ${before.evo}, on press ${onPress})`);
    check('FLAG', JSON.stringify(heldLeds) === JSON.stringify(idle), `step LEDs unchanged while − is held: ${JSON.stringify({ idle, heldLeds })}`);
    await send(p, bytes.enc(0, 2)); await p.sleep(150);   // knob 1 while − held = rhythm's length, as always
    const len = await p.eval('__poly.m.lanes[__poly.m.selected].length');
    check('FLAG', len !== before.len, `knob 1 with − held still edits length (${before.len} → ${len})`);
    await send(p, bytes.step(0, true)); await send(p, bytes.step(0, false)); await p.sleep(150);
    const hit = await p.eval('__poly.m.lanes[__poly.m.selected].hitAt(0)');
    check('FLAG', hit === !before.hit, `a step tap with − held still toggles the step (${before.hit} → ${hit})`);
    await send(p, bytes.btn('minus', false)); await p.sleep(150);
    const after = await p.eval('__poly.evo.on');
    check('FLAG', after === onPress, `the release adds nothing without the flag (press ${onPress}, release ${after})`);
    const word = await p.eval(`document.getElementById('lh-page').textContent`);
    check('FLAG', !word.includes('drift'), `no drift page without the flag (header: ${word})`);
    out.flag = { before, onPress, after, len, hit, word, errors: [...p.errors] };
    check('FLAG', !p.errors.length, `page errors: ${p.errors.join(' | ')}`);
  }

  if (only.includes('TABLE')) {   // ---- Nils's LED table while − is held ----
    const p = await fresh(b);
    await p.eval('__poly.setEvolve(true)');   // evolving, stopped: the countdown sits full
    await send(p, bytes.btn('minus', true)); await p.sleep(600);
    const all = await lights(p), t = all.steps, minus = all.buttons.minus;
    const lanes4 = t.slice(0, 4), gap = t.slice(4, 8), count = t.slice(8);
    check('TABLE', lanes4.every(x => x > 0), `LEDs 1–4 lit in lane colours: ${JSON.stringify(t)}`);
    check('TABLE', new Set(lanes4).size === 4, `four different lane colours: ${JSON.stringify(lanes4)}`);
    check('TABLE', gap.slice(2).every(x => !x) && !gap[0] && !gap[1], `LEDs 5–8 dark on a 4-lane pattern: ${JSON.stringify(gap)}`);
    check('TABLE', count.every(x => x > 0) && new Set(count).size === 1, `LEDs 9–16 the full countdown, one colour: ${JSON.stringify(count)}`);
    const word = await p.eval(`document.getElementById('lh-page').textContent + '|' + document.getElementById('knobs').dataset.page + '|' + document.getElementById('stepsui').dataset.cells`);
    check('TABLE', word === 'drift · held on Move|drift|drift', `the drift page on screen while − is held (${word})`);
    // tap step 2 = lane 2 stops evolving: that LED goes DARK (round 1: it was lit dim, and A10's players read it as
    // evolving), the model, the cell and the sheet's lane chip follow
    const chip = (i) => p.eval(`document.querySelectorAll('#evo-lanes .tchip')[${i}].getAttribute('aria-pressed')`);
    await send(p, bytes.step(1, true)); await send(p, bytes.step(1, false)); await p.sleep(200);
    const t2 = await stepRead(p), lane2 = await p.eval('__poly.m.lanes[1].evolve');
    check('TABLE', lane2 === false, 'tapping step 2 toggles lane 2\'s evolve off');
    check('TABLE', t2[1] === 0 && t2[0] === t[0] && t2[2] === t[2] && t2[3] === t[3], `LED 2 dark, the others unchanged: ${JSON.stringify({ was: t, now: t2 })}`);
    const cell = await p.eval(`document.querySelectorAll('#stepsui .st')[1].className`);
    check('TABLE', !cell.includes('lp-on'), `the cell goes steady with it (${cell})`);
    check('TABLE', await chip(1) === 'false', 'the sheet\'s lane 2 chip follows');
    await send(p, bytes.step(1, true)); await send(p, bytes.step(1, false)); await p.sleep(200);
    check('TABLE', await p.eval('__poly.m.lanes[1].evolve') === true && (await stepRead(p))[1] === t[1], 'tapping it again brings lane 2 back, lit');
    check('TABLE', await chip(1) === 'true', 'and its chip');
    check('TABLE', minus > 0, `the − LED lit (white) while held (${minus})`);
    await send(p, bytes.btn('minus', false)); await p.sleep(600);
    const after = await p.eval(`document.getElementById('knobs').dataset.page + '|' + document.getElementById('stepsui').dataset.cells`);
    check('TABLE', after === 'rhythm|steps', `release: the row returns (${after})`);
    const back = await stepRead(p);
    check('TABLE', JSON.stringify(back) !== JSON.stringify(t2), 'release: the LEDs return to the steps');
    check('TABLE', await p.eval('__poly.evo.on') === true, 'the release after lane taps (a chord) left evolve on');
    // evolve off: no mutation is coming, so the countdown is dark (on the Move and on screen); the lanes still show
    await p.eval('__poly.setEvolve(false)'); await send(p, bytes.btn('minus', true)); await p.sleep(300);
    const offLeds = await stepRead(p), offCells = await p.eval(`[...document.querySelectorAll('#stepsui .st')].slice(8, 16).map(b => b.classList.contains('lp-on') ? 1 : 0).join('')`);
    check('TABLE', offLeds.slice(8).every(x => !x) && offLeds.slice(0, 4).every(x => x > 0), `evolve off: countdown dark, lanes lit: ${JSON.stringify(offLeds)}`);
    check('TABLE', offCells === '00000000', `evolve off: the cells' countdown dark too (${offCells})`);
    await send(p, bytes.btn('minus', false)); await p.sleep(150);
    out.table = { held: t, toggled: t2, minus, word, after, offLeds, errors: [...p.errors] };
    check('TABLE', !p.errors.length, `page errors: ${p.errors.join(' | ')}`);
  }

  if (only.includes('METER')) {   // ---- the touched knob's value on all 16 LEDs ----
    const p = await fresh(b);
    await send(p, bytes.btn('minus', true)); await p.sleep(300);
    const table = await stepRead(p);
    await send(p, bytes.touch(1, true)); await p.sleep(200);   // knob 2 = amount, techno default 40 % → 6 of 16
    const m40 = await stepRead(p), lit = (a) => a.filter(x => x > 0).length;
    check('METER', lit(m40) === 6 && m40.slice(0, 6).every(x => x > 0), `amount 40 % meters 6 LEDs from LED 1: ${JSON.stringify(m40)}`);
    check('METER', new Set(m40.slice(0, 6)).size === 1, `the meter is one colour: ${JSON.stringify(m40.slice(0, 6))}`);
    for (let i = 0; i < 5; i++) await send(p, bytes.enc(1, 1));   // +2 % per click → 50 %
    await p.sleep(200);
    const m50 = await stepRead(p), amount = await p.eval('__poly.evo.amount');
    check('METER', amount === 50, `five clicks take amount to 50 % (${amount})`);
    check('METER', lit(m50) === 8, `amount ≈ half meters 8 LEDs (A10's read): ${JSON.stringify(m50)}`);
    await send(p, bytes.touch(1, false)); await p.sleep(60);   // let go: no tail (round 1: the turns' 400 ms tail kept the meter up)
    const backTable = await stepRead(p);
    check('METER', JSON.stringify(backTable.slice(8)) === JSON.stringify(table.slice(8)) && backTable.slice(0, 4).every(x => x > 0), `let go: the table returns at once: ${JSON.stringify(backTable)}`);
    await send(p, bytes.enc(0, 1)); await p.sleep(100);   // a touchless turn (knob 1, every) meters too
    const turn = await stepRead(p), every = await p.eval('__poly.evo.every');
    check('METER', lit(turn) === Math.min(16, every), `a touchless turn meters "every" (${every} bars → ${lit(turn)} LEDs)`);
    await p.sleep(600);
    check('METER', lit(await stepRead(p)) !== lit(turn) || JSON.stringify(await stepRead(p)) === JSON.stringify(backTable), 'the turn\'s meter drops after its tail');
    await send(p, bytes.btn('minus', false)); await p.sleep(150);
    out.meter = { m40, m50, every, errors: [...p.errors] };
    check('METER', !p.errors.length, `page errors: ${p.errors.join(' | ')}`);
  }

  if (only.includes('DRAIN')) {   // ---- the countdown drains toward the mutation ----
    const p = await fresh(b);
    await p.eval(`(() => { __poly.evo.every = 1; __poly.setEvolve(true); })()`);
    await send(p, bytes.btn('play', true)); await send(p, bytes.btn('play', false)); await p.sleep(2200);   // into bar 2
    await send(p, bytes.btn('minus', true)); await p.sleep(100);
    // the LEDs and the cells in one read, every 40 ms for ≈ 1.3 bars at 130 bpm (a full countdown lasts 231 ms)
    const READ = `({ leds: [...__poly.move.ledState], cells: [...document.querySelectorAll('#stepsui .st')].slice(8, 16).filter(b => b.classList.contains('lp-on')).length })`;
    const seen = [], cells = [];
    for (const t0 = Date.now(); Date.now() - t0 < 2400; await p.sleep(40)) { const r = await p.eval(READ); seen.push(ledsOf(r.leds).steps.slice(8).filter(x => x > 0).length); cells.push(r.cells); }
    const rises = seen.filter((x, i) => i && x > seen[i - 1]), downs = seen.filter((x, i) => i && x < seen[i - 1] && seen[i - 1] - x > 1);
    check('DRAIN', Math.max(...seen) === 8 && Math.min(...seen) === 1, `the countdown drains from 8 to 1 (every = 1): ${JSON.stringify(seen)}`);
    check('DRAIN', rises.length >= 1 && rises.every(x => x >= 7), `and refills at the bar line, only there: rises ${JSON.stringify(rises)}`);
    check('DRAIN', !downs.length, `one LED at a time: ${JSON.stringify(seen)}`);
    check('DRAIN', seen.every((x, i) => x === cells[i]), `the cells drain with the LEDs: LEDs ${JSON.stringify(seen)} · cells ${JSON.stringify(cells)}`);
    await send(p, bytes.btn('minus', false)); await send(p, bytes.btn('play', true)); await send(p, bytes.btn('play', false));
    out.drain = { seen, cells, errors: [...p.errors] };
    check('DRAIN', !p.errors.length, `page errors: ${p.errors.join(' | ')}`);
  }

  if (only.includes('TAP')) {   // ---- the toggle moved to the release; a chord is not a tap ----
    const p = await fresh(b);
    const evo = () => p.eval('__poly.evo.on');
    await send(p, bytes.btn('minus', true)); await p.sleep(250);
    check('TAP', await evo() === false, 'nothing flips on the press');
    await send(p, bytes.btn('minus', false)); await p.sleep(150);
    check('TAP', await evo() === true, 'a clean tap toggles evolve on the release');
    await send(p, bytes.btn('minus', true)); await send(p, bytes.enc(2, 1)); await send(p, bytes.btn('minus', false)); await p.sleep(150);
    check('TAP', await evo() === true, 'a knob turned while − was down: the release toggles nothing');
    await send(p, bytes.btn('minus', true)); await send(p, bytes.step(0, true)); await send(p, bytes.step(0, false)); await send(p, bytes.btn('minus', false)); await p.sleep(150);
    check('TAP', await evo() === true, 'a lane toggled while − was down: the release toggles nothing');
    check('TAP', await p.eval('__poly.m.lanes[0].evolve') === false, 'and the chord did toggle lane 1');
    // round 1: any other press, a touch only, a hold past LOOK_MS (a look), or a release with no press of its own
    const chord = async (what, ...mid) => { await send(p, bytes.btn('minus', true)); for (const x of mid) await send(p, x); await send(p, bytes.btn('minus', false)); await p.sleep(150); check('TAP', await evo() === true, `${what} while − was down: the release toggles nothing`); };
    await chord('step 8 (past the lanes)', bytes.step(7, true), bytes.step(7, false));
    await chord('step 5 (no lane 5 on 4 lanes)', bytes.step(4, true), bytes.step(4, false));
    await chord('a pad', bytes.pad(0, 3, true), bytes.pad(0, 3, false));
    await chord('a touch only (reading a meter)', bytes.touch(2, true), bytes.touch(2, false));
    await send(p, bytes.btn('minus', true)); await p.sleep(600); await send(p, bytes.btn('minus', false)); await p.sleep(150);
    check('TAP', await evo() === true, 'a 0.6 s hold with nothing else (a look): the release toggles nothing');
    await send(p, bytes.btn('minus', false)); await p.sleep(150);
    check('TAP', await evo() === true, 'a release with no press of its own toggles nothing');
    await send(p, bytes.btn('minus', true)); await p.sleep(100); await send(p, bytes.btn('minus', false)); await p.sleep(150);
    check('TAP', await evo() === false, 'and a clean tap still toggles');
    out.tap = { errors: [...p.errors] };
    check('TAP', !p.errors.length, `page errors: ${p.errors.join(' | ')}`);
  }

  if (only.includes('RENDER')) {   // ---- the 40-minute evolve take, offline, one pass ----
    const p = await fresh(b);
    const engine = arg('--engine', 'dsp');
    if (engine !== 'synth') await p.eval(`__poly.setEngine(${JSON.stringify(engine)})`, { timeout: 60000 });
    const rate = +arg('--rate', 22050);
    const r = await p.eval(`(async () => {
      const P = __poly;
      P.dice.locked = true; P.dice.seed = 4127; P.exp.rate = ${rate};
      P.evo.every = 4; P.evo.amount = 40; P.evo.gravity = 20; P.evo.home = 0; P.evo.maxBars = 32;
      P.setEvolve(true);
      const home = P.m.snapshot(), barTicks = P.m.barTicks(), ts = P.tickSec(), barSec = barTicks * ts;
      const totalBars = Math.ceil(${minutes} * 60 / barSec), every = P.evo.every, hits = [];
      let mutations = 0;
      for (let b0 = 0; b0 < totalBars; b0 += every) {
        const n = Math.min(every, totalBars - b0), off = b0 * barSec;
        for (const h of P.exportHits(n * barTicks)) hits.push({ ...h, time: h.time + off });
        // the clock's own cadence (app.js onTick → evolveNow): one mutation on the bar line after each "every" window
        P.m.evolve({ scope: P.evo.scope, amount: P.evo.amount / 100, weights: P.evo.weights, gravity: P.evo.gravity / 100, home, maxBars: P.evo.maxBars, repeat: 1 }, P.dice.stream(1000 + b0 + n)); mutations++;
      }
      // the calibration bar: home again, same dice, after one silent bar for the ring-out — bar 1 and the last bar
      // are the same notes ${minutes} minutes apart, so any RMS difference between them is the engine's
      P.m.assign(home, { keep: true, selected: P.m.selected });
      for (const h of P.exportHits(barTicks)) hits.push({ ...h, time: h.time + (totalBars + 1) * barSec });
      const allBars = totalBars + 2, t0 = performance.now();
      const r = await P.renderPattern({ hits, bars: allBars });
      const renderMs = Math.round(performance.now() - t0), { chans, sr } = r, n = chans[0].length;
      let peak = 0, maxDiff = 0, clicks = 0;
      for (const ch of chans) { let prev = 0; for (let i = 0; i < n; i++) { const x = ch[i], d = Math.abs(x - prev); if (d > maxDiff) maxDiff = d; if (d > 0.5) clicks++; const ax = Math.abs(x); if (ax > peak) peak = ax; prev = x; } }
      const rmsOf = (from, len) => { let e = 0; const a = Math.round(from), z = Math.min(n, Math.round(from + len)); for (let i = a; i < z; i++) { const x = (chans[0][i] + chans[1][i]) / 2; e += x * x; } return Math.sqrt(e / Math.max(1, z - a)); };
      const win = sr * 10, rms = [];   // 10-second RMS of the mono sum: the whole take's trend (reported, not judged)
      for (let s = 0; s + win <= n; s += win) rms.push(rmsOf(s, win));
      const dB = (x) => 20 * Math.log10(Math.max(x, 1e-9)), mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
      const head = mean(rms.slice(0, 30)), tail = mean(rms.slice(-30));
      const calDb = +(dB(rmsOf((totalBars + 1) * barSec * sr, barSec * sr)) - dB(rmsOf(0, barSec * sr))).toFixed(2);
      return { totalBars, mutations, hits: hits.length, seconds: Math.round(n / sr), sr, renderMs, peak: +peak.toFixed(3), maxDiff: +maxDiff.toFixed(3), clicks, calDb, trendDb: +(dB(tail) - dB(head)).toFixed(2) };
    })()`, { timeout: 1800000 });
    out.render = { engine, ...r, errors: [...p.errors] };
    check('RENDER', r.seconds >= minutes * 60 - 5, `the take is ${minutes} minutes (${r.seconds} s)`);
    check('RENDER', r.clicks === 0, `no clicks (one-sample jumps > 0.5): ${r.clicks}, max jump ${r.maxDiff}`);
    check('RENDER', Math.abs(r.calDb) <= 0.5, `no engine level drift (the home bar at 0 vs ${minutes} min): ${r.calDb} dB`);
    check('RENDER', r.peak <= 1, `no clipping: peak ${r.peak}`);
    check('RENDER', !p.errors.length, `page errors: ${p.errors.join(' | ')}`);
  }
} finally { await b.close(); }

out.fails = fails;
if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
console.log(fails.length ? `\n${fails.length} failing:\n- ${fails.join('\n- ')}` : '\nall pass');
if (process.argv.includes('--assert') && fails.length) process.exit(1);
