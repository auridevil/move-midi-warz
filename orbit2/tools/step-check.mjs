// RD-6 step check (DECISION RD-6 row: the step page and the ring answering the hand). Muted headless Chrome (cdp.mjs),
// the page as a set opens it (session.mjs openSet: ?setlog, the Move simulated, groove techno).
//
//   node orbit2/tools/step-check.mjs                      # everything at 1512×860, a report on stdout
//   node orbit2/tools/step-check.mjs --assert --json /tmp/x.json --shots /tmp/orbit2-impl/ --only MOVE,TAP,MOUSE,LOOP,HAND,A2,FRAME
//   --port 5400 --debug-port 9400   --size 1280x720   --root /tmp/x (a `git archive`)
//
// MOVE   hold a step on the Move + the knobs / jog / push (Nils's T1a → T1b → T2): the cell outlined in the same task as
//        the press, the page only once a knob is touched; knob 1 = the tune lock, knob 8 = the condition (the loop dots
//        follow), Shift + knob 8 = the repeats (only slot 8 repaints), the jog = nudge, push the jog = the next stroke; the
//        release toggles nothing; every lock saved (read back from localStorage).
// TAP    the 450 ms rule: taps shorter than LOOK_MS with no knob toggle their step and never flash the page (a
//        MutationObserver on the row, the cells and the step words sees nothing change); a hold of LOOK_MS + no turn shows
//        the page and toggles nothing.
// MOUSE  the mouse latch: a cell's long-press opens its step page (the sheet stays closed); a click on another cell (a
//        loop dot now) or on a planet switches the step; nothing is edited by those clicks; done and Esc close it.
// LOOP   Loop held on the Move: the cells are the 16 slots, the knobs keep their page, the header says "slots · held on
//        Move" (RD-9); let go: the steps again.
// HAND   the ring answers the hand: a Move touch on shift = the scene's hand (rotation) and the plate on knob 3; HAND_MS
//        after the release both are gone; a drag on the console's length knob = the hand (length).
// A2     the scripted glance for the step page (the DOM oracle; glance.mjs has the player agents judge pictures): select
//        a lane on the Move, hold a step, half the trials turn a knob, look 300 ms after the page is due: the page must
//        be "step N" of the step held, on the lane asked; ≥ 18 of 20 per seed.
// FRAME  A9's frame time with the ring answering: playing, 8 s with hands on knobs (shift / hits / swing / chance turned
//        every 120 ms, a step held) vs 8 s without: a frame's rAF callbacks summed, p95; ≤ the RD-1 baseline + 1 ms.
import { launch } from './cdp.mjs';
import { openSet } from './session.mjs';
import { bytes, trackOf } from './session-core.mjs';
import { mulberry32 } from '../src/poly/dice.js';
import { WHEEL_PUSH_CC } from 'movewire';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const send = (p, b) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(b)}))`);
const BASE = JSON.parse(readFileSync(new URL('../docs/redesign/baseline/rd01-a9.json', import.meta.url), 'utf8')).clock.runs.map(r => r.frameMs.frame95).filter(Number.isFinite);
export const THRESH = { glance: 18, frameMs: Math.max(...BASE) + 1 };
// the old lock panel (Sheet → lane): RD-6 keeps it only as the step page's "more…" (never the 7 lock knobs: the row has them)
const PANEL = `(() => { const lp = document.getElementById('lockpanel'); return { hidden: lp.hidden, knobs: [...lp.querySelectorAll('.gauge')].filter(g => g.getClientRects().length).map(g => g.querySelector('.g-label').textContent) }; })()`;   // the knobs it draws
const ROW_LOCK_LABELS = ['tune', 'probability', 'velocity', 'decay', 'tone', 'snap', 'color', 'condition', 'repeats'];   // the step page's 8 knobs
// is a step still open: a cell's selection outline, the step tab, and whether Esc would close a step
const SEL = `({ sel: [...document.querySelectorAll('#stepsui .st')].flatMap((b, k) => b.classList.contains('sel') ? [k + 1] : []), stepTab: document.getElementById('pg-step').getAttribute('aria-disabled'), esc: __poly.escState().step })`;
// the row, the cells, the step words and knob 8, as the page draws them
const STATE =`(() => { const g = (i) => document.getElementById(i); return { row: g('knobs').dataset.page, cells: g('stepsui').dataset.cells, word: g('lh-page').textContent, tools: !g('step-tools').hidden, k8: g('knobs').children[7].querySelector('.g-label')?.textContent, rings: document.querySelectorAll('#knobs .gauge.ring').length, lit: document.querySelectorAll('#stepsui .st.lp-on:not(.out)').length, held: [...document.querySelectorAll('#stepsui .st')].flatMap((b, i) => b.classList.contains('held') ? [i + 1] : []), lane: parseInt(g('lh-lane').textContent, 10), sheet: __poly.sheet.open }; })()`;
/** A lane of the set whose voice has strokes (push the jog = the next one), selected, and its first hit (0-based). */
const pickLane = (p) => p.eval(`(async () => { const { ARTICS } = await import('./src/poly/voices.js'); const ls = __poly.m.lanes; let li = ls.findIndex(l => ARTICS[l.voice] && l.hits.some(Boolean)); if (li < 0) li = 1; __poly.m.select(li); __poly.sync(); const l = __poly.m.lane; let i = 0; while (i < l.length && !l.hitAt(i)) i++; return { li, i, artics: !!ARTICS[l.voice] }; })()`);
const saved = (p, i) => p.eval(`(() => { const s = JSON.parse(localStorage.getItem('midi-warz.orbit2.v2')), l = s.lanes[s.selected], si = __poly.m.lane.stepIndex(${i}); return { lock: l.locks[si], trig: l.trigs[si] }; })()`);

async function moveHold(p) {
  const { i, artics } = await pickLane(p), out = { step: i + 1, artics }, fails = [];
  const hit0 = await p.eval(`__poly.m.lane.hitAt(${i})`);
  // the press and the outline in one task: within the frame
  out.outlined = await p.eval(`(() => { __poly.move.receive(new Uint8Array(${JSON.stringify(bytes.step(i, true))})); return document.querySelectorAll('#stepsui .st')[${i}].classList.contains('held'); })()`);
  out.T1a = await p.eval(STATE);
  await send(p, bytes.touch(0, true)); await sleep(30); out.touched = await p.eval(STATE);   // a touch is no turn: still T1a
  await send(p, bytes.enc(0, 5)); await sleep(30); out.turned = await p.eval(STATE); await send(p, bytes.touch(0, false));
  await send(p, bytes.touch(7, true)); await send(p, bytes.enc(7, 1)); await sleep(40); out.cond = await p.eval(STATE);
  await send(p, bytes.btn('shift', true)); await sleep(30); out.T2 = await p.eval(STATE); await send(p, bytes.enc(7, 1)); await sleep(30); await send(p, bytes.btn('shift', false)); await send(p, bytes.touch(7, false));
  await send(p, bytes.wheel(2)); await sleep(30);
  if (artics) { await send(p, [0xB0, WHEEL_PUSH_CC, 127]); await send(p, [0xB0, WHEEL_PUSH_CC, 0]); await sleep(30); }   // push the jog (CC 3)
  out.locks = await saved(p, i);
  await send(p, bytes.step(i, false)); await sleep(60); out.after = await p.eval(STATE); out.hitAfter = await p.eval(`__poly.m.lane.hitAt(${i})`); out.panel = await p.eval(PANEL); out.sel = await p.eval(SEL);
  if (!out.outlined) fails.push('the held cell was not outlined in the task of the press');
  if (out.T1a.row === 'step') fails.push('T1a: the page flipped before a look or a knob');
  if (out.touched.row === 'step') fails.push('a knob touched (not turned) on a held step showed the page: a touch is no turn');
  if (out.turned.row !== 'step' || out.turned.rings !== 8 || out.turned.cells !== 'loops' || out.turned.k8 !== 'condition') fails.push(`a knob turned on the held step: ${JSON.stringify(out.turned)}`);
  if (!out.panel.hidden) fails.push(`the old lock panel is shown once the row left the step page (a second lock editor): ${JSON.stringify(out.panel)}`);
  // the edits came inside LOOK_MS (the usual hold-and-turn): letting go gives the editor back all the same (round 2)
  if (out.sel.sel.length || out.sel.stepTab !== 'true' || out.sel.esc) fails.push(`after a Move edit's release a step stayed selected: ${JSON.stringify(out.sel)}`);
  if (out.cond.lit !== 8) fails.push(`knob 8 → 1:2 should light 8 of 16 loop dots, lit ${out.cond.lit}`);
  if (out.T2.k8 !== 'repeats' || out.T2.row !== 'step') fails.push(`T2 (+ Shift): ${JSON.stringify(out.T2)}`);
  const L = out.locks; if (!(L.lock?.tune > 0)) fails.push(`knob 1 did not lock tune: ${JSON.stringify(L)}`);
  if (L.trig?.cond !== '1:2' || L.trig?.ratchet !== 2) fails.push(`condition / repeats not saved: ${JSON.stringify(L.trig)}`);
  if (!(Math.abs((L.lock?.nudge ?? 0) - 0.1) < 1e-9)) fails.push(`the jog did not nudge 0.1: ${L.lock?.nudge}`);
  if (artics && L.lock?.artic == null) fails.push('push the jog did not lock a stroke');
  if (out.hitAfter !== hit0) fails.push('the release after the knobs toggled the step');
  if (out.after.row === 'step') fails.push('the page stayed after the release');
  // every Move edit path borrows the editor, also as the first thing inside LOOK_MS: knob 8, the jog, its push
  out.firsts = {};
  // (round 3: also Shift + knob 8, two steps held, and an early edit then held past LOOK_MS)
  const j = await p.eval(`(() => { const l = __poly.m.lane; for (let s = Math.min(16, l.length) - 1; s >= 0; s--) if (s !== ${i}) return s; return ${i}; })()`);
  for (const [name, edit, also = null, hold = 60] of [['knob 8', [bytes.touch(7, true), bytes.enc(7, 1), bytes.touch(7, false)]], ['jog', [bytes.wheel(1)]], ...(artics ? [['push', [[0xB0, WHEEL_PUSH_CC, 127], [0xB0, WHEEL_PUSH_CC, 0]]]] : []),
    ['Shift + knob 8', [bytes.btn('shift', true), bytes.touch(7, true), bytes.enc(7, 1), bytes.touch(7, false), bytes.btn('shift', false)]], ['two held', [bytes.touch(0, true), bytes.enc(0, 1), bytes.touch(0, false)], j], ['held on past LOOK_MS', [bytes.touch(0, true), bytes.enc(0, -1), bytes.touch(0, false)], null, 700]]) {
    await send(p, bytes.step(i, true)); if (also != null) await send(p, bytes.step(also, true)); await sleep(80); for (const x of edit) await send(p, x); await sleep(hold);
    if (also != null) await send(p, bytes.step(also, false)); await send(p, bytes.step(i, false)); await sleep(80);
    const s = out.firsts[name] = await p.eval(SEL); if (s.sel.length || s.stepTab !== 'true') fails.push(`a Move edit by ${name} inside LOOK_MS left a step selected: ${JSON.stringify(s)}`);
  }
  return { ...out, fails };
}

