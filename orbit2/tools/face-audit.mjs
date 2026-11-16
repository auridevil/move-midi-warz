// RD-1 face audit (DECISION A1, A5, A6, A7, A9): measures orbit2/index.html in a muted headless Chrome (cdp.mjs) and
// reports what the redesign is judged by. Every size gets a fresh browser profile, so each one is a first visit.
//
//   node orbit2/tools/face-audit.mjs                        # 1512×860, 1512×982, 1280×720, 390×844 → summary
//   node orbit2/tools/face-audit.mjs --audio                # + the A9 audio baseline (fixed-seed WAV hash, lateness, stress;
//                                                           #   exit 2 when the canvas did not draw during the clock)
//   node orbit2/tools/face-audit.mjs --json /tmp/x.json --shots /tmp/x/   # the full report + screenshots
//   node orbit2/tools/face-audit.mjs --assert               # exit 1 when an A1 / A5 / A6 / A7 threshold fails
//   --sizes 1512x860,390x844m   (m = phone: touch + mobile)   --port 5400 --debug-port 9400   --path orbit2/index.html
//   --play 6  (seconds of playing for the frame-time p95)
//   --tests A1,TYPE,HIT,HUE   only these gates count for --assert (a phase's own: RD-2; A5–A7 wait for RD-3 / RD-5)
//   --diff orbit2/docs/redesign/baseline/rd01-controls.json   every drawn control's centre (page px) vs the RD-1 baseline
//                      (> 2 px = moved; moved, gone or new fails --assert)
//   --root /tmp/x      audit another checkout (a `git archive` of a commit) with this tool
//   --ids <report.json | none>   the control ids the IDS gate looks for (default: the RD-1 baseline's 62)
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
//   scroll    document scrollHeight vs innerHeight, and every element that scrolls inside, in each state
//   rings     scene.geo(): centre and outer radius (page px) in each state (default, every drawer open, each sheet tab
//             open with its drawers, the sheet closed, every pill shown, focus mode, playing)
//   reach     (RD-3) every control id of the RD-1 baseline: in the page, and drawn once __poly.reveal opened its tab
//   frames    while playing: the page's own work per frame (its rAF callbacks summed by frame) p95 and frame interval p95;
//             and per callback (a frame runs several, most near 0 ms)
//   type      (RD-2) every drawn text's family / size / weight at first load and with everything shown: Major Mono only
//             in the wordmark, three sizes (11 / 13 / 15) under 40 px, weights 400 / 500 (300 only at 40 px and up)
//   hits      (RD-2) the action words in view: a 40 px hit area (probed with elementFromPoint 19.5 px off the centre)
//   hues      (RD-2) every drawn colour (text, borders, background, shadow, SVG marks) is a grey, a lane's colour over the
//             void, or record red on a recorder that records (first load and everything shown)
import { launch } from './cdp.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const THRESHOLDS = {
  text: 4.5, edge: 3, controlLum: 0.475,                       // A1
  controls: 50, controlsWorst: 62,                              // A5 (at 1512×860)
  a1Sizes: ['1512x860', '1280x720', '390x844m'], a5Size: '1512x860', a6Sizes: ['1512x860', '1512x982', '1280x720'], a7Sizes: ['1512x860', '1512x982', '1280x720'],
  typeSizes: [11, 13, 15], typeLarge: 40,                       // TYPE (RD-2): three sizes; 300 only at 40 px and up
};
/** RD-2 colour = sound: a colour ([r, g, b] 0–255) is 'grey' (chroma ≤ 40: the void's greys, a muted dot), 'lane' (a mix
 *  of one lane colour over the void, any amount, every channel within 8), 'rec' (the same for record red) or 'stray'.
 *  Runs in the page too (serialized): no outside names. */
export function hueKind(c, lanes, rec, v) {
  if (Math.max(...c) - Math.min(...c) <= 40) return 'grey';
  const mix = (base) => { for (let p = 0.05; p <= 1.0001; p += 0.01) if (Math.max(...[0, 1, 2].map(i => Math.abs(c[i] - (p * base[i] + (1 - p) * v[i])))) <= 8) return true; return false; };
  return lanes.some(mix) ? 'lane' : mix(rec) ? 'rec' : 'stray';
}
/** RD-2 type rules over the text runs of a page (`__fa.types()`): Major Mono only in the wordmark; under 40 px only the
 *  three sizes and weights 400 / 500; 300 only at 40 px and up; nothing heavier than 500. → { n, sizes, weights, fails } */
