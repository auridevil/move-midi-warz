// RD-10 browser check: the A4 walk, scripted (DECISION "VoiceOver walk (cold)"), in a muted headless Chrome (cdp.mjs).
// The real walk is a person with VoiceOver; this is its accessibility-tree equivalent, so a regression is caught by a
// script (the pills' "announced once, never per bar" part lives in pills-check.mjs ANNOUNCE, the "stems" Enter-run in
// find-check.mjs KEYS: both run with this one for the full A4).
//
//   node orbit2/tools/access-check.mjs [--port 5400 --debug 9400] [--size 1512x860] [--json out.json] [--root /tmp/x]
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
import { launch } from './cdp.mjs';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1512x860').split('x').map(Number);
const out = { fails: [] }, fail = (gate, msg) => { out.fails.push(`${gate}: ${msg}`); console.error(`FAIL ${gate}: ${msg}`); };
const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug', 9400), root: arg('--root', undefined) });

try {
  const p = await b.open('orbit2/index.html', { width: W, height: H, ready: '!!window.__poly' });
  await p.sleep(400);
  const alt = async (key, code) => { for (const type of ['keyDown', 'keyUp']) await p.send('Input.dispatchKeyEvent', { type, key, code, modifiers: 1, text: type === 'keyDown' && key === 'Enter' ? '\r' : key.length === 1 ? key : undefined }); };
  const active = () => p.eval(`(() => { const a = document.activeElement; return { id: a.id, cls: a.className, label: a.getAttribute && a.getAttribute('aria-label') }; })()`);

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
  for (; back < 40; ) { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 8 }); back++; cellAt = await active(); if (/^step 2\b/.test(cellAt.label || '')) break; }
  if (!/^step 2\b/.test(cellAt.label || '')) fail('CANVAS', `Shift+Tab never reached the step 2 cell (${cellAt.id || cellAt.label})`);
  await alt('Enter', 'Enter'); await p.sleep(250);
  if (await p.eval('__poly.page.row') !== 'step') fail('CANVAS', 'Alt+Enter on the cell did not open its step page');
  const condBefore = await p.eval(`__poly.m.lane.trigAt(1)?.cond ?? 'always'`);
  for (const _ of [1, 2]) { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 8 }); }
  const knob = await active();
  if (!/condition/.test(knob.label || '')) fail('CANVAS', `two Shift+Tabs from the cell landed on "${knob.label || knob.id}", not the condition knob`);
  await p.key('ArrowUp'); await p.sleep(250);
  const cond = await p.eval(`__poly.m.lane.trigAt(1)?.cond ?? 'always'`);
  if (cond === condBefore) fail('CANVAS', `↑ on knob 8 left the condition ${cond}`);
  out.walk = { lane3step2: step, spoken, condition: cond };   // the profile is scratch: nothing to put back

  const errs = p.errors.filter(e => !/favicon/.test(e));
  if (errs.length) fail('PAGE', `page errors: ${errs.slice(0, 3).join(' | ')}`);
} finally { await b.close(); }

if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ firstTab: out.firstTab, lane2: out.lane2, stems: out.stems, canvas: out.canvas, walk: out.walk, fails: out.fails }, null, 1));
process.exit(out.fails.length ? 1 : 0);
