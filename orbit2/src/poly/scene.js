// Orbits visuals: a small solar system per pattern. Canvas 2D only, additive glow from pre-rendered
// sprites (no shadowBlur), so it stays cheap. Capped at 60 fps, and it stops drawing once stopped and settled. The app feeds it step events; the scene animates
// everything else (comet playheads, shockwaves, particles, beams, the core, the cycle bloom).

import { frameLoop } from '../frames.js';
import { MAX_LANES, MAX_STEPS, condParts, condPasses } from './lanes.js';

const TAU = Math.PI * 2;
const MUTED = '#8b84a8';
const CAPTION_FONT = '13px "Space Grotesk", system-ui, sans-serif';   // RD-2: Major Mono is the wordmark's alone; 13 px = the body size
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

/**
 * "aligns in N bars" for master tick `tick` (fractional: the tick being heard) of a `cycle`-tick machine; the last two
 * bars count in beats, so "2 bars" never stands for 5 beats. '' when the whole cycle fits in one bar (it aligns every
 * bar: nothing to wait for). bar / beat in ticks.
 */
export function alignText(tick, cycle, bar = 96, beat = 24) {
  if (!(cycle > bar)) return ''; const left = cycle - (((tick % cycle) + cycle) % cycle);
  const [n, unit] = left > 2 * bar ? [Math.ceil(left / bar), 'bar'] : [Math.ceil(left / beat), 'beat'];
  return `aligns in ${n} ${unit}${n > 1 ? 's' : ''}`;
}

/** V6: how long the ring of a missed step (it came round and stayed silent: the ghost flash) shows (ms). */
export const MISS_MS = 450;
/** V6: a planet's opacity for a chance of playing `p` (0..1): 100 % is solid, 0 % still a faint dot you can find. */
export const planetAlpha = (p) => 0.2 + 0.8 * Math.max(0, Math.min(1, +p || 0));
/** V6: the arcs round an a:b step, one per loop of b from 12 o'clock, or null for any other condition. plays: the loop
 *  it plays on (condPasses' own rule); here: the loop the lane is on now (`loop` of its latest step, null when stopped). */
export function condArcs(cond, loop) {
  const ab = condParts(cond); if (!ab) return null;
  return Array.from({ length: ab.b }, (_, k) => ({ plays: condPasses(cond, k), here: loop != null && loop % ab.b === k }));
}
/** V6: where master tick `tick` is inside a `cycle`-tick machine, 0..1 (the outer cycle arc). */
export const cyclePos = (tick, cycle) => (cycle > 0 ? (((tick % cycle) + cycle) % cycle) / cycle : 0);

// ---- I1 playing on the canvas: pure geometry, so the gestures can be tested without a page ----
/** I1: the angle of (dx, dy) from the centre as the rings count it: 0 at 12 o'clock, growing clockwise, 0..2π. */
export const ringAngle = (dx, dy) => { const a = Math.atan2(dy, dx) + Math.PI / 2; return ((a % TAU) + TAU) % TAU; };
/** I1: the visible step of a `len`-step ring whose mark is nearest to the point (dx, dy) from the centre (the one the
 *  finger is on). A mark is the step's tick, or, for a planet with a nudge (`nudge(i)`: G1, a fraction of a step), the
 *  place the planet is drawn, so a nudged planet is played where you see it. */
export function stepAtAngle(dx, dy, len, nudge = null) {
  const p = (ringAngle(dx, dy) / TAU) * len; if (!nudge) return Math.round(p) % len;
  let best = 0, gap = Infinity;
  for (let i = 0; i < len; i++) { const d = (((p - i - nudge(i)) % len) + len) % len, e = Math.min(d, len - d); if (e < gap) { gap = e; best = i; } }
  return best;
}
/** I1 / G1: how far off its tick lane step i's planet is drawn (its nudge lock, in steps); 0 for an empty step. */
export const planetNudge = (lane, i) => (lane.hitAt(i) && lane.lockAt(i)?.nudge) || 0;
/** I1: the ring at `d` px from the centre of geometry g (ringGeo): its lane, or -1 beyond half a gap from every ring. */
export function laneAtRadius(g, d) {   // | 0: just inside ring 0 rounds to −0
  const li = Math.round((d / g.R - 0.25) / g.gap) | 0; return li >= 0 && li < g.lanes && Math.abs(d - g.ring(li)) <= (g.gap * g.R) / 2 ? li : -1;
}
/** I1: the shortest signed turn from angle a0 to a1 (radians, −π..π), so a drag across 12 o'clock doesn't jump a turn. */
export const angleDelta = (a0, a1) => { const d = (((a1 - a0) % TAU) + TAU) % TAU; return d > Math.PI ? d - TAU : d; };
/** I1: the rotation after turning a `len`-step ring by `turn` radians (clockwise > 0) from rotation rot0: whole steps. */
export const turnRotation = (rot0, turn, len) => ((((rot0 + Math.round((turn / TAU) * len)) % len) + len) % len);
/** I1: how far a move of (mx, my) px goes outward (inward < 0) along the line from the centre through (dx, dy), where
 *  the drag started: a pull that crosses the centre keeps shortening the ring instead of growing it again. */
