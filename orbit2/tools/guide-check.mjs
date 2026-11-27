// RD-14 guide check: walks every use case of docs/GUIDE.md in a muted headless Chrome (cdp.mjs): each mouse / keys step
// as written (the Move column as MIDI bytes through __poly.move.receive), the "what you see" claim asserted where it can
// be checked (a control's value, the kit, a pill, playing, a download), one screenshot per use case, no page error, and
// every control name the guide puts in bold found among the page's accessible names (left column) or the Move table's
// row names (right column), checked in the page's state before and after the step.
//
//   node orbit2/tools/guide-check.mjs                       # report on stdout, exit 1 on a failure
//   node orbit2/tools/guide-check.mjs --only 1,4 --port 5400 --debug-port 9400 --shots /tmp/orbit2-impl/guide
//
// The step lists below are written against the guide's table rows; the row COUNT of each use case is asserted, so a row
// added to or removed from GUIDE.md fails here until the walk is updated. Not driveable headless, said plainly: the
// browser's MIDI permission (Connect Move), the native file chooser (the break file is handed to the page the way the
// chooser does) and the clipboard (share).
import { readFileSync } from 'node:fs';
import { launch } from './cdp.mjs';
import { bytes, trackOf } from './session-core.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('--only', '1,2,3,4,5,6,7,8,9,10').split(',').map(Number), port = +arg('--port', 5400), debugPort = +arg('--debug-port', 9400), shots = arg('--shots', '/tmp/orbit2-impl/guide');
const md = readFileSync(new URL('../docs/GUIDE.md', import.meta.url), 'utf8');

import { readGuide } from './guide-check-names.mjs';

const fails = [], notes = [];
const check = (uc, row, ok, what) => { if (!ok) fails.push(`use case ${uc}${row ? `, row ${row}` : ''}: ${what}`); return ok; };
const ready = async (p) => { for (let i = 0; i < 240; i++) { if (await p.eval('!!window.__poly')) return; await p.sleep(250); } throw new Error('orbit2 did not start'); };
const SIM = `__poly.move.transport = { send: () => {} }; __poly.move.inControl = true;`;
// the page's accessible names, read in the page (never from the guide's own text), and a finder by name
const INJECT = `window.__g = {
  t: (s) => { const x = String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase(), y = x.replace(/^[^a-z0-9]+/, ''); return y || x; },
  nm(el) { const lb = el.getAttribute('aria-labelledby'); return [el.getAttribute('aria-label'), lb && lb.split(' ').map(i => document.getElementById(i)?.textContent).join(' '), el.textContent, el.title].map(this.t).filter(Boolean); },
  all() { return [...document.querySelectorAll('button, select, input, summary, a[href], [role=slider], [role=tab], [role=radio], [role=switch], [role=checkbox], [aria-label], label, [role=status], option, .pill, h2')].filter(e => !e.closest('#hpane-guide, #hpane-move')); },
  leaf(n) { return [...document.querySelectorAll('body *')].some(e => !e.closest('#hpane-guide, #hpane-move') && !e.children.length && this.t(e.textContent) === n); },
  has(name) { const n = this.t(name); return this.leaf(n) || this.all().some(e => this.nm(e).some(x => x === n || x.startsWith(n) || x.split(/[ ,·]+/).includes(n)) || (e.tagName === 'SELECT' && [...e.options].some(o => this.t(o.text) === n))); },
  find(name) { const n = this.t(name), c = this.all(), vis = (e) => !!e.getClientRects().length, ex = c.filter(e => this.nm(e).includes(n)), pre = c.filter(e => this.nm(e).some(x => x.startsWith(n)));
    return [...ex.filter(vis), ...pre.filter(vis), ...ex, ...pre][0]; },
  press(name) { const e = this.find(name); if (!e) throw new Error('no control named ' + name); e.click(); return true; },
  shown(name) { const n = this.t(name); return this.all().filter(e => e.matches('button, summary, [role=slider], [role=tab], a[href], label, input, select')).some(e => !!e.getClientRects().length && this.nm(e).some(x => x === n || x.startsWith(n))); },
  slider(name) { const q = '[role=slider][aria-label="' + name + '"]'; return document.querySelector('#knobs ' + q) || [...document.querySelectorAll(q)].find(e => !!e.getClientRects().length) || document.querySelector(q); },
  val(name) { return this.slider(name)?.getAttribute('aria-valuetext') || this.slider(name)?.getAttribute('aria-valuenow'); },
  moveRows() { return [...document.querySelectorAll('#hpane-move th')].map(e => this.t(e.textContent)); },
};`;
const nameFound = (p, names) => p.eval(`${JSON.stringify(names)}.map(n => __g.has(n))`);
const moveFound = (p, names) => p.eval(`(() => { const r = __g.moveRows(); return ${JSON.stringify(names)}.map(n => { const t = __g.t(n); return r.some(x => x === t || x.startsWith(t) || x.split(/ [+] | · | /).includes(t)); }); })()`);

