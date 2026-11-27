// RD-14 the player agents' hands: one muted browser (cdp.mjs) that stays up between commands, so a fresh agent can follow
// docs/GUIDE.md one step at a time the way a person does: click a control by the name the screen shows, drag or scroll a
// knob, press a key, touch the Move; and get back what a person gets: a screenshot, the words on the screen, what the ear
// hears. Names come off the page (accessible name, visible words), the Move is MIDI bytes on its wire (session-core
// `bytes`), the ear is a meter on the master output. Nothing reads the app's code or state.
//
//   node orbit2/tools/hands.mjs maya start [--phone] [--move]   # the persona's ports (REVIEW-PANEL), scratch /tmp/orbit2-maya
//   node orbit2/tools/hands.mjs maya click "lane 2 rim" , wait 1 , look
//   node orbit2/tools/hands.mjs maya help
//   node orbit2/tools/hands.mjs maya stop
//
// `start` runs a host in the background (the browser, and a socket in the scratch folder); every other call sends its
// commands to it and prints what came back. The host quits by itself after 40 idle minutes.
import { launch } from './cdp.mjs';
import { bytes, breakWav } from './session-core.mjs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, openSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORTS = { me: 5400, verifier: 5401, architect: 5402, sound: 5403, kai: 5404, maya: 5405, dex: 5406, ines: 5407, tomi: 5408, greta: 5409, rio: 5410, noor: 5411, nils: 5412, yuki: 5413 };
const [who = '', ...rest] = process.argv.slice(2);
const port = PORTS[who], debugPort = port + 4000, dir = `/tmp/orbit2-${who}`, sock = `${dir}/hands.sock`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HELP = `hands: your hands, eyes and ears on Orbits (orbit2/index.html), in a muted browser that stays open between commands.
Run: node orbit2/tools/hands.mjs ${who || '<you>'} <command> [args] [, <command> [args] ...]   (a lone comma chains commands)
Names with spaces go in quotes: click "lane 2 rim". Your scratch folder is ${who ? dir : '/tmp/orbit2-<you>'}/.

Start and stop
  start [--phone] [--move]  open the page in a fresh browser: a 1512×860 laptop window (--phone: a 390×844 touch phone;
                            --move: your Move is plugged in and connected)
  fresh                     forget everything (saved beats and settings too) and load the page again, as a first visit
  stop                      close the browser: always do this at the end

Eyes
  look                      a screenshot (open the printed path with the Read tool) + the words on the screen
  zoom <x> <y> <w> <h>      a 2× screenshot of one part of the screen (small text, the middle of the rings)
  find <words>              is this text on the screen now? (not the drawing on the rings: use look / zoom for those)
  controls [words]          every control you could click now: its kind, name, state, and where it is
  address                   the address in the browser's address bar
  paste                     what the page last copied to the clipboard

Mouse and keys (<name> is a control's name as the screen shows it)
  click <name> [--shift] [--ctrl] [--cmd] [--alt]     rclick <name>     dblclick <name>     click-at <x> <y> [mods]
  hold <name> <seconds>     press the mouse button on it, keep it down, let go
  drag <name> up|down [px]  drag a knob (up raises it; 40 px if you give no number)
  scroll <name> up|down [times]   the mouse wheel over it, one notch per time
  pick <name> <option>      choose an entry of a drop-down list (the browser's own menu is not drawn here)
  type <text>               type into the field that has the focus
  key <key> [--shift] [--ctrl] [--cmd] [--alt]   Enter, Esc, Space, Tab, Up, Down, Left, Right, Backspace, \`, ?, /, a letter
  keydown <key> / keyup <key>   hold a key (Shift, Alt, Ctrl, Cmd) while you do other things, then let go
  choose <file>             hand a file to the file picker the page just opened (a drum loop: ${who ? dir : '/tmp/orbit2-<you>'}/break.wav)

Phone (after start --phone)
  tap <name>    longpress <name> [seconds]    swipe <name> up|down [px]

The Move (after start --move). Top: 8 touch-sensitive knobs, knob 1 at the left, knob 8 at the right, and the jog wheel.
Middle: 32 pads in 4 rows of 8 (row 1 is the bottom row), and left of them a column of four track buttons, one beside
each pad row: track1 is the TOP one, track4 the BOTTOM one. Bottom: 16 step buttons, step 1 at the left. Other buttons:
shift, play, record, loop, duplicate, mute, delete, capture, undo, minus (−), plus (+), left (◀), right (▶), layout, back, sampling.
  move press <button>       tap a button            move down <button> / move up <button>   hold it down / let go
  move turn <knob> <clicks> touch the knob, turn it (+ = right, − = left, one click = one detent), let go
  move touch <knob> / move untouch <knob>
  move step <1-16>          tap a step button       move step-down <n> / move step-up <n>   hold it down / let go
  move pad <row 1-4> <column 1-8>     move wheel <clicks>     move wheel-push
  (Connect Move and the browser's MIDI question can't be done here: --move stands for both.)

Ears
  listen [seconds]          what comes out of the speakers (muted for the room, measured here): level, hits per second, brightness

Someone else
  other <link>              open a link as another person (their own browser, nothing saved); the next commands act there
  me                        back to your own page

Time
  wait <seconds>`;

