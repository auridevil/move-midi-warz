// RD-10 browser check: the A4 walk, scripted (DECISION "VoiceOver walk (cold)"), in a muted headless Chrome (cdp.mjs).
// The real walk is a person with VoiceOver; this is its accessibility-tree equivalent, so a regression is caught by a
// script (the pills' "announced once, never per bar" part lives in pills-check.mjs ANNOUNCE, the "stems" Enter-run in
// find-check.mjs KEYS: both run with this one for the full A4). With --size 390x844m it checks the phone instead.
//
//   node orbit2/tools/access-check.mjs [--port 5400 --debug 9400] [--size 1512x860 | 390x844m] [--json out.json] [--root /tmp/x]
//
// PLAY    a cold page's first Tab is play (and nothing focusable sits before the console)
// TREE    the canvas in Chrome's accessibility tree: one focusable application named per bar ("… lanes, aligns in …
//         beats"), its keys described; the pills region a status, not atomic
// LANE2   lane 2's steps in under 10 keys (Greta's route: Alt+2, then find): Alt+2 / s t e p ␣ 2 Enter = 9 keys end
//         with the focus on lane 2's "step 2" cell, and Enter toggles it (one more undoable edit)
// STEMS   "stems" by search: / s t puts export stems first (4 keys with the Enter; the Enter itself runs the export,
//         gated in find-check KEYS, so here the list is read instead of pressed)
// CANVAS  the canvas focus edits (A4's last leg): Tab reaches the canvas after the console, ↓ ↓ picks lane 3, → picks
//         step 2, Enter Enter = on then accent (the planet-tap cycle), each move spoken through #announce; then the
//         condition from the step page: Shift+Tab back to the cell (the cells followed), Alt+Enter opens its step
//         page, Shift+Tab Shift+Tab lands on knob 8 (condition) and ↑ sets it — the walk never needs the mouse
// PIN     (RD-10 round 1) the canvas focus turns the cells to its step's page only while it holds the focus: step 20 of
//         a 32-step lane shows 17–32, and once the focus leaves the cells follow again (a Tab pass pinned them for good)
// ARM     a click that leaves the focus on the canvas arms nothing: the first Enter says the step, the next edits it
// QUESTS  × hides the quests; Sheet → setup → "show the quests again" brings the pill back, and that survives a reload
// PHONE   with --size 390x844m (touch, mobile): A6, the page never scrolls (load, six pills, "+N more" open, a step
//         page, playing); every control the phone's console leaves out (fill, fill next, the filter, throw, the action
//         words, the voice, the Move's connect) is drawn in the sheet once shown, 44 px tall, and fill holds by touch;
//         find lists only what it can show or run (each entry drawn once revealed, or an action)
import { launch } from './cdp.mjs';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const size = arg('--size', '1512x860'), PHONE = size.endsWith('m'), [W, H] = size.replace(/m$/, '').split('x').map(Number);
const out = { size, fails: [] }, fail = (gate, msg) => { out.fails.push(`${gate}: ${msg}`); console.error(`FAIL ${gate}: ${msg}`); };
const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug', 9400), root: arg('--root', undefined) });

try {
  const p = await b.open('orbit2/index.html', { width: W, height: H, mobile: PHONE, ready: '!!window.__poly' });
  await p.sleep(400);
  if (PHONE) await phone(p); else await walk(p);
  const errs = p.errors.filter(e => !/favicon/.test(e));
  if (errs.length) fail('PAGE', `page errors: ${errs.slice(0, 3).join(' | ')}`);
} finally { await b.close(); }

if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 2));
const { fails, ...said } = out; console.log(JSON.stringify({ ...said, fails }, null, 1));
process.exit(out.fails.length ? 1 : 0);