const fresh = async (b, { width = 1512, height = 860, mobile = false } = {}) => {
  const p = await b.open('orbit2/index.html?setlog', { width, height, mobile, ready: '!!window.__poly' });
  await p.eval('localStorage.clear()'); await p.send('Page.reload'); await p.sleep(1500); await ready(p);
  await p.eval(SIM + INJECT); await p.eval('window.__g.sheetsSeen = 0');
  return p;
};
const press = (p, name) => p.eval(`__g.press(${JSON.stringify(name)})`);
const cmdk = async (p, text, enters = 1) => {
  await p.eval(`(() => { __poly.openFind(); const i = document.getElementById('find'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); })()`);
  for (let i = 0; i < enters; i++) { await p.key('Enter'); await p.sleep(250); }
};
const down = async (p, key) => { await p.key(key); await p.sleep(150); };
const mv = (p, ...bs) => p.eval(`${JSON.stringify(bs)}.forEach(b => __poly.move.receive(new Uint8Array(b)))`);
const mvSlow = async (p, ms, ...bs) => { for (const b of bs) { await mv(p, b); await p.sleep(ms); } };   // a knob move recorded needs time under the hand
const tap = (p, name) => mv(p, bytes.btn(name, true), bytes.btn(name, false));
const rectOf = (p, sel) => p.eval(`(() => { const e = ${sel}; __poly.reveal(e); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const drag = async (p, name, dy, slow = 0) => {
  const { x, y } = await rectOf(p, `__g.slider(${JSON.stringify(name)})`), m = (type, yy) => p.send('Input.dispatchMouseEvent', { type, x, y: yy, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  await m('mousePressed', y); for (let i = 1; i <= 8; i++) { await m('mouseMoved', y + dy * i / 8); if (slow) await p.sleep(slow); } await m('mouseReleased', y + dy); await p.sleep(150);
};
const wheel = async (p, name, dy, times = 1) => {
  const { x, y } = await rectOf(p, `__g.slider(${JSON.stringify(name)})`);
  for (let i = 0; i < times; i++) { await p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await p.sleep(120); }
};
const val = (p, name) => p.eval(`__g.val(${JSON.stringify(name)})`);
const playing = (p) => p.eval(`document.getElementById('btn-play').getAttribute('aria-label') === 'stop'`);
const kitKey = (p) => p.eval('__poly.m.kitKey()');
const voices = (p) => p.eval(`__poly.m.lanes.map(l => l.voice).join(',')`);
// the page's words, hidden drawers included (a pill, a note, a chain line), without the help dialog's own text
const body = (p) => p.eval(`(() => { const c = document.body.cloneNode(true); c.querySelector('#help')?.remove(); c.querySelectorAll('script, style').forEach(e => e.remove()); return c.textContent.toLowerCase().replace(/\\s+/g, ' '); })()`);
const pick = (p, id, text) => p.eval(`(() => { const s = document.getElementById(${JSON.stringify(id)}), o = [...s.options].find(o => o.text === ${JSON.stringify(text)}); s.value = o.value; s.dispatchEvent(new Event('change')); return s.value; })()`);
const sheetTab = (p, t) => p.eval(`__poly.setSheet(${JSON.stringify(t)}, true)`);

// A drum-loop WAV for the break steps (8 s at 22.05 kHz, a click every half second), handed to the page as a File
const wavFile = `(() => { const sr = 22050, n = sr * 8, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const t = (i % (sr / 2)) / sr; v.setInt16(44 + i * 2, Math.round(Math.sin(t * 2 * Math.PI * 200) * Math.exp(-t * 30) * 20000), true); }
  return new File([b], 'break.wav', { type: 'audio/wav' }); })()`;
const holdStep = async (p, i, ms = 900) => {
  const { x, y } = await rectOf(p, `document.querySelectorAll('#stepsui > *')[${i}]`);
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await p.sleep(ms);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); await p.sleep(200);
};
const mark = (p) => p.eval(`[...document.querySelectorAll('#knobs .g-mark')].some(k => !k.hidden)`);   // the A on a knob that has automation
const slotClick = (p, n, mods = {}) => p.eval(`document.querySelector('#slots button:nth-child(${n})').dispatchEvent(new MouseEvent('click', { bubbles: true, ${Object.entries(mods).map(([k, v]) => `${k}: ${v}`).join(', ')} }))`);
const click = (p, name, mods = {}) => p.eval(`__g.find(${JSON.stringify(name)}).dispatchEvent(new MouseEvent('click', { bubbles: true, ${Object.entries(mods).map(([k, v]) => `${k}: ${v}`).join(', ')} }))`);
const hold = (p, id, ms) => p.eval(`(() => { const b = document.getElementById(${JSON.stringify(id)}); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 })); return new Promise(r => setTimeout(() => { const on = !!__poly.fill; b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0 })); r(on); }, ${ms})); })()`);
const after = async (p, ms, f) => { await p.sleep(ms); return f(); };
const R = (go, ok = async () => true) => ({ go, ok });
const pressIn = (p, scope, text) => p.eval(`[...document.querySelectorAll('${scope} button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
// a write lands when the playhead comes round: poll a few seconds for the claim
const seen = async (f, ms = 8000) => { for (let t = 0; t < ms; t += 400) { if (await f()) return true; await new Promise(r => setTimeout(r, 400)); } return false; };
const hits = (p) => p.eval(`JSON.stringify(__poly.m.lanes.map(l => l.hits))`);
// the cycle caption is drawn on the canvas: read it the way the scene does (scene.js cycleLine, the machine's cycle)
const cyc = (p) => p.eval(`import('/orbit2/src/poly/scene.js').then(s => s.cycleLine(0, __poly.m.cycleTicks({ repeat: 1 }), 3360, 840, false))`);
const dl = async (p) => (await p.downloads()).map(d => d.name);

// ---- the ten use cases: one { go, ok } per row of the guide's table, in order (ok = the "what you see" claim) ----
const CASES = {
  1: (p) => [
    R(() => cmdk(p, 'techno', 2), async () => /kick/.test(await voices(p)) && (await val(p, 'tempo')).includes('130')),
    R(async () => { await press(p, 'play'); await p.sleep(900); }, async () => (await playing(p)) && /01\.\d/.test(await body(p))),
    R(() => pick(p, 'kit-select', 'Trap'), async () => (await kitKey(p)) === 'trap'),
    R(async () => { p.t0 = await val(p, 'tempo'); await drag(p, 'tempo', -40); }, async () => (await val(p, 'tempo')) !== p.t0),
    R(async () => { await press(p, 'stop'); await p.sleep(300); }, async () => !(await playing(p))),
  ],
  2: (p) => [
    R(() => cmdk(p, '3 vs 4 vs 5', 2), async () => (await p.eval('__poly.m.lanes.length')) === 4 && (await cyc(p)) === 'cycle · 5 beats'),
    R(async () => { await press(p, 'play'); await p.sleep(600); }, () => playing(p)),
    R(() => p.sleep(2500), async () => (await p.eval('__poly.clock().tick')) > 0),   // the bloom is canvas: only the clock is read
    R(() => press(p, 'lane 2 rim'), async () => (await p.eval('__poly.m.selected')) === 1 && (await val(p, 'length')).includes('5')),
    R(() => wheel(p, 'length', 100, 2), async () => (await val(p, 'length')).includes('3') && (await cyc(p)) === 'cycle · 3 beats'),
    R(async () => { p.c0 = await cyc(p); await drag(p, 'speed ×', -30); await p.sleep(300); }, async () => (await cyc(p)) !== p.c0),
  ],
  3: (p) => [
    R(async () => { await cmdk(p, 'techno', 2); await press(p, 'play'); await p.sleep(500); }, () => playing(p)),
    R(() => press(p, 'lane 1 kick 909'), async () => (await p.eval('__poly.m.selected')) === 0),
    R(() => press(p, 'sound ⇧'), async () => !!(await p.eval(`__g.slider('decay') && document.getElementById('pg-sound').getAttribute('aria-pressed') === 'true'`))),
    R(async () => { p.s0 = await p.eval('JSON.stringify(__poly.m.lanes[0].sound)'); await drag(p, 'tone', -40); }, async () => (await p.eval('JSON.stringify(__poly.m.lanes[0].sound)')) !== p.s0),
    R(() => press(p, 'rhythm'), async () => !!(await p.eval(`__g.slider('length') && document.getElementById('pg-sound').getAttribute('aria-pressed') === 'false'`))),
    R(async () => { p.r0 = await val(p, 'rotation'); await drag(p, 'rotation', -25); }, async () => (await val(p, 'rotation')) !== p.r0),
  ],
  4: (p) => [
    R(() => cmdk(p, 'techno', 2), async () => /kick/.test(await voices(p))),
    R(() => cmdk(p, 'arm record', 2), () => p.eval(`__g.shown('rec armed')`)),
    R(async () => { await pressIn(p, '#pane-perform', 'touch'); await p.sleep(200); }, async () => /rec armed · touch/.test(await body(p))),
    R(async () => { await down(p, 'Escape'); await press(p, 'play'); await p.sleep(500); }, () => playing(p)),
    R(async () => { await drag(p, 'tune', -60, 250); }, () => seen(() => mark(p))),
    R(() => cmdk(p, 'clear lane automation', 2), async () => !(await mark(p))),
    R(async () => { await press(p, 'record off'); await p.sleep(300); }, async () => !(await p.eval(`__g.shown('rec armed')`))),
  ],
  5: (p) => [
    R(async () => { await cmdk(p, 'afro', 2); await press(p, 'play'); await p.sleep(400); await p.eval('__poly.applyTempo(240)'); }, () => playing(p)),
    R(async () => { await cmdk(p, 'evolve', 0); await down(p, 'ArrowDown'); await down(p, 'Enter'); await down(p, 'Enter'); }, () => p.eval(`__g.shown('evolve off')`)),
    R(async () => { await press(p, 'cycle'); await p.sleep(300); }, async () => /evolve · cycle/.test(await body(p))),
    R(async () => { p.h0 = await hits(p); for (let i = 0; i < 60 && (await hits(p)) === p.h0; i++) await p.sleep(500); }, async () => (await hits(p)) !== p.h0),
    R(() => wheel(p, 'gravity', -100, 5), async () => /10/.test(await val(p, 'gravity'))),
    R(() => wheel(p, 'home after', -100, 2), async () => /2/.test(await val(p, 'home after'))),
    R(async () => { await press(p, 'home = now'); }),
    R(async () => { await press(p, 'evolve off'); await p.sleep(300); }, async () => !(await p.eval(`__g.shown('evolve off')`))),
  ],
  6: (p) => [
    R(async () => {}, async () => (await p.eval(`document.getElementById('btn-connect') != null`))),   // the MIDI permission cannot be granted headless
    R(() => cmdk(p, 'live mode', 1), () => p.eval('!!__poly.perf.live')),
    R(async () => { await cmdk(p, 'techno', 2); await press(p, 'mute lane 3'); }, () => p.eval('!!__poly.m.lanes[2].muted')),
    R(() => hold(p, 'btn-fill', 400), async () => true),
    R(() => press(p, 'fill next'), async () => /fill next…/.test(await body(p))),
    R(async () => { await cmdk(p, 'slot 1', 1); await slotClick(p, 1, { shiftKey: true }); await p.sleep(300); }, async () => /playing slot 1/.test(await body(p))),
    R(async () => { await press(p, 'play'); await p.eval(`__poly.toggleMute?.(2)`); await p.eval(`__poly.randomizeAll?.()`); await slotClick(p, 2, { shiftKey: true }); await p.sleep(200); await slotClick(p, 1); await p.sleep(300); }, async () => /slot 1 waits for the next bar/.test(await body(p))),
    R(async () => { await p.sleep(3500); await slotClick(p, 2, { ctrlKey: true }); await p.sleep(300); }, async () => /chain 1 → 2/.test(await body(p)) && (await p.eval(`__g.has('stop chain')`))),
    R(async () => { await down(p, 'Escape'); await down(p, 'Escape'); await down(p, 'f'); }, async () => { const f = await p.eval('__poly.focusMode'); await p.key('`', 'Backquote'); await p.sleep(200); return f && (await p.eval(`!document.getElementById('console-log').hidden`)); }),
  ],
  7: (p) => [
    R(async () => { await cmdk(p, 'boom bap', 2); await press(p, 'lane 4 crackle'); }, async () => (await p.eval('__poly.m.selected')) === 3),
    R(() => cmdk(p, 'break file', 1), () => p.eval(`document.getElementById('tab-lane').getAttribute('aria-selected') === 'true' && /break file/i.test(document.activeElement.textContent + document.activeElement.getAttribute('aria-label'))`)),
    R(async () => { await p.eval(`[...document.querySelectorAll('#pane-lane button')].find(b => b.textContent.trim() === '8').click()`); await p.eval(`[...document.querySelectorAll('#pane-lane button')].find(b => b.textContent.trim() === '16').click()`); }, () => p.eval(`[...document.querySelectorAll('#pane-lane button')].find(b => b.textContent.trim() === '16').getAttribute('aria-checked') !== 'false'`)),
    R(async () => { await p.eval(`__poly.breakFromFile(3, ${wavFile})`); await p.sleep(1500); }, async () => /16 slices/.test(await body(p)) && /♪ break/.test(await body(p))),
    R(async () => { await press(p, 'play'); await p.sleep(500); }, () => playing(p)),
    R(() => holdStep(p, 4), async () => /step 5/.test(await body(p)) && (await p.eval(`['clear', 'more…', 'done'].every(n => __g.has(n))`))),
    R(async () => { await press(p, 'more…'); await p.sleep(300); await p.eval(`[...document.querySelectorAll('#lock-slices .slice')].find(b => b.textContent.trim() === '3').click()`); await p.sleep(300); }, async () => /"slice":2/.test(await p.eval('JSON.stringify(__poly.m.lanes[3].locks)'))),
    R(async () => { await press(p, 'done'); await p.sleep(300); }, async () => !(await p.eval(`!!document.querySelector('#stepsui .step-page, body.step-open')`)) ),
  ],
  8: (p) => [
    R(() => cmdk(p, 'house', 2), async () => (await p.eval('__poly.m.lanes.length')) >= 4),
    R(() => cmdk(p, 'export stems', 1), () => p.eval(`document.activeElement.id === 'exp-stems'`)),
    R(async () => { await p.eval(`[...document.querySelectorAll('#pane-export button')].find(b => b.textContent.trim() === '24').click()`); }, () => p.eval(`[...document.querySelectorAll('#pane-export button')].find(b => b.textContent.trim() === '24').getAttribute('aria-checked') === 'true'`)),
    R(async () => { await press(p, 'render as loop'); }, () => p.eval(`document.getElementById('exp-loop').getAttribute('aria-pressed') === 'false'`)),
    R(async () => { await p.captureDownloads(); await press(p, '⤓ WAV'); await p.sleep(2500); p.d = await dl(p); }, async () => p.d.some(n => /\.wav$/.test(n)) && /24-bit/.test(await body(p))),
    R(async () => { await press(p, '⤓ stems (.zip)'); await p.sleep(4000); p.d = await dl(p); }, async () => p.d.some(n => /\.zip$/.test(n))),
    R(async () => { await press(p, '⤓ MIDI'); await p.sleep(800); p.d = await dl(p); }, async () => p.d.some(n => /\.mid$/.test(n)) && /a track per lane/.test(await body(p))),
  ],
  9: (p, b) => [
    R(async () => { await press(p, 'share'); await p.sleep(600); }, async () => /link copied|address bar/.test(await body(p))),
    R(async () => { p.url = await p.eval('__poly.shareUrl().then(s => s.url)'); }, async () => /#p=/.test(p.url)),
    R(async () => { p.q = await b.open(p.url.replace(/^https?:\/\/[^/]+\//, ''), { width: 1512, height: 860, ready: '!!window.__poly' }); await p.q.eval(SIM + INJECT); await p.q.sleep(800); }, async () => /someone sent you a beat/.test(await body(p.q)) && /\d+ bpm · \d+ rings/.test(await body(p.q))),
    R(async () => { await press(p.q, '▶ tap to hear this orbit'); await p.q.sleep(900); }, async () => (await p.q.eval(`__g.has('■ stop')`)) && (await p.q.eval(`__g.has('remix')`))),
    R(async () => { await press(p.q, 'remix'); await p.q.sleep(500); }, async () => /it is yours now/.test(await body(p.q))),
    R(async () => { await p.q.eval(`__poly.randomizeAll()`); await press(p.q, 'share'); await p.q.sleep(500); }, async () => /link copied|address bar/.test(await body(p.q))),
    R(async () => { await p.eval(`document.getElementById('btn-share').focus()`); await down(p, 'ArrowDown'); await p.sleep(300); }, () => p.eval(`['link', '4 bars of audio', 'postcard (video)'].every(n => __g.has(n))`)),
  ],
  10: (p) => [
    R(async () => {}, async () => (await p.eval('document.documentElement.scrollHeight <= innerHeight + 1')) && (await p.eval(`['play', 'tempo'].every(n => __g.has(n))`))),
    R(async () => { const { x, y } = await rectOf(p, `document.getElementById('btn-play')`); await p.tap(x, y); await p.sleep(700); }, () => playing(p)),
    R(async () => { const { x, y } = await rectOf(p, `__g.find('lane 2')`); await p.tap(x, y); await p.sleep(300); }, async () => (await p.eval('__poly.m.selected')) === 1),
    R(async () => { for (let k = 0; k < 2; k++) { const { x, y } = await rectOf(p, `document.querySelectorAll('#stepsui > *')[1]`); await p.tap(x, y); await p.sleep(250); } }, async () => /step 2, on/.test(await p.eval(`document.querySelectorAll('#stepsui > *')[1].getAttribute('aria-label') || ''`))),
    R(() => holdStep(p, 2, 1000), async () => /step 3/.test(await body(p)) && (await p.eval(`['clear', 'more…', 'done'].every(n => __g.has(n))`))),
    R(async () => { await press(p, 'done'); p.t0 = await val(p, 'tempo'); await drag(p, 'tempo', -50); }, async () => (await val(p, 'tempo')) !== p.t0),
    R(async () => { await sheetTab(p, 'lane'); await press(p, 'mute'); await p.sleep(300); }, () => p.eval('!!__poly.m.lanes[__poly.m.selected].muted')),
    R(async () => { await press(p, 'perform'); await p.sleep(300); }, () => p.eval(`['fill hold', 'fill next', 'throw hold', 'undo', 'randomize', '● jam', 'share'].every(n => __g.has(n))`)),
  ],
};

// ---- the Move column: each gesture as bytes, in a fresh state, its effect read back ----
const sel = (p) => p.eval('__poly.m.selected');
const MOVES = {
  1: (p) => [['Play', async () => { await tap(p, 'play'); await p.sleep(300); const a = await playing(p); await tap(p, 'play'); await p.sleep(300); return a && !(await playing(p)); }],
    ['Shift + ◀ ▶', async () => { const k = await kitKey(p); await mv(p, bytes.btn('shift', true), ...[bytes.btn('right', true), bytes.btn('right', false)], bytes.btn('shift', false)); await p.sleep(200); return (await kitKey(p)) !== k; }],
    ['Knob 8', async () => { const t = await val(p, 'tempo'); await mv(p, bytes.touch(7, true), bytes.enc(7, 5), bytes.touch(7, false)); await p.sleep(300); return (await val(p, 'tempo')) !== t; }]],
  2: (p) => [['Track 1–4', async () => { await tap(p, trackOf(1)); await p.sleep(200); return (await sel(p)) === 1; }],
    ['Knobs 1–4', async () => { const a = await val(p, 'length'), r = await val(p, 'speed ×'); await mv(p, bytes.touch(0, true), bytes.enc(0, -1), bytes.enc(0, -1), bytes.touch(0, false), bytes.touch(3, true), bytes.enc(3, 1), bytes.touch(3, false)); await p.sleep(300); return (await val(p, 'length')) !== a && (await val(p, 'speed ×')) !== r; }]],
  3: (p) => [['Track 1–4', async () => { await tap(p, trackOf(0)); await p.sleep(200); return (await sel(p)) === 0; }],
    ['Shift + knobs', async () => { const s = await p.eval('JSON.stringify(__poly.m.lanes[0].sound)'); await mv(p, bytes.btn('shift', true), bytes.touch(1, true), bytes.enc(1, 4), bytes.touch(1, false), bytes.btn('shift', false)); await p.sleep(300); return (await p.eval('JSON.stringify(__poly.m.lanes[0].sound)')) !== s; }],
    ['Knobs 1–4', async () => { const r = await val(p, 'rotation'); await mv(p, bytes.touch(2, true), bytes.enc(2, 2), bytes.touch(2, false)); await p.sleep(300); return (await val(p, 'rotation')) !== r; }]],
  4: (p) => [['Record', async () => { await tap(p, 'record'); await p.sleep(300); return /rec armed/.test(await body(p)); }],
    ['Record armed + touch a knob', async () => { if (process.env.GC_DEBUG) console.log('mv4', await p.eval(`JSON.stringify({ rec: __poly.rec, play: document.getElementById('btn-play').getAttribute('aria-label') })`)); await pressIn(p, '#pane-perform', 'touch'); await press(p, 'play'); await p.sleep(400); await mvSlow(p, 250, bytes.touch(6, true), bytes.enc(6, 6), bytes.enc(6, 6), bytes.touch(6, false)); const r = await seen(() => mark(p)); if (process.env.GC_DEBUG) console.log('mv4b', r, await p.eval(`JSON.stringify({ rec: __poly.rec, play: document.getElementById('btn-play').getAttribute('aria-label'), tick: __poly.clock().tick, marks: [...document.querySelectorAll('.g-mark')].map(k => k.hidden ? 0 : 1).join('') })`)); return r; }],
    ['Touch a knob + Delete', async () => { await mv(p, bytes.touch(6, true), ...[bytes.btn('delete', true), bytes.btn('delete', false)], bytes.touch(6, false)); await p.sleep(300); return !(await mark(p)); }]],
  5: (p) => [['−', async () => { await mv(p, ...[bytes.btn('minus', true), bytes.btn('minus', false)]); await p.sleep(300); return true; }]],
  6: (p) => [['Mute', async () => { await mv(p, ...[bytes.btn('mute', true), bytes.btn('mute', false)]); await p.sleep(300); return !!(await p.eval('__poly.m.lanes[__poly.m.selected].muted')); }],
    ['Hold Layout', async () => { await mv(p, bytes.btn('layout', true)); await p.sleep(200); const on = !!(await p.eval('__poly.fill')); await mv(p, bytes.btn('layout', false)); return on; }],
    ['Shift + Layout', async () => { await mv(p, bytes.btn('shift', true), bytes.btn('layout', true), bytes.btn('layout', false), bytes.btn('shift', false)); await p.sleep(300); return /fill next/.test(await body(p)); }],
    ['Hold Duplicate + step', async () => { await mv(p, bytes.btn('duplicate', true), bytes.step(0, true), bytes.step(0, false), bytes.btn('duplicate', false)); await p.sleep(300); return /slot 1/.test(await body(p)) && !(await p.eval(`document.querySelector('#slots button').getAttribute('aria-label')`)).includes('empty'); }],
    ['Hold Loop + steps', async () => { await mv(p, bytes.btn('loop', true), bytes.step(0, true), bytes.step(0, false), bytes.btn('loop', false)); await p.sleep(300); return /playing slot 1|slot 1/.test(await body(p)); }]],
  7: (p) => [['Track 1–4', async () => { await tap(p, trackOf(3)); await p.sleep(200); return (await sel(p)) === 3; }],
    ['Hold a step', async () => { await mv(p, bytes.step(4, true)); await p.sleep(900); const on = /step 5/.test(await body(p)); await mv(p, bytes.step(4, false)); return on; }]],
};
const MOVE_SETUP = { 1: 'techno', 2: '3 vs 4 vs 5', 3: 'techno', 4: 'techno', 5: 'afro', 6: 'techno', 7: 'boom bap' };

const guide = readGuide(md), b = await launch({ port, debugPort });
try {
  for (const uc of guide.filter(u => only.includes(u.n))) {
    const mobile = uc.n === 10, p = await fresh(b, mobile ? { width: 390, height: 844, mobile: true } : {});
    const steps = CASES[uc.n](p, b);
    check(uc.n, 0, steps.length === uc.rows.length, `the walk has ${steps.length} steps, GUIDE.md has ${uc.rows.length} rows: update tools/guide-check.mjs`);
    for (let i = 0; i < Math.min(steps.length, uc.rows.length); i++) {
      const row = uc.rows[i], seen = new Set(), look = async () => { (await nameFound(p, row.names)).forEach((f, j) => f && seen.add(row.names[j])); };
      try { await look(); await steps[i].go(); await p.sleep(150); await look(); const ok = await steps[i].ok(); check(uc.n, i + 1, ok !== false, `what you see: ${row.left.replace(/\*\*/g, '').slice(0, 110)}`); }
      catch (e) { check(uc.n, i + 1, false, `step failed: ${String(e.message).split('\n')[0]} — ${row.left.replace(/\*\*/g, '').slice(0, 80)}`); }
      for (const n of row.names) check(uc.n, i + 1, seen.has(n), `control name "${n}" not found among the page's accessible names`);
      const mf = row.moves.length ? await moveFound(p, row.moves) : []; row.moves.forEach((n, j) => check(uc.n, i + 1, mf[j], `Move name "${n}" is not a row of the Move table`));
    }
    await p.shot(`${shots}/use-case-${String(uc.n).padStart(2, '0')}.png`);
    check(uc.n, 0, p.errors.length === 0, `page errors: ${p.errors.slice(0, 3).join(' | ')}`);
    if (p.q) { check(uc.n, 0, p.q.errors.length === 0, `page errors (second page): ${p.q.errors.slice(0, 2).join(' | ')}`); p.q.close(); }
    // the Move column, in a fresh page set up as the use case begins
    if (MOVES[uc.n]) {
      const q = await fresh(b); await cmdk(q, MOVE_SETUP[uc.n], 2); await q.sleep(300);
      if (uc.n === 6) { await q.eval(`__poly.perf.live = true`); await press(q, 'play'); }
      for (const [name, f] of MOVES[uc.n](q)) {
        let ok = false; try { ok = await f(); } catch (e) { fails.push(`use case ${uc.n}, Move ${name}: ${String(e.message).split('\n')[0]}`); continue; }
        check(uc.n, 'Move', ok, `Move "${name}" did not do what the guide says`);
      }
      check(uc.n, 'Move', q.errors.length === 0, `page errors on the Move walk: ${q.errors.slice(0, 2).join(' | ')}`); q.close();
    }
    p.close();
    console.log(`use case ${uc.n} · ${uc.title}: ${uc.rows.length} rows${MOVES[uc.n] ? ' + Move' : ''}`);
  }
// the guide dialog (A6): every use case open, at the four sizes: the page never scrolls, the dialog stays in the window and
// scrolls inside, no table spills sideways, the guide tab is reached by keyboard (arrow keys from the Move tab)
if (only.length === 10 || only.includes(0)) for (const [w, h, mobile] of [[1512, 860, false], [1512, 982, false], [1280, 720, false], [390, 844, true]]) {
  const p = await fresh(b, { width: w, height: h, mobile }), tag = `${w}x${h}${mobile ? 'm' : ''}`;
  await p.eval(`__poly.openHelp('guide'); document.querySelectorAll('.guide-case').forEach(d => { d.open = true; })`); await p.sleep(300);
  const r = await p.eval(`(() => { const d = document.getElementById('help'), q = d.getBoundingClientRect(), t = [...d.querySelectorAll('.guide-steps')];
    return { page: document.scrollingElement.scrollHeight - innerHeight, sy: scrollY, inside: q.left >= 0 && q.top >= 0 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1, scrolls: d.scrollHeight > d.clientHeight, sideways: d.scrollWidth - d.clientWidth, tables: t.length, wide: t.filter(x => x.getBoundingClientRect().right > q.right + 1).length, tab: document.getElementById('htab-guide').getAttribute('aria-selected') }; })()`);
  check('dialog', tag, r.page <= 1 && r.sy === 0, `the page scrolls under the guide (${r.page}px)`); check('dialog', tag, r.inside && r.scrolls, 'the guide dialog is not inside the window or does not scroll inside');
  check('dialog', tag, r.sideways <= 1 && r.wide === 0 && r.tables === 10, `a table spills out sideways (${r.sideways}px, ${r.wide} wide, ${r.tables} tables)`); check('dialog', tag, r.tab === 'true', 'the guide tab is not selected');
  await p.eval(`document.getElementById('help').scrollTop = 1200`); await p.sleep(150); await p.shot(`${shots}/dialog-${tag}.png`);
  check('dialog', tag, p.errors.length === 0, `page errors: ${p.errors.slice(0, 2).join(' | ')}`); p.close();
}
} finally { await b.close(); }
notes.push('not driveable headless: the MIDI permission (Connect Move), the native file chooser, the clipboard; the bloom is canvas (the clock is read instead)');
console.log(fails.length ? `\nFAIL (${fails.length})\n` + fails.map(f => ' - ' + f).join('\n') : '\nall use cases walked, no page errors, every quoted name found');
console.log('notes: ' + notes.join('; '));
process.exit(fails.length ? 1 : 0);
