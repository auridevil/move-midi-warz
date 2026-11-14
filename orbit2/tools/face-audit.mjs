// RD-1 face audit (DECISION A1, A5, A6, A7, A9): measures orbit2/index.html in a muted headless Chrome (cdp.mjs) and
// reports what the redesign is judged by. Every size gets a fresh browser profile, so each one is a first visit.
//
//   node orbit2/tools/face-audit.mjs                        # 1512×860, 1512×982, 1280×720, 390×844 → summary
//   node orbit2/tools/face-audit.mjs --audio                # + the A9 audio baseline (fixed-seed WAV hash, lateness, stress)
//   node orbit2/tools/face-audit.mjs --json /tmp/x.json --shots /tmp/x/   # the full report + screenshots
//   node orbit2/tools/face-audit.mjs --assert               # exit 1 when an A1 / A5 / A6 / A7 threshold fails
//   --sizes 1512x860,390x844m   (m = phone: touch + mobile)   --port 5400 --debug-port 9400   --path orbit2/index.html
//   --play 6  (seconds of playing for the frame-time p95)
//
// What it measures, per size (methods in orbit2/docs/redesign/baselines.md):
//   controls  every interactive element: in the DOM, drawn (`total`: checkVisibility, so not inside a closed drawer), and
//             in view (`visible`, clipped by the window and by scrolling columns), with ids / names; and with 6 lanes
//             (A5's worst case). `brief` repeats the brief's count (layout boxes: it counted closed drawers' content)
//   text      every text run's contrast against the pixels behind it (a screenshot with all text made transparent),
//             its colour and opacity composited on them: the 10th percentile pixel is the run's contrast
//   edges     every visible control: its 3 px inner band against the median of the 3 px band outside it (a knob: its
//             arc box, 85th percentile), on a full screenshot
//   light     the brightest control pixel (relative luminance) vs the brightest canvas pixel, stopped and playing
//   scroll    document scrollHeight vs innerHeight, and every element that scrolls inside, in four states
//   rings     scene.geo(): centre and outer radius (page px) in each state (default, every drawer open, focus mode, playing)
//   frames    while playing: rAF callback time p95 (the page's own work per frame) and frame interval p95
import { launch } from './cdp.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const THRESHOLDS = {
  text: 4.5, edge: 3, controlLum: 0.475,                       // A1
  controls: 50, controlsWorst: 62,                              // A5 (at 1512×860)
  a1Sizes: ['1512x860', '1280x720', '390x844m'], a5Size: '1512x860', a6Sizes: ['1512x860', '1512x982', '1280x720'], a7Sizes: ['1512x860', '1512x982', '1280x720'],
};
const SHEET_SEL = '#sheet, [data-sheet]';   // A6: the one place allowed to scroll inside (RD-3 builds it)
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