// ---- the client: start / stop the host, or send it commands ----
const request = (cmds, ms = 600000) => new Promise((res, rej) => {
  const r = http.request({ socketPath: sock, path: '/', method: 'POST', timeout: ms }, (resp) => { let s = ''; resp.on('data', (d) => { s += d; }); resp.on('end', () => { try { res(JSON.parse(s)); } catch { rej(new Error(s)); } }); });
  r.on('error', rej); r.on('timeout', () => r.destroy(new Error('hands: no answer'))); r.end(JSON.stringify(cmds));
});
const split = (args) => {   // "click", "lane 2", ",", "look" → [["click", "lane 2"], ["look"]]; "play," ends a command too
  const out = [[]];
  for (const a of args) { if (a === ',') { out.push([]); continue; } if (a.length > 1 && a.endsWith(',')) { out.at(-1).push(a.slice(0, -1)); out.push([]); continue; } out.at(-1).push(a); }
  return out.filter((c) => c.length);
};

async function client() {
  if (!port) { console.log(`hands: say who you are first (${Object.keys(PORTS).join(', ')})\n\n` + HELP); process.exit(1); }
  const cmds = split(rest);
  if (!cmds.length || cmds[0][0] === 'help') { console.log(HELP); return; }
  if (cmds[0][0] === 'start') {
    if (existsSync(sock)) { await request([['stop']], 30000).catch(() => {}); await sleep(500); }
    mkdirSync(dir, { recursive: true }); rmSync(sock, { force: true });
    const log = openSync(`${dir}/hands.log`, 'w');
    spawn(process.execPath, [fileURLToPath(import.meta.url), who, 'host', ...cmds[0].slice(1)], { detached: true, stdio: ['ignore', log, log] }).unref();
    const t0 = Date.now(), limit = 90000 + (+process.env.CDP_START_MS || 60000);
    for (;;) {
      await sleep(500);
      const r = existsSync(sock) ? await request([['ping']], 10000).catch(() => null) : null;
      if (r) { console.log(`started: ${cmds[0].includes('--phone') ? 'a 390×844 touch phone' : 'a 1512×860 laptop window'}${cmds[0].includes('--move') ? ', the Move connected' : ''}. ${HELP.split('\n')[1]}`); break; }
      const l = readFileSync(`${dir}/hands.log`, 'utf8');
      if (/FAILED/.test(l) || Date.now() - t0 > limit) { console.log('hands: the browser did not start\n' + l.slice(-1500)); process.exit(1); }
    }
    if (cmds.length > 1) cmds.shift(); else return;
  }
  if (!existsSync(sock)) { console.log('hands: nothing is running: start first'); process.exit(1); }
  const r = await request(cmds).catch((e) => ({ out: `hands: ${e.message} (is it started?)`, ok: false }));
  console.log(r.out); if (!r.ok) process.exit(1);
}

