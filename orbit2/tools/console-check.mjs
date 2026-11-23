// RD-5 console check (DECISION A2 scripted, A5 / A7 with the console log, A8, Nils's rows on the page, Vera's mis-click
// run). Muted headless Chrome (cdp.mjs), the page as a set opens it (session.mjs openSet: ?setlog, the Move simulated).
//
//   node orbit2/tools/console-check.mjs                     # everything at 1512×860, a report on stdout
//   node orbit2/tools/console-check.mjs --assert --json /tmp/x.json --clicks 600 --shots /tmp/orbit2-impl/
//   --port 5400 --debug-port 9400   --only MOVE,A8,A2,LOG,MISCLICK,FILTER,SHIFT,HELP,FMODE,CLOCK,BOUNCE   --root /tmp/x (a `git archive`)
//
// MOVE      Noor's sequence and the touch / turn rows through __poly.move.receive (touch notes 0–8, encoder CCs, Shift,
//           steps): what the row draws, the chip, the header word, the held cell, the step untouched by a look.
// A8        a Move encoder touch → the peek painted: the `peek` performance measures (?setlog: from the touch to the task
//           after the frame that paints it), p95 < 30 ms; the sound tab latched, so every touch flips the row too.
// A2        the scripted glance run (the DOM oracle; the player agents judge pictures in glance.mjs): a random latch (the
//           rhythm or sound tab), select a lane on the Move, Shift or not, touch a knob and turn it a click, look 300 ms
//           later: the page drawn and the lane in the header must be what the hands asked for; ≥ 18 of 20 per seed.
// FILTER    (round 1) the face's filter knob has its centre detent: a small slip from off stays off, a drag across holds
//           off for a stretch, a key step across lands on off.
// SHIFT     (round 1) a focused console knob keeps its keys: keyboard ⇧ does not flip the row under it (Shift + ↑ is its
//           fine step), the Move's Shift gives the focus back on release, Shift+Tab from the cells lands on the row it left.
// LOG       the console log on and off: the visible controls (the face audit's selector) and the rings must not change.
// HELP      (RD-9) the "?" overlay's Move tab: the drawing wears the current page's words (rhythm, the sound tab, a held
//           step, + Shift, Loop) and follows the hands while open; the keys tab keeps the keyboard help; Esc closes it.
// FMODE     (RD-9) F mode with the Move: the peek answers an encoder touch, a pill's × stays pressable, the rings never
//           move (A7), Esc comes back. What is drawn / hidden in F is the face audit's FMODE gate.
// CLOCK     (RD-9, the final sets) speed × and tempo dragged with the mouse and turned on the Move while playing: no page
//           error, the page answers, the transport's ticks never go back (Tone's bpm ramps broke its clock).
// BOUNCE    (RD-9, the final sets) a double press bringing the kick back (Move, mouse, "on next bar") leaves it playing; a
//           quick mute → unmute still does both; a press 0.3 s after an unmute mutes (perform.js MuteBounce).
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
const STATE = `(() => { const g = (i) => document.getElementById(i); return { row: g('knobs').dataset.page, chip: g('move-chip').textContent, own: g('move-chip').classList.contains('own'), word: g('lh-page').textContent, lane: parseInt(g('lh-lane').textContent, 10), held: [...document.querySelectorAll('#stepsui .st')].flatMap((b, i) => b.classList.contains('held') ? [i + 1] : []), peek: g('peek').hidden ? null : g('peek-name').textContent }; })()`;
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
  await p.eval(`(() => { document.getElementById('pg-sound').click(); performance.clearMeasures('peek'); performance.clearMarks('peek-touch'); })()`);   // each touch flips sound → rhythm
  for (let i = 0; i < n; i++) { await send(p, bytes.touch(i % 8, true)); await sleep(80); await send(p, bytes.touch(i % 8, false)); await sleep(480); }
  const ms = await p.eval(`performance.getEntriesByName('peek', 'measure').map(e => e.duration)`);
  return { n: ms.length, p50: pct(ms, 50), p95: pct(ms, 95), max: Math.max(...ms), fails: ms.length < n * 0.9 ? [`${ms.length} of ${n} touches measured`] : pct(ms, 95) >= THRESH.peekMs ? [`peek p95 ${pct(ms, 95).toFixed(1)} ms`] : [] };
}