// ---- in-page code (one string, installed once per page) ----
const PAGE = String.raw`(() => {
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=slider], [role=button], [role=tab], [role=switch], [role=checkbox], [tabindex]:not([tabindex="-1"])';
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const pct = (a, p) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p / 100 * a.length))]; };
  // drawn: Chrome keeps layout boxes for a closed <details>' content (content-visibility: hidden), so a box is not enough
  const shown = (e) => e.checkVisibility({ visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true }) && !e.closest('[inert]');
  const boxed = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';   // the brief's count (it includes closed drawers)
  // the part of a box the eye can see: clipped by the window and by every scrolling / clipping ancestor
  function seen(e, r = e.getBoundingClientRect()) {
    let x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(innerWidth, r.right), y1 = Math.min(innerHeight, r.bottom);
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = a.getBoundingClientRect(); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom);
    }
    return x1 - x0 >= 1 && y1 - y0 >= 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  const name = (e) => (e.getAttribute('aria-label') || e.textContent || e.title || e.placeholder || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const tag = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '');
  function controls() {
    const all = [...document.querySelectorAll(SEL)], laid = all.filter(shown), vis = laid.map(e => [e, seen(e)]).filter(([, r]) => r), box = all.filter(boxed);
    const inWin = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 0 && r.height > 0; };
    return { dom: all.length, total: laid.length, visible: vis.length, brief: { boxes: box.length, inWindow: box.filter(inWin).length }, list: vis.map(([e, r]) => ({ el: tag(e), name: name(e), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })) };
  }
  function scroll() {
    const d = document.documentElement, inner = [];
    for (const e of document.querySelectorAll('body *')) {
      if (!shown(e) || e.scrollHeight <= e.clientHeight + 1) continue; const s = getComputedStyle(e);
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') inner.push({ el: tag(e), sheet: !!e.closest(${JSON.stringify(SHEET_SEL)}), scrollHeight: e.scrollHeight, clientHeight: e.clientHeight });
    }
    return { scrollHeight: d.scrollHeight, innerHeight, pageScrolls: d.scrollHeight > innerHeight, inner };
  }
  function rings() { const g = __poly.scene.geo(), c = document.getElementById('cv').getBoundingClientRect(); return { cx: Math.round((c.left + g.cx) * 10) / 10, cy: Math.round((c.top + g.cy) * 10) / 10, R: Math.round(g.R * 10) / 10, outer: Math.round(g.outer * 10) / 10, diameter: Math.round(g.outer * 20) / 10, lanes: g.lanes }; }
  // the text runs: an element's own text nodes, tight boxes
  function texts() {
    const out = [];
    for (const e of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'OPTION', 'CANVAS'].includes(e.tagName) || !shown(e)) continue;
      const field = /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && e.type !== 'checkbox' && e.type !== 'radio' && e.type !== 'range';
      const nodes = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      if (!nodes.length && !field) continue;
      let box = null;
      if (field) box = e.getBoundingClientRect();
      else for (const n of nodes) { const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) box = box ? { left: Math.min(box.left, q.left), top: Math.min(box.top, q.top), right: Math.max(box.right, q.right), bottom: Math.max(box.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom }; }
      if (!box) continue; const r = seen(e, box); if (!r) continue;
      const s = getComputedStyle(e), m = s.color.match(/[\d.]+/g).map(Number); let op = 1; for (let a = e; a; a = a.parentElement) op *= +getComputedStyle(a).opacity;
      if (op * (m[3] ?? 1) < 0.02) continue;   // text that is not drawn
      out.push({ el: tag(e), text: (field ? e.value || e.placeholder || '' : nodes.map(n => n.textContent).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 40), rgb: m.slice(0, 3), a: (m[3] ?? 1) * op, size: parseFloat(s.fontSize), weight: +s.fontWeight || 400, r });
    }
    return out;
  }
  async function image(b64) { const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height); }
  const px = (img, x, y) => { const i = (Math.round(y) * img.width + Math.round(x)) * 4, d = img.data; return [d[i], d[i + 1], d[i + 2]]; };
  function each(img, r, fn, inside = null) {   // every pixel of rect r (and, with inside, not in that rect)
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(img.height, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(img.width, Math.ceil(r.x + r.w)); x++) {
      if (inside && x >= inside.x && x < inside.x + inside.w && y >= inside.y && y < inside.y + inside.h) continue; fn(px(img, x, y));
    }
  }
  const grow = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
  window.__fa = {
    controls, scroll, rings,
    hideText(on) { let s = document.getElementById('fa-hide'); if (!s) { s = document.createElement('style'); s.id = 'fa-hide'; document.head.append(s); } s.textContent = '*, *::before, *::after { transition: none !important; }' + (on ? ' *, *::before, *::after, *::placeholder, *::marker { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }' : ''); },
    async measure(bg64, full64) {
      const bg = await image(bg64), full = await image(full64), runs = texts(), text = [];
      for (const t of runs) {
        const rs = []; each(bg, t.r, ([r, g, b]) => { const L = lum(r, g, b), c = lum(...t.rgb.map((v, k) => v * t.a + [r, g, b][k] * (1 - t.a))); rs.push(ratio(c, L)); });
        if (rs.length) text.push({ el: t.el, text: t.text, size: t.size, weight: t.weight, contrast: Math.round(pct(rs, 10) * 100) / 100, x: Math.round(t.r.x), y: Math.round(t.r.y) });
      }
      const edges = [], light = []; let ctlMax = 0, ctlMaxAt = null;
      for (const e of [...document.querySelectorAll(SEL)].filter(shown)) {
        const box = e.tagName === 'SUMMARY' && e.parentElement?.tagName === 'DETAILS' ? e.parentElement : e, knob = e.classList.contains('gauge') ? e.querySelector('svg') : null;
        const r = seen(box, (knob || box).getBoundingClientRect()); if (!r || r.w < 4 || r.h < 4) continue;
        const out = []; each(full, grow(r, 3), ([a, b, c]) => out.push(lum(a, b, c)), r); const Lo = pct(out, 50) ?? 0;
        const inner = []; if (knob) each(full, r, ([a, b, c]) => inner.push(ratio(lum(a, b, c), Lo))); else each(full, r, ([a, b, c]) => inner.push(ratio(lum(a, b, c), Lo)), grow(r, -3));
        edges.push({ el: tag(e), name: name(e), edge: Math.round((pct(inner, knob ? 85 : 75) ?? 1) * 100) / 100 });
        const cr = seen(e); if (!cr) continue; let mx = 0; each(full, cr, ([a, b, c]) => { const L = lum(a, b, c); if (L > mx) mx = L; });
        light.push({ el: tag(e), name: name(e), lum: Math.round(mx * 1000) / 1000 }); if (mx > ctlMax) { ctlMax = mx; ctlMaxAt = tag(e) + ' ' + name(e); }
      }
      return { text, edges, light, ctlMax: Math.round(ctlMax * 1000) / 1000, ctlMaxAt, canvasMax: this.canvasMax() };
    },
    canvasMax() { const cv = document.getElementById('cv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let mx = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; const L = lum(d[i], d[i + 1], d[i + 2]) * d[i + 3] / 255; if (L > mx) mx = L; } return Math.round(mx * 1000) / 1000; },
    // frame cost: every rAF callback timed (the scene asks for its next frame through the global each time)
    frames() { const raf = window.__faRaf ||= window.requestAnimationFrame.bind(window), cost = [], gap = []; let last = 0; window.requestAnimationFrame = (cb) => raf((t) => { if (last) gap.push(t - last); last = t; const s = performance.now(); cb(t); cost.push(performance.now() - s); }); return () => { window.requestAnimationFrame = raf; return { cost: pct(cost, 95), gap: pct(gap, 95), n: cost.length }; }; },
    // A9 clock: a second Tone.Loop on the app loop's grid measures how late the scheduler calls back (audio time)
    lateness() { const T = window.Tone, raw = T.getContext().rawContext, late = []; const l = new T.Loop((time) => late.push((raw.currentTime - time) * 1000), (T.getTransport().PPQ / 24) + 'i').start(0); return () => { l.dispose(); return { p95: pct(late, 95), max: late.length ? Math.max(...late) : null, n: late.length }; }; },
  };
})()`;