// ---- in the page: names, visibility and words, the way a person reads the screen ----
function helper() {
  const t = (s) => String(s ?? '').replace(/\s+/g, ' ').trim(), low = (s) => t(s).toLowerCase();
  const vis = (e) => {
    if (!e || !e.getClientRects().length) return false;
    if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  };
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=slider], [role=tab], [role=radio], [role=switch], [role=checkbox], [role=menuitem], [role=menuitemradio], [role=option], [role=link], [role=application]';
  const names = (e) => { const lb = e.getAttribute('aria-labelledby'); return [...new Set([e.getAttribute('aria-label'), lb && lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent).join(' '), e.labels?.[0]?.textContent, e.textContent, e.title, e.placeholder].map(low).filter(Boolean))]; };
  const nameOf = (e) => { const lb = e.getAttribute('aria-labelledby'); return t(e.getAttribute('aria-label') || (lb && lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent).join(' ')) || e.labels?.[0]?.textContent || e.textContent || e.title || e.placeholder || ''); };
  const kind = (e) => e.getAttribute('role') || ({ A: 'link', BUTTON: 'button', SELECT: 'list', TEXTAREA: 'field', SUMMARY: 'section' })[e.tagName] || (e.tagName === 'INPUT' ? (['checkbox', 'radio', 'range', 'file'].includes(e.type) ? e.type : 'field') : e.tagName.toLowerCase());
  const state = (e) => {
    const s = [];
    for (const [a, w] of [['aria-pressed', 'on'], ['aria-checked', 'checked'], ['aria-selected', 'selected'], ['aria-expanded', 'open']]) { const v = e.getAttribute(a); if (v === 'true') s.push(w); else if (v === 'false') s.push('not ' + w); }
    if (e.disabled || e.getAttribute('aria-disabled') === 'true') s.push('disabled');
    const v = e.getAttribute('aria-valuetext') || e.getAttribute('aria-valuenow'); if (v != null) s.push('value ' + v);
    if (e.tagName === 'SELECT') s.push('shows ' + t(e.selectedOptions[0]?.text));
    else if (e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'radio')) s.push(e.checked ? 'checked' : 'not checked');
    else if ((e.tagName === 'INPUT' || e.tagName === 'TEXTAREA') && e.value) s.push(`holds "${e.value}"`);
    if (document.activeElement === e) s.push('focused');
    return s;
  };
  const at = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; };
  const desc = (e) => { const p = at(e), s = state(e); return `${kind(e)} "${nameOf(e)}"${s.length ? ' [' + s.join(', ') + ']' : ''} at ${p.x},${p.y}`; };
  const controls = () => [...document.querySelectorAll(SEL)].filter(vis);
  const rx = (q) => new RegExp('(^|[^\\p{L}\\p{N}])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}\\p{N}])', 'u');
  const match = (q, list = controls()) => { q = low(q); const w = rx(q); for (const f of [(n) => n === q, (n) => n.startsWith(q), (n) => w.test(n)]) { const m = list.filter((e) => names(e).some(f)); if (m.length) return m; } return []; };
  // a modal dialog is what the eye reads while it is up (the page behind it is dimmed and takes no clicks)
  const front = () => document.querySelector('dialog:modal') || document.body;
  const words = () => {
    const out = [], root = front(), w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const s = t(n.textContent), e = n.parentElement; if (s && e && !e.closest('script, style, noscript, template') && vis(e) && out.at(-1) !== s) out.push(s); }
    // a control that shows no words of its own (a knob, a select) says its name and value
    for (const e of controls()) if (root.contains(e) && (!t(e.textContent) || e.tagName === 'SELECT')) { const s = state(e).filter((x) => !/focused/.test(x)); out.push(`[${nameOf(e)}${s.length ? ': ' + s.join(', ') : ''}]`); }
    if (root !== document.body) out.unshift('(a dialog is open over the dimmed page)');
    return out;
  };
  const near = (q) => { const qs = low(q).split(/[\s,·]+/).filter(Boolean); return [...new Set(controls().map(nameOf).filter(Boolean))].map((n) => [n, qs.filter((x) => low(n).includes(x)).length]).filter(([, k]) => k).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n); };
  window.__h = {
    t, vis, desc, controls, words, near, state,
    target(q) {
      const m = match(q); if (!m.length) return null;
      const e = m[0]; e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); window.__hT = e;
      const p = at(e), top = document.elementFromPoint(p.x, p.y), c = top && top !== e && !e.contains(top) ? top.closest(SEL) : null;
      return { ...p, n: m.length, desc: desc(e), covered: top && top !== e && !e.contains(top) ? (c ? desc(c) : `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}`) : null };
    },
    pick(q, o) {
      const e = match(q).find((x) => x.tagName === 'SELECT'); if (!e) return null;
      const opts = [...e.options], lo = low(o), hit = opts.find((x) => low(x.text) === lo) || opts.find((x) => low(x.text).startsWith(lo));
      if (!hit) return { list: desc(e), options: opts.map((x) => t(x.text)) };
      e.focus(); e.value = hit.value; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
      return { list: desc(e), chose: t(hit.text) };
    },
    look() {
      const d = [...document.querySelectorAll('dialog[open]')].map((x) => nameOf(x) || x.id), a = document.activeElement;
      return { focus: a && a !== document.body ? (a.matches(SEL) ? desc(a) : a.tagName.toLowerCase() + (a.id ? '#' + a.id : '')) : 'nothing (the page)', dialogs: d, words: words() };
    },
  };
  // the clipboard: what the page copies is kept for `paste`; a real browser takes it after a click, so it never fails here
  if (navigator.clipboard && !navigator.clipboard.__h) { const w = navigator.clipboard.writeText?.bind(navigator.clipboard); navigator.clipboard.writeText = async (s) => { window.__clip = String(s); try { await w?.(s); } catch {} }; navigator.clipboard.__h = true; }
  // the ear: the master output measured for a while (level, hits per second as energy onsets, spectral centroid). An
  // analyser read every 20 ms (Tone's context has no ScriptProcessor), its last 1024 samples ≈ one read's worth
  window.__ear = (sec) => new Promise((resolve) => {
    const T = window.Tone, ctx = T.getContext().rawContext, out = T.getDestination().output, node = out?.output || out?._gainNode || out;
    const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; node.connect(an);
    const en = [], td = new Float32Array(an.fftSize), spec = new Float32Array(an.frequencyBinCount), acc = new Float64Array(an.frequencyBinCount); let peak = 0;
    const iv = setInterval(() => {
      an.getFloatTimeDomainData(td); let s = 0; for (let i = td.length - 1024; i < td.length; i++) { s += td[i] * td[i]; const a = Math.abs(td[i]); if (a > peak) peak = a; }
      en.push(s / 1024); an.getFloatFrequencyData(spec); for (let i = 1; i < spec.length; i++) acc[i] += 10 ** (spec[i] / 20);
    }, 20);
    setTimeout(() => {
      clearInterval(iv); try { node.disconnect(an); } catch {}
      const mean = en.reduce((a, b) => a + b, 0) / Math.max(1, en.length); let on = 0, last = -9;
      for (let i = 2; i < en.length; i++) if (en[i] > 1e-5 && en[i] > 2.5 * Math.max(en[i - 1], en[i - 2], 1e-9) && i - last > 2) { on++; last = i; }
      let num = 0, den = 0; for (let i = 1; i < acc.length; i++) { num += acc[i] * i * ctx.sampleRate / an.fftSize; den += acc[i]; }
      resolve({ rms: 10 * Math.log10(mean + 1e-12), peak: 20 * Math.log10(peak + 1e-12), hits: on / sec, centroid: den ? num / den : 0 });
    }, sec * 1000);
  });
}