async function tapRule(p) {
  const { i } = await pickLane(p), fails = [], taps = [];
  await p.eval(`(() => { document.getElementById('pg-rhythm').click(); window.__flash = []; const rec = (what) => () => __flash.push(what); window.__mo = new MutationObserver((ms) => { const by = new Map(); for (const m of ms) { const k = m.target.id + ':' + m.attributeName; if (!by.has(k)) by.set(k, { el: m.target, a: m.attributeName, v: [] }); by.get(k).v.push(m.oldValue); } for (const [k, { el, a, v }] of by) { v.push(el.getAttribute(a)); if (v.some((x, i) => i && x !== v[i - 1])) __flash.push(k); } }); for (const id of ['knobs', 'stepsui', 'step-tools']) __mo.observe(document.getElementById(id), { attributes: true, attributeOldValue: true, attributeFilter: ['data-page', 'data-cells', 'hidden'] }); })()`);   // a value written again unchanged is no flash
  const rng = mulberry32(7);
  for (let k = 0; k < 10; k++) {
    const ms = 40 + Math.floor(rng() * 360), h0 = await p.eval(`__poly.m.lane.hitAt(${i})`);
    await p.eval('__flash.length = 0'); await send(p, bytes.step(i, true)); await sleep(ms); await send(p, bytes.step(i, false)); await sleep(80);
    const flashes = await p.eval('__flash.slice()'), h1 = await p.eval(`__poly.m.lane.hitAt(${i})`); taps.push({ ms, toggled: h0 !== h1, flashes: flashes.length });
    if (h0 === h1) fails.push(`a ${ms} ms tap did not toggle its step`); if (flashes.length) fails.push(`a ${ms} ms tap flashed: ${flashes.join(', ')}`);
  }
  // a finger resting on a knob (touched, never turned) while the other hand taps: still taps, never the page (RD-6 round
  // 1); the touch before the step, or during it
  const rest = [];
  for (const first of ['touch', 'step']) for (let k = 0; k < 3; k++) {
    const ms = 80 + Math.floor(rng() * 300), h0 = await p.eval(`__poly.m.lane.hitAt(${i})`);
    if (first === 'touch') { await send(p, bytes.touch(2, true)); await sleep(60); }
    await p.eval('__flash.length = 0'); await send(p, bytes.step(i, true));
    if (first === 'step') { await sleep(40); await send(p, bytes.touch(2, true)); }
    await sleep(ms); const mid = await p.eval('__poly.page.row'); await send(p, bytes.step(i, false)); await sleep(80);
    const flashes = await p.eval('__flash.slice()'), h1 = await p.eval(`__poly.m.lane.hitAt(${i})`); await send(p, bytes.touch(2, false)); await sleep(520);
    rest.push({ first, ms, toggled: h0 !== h1, flashes: flashes.length, mid });
    if (h0 === h1) fails.push(`a ${ms} ms tap with a knob touched (${first} first) did not toggle its step`); if (flashes.length || mid === 'step') fails.push(`a ${ms} ms tap with a knob touched (${first} first) flashed: ${mid} ${flashes.join(', ')}`);
  }
  await p.eval('__flash.length = 0');
  const h0 = await p.eval(`__poly.m.lane.hitAt(${i})`); await send(p, bytes.step(i, true)); await sleep(520); const look = await p.eval(STATE); await send(p, bytes.step(i, false)); await sleep(60);
  const lookToggled = (await p.eval(`__poly.m.lane.hitAt(${i})`)) !== h0, seen = (await p.eval('__flash.slice()')).length;
  if (look.row !== 'step') fails.push(`a ${520} ms hold did not show the page: ${look.row}`); if (lookToggled) fails.push('a look (no knob) toggled the step');
  if (!seen) fails.push('the observer saw no change on a look: it cannot see a flash either');   // the guard's own check
  await p.eval('__mo.disconnect()');
  return { taps, rest, look: look.row, lookToggled, lookSeen: seen, fails };
}