async function walk(p) {
  const alt = async (key, code) => { for (const type of ['keyDown', 'keyUp']) await p.send('Input.dispatchKeyEvent', { type, key, code, modifiers: 1, text: type === 'keyDown' && key === 'Enter' ? '\r' : key.length === 1 ? key : undefined }); };
  const shiftTab = async () => { for (const type of ['keyDown', 'keyUp']) await p.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', modifiers: 8 }); };
  const active = () => p.eval(`(() => { const a = document.activeElement; return { id: a.id, cls: a.className, label: a.getAttribute && a.getAttribute('aria-label') }; })()`);
  const tabTo = async (id, max = 60) => { let n = 0, at = null; for (; n < max; ) { await p.key('Tab'); n++; at = await active(); if (at.id === id) break; } return { n, at }; };

  // ---- PLAY: the first Tab of a cold page ----
  await p.key('Tab');
  const first = await active();
  if (first.id !== 'btn-play') fail('PLAY', `the first Tab landed on ${first.id || first.cls || 'nothing'}, not play`);
  out.firstTab = first.id;

  // ---- TREE: the canvas and the pills in the accessibility tree ----
  const { nodes } = (await p.send('Accessibility.getFullAXTree')).result;
  const ax = (role) => nodes.filter(n => !n.ignored && n.role?.value === role);
  const app = ax('application');
  if (app.length !== 1) fail('TREE', `${app.length} application nodes (want the canvas alone)`);
  const name = String(app[0]?.name?.value || '');
  if (!/rings: \d lanes, aligns in \d+ beats/.test(name)) fail('TREE', `the canvas is named "${name}", not per bar`);
  const desc = String(app[0]?.description?.value || '');
  if (!/arrows pick a lane|Up and down arrows/i.test(desc)) fail('TREE', `the canvas keys are not described ("${desc}")`);
  const status = ax('status');
  if (!status.length) fail('TREE', 'no status region (the pills)');
  out.tree = { application: name, description: desc.slice(0, 60), statusRegions: status.length };

  // ---- LANE2: Alt+2, find "step 2", Enter → the focus on lane 2's cell; 9 keys ≤ 10 ----
  await alt('2', 'Digit2'); await p.sleep(100);
  if (await p.eval('__poly.m.selected') !== 1) fail('LANE2', 'Alt+2 did not select lane 2');
  await p.key('/'); await p.sleep(250);
  for (const k of 'step 2') await p.key(k === ' ' ? ' ' : k);
  await p.sleep(250); await p.key('Enter'); await p.sleep(300);
  const cell = await active();
  const onCell = /\bst\b/.test(cell.cls) && /^step 2\b/.test(cell.label || '');
  if (!onCell) fail('LANE2', `9 keys ended on "${cell.label || cell.id}" (want lane 2's step 2 cell)`);
  const was = await p.eval('__poly.m.lane.hitAt(1)');
  await p.key('Enter'); await p.sleep(150);
  if (await p.eval('__poly.m.lane.hitAt(1)') === was) fail('LANE2', 'Enter on the cell did not toggle the step');
  await p.key('Enter'); await p.key('Enter'); await p.key('Enter'); await p.sleep(100);   // round the cycle: leave it as found
  out.lane2 = { keys: 9, cell: cell.label };

  // ---- STEMS: / s t → export stems first (the Enter that runs it: find-check KEYS) ----
  await p.key('Escape'); await p.sleep(150); await p.key('/'); await p.sleep(250);
  await p.key('s'); await p.key('t'); await p.sleep(250);
  const top = await p.eval(`document.querySelector('#find-list [role=option]')?.textContent || ''`);
  if (!/export stems/.test(top)) fail('STEMS', `"st" puts "${top}" first, not export stems`);
  out.stems = { keys: 4, top };
  await p.key('Escape'); await p.sleep(100); await p.key('Escape'); await p.sleep(200);   // the field, then the sheet

  // ---- CANVAS: Tab reaches the canvas after the console; ↓↓ → ·· Enter Enter; the condition from the step page ----
  // the walk ADDS a hit on lane 3 step 2, so the fixture starts it off (the demo hat already plays there)
  await p.eval(`(() => { document.activeElement.blur(); const l = __poly.m.lanes[2]; while (l.tierAt(l.stepIndex(1)) !== 'off') l.tapStep(l.stepIndex(1)); __poly.m.select(0); __poly.sync(); })()`); await p.sleep(100);
  let tabs = 0, at = null;
  for (; tabs < 60; ) { await p.key('Tab'); tabs++; at = await active(); if (at.id === 'cv' || at.id === 'legend' || (at.cls || '').includes('lane-tab')) break; }
  if (at.id !== 'cv') fail('CANVAS', `Tab never reached the canvas (stopped at ${at.id || at.cls} after ${tabs})`);
  const sawConsole = tabs > 5;   // play, the transport, the lane face, the cells, the actions come first
  if (!sawConsole) fail('CANVAS', `the canvas came ${tabs} Tabs in: before the console`);
  out.canvas = { tabs };
  await p.key('ArrowDown'); await p.sleep(80); await p.key('ArrowDown'); await p.sleep(80);
  if (await p.eval('__poly.m.selected') !== 2) fail('CANVAS', '↓ ↓ did not select lane 3');
  await p.key('ArrowRight'); await p.sleep(80);
  await p.key('Enter'); await p.sleep(120); await p.key('Enter'); await p.sleep(200);
  const step = await p.eval(`(() => { const l = __poly.m.lanes[2]; return { on: l.hitAt(1), acc: l.accentAt(1) }; })()`);
  if (!step.on || !step.acc) fail('CANVAS', `Enter Enter left lane 3 step 2 ${JSON.stringify(step)}, not on + accent`);
  const spoken = await p.eval(`document.getElementById('announce').textContent`);
  if (!/step 2/.test(spoken)) fail('CANVAS', `the move was not spoken ("${spoken}")`);
  // the condition, from the step page, keyboard only: back to the cell, Alt+Enter, back twice to knob 8, ↑
  let back = 0, cellAt = null;
  for (; back < 40; ) { await shiftTab(); back++; cellAt = await active(); if (/^step 2\b/.test(cellAt.label || '')) break; }
  if (!/^step 2\b/.test(cellAt.label || '')) fail('CANVAS', `Shift+Tab never reached the step 2 cell (${cellAt.id || cellAt.label})`);
  await alt('Enter', 'Enter'); await p.sleep(250);
  if (await p.eval('__poly.page.row') !== 'step') fail('CANVAS', 'Alt+Enter on the cell did not open its step page');
  const condBefore = await p.eval(`__poly.m.lane.trigAt(1)?.cond ?? 'always'`);
  for (const _ of [1, 2]) await shiftTab();
  const knob = await active();
  if (!/condition/.test(knob.label || '')) fail('CANVAS', `two Shift+Tabs from the cell landed on "${knob.label || knob.id}", not the condition knob`);
  await p.key('ArrowUp'); await p.sleep(250);
  const cond = await p.eval(`__poly.m.lane.trigAt(1)?.cond ?? 'always'`);
  if (cond === condBefore) fail('CANVAS', `↑ on knob 8 left the condition ${cond}`);
  out.walk = { lane3step2: step, spoken, condition: cond };   // the profile is scratch: nothing to put back
  await p.key('Escape'); await p.sleep(150); await p.key('Escape'); await p.sleep(150);   // the step page, then the keys back

  // ---- PIN: the cells turn with the canvas focus, and follow again once it leaves ----
  const cellsFirst = `Number(/^step (\\d+)/.exec([...document.querySelectorAll('#stepsui .st:not(.out)')][0]?.getAttribute('aria-label') || '')?.[1] || 0)`;
  await p.eval(`(() => { document.activeElement.blur(); const l = __poly.m.lanes[0]; l.setLength(32); for (let i = 0; i < 32; i += 4) l.hits[i] = true; __poly.m.select(0); __poly.sync(); })()`); await p.sleep(150);
  const pinTab = await tabTo('cv');
  if (pinTab.at.id !== 'cv') fail('PIN', 'Tab never reached the canvas');
  const sayNow = () => p.eval(`document.getElementById('announce').textContent`);   // (the canvas keeps its step: walk to 20)
  for (let i = 0; i < 40 && !/step 20 of 32/.test(await sayNow()); i++) { await p.key('ArrowRight'); await p.sleep(160); }
  const onFocus = await p.eval(cellsFirst), said = await sayNow();
  if (onFocus !== 17) fail('PIN', `step 20 focused, the cells start at step ${onFocus} (want 17)`);
  if (!/step 20 of 32/.test(said)) fail('PIN', `step 20 was said as "${said}"`);
  await p.key('Tab'); await p.sleep(150);   // the focus moves on (the lane list)
  const afterBlur = await p.eval(cellsFirst);
  if (afterBlur !== 1) fail('PIN', `the focus left, the cells still start at step ${afterBlur} (stopped, following shows 1–16)`);
  // a shorter lane on the way keeps the wanted step: ↓ to a 4-step lane, ↑ back = step 20 again
  await shiftTab(); await p.sleep(100);
  if ((await active()).id === 'cv') { await p.key('ArrowDown'); await p.key('ArrowUp'); await p.sleep(150); const back2 = await p.eval(`document.getElementById('announce').textContent`); if (!/step 20 of 32/.test(back2)) fail('PIN', `↓ ↑ through a shorter lane came back as "${back2}" (want step 20 of 32)`); }
  out.pin = { focused: onFocus, said, afterBlur };

  // ---- ARM: a click leaves the focus on the canvas; the first Enter says the step, it doesn't edit ----
  await p.eval('document.activeElement.blur()');
  const geo = await p.eval('__poly.scene.geo()'), before = await p.eval('JSON.stringify(__poly.m.lanes.map(l => l.toJSON()))');
  await p.click(Math.round(geo.cx + geo.outer + 4), Math.round(geo.cy)); await p.sleep(150);   // just outside the outer ring: no tick
  const clicked = await active();
  if (clicked.id === 'cv') {
    await p.key('Enter'); await p.sleep(200);
    const after = await p.eval('JSON.stringify(__poly.m.lanes.map(l => l.toJSON()))'), told = await p.eval(`document.getElementById('announce').textContent`);
    if (after !== before) fail('ARM', 'the first Enter after a click edited a step');
    if (!/step \d+ of \d+/.test(told)) fail('ARM', `the first Enter after a click said "${told}" (want the step)`);
    out.arm = { focusAfterClick: 'cv', firstEnter: told };
  } else out.arm = { focusAfterClick: clicked.id || clicked.cls || 'body' };   // a click that doesn't focus it has nothing to arm

  // ---- QUESTS: × hides them, Sheet → setup brings them back, a reload keeps it ----
  await p.eval(`document.getElementById('quest-x').click()`); await p.sleep(150);
  const hid = await p.eval(`({ pill: document.getElementById('quest').hidden, back: document.getElementById('quests-show').hidden })`);
  if (!hid.pill || hid.back) fail('QUESTS', `after ×: pill hidden ${hid.pill}, the way back hidden ${hid.back}`);
  await p.eval(`(() => { __poly.reveal('quests-show'); document.getElementById('quests-show').click(); })()`); await p.sleep(200);
  const back3 = await p.eval(`({ pill: document.getElementById('quest').hidden, back: document.getElementById('quests-show').hidden })`);
  if (back3.pill || !back3.back) fail('QUESTS', `after "show the quests again": pill hidden ${back3.pill}, the button still there ${!back3.back}`);
  await p.send('Page.reload'); await p.sleep(3500);
  if (await p.eval(`document.getElementById('quest').hidden`)) fail('QUESTS', 'the quests are hidden again after a reload');
  out.quests = { hidden: hid, back: back3 };
}

async function phone(p) {
  const scroll = (st) => p.eval(`[document.documentElement.scrollHeight, innerHeight]`).then(([sh, ih]) => { (out.scroll ??= {})[st] = `${sh}/${ih}`; if (sh > ih) fail('PHONE', `${st}: the page scrolls (${sh} > ${ih})`); });
  await p.eval(`document.getElementById('toast')?.classList.remove('show')`); await p.sleep(300);
  await scroll('load');
  await p.eval(`__poly.showPills(['rec', 'chain', 'solo', 'evolve', 'dice', 'clock'])`); await p.sleep(250); await scroll('six pills');
  await p.eval(`__poly.setPillsOpen(true)`); await p.sleep(250); await scroll('+N more open');
  await p.eval(`(() => { __poly.setPillsOpen(false); __poly.showPills(null); })()`); await p.sleep(200);
  await p.eval(`__poly.editLocks(0)`); await p.sleep(250); await scroll('step page');
  await p.eval(`__poly.editLocks(0)`); await p.sleep(200);
  await p.eval(`document.getElementById('btn-play').click()`); await p.sleep(1500); await scroll('playing');
  await p.eval(`document.getElementById('btn-play').click()`); await p.sleep(300);
  // every control the console leaves out: in the sheet, drawn once shown, finger-sized
  const OFF = ['btn-fill', 'btn-latch', 'btn-throw', 'btn-undo', 'btn-random', 'btn-jam', 'btn-share', 'voice-select', 'btn-connect'];
  const reach = await p.eval(`(() => { const out = {}; const fx = document.querySelector('#fx-gauge [role=slider]'); for (const el of [${OFF.map(i => `document.getElementById('${i}')`).join(', ')}, fx]) { if (!el) continue; const id = el.id || 'fx-gauge slider'; if (el.closest('#move-status')?.hidden) { out[id] = 'no Web MIDI'; continue; } __poly.reveal(el); const r = el.getBoundingClientRect(); out[id] = { sheet: !!el.closest('#sheet'), drawn: el.getClientRects().length > 0 && r.width > 0, h: Math.round(r.height) }; } __poly.setSheet(__poly.sheet.tab, false); return out; })()`);
  for (const [id, r] of Object.entries(reach)) if (typeof r === 'object' && (!r.sheet || !r.drawn || (id !== 'fx-gauge slider' && r.h < 44))) fail('PHONE', `${id}: ${JSON.stringify(r)} (want in the sheet, drawn, ≥ 44 px tall)`);
  out.reach = reach;
  // fill holds by touch, from the sheet
  const f = await p.eval(`(() => { __poly.reveal('btn-fill'); const r = document.getElementById('btn-fill').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [f] }); await p.sleep(150);
  const held = await p.eval('__poly.fill');
  await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.sleep(150);
  const let_ = await p.eval('__poly.fill');
  if (!held || let_) fail('PHONE', `fill by touch: ${held ? 'on' : 'off'} while held, ${let_ ? 'on' : 'off'} after`);
  out.fillTouch = { held, after: let_ };
  // find lists only what it can show or run
  const dead = await p.eval(`(() => { __poly.setSheet('lane', false); const idx = __poly.findIndex(), bad = []; for (const e of idx) { if (e.action) continue; __poly.reveal(e.el); if (!e.el.getClientRects().length) bad.push(e.name + ' · ' + e.where); } __poly.setSheet(__poly.sheet.tab, false); return { n: idx.length, bad }; })()`);
  if (dead.bad.length) fail('PHONE', `find lists ${dead.bad.length} controls it can't show: ${dead.bad.slice(0, 6).join('; ')}`);
  out.find = { entries: dead.n, unshowable: dead.bad.length };
}