// ---- the host: one browser, one page (and maybe a stranger's), commands in order ----
const KEYS = {
  enter: ['Enter', 'Enter', 13, '\r'], esc: ['Escape', 'Escape', 27], escape: ['Escape', 'Escape', 27], space: [' ', 'Space', 32, ' '], tab: ['Tab', 'Tab', 9],
  up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39],
  '↑': ['ArrowUp', 'ArrowUp', 38], '↓': ['ArrowDown', 'ArrowDown', 40], '←': ['ArrowLeft', 'ArrowLeft', 37], '→': ['ArrowRight', 'ArrowRight', 39],
  arrowup: ['ArrowUp', 'ArrowUp', 38], arrowdown: ['ArrowDown', 'ArrowDown', 40], arrowleft: ['ArrowLeft', 'ArrowLeft', 37], arrowright: ['ArrowRight', 'ArrowRight', 39],
  backspace: ['Backspace', 'Backspace', 8], delete: ['Delete', 'Delete', 46], '`': ['`', 'Backquote', 192, '`'], backquote: ['`', 'Backquote', 192, '`'],
  '?': ['?', 'Slash', 191, '?', 8], '/': ['/', 'Slash', 191, '/'], shift: ['Shift', 'ShiftLeft', 16], alt: ['Alt', 'AltLeft', 18], option: ['Alt', 'AltLeft', 18],
  ctrl: ['Control', 'ControlLeft', 17], control: ['Control', 'ControlLeft', 17], cmd: ['Meta', 'MetaLeft', 91], meta: ['Meta', 'MetaLeft', 91], '⌘': ['Meta', 'MetaLeft', 91],
};
const MOD = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
const keyOf = (k) => {
  const l = String(k).toLowerCase(); if (KEYS[l]) return KEYS[l];
  if (/^[a-z]$/.test(l)) return [l, `Key${l.toUpperCase()}`, l.toUpperCase().charCodeAt(0), l];
  if (/^[0-9]$/.test(l)) return [l, `Digit${l}`, l.charCodeAt(0), l];
  return null;
};
const BTN = { '−': 'minus', '-': 'minus', '+': 'plus', '◀': 'left', '▶': 'right', copy: 'duplicate', 'track 1': 'track1', 'track 2': 'track2', 'track 3': 'track3', 'track 4': 'track4' };
const btnOf = (s) => { const n = BTN[String(s).toLowerCase()] || String(s).toLowerCase().replace(/\s+/g, ''); return bytes.btn(n, true)[1] == null ? null : n; };