const center = (p, sel) => p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const mouse = (p, type, x, y, button = 'left') => p.send('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
async function mouseLatch(p) {
  const { i } = await pickLane(p), fails = [], pat = () => p.eval('JSON.stringify(__poly.m.lane.toJSON())'), before = await pat();
  const cell = (k) => center(p, `#stepsui .st:nth-child(${k + 1})`);
  let c = await cell(i); await mouse(p, 'mousePressed', c.x, c.y); await sleep(560); await mouse(p, 'mouseReleased', c.x, c.y); await sleep(80);
  const opened = await p.eval(STATE);
  const j = await p.eval(`(() => { const l = __poly.m.lane; for (let k = 0; k < Math.min(16, l.length); k++) if (k !== ${i}) return k; return -1; })()`);
  c = await cell(j); await p.click(c.x, c.y); await sleep(80); const switched = await p.eval(STATE);
  // a planet of another hit on the same lane
  const k = await p.eval(`(() => { const l = __poly.m.lane; for (let s = 0; s < l.length; s++) if (s !== ${i} && s !== ${j} && l.hitAt(s)) return s; return -1; })()`);
  let planet = null; if (k >= 0) { const xy = await p.eval(`__poly.scene.stepXY(__poly.m.selected, ${k})`); await p.click(xy.x, xy.y); await sleep(80); planet = await p.eval(STATE); }
  const edited = (await pat()) !== before;
  await p.eval(`document.getElementById('st-done').click()`); await sleep(60); const done = await p.eval(STATE);
  await p.eval(`__poly.editLocks(${i})`); await sleep(40); await p.key('Escape'); await sleep(60); const esc = await p.eval(STATE);
  if (opened.row !== 'step' || opened.word !== `step ${i + 1}` || opened.sheet) fails.push(`the long-press: ${JSON.stringify(opened)}`);
  if (switched.word !== `step ${j + 1}`) fails.push(`a click on cell ${j + 1} (a loop dot) did not switch: ${switched.word}`);
  if (k >= 0 && planet.word !== `step ${k + 1}`) fails.push(`a click on the planet of step ${k + 1} did not switch: ${planet.word}`);
  if (edited) fails.push('the clicks that switched the step edited the pattern');
  if (done.row === 'step') fails.push('done did not close the page'); if (esc.row === 'step') fails.push('Esc did not close the page');
  // the old lock panel is "more…" of the step page only: never the page's knobs (the row has them; their home is hidden),
  // with the page or after another tab (the step tab keeps its step); a Move touch over it leaves it, and its focus, alone
  await p.eval(`__poly.editLocks(${i})`); await sleep(60); await p.eval(`document.getElementById('st-more').click()`); await sleep(120); const more = await p.eval(PANEL);
  const FOCUS = `document.activeElement?.closest?.('.gauge')?.querySelector('.g-label')?.textContent ?? document.activeElement?.tagName`;
  await p.eval(`document.querySelector('#lock-gauges .gauge').focus()`); await send(p, bytes.touch(2, true)); await sleep(80); const touched = { panel: await p.eval(PANEL), focus: await p.eval(FOCUS) };
  await send(p, bytes.touch(2, false)); await sleep(550); const focusAfter = await p.eval(FOCUS);
  await p.eval(`document.getElementById('pg-rhythm').click()`); await sleep(120); const left = await p.eval(PANEL);
  if (more.hidden || more.knobs.some(k => ROW_LOCK_LABELS.includes(k))) fails.push(`more… on the step page: ${JSON.stringify(more)}`);
  if (touched.panel.hidden || touched.focus !== 'nudge' || focusAfter !== 'nudge') fails.push(`a Move touch over more… (focus on nudge): panel ${touched.panel.hidden ? 'hidden' : 'shown'}, focus ${touched.focus} → ${focusAfter}`);
  if (left.knobs.some(k => ROW_LOCK_LABELS.includes(k))) fails.push(`the rhythm tab left the step page and the sheet shows the page's knobs (a second lock editor): ${JSON.stringify(left)}`);
  // … and an Esc closes that remembered step, even with the sheet closed (its cell's outline is what shows it); in focus
  // mode the console is hidden, so the first Esc leaves focus mode (RD-4: only what is seen is a layer), the next closes it
  await p.eval(`__poly.setSheet(null, false)`); await sleep(60); const kept = await p.eval(SEL);
  await p.eval('__poly.setFocusMode(true)'); await sleep(80); await p.key('Escape'); await sleep(80); const fm = { focus: await p.eval('__poly.focusMode'), ...(await p.eval(SEL)) };
  await p.key('Escape'); await sleep(80); const forgot = await p.eval(SEL);
  if (!kept.sel.includes(i + 1)) fails.push(`the step tab's step after the rhythm tab: ${JSON.stringify(kept)}`);
  if (fm.focus || !fm.sel.includes(i + 1)) fails.push(`focus mode + a kept step: the first Esc must leave focus mode, not close the hidden step: ${JSON.stringify(fm)}`);
  if (forgot.sel.length || forgot.stepTab !== 'true') fails.push(`Esc did not close the step kept after the rhythm tab: ${JSON.stringify(forgot)}`);
  // the same with the step page latched: hidden in focus mode, so focus mode goes first
  await p.eval(`__poly.editLocks(${i})`); await sleep(60); await p.eval('__poly.setFocusMode(true)'); await sleep(80); await p.key('Escape'); await sleep(80);
  const fmPage = { focus: await p.eval('__poly.focusMode'), row: (await p.eval(STATE)).row }; await p.key('Escape'); await sleep(80); const fmClosed = (await p.eval(STATE)).row;
  if (fmPage.focus || fmPage.row !== 'step' || fmClosed === 'step') fails.push(`focus mode over a latched step page: Esc → ${JSON.stringify(fmPage)}, then ${fmClosed}`);
  // a Move look at another step over the mouse's step page (Nils's edge case): the Move wins, then the mouse's step;
  // Esc then closes it all (no cell left selected, the step tab off)
  await p.eval(`__poly.editLocks(${i})`); await sleep(60);
  const o = await p.eval(`(() => { const l = __poly.m.lane; for (let s = Math.min(16, l.length) - 1; s >= 0; s--) if (s !== ${i}) return s; return -1; })()`);
  await send(p, bytes.step(o, true)); await sleep(650); const moveLook = (await p.eval(STATE)).word; await send(p, bytes.step(o, false)); await sleep(80); const back = (await p.eval(STATE)).word;
  await p.key('Escape'); await sleep(80);
  const closed = await p.eval(`({ row: document.getElementById('knobs').dataset.page, sel: [...document.querySelectorAll('#stepsui .st')].flatMap((b, k) => b.classList.contains('sel') ? [k + 1] : []), stepTab: document.getElementById('pg-step').getAttribute('aria-disabled') })`);
  if (!moveLook.startsWith(`step ${o + 1} `) || back !== `step ${i + 1}`) fails.push(`a Move look at step ${o + 1} over the mouse's step ${i + 1}: ${moveLook} → ${back}`);
  if (closed.row === 'step' || closed.sel.length || closed.stepTab !== 'true') fails.push(`Esc after a Move look over a mouse step page left the step selected: ${JSON.stringify(closed)}`);
  // an Esc during that look closes the mouse's page: the release then gives back nothing (round 3)
  await p.eval(`__poly.editLocks(${i})`); await sleep(60); await send(p, bytes.step(o, true)); await sleep(650); await p.key('Escape'); await sleep(80); await send(p, bytes.step(o, false)); await sleep(80);
  const escHeld = await p.eval(SEL); if (escHeld.sel.length || escHeld.stepTab !== 'true') fails.push(`Esc during a Move look over a mouse step page: the release brought a step back: ${JSON.stringify(escHeld)}`);
  // a browser without Element.checkVisibility (iOS Safari 16.4–17.3 runs the app): Esc still closes a step, no page error
  const errs0 = p.errors.length; await p.eval('delete Element.prototype.checkVisibility'); await p.eval(`__poly.editLocks(${i})`); await sleep(60); await p.key('Escape'); await sleep(80);
  const oldSafari = { row: (await p.eval(STATE)).row, errors: p.errors.slice(errs0) };
  if (oldSafari.row === 'step' || oldSafari.errors.length) fails.push(`without checkVisibility (older iOS Safari) Esc: ${JSON.stringify(oldSafari)}`);
  return { opened: opened.word, switched: switched.word, planet: planet?.word ?? null, edited, done: done.row, esc: esc.row, more: more.knobs, focus: [touched.focus, focusAfter], left: left.knobs, focusMode: { kept: fm, page: fmPage, then: fmClosed }, forgot, moveLook, back, closed, fails };
}

async function loopHold(p) {
  const steps = () => p.eval(`!document.getElementById('lh-steps').hidden`);
  await pickLane(p); const before = await p.eval(STATE);
  await send(p, bytes.btn('loop', true)); await sleep(60); const on = await p.eval(STATE), stepsOn = await steps();
  const n = await p.eval(`[...document.querySelectorAll('#stepsui .st:not(.out)')].filter(b => /^slot \\d+/.test(b.getAttribute('aria-label'))).length`);
  await send(p, bytes.btn('loop', false)); await sleep(60); const off = await p.eval(STATE), stepsOff = await steps();
  const fails = []; if (on.cells !== 'slots' || n !== 16) fails.push(`Loop held: cells ${on.cells}, ${n} slots`); if (on.row !== before.row) fails.push(`Loop moved the knobs: ${before.row} → ${on.row}`); if (off.cells !== 'steps') fails.push(`let go: cells ${off.cells}`);
  // RD-9 (A2: slots 0 / 14 read under "rhythm"): the header line names the page while Loop holds the cells, and gives the
  // steps' line back on release
  if (on.word !== 'slots · held on Move' || stepsOn) fails.push(`Loop held: the header says "${on.word}"${stepsOn ? ' beside the steps line' : ''}`);
  if (off.word !== before.word || !stepsOff) fails.push(`let go: the header says "${off.word}"${stepsOff ? '' : ', no steps line'}`);
  return { on: on.cells, slots: n, off: off.cells, word: [before.word, on.word, off.word], fails };
}

async function handCheck(p) {
  await pickLane(p); const fails = [], h = () => p.eval(`({ hand: __poly.scene.hand?.k ?? null, plate: [...document.getElementById('knobs').children].findIndex(s => s.classList.contains('plate')) })`);
  await send(p, bytes.touch(2, true)); await send(p, bytes.enc(2, 1)); await sleep(60); const on = await h();
  await send(p, bytes.touch(2, false)); await sleep(150); const tail = await h(); await sleep(400); const off = await h();
  const c = await center(p, '#knobs > :nth-child(1) .gauge'); await mouse(p, 'mousePressed', c.x, c.y); await mouse(p, 'mouseMoved', c.x, c.y - 12); await sleep(40); const drag = await h(); await mouse(p, 'mouseReleased', c.x, c.y - 12); await sleep(500); const dragOff = await h();
  if (on.hand !== 'rotation' || on.plate !== 2) fails.push(`a Move touch on shift: ${JSON.stringify(on)}`);
  if (tail.hand !== 'rotation') fails.push(`HAND_MS after the release the ring stopped answering early: ${JSON.stringify(tail)}`);
  if (off.hand || off.plate >= 0) fails.push(`still answering after HAND_MS: ${JSON.stringify(off)}`);
  if (drag.hand !== 'length') fails.push(`a drag on the length knob: ${JSON.stringify(drag)}`); if (dragOff.hand) fails.push('the drag\'s hand stayed');
  // a held step's halo is drawn (stopped, nothing else moving: the held step alone keeps the scene drawing): the scene's
  // 17 px rings counted on the canvas, and none once let go
  await p.eval(`(() => { window.__halo = 0; const arc = CanvasRenderingContext2D.prototype.arc; if (!window.__haloArc) { window.__haloArc = arc; CanvasRenderingContext2D.prototype.arc = function (x, y, r, ...a) { if (r === 17) __halo++; return arc.call(this, x, y, r, ...a); }; } })()`);
  await sleep(300); await p.eval('__halo = 0'); await send(p, bytes.step(3, true)); await sleep(600); const halo = await p.eval('__halo'); await send(p, bytes.step(3, false)); await sleep(300); await p.eval('__halo = 0'); await sleep(300); const haloAfter = await p.eval('__halo');
  if (!halo) fails.push('a held step drew no halo'); if (haloAfter) fails.push(`a halo still drawn after the step was let go (${haloAfter})`);
  return { on, tail, off, drag, halo, haloAfter, fails };
}

async function glance(p, { seed, trials = 20, shots }) {
  const rng = mulberry32(seed), rows = [], n = await p.eval('__poly.m.lanes.length');
  for (let t = 0; t < trials; t++) {
    const li = Math.floor(rng() * n), turn = rng() < 0.5, knob = Math.floor(rng() * 7), tab = rng() < 0.5 ? 'rhythm' : 'sound';
    await p.eval(`document.getElementById('pg-${tab}').click()`);
    await send(p, bytes.btn(trackOf(li), true)); await send(p, bytes.btn(trackOf(li), false)); await sleep(40);
    const len = await p.eval('__poly.m.lane.length'), s = Math.floor(rng() * Math.min(16, len)), set = await p.eval('JSON.stringify(__poly.m)');
    await send(p, bytes.step(s, true)); await sleep(120);
    if (turn) { await send(p, bytes.touch(knob, true)); await send(p, bytes.enc(knob, rng() < 0.5 ? 1 : -1)); }
    await sleep(turn ? 300 : 450 - 120 + 300);   // the shutter: 300 ms after the turn, or after LOOK_MS
    const st = await p.eval(STATE); if (shots && t < 4) await p.shot(`${shots}/a2-step-${seed}-${t + 1}.png`);
    if (turn) await send(p, bytes.touch(knob, false)); await send(p, bytes.step(s, false)); await sleep(500);
    if ((await p.eval('JSON.stringify(__poly.m)')) !== set) { await p.eval('__poly.undo()'); await sleep(30); }   // the turn's lock: leave the set as it was (a look edits nothing: no undo then)
    rows.push({ trial: t + 1, lane: li + 1, step: s + 1, turn, got: st, ok: st.row === 'step' && st.word.startsWith(`step ${s + 1} `) && st.lane === li + 1 });
  }
  const right = rows.filter(r => r.ok).length; return { seed, right, of: trials, misses: rows.filter(r => !r.ok), fails: right < THRESH.glance ? [`seed ${seed}: ${right}/${trials}`] : [] };
}

const FRAMES = `(() => { const raf = window.__scRaf ||= window.requestAnimationFrame.bind(window), per = new Map(); window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); per.set(t, (per.get(t) || 0) + performance.now() - s); }); return () => { window.requestAnimationFrame = raf; return [...per.values()]; }; })()`;
async function frameTime(p, secs = 8) {
  await pickLane(p); await p.eval(`document.getElementById('btn-play').click()`); await sleep(1500);
  const run = async (hands) => {
    await p.eval(`window.__scStop = ${FRAMES}`); const end = Date.now() + secs * 1000; let k = 0;
    if (hands) await send(p, bytes.step(3, true));
    while (Date.now() < end) { if (hands) { const knob = [2, 1, 4, 5][k++ % 4]; await send(p, bytes.touch(knob, true)); await send(p, bytes.enc(knob, k % 2 ? 1 : -1)); await sleep(120); await send(p, bytes.touch(knob, false)); } else await sleep(120); }
    if (hands) await send(p, bytes.step(3, false));
    const f = await p.eval('window.__scStop()'); return { n: f.length, p50: pct(f, 50), p95: pct(f, 95) };
  };
  const idle = await run(false), hands = await run(true);
  await p.eval(`document.getElementById('btn-play').click()`);
  const fails = hands.p95 > THRESH.frameMs ? [`frame p95 with hands ${hands.p95.toFixed(2)} ms > ${THRESH.frameMs} ms (RD-1 ${Math.max(...BASE)} + 1)`] : [];
  return { idle, hands, baseline: BASE, fails };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; }, has = (k) => process.argv.includes(k);
  const only = new Set(String(arg('--only', 'MOVE,TAP,MOUSE,LOOP,HAND,A2,FRAME')).split(',')), shots = arg('--shots', null), out = {}, root = arg('--root', null);
  const [width, height] = arg('--size', '1512x860').split('x').map(Number);
  if (shots) mkdirSync(shots, { recursive: true });
  const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400), ...(root ? { root } : {}) });
  let errors = [];
  try {
    const fresh = async () => { let p; try { p = await openSet(b, { groove: 'techno', width, height }); } catch (e) { if (!/__poly is not defined/.test(e.message)) throw e; p = await openSet(b, { groove: 'techno', width, height }); } errors = p.errors; return p; };
    if (only.has('MOVE')) out.MOVE = await moveHold(await fresh());
    if (only.has('TAP')) out.TAP = await tapRule(await fresh());
    if (only.has('MOUSE')) out.MOUSE = await mouseLatch(await fresh());
    if (only.has('LOOP')) out.LOOP = await loopHold(await fresh());
    if (only.has('HAND')) out.HAND = await handCheck(await fresh());
    if (only.has('A2')) { const p = await fresh(); out.A2 = [await glance(p, { seed: 1, shots }), await glance(p, { seed: 2, shots })]; }
    if (only.has('FRAME')) out.FRAME = await frameTime(await fresh());
  } finally { await b.close(); }
  const fails = Object.entries(out).flatMap(([k, v]) => (Array.isArray(v) ? v.flatMap(x => x.fails) : v.fails).map(f => `${k}: ${f}`));
  if (errors?.length) fails.push(`page errors: ${errors.join(' | ')}`);
  if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
  const L = [`step check at ${width}×${height}`];
  if (out.MOVE) L.push(`MOVE  step ${out.MOVE.step}: outlined in the press's task ${out.MOVE.outlined} · T1a ${out.MOVE.T1a.row} → touched ${out.MOVE.touched.row} → turned ${out.MOVE.turned.row} (${out.MOVE.turned.rings} rings, cells ${out.MOVE.turned.cells}) · 1:2 lights ${out.MOVE.cond.lit}/16 · T2 knob 8 ${out.MOVE.T2.k8} · saved ${JSON.stringify(out.MOVE.locks)} · lock panel after: ${out.MOVE.panel.hidden ? 'hidden' : 'SHOWN'}`);
  if (out.TAP) L.push(`TAP   ${out.TAP.taps.length} taps ${out.TAP.taps.map(t => t.ms).join('/')} ms: toggled ${out.TAP.taps.filter(t => t.toggled).length}, flashes ${out.TAP.taps.reduce((a, t) => a + t.flashes, 0)} · ${out.TAP.rest.length} with a knob touched: toggled ${out.TAP.rest.filter(t => t.toggled).length}, flashes ${out.TAP.rest.reduce((a, t) => a + t.flashes + (t.mid === 'step'), 0)} · a 520 ms look: ${out.TAP.look}, toggled ${out.TAP.lookToggled}`);
  if (out.MOUSE) L.push(`MOUSE long-press → ${out.MOUSE.opened} · a loop dot → ${out.MOUSE.switched} · a planet → ${out.MOUSE.planet} · edited ${out.MOUSE.edited} · done → ${out.MOUSE.done} · Esc → ${out.MOUSE.esc} · more… ${JSON.stringify(out.MOUSE.more)}, a Move touch: focus ${out.MOUSE.focus.join(' → ')}, the rhythm tab: ${JSON.stringify(out.MOUSE.left)}, Esc (sheet closed) → ${JSON.stringify(out.MOUSE.forgot)} · Move look ${out.MOUSE.moveLook} → ${out.MOUSE.back}, Esc → ${JSON.stringify(out.MOUSE.closed)}`);
  if (out.LOOP) L.push(`LOOP  held: ${out.LOOP.on} (${out.LOOP.slots}), header "${out.LOOP.word[1]}" · let go: ${out.LOOP.off}, "${out.LOOP.word[2]}"`);
  if (out.HAND) L.push(`HAND  touch shift ${JSON.stringify(out.HAND.on)} · +150 ms ${JSON.stringify(out.HAND.tail)} · +550 ms ${JSON.stringify(out.HAND.off)} · drag length ${JSON.stringify(out.HAND.drag)}`);
  if (out.A2) L.push(`A2    scripted glance (step page): ${out.A2.map(g => `seed ${g.seed} ${g.right}/${g.of}`).join(', ')}`);
  if (out.FRAME) L.push(`FRAME playing, per frame: no hands p50 ${out.FRAME.idle.p50?.toFixed(2)} p95 ${out.FRAME.idle.p95?.toFixed(2)} ms (${out.FRAME.idle.n}) · hands on knobs p50 ${out.FRAME.hands.p50?.toFixed(2)} p95 ${out.FRAME.hands.p95?.toFixed(2)} ms (${out.FRAME.hands.n}) · RD-1 ${out.FRAME.baseline.join('/')} ms`);
  console.log(L.join('\n')); if (fails.length) console.log(`FAIL\n  ${fails.join('\n  ')}`);
  if (has('--assert') && fails.length) process.exit(1);
}