export function typeCheck(runs, t = THRESHOLDS) {
  const sizes = {}, weights = {}, fails = new Map();
  for (const r of runs) {
    const k = `${r.family} ${r.size}`; sizes[k] = (sizes[k] || 0) + 1; weights[r.weight] = (weights[r.weight] || 0) + 1;
    const why = /major mono/i.test(r.family) ? (r.mark ? null : 'Major Mono outside the wordmark')
      : r.weight > 500 ? `weight ${r.weight}` : r.size >= t.typeLarge ? null
      : !t.typeSizes.includes(r.size) ? `size ${r.size} px` : r.weight < 400 ? `weight ${r.weight} under ${t.typeLarge} px` : null;
    if (!why) continue; const f = `${r.el} · ${r.family} ${r.size} px ${r.weight}: ${why}`; fails.set(f, (fails.get(f) || 0) + 1);
  }
  return { n: runs.length, sizes, weights, fails: [...fails].map(([what, n]) => ({ what, n })) };
}
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
  // RD-3 a bar fixed along the bottom edge, the window's width, under half its height (the phone's docked sheet tabs):
  // what scrolls under it is hidden there, so a box outside the bar ends at its top
  let dockMemo = null, dockAt = -1e9;   // looked up once per pass, not once per box (a pass asks hundreds of times)
  const docks = () => (performance.now() - dockAt < 200 ? dockMemo : (dockAt = performance.now(), dockMemo = findDocks()));
  const findDocks = () => [...document.querySelectorAll('body *')].filter(d => { if (getComputedStyle(d).position !== 'fixed' || !shown(d)) return false; const q = d.getBoundingClientRect(); return q.left <= 0.5 && q.right >= innerWidth - 0.5 && q.bottom >= innerHeight - 0.5 && q.height < innerHeight / 2; });
  // the part of a box the eye can see: clipped by the window, by every scrolling / clipping ancestor, and by a dock
  function seen(e, r = e.getBoundingClientRect()) {
    let x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(innerWidth, r.right), y1 = Math.min(innerHeight, r.bottom);
    for (const d of docks()) if (!d.contains(e)) y1 = Math.min(y1, d.getBoundingClientRect().top);
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = a.getBoundingClientRect(); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom);
    }
    return x1 - x0 >= 1 && y1 - y0 >= 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  // a computed colour: rgb(a) in 0–255, or color(srgb r g b / a) in 0–1 (what color-mix() computes to): [r, g, b, a?] in 0–255
  const rgbOf = (c) => { const n = c.match(/[\d.]+/g).map(Number); return c.startsWith('color(') ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3]] : n; };
  const name = (e) => (e.getAttribute('aria-label') || e.textContent || e.title || e.placeholder || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const tag = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '');
  function controls() {
    const all = [...document.querySelectorAll(SEL)], laid = all.filter(shown), vis = laid.map(e => [e, seen(e)]).filter(([, r]) => r), box = all.filter(boxed);
    const inWin = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 0 && r.height > 0; };
    // drawn: every drawn control's whole box in page px, in view or not (RD-2's no-layout diff: the phone's controls
    // below the fold count too)
    // (a scrolling column's own scroll is added back: the place in its content, whatever the column shows)
    const page = (e) => { const r = e.getBoundingClientRect(); let x = r.x + scrollX, y = r.y + scrollY; for (let a = e.parentElement; a; a = a.parentElement) { x += a.scrollLeft; y += a.scrollTop; } return { el: tag(e), name: name(e), x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return { dom: all.length, total: laid.length, visible: vis.length, brief: { boxes: box.length, inWindow: box.filter(inWin).length }, list: vis.map(([e, r]) => ({ el: tag(e), name: name(e), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })), drawn: laid.map(page) };
  }
  // RD-2 the action words' 40 px hit area (DECISION "Outlined boxes vs hairlines"): a click 19.5 px above and below the
  // centre, at both ends and the middle, still lands on the button (only those in view: a probe needs the window)
  const ACTION_WORDS = ['btn-fill', 'btn-latch', 'btn-throw', 'btn-undo', 'btn-redo', 'btn-random', 'btn-jam', 'btn-share'];
  function hits() {
    return ACTION_WORDS.map(id => document.getElementById(id)).filter(e => e && shown(e) && seen(e)).map(e => {
      const r = e.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2, miss = [];
      const xs = r.width >= 40 ? [r.x + 2, cx, r.right - 2] : [cx - 19.5, cx, cx + 19.5];
      for (const y of [cy - 19.5, cy + 19.5]) for (const x of xs) { const h = document.elementFromPoint(x, y); if (!h || !e.contains(h)) miss.push([Math.round(x - r.x), Math.round(y - r.y), h ? tag(h) : null]); }
      return { el: tag(e), w: Math.round(r.width), h: Math.round(r.height), ok: !miss.length, miss };
    });
  }
  // RD-2 colour = sound (DECISION §1.6: lane colours are the only hues, red means recording): every drawn element's own
  // colours (its text, borders, background, box-shadow, an SVG mark's stroke / fill, a ::before / ::after) sorted by
  // hueKind; a stray hue anywhere, or record red off a recorder that records, is reported. The canvas is light, not a
  // control: left out (RD-8)
  const hueKind = ${hueKind};
  const RECORDING = '#btn-rec.armed, #btn-mic.armed, .jam-btn.on, .jam-panel, .console.rec-live';   // RD-5: the console's red top line, armed and playing
  function hues() {
    const root = getComputedStyle(document.documentElement), hex = (h) => [1, 3, 5].map(i => parseInt(h.trim().slice(i, i + 2), 16));
    const lanes = [...document.querySelectorAll('#legend li')].map(li => hex(li.style.getPropertyValue('--lane'))), rec = hex(root.getPropertyValue('--rec')), v = hex(root.getPropertyValue('--v'));
    const out = new Map(), check = (e, prop, css) => {
      for (const m of css.match(/rgba?\([^)]*\)|color\([^)]*\)/g) || []) {
        const c = rgbOf(m); if ((c[3] ?? 1) < 0.05) continue;
        const kind = hueKind(c.slice(0, 3), lanes, rec, v); if (kind === 'grey' || kind === 'lane' || (kind === 'rec' && e.closest(RECORDING))) continue;
        const rgb = c.slice(0, 3).map(Math.round); out.set(tag(e) + ' ' + prop + ' ' + rgb, { el: tag(e), prop, rgb, kind });
      }
    };
    for (const e of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'OPTION', 'CANVAS'].includes(e.tagName) || !shown(e)) continue;
      const s = getComputedStyle(e);
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) || [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) check(e, 'color', s.color);
      for (const k of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s['border' + k + 'Width']) > 0 && !/none|hidden/.test(s['border' + k + 'Style'])) check(e, 'border', s['border' + k + 'Color']);
      check(e, 'background', s.backgroundColor); if (s.boxShadow !== 'none') check(e, 'shadow', s.boxShadow);
      if (s.backgroundImage !== 'none') check(e, 'background-image', s.backgroundImage); if (s.textShadow !== 'none') check(e, 'text-shadow', s.textShadow);
      if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) check(e, 'outline', s.outlineColor);   // an "on" lamp's shape, a focus ring
      if (e instanceof SVGElement) { if (s.stroke !== 'none') check(e, 'stroke', s.stroke); if (s.fill !== 'none') check(e, 'fill', s.fill); }
      for (const pe of ['::before', '::after']) {
        const p = getComputedStyle(e, pe); if (p.content === 'none' || p.content === 'normal' || p.display === 'none') continue;
        if (/^["']\S|^attr\(/.test(p.content)) check(e, pe + ' color', p.color); check(e, pe + ' background', p.backgroundColor); if (p.boxShadow !== 'none') check(e, pe + ' shadow', p.boxShadow);
        for (const k of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(p['border' + k + 'Width']) > 0 && !/none|hidden/.test(p['border' + k + 'Style'])) check(e, pe + ' border', p['border' + k + 'Color']);
      }
    }
    return [...out.values()];
  }
  // RD-2 type: every drawn text's computed family, size and weight (an element's own text, a field's value, a
  // ::before / ::after with text), and whether it is the wordmark (h1)
  function types() {
    const out = [], fam = (s) => s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const run = (e, s, pseudo = '') => out.push({ el: tag(e) + pseudo, family: fam(s), size: parseFloat(s.fontSize), weight: +s.fontWeight || 400, mark: !!e.closest('h1') });
    for (const e of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'OPTION', 'CANVAS'].includes(e.tagName) || !shown(e)) continue;
      const field = /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !['checkbox', 'radio', 'range', 'color', 'file'].includes(e.type);
      if (field || [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) run(e, getComputedStyle(e));
      for (const pe of ['::before', '::after']) { const s = getComputedStyle(e, pe); if (/^["']\S|^attr\(/.test(s.content) && s.content !== '""' && s.display !== 'none') run(e, s, pe); }
    }
    return out;
  }
  function scroll() {
    const d = document.documentElement, inner = [];
    for (const e of document.querySelectorAll('body *')) {
      if (!shown(e) || e.scrollHeight <= e.clientHeight + 1) continue; const s = getComputedStyle(e);
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') inner.push({ el: tag(e), sheet: !!e.closest(${JSON.stringify(SHEET_SEL)}), scrollHeight: e.scrollHeight, clientHeight: e.clientHeight });
    }
    return { scrollHeight: d.scrollHeight, innerHeight, pageScrolls: d.scrollHeight > innerHeight, inner, clip: clipped() };
  }
  // RD-3: what a clipping column cuts off (wide windows: each column is one cell that hides its overflow, so a panel too
  // wide or too low is cut, not scrolled to): px out sideways and below; the sheet may sink into its body's bottom padding
  function clipped() {
    const out = [];
    for (const col of document.querySelectorAll('.hud, #col-left')) {
      if (!shown(col) || getComputedStyle(col).overflow === 'visible') continue; const c = col.getBoundingClientRect();
      for (const e of col.children) {
        if (!shown(e) || /^(fixed|absolute)$/.test(getComputedStyle(e).position)) continue; const r = e.getBoundingClientRect();
        const x = Math.max(0, c.left - r.left, r.right - c.right), y = Math.max(0, r.bottom - c.bottom), body = e.querySelector('#sheet-body');
        const pad = body && shown(body) ? parseFloat(getComputedStyle(body).paddingBottom) : 0;
        if (x > 1 || y > 1) out.push({ el: tag(e), x: Math.round(x), y: Math.round(y), pad, cut: x > 1 || y > pad + 1 });
      }
    }
    return out;
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
      if (field) {   // a field's text sits in its content box: its border (now a 3:1 edge) is not the text's background (RD-2)
        const q = e.getBoundingClientRect(), c = getComputedStyle(e), side = (k) => parseFloat(c['border' + k + 'Width']) + parseFloat(c['padding' + k]);
        box = { left: q.left + side('Left'), top: q.top + side('Top'), right: q.right - side('Right'), bottom: q.bottom - side('Bottom') };
      }
      else for (const n of nodes) { const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) box = box ? { left: Math.min(box.left, q.left), top: Math.min(box.top, q.top), right: Math.max(box.right, q.right), bottom: Math.max(box.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom }; }
      if (!box) continue; const r = seen(e, box); if (!r) continue;
      const s = getComputedStyle(e), m = rgbOf(s.color); let op = 1; for (let a = e; a; a = a.parentElement) op *= +getComputedStyle(a).opacity;
      if (op * (m[3] ?? 1) < 0.02) continue;   // text that is not drawn
      out.push({ el: tag(e), text: (field ? e.value || e.placeholder || '' : nodes.map(n => n.textContent).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 40), rgb: m.slice(0, 3), a: (m[3] ?? 1) * op, size: parseFloat(s.fontSize), weight: +s.fontWeight || 400, r });
    }
    return out;
  }
  async function image(b64) { const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height); }
  const px = (img, x, y) => { const i = (Math.round(y) * img.width + Math.round(x)) * 4, d = img.data; return [d[i], d[i + 1], d[i + 2]]; };
  function each(img, r, fn, inside = null, skip = null) {   // every pixel of rect r (and, with inside, not in that rect; skip(x, y): not those)
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(img.height, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(img.width, Math.ceil(r.x + r.w)); x++) {
      if (inside && x >= inside.x && x < inside.x + inside.w && y >= inside.y && y < inside.y + inside.h) continue; if (skip?.(x, y)) continue; fn(px(img, x, y));
    }
  }
  const grow = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
  // RD-3 the sheet: its tabs for the A6 / A7 states, and every pane at once (not a real state) where a pass must see every
  // control there is (everything shown, type, hue). A page from before the sheet has none: nothing to do
  const TABS = [...document.querySelectorAll('[role=tabpanel][data-sheet]')].map(p => p.dataset.sheet);
  function allPanes(on) { if (!window.__poly?.setSheet) return; if (on) { document.getElementById('sheet-body').hidden = false; document.querySelectorAll('[role=tabpanel][data-sheet]').forEach(p => { p.hidden = false; }); } else { const s = __poly.sheet; __poly.setSheet(s.tab, s.open); } }
  // RD-3 every control id of the RD-1 baseline: still in the page, and drawn once its sheet tab and drawers are open
  // (__poly.reveal: what the app itself does to show a control). The view, the sheet and the drawers come back after
  function reach(ids) {
    const s = window.__poly.sheet, view = __poly.quests.view, open = [...document.querySelectorAll('details')].map(d => d.open), out = [];
    __poly.setView('all');
    for (const id of ids) {
      const e = document.getElementById(id); if (!e) { out.push({ id, exists: false, drawn: false }); continue; }
      __poly.reveal?.(e); out.push({ id, exists: true, tab: e.closest('[role=tabpanel]')?.dataset.sheet || null, drawn: shown(e) });
    }
    if (s) __poly.setSheet(s.tab, s.open); __poly.setView(view); document.querySelectorAll('details').forEach((d, i) => { d.open = open[i]; });
    return out;
  }
  window.__fa = {
    controls, scroll, rings, types, hits, hues, reach, allPanes, tabs: TABS,
    hideText(on) { let s = document.getElementById('fa-hide'); if (!s) { s = document.createElement('style'); s.id = 'fa-hide'; document.head.append(s); } s.textContent = '*, *::before, *::after { transition: none !important; }' + (on ? ' *, *::before, *::after, *::placeholder, *::marker { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }' : ''); },
    async measure(bg64, full64) {
      const bg = await image(bg64), full = await image(full64), runs = texts(), text = [];
      for (const t of runs) {
        const rs = []; each(bg, t.r, ([r, g, b]) => { const L = lum(r, g, b), c = lum(...t.rgb.map((v, k) => v * t.a + [r, g, b][k] * (1 - t.a))); rs.push(ratio(c, L)); });
        if (rs.length) text.push({ el: t.el, text: t.text, size: t.size, weight: t.weight, contrast: Math.round(pct(rs, 10) * 100) / 100, x: Math.round(t.r.x), y: Math.round(t.r.y) });
      }
      const edges = [], light = []; let ctlMax = 0, ctlMaxAt = null;
      for (const e of [...document.querySelectorAll(SEL)].filter(shown)) {
        // the component whose edge counts: a drawer for its summary, the joined bar for a segment (its buttons share the
        // bar's line); a knob's arc box. No edge to judge (WCAG 1.4.11): a disabled control, and a text link without a
        // border (its edge is its text, judged by the text test)
        const box = e.tagName === 'SUMMARY' && e.parentElement?.tagName === 'DETAILS' ? e.parentElement : e.parentElement?.classList.contains('seg') ? e.parentElement : e, knob = e.classList.contains('gauge') ? e.querySelector('svg') : null;
        const cs = getComputedStyle(e), textLink = e.tagName === 'A' && !parseFloat(cs.borderTopWidth) && cs.boxShadow === 'none';
        const r = seen(box, (knob || box).getBoundingClientRect());
        if (r && r.w >= 4 && r.h >= 4 && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !textLink) {
          // a side cut off by the window or a scrolling column is not the control's edge: its band is left out (RD-2;
          // before, a drawer half scrolled away or a button peeking in at the bottom was judged by the cut)
          const fr = (knob || box).getBoundingClientRect(), cut = { l: r.x > fr.left + 0.5, t: r.y > fr.top + 0.5, r: r.x + r.w < fr.right - 0.5, b: r.y + r.h < fr.bottom - 0.5 };
          const skip = knob ? null : (x, y) => (cut.l && x < r.x + 3) || (cut.t && y < r.y + 3) || (cut.r && x >= r.x + r.w - 3) || (cut.b && y >= r.y + r.h - 3);
          const out = []; each(full, grow(r, 3), ([a, b, c]) => out.push(lum(a, b, c)), r, skip); const Lo = pct(out, 50) ?? 0;
          const inner = []; if (knob) each(full, r, ([a, b, c]) => inner.push(ratio(lum(a, b, c), Lo))); else each(full, r, ([a, b, c]) => inner.push(ratio(lum(a, b, c), Lo)), grow(r, -3), skip);
          if (inner.length && out.length) edges.push({ el: tag(e), name: name(e), edge: Math.round((pct(inner, knob ? 85 : 75) ?? 1) * 100) / 100, ...(Object.values(cut).some(Boolean) ? { cut: Object.keys(cut).filter(k => cut[k]).join('') } : {}) });
        }
        const cr = seen(e); if (!cr) continue; let mx = 0; each(full, cr, ([a, b, c]) => { const L = lum(a, b, c); if (L > mx) mx = L; });
        light.push({ el: tag(e), name: name(e), lum: Math.round(mx * 1000) / 1000 }); if (mx > ctlMax) { ctlMax = mx; ctlMaxAt = tag(e) + ' ' + name(e); }
      }
      return { text, edges, light, ctlMax: Math.round(ctlMax * 1000) / 1000, ctlMaxAt, canvasMax: this.canvasMax() };
    },
    canvasMax() { const cv = document.getElementById('cv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let mx = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; const L = lum(d[i], d[i + 1], d[i + 2]) * d[i + 3] / 255; if (L > mx) mx = L; } return Math.round(mx * 1000) / 1000; },
    // the canvas in one number (every 7th pixel hashed): pictures that differ while playing = the scene is drawing
    canvasSig() { const cv = document.getElementById('cv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 2166136261; for (let i = 0; i < d.length; i += 28) h = Math.imul(h ^ (d[i] | d[i + 1] << 8 | d[i + 2] << 16), 16777619); return h >>> 0; },
    // frame cost: every rAF callback timed (the scene asks for its next frame through the global each time); a frame runs
    // several (the scene, automation, Tone.Draw), most near 0 ms, so the callbacks are also summed per frame (by their
    // timestamp): frame is A9's frame time, interval the time between frames (callbacks of one frame have no gap)
    frames() { const raf = window.__faRaf ||= window.requestAnimationFrame.bind(window), cost = [], gap = [], per = new Map(); let last = 0; window.requestAnimationFrame = (cb) => raf((t) => { if (last) gap.push(t - last); last = t; const s = performance.now(); cb(t); const c = performance.now() - s; cost.push(c); per.set(t, (per.get(t) || 0) + c); }); return () => { window.requestAnimationFrame = raf; const ts = [...per.keys()].sort((a, b) => a - b); return { cost: pct(cost, 95), gap: pct(gap, 95), n: cost.length, frame: pct([...per.values()], 95), interval: pct(ts.slice(1).map((t, i) => t - ts[i]), 95), frames: ts.length }; }; },
    // A9 clock: a second Tone.Loop on the app loop's grid measures how late the scheduler calls back (audio time)
    lateness() { const T = window.Tone, raw = T.getContext().rawContext, late = []; const l = new T.Loop((time) => late.push((raw.currentTime - time) * 1000), (T.getTransport().PPQ / 24) + 'i').start(0); return () => { l.dispose(); return { p95: pct(late, 95), max: late.length ? Math.max(...late) : null, n: late.length }; }; },
  };
})()`;

async function settle(p, ms = 120) { await p.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))'); await p.sleep(ms); }
// a busy machine can take longer than open()'s 3.5 s to run the page's modules (and once took over 20 s): wait up to a
// minute, then say so, rather than measure a page that never started
async function ready(p) {
  for (let i = 0; i < 240; i++) { if (await p.eval('!!window.__poly && !window.__faOld')) return; await p.sleep(250); }
  throw new Error(`orbit2 did not start within a minute (page errors: ${p.errors.join(' | ') || 'none'})`);
}
async function shot64(p) { const { result } = await p.send('Page.captureScreenshot', { format: 'png' }); return result.data; }
const play = (p) => p.eval(`document.getElementById('btn-play').click()`);

/** One size: a fresh browser (a first visit), first load measured, then the states. */
export async function auditSize(size, { port = 5400, debugPort = 9400, path = 'orbit2/index.html', shots = null, playSec = 6, root, ids = null } = {}) {
  const [, w, h, m] = /^(\d+)x(\d+)(m?)$/.exec(size), mobile = !!m, b = await launch({ port, debugPort, ...(root ? { root } : {}) });
  try {
    const p = await b.open(path, { width: +w, height: +h, mobile }); await ready(p); await p.eval(PAGE); await p.eval('__fa.hideText(false)'); await settle(p, 400);
    const out = { size, errors: p.errors };
    out.controls = await p.eval('__fa.controls()'); const type0 = await p.eval('__fa.types()'), hue0 = await p.eval('__fa.hues()'); out.hits = await p.eval('__fa.hits()');
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
    // RD-3: each sheet tab open with every drawer in it open, the sheet closed, and what is on above the sheet (welcome,
    // quest, jam take: RD-7's pills) all shown at once; then back as it was
    const tabs = await p.eval('__fa.tabs');
    if (tabs.length) {
      await p.eval(`window.__faSheet = __poly.sheet; window.__faOpen = [...document.querySelectorAll('details')].map(d => d.open)`);
      for (const t of tabs) { await p.eval(`(() => { __poly.setSheet(${JSON.stringify(t)}, true); document.querySelectorAll('#pane-${t} details').forEach(d => { d.open = true; }); })()`); await state(`tab ${t}`); if (shots && t !== 'lane') await p.shot(join(shots, `${size}-tab-${t}.png`)); }
      await p.eval('__poly.setSheet(__faSheet.tab, false)'); await state('closed'); if (shots) await p.shot(join(shots, `${size}-sheet-closed.png`));
      await p.eval(`(() => { __poly.setSheet(__faSheet.tab, __faSheet.open); document.querySelectorAll('details').forEach((d, i) => { d.open = window.__faOpen[i]; }); window.__faPills = ['welcome', 'quest', 'jam-panel'].map(id => document.getElementById(id).hidden); ['welcome', 'quest', 'jam-panel'].forEach(id => { document.getElementById(id).hidden = false; }); })()`);
      await state('pills'); if (shots) await p.shot(join(shots, `${size}-pills.png`));
      await p.eval(`['welcome', 'quest', 'jam-panel'].forEach((id, i) => { document.getElementById(id).hidden = window.__faPills[i]; })`);
    }
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
    // everything shown (the "everything" view, every drawer open): its drawn controls, so the diff also sees a control
    // that left (or came into) a drawer; then back as it was
    // (RD-3: every sheet pane shown at once, so a control in another tab counts too)
    await p.eval(`(() => { window.__faSimple = document.body.classList.contains('simple'); __poly.setView('all'); window.__faOpen = [...document.querySelectorAll('details')].map(d => d.open); document.querySelectorAll('details').forEach(d => { d.open = true; }); __fa.allPanes(true); })()`); await settle(p, 250);
    out.controls.all = (await p.eval('__fa.controls()')).drawn;
    await p.eval(`(() => { __fa.allPanes(false); document.querySelectorAll('details').forEach((d, i) => { d.open = window.__faOpen[i]; }); if (window.__faSimple) __poly.setView('simple'); })()`); await settle(p);
    // A5 worst case today: 6 lanes
    await p.eval('__poly.setLaneCount(6)'); await settle(p, 250); out.controls6 = { visible: (await p.eval('__fa.controls()')).visible, scroll: await p.eval('__fa.scroll()') };
    // RD-2 type and hue: the first load and everything there is (the "everything" view, every drawer open, a step's lock
    // panel, the help dialog)
    await p.eval(`(() => { __poly.setView('all'); document.querySelectorAll('details').forEach(d => { d.open = true; }); __poly.editLocks(0); __fa.allPanes(true); __poly.openHelp(); })()`); await settle(p, 250);
    out.type = typeCheck([...type0, ...await p.eval('__fa.types()')]);
    const hues = new Map(); for (const h of [...hue0, ...await p.eval('__fa.hues()')]) hues.set(`${h.el} ${h.prop} ${h.rgb}`, h); out.hues = [...hues.values()];
    // RD-3: every control id of the RD-1 baseline still there and drawn once its tab is open
    await p.eval(`(() => { document.getElementById('help').close(); __fa.allPanes(false); })()`); await settle(p);
    if (ids?.length) out.reach = await p.eval(`__fa.reach(${JSON.stringify(ids)})`);
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
/**
 * fn with win's animation frames held: the callbacks asked for wait, and go to the real requestAnimationFrame after fn,
 * never dropped (the scene's loop asks for its next frame from inside each frame, so a frame never called back stops the
 * canvas for good, and the clock run after the render would measure a page that does not draw). Runs in the page
 * (serialized with toString): no outside names.
 */
export async function holdFrames(win, fn) {
  const raf = win.requestAnimationFrame, held = []; win.requestAnimationFrame = (cb) => { held.push(cb); return 0; };
  try { return await fn(); } finally { win.requestAnimationFrame = raf; for (const cb of held) raf.call(win, cb); }
}
const HOLD_FRAMES = `(${holdFrames})(window, async () => { __faSeed(${A9_RANDOM}); await __poly.exportWav(); })`;
async function seededRender(b, { path, engine, groove, seed }) {
  const p = await b.open(`${path}${path.includes('?') ? '&' : '?'}debug`, { width: 1512, height: 860 }); await ready(p);
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: SEEDED }); await p.eval('window.__faOld = 1'); await p.send('Page.reload', {}); await p.sleep(500); await ready(p);
  await p.eval(PAGE);
  await p.eval(`(async () => { await __poly.wake(); __poly.setEngine(${JSON.stringify(engine)}); if (${JSON.stringify(engine)} === 'dsp') await __poly.ensureDsp(); const d = __poly.dice; d.locked = true; d.seed = ${seed}; d.repeat = 1; __poly.loadGroove(${JSON.stringify(groove)}); })()`);
  await settle(p, 300); await p.captureDownloads();
  await p.eval(HOLD_FRAMES);
  return { p, file: (await p.downloads())[0] };
}
/** A9: a fixed seed and pattern rendered by exportWav on two fresh seeded pages per engine → SHA-256 (exact), how much
 *  the two differ (≤ 1 LSB is the null test), and the fingerprint; and the clock while playing with ?debug: Tone.Loop
 *  lateness, stress p95 and the audio headroom, frame time. */
export async function auditAudio({ port = 5400, debugPort = 9400, path = 'orbit2/index.html', groove = 'house', seed = 4127, playSec = 10, root } = {}) {
  const b = await launch({ port, debugPort, ...(root ? { root } : {}) });
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
        const head = await p.eval('__faHead.slice(5)');   // the headroom once it settled, while playing
        const late = await p.eval('window.__faLate()'), frames = await p.eval('window.__faStop()'), stress = await p.eval('(clearInterval(__faStressT), __faStress)');
        // still playing, after the measured window (a pixel read there would load it): a canvas that stopped drawing during
        // the render stays stopped, and its clock is not A9's (a dropped frame callback ended the scene's loop once)
        const sigs = []; for (let k = 0; k < 3; k++) { if (k) await p.sleep(400); sigs.push(await p.eval('__fa.canvasSig()')); }
        await play(p);   // stop
        out.clock = { seconds: playSec, latenessMs: { p95: r2(late.p95), max: r2(late.max), n: late.n }, stress: { p95: r2(pct(stress, 95)), max: r2(Math.max(...stress)) }, headroomMs: { p5: r2(pct(head, 5)), min: r2(Math.min(...head)) }, frameMs: { cost95: r2(frames.cost), gap95: r2(frames.gap), n: frames.n, frame95: r2(frames.frame), interval95: r2(frames.interval), frames: frames.frames }, drawing: { pictures: new Set(sigs).size, of: sigs.length } };
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
      const inner = sc.inner.filter(i => !i.sheet); if (inner.length) fails.push({ test: 'A6', size: k, what: `${st}: scrolls inside outside the sheet: ${inner.map(i => i.el).join(', ')}` });
      const cut = (sc.clip || []).filter(c => c.cut); if (cut.length) fails.push({ test: 'A6', size: k, what: `${st}: cut off by its column: ${cut.map(c => `${c.el} ${c.x} px sideways, ${c.y} px below`).join(', ')}` }); }
  }
  for (const k of t.a7Sizes) { const s = by[k]; if (!s) continue; const base = s.states.default?.rings;
    for (const [st, v] of Object.entries(s.states)) { const g = v.rings; if (base && (Math.round(g.cx) !== Math.round(base.cx) || Math.round(g.cy) !== Math.round(base.cy) || Math.round(g.outer) !== Math.round(base.outer))) fails.push({ test: 'A7', size: k, what: `${st}: rings at (${g.cx}, ${g.cy}) r ${g.outer}, default (${base.cx}, ${base.cy}) r ${base.outer}` }); }
  }
  for (const s of report.sizes) if (s.type?.fails.length) fails.push({ test: 'TYPE', size: s.size, what: `${s.type.fails.length} text kinds off the type rules: ${s.type.fails.slice(0, 4).map(f => f.what).join('; ')}` });
  for (const s of report.sizes) { const bad = (s.hits || []).filter(h => !h.ok); if (bad.length) fails.push({ test: 'HIT', size: s.size, what: `${bad.length} action words without a 40 px hit area: ${bad.map(h => `${h.el} ${h.w}×${h.h}`).join(', ')}` }); }
  for (const s of report.sizes) { const bad = (s.reach || []).filter(r => !r.exists || !r.drawn); if (bad.length) fails.push({ test: 'IDS', size: s.size, what: `${bad.length} RD-1 control ids ${bad.some(r => !r.exists) ? 'gone or ' : ''}not drawn with their tab open: ${bad.map(r => `${r.id}${r.exists ? ` (tab ${r.tab})` : ' (gone)'}`).join(', ')}` }); }
  for (const s of report.sizes) if (s.hues?.length) fails.push({ test: 'HUE', size: s.size, what: `${s.hues.length} colours that are no lane's, or red off a recording: ${s.hues.slice(0, 5).map(h => `${h.el} ${h.prop} rgb(${h.rgb}) ${h.kind}`).join('; ')}` });
  return fails;
}

export function summary(report) {
  const L = [];
  for (const s of report.sizes) {
    L.push(`## ${s.size}${s.errors.length ? ` · ${s.errors.length} page errors` : ''}`);
    L.push(`controls: ${s.controls.visible} visible / ${s.controls.total} drawn / ${s.controls.dom} in the DOM · 6 lanes: ${s.controls6?.visible} visible · the brief's count (boxes, closed drawers included): ${s.controls.brief.inWindow} in the window / ${s.controls.brief.boxes}`);
    L.push(`text: ${s.text.n} runs, min ${s.text.min}:1, ${s.text.fails.length} under ${THRESHOLDS.text}:1${s.text.fails.length ? ` (worst: ${s.text.fails.slice(0, 5).map(f => `${f.contrast} "${f.text}"`).join(', ')})` : ''}`);
    L.push(`edges: ${s.edges.n} controls, min ${s.edges.min}:1, ${s.edges.fails.length} under ${THRESHOLDS.edge}:1`);
    if (s.hues) L.push(`hues: ${s.hues.length ? `${s.hues.length} stray (${s.hues.slice(0, 4).map(h => `${h.el} ${h.prop} rgb(${h.rgb})`).join(', ')})` : 'lane hues and greys only, red only on a recording'}`);
    if (s.hits) L.push(`hit areas: ${s.hits.filter(h => h.ok).length} of ${s.hits.length} action words in view take 40 px${s.hits.some(h => !h.ok) ? ` (not: ${s.hits.filter(h => !h.ok).map(h => h.el).join(', ')})` : ''}`);
    if (s.reach) { const by = {}; for (const r of s.reach) by[r.tab || 'face'] = (by[r.tab || 'face'] || 0) + 1; L.push(`RD-1 control ids: ${s.reach.filter(r => r.exists && r.drawn).length} of ${s.reach.length} drawn with their tab open (${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')})`); }
    if (s.type) L.push(`type: ${s.type.n} runs · ${Object.entries(s.type.sizes).map(([k, n]) => `${k} ×${n}`).join(', ')} · weights ${Object.entries(s.type.weights).map(([k, n]) => `${k} ×${n}`).join(', ')}${s.type.fails.length ? ` · ${s.type.fails.length} off the rules` : ''}`);
    for (const st of ['stopped', 'playing']) { const l = s.light[st]; if (l) L.push(`light ${st}: brightest control ${l.controlMax} (${l.controlMaxAt}) · brightest canvas ${l.canvasMax}${l.over ? ` · ${l.over.length} controls over ${THRESHOLDS.controlLum}` : ''}`); }
    for (const [st, v] of Object.entries(s.states)) L.push(`${st.padEnd(8)} scroll ${v.scroll.scrollHeight}/${v.scroll.innerHeight}${v.scroll.inner.length ? ` (inside: ${v.scroll.inner.map(i => `${i.el} ${i.scrollHeight}/${i.clientHeight}`).join(', ')})` : ''}${v.scroll.clip?.length ? ` (past its column: ${v.scroll.clip.map(c => `${c.el} ${c.x}/${c.y} px${c.cut ? ' CUT' : ''}`).join(', ')})` : ''} · rings (${v.rings.cx}, ${v.rings.cy}) outer r ${v.rings.outer} (⌀ ${v.rings.diameter})`);
    L.push(`frames while playing: per frame p95 ${r2(s.frames.frame)} ms, frame interval p95 ${r2(s.frames.interval)} ms (${s.frames.frames} frames) · callback p95 ${r2(s.frames.cost)} ms, gap p95 ${r2(s.frames.gap)} ms (${s.frames.n} callbacks)`, '');
  }
  if (report.audio) { const a = report.audio; L.push(`## audio (A9) · groove ${a.groove}, dice ${a.seed}, Math.random seeded ${a.random}, render #1 of two fresh pages per engine`); for (const [e, r] of Object.entries(a.renders)) L.push(`exportWav ${e}: sha256 ${r.sha256} (${r.bytes} bytes; ${r.identical ? 'the second page renders it identically' : `the second page differs in ${r.renderDiff.samples} samples, up to ${r.renderDiff.maxLsb} LSB, from ${r.renderDiff.firstSec} s`}: null test ${r.nullTest ? 'pass' : 'FAIL'}) · fingerprint ${r.fingerprint.hash}${r.fingerprintAgain.hash === r.fingerprint.hash ? ' (same on the second page)' : ` (second page: ${r.fingerprintAgain.hash})`}`); if (a.clock) { const dr = a.clock.drawing; L.push(`clock (${a.clock.seconds} s, synth): Tone.Loop lateness p95 ${a.clock.latenessMs.p95} ms (max ${a.clock.latenessMs.max}) · stress p95 ${a.clock.stress.p95} · headroom p5 ${a.clock.headroomMs?.p5} ms (min ${a.clock.headroomMs?.min}) · frame time p95 ${a.clock.frameMs.frame95} ms, frame interval p95 ${a.clock.frameMs.interval95} ms (${a.clock.frameMs.frames} frames) · callback p95 ${a.clock.frameMs.cost95} ms (${a.clock.frameMs.n} callbacks) · canvas ${dr.pictures > 1 ? `drawing (${dr.pictures} different pictures in ${dr.of})` : 'NOT DRAWING: this clock is not A9\'s'}`); } L.push(''); }
  const v = report.verdicts; L.push(v.length ? `## thresholds: ${v.length} failing\n${v.map(f => `- ${f.test} ${f.size}: ${f.what}`).join('\n')}` : '## thresholds: all pass');
  return L.join('\n');
}

/** RD-2's "no layout change": every control at first load matched to the baseline's (same element and name, the nth of
 *  its kind), its centre compared. Every drawn control in page px when both sides have it (`drawn`: the phone's below
 *  the fold too), else the ones in view (`list`). `base` is a report or `{ sizes: [{ size, controls: { list, drawn } }] }`
 *  (docs/redesign/baseline/rd01-controls.json). A control in only one of the two is listed (gone / new), not guessed at;
 *  the CLI fails --assert on it like on a move. */
export function positionDiff(base, report, tol = 2) {
  // a control with an id is itself (its name may be a value: a random seed); the others go by element, name and order
  const key = (c, seen) => { const k = c.el.includes('#') ? c.el : c.el + '|' + c.name; const n = seen.get(k) || 0; seen.set(k, n + 1); return k + '|' + n; };
  const index = (list) => { const seen = new Map(), m = new Map(); for (const c of list) m.set(key(c, seen), c); return m; };
  const cmp = (wasList, nowList) => {
    const was = index(wasList), now = index(nowList), moved = [], gone = [], added = [];
    for (const [k, c] of now) {
      const o = was.get(k); if (!o) { added.push(k); continue; }
      const dx = (c.x + c.w / 2) - (o.x + o.w / 2), dy = (c.y + c.h / 2) - (o.y + o.h / 2), dw = c.w - o.w, dh = c.h - o.h;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > tol) moved.push({ k, dx, dy, dw, dh });
    }
    for (const k of was.keys()) if (!now.has(k)) gone.push(k);
    return { n: now.size, moved, gone, added, max: moved.reduce((a, m) => Math.max(a, Math.abs(m.dx), Math.abs(m.dy)), 0) };
  };
  return report.sizes.map(s => {
    const b = base.sizes.find(x => x.size === s.size); if (!b) return { size: s.size, missing: true };
    const basis = b.controls.drawn && s.controls.drawn ? 'drawn' : 'visible', pick = (c) => basis === 'drawn' ? c.drawn : c.list;
    // everything shown: every control still there (gone / new fail); its moves are listed, the gate is the first load
    const all = b.controls.all && s.controls.all ? cmp(b.controls.all, s.controls.all) : null;
    return { size: s.size, basis, ...cmp(pick(b.controls), pick(s.controls)), all };
  });
}
const moves = (s) => `${s.moved.length} moved > 2 px${s.moved.length ? ` (max ${Math.round(s.max * 10) / 10} px: ${s.moved.slice(0, 6).map(m => `${m.k.split('|').slice(0, 2).join(' ')} ${Math.round(m.dx * 10) / 10},${Math.round(m.dy * 10) / 10}`).join('; ')})` : ''}${s.gone.length ? ` · gone: ${s.gone.join(', ')}` : ''}${s.added.length ? ` · new: ${s.added.join(', ')}` : ''}`;
export const diffSummary = (d) => d.map(s => s.missing ? `${s.size}: not in the baseline` : `${s.size}: ${s.n} controls (${s.basis}), ${moves(s)}${s.all ? `\n  everything shown: ${s.all.n} controls, ${moves(s.all)}` : ''}`).join('\n');
/** RD-3: every control id in a baseline report (docs/redesign/baseline/rd01-controls.json: each size's first load, its
 *  drawn controls and everything shown), once each, in page order of the first size that has it. */