async function glance(p, { seed, trials = 20, shots }) {
  const rng = mulberry32(seed * 7919 + 3), rows = [];
  for (let t = 1; t <= trials; t++) {
    const lane = 1 + Math.floor(rng() * 4), page = rng() < 0.5 ? 'rhythm' : 'sound', knob = Math.floor(rng() * 7), latch = rng() < 0.5 ? 'rhythm' : 'sound';
    await p.eval(`document.getElementById('pg-${latch}').click()`);   // the screen's page: the hands must win over it either way
    await send(p, bytes.btn(trackOf(lane - 1), true)); await sleep(60); await send(p, bytes.btn(trackOf(lane - 1), false)); await sleep(150);
    if (page === 'sound') { await send(p, bytes.btn('shift', true)); await sleep(60); }
    await send(p, bytes.touch(knob, true)); await sleep(80); await send(p, bytes.enc(knob, 1)); await sleep(300);   // the 300 ms shutter
    const s = await p.eval(STATE); if (shots && t <= 2) await p.shot(join(shots, `glance-s${seed}-${t}-${page}-lane${lane}.png`));
    await send(p, bytes.enc(knob, -1)); await send(p, bytes.touch(knob, false)); if (page === 'sound') await send(p, bytes.btn('shift', false)); await sleep(500);
    rows.push({ trial: t, lane, page, latch, knob: knob + 1, saw: { page: s.row, lane: s.lane }, ok: s.row === page && s.lane === lane });
  }
  const right = rows.filter(r => r.ok).length; return { seed, right, of: trials, rows, fails: right < THRESH.glance ? [`seed ${seed}: ${right}/${trials}`] : [] };
}

async function logToggle(p) {
  const COUNT = `(() => { const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=slider], [role=button], [role=tab], [role=switch], [role=checkbox], [tabindex]:not([tabindex="-1"])'; const r = (e) => e.getBoundingClientRect(); return { controls: [...document.querySelectorAll(SEL)].filter(e => e.checkVisibility({ visibilityProperty: true }) && r(e).width > 0 && r(e).bottom > 0 && r(e).top < innerHeight && r(e).right > 0 && r(e).left < innerWidth).length, geo: JSON.stringify(__poly.scene.geo()), log: !document.getElementById('console-log').hidden, scroll: document.documentElement.scrollHeight - innerHeight }; })()`;
  const off = await p.eval(COUNT); await p.key('`', 'Backquote'); await sleep(200); const on = await p.eval(COUNT); await p.key('`', 'Backquote'); await sleep(200); const back = await p.eval(COUNT);
  const fails = []; if (!on.log || back.log) fails.push('` did not toggle the log'); if (on.controls !== off.controls) fails.push(`controls ${off.controls} → ${on.controls} with the log on`); if (on.geo !== off.geo) fails.push('the rings moved with the log on'); if (on.scroll > 0) fails.push('the page scrolls with the log on');
  return { off: { controls: off.controls }, on: { controls: on.controls }, ringsSame: on.geo === off.geo && back.geo === off.geo, fails };
}