async function settle(p, ms = 120) { await p.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await p.sleep(ms); }
// a busy machine can take longer than open()'s 3.5 s to run the page's modules
async function ready(p) { for (let i = 0; i < 80 && !(await p.eval('!!window.__poly && !window.__faOld')); i++) await p.sleep(250); }
async function shot64(p) { const { result } = await p.send('Page.captureScreenshot', { format: 'png' }); return result.data; }
const play = (p) => p.eval(`document.getElementById('btn-play').click()`);

/** One size: a fresh browser (a first visit), first load measured, then the states. */
export async function auditSize(size, { port = 5400, debugPort = 9400, path = 'orbit2/index.html', shots = null, playSec = 6 } = {}) {
  const [, w, h, m] = /^(\d+)x(\d+)(m?)$/.exec(size), mobile = !!m, b = await launch({ port, debugPort });
  try {
    const p = await b.open(path, { width: +w, height: +h, mobile }); await ready(p); await p.eval(PAGE); await p.eval('__fa.hideText(false)'); await settle(p, 400);
    const out = { size, errors: p.errors };
    out.controls = await p.eval('__fa.controls()');
    // text: the background with every text transparent, then the page as it is
    await p.eval('__fa.hideText(true)'); await settle(p); const bg = await shot64(p);
    await p.eval('__fa.hideText(false)'); await settle(p); const full = await shot64(p);
    if (shots) { mkdirSync(shots, { recursive: true }); writeFileSync(join(shots, `${size}-first-load.png`), Buffer.from(full, 'base64')); }
    const ms = await p.eval(`__fa.measure(${JSON.stringify(bg)}, ${JSON.stringify(full)})`);
    out.text = { n: ms.text.length, min: ms.text.length ? Math.min(...ms.text.map(t => t.contrast)) : null, fails: ms.text.filter(t => t.contrast < THRESHOLDS.text).sort((a, b) => a.contrast - b.contrast), all: ms.text };
    out.edges = { n: ms.edges.length, min: ms.edges.length ? Math.min(...ms.edges.map(e => e.edge)) : null, fails: ms.edges.filter(e => e.edge < THRESHOLDS.edge).sort((a, b) => a.edge - b.edge) };
    out.light = { stopped: { controlMax: ms.ctlMax, controlMaxAt: ms.ctlMaxAt, canvasMax: ms.canvasMax, over: ms.light.filter(l => l.lum > THRESHOLDS.controlLum).sort((a, b) => b.lum - a.lum) } };
    // states: A6 scroll and A7 rings
    out.states = {}; const state = async (k) => { await settle(p, 250); out.states[k] = { scroll: await p.eval('__fa.scroll()'), rings: await p.eval('__fa.rings()') }; };
    await state('default');
    await p.eval(`(() => { window.__faOpen = [...document.querySelectorAll('details')].map(d => d.open); document.querySelectorAll('details').forEach(d => { d.open = true; }); })()`); await state('drawers');
    if (shots) await p.shot(join(shots, `${size}-drawers.png`));
    await p.eval(`document.querySelectorAll('details').forEach((d, i) => { d.open = window.__faOpen[i]; })`);
    await p.eval('__poly.setFocusMode(true)'); await state('focus'); await p.eval('__poly.setFocusMode(false)');
    // playing: rings, frame time, light while the planets flash
    await play(p); await p.sleep(800); await state('playing');
    await p.eval('window.__faStop = __fa.frames()'); let canvasMax = 0;
    for (let s = 0; s < playSec * 4; s++) { await p.sleep(250); canvasMax = Math.max(canvasMax, await p.eval('__fa.canvasMax()')); }
    out.frames = await p.eval('window.__faStop()');
    const full2 = await shot64(p); if (shots) writeFileSync(join(shots, `${size}-playing.png`), Buffer.from(full2, 'base64'));
    const ms2 = await p.eval(`__fa.measure(${JSON.stringify(full2)}, ${JSON.stringify(full2)})`);
    out.light.playing = { controlMax: ms2.ctlMax, controlMaxAt: ms2.ctlMaxAt, canvasMax: Math.max(canvasMax, ms2.canvasMax) };
    await play(p); await settle(p);
    // A5 worst case today: 6 lanes
    await p.eval('__poly.setLaneCount(6)'); await settle(p, 250); out.controls6 = { visible: (await p.eval('__fa.controls()')).visible, scroll: await p.eval('__fa.scroll()') };
    out.errors = p.errors; return out;
  } finally { await b.close(); }
}