async function host(flags) {
  mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/break.wav`, breakWav());
  const phone = flags.includes('--phone'), size = phone ? { width: 390, height: 844, mobile: true } : { width: 1512, height: 860 };
  let b;
  try { b = await launch({ port, debugPort }); } catch (e) { console.log('FAILED ' + e.message); process.exit(1); }
  const S = { moveOn: flags.includes('--move'), shots: 0, held: new Set(), ears: 0 };
  const prep = async (p) => {
    await p.eval(`(${helper})()`);
    if (S.moveOn && p === S.me) await p.eval(`__poly.move.transport = { send: () => {} }; __poly.move.inControl = true; __poly.renderPage?.()`);
  };
  const openPage = async (url) => {
    const p = await b.open(url, { ...size, ready: '!!window.__poly' });
    await p.send('Network.enable'); await p.send('Network.setBlockedURLs', { urls: ['*/__version*'] });   // an edit in the repo must not reload a walk
    await p.send('Page.setInterceptFileChooserDialog', { enabled: true }); p.on('Page.fileChooserOpened', (e) => { p.chooser = e; });
    p.seenErr = 0; return p;
  };
  try {
    S.me = await openPage('orbit2/index.html'); await prep(S.me); S.cur = S.me;
  } catch (e) { console.log('FAILED ' + e.message); await b.close(); process.exit(1); }

  const page = () => S.cur;
  const mods = (args) => [...S.held].reduce((m, k) => m | (MOD[k] || 0), 0) | (args.includes('--shift') ? 8 : 0) | (args.includes('--ctrl') ? 2 : 0) | (args.includes('--cmd') || args.includes('--meta') ? 4 : 0) | (args.includes('--alt') ? 1 : 0);
  const pos = (args) => args.filter((a) => !/^--/.test(a));
  // a button is down only between a press and its release (a hover or a wheel notch has none)
  const mouse = (type, x, y, o = {}) => { const down = type === 'mousePressed' || (type === 'mouseMoved' && o.down), idle = type === 'mouseMoved' && !o.down || type === 'mouseWheel';
    return page().send('Input.dispatchMouseEvent', { type, x, y, button: idle ? 'none' : o.button || 'left', buttons: down ? (o.button === 'right' ? 2 : 1) : 0, clickCount: idle ? 0 : o.count || 1, modifiers: o.m || 0, ...(o.wheel ? { deltaX: 0, deltaY: o.wheel } : {}) }); };
  const touch = (type, x, y) => page().send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const target = async (name) => {
    const r = await page().eval(`__h.target(${JSON.stringify(name)})`);
    if (!r) { const n = await page().eval(`__h.near(${JSON.stringify(name)})`); throw new Error(`no control named "${name}" on the screen now${n.length ? `; names on the screen that share a word: ${n.map((x) => `"${x}"`).join(', ')}` : ''}`); }
    return r;
  };
  const said = (r) => `${r.desc}${r.n > 1 ? ` (${r.n} controls have that name: this is the first)` : ''}${r.covered ? `; something lies over it there, the press landed on ${r.covered}` : ''}`;
  const key = async (spec, m = 0) => {
    const k = keyOf(spec); if (!k) throw new Error(`unknown key "${spec}"`);
    const [kk, code, vk, text, extra = 0] = k, mm = m | extra, shifted = mm & 8 && /^[a-z]$/.test(kk) ? kk.toUpperCase() : kk;
    for (const type of ['keyDown', 'keyUp']) await page().send('Input.dispatchKeyEvent', { type, key: shifted, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mm, ...(type === 'keyDown' && text && !(mm & 6) ? { text: mm & 8 && /^[a-z]$/.test(text) ? text.toUpperCase() : text } : {}) });
  };
  const mv = (...bs) => page().eval(`${JSON.stringify(bs)}.forEach(b => __poly.move.receive(new Uint8Array(b)))`);
  const knob = (k) => { const n = +k; if (!(n >= 1 && n <= 8)) throw new Error('a knob is 1 to 8'); return n - 1; };
  const stepN = (s) => { const n = +s; if (!(n >= 1 && n <= 16)) throw new Error('a step button is 1 to 16'); return n - 1; };

  const C = {
    ping: async () => 'pong',
    fresh: async () => {
      const p = page(); await p.eval(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases?.()) || []) indexedDB.deleteDatabase(d.name); })()`);
      await p.send('Page.reload'); await sleep(1500);
      for (let t0 = Date.now(); !(await p.eval('!!window.__poly').catch(() => false)); await sleep(250)) if (Date.now() - t0 > 60000) throw new Error('the page did not come back');
      await prep(p); return 'the page loaded again, as a first visit';
    },
    look: async () => {
      const f = `${dir}/look-${String(++S.shots).padStart(2, '0')}.png`; await page().shot(f); const l = await page().eval('__h.look()');
      let w = l.words.join(' · '); if (w.length > 3500) w = w.slice(0, 3500) + ` … (${w.length - 3500} more characters: use find)`;
      return `screenshot: ${f} (open it with the Read tool)\nfocus: ${l.focus}${l.dialogs.length ? `\nopen dialog: ${l.dialogs.join(', ')}` : ''}\nwords on the screen: ${w}`;
    },
    zoom: async (a) => {
      const [x, y, w, h] = pos(a).map(Number); if ([x, y, w, h].some((v) => !Number.isFinite(v))) throw new Error('zoom <x> <y> <w> <h>');
      const f = `${dir}/zoom-${String(++S.shots).padStart(2, '0')}.png`, { result } = await page().send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 2 } });
      writeFileSync(f, Buffer.from(result.data, 'base64')); return `screenshot: ${f} (open it with the Read tool)`;
    },
    find: async (a) => {
      const q = pos(a).join(' '); if (!q) throw new Error('find <words>');
      const r = await page().eval(`(() => { const w = __h.look().words.join(' · '), i = w.toLowerCase().indexOf(${JSON.stringify(q.toLowerCase())}); return i < 0 ? null : w.slice(Math.max(0, i - 60), i + ${q.length} + 60); })()`);
      return r ? `yes, on the screen: "…${r}…"` : `no: "${q}" is not on the screen now`;
    },
    controls: async (a) => {
      const q = pos(a).join(' ').toLowerCase(), l = await page().eval(`__h.controls().map(e => __h.desc(e))`);
      const m = q ? l.filter((d) => d.toLowerCase().includes(q)) : l; return m.length ? m.map((d) => '- ' + d).join('\n') : `no control on the screen has "${q}" in it`;
    },
    address: async () => `the address bar: ${await page().eval('location.href')}`,
    paste: async () => { const c = await page().eval('window.__clip ?? null'); return c ? `the clipboard holds: ${c}` : 'the clipboard is empty'; },
    click: async (a) => { const r = await target(pos(a).join(' ')), m = mods(a); await mouse('mouseMoved', r.x, r.y, { m }); await mouse('mousePressed', r.x, r.y, { m }); await mouse('mouseReleased', r.x, r.y, { m }); return `clicked ${said(r)}`; },
    rclick: async (a) => { const r = await target(pos(a).join(' ')), m = mods(a); await mouse('mouseMoved', r.x, r.y, { m }); await mouse('mousePressed', r.x, r.y, { m, button: 'right' }); await mouse('mouseReleased', r.x, r.y, { m, button: 'right' }); return `right-clicked ${said(r)}`; },
    dblclick: async (a) => { const r = await target(pos(a).join(' ')), m = mods(a); for (const count of [1, 2]) { await mouse('mousePressed', r.x, r.y, { m, count }); await mouse('mouseReleased', r.x, r.y, { m, count }); } return `double-clicked ${said(r)}`; },
    'click-at': async (a) => { const [x, y] = pos(a).map(Number), m = mods(a); if (![x, y].every(Number.isFinite)) throw new Error('click-at <x> <y>'); await mouse('mouseMoved', x, y, { m }); await mouse('mousePressed', x, y, { m }); await mouse('mouseReleased', x, y, { m }); const d = await page().eval(`(() => { const e = document.elementFromPoint(${x}, ${y}), c = e?.closest('button, a[href], input, select, summary, [role]'); return c ? __h.desc(c) : e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') : 'nothing'; })()`); return `clicked at ${x},${y}: ${d}`; },
    hold: async (a) => { const p = pos(a), s = +p.pop(); if (!(s > 0)) throw new Error('hold <name> <seconds>'); const r = await target(p.join(' ')), m = mods(a); await mouse('mouseMoved', r.x, r.y, { m }); await mouse('mousePressed', r.x, r.y, { m }); await sleep(s * 1000); await mouse('mouseReleased', r.x, r.y, { m }); return `held the mouse on ${said(r)} for ${s} s, then let go`; },
    drag: async (a) => {
      const p = pos(a), px = /^\d+$/.test(p.at(-1)) ? +p.pop() : 40, dir_ = p.pop(); if (!['up', 'down'].includes(dir_)) throw new Error('drag <name> up|down [px]');
      const r = await target(p.join(' ')), m = mods(a), dy = dir_ === 'up' ? -px : px;
      await mouse('mouseMoved', r.x, r.y, { m }); await mouse('mousePressed', r.x, r.y, { m }); for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', r.x, r.y + dy * i / 8, { m, down: true }); await sleep(30); }
      await mouse('mouseReleased', r.x, r.y + dy, { m }); await sleep(100); const d = await page().eval('__hT && __h.desc(__hT)'); return `dragged ${dir_} ${px} px on ${said(r)}; now ${d}`;
    },
    scroll: async (a) => {
      const p = pos(a), n = /^\d+$/.test(p.at(-1)) ? +p.pop() : 1, dir_ = p.pop(); if (!['up', 'down'].includes(dir_)) throw new Error('scroll <name> up|down [times]');
      const r = await target(p.join(' ')), m = mods(a); await mouse('mouseMoved', r.x, r.y, { m });
      for (let i = 0; i < n; i++) { await mouse('mouseWheel', r.x, r.y, { m, wheel: dir_ === 'up' ? -100 : 100 }); await sleep(120); }
      const d = await page().eval('__hT && __h.desc(__hT)'); return `scrolled ${dir_} ${n}× over ${said(r)}; now ${d}`;
    },
    pick: async (a) => {
      const p = pos(a); if (p.length < 2) throw new Error('pick <name> <option>');
      for (let i = p.length - 1; i >= 1; i--) { const r = await page().eval(`__h.pick(${JSON.stringify(p.slice(0, i).join(' '))}, ${JSON.stringify(p.slice(i).join(' '))})`); if (r?.chose) return `picked "${r.chose}" in ${r.list}`; if (r?.options) return `no entry "${p.slice(i).join(' ')}" in ${r.list}; its entries: ${r.options.join(', ')}`; }
      throw new Error(`no drop-down list named "${p[0]}" on the screen now`);
    },
    type: async (a) => { const s = a.join(' '); await page().send('Input.insertText', { text: s }); return `typed "${s}"`; },
    key: async (a) => { const k = pos(a)[0]; await key(k, mods(a)); return `pressed ${k}${mods(a) ? ' (with ' + Object.entries(MOD).filter(([, v]) => mods(a) & v).map(([n]) => n).join('+') + ')' : ''}`; },
    keydown: async (a) => { const k = keyOf(pos(a)[0]); if (!k || !MOD[k[0]]) throw new Error('keydown holds Shift, Alt, Ctrl or Cmd'); S.held.add(k[0]); await page().send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k[0], code: k[1], windowsVirtualKeyCode: k[2], modifiers: mods([]) }); return `holding ${k[0]}`; },
    keyup: async (a) => { const k = keyOf(pos(a)[0]); if (!k || !S.held.has(k[0])) throw new Error('that key is not held'); S.held.delete(k[0]); await page().send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], code: k[1], windowsVirtualKeyCode: k[2], modifiers: mods([]) }); return `let go of ${k[0]}`; },
    choose: async (a) => {
      const f = pos(a).join(' '), p = page(); if (!p.chooser) throw new Error('no file picker is open: the page opens one when you press its button');
      if (!existsSync(f)) throw new Error(`no file ${f}`); await p.send('DOM.setFileInputFiles', { files: [f], backendNodeId: p.chooser.backendNodeId }); p.chooser = null; return `chose ${f}`;
    },
    tap: async (a) => { const r = await target(pos(a).join(' ')); await touch('touchStart', r.x, r.y); await sleep(60); await touch('touchEnd', r.x, r.y); return `tapped ${said(r)}`; },
    longpress: async (a) => { const p = pos(a), s = /^[\d.]+$/.test(p.at(-1)) ? +p.pop() : 1; const r = await target(p.join(' ')); await touch('touchStart', r.x, r.y); await sleep(s * 1000); await touch('touchEnd', r.x, r.y); return `long-pressed ${said(r)} for ${s} s`; },
    swipe: async (a) => {
      const p = pos(a), px = /^\d+$/.test(p.at(-1)) ? +p.pop() : 40, dir_ = p.pop(); if (!['up', 'down'].includes(dir_)) throw new Error('swipe <name> up|down [px]');
      const r = await target(p.join(' ')), dy = dir_ === 'up' ? -px : px; await touch('touchStart', r.x, r.y); for (let i = 1; i <= 8; i++) { await touch('touchMove', r.x, r.y + dy * i / 8); await sleep(30); } await touch('touchEnd', r.x, r.y + dy);
      await sleep(100); const d = await page().eval('__hT && __h.desc(__hT)'); return `slid a finger ${dir_} ${px} px on ${said(r)}; now ${d}`;
    },
    move: async (a) => {
      if (page() !== S.me) throw new Error('the Move is plugged into your own page (me)');
      if (!S.moveOn) { S.moveOn = true; await prep(S.me); }
      const [what, x, y] = a, w = String(what || '').toLowerCase();
      if (w === 'press' || w === 'down' || w === 'up') {
        const n = btnOf(x); if (!n) throw new Error(`no Move button "${x}"`);
        if (w !== 'up') await mv(bytes.btn(n, true)); if (w === 'press') await sleep(60); if (w !== 'down') await mv(bytes.btn(n, false));
        return `${w === 'press' ? 'tapped' : w === 'down' ? 'holding' : 'let go of'} the Move's ${n}`;
      }
      if (w === 'turn') { const k = knob(x), c = Math.trunc(+y); if (!c) throw new Error('move turn <knob> <clicks>'); await mv(bytes.touch(k, true)); await sleep(80); for (let i = 0; i < Math.abs(c); i++) { await mv(bytes.enc(k, Math.sign(c))); await sleep(60); } await sleep(80); await mv(bytes.touch(k, false)); return `touched knob ${k + 1}, turned it ${Math.abs(c)} click${Math.abs(c) > 1 ? 's' : ''} ${c > 0 ? 'right' : 'left'}, let go`; }
      if (w === 'touch' || w === 'untouch') { const k = knob(x); await mv(bytes.touch(k, w === 'touch')); return `${w === 'touch' ? 'touching' : 'let go of'} knob ${k + 1}`; }
      if (w === 'step' || w === 'step-down' || w === 'step-up') { const s = stepN(x); if (w !== 'step-up') await mv(bytes.step(s, true)); if (w === 'step') await sleep(60); if (w !== 'step-down') await mv(bytes.step(s, false)); return `${w === 'step' ? 'tapped' : w === 'step-down' ? 'holding' : 'let go of'} step button ${s + 1}`; }
      if (w === 'pad') { const r = +x, c = +y; if (!(r >= 1 && r <= 4 && c >= 1 && c <= 8)) throw new Error('move pad <row 1-4> <column 1-8>'); await mv(bytes.pad(r - 1, c - 1, true)); await sleep(80); await mv(bytes.pad(r - 1, c - 1, false)); return `hit pad row ${r}, column ${c}`; }
      if (w === 'wheel') { const c = Math.trunc(+x); if (!c) throw new Error('move wheel <clicks>'); for (let i = 0; i < Math.abs(c); i++) { await mv(bytes.wheel(Math.sign(c))); await sleep(60); } return `turned the jog wheel ${Math.abs(c)} ${c > 0 ? 'right' : 'left'}`; }
      if (w === 'wheel-push') { await mv([0xB0, 3, 127]); await sleep(60); await mv([0xB0, 3, 0]); return 'pushed the jog wheel'; }
      throw new Error(`move ${what}? (press, down, up, turn, touch, untouch, step, step-down, step-up, pad, wheel, wheel-push)`);
    },
    listen: async (a) => {
      const s = Math.min(20, Math.max(0.5, +pos(a)[0] || 2)), r = await page().eval(`__ear(${s})`);
      return r.rms < -70 ? `silence for ${s} s` : `heard ${s} s: level ${r.rms.toFixed(1)} dB (peak ${r.peak.toFixed(1)} dB), about ${r.hits.toFixed(1)} hits a second, brightness ${Math.round(r.centroid)} Hz`;
    },
    other: async (a) => {
      const u = pos(a).join(' ').replace(/\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//, `//127.0.0.1:${port}/`); if (!/^https?:\/\//.test(u)) throw new Error('other <link> (the whole link)');
      await S.me.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${port}`, storageTypes: 'all' }).catch(() => {});
      S.other?.close(); S.other = await openPage(u); await prep(S.other); S.cur = S.other; return `opened the link as another person: ${u}`;
    },
    me: async () => { S.cur = S.me; return 'back on your own page'; },
    wait: async (a) => { const s = Math.min(120, Math.max(0, +pos(a)[0] || 1)); await sleep(s * 1000); return `waited ${s} s`; },
    stop: async () => { setTimeout(async () => { await b.close(); rmSync(sock, { force: true }); process.exit(0); }, 100); return 'stopped: the browser is closed'; },
  };

  let idle = null; const touchIdle = () => { clearTimeout(idle); idle = setTimeout(() => C.stop(), 40 * 60000); }; touchIdle();
  let chain = Promise.resolve();
  http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => { chain = chain.then(async () => {
      touchIdle(); let ok = true; const out = [];
      for (const [cmd, ...args] of JSON.parse(body)) {
        const f = C[String(cmd).toLowerCase()];
        if (!f) { out.push(`> ${cmd}: no such command (try help)`); ok = false; break; }
        try {
          const p = page(); if (cmd !== 'ping' && cmd !== 'stop' && !(await p.eval('!!window.__h').catch(() => false))) { await prep(p); out.push('(the page had loaded again by itself)'); }
          out.push(`> ${[cmd, ...args].join(' ')}\n${await f(args)}`); await sleep(150);
          const e = page().errors; if (e.length > page().seenErr) { out.push(`! page error: ${e.slice(page().seenErr).join(' | ')}`); page().seenErr = e.length; }
        } catch (e) { out.push(`> ${[cmd, ...args].join(' ')}\n✗ ${String(e.message).split('\n')[0]}`); ok = false; break; }
      }
      res.end(JSON.stringify({ ok, out: out.join('\n') }));
    }); });
  }).listen(sock, () => console.log('hands: ready on ' + sock));
}

if (rest[0] === 'host') host(rest.slice(1)); else client();