export const outward = (dx, dy, mx, my) => (mx * dx + my * dy) / (Math.hypot(dx, dy) || 1);
/** I1: the length after pulling a ring `dr` px outward (in < 0), a step every `stepPx`; 1..max. */
export const pullLength = (len0, dr, stepPx, max = MAX_STEPS) => Math.max(1, Math.min(max, len0 + Math.round(dr / Math.max(1, stepPx))));
/** I1: the length after a pinch that scaled the fingers' distance by `s` (2 = twice as far apart); 1..max. */
export const pinchLength = (len0, s, max = MAX_STEPS) => Math.max(1, Math.min(max, Math.round(len0 * (s > 0 ? s : 1))));
/** I1: which way a drag of (mx, my) px that started at (dx, dy) from the centre goes: 'turn' along the ring, 'pull'
 *  across it (toward or away from the centre). */
export const dragKind = (dx, dy, mx, my) => { const along = Math.abs((my * dx - mx * dy) / (Math.hypot(dx, dy) || 1)); return Math.abs(outward(dx, dy, mx, my)) > along ? 'pull' : 'turn'; };

/**
 * Where the rings go on a W × H canvas: centre, R, ring(li) = radius of lane li (the outer one is 0.85 R). On phones the
 * canvas is a square stage under the header (CSS), not the viewport: centre the system and use more of it. A stage set
 * by the app ({ x, y, w, h }: the free box between the panels on a wide window) wins: the outer ring and its glow fit
 * inside it with a margin (0.1 R), so no panel covers them.
 */
export function ringGeo(W, H, stage = null, lanes = 4) {
  // L2: the rings always span 0.25–0.85 R; 6 lanes sit closer (0.12 R apart instead of 0.2), so the system keeps its size
  const gap = 0.6 / Math.max(1, lanes - 1), ring = (R) => (li) => R * (0.25 + li * gap), out = (o) => ({ ...o, gap, lanes, ring: ring(o.R), outer: ring(o.R)(lanes - 1) });
  if (stage) { const R = Math.min(stage.w, stage.h) / 2 / 0.95; return out({ cx: stage.x + stage.w / 2, cy: stage.y + stage.h / 2, R }); }
  const narrow = W < 700, R = Math.min(W, H) * (narrow ? 0.44 : 0.42); return out({ cx: W * 0.5, cy: H * (narrow ? 0.5 : 0.56), R });
}

/**
 * RD-3 the rings' box from the stage cell alone (client px { x, y, w, h }, the grid's middle cell above the console) and
 * the window width: nothing that opens, closes or wraps around the cell can move them (DECISION A7). The outer ring is
 * D across: 12 % of a tall stage stays free (Greta: 630 px in the 716 px stage at 1512×860), never less than 630 when
 * the cell has room, always 38 px clear of the columns and 12 px of the console and the top (568 px at 1280×720).
 * Centred on the window when that ring fits there 12 px clear of both columns (x 756 at 1512×860), else in the cell
 * (x 578 at 1280×720). Returns the square box ringGeo() sizes the rings by (outer ring = 0.85 R, R = side / 2 / 0.95).
 */
export function ringBox(cell, winW, min = 120) {
  const D = Math.round(Math.max(min, Math.min(cell.w - 76, cell.h - 24, Math.max(630, 0.88 * cell.h))));
  const mid = winW / 2, cx = mid - D / 2 - 12 >= cell.x && mid + D / 2 + 12 <= cell.x + cell.w ? mid : cell.x + cell.w / 2;
  const side = D * 0.95 / 0.85;
  return { x: cx - side / 2, y: cell.y + cell.h / 2 - side / 2, w: side, h: side };
}

// ---- RD-6 the ring answers the hand (Rio's idea, merged with Yuki's touched knob on the ring): while a knob is touched
// or dragged, and HAND_MS after, the selected ring shows what the change did. Read-only light: nothing here is clickable,
// and the hit test (locate) keeps the steps where they are. Pure helpers, so the rules are tested without a canvas ----
export const HAND_MS = 400, SLIDE_MS = 160, SPREAD_MS = 320, GROW_MS = 520;
/** What a knob's key makes the ring show: slide (shift), spread (hits), swing (the off-beat ticks), chance (the planets
 *  dimmed, an arc each), push (the ring leads or lags), grow (a longer loop's new ticks pulse); null: nothing. */
export const HAND_LOOK = { rotation: 'slide', euclid: 'spread', swing: 'swing', prob: 'chance', 'lock:prob': 'chance', offset: 'push', length: 'grow' };
export const handLook = (k) => HAND_LOOK[k] ?? null;
/** The shortest way round a `len`-step ring from rotation a to b, in steps (signed: + = clockwise). */
export const shortSteps = (a, b, len) => { const d = ((((b - a) % len) + len) % len); return d > len / 2 ? d - len : d; };
/** How far (steps) a push (− ms = early, + ms = late) moves a ring whose steps last `stepMs`: + = it lags (clockwise). */
export const pushSteps = (offsetMs, stepMs) => (stepMs > 0 ? offsetMs / stepMs : 0);
/** The steps a length change from `a` to `b` adds (they pulse once); none when it got shorter. */
export const newTicks = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);
/** Ease out (cubic): a slide starts fast and settles. */
const easeOut = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;