const sha = (u) => createHash('sha256').update(u).digest('hex');
/** The 16-bit samples of a WAV's data chunk (interleaved). */
export function pcm16(u) {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  for (let o = 12; o + 8 <= u.length;) { const id = String.fromCharCode(...u.slice(o, o + 4)), sz = v.getUint32(o + 4, true); if (id === 'data') return new Int16Array(u.slice(o + 8, o + 8 + sz).buffer); o += 8 + sz + (sz & 1); }
  return new Int16Array(0);
}
/** Two renders sample by sample: how many differ, by how much (LSB), and where the first one is (s, stereo frames at 44.1 kHz). */
export function pcmDiff(a, b) { let n = 0, max = 0, first = -1; for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = Math.abs((a[i] ?? 0) - (b[i] ?? 0)); if (x) { n++; if (x > max) max = x; if (first < 0) first = i; } } return { samples: n, maxLsb: max, firstSec: first < 0 ? null : Math.round(first / 2 / 44100 * 1e4) / 1e4 }; }
/** A9 fingerprint that a 1-LSB render wobble does not move: per 20 ms window the RMS of the left, the right and their
 *  mid (so a swap, a pan or one channel's polarity moves it), in dB to 0.1 (floor −90), hashed. Two renders of the same
 *  pattern give the same fingerprint; a level, timing or sound change does not. */
