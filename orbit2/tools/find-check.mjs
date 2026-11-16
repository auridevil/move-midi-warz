// RD-4 browser check: find and one Escape on the real page, in a muted headless Chrome (cdp.mjs).
//
//   node orbit2/tools/find-check.mjs [--port 5400 --debug 9400] [--size 1512x860] [--json out.json]
//
// COVER  every labelled control is in the index: Chrome's accessibility tree is the judge (every node with an
//        interactive role and a name, with every tab, drawer and the everything view shown), not app.js's own selector
// KEYS   "stems" by search in under 5 keys (A4): / s t Enter lands on export stems, its tab open, the focus on it
// ESC    the one order, one layer a press: popup → step locks → sheet → focus mode → the keys back to the page
// CLICK  the same order from clicks on empty canvas, and no click ever edits (pattern, undo history, tempo)
// OWN    key ownership holds (B8): Space plays, a pad row key toggles its step, hold 0 = fill, Alt+1 selects, a text
//        field keeps / and the pad keys, ⌘K in the find field does nothing, an RD-3 save with open: true loads closed
// Exit 1 when a check fails. Prints one JSON summary.
import { launch } from './cdp.mjs';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1512x860').split('x').map(Number), out = { size: `${W}x${H}`, fails: [] };
const fail = (test, what) => out.fails.push({ test, what });
const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug', 9400) });
const press = async (p, key, code, modifiers = 0, up = true) => { const text = key.length === 1 && !(modifiers & 6) ? key : key === 'Enter' ? '\r' : undefined; await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, text, ...(key === 'Escape' ? { windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 } : {}) }); if (up) await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers }); };
const KEY = { '/': 'Slash', ' ': 'Space', Escape: 'Escape', Enter: 'Enter' }, code = (k) => KEY[k] || (/^\d$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`);
const STATE = `JSON.stringify({ esc: __poly.escState(), sheet: __poly.sheet, focus: __poly.focusMode, act: document.activeElement === document.body ? 'body' : document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName })`;
const EDITS = `JSON.stringify([__poly.m.toJSON(), __poly.hist.past.length, __poly.hist.future.length, __poly.hist.cur?.full?.length, __poly.clock && document.querySelector('#tempo-gauge [role=slider]')?.getAttribute('aria-valuenow')])`;
try {
  const p = await b.open('orbit2/index.html', { width: W, height: H, mobile: W < 700 }); await p.captureDownloads();
  const st = async () => JSON.parse(await p.eval(STATE));

  // ---- COVER, in each view: the index as find builds it (the sheet open, app.js openFind), then everything shown
  // (every pane, every drawer) and Chrome's accessibility tree read: each named interactive node must be an index entry ----
  const ROLES = new Set(['button', 'checkbox', 'combobox', 'link', 'menuitem', 'radio', 'slider', 'spinbutton', 'switch', 'tab', 'textbox', 'searchbox', 'DisclosureTriangle', 'PopUpButton', 'ListBox']);
  out.cover = {};
  for (const view of ['simple', 'all']) {
    await p.eval(`(() => { __poly.setView(${JSON.stringify(view)}); __poly.setSheet('lane', true); window.__fx = new Set(__poly.findIndex().map(e => e.el)); document.querySelectorAll('[role=tabpanel]').forEach(x => { x.hidden = false; }); document.querySelectorAll('details').forEach(d => { d.open = true; }); })()`);
    await p.sleep(300);
    const { nodes } = (await p.send('Accessibility.getFullAXTree')).result;
    const named = nodes.filter(n => !n.ignored && ROLES.has(n.role?.value) && String(n.name?.value ?? '').trim() && n.backendDOMNodeId);
    let labelled = 0; const missing = [];
    for (const n of named) {
      const { object } = (await p.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId })).result || {}; if (!object) continue;
      const r = (await p.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, functionDeclaration: `function () { if (this.closest('#find-box')) return null; return { fx: window.__fx.has(this), id: this.id, tag: this.tagName }; }` })).result?.result?.value;
      if (!r) continue; labelled++; if (!r.fx) missing.push(`${n.role.value} "${n.name.value}" ${r.id || r.tag}`);
    }
    out.cover[view] = { labelled, indexed: await p.eval('__fx.size'), missing };
    if (missing.length) fail('COVER', `${view}: ${missing.length} labelled controls not in the index: ${missing.slice(0, 8).join('; ')}`);
    await p.eval(`(() => { const s = __poly.sheet; __poly.setSheet(s.tab, false); document.querySelectorAll('details').forEach(d => { d.open = false; }); })()`);
  }
  for (const [q, want] of [['euclid', /hits/], ['rotation', /shift|rotation/], ['ratio', /speed/], ['probability', /chance|probability/], ['stems', /stems/], ['7/8', /^7\/8$/]]) {
    const top = await p.eval(`(async () => { const { search } = await import('./src/poly/find.js'); return search(__poly.findIndex(), ${JSON.stringify(q)}).slice(0, 2).map(e => e.name); })()`);
    (out.synonyms ??= {})[q] = top; if (!top.some(n => want.test(n))) fail('COVER', `"${q}" → ${top.join(' | ')}`);
  }

  // ---- KEYS: a fresh page, the sheet closed ----
  await p.send('Page.reload'); await p.sleep(3500); await p.captureDownloads();
  const s0 = await st(); if (s0.sheet.open) fail('KEYS', 'the sheet is open on load');
  const keys = ['/', 's', 't', 'Enter']; for (const k of keys) await press(p, k, code(k)); await p.sleep(300);
  const s1 = await st(); out.stems = { keys: keys.length, focus: s1.act, tab: s1.sheet.tab, open: s1.sheet.open };
  if (!(keys.length < 5 && s1.act === 'exp-stems' && s1.sheet.tab === 'export' && s1.sheet.open)) fail('KEYS', `stems: ${JSON.stringify(out.stems)}`);

  // ---- ESC: share menu over the step locks over the open sheet; then focus mode ----
  const stack = `(() => { __poly.setSheet('lane', true); const l = __poly.m.lane; let i = 0; while (i < l.length && !l.hitAt(i)) i++; if (i === l.length) { l.toggle(l.stepIndex(0)); __poly.sync(); i = 0; } __poly.editLocks(i); document.getElementById('btn-share-more').click(); document.activeElement.blur(); })()`;
  await p.eval(stack); out.esc = [(await st()).esc];
  for (let k = 0; k < 4; k++) { await press(p, 'Escape', 'Escape'); out.esc.push(await st()); }
  const layers = (s) => ['dialog', 'step', 'sheet'].filter(k => s.esc[k]).join('+') || '-';
  out.escOrder = [layers({ esc: out.esc[0] }), ...out.esc.slice(1).map(layers)];
  if (out.escOrder.join(' > ') !== 'dialog+step+sheet > step+sheet > sheet > - > -' || out.esc[4].act !== 'body') fail('ESC', out.escOrder.join(' > ') + ` focus ${out.esc[4].act}`);
  await press(p, 'f', 'KeyF'); const fOn = (await st()).focus; await press(p, 'Escape', 'Escape'); const fOff = (await st()).focus;
  if (!(fOn && !fOff)) fail('ESC', `F then Esc: ${fOn} → ${fOff}`);
  // a text field owns its Esc: the sheet stays open while the cursor is in the setup's name field
  await p.eval(`(() => { __poly.reveal('lib-name'); document.getElementById('lib-name').focus(); })()`); await press(p, 'Escape', 'Escape');
  if (!(await st()).sheet.open) fail('ESC', 'Esc in a text field closed the sheet');
  await p.eval('document.activeElement.blur(); __poly.setSheet(__poly.sheet.tab, false)');

  // ---- CLICK: the same order from empty canvas; nothing edited ----
  const findSpot = () => p.eval(`(() => { for (let y = 40; y < innerHeight - 200; y += 20) for (let x = Math.round(innerWidth * .25); x < innerWidth * .7; x += 20) { const e = document.elementFromPoint(x, y); if (e?.id === 'cv' && __poly.scene.locate(x, y).lane < 0) return [x, y]; } return null; })()`);
  const spot = await findSpot();
  // narrow windows: the open sheet is full height (no canvas to click), so the stack there is the share menu over the
  // docked sheet, and focus mode below
  const narrow = W <= 1100;
  if (!spot) fail('CLICK', 'no empty canvas found'); else {
    out.clickAt = spot; await p.eval(narrow ? `document.getElementById('btn-share-more').click(); document.activeElement.blur()` : stack); const before = await p.eval(EDITS), seq = [layers(await st())];
    for (let k = 0; k < (narrow ? 2 : 4); k++) { await p.click(...spot); await p.sleep(80); seq.push(layers(await st())); }
    out.clickOrder = seq;
    if (seq.join(' > ') !== (narrow ? 'dialog > - > -' : 'dialog+step+sheet > step+sheet > sheet > - > -')) fail('CLICK', seq.join(' > '));
    // focus mode: a phone's canvas takes the window, so the empty spot is looked for again
    await press(p, 'f', 'KeyF'); await p.sleep(300); const fSpot = await findSpot(); out.focusClickAt = fSpot;
    if (!fSpot) fail('CLICK', 'no empty canvas in focus mode'); else { await p.click(...fSpot); if ((await st()).focus) fail('CLICK', 'a click on empty canvas left focus mode on'); }
    await p.sleep(300);
    // a drag that starts off the rings is no click
    await p.eval(narrow ? `document.getElementById('btn-share-more').click(); document.activeElement.blur()` : `__poly.setSheet(__poly.sheet.tab, true)`);
    for (const [type, dx] of [['mousePressed', 0], ['mouseMoved', 30], ['mouseReleased', 30]]) await p.send('Input.dispatchMouseEvent', { type, x: spot[0] + dx, y: spot[1], button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
    if (!narrow && !(await st()).sheet.open) fail('CLICK', 'a drag from empty canvas closed the sheet');
    if (narrow) await press(p, 'Escape', 'Escape');
    if (await p.eval(EDITS) !== before) fail('CLICK', 'a click on empty canvas edited something');
    await p.eval(`__poly.setSheet(__poly.sheet.tab, false)`);
  }

  // ---- OWN: key ownership ----
  const playing = () => p.eval(`document.getElementById('btn-play').textContent.includes('stop')`);
  await press(p, ' ', 'Space'); const pl = await playing(); await press(p, ' ', 'Space'); if (!(pl && !(await playing()))) fail('OWN', 'Space does not play / stop');
  const row = `JSON.stringify(__poly.m.lanes.map(l => l.toJSON()))`, r0 = await p.eval(row);
  await press(p, 'q', 'KeyQ'); if (await p.eval(row) === r0) fail('OWN', 'a pad row key did not toggle its step'); await press(p, 'q', 'KeyQ');
  await press(p, '0', 'Digit0', 0, false); const fillOn = await p.eval('__poly.fill'); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '0', code: 'Digit0' });
  if (!(fillOn && !(await p.eval('__poly.fill')))) fail('OWN', 'hold 0 is not fill');
  await p.eval('__poly.m.select(2); __poly.sync()'); await press(p, '1', 'Digit1', 1); if (await p.eval('__poly.m.selected') !== 0) fail('OWN', 'Alt+1 did not select lane 1');
  const r1 = await p.eval(row);
  await p.eval(`(() => { __poly.reveal('lib-name'); const n = document.getElementById('lib-name'); n.value = ''; n.focus(); })()`);
  for (const k of ['/', 'q', 'a']) await press(p, k, code(k));
  const typed = await p.eval(`document.getElementById('lib-name').value`);
  if (typed !== '/qa' || await p.eval(row) !== r1 || await p.eval(`document.activeElement.id`) !== 'lib-name') fail('OWN', `typing in a field: "${typed}", steps ${await p.eval(row) === r1 ? 'same' : 'changed'}`);
  await press(p, '/', 'Slash'); await p.eval('document.activeElement.blur()');
  await press(p, '/', 'Slash'); await press(p, 'k', 'KeyK', 4); const inFind = await st();
  if (inFind.act !== 'find' || !inFind.sheet.open) fail('OWN', `⌘K in the find field moved: ${inFind.act}`);
  await press(p, 'Escape', 'Escape'); await press(p, 'Escape', 'Escape');
  // an RD-3 save that says open: true loads closed, its tab kept
  await p.eval(`localStorage.setItem('midi-warz.orbit2.sheet', JSON.stringify({ tab: 'groove', open: true }))`); await p.send('Page.reload'); await p.sleep(3500);
  const old = await st(); if (old.sheet.open || old.sheet.tab !== 'groove') fail('OWN', `old save: ${JSON.stringify(old.sheet)}`);
  out.errors = p.errors; if (p.errors.length) fail('PAGE', p.errors.join(' | '));
} catch (e) { fail('TOOL', `the check itself stopped (a re-run under less load usually passes): ${e.message}`); } finally { await b.close(); }
const j = arg('--json'); if (j) writeFileSync(j, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1)); process.exit(out.fails.length ? 1 : 0);