/** Soft round glow, white-hot centre fading to the colour: drawn with 'lighter' it reads as light. */
function glowSprite(hex, size = 96) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.12, rgba(hex, 0.9)); grad.addColorStop(0.35, rgba(hex, 0.28)); grad.addColorStop(1, rgba(hex, 0));
  g.fillStyle = grad; g.fillRect(0, 0, size, size); return c;
}

/**
 * @param {HTMLCanvasElement} cv
 * @param {{ machine: () => any, laneHex: string[], isPlaying: () => boolean, isBusy: () => boolean,
 *           stepMs: (lane) => number }} o
 *   isBusy: the app wants frames (playing, or something just changed); the scene adds its own live effects.
 */
export function createScene(cv, o) {
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, DPR = 1, bg = null, stars = [];
  const sprites = new Map(); const sprite = (hex) => { if (!sprites.has(hex)) sprites.set(hex, glowSprite(hex)); return sprites.get(hex); };
  const white = glowSprite('#ece9f7');
  const last = [];        // per lane: { index, t } of the latest step, for the smooth playhead
  const energy = new Array(MAX_LANES).fill(0), flash = new Map();   // energy per lane (decays), flash per "lane:index"
  const misses = new Map();   // V6: "lane:index" → { t, why } of a step that came round and stayed silent (prob / cond / dice)
  const waves = [], sparks = [], beams = [], blooms = [], recent = [];
  let shake = 0, quality = 1, avgDt = 16, prev = performance.now(), lastAlign = 0;
  // RD-6: the hand on a knob { li, k, until } (until = Infinity while held); what its lane was when it came (rotation,
  // length, hits) and the answers still fading: slides { d, t }, spreads and grows { t, ticks }, per lane
  let hand = null, answered = false; const was = [], slides = [], spreads = [], grows = [];
  const snap = (l) => ({ rot: l.rotation, len: l.length, k: l.euclidK, hits: l.hits.slice(0, l.length).join() });
  /** The app: a knob with key k on lane li is touched or dragged (null: let go; the answer stays HAND_MS). */
  function setHand(h) {
    const now = performance.now();
    if (h) { const l = o.machine().lanes[h.li]; if (!hand || hand.li !== h.li || hand.until < now) { if (l) was[h.li] = snap(l); } hand = { li: h.li, k: h.k, until: Infinity }; }
    else if (hand && hand.until === Infinity) hand.until = now + HAND_MS;
  }

  let stage = null;
  const geo = () => ringGeo(W, H, stage, o.machine().lanes.length);
  /** s: { x, y, w, h } in client px, or null for the whole canvas. */
  function setStage(s) {
    const b = cv.getBoundingClientRect(), n = s && { x: Math.round(s.x - b.left), y: Math.round(s.y - b.top), w: Math.round(s.w), h: Math.round(s.h) };
    if (JSON.stringify(n) === JSON.stringify(stage)) return; stage = n; backdrop();   // same canvas: only the nebulae follow the rings
  }
  const nodeXY = (g, li, i, len) => { const a = (i / len) * TAU - Math.PI / 2, r = g.ring(li); return [g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r, a]; };

  function resize() {
    DPR = Math.min(1.75, devicePixelRatio || 1); W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;   // the canvas box, which CSS sizes
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const n = Math.round(Math.min(320, W * H / 5200));   // stars turn around the rings' centre, so a new stage keeps them
    stars = Array.from({ length: n }, () => ({ a: Math.random() * TAU, d: Math.sqrt(Math.random()) * Math.hypot(W, H) * 0.62, s: 0.3 + Math.random() ** 3 * 1.6, tw: Math.random() * TAU, sp: 0.4 + Math.random() * 1.6 }));
    backdrop();
  }
  // static backdrop: void gradient + two nebulae around the rings, rendered once per size and stage
  function backdrop() {
    if (!bg || bg.width !== cv.width || bg.height !== cv.height) { bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height; }
    const b = bg.getContext('2d'); b.setTransform(DPR, 0, 0, DPR, 0, 0);
    const { cx, cy, R } = geo();
    let gr = b.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75); gr.addColorStop(0, '#1a1236'); gr.addColorStop(0.5, '#0e0a20'); gr.addColorStop(1, '#050208');
    b.fillStyle = gr; b.fillRect(0, 0, W, H);   // opaque: covers the previous stage's backdrop
    for (const [x, y, rad, hex, a] of [[W * 0.18, H * 0.78, R * 1.3, '#67e8f9', 0.07], [W * 0.82, H * 0.25, R * 1.4, '#a78bfa', 0.1], [W * 0.62, H * 0.9, R, '#f0abfc', 0.05]]) {
      gr = b.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(1, rgba(hex, 0)); b.fillStyle = gr; b.fillRect(0, 0, W, H);
    }
  }
  addEventListener('resize', resize); new ResizeObserver(() => { if (cv.clientWidth !== W || cv.clientHeight !== H) resize(); }).observe(cv); resize();

  /** Called by the app for every lane step, at the moment it sounds. */
  function onStep(ev) {
    if (!o.machine().lanes[ev.lane]) return;   // a step drawn after its lane went (6 → 4 lanes while playing)
    const now = performance.now(); last[ev.lane] = { index: ev.index, t: now, loop: ev.loop };
    recent.push({ lane: ev.lane, index: ev.index, t: now }); while (recent.length > 16) recent.shift();
    if (ev.hit) burst(ev.lane, ev.index, ev.accent, now);
    else if (ev.miss) misses.set(`${ev.lane}:${ev.index}`, { t: now, why: ev.miss });
  }
  /** Light up a planet without moving the playhead (live-recorded hits). */
  function flashHit(li, index, accent) { burst(li, index, accent, performance.now()); }
  function burst(li, index, accent, now) {
    const ev = { lane: li, index, accent };
    const m = o.machine(), lane = m.lanes[ev.lane]; if (!lane) return;
    const g = geo(), [x, y, a] = nodeXY(g, ev.lane, ev.index + planetNudge(lane, ev.index), lane.length), hex = o.laneHex[ev.lane];   // from the planet, where it is drawn
    energy[ev.lane] = Math.min(1.6, energy[ev.lane] + (ev.accent ? 1 : 0.65)); flash.set(`${ev.lane}:${ev.index}`, now);
    waves.push({ x, y, hex, t: now, big: ev.accent });
    const n = Math.round((ev.accent ? 18 : 9) * quality * (reduced ? 0.4 : 1));
    for (let k = 0; k < n; k++) {   // sparks fly outward from the orbit, with a little tangential spin
      const dir = a + (Math.random() - 0.5) * 1.6, v = (ev.accent ? 160 : 90) * (0.4 + Math.random());
      sparks.push({ x, y, vx: Math.cos(dir) * v - Math.sin(a) * v * 0.4, vy: Math.sin(dir) * v + Math.cos(a) * v * 0.4, t: now, life: 450 + Math.random() * 500, hex, s: 0.6 + Math.random() * 1.4 });
    }
    if (sparks.length > 500) sparks.splice(0, sparks.length - 500);
    // conjunction: hits on different lanes landing together get a beam of light between them
    for (const w of waves) if (w !== waves[waves.length - 1] && now - w.t < 28 && w.hex !== hex) beams.push({ x1: w.x, y1: w.y, x2: x, y2: y, h1: w.hex, h2: hex, t: now });
    if (ev.lane === 0 && ev.accent && !reduced) shake = Math.min(6, shake + 3.5);
  }
  /** The app calls this when the master clock reaches a full cycle (Machine.cycleTicks, conditions and dice included). */
  function bloom() { const now = performance.now(); if (now - lastAlign < 400) return; lastAlign = now; blooms.push({ t: now }); }

  /** Which ring is under client point (x, y)? -1 if none (the same rings the gestures find). */
  function pick(x, y) { return locate(x, y).lane; }
  /** I1: what is under client point (x, y): { dx, dy } from the centre, its lane (-1 off the rings), that lane's
   *  visible step whose mark is nearest (a planet where it is drawn) and how far (px) the point is from that mark, plus
   *  the geometry (for pull distances). */
  function locate(x, y) {
    const b = cv.getBoundingClientRect(), g = geo(), dx = x - b.left - g.cx, dy = y - b.top - g.cy, li = laneAtRadius(g, Math.hypot(dx, dy)), lane = o.machine().lanes[li];
    if (!lane) return { dx, dy, g, lane: -1, step: -1, off: Infinity };
    const nd = (i) => planetNudge(lane, i), step = stepAtAngle(dx, dy, lane.length, nd), [tx, ty] = nodeXY(g, li, step + nd(step), lane.length);
    return { dx, dy, g, lane: li, step, off: Math.hypot(dx + g.cx - tx, dy + g.cy - ty) };
  }
  /** I1: client position of lane li's visible step i, its planet where it is drawn (tests and tools aim with it). */
  function stepXY(li, i) { const b = cv.getBoundingClientRect(), g = geo(), lane = o.machine().lanes[li], [x, y] = nodeXY(g, li, i + (lane ? planetNudge(lane, i) : 0), lane?.length || 1); return { x: x + b.left, y: y + b.top }; }

  function frame(now) {
    // stopped and nothing fading out: leave the last frame on screen (idle CPU ~0)
    // RD-6: a hand on a knob, a held step, an answer fading, or the frame after the last one (to clear it) keeps drawing
    const held = o.held?.() || [];
    if (!o.isBusy() && !o.isRecording?.() && o.jamProgress?.() == null && !waves.length && !sparks.length && !beams.length && !blooms.length && !misses.size && energy.every(e => e < 0.01) && !hand && !held.length && !answered && !slides.some(Boolean) && !spreads.some(Boolean) && !grows.some(Boolean)) { prev = now; return; }
    const dt = Math.min(64, now - prev); prev = now; avgDt += (dt - avgDt) * 0.05;
    quality = avgDt > 26 ? 0.35 : avgDt > 20 ? 0.7 : 1;    // shed particles/stars when the machine struggles
    const m = o.machine(), g = geo(), playing = o.isPlaying(), sel = m.selected;
    if (hand && now >= hand.until) hand = null;
    answered = held.length > 0 || !!hand;
    for (let i = 0; i < energy.length; i++) energy[i] *= Math.pow(0.04, dt / 1000);   // ~0.6 s fall-off
    shake *= Math.pow(0.002, dt / 1000);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0, W, H);
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0; ctx.translate(sx, sy);

    // stars: the whole field turns very slowly around the core, twinkling; the kick makes them flare
    ctx.globalCompositeOperation = 'lighter';
    const rot = reduced ? 0 : now * 0.000012, kickE = energy[0];
    const sn = Math.round(stars.length * quality);
    for (let i = 0; i < sn; i++) {
      const s = stars[i], a = s.a + rot * s.sp, x = g.cx + Math.cos(a) * s.d, y = g.cy + Math.sin(a) * s.d * 0.9;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 0.001 * s.sp + s.tw));
      ctx.globalAlpha = Math.min(1, tw * (0.5 + kickE * 0.3)); ctx.fillStyle = '#ece9f7'; ctx.fillRect(x, y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // the core: a breathing sun fed by every lane's energy, tinted by the kick
    const tot = energy.reduce((a, b) => a + b, 0), coreR = g.R * (0.11 + kickE * 0.05 + tot * 0.01);
    ctx.globalAlpha = 0.35 + Math.min(0.65, tot * 0.25); ctx.drawImage(sprite(o.laneHex[0]), g.cx - coreR * 2, g.cy - coreR * 2, coreR * 4, coreR * 4);
    ctx.globalAlpha = 0.25 + energy[3] * 0.3; ctx.drawImage(sprite(o.laneHex[3]), g.cx - coreR * 3, g.cy - coreR * 3, coreR * 6, coreR * 6);
    ctx.globalAlpha = 1;
    // cycle bloom: when every lane lines up, a chromatic shockwave leaves the core
    for (let i = blooms.length - 1; i >= 0; i--) {
      const age = (now - blooms[i].t) / 1600; if (age > 1) { blooms.splice(i, 1); continue; }
      const r = g.R * (0.08 + age * 1.15), e = 1 - age; ctx.lineWidth = 2 + e * 10;
      for (const [hex, off] of [['#67e8f9', -3], ['#f0abfc', 3], ['#ece9f7', 0]]) { ctx.strokeStyle = rgba(hex, e * (off ? 0.45 : 0.6)); ctx.beginPath(); ctx.arc(g.cx + off, g.cy, r, 0, TAU); ctx.stroke(); }
    }

    const anySolo = m.lanes.some(l => l.solo);
    m.lanes.forEach((lane, li) => {
      const hex = lane.muted || (anySolo && !lane.solo) ? MUTED : o.laneHex[li], r = g.ring(li) + energy[li] * 2.5, isSel = li === sel, len = lane.length;
      // radar sweep behind the selected lane's playhead
      const ph = phase(lane, li, now, playing);
      if (isSel && playing && ph != null && ctx.createConicGradient) {
        const a = (ph / len) * TAU - Math.PI / 2, cg = ctx.createConicGradient(a - 0.9, g.cx, g.cy);
        cg.addColorStop(0, rgba(hex, 0)); cg.addColorStop(0.143, rgba(hex, 0.13)); cg.addColorStop(0.1431, rgba(hex, 0)); cg.addColorStop(1, rgba(hex, 0));
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); if (li) ctx.arc(g.cx, g.cy, g.ring(li - 1), 0, TAU, true); ctx.fill();
      }
      // orbit: a wide faint glow under a crisp hairline
      ctx.strokeStyle = rgba(hex, (isSel ? 0.16 : 0.06) + energy[li] * 0.12); ctx.lineWidth = isSel ? 9 : 6; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = isSel ? rgba(hex, 0.75) : 'rgba(236,233,247,.16)'; ctx.lineWidth = isSel ? 1.4 : 1; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();
      // RD-6 the ring answers the hand on this lane's knob: what changed since the hand came (was), and where the steps are
      // drawn while it lasts (the push and the swing move ticks and planets; a slide eases the planets to their new place)
      const look = hand && hand.li === li ? handLook(hand.k) : null;
      if (hand && hand.li === li) {
        const w = was[li], s = snap(lane);
        if (w && look === 'slide' && s.rot !== w.rot) { const o0 = slides[li], left = o0 ? o0.d * (1 - easeOut((now - o0.t) / SLIDE_MS)) : 0; slides[li] = { d: shortSteps(w.rot, s.rot, len) + left, t: now }; }
        if (w && look === 'spread' && (s.k !== w.k || s.hits !== w.hits)) spreads[li] = { t: now };
        if (w && look === 'grow' && s.len > w.len) grows[li] = { t: now, ticks: newTicks(w.len, s.len) };
        was[li] = s;
      }
      const sl = slides[li], slP = sl ? (now - sl.t) / (reduced ? 2 * SLIDE_MS : SLIDE_MS) : 1; if (sl && slP >= 1) slides[li] = null;
      const slideOff = sl && slP < 1 && !reduced ? -sl.d * (1 - easeOut(slP)) : 0;   // reduced motion: no glide, the trail only
      const sp = spreads[li], spP = sp ? (now - sp.t) / SPREAD_MS : 1; if (sp && spP >= 1) spreads[li] = null;
      const gw = grows[li], gwP = gw ? (now - gw.t) / GROW_MS : 1; if (gw && gwP >= 1) grows[li] = null;
      if (look || slP < 1 || spP < 1 || gwP < 1) answered = true;
      const pushS = look === 'push' ? pushSteps(lane.offsetMs, o.stepMs(lane)) : 0, swingOf = (i) => (look === 'swing' ? lane.swingAt(i) : 0);
      const ang = (p) => (p / len) * TAU - Math.PI / 2;
      // the rhythm's shape: hits joined into a polygon inside the ring, flaring when the lane plays
      const pts = []; for (let i = 0; i < len; i++) if (lane.hitAt(i)) { const a = ang(i + pushS + swingOf(i) + slideOff); pts.push([g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r]); }
      if (pts.length >= 3) {   // two hits would just draw a diameter: skip
        ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = rgba(hex, 0.025 + energy[li] * 0.05); ctx.fill();
        ctx.strokeStyle = rgba(hex, (isSel ? 0.3 : 0.14) + energy[li] * 0.35); ctx.lineWidth = 1; ctx.stroke();
      }
      // step ticks and hit planets
      const tick = (a, w, alpha) => { const ca = Math.cos(a), sa = Math.sin(a), x = g.cx + ca * r, y = g.cy + sa * r; ctx.strokeStyle = `rgba(236,233,247,${alpha})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - ca * w, y - sa * w); ctx.lineTo(x + ca * w, y + sa * w); ctx.stroke(); };
      for (let i = 0; i < len; i++) {
        const moved = pushS + swingOf(i);   // RD-6: push / swing under the hand: the step drawn where it sounds, its grid tick a faint mark
        if (moved) tick(ang(i), 3, 0.14);
        const a = ang(i + moved), ca = Math.cos(a), sa = Math.sin(a); let x = g.cx + ca * r, y = g.cy + sa * r;
        if (!lane.hitAt(i)) { tick(a, 4, 0.28); continue; }
        // G1 a nudged hit sits off its tick by the nudge (a fraction of the step), the tick stays as a faint mark; RD-6 a
        // slide under the hand eases it from where the shift took it, with a short trail behind
        const nd = planetNudge(lane, i), off = nd + slideOff;
        if (nd) tick(a, 5, 0.35);
        if (off) { const an = ang(i + moved + off); x = g.cx + Math.cos(an) * r; y = g.cy + Math.sin(an) * r; }
        if (sl && slP < 1) {   // the trail: from where it was (at most 1.5 steps back) to where it is now, fading
          const now0 = i + moved + off, from = now0 - Math.sign(sl.d) * Math.min(1.5, Math.abs(reduced ? sl.d : sl.d * (1 - easeOut(slP)) + 0.6));
          ctx.strokeStyle = rgba(hex, 0.6 * (1 - slP)); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, Math.min(ang(from), ang(now0)), Math.max(ang(from), ang(now0))); ctx.stroke(); ctx.lineCap = 'butt';
        }
        // G4 a ghost (soft vel lock) is a smaller, dimmer planet
        const key = `${li}:${i}`, acc = lane.accentAt(i), ghost = lane.tierAt?.(lane.stepIndex(i)) === 'ghost', f = flash.get(key), fl = f ? Math.max(0, 1 - (now - f) / 380) : 0;
        const size = (acc ? 15 : ghost ? 7 : 10) * (1 + fl * 0.9);
        // V6 a planet is as solid as its chance of playing (its prob lock, else the lane's prob: what Lane.at rolls); a
        // hit that played still flares full
        const pa = planetAlpha(lane.chanceAt(i));
        ctx.globalAlpha = (ghost ? 0.35 : 0.55) * pa + fl * 0.45; ctx.drawImage(sprite(hex), x - size * 2, y - size * 2, size * 4, size * 4);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, pa + fl); ctx.fillStyle = fl > 0.4 ? '#ffffff' : hex; ctx.beginPath(); ctx.arc(x, y, (acc ? 5.5 : ghost ? 2.8 : 4) * (1 + fl * 0.4), 0, TAU); ctx.fill();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
        const mi = misses.get(key), ma = mi ? 1 - (now - mi.t) / MISS_MS : 0;
        if (ma > 0) {   // V6 ghost flash: the step came round and stayed silent. Solid ring = the roll said no, dashed = its condition, dotted = locked dice
          const gr = size + 3 + (reduced ? 0 : (1 - ma) * 10); ctx.strokeStyle = rgba(hex, 0.85 * ma); ctx.lineWidth = 1.5;
          ctx.setLineDash(mi.why === 'cond' ? [3, 3] : mi.why === 'dice' ? [1, 3] : []); ctx.beginPath(); ctx.arc(x, y, gr, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        const tg = lane.trigAt?.(i), arcs = condArcs(tg?.cond, playing ? last[li]?.loop : null);
        if (arcs) {   // V6 a:b condition: b arcs round the planet, one per loop from 12 o'clock; the one it plays on is solid, the loop the lane is on now is lit
          const hr = size + 6, seg = TAU / arcs.length, gap = Math.min(0.35, seg * 0.25);
          ctx.lineWidth = 2;
          arcs.forEach(({ plays, here }, k) => {
            const a0 = -Math.PI / 2 + k * seg + gap / 2;
            ctx.strokeStyle = here ? (plays ? '#ffffff' : 'rgba(236,233,247,.75)') : rgba(hex, plays ? 0.85 : 0.22);
            ctx.beginPath(); ctx.arc(x, y, hr, a0, a0 + seg - gap); ctx.stroke();
          });
        } else if (tg && tg.cond !== 'always') {   // other conditions (pre, fill, first): a dashed halo (it doesn't always play)
          ctx.strokeStyle = rgba(hex, 0.7); ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(x, y, size + 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        if (tg && tg.ratchet > 1) for (let k = 1; k < tg.ratchet; k++) {   // repeats: small echoes trailing outward
          ctx.fillStyle = rgba(hex, 0.8 - k * 0.15); ctx.beginPath(); ctx.arc(x + ca * (size + 4 + k * 5), y + sa * (size + 4 + k * 5), 1.8, 0, TAU); ctx.fill();
        }
        if (lane.shownLock ? lane.shownLock(i) : lane.lockAt(i)) {   // step locks: a small cyan moon circling the planet (a ghost is its tier, not a lock)
          const q = now * 0.003 + i, mx = x + Math.cos(q) * (size + 3), my = y + Math.sin(q) * (size + 3);
          ctx.drawImage(sprite('#67e8f9'), mx - 6, my - 6, 12, 12);
        }
        if (acc) {   // accent: a four-point lens flare that turns slowly
          const L = 13 + fl * 16, sp = now * 0.0006; ctx.strokeStyle = rgba(hex, 0.55 + fl * 0.45); ctx.lineWidth = 1;
          ctx.beginPath(); for (let k = 0; k < 2; k++) { const q = sp + k * Math.PI / 2; ctx.moveTo(x - Math.cos(q) * L, y - Math.sin(q) * L); ctx.lineTo(x + Math.cos(q) * L, y + Math.sin(q) * L); } ctx.stroke();
        }
        // RD-6 hits re-spread: a ring leaves every planet once; chance: an arc round each planet as long as its chance
        if (spP < 1) { ctx.strokeStyle = rgba(hex, 0.8 * (1 - spP)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, size + 4 + (reduced ? 4 : spP * 12), 0, TAU); ctx.stroke(); }
        if (look === 'chance') {
          const c = Math.max(0, Math.min(1, lane.chanceAt(i))); ctx.lineWidth = 2;
          ctx.strokeStyle = rgba(hex, 0.18); ctx.beginPath(); ctx.arc(x, y, size + 8, 0, TAU); ctx.stroke();
          if (c > 0) { ctx.strokeStyle = rgba(hex, 0.85); ctx.beginPath(); ctx.arc(x, y, size + 8, -Math.PI / 2, -Math.PI / 2 + TAU * c); ctx.stroke(); }
        }
      }
      // RD-6 a longer loop: its new ticks pulse once; push: an arc at 12 o'clock from the grid to where the ring is drawn
      if (gwP < 1) for (const i of gw.ticks) if (i < len) {
        const a = ang(i + pushS + swingOf(i)), x = g.cx + Math.cos(a) * r, y = g.cy + Math.sin(a) * r, e = 1 - gwP;
        tick(a, 6, 0.4 + 0.55 * e); ctx.strokeStyle = rgba(hex, 0.8 * e); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 4 + (reduced ? 6 : gwP * 14), 0, TAU); ctx.stroke();
      }
      if (pushS) { ctx.strokeStyle = rgba(hex, 0.85); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(g.cx, g.cy, r + 9, Math.min(ang(0), ang(pushS)), Math.max(ang(0), ang(pushS))); ctx.stroke(); ctx.lineCap = 'butt'; }
      // RD-6 a held step (a Move step button down, or the step a knob of the step page edits): a halo round it
      for (const h of held) if (h.li === li && h.i < len) {
        const a = ang(h.i + pushS + swingOf(h.i) + (lane.hitAt(h.i) ? planetNudge(lane, h.i) + slideOff : 0)), x = g.cx + Math.cos(a) * r, y = g.cy + Math.sin(a) * r;
        // a ring only: a glow would read as a planet on an empty step
        ctx.strokeStyle = rgba(hex, 0.95); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.stroke();
      }
      // comet playhead: smooth between steps, with a fading tail along the orbit
      if (playing && ph != null) {
        const a = (ph / len) * TAU - Math.PI / 2, tail = Math.min(1.1, TAU / len * 1.4), segs = 14;
        ctx.lineCap = 'round';
        for (let k = 0; k < segs; k++) { const a0 = a - tail * (k + 1) / segs, a1 = a - tail * k / segs; ctx.strokeStyle = rgba(hex, 0.7 * (1 - k / segs) ** 2); ctx.lineWidth = 3.2 * (1 - k / segs) + 0.4; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, a0, a1); ctx.stroke(); }
        ctx.lineCap = 'butt';
        const hx = g.cx + Math.cos(a) * r, hy = g.cy + Math.sin(a) * r; ctx.drawImage(white, hx - 14, hy - 14, 28, 28); ctx.drawImage(sprite(hex), hx - 22, hy - 22, 44, 44);
      }
      // C5: no label on the ring: the app's fixed legend names the lanes (voice, length × speed)
    });

    // live record armed: the outer orbit breathes red
    if (o.isRecording?.()) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.006), r = g.outer + 26;
      ctx.strokeStyle = `rgba(239,68,68,${0.25 + pulse * 0.35})`; ctx.lineWidth = 1.5 + pulse * 2; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -now * 0.02;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // alignment countdown, so the bloom is a payoff you see coming. In the middle of the core, inside the kick ring:
    // no planet, comet or burst ever lands there (every ring's step 1 is at 12 o'clock). A dark pill, two lines when
    // one doesn't fit the ring; the words stay bright, the last beat lights the pill's rim (steady when motion is
    // reduced).
    const al = playing && o.align?.(), at = al ? alignText(al.tick, al.cycle, al.bar, al.beat) : '';
    // V6 where you are in the full cycle (every lane, condition and locked dice repeat): a thin arc just outside the
    // outer ring fills from 12 o'clock and starts again when everything lines up (the bloom)
    if (al && al.cycle > 0) {
      const r = g.outer + Math.min(16, g.R * 0.08), a0 = -Math.PI / 2, a1 = a0 + TAU * cyclePos(al.tick, al.cycle);
      ctx.strokeStyle = 'rgba(236,233,247,.16)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();   // the track: what is left to go
      ctx.strokeStyle = 'rgba(236,233,247,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, a0, Math.max(a0 + 0.01, a1)); ctx.stroke();
      ctx.fillStyle = 'rgba(236,233,247,.85)'; ctx.beginPath(); ctx.arc(g.cx + Math.cos(a1) * r, g.cy + Math.sin(a1) * r, 2, 0, TAU); ctx.fill();
    }
    if (at) {
      const lastBeat = al.cycle - (al.tick % al.cycle) <= al.beat;
      ctx.globalCompositeOperation = 'source-over'; ctx.font = CAPTION_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const room = g.ring(0) * 2 - 10, lines = ctx.measureText(at).width + 14 <= room ? [at] : [at.replace(/ \d.*/, ''), at.replace(/^.* in /, '')];
      const w = Math.max(...lines.map(s => ctx.measureText(s).width)) + 14, h = lines.length * 14 + 4;
      ctx.fillStyle = 'rgba(12,8,28,.85)'; ctx.beginPath(); ctx.roundRect(g.cx - w / 2, g.cy - h / 2, w, h, 8); ctx.fill();
      if (lastBeat) { ctx.strokeStyle = `rgba(103,232,249,${reduced ? 0.85 : 0.4 + 0.5 * Math.sin(now * 0.012) ** 2})`; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.fillStyle = 'rgba(236,233,247,.95)'; lines.forEach((s, k) => ctx.fillText(s, g.cx, g.cy + (k - (lines.length - 1) / 2) * 14));
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalCompositeOperation = 'lighter';
    }

    // jam: a red arc around everything fills up over the 256 beats, with a ticking head
    const jp = o.jamProgress?.();
    if (jp != null) {
      const r = g.outer + 40, a0 = -Math.PI / 2, a1 = a0 + TAU * Math.max(0.002, jp), pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      ctx.strokeStyle = 'rgba(239,68,68,.18)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(239,68,68,${0.7 + pulse * 0.3})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, a0, a1); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.drawImage(sprite('#ef4444'), g.cx + Math.cos(a1) * r - 16, g.cy + Math.sin(a1) * r - 16, 32, 32);
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fca5a5'; ctx.font = CAPTION_FONT; ctx.textAlign = 'center';
      ctx.fillText(`jam ${Math.floor(jp * 256)}/256`, g.cx, g.cy - r - 12); ctx.textAlign = 'left'; ctx.globalCompositeOperation = 'lighter';
    }
    // beams between simultaneous hits
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i], age = (now - b.t) / 420; if (age > 1) { beams.splice(i, 1); continue; }
      const lg = ctx.createLinearGradient(b.x1, b.y1, b.x2, b.y2); lg.addColorStop(0, rgba(b.h1, 0.8 * (1 - age))); lg.addColorStop(1, rgba(b.h2, 0.8 * (1 - age)));
      ctx.strokeStyle = lg; ctx.lineWidth = 1 + (1 - age) * 2.5; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    // shockwaves
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i], age = (now - w.t) / (w.big ? 700 : 520); if (age > 1) { waves.splice(i, 1); continue; }
      const e = 1 - age; ctx.strokeStyle = rgba(w.hex, e * 0.9); ctx.lineWidth = (w.big ? 3 : 1.6) * e + 0.3;
      ctx.beginPath(); ctx.arc(w.x, w.y, 6 + (1 - e * e) * (w.big ? 46 : 30), 0, TAU); ctx.stroke();
    }
    // sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i], age = (now - p.t) / p.life; if (age > 1) { sparks.splice(i, 1); continue; }
      const k = dt / 1000; p.vx *= Math.pow(0.08, k); p.vy *= Math.pow(0.08, k); p.x += p.vx * k; p.y += p.vy * k;
      const s = p.s * 6 * (1 - age); ctx.globalAlpha = 1 - age; ctx.drawImage(sprite(p.hex), p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (const [k, t] of flash) if (now - t > 400) flash.delete(k);
    for (const [k, mi] of misses) if (now - mi.t > MISS_MS || !playing) misses.delete(k);
  }
  /** Fractional step position of a lane right now, or null before its first step. */
  function phase(lane, li, now, playing) {
    const l = last[li]; if (!playing || !l) return null;
    const ms = o.stepMs(lane); return ((l.index % lane.length) + Math.min(1, (now - l.t) / ms)) % lane.length;
  }
  return { onStep, bloom, flash: flashHit, pick, locate, stepXY, setStage, geo, setHand, get hand() { return hand && { ...hand }; }, start: () => frameLoop(frame), reset: () => { last.length = 0; misses.clear(); }, stats: () => ({ frameMs: avgDt, quality }) };
}