export function fingerprint(s, sr = 44100, ms = 20) {
  const w = Math.round(sr * ms / 1000) * 2, out = [], db = (e, n) => Math.max(-90, Math.round(10 * Math.log10(e / n || 1e-12) * 10) / 10);
  for (let i = 0; i < s.length; i += w) {
    let l = 0, r = 0, m = 0, n = 0; const end = Math.min(s.length, i + w);
    for (let j = i; j < end - 1; j += 2) { const a = s[j] / 32768, c = s[j + 1] / 32768; l += a * a; r += c * c; m += ((a + c) / 2) ** 2; n++; }
    out.push(db(l, n), db(r, n), db(m, n));
  }
  return { hash: sha(out.join(',')).slice(0, 16), windows: out.length / 3, db: out };
}
// A9 renders that repeat: Math.random seeded before the page's first script, and again just before exportWav with the
// frames held (the canvas draws with it). Render #1 of a fresh page each time: the first render fills Tone's noise
// buffers from the random stream, so a second render in the same page plays the cache, not the page
export const A9_RANDOM = 12345;
const SEEDED = `(() => { let a = ${A9_RANDOM}; window.__faSeed = (s) => { a = s >>> 0; }; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()`;
async function seededRender(b, { path, engine, groove, seed }) {
  const p = await b.open(`${path}?debug`, { width: 1512, height: 860 }); await ready(p);
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: SEEDED }); await p.eval('window.__faOld = 1'); await p.send('Page.reload', {}); await p.sleep(500); await ready(p);
  await p.eval(PAGE);
  await p.eval(`(async () => { await __poly.wake(); __poly.setEngine(${JSON.stringify(engine)}); if (${JSON.stringify(engine)} === 'dsp') await __poly.ensureDsp(); const d = __poly.dice; d.locked = true; d.seed = ${seed}; d.repeat = 1; __poly.loadGroove(${JSON.stringify(groove)}); })()`);
  await settle(p, 300); await p.captureDownloads();
  await p.eval(`(async () => { const raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; __faSeed(${A9_RANDOM}); try { await __poly.exportWav(); } finally { window.requestAnimationFrame = raf; } })()`);
  return { p, file: (await p.downloads())[0] };
}
/** A9: a fixed seed and pattern rendered by exportWav on two fresh seeded pages per engine → SHA-256 (exact), how much
 *  the two differ (≤ 1 LSB is the null test), and the fingerprint; and the clock while playing with ?debug: Tone.Loop
 *  lateness, stress p95 and the audio headroom, frame time. */
export async function auditAudio({ port = 5400, debugPort = 9400, path = 'orbit2/index.html', groove = 'house', seed = 4127, playSec = 10 } = {}) {
  const b = await launch({ port, debugPort });
  try {
    const out = { groove, seed, random: A9_RANDOM, renders: {} };
    for (const engine of ['synth', 'dsp']) {
      const one = await seededRender(b, { path, engine, groove, seed }); one.p.send('Page.close'); one.p.close();   // a closed page never answers: not awaited
      const two = await seededRender(b, { path, engine, groove, seed }), p = two.p, files = [one.file, two.file];
      const [a, b2] = files.map(f => pcm16(f.bytes)), d = pcmDiff(a, b2);
      out.renders[engine] = { sha256: sha(files[0].bytes), again: sha(files[1].bytes), file: files[0].name.replace(/-\d{4}-\d\d-\d\d-\d{6}/, ''), bytes: files[0].bytes.length, identical: sha(files[0].bytes) === sha(files[1].bytes), renderDiff: d, nullTest: d.maxLsb <= 1, fingerprint: fingerprint(a), fingerprintAgain: fingerprint(b2) };
      if (engine === 'synth') {   // the clock: the page's default engine, playing the same groove
        await p.eval('window.__faLate = __fa.lateness(); window.__faStop = __fa.frames(); window.__faStress = []; window.__faHead = []; window.__faStressT = setInterval(() => { __faStress.push(__poly.stress.level); __faHead.push(__poly.stress.headMs); }, 300)');
        await play(p); await p.sleep(playSec * 1000);
        const head = await p.eval('__faHead.slice(5)'); await play(p);   // the headroom once it settled, while playing
        const late = await p.eval('window.__faLate()'), frames = await p.eval('window.__faStop()'), stress = await p.eval('(clearInterval(__faStressT), __faStress)');
        out.clock = { seconds: playSec, latenessMs: { p95: r2(late.p95), max: r2(late.max), n: late.n }, stress: { p95: r2(pct(stress, 95)), max: r2(Math.max(...stress)) }, headroomMs: { p5: r2(pct(head, 5)), min: r2(Math.min(...head)) }, frameMs: { cost95: r2(frames.cost), gap95: r2(frames.gap), n: frames.n } };
      }
      out.errors = [...(out.errors || []), ...one.p.errors, ...p.errors]; p.send('Page.close'); p.close();
    }
    return out;
  } finally { await b.close(); }
}

