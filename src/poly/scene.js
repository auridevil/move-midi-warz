// Orbits visuals: a small solar system per pattern. Canvas 2D only, additive glow from pre-rendered
// sprites (no shadowBlur), so it stays cheap. Capped at 60 fps, and it stops drawing once stopped and settled. The app feeds it step events; the scene animates
// everything else (comet playheads, shockwaves, particles, beams, the core, the cycle bloom).

import { frameLoop } from '../frames.js';

const TAU = Math.PI * 2;
const MUTED = '#8b84a8';
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

/** Soft round glow, white-hot centre fading to the colour: drawn with 'lighter' it reads as light. */
function glowSprite(hex, size = 96) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.12, rgba(hex, 0.9)); grad.addColorStop(0.35, rgba(hex, 0.28)); grad.addColorStop(1, rgba(hex, 0));
  g.fillStyle = grad; g.fillRect(0, 0, size, size); return c;
}

/**
 * @param {HTMLCanvasElement} cv
 * @param {{ machine: () => any, laneHex: string[], label: (lane) => string, ratioLabel: string[],
 *           isPlaying: () => boolean, isBusy: () => boolean, stepMs: (lane) => number }} o
 *   isBusy: the app wants frames (playing, or something just changed); the scene adds its own live effects.
 */
export function createScene(cv, o) {
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, DPR = 1, bg = null, stars = [];
  const sprites = new Map(); const sprite = (hex) => { if (!sprites.has(hex)) sprites.set(hex, glowSprite(hex)); return sprites.get(hex); };
  const white = glowSprite('#ece9f7');
  const last = [];        // per lane: { index, t } of the latest step, for the smooth playhead
  const energy = [0, 0, 0, 0], flash = new Map();   // energy per lane (decays), flash per "lane:index"
  const waves = [], sparks = [], beams = [], blooms = [], recent = [];
  let shake = 0, quality = 1, avgDt = 16, prev = performance.now(), lastAlign = 0;

  const geo = () => { const R = Math.min(W, H) * 0.42; return { cx: W * 0.5, cy: H * 0.56, R, ring: (li) => R * (0.25 + li * 0.2) }; };
  const nodeXY = (g, li, i, len) => { const a = (i / len) * TAU - Math.PI / 2, r = g.ring(li); return [g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r, a]; };

  function resize() {
    DPR = Math.min(1.75, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // static backdrop: void gradient + two nebulae, rendered once per size
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height; const b = bg.getContext('2d'); b.scale(DPR, DPR);
    const { cx, cy, R } = geo();
    let gr = b.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75); gr.addColorStop(0, '#1a1236'); gr.addColorStop(0.5, '#0e0a20'); gr.addColorStop(1, '#050208');
    b.fillStyle = gr; b.fillRect(0, 0, W, H);
    for (const [x, y, rad, hex, a] of [[W * 0.18, H * 0.78, R * 1.3, '#67e8f9', 0.07], [W * 0.82, H * 0.25, R * 1.4, '#a78bfa', 0.1], [W * 0.62, H * 0.9, R, '#f0abfc', 0.05]]) {
      gr = b.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(1, rgba(hex, 0)); b.fillStyle = gr; b.fillRect(0, 0, W, H);
    }
    const n = Math.round(Math.min(320, W * H / 5200));
    stars = Array.from({ length: n }, () => ({ a: Math.random() * TAU, d: Math.sqrt(Math.random()) * Math.hypot(W, H) * 0.62, s: 0.3 + Math.random() ** 3 * 1.6, tw: Math.random() * TAU, sp: 0.4 + Math.random() * 1.6 }));
  }
  addEventListener('resize', resize); resize();

  /** Called by the app for every lane step, at the moment it sounds. */
  function onStep(ev) {
    const now = performance.now(); last[ev.lane] = { index: ev.index, t: now };
    recent.push({ lane: ev.lane, index: ev.index, t: now }); while (recent.length > 16) recent.shift();
    alignCheck(now);
    if (ev.hit) burst(ev.lane, ev.index, ev.accent, now);
  }
  /** Light up a planet without moving the playhead (live-recorded hits). */
  function flashHit(li, index, accent) { burst(li, index, accent, performance.now()); }
  function burst(li, index, accent, now) {
    const ev = { lane: li, index, accent };
    const m = o.machine(), lane = m.lanes[ev.lane], g = geo(), [x, y, a] = nodeXY(g, ev.lane, ev.index, lane.length), hex = o.laneHex[ev.lane];
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
  /** Every lane just wrapped to step 0 within a few ms: the whole polyrhythm lines up again. */
  function alignCheck(now) {
    const m = o.machine(); if (now - lastAlign < 400) return;
    const ok = m.lanes.every((_, li) => last[li] && last[li].index === 0 && now - last[li].t < 30);
    if (ok) { lastAlign = now; blooms.push({ t: now }); }
  }

  /** Which ring is under (x, y)? -1 if none. */
  function pick(x, y) { const g = geo(); const d = Math.hypot(x - g.cx, y - g.cy) / g.R; const r = Math.round((d - 0.25) / 0.2); return r >= 0 && r < 4 ? r : -1; }

  function frame(now) {
    // stopped and nothing fading out: leave the last frame on screen (idle CPU ~0)
    if (!o.isBusy() && !o.isRecording?.() && o.jamProgress?.() == null && !waves.length && !sparks.length && !beams.length && !blooms.length && energy.every(e => e < 0.01)) { prev = now; return; }
    const dt = Math.min(64, now - prev); prev = now; avgDt += (dt - avgDt) * 0.05;
    quality = avgDt > 26 ? 0.35 : avgDt > 20 ? 0.7 : 1;    // shed particles/stars when the machine struggles
    const m = o.machine(), g = geo(), playing = o.isPlaying(), sel = m.selected;
    for (let i = 0; i < 4; i++) energy[i] *= Math.pow(0.04, dt / 1000);   // ~0.6 s fall-off
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
      // the rhythm's shape: hits joined into a polygon inside the ring, flaring when the lane plays
      const pts = []; for (let i = 0; i < len; i++) if (lane.hitAt(i)) { const a = (i / len) * TAU - Math.PI / 2; pts.push([g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r]); }
      if (pts.length >= 3) {   // two hits would just draw a diameter: skip
        ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = rgba(hex, 0.025 + energy[li] * 0.05); ctx.fill();
        ctx.strokeStyle = rgba(hex, (isSel ? 0.3 : 0.14) + energy[li] * 0.35); ctx.lineWidth = 1; ctx.stroke();
      }
      // step ticks and hit planets
      for (let i = 0; i < len; i++) {
        const a = (i / len) * TAU - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), x = g.cx + ca * r, y = g.cy + sa * r;
        if (!lane.hitAt(i)) { ctx.strokeStyle = 'rgba(236,233,247,.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - ca * 4, y - sa * 4); ctx.lineTo(x + ca * 4, y + sa * 4); ctx.stroke(); continue; }
        const acc = lane.accentAt(i), f = flash.get(`${li}:${i}`), fl = f ? Math.max(0, 1 - (now - f) / 380) : 0;
        const size = (acc ? 15 : 10) * (1 + fl * 0.9);
        ctx.globalAlpha = 0.55 + fl * 0.45; ctx.drawImage(sprite(hex), x - size * 2, y - size * 2, size * 4, size * 4); ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = fl > 0.4 ? '#ffffff' : hex; ctx.beginPath(); ctx.arc(x, y, (acc ? 5.5 : 4) * (1 + fl * 0.4), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        const tg = lane.trigAt?.(i);
        if (tg && tg.cond !== 'always') {   // conditional step: a dashed halo (it doesn't always play)
          ctx.strokeStyle = rgba(hex, 0.7); ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(x, y, size + 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        if (tg && tg.ratchet > 1) for (let k = 1; k < tg.ratchet; k++) {   // repeats: small echoes trailing outward
          ctx.fillStyle = rgba(hex, 0.8 - k * 0.15); ctx.beginPath(); ctx.arc(x + ca * (size + 4 + k * 5), y + sa * (size + 4 + k * 5), 1.8, 0, TAU); ctx.fill();
        }
        if (lane.lockAt(i)) {   // step locks: a small cyan moon circling the planet
          const q = now * 0.003 + i, mx = x + Math.cos(q) * (size + 3), my = y + Math.sin(q) * (size + 3);
          ctx.drawImage(sprite('#67e8f9'), mx - 6, my - 6, 12, 12);
        }
        if (acc) {   // accent: a four-point lens flare that turns slowly
          const L = 13 + fl * 16, sp = now * 0.0006; ctx.strokeStyle = rgba(hex, 0.55 + fl * 0.45); ctx.lineWidth = 1;
          ctx.beginPath(); for (let k = 0; k < 2; k++) { const q = sp + k * Math.PI / 2; ctx.moveTo(x - Math.cos(q) * L, y - Math.sin(q) * L); ctx.lineTo(x + Math.cos(q) * L, y + Math.sin(q) * L); } ctx.stroke();
        }
      }
      // comet playhead: smooth between steps, with a fading tail along the orbit
      if (playing && ph != null) {
        const a = (ph / len) * TAU - Math.PI / 2, tail = Math.min(1.1, TAU / len * 1.4), segs = 14;
        ctx.lineCap = 'round';
        for (let k = 0; k < segs; k++) { const a0 = a - tail * (k + 1) / segs, a1 = a - tail * k / segs; ctx.strokeStyle = rgba(hex, 0.7 * (1 - k / segs) ** 2); ctx.lineWidth = 3.2 * (1 - k / segs) + 0.4; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, a0, a1); ctx.stroke(); }
        ctx.lineCap = 'butt';
        const hx = g.cx + Math.cos(a) * r, hy = g.cy + Math.sin(a) * r; ctx.drawImage(white, hx - 14, hy - 14, 28, 28); ctx.drawImage(sprite(hex), hx - 22, hy - 22, 44, 44);
      }
      // label on the ring's lower-right diagonal so the four never overlap
      ctx.globalCompositeOperation = 'source-over';
      const la = Math.PI / 4 + li * 0.12, lx = g.cx + Math.cos(la) * (r + 16), ly = g.cy + Math.sin(la) * (r + 16) + 4, txt = `${o.label(lane)} ${len} ×${o.ratioLabel[lane.ratioIndex]}${lane.muted ? ' m' : ''}`;
      ctx.font = '11px "Major Mono Display", monospace'; ctx.textAlign = 'left';
      if (isSel) { ctx.fillStyle = 'rgba(103,232,249,.6)'; ctx.fillText(txt, lx - 1, ly); ctx.fillStyle = 'rgba(240,171,252,.6)'; ctx.fillText(txt, lx + 1, ly); }
      ctx.fillStyle = isSel ? hex : 'rgba(236,233,247,.5)'; ctx.fillText(txt, lx, ly);
      ctx.globalCompositeOperation = 'lighter';
    });

    // live record armed: the outer orbit breathes red
    if (o.isRecording?.()) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.006), r = g.ring(3) + 26;
      ctx.strokeStyle = `rgba(239,68,68,${0.25 + pulse * 0.35})`; ctx.lineWidth = 1.5 + pulse * 2; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -now * 0.02;
      ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // jam: a red arc around everything fills up over the 256 beats, with a ticking head
    const jp = o.jamProgress?.();
    if (jp != null) {
      const r = g.ring(3) + 40, a0 = -Math.PI / 2, a1 = a0 + TAU * Math.max(0.002, jp), pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      ctx.strokeStyle = 'rgba(239,68,68,.18)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(239,68,68,${0.7 + pulse * 0.3})`; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(g.cx, g.cy, r, a0, a1); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.drawImage(sprite('#ef4444'), g.cx + Math.cos(a1) * r - 16, g.cy + Math.sin(a1) * r - 16, 32, 32);
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fca5a5'; ctx.font = '12px "Major Mono Display", monospace'; ctx.textAlign = 'center';
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
  }
  /** Fractional step position of a lane right now, or null before its first step. */
  function phase(lane, li, now, playing) {
    const l = last[li]; if (!playing || !l) return null;
    const ms = o.stepMs(lane); return ((l.index % lane.length) + Math.min(1, (now - l.t) / ms)) % lane.length;
  }
  return { onStep, flash: flashHit, pick, start: () => frameLoop(frame), reset: () => { last.length = 0; }, stats: () => ({ frameMs: avgDt, quality }) };
}