export function baselineIds(base) {
  const ids = new Set();
  for (const s of base.sizes) for (const k of ['all', 'drawn', 'list']) for (const c of s.controls[k] || []) { const i = c.el.indexOf('#'); if (i >= 0) ids.add(c.el.slice(i + 1)); }
  return [...ids];
}
/** The diff fails --assert on a control that moved at first load, and on one that is gone or new there or with
 *  everything shown (a control that left the page, or came into it, changed the layout too). */
export const layoutChanged = (d) => d.some(s => s.missing || s.moved?.length || s.gone?.length || s.added?.length || s.all?.gone.length || s.all?.added.length);   // a size the baseline lacks cannot pass

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; }, has = (k) => process.argv.includes(k);
  // --root: audit another checkout with this tool (e.g. a `git archive` of the phase start, for a baseline)
  const opt = { port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400), path: arg('--path', 'orbit2/index.html'), shots: arg('--shots', null), playSec: +arg('--play', 6), root: arg('--root', undefined) };
  // RD-3: the control ids to find (IDS): the RD-1 baseline's by default, another report with --ids, none with --ids none
  { const f = arg('--ids', new URL('../docs/redesign/baseline/rd01-controls.json', import.meta.url).pathname); if (f !== 'none') { const { readFileSync } = await import('node:fs'); opt.ids = baselineIds(JSON.parse(readFileSync(f, 'utf8'))); } }
  const sizes = arg('--sizes', '1512x860,1512x982,1280x720,390x844m').split(',').filter(s => s && s !== 'none');   // none: --audio only
  const report = { date: new Date().toISOString(), path: opt.path, sizes: [] };
  for (const s of sizes) report.sizes.push(await auditSize(s, opt));
  if (has('--audio')) report.audio = await auditAudio(opt);
  report.verdicts = verdicts(report);
  if (arg('--tests', null)) { const only = arg('--tests').split(','); report.verdicts = report.verdicts.filter(v => only.includes(v.test)); }   // a phase asserts its own gates (RD-2: A1, TYPE)
  if (arg('--json', null)) writeFileSync(arg('--json'), JSON.stringify(report, null, 1));
  console.log(summary(report));
  let layoutMoved = false;
  if (arg('--diff', null)) { const { readFileSync } = await import('node:fs'); const d = positionDiff(JSON.parse(readFileSync(arg('--diff'), 'utf8')), report); console.log(`\n## positions vs ${arg('--diff')}\n${diffSummary(d)}`); layoutMoved = layoutChanged(d); }
  const errs = report.sizes.flatMap(s => s.errors).concat(report.audio?.errors || []), frozen = report.audio?.clock?.drawing.pictures < 2;
  if (errs.length) { console.error(`page errors: ${errs.join(' | ')}`); process.exitCode = 2; }
  else if (frozen) { console.error('the A9 clock ran on a canvas that did not draw: not a measurement'); process.exitCode = 2; }
  else if (has('--assert') && (report.verdicts.length || layoutMoved)) process.exitCode = 1;   // page errors stay 2: they say more
}