/** The thresholds of A1 / A5 / A6 / A7 against a report → [{ test, size, what }] (empty = pass). */
export function verdicts(report, t = THRESHOLDS) {
  const fails = [], by = Object.fromEntries(report.sizes.map(s => [s.size, s]));
  for (const k of t.a1Sizes) { const s = by[k]; if (!s) continue;
    if (s.text.fails.length) fails.push({ test: 'A1', size: k, what: `${s.text.fails.length} text runs under ${t.text}:1 (min ${s.text.min})` });
    if (s.edges.fails.length) fails.push({ test: 'A1', size: k, what: `${s.edges.fails.length} control edges under ${t.edge}:1 (min ${s.edges.min})` });
    for (const st of ['stopped', 'playing']) { const l = s.light[st]; if (!l) continue;
      if (l.controlMax > t.controlLum) fails.push({ test: 'A1', size: k, what: `${st}: a control pixel at luminance ${l.controlMax} (> ${t.controlLum}): ${l.controlMaxAt}` });
      if (!(l.canvasMax > l.controlMax)) fails.push({ test: 'A1', size: k, what: `${st}: brightest canvas pixel ${l.canvasMax} is not above the brightest control pixel ${l.controlMax}` }); }
  }
  { const s = by[t.a5Size]; if (s) {
    if (s.controls.visible > t.controls) fails.push({ test: 'A5', size: t.a5Size, what: `${s.controls.visible} visible controls (> ${t.controls})` });
    if (s.controls6 && s.controls6.visible > t.controlsWorst) fails.push({ test: 'A5', size: t.a5Size, what: `${s.controls6.visible} visible controls with 6 lanes (> ${t.controlsWorst})` });
  } }
  for (const k of t.a6Sizes) { const s = by[k]; if (!s) continue;
    for (const [st, v] of [...Object.entries(s.states), ['6 lanes', s.controls6]]) { if (!v) continue; const sc = v.scroll;
      if (sc.pageScrolls) fails.push({ test: 'A6', size: k, what: `${st}: the page scrolls (${sc.scrollHeight} > ${sc.innerHeight})` });
      const inner = sc.inner.filter(i => !i.sheet); if (inner.length) fails.push({ test: 'A6', size: k, what: `${st}: scrolls inside outside the sheet: ${inner.map(i => i.el).join(', ')}` }); }
  }
  for (const k of t.a7Sizes) { const s = by[k]; if (!s) continue; const base = s.states.default?.rings;
    for (const [st, v] of Object.entries(s.states)) { const g = v.rings; if (base && (Math.round(g.cx) !== Math.round(base.cx) || Math.round(g.cy) !== Math.round(base.cy) || Math.round(g.outer) !== Math.round(base.outer))) fails.push({ test: 'A7', size: k, what: `${st}: rings at (${g.cx}, ${g.cy}) r ${g.outer}, default (${base.cx}, ${base.cy}) r ${base.outer}` }); }
  }
  return fails;
}