// real pointer / key input (trusted, as a hand's): a drag in px, a key with modifiers (8 = Shift)
const mouse = (p, type, x, y) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const VK = { Shift: 16, Tab: 9, ArrowUp: 38, ArrowDown: 40 };
const keyEv = (p, type, key, mods = 0) => p.send('Input.dispatchKeyEvent', { type, key, code: key === 'Shift' ? 'ShiftLeft' : key, modifiers: mods, windowsVirtualKeyCode: VK[key], nativeVirtualKeyCode: VK[key] });
async function filterDetent(p) {
  const at = await p.eval(`(() => { const r = document.querySelector('#fx-gauge .gauge').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`), filt = () => p.eval('Math.round(__poly.pfx.filter * 100)');
  const slips = [];
  for (const d of [2, -2, 5, -5]) { await p.eval('__poly.setFilter(0)'); await mouse(p, 'mousePressed', at.x, at.y); await mouse(p, 'mouseMoved', at.x, at.y - d); await mouse(p, 'mouseReleased', at.x, at.y - d); slips.push(await filt()); }
  await p.eval('__poly.setFilter(-0.1)'); await mouse(p, 'mousePressed', at.x, at.y); const walk = [];
  for (let d = 1; d <= 30; d++) { await mouse(p, 'mouseMoved', at.x, at.y - d); walk.push(await filt()); }
  await mouse(p, 'mouseReleased', at.x, at.y - 30);
  await p.eval(`(() => { __poly.setFilter(-0.05); document.querySelector('#fx-gauge .gauge').focus(); })()`); await p.key('ArrowUp'); const keyUp = await filt();
  await p.eval('__poly.setFilter(0.05)'); await p.key('ArrowDown'); const keyDown = await filt(); await p.eval('(() => { document.activeElement.blur(); __poly.setFilter(0); })()');
  const held = walk.filter(v => v === 0).length, fails = [];
  if (slips.some(v => v !== 0)) fails.push(`a slip from off moved it: ${slips}`); if (held < 6) fails.push(`off held for ${held} of 30 px across`);
  if (keyUp !== 0 || keyDown !== 0) fails.push(`a key step across off went to ${keyUp} / ${keyDown}`);
  return { slips, walk: walk.join(' '), held, keys: [keyUp, keyDown], fails };
}
async function shiftFocus(p) {
  const st = () => p.eval(`(() => { const a = document.activeElement; return { page: document.getElementById('knobs').dataset.page, focus: a === document.body || !a ? 'body' : (a.getAttribute('aria-label') || a.id || a.tagName), swing: Math.round(__poly.m.lane.swing * 100) }; })()`);
  await p.eval(`(() => { document.getElementById('pg-rhythm').click(); __poly.m.lane.swing = 0; __poly.sync(); document.querySelector('#knobs > :nth-child(5) .gauge').focus(); })()`); await sleep(80);
  await keyEv(p, 'keyDown', 'ArrowUp'); await keyEv(p, 'keyUp', 'ArrowUp'); const up = await st();
  await keyEv(p, 'keyDown', 'Shift', 8); await sleep(40); const shift = await st();
  await keyEv(p, 'keyDown', 'ArrowUp', 8); await keyEv(p, 'keyUp', 'ArrowUp', 8); const fine = await st(); await keyEv(p, 'keyUp', 'Shift'); await sleep(40); const after = await st();
  await send(p, bytes.btn('shift', true)); await sleep(60); const moveShift = await st(); await send(p, bytes.btn('shift', false)); await sleep(60); const moveBack = await st();
  await p.eval(`document.querySelector('#stepsui .st').focus()`); await keyEv(p, 'keyDown', 'Shift', 8); await keyEv(p, 'keyDown', 'Tab', 8); await keyEv(p, 'keyUp', 'Tab', 8);
  const tab = await st(); await keyEv(p, 'keyUp', 'Shift'); await sleep(40); const tabAfter = await st(); await p.eval('document.activeElement.blur()');
  const fails = [];
  if (shift.page !== 'rhythm' || shift.focus !== 'swing') fails.push(`⇧ on a focused knob: ${JSON.stringify(shift)}`);
  if (fine.swing !== up.swing + 1 || after.focus !== 'swing') fails.push(`Shift+↑ on it: ${JSON.stringify(fine)} → ${JSON.stringify(after)}`);
  if (moveShift.page !== 'sound' || moveBack.focus !== 'swing') fails.push(`the Move's Shift: ${JSON.stringify(moveShift)} → ${JSON.stringify(moveBack)}`);
  if (tab.page !== 'rhythm' || tabAfter.focus === 'body' || tabAfter.page !== 'rhythm') fails.push(`Shift+Tab from cell 1: ${JSON.stringify(tab)} → ${JSON.stringify(tabAfter)}`);
  return { up, shift, fine, after, moveShift, moveBack, tab, tabAfter, fails };
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

// RD-9 the "?" overlay: the Move drawn with the current page's meanings on its controls, following the hands while it
// is open; the keys tab still the keyboard help; Esc (the modal's own) closes it
async function helpOverlay(p) {
  const fails = [], draw = () => p.eval(`document.getElementById('move-draw').innerHTML`);
  const want = async (words, why) => { const svg = await draw(); for (const w of words) if (!svg.includes(`>${w}</text>`)) fails.push(`${why}: "${w}" missing from the drawing`); return svg; };
  await p.eval('(__poly.openHelp(), __poly.helpTab("move"))'); await sleep(80);
  await want(['length', 'euclid hits', 'probability', 'tempo'], 'rhythm (the default)');
  await p.eval(`document.getElementById('pg-sound').click()`); await sleep(80);
  await want(['decay', 'drive', 'pan', 'level'], 'the sound tab latched');
  await p.eval(`document.getElementById('pg-rhythm').click()`); await sleep(80);
  // a Move step held past the look: its locks on the knobs, the condition on knob 8, the cells its loops; + Shift = repeats
  await send(p, bytes.step(0, true)); await sleep(550);
  const held = await want(['velocity', 'condition'], 'a held Move step');
  if (!held.includes('loops')) fails.push('a held step: the cells line does not say loops');
  await send(p, bytes.btn('shift', true)); await sleep(80);
  await want(['repeats'], 'a held step with Shift');
  await send(p, bytes.btn('shift', false)); await send(p, bytes.step(0, false)); await sleep(550);
  // Loop held: the slots on the cells, the knobs unchanged
  await send(p, bytes.btn('loop', true)); await sleep(80);
  const slots = await want(['length', 'tempo'], 'Loop held (the knobs unchanged)');
  if (!slots.includes('slots')) fails.push('Loop held: the cells line does not say slots');
  await send(p, bytes.btn('loop', false)); await sleep(80);
  // the keys tab is still the keyboard help ("must not regress"), and the dialog's own Esc closes it
  await p.eval('__poly.helpTab("keys")');
  const keys = await p.eval(`document.getElementById('hpane-keys').textContent`);
  for (const w of ['play / stop', 'focus mode', 'find any control']) if (!keys.includes(w)) fails.push(`the keys tab lost "${w}"`);
  await p.key('Escape'); await sleep(120);
  if (await p.eval(`document.getElementById('help').open`)) fails.push('Esc did not close the overlay');
  return { fails };
}

// RD-9 F mode with the Move under the hands: the peek answers an encoder touch while the controls are hidden, a pill
// stays pressable, and Esc comes back (face-audit gates what is drawn and the rings)
async function fmode(p) {
  const fails = [], geo = () => p.eval('JSON.stringify(__poly.scene.geo())');
  await p.eval(`__poly.showPills(['evolve'])`);
  const g0 = await geo(); await p.eval('__poly.setFocusMode(true)'); await sleep(120);
  await send(p, bytes.touch(1, true)); await send(p, bytes.enc(1, 1)); await sleep(200);
  const peek = await p.eval(`(() => { const e = document.getElementById('peek'); return !e.hidden && !!e.getClientRects().length ? document.getElementById('peek-name').textContent : null; })()`);
  if (!peek) fails.push('no peek on an encoder touch in F mode');
  await send(p, bytes.enc(1, -1)); await send(p, bytes.touch(1, false)); await sleep(500);
  if (await geo() !== g0) fails.push('the rings moved in F mode (A7)');
  const pill = await p.eval(`(() => { const b = document.getElementById('sp-evolve-x'); return !!b && !!b.getClientRects().length; })()`);
  if (!pill) fails.push('the evolve pill (its ×) is not pressable in F mode');
  await p.key('Escape'); await sleep(120);
  if (await p.eval('__poly.focusMode')) fails.push('Esc did not leave F mode');
  if (await geo() !== g0) fails.push('the rings moved leaving F mode');
  await p.eval('__poly.showPills(null)');
  return { peek, fails };
}

// RD-9 (the final sets, A3): speed × and tempo turned while playing never break the transport's clock. Before, every
// step of a drag ramped Tone's bpm (retime → bpm.rampTo, the ratio's too), and overlapping ramps sent the clock's next
// tick before 0 (a TypeError in Clock._loop: kai's mouse sets) or held it in place (a page that stopped answering:
// noor-5, three times). Mouse drags as session.mjs makes them (8 moves 25 ms apart), on knob 4 and knob 8, then Move
// turns of the same knobs (45 ms a click); the page must answer, throw nothing, and its ticks only go forward.
async function clockDrags(p, { bursts = 30 } = {}) {
  const fails = [], at = (n) => p.eval(`(() => { const r = document.querySelector('#knobs > :nth-child(${n}) .gauge').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const bpm = () => p.eval('Math.round(Tone.getTransport().bpm.value)'), ticks = () => p.eval('Tone.getTransport().ticks', { timeout: 15000 }), e0 = p.errors.length, tempo0 = await bpm();
  await p.eval(`document.getElementById('btn-play').click()`); await sleep(800);
  let last = await ticks(), back = 0, done = 0;
  try {
    for (let k = 0; k < bursts; k++) {
      const knob = k % 3 === 2 ? 8 : 4, c = await at(knob), dy = (k % 2 ? 1 : -1) * (knob === 8 ? 6 : 12);   // tempo: ±2 bpm, back and forth
      await mouse(p, 'mousePressed', c.x, c.y);
      for (let i = 1; i <= 8; i++) { await mouse(p, 'mouseMoved', c.x, c.y + dy * i / 8); await sleep(25); }
      await mouse(p, 'mouseReleased', c.x, c.y + dy); await sleep(100);
      const t = await ticks(); if (t < last) back++; last = t; done++;
    }
    for (let k = 0; k < bursts; k++) {   // the Move: touch, turn 3 clicks, let go (the ratio's knob, then the tempo's)
      const knob = k % 3 === 2 ? 7 : 3, d = k % 2 ? 1 : -1; await send(p, bytes.touch(knob, true));
      for (let i = 0; i < 3; i++) { await send(p, bytes.enc(knob, d)); await sleep(45); }
      await send(p, bytes.touch(knob, false)); await sleep(100);
      const t = await ticks(); if (t < last) back++; last = t; done++;
    }
    await sleep(500); const t = await ticks(); if (!(t > last)) fails.push('the transport stopped moving'); last = t;
  } catch (e) { fails.push(`the page stopped answering after ${done} bursts (${e.message.split('\n')[0]})`); }
  const errors = p.errors.slice(e0);
  if (errors.length) fails.push(`${errors.length} page errors: ${errors[0].split('\n')[0]}`);
  if (back) fails.push(`the transport's ticks went back ${back} times`);
  return { bursts: done, errors: errors.length, back, tempo: [tempo0, await bpm().catch(() => null)], fails };
}

// RD-9 (the final sets, A3): a mute press that bounces. The drop's "bring the kick back" pressed twice (the Move: Mute
// held, the kick's pad tapped twice 160 ms apart, as session.mjs's double; the mouse: its M lamp clicked twice) leaves
// the kick playing, at once and with "on next bar"; a quick mute → unmute (a stutter) still does both; a press 0.3 s
// after an unmute mutes.
async function bounce(p) {
  const fails = [], out = {}, kick = () => p.eval(`(() => { const q = __poly.muteQ; return q.has(0) ? q.target(0) : !!__poly.m.lanes[0].muted; })()`);
  const logged = () => p.eval(`(__poly.setlog.file(), __poly.setlog.log.entries().filter(e => e.target === 'lane1.mute').length)`);
  const set = async (v) => { await p.eval(`(() => { __poly.m.lanes[0].muted = ${v}; __poly.sync(); })()`); await sleep(400); };
  const tap = async (n) => { await send(p, bytes.btn('mute', true)); await sleep(60); for (let k = 0; k < n; k++) { await send(p, bytes.pad(0, 0, true)); await sleep(70); await send(p, bytes.pad(0, 0, false)); await sleep(90); } await send(p, bytes.btn('mute', false)); await sleep(60); };
  await p.eval(`document.getElementById('btn-play').click()`); await sleep(500);
  await set(true); await tap(2); out.moveDouble = await kick();
  if (out.moveDouble !== false) fails.push('the Move: a double press bringing the kick back left it muted');
  await set(false); let n = await logged(); await tap(2); out.stutter = { muted: await kick(), presses: await logged() - n };
  if (out.stutter.muted !== false || out.stutter.presses !== 2) fails.push(`a quick mute → unmute: ${JSON.stringify(out.stutter)}`);
  await set(true); const c = await p.eval(`(() => { const r = document.querySelectorAll('.lane-m')[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await p.click(c.x, c.y); await sleep(90); await p.click(c.x, c.y); await sleep(150); out.lampDouble = await kick();
  if (out.lampDouble !== false) fails.push('the mouse: a double click on the kick\'s M lamp left it muted');
  await set(true); await tap(1); await sleep(300); await tap(1); out.late = await kick();
  if (out.late !== true) fails.push('a press 0.3 s after an unmute did not mute');
  await p.eval('(__poly.perf.muteBar = true)'); await set(true); n = await logged(); await tap(2); out.nextBar = { muted: await kick(), presses: await logged() - n };
  if (out.nextBar.muted !== false) fails.push('"on next bar": a double press took the waiting unmute back');
  await p.eval('(__poly.perf.muteBar = false, __poly.muteQ.clear(), __poly.sync())');
  return { ...out, fails };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; }, has = (k) => process.argv.includes(k);
  const only = new Set(String(arg('--only', 'MOVE,A8,A2,LOG,MISCLICK,FILTER,SHIFT,HELP,FMODE,CLOCK,BOUNCE')).split(',')), shots = arg('--shots', null), out = {}, root = arg('--root', null);
  if (shots) mkdirSync(shots, { recursive: true });
  const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400), ...(root ? { root } : {}) });
  try {
    // a busy machine can miss openSet's 20 s for the page's modules once: one more try before a red check
    const fresh = async () => { try { return await openSet(b, { groove: 'techno' }); } catch (e) { if (!/__poly is not defined/.test(e.message)) throw e; return openSet(b, { groove: 'techno' }); } };
    if (only.has('MOVE')) out.MOVE = await moveRows(await fresh());
    if (only.has('A8')) out.A8 = await peekLatency(await fresh());
    if (only.has('A2')) { const p = await fresh(); out.A2 = [await glance(p, { seed: 1, shots }), await glance(p, { seed: 2, shots })]; }
    if (only.has('LOG')) out.LOG = await logToggle(await fresh());
    if (only.has('MISCLICK')) { const p = await fresh(); out.MISCLICK = await misclick(p, { clicks: +arg('--clicks', 600) }); out.MISCLICK.errors = p.errors.length; }
    if (only.has('FILTER')) out.FILTER = await filterDetent(await fresh());
    if (only.has('SHIFT')) out.SHIFT = await shiftFocus(await fresh());
    if (only.has('HELP')) out.HELP = await helpOverlay(await fresh());
    if (only.has('FMODE')) out.FMODE = await fmode(await fresh());
    if (only.has('CLOCK')) out.CLOCK = await clockDrags(await fresh());
    if (only.has('BOUNCE')) out.BOUNCE = await bounce(await fresh());
  } finally { await b.close(); }
  const fails = Object.entries(out).flatMap(([k, v]) => (Array.isArray(v) ? v.flatMap(x => x.fails) : v.fails).map(f => `${k}: ${f}`));
  if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
  const L = [];
  if (out.MOVE) L.push(`MOVE  ${Object.keys(out.MOVE.rows).length} rows · ${out.MOVE.fails.length ? out.MOVE.fails.join('; ') : 'all as Nils\'s table'}`);
  if (out.A8) L.push(`A8    peek after a touch: n ${out.A8.n}, p50 ${out.A8.p50?.toFixed(1)} ms, p95 ${out.A8.p95?.toFixed(1)} ms, max ${out.A8.max?.toFixed(1)} ms`);
  if (out.A2) L.push(`A2    scripted glance (rhythm / sound): ${out.A2.map(g => `seed ${g.seed} ${g.right}/${g.of}`).join(', ')}`);
  if (out.LOG) L.push(`LOG   controls ${out.LOG.off.controls} off / ${out.LOG.on.controls} on, rings ${out.LOG.ringsSame ? 'fixed' : 'MOVED'}`);
  if (out.MISCLICK) L.push(`MISCLICK ${out.MISCLICK.clicks} clicks: ${Object.entries(out.MISCLICK.tally).map(([k, v]) => `${k} ${v}`).join(', ')} · direct hits on destructive controls ${out.MISCLICK.hits.length} (${out.MISCLICK.hits.map(h => `${h.on}→${h.target}`).join(', ') || '—'}) · mis-click accidents ${out.MISCLICK.accidents.length}${out.MISCLICK.accidents.length ? ` (${out.MISCLICK.accidents.map(a => `#${a.click} ${a.on}→${a.target}`).join(', ')})` : ''} · page errors ${out.MISCLICK.errors}`);
  if (out.FILTER) L.push(`FILTER slips from off ${out.FILTER.slips.join(' ')} · across from LP 10, 1 px a step: off for ${out.FILTER.held} px (${out.FILTER.walk}) · a key across off: ${out.FILTER.keys.join(' / ')}`);
  if (out.SHIFT) { const s = out.SHIFT; L.push(`SHIFT ⇧ on the focused swing knob: ${s.shift.page}, focus ${s.shift.focus}; Shift+↑ ${s.up.swing} → ${s.fine.swing}; the Move's Shift ${s.moveShift.page} → focus back on ${s.moveBack.focus}; Shift+Tab from cell 1 → ${s.tab.focus} (${s.tab.page}), after ⇧ ${s.tabAfter.focus}`); }
  if (out.HELP) L.push(`HELP  the "?" Move drawing per page (rhythm / sound tab / held step / +Shift / Loop), the keys tab, Esc: ${out.HELP.fails.length ? out.HELP.fails.join('; ') : 'all as the decision'}`);
  if (out.FMODE) L.push(`FMODE peek on a touch "${out.FMODE.peek}" · ${out.FMODE.fails.length ? out.FMODE.fails.join('; ') : 'pill pressable, rings fixed, Esc comes back'}`);
  if (out.BOUNCE) { const o = out.BOUNCE; L.push(`BOUNCE kick muted after: a double bring-back on the Move ${o.moveDouble} · a stutter ${o.stutter?.muted} (${o.stutter?.presses} presses) · a double click on its M ${o.lampDouble} · a press 0.3 s on ${o.late} · "on next bar" double ${o.nextBar?.muted}${o.fails.length ? ` · ${o.fails.join('; ')}` : ''}`); }
  if (out.CLOCK) L.push(`CLOCK ${out.CLOCK.bursts} drags / turns of speed × and tempo while playing (tempo ${out.CLOCK.tempo.join(' → ')}): page errors ${out.CLOCK.errors}, ticks back ${out.CLOCK.back}${out.CLOCK.fails.length ? ` · ${out.CLOCK.fails.join('; ')}` : ''}`);
  console.log(L.join('\n')); if (fails.length) console.log(`FAIL\n  ${fails.join('\n  ')}`);
  if (has('--assert') && fails.length) process.exit(1);
}