export function summary(report) {
  const L = [];
  for (const s of report.sizes) {
    L.push(`## ${s.size}${s.errors.length ? ` · ${s.errors.length} page errors` : ''}`);
    L.push(`controls: ${s.controls.visible} visible / ${s.controls.total} drawn / ${s.controls.dom} in the DOM · 6 lanes: ${s.controls6?.visible} visible · the brief's count (boxes, closed drawers included): ${s.controls.brief.inWindow} in the window / ${s.controls.brief.boxes}`);
    L.push(`text: ${s.text.n} runs, min ${s.text.min}:1, ${s.text.fails.length} under ${THRESHOLDS.text}:1${s.text.fails.length ? ` (worst: ${s.text.fails.slice(0, 5).map(f => `${f.contrast} "${f.text}"`).join(', ')})` : ''}`);
    L.push(`edges: ${s.edges.n} controls, min ${s.edges.min}:1, ${s.edges.fails.length} under ${THRESHOLDS.edge}:1`);
    for (const st of ['stopped', 'playing']) { const l = s.light[st]; if (l) L.push(`light ${st}: brightest control ${l.controlMax} (${l.controlMaxAt}) · brightest canvas ${l.canvasMax}${l.over ? ` · ${l.over.length} controls over ${THRESHOLDS.controlLum}` : ''}`); }
    for (const [st, v] of Object.entries(s.states)) L.push(`${st.padEnd(8)} scroll ${v.scroll.scrollHeight}/${v.scroll.innerHeight}${v.scroll.inner.length ? ` (inside: ${v.scroll.inner.map(i => `${i.el} ${i.scrollHeight}/${i.clientHeight}`).join(', ')})` : ''} · rings (${v.rings.cx}, ${v.rings.cy}) outer r ${v.rings.outer} (⌀ ${v.rings.diameter})`);
    L.push(`frames while playing: callback p95 ${r2(s.frames.cost)} ms, interval p95 ${r2(s.frames.gap)} ms (${s.frames.n} frames)`, '');
  }
  if (report.audio) { const a = report.audio; L.push(`## audio (A9) · groove ${a.groove}, dice ${a.seed}, Math.random seeded ${a.random}, render #1 of two fresh pages per engine`); for (const [e, r] of Object.entries(a.renders)) L.push(`exportWav ${e}: sha256 ${r.sha256} (${r.bytes} bytes; ${r.identical ? 'the second page renders it identically' : `the second page differs in ${r.renderDiff.samples} samples, up to ${r.renderDiff.maxLsb} LSB, from ${r.renderDiff.firstSec} s`}: null test ${r.nullTest ? 'pass' : 'FAIL'}) · fingerprint ${r.fingerprint.hash}${r.fingerprintAgain.hash === r.fingerprint.hash ? ' (same on the second page)' : ` (second page: ${r.fingerprintAgain.hash})`}`); if (a.clock) L.push(`clock (${a.clock.seconds} s, synth): Tone.Loop lateness p95 ${a.clock.latenessMs.p95} ms (max ${a.clock.latenessMs.max}) · stress p95 ${a.clock.stress.p95} · headroom p5 ${a.clock.headroomMs?.p5} ms (min ${a.clock.headroomMs?.min}) · frame callback p95 ${a.clock.frameMs.cost95} ms, interval p95 ${a.clock.frameMs.gap95} ms`); L.push(''); }
  const v = report.verdicts; L.push(v.length ? `## thresholds: ${v.length} failing\n${v.map(f => `- ${f.test} ${f.size}: ${f.what}`).join('\n')}` : '## thresholds: all pass');
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; }, has = (k) => process.argv.includes(k);
  const opt = { port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400), path: arg('--path', 'orbit2/index.html'), shots: arg('--shots', null), playSec: +arg('--play', 6) };
  const sizes = arg('--sizes', '1512x860,1512x982,1280x720,390x844m').split(',').filter(s => s && s !== 'none');   // none: --audio only
  const report = { date: new Date().toISOString(), path: opt.path, sizes: [] };
  for (const s of sizes) report.sizes.push(await auditSize(s, opt));
  if (has('--audio')) report.audio = await auditAudio(opt);
  report.verdicts = verdicts(report);
  if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify(report, null, 1));
  console.log(summary(report));
  const errs = report.sizes.flatMap(s => s.errors).concat(report.audio?.errors || []);
  if (errs.length) { console.error(`page errors: ${errs.join(' | ')}`); process.exitCode = 2; }
  else if (has('--assert') && report.verdicts.length) process.exitCode = 1;   // page errors stay 2: they say more
}
