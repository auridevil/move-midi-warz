// Compact arc gauge (knob-like). Drag vertically (Shift = fine), mouse wheel, arrow keys (Home / End = min / max,
// Page Up / Down = big steps), double-click = back to the start value. Emits onChange(value). A screen reader sees a
// slider: its short label, min / max / now, and the formatted value with its unit as the spoken text.
// say: the spoken value when the shown one has no unit (4 → '4 steps'); defaults to fmt.
// exact: set() from code keeps the value as given (a tempo of 127.5); what the user turns still moves in steps.
// onStart / onEnd (A3 automation): a pointer takes the knob / lets it go (keys, the wheel and double-click have no
// start or end: the app times them). prime(): called before a key or a wheel step works out its value, and onStart
// before a drag takes its start: either may set() the knob somewhere else first (A3: the gauge can show what plays, a
// lock or a curve, while the knob itself is the lane value). setMark(true) shows a small "A" (automated) and says it to
// screen readers.
// detent (RD-5, the filter's "off"): a value the knob stops on. A drag holds it for DETENT_PX of travel on the way
// across (and a slip from it stays on it); a key or wheel step that would cross it lands on it (as the Move's wheel,
// perform.js stepFilter). The arc fills from it, so on the detent the knob shows no fill.
const NS = 'http://www.w3.org/2000/svg';
const arc = (cx, cy, r, a0, a1) => { const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); const large = a1 - a0 > Math.PI ? 1 : 0; return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`; };
const short = (t) => String(t).split(' · ')[0];   // 'master tempo · knob 8' → 'master tempo': the hint is for eyes
const START = Math.PI * 0.75, SWEEP = Math.PI * 1.5, DETENT_PX = 10;
/** A key or wheel step from `from` to `to` that would cross the detent d stops on it (d null: no detent). */
export const stopAt = (from, to, d) => (d == null || from === d || Math.sign(to - d) === Math.sign(from - d) ? to : d);
/** A drag's value from v0 after `t` of travel (value units) with a detent d holding `g` of it: crossing d, or leaving it,
 *  costs g of travel, the value staying on d meanwhile. */
export function dragDetent(v0, t, d, g) {
  const raw = v0 + t; if (d == null) return raw;
  const s = Math.sign(v0 - d); if (!s) return Math.abs(t) <= g ? d : raw - Math.sign(t) * g;
  const past = (raw - d) * s;   // ≥ 0: still on the start's side
  return past >= 0 ? raw : past >= -g ? d : raw + s * g;
}

export function makeGauge({ label, min = 0, max = 100, step = 1, value = min, exact = false, fmt = (v) => v, say = fmt, color = 'var(--signal-cyan)', title = '', detent = null, onChange, onStart, onEnd, prime }) {
  const el = document.createElement('div'); el.className = 'gauge'; el.title = title; el.tabIndex = 0; el.style.setProperty('--gc', color);   // the stylesheet may tone the colour (orbit2 RD-2: 80 % over the void)
  let name = short(label), marked = false; const aria = () => el.setAttribute('aria-label', marked ? `${name}, automated` : name);
  el.setAttribute('role', 'slider'); aria(); el.setAttribute('aria-valuemin', min); el.setAttribute('aria-valuemax', max);
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(NS, 'path'); track.setAttribute('class', 'g-track'); track.setAttribute('d', arc(24, 24, 18, START, START + SWEEP));
  const fill = document.createElementNS(NS, 'path'); fill.setAttribute('class', 'g-fill'); fill.setAttribute('stroke', color);
  const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('class', 'g-dot'); dot.setAttribute('r', 2.6); dot.setAttribute('fill', color);
  svg.append(track, fill, dot);
  const val = document.createElement('b'); val.className = 'g-val'; const lab = document.createElement('span'); lab.className = 'g-label'; lab.textContent = label;
  val.setAttribute('aria-hidden', 'true'); lab.setAttribute('aria-hidden', 'true');
  const mark = document.createElement('i'); mark.className = 'g-mark'; mark.textContent = 'A'; mark.hidden = true; mark.setAttribute('aria-hidden', 'true'); el.append(svg, val, lab, mark);
  // RD-5: the sound page draws its knobs as filled pies; RD-6: the step page as rings (the track a whole circle, solid or
  // dashed by the stylesheet: locked or following the lane), so a page reads by its shape (setShape)
  let v = value, pie = false, shape = 'arc';
  const clamp = (x) => Math.min(max, Math.max(min, Math.round(x / step) * step));
  const ang = (x) => START + SWEEP * (x - min) / (max - min || 1);   // the arc fills from min, or from the detent
  const render = () => { const a = ang(v), a0 = ang(detent ?? min), lo = Math.min(a0, a), hi = Math.max(a0, a); track.setAttribute('d', shape === 'ring' ? 'M 24 6 A 18 18 0 1 1 23.99 6 Z' : arc(24, 24, 18, START, START + SWEEP)); fill.setAttribute('d', (hi - lo) / SWEEP > 0.001 ? (pie ? `M 24 24 L ${24 + 18 * Math.cos(lo)} ${24 + 18 * Math.sin(lo)} ${arc(24, 24, 18, lo, hi).replace(/^M [^A]+/, '')} Z` : arc(24, 24, 18, lo, hi)) : ''); dot.setAttribute('cx', 24 + 18 * Math.cos(a)); dot.setAttribute('cy', 24 + 18 * Math.sin(a)); val.textContent = fmt(v); el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', String(say(v))); };
  const set = (x, emit = false) => { const n = exact && !emit ? Math.min(max, Math.max(min, x)) : clamp(x); const changed = n !== v; v = n; render(); if (emit && changed) onChange?.(v); };
  const by = (x) => set(stopAt(v, x, detent), true);   // a key or wheel step (it stops on a detent on the way across)
  // drag: 150 px of travel = full range; Shift = 5× finer. onStart first: it may set where the drag starts (A3)
  let drag = null;
  el.addEventListener('pointerdown', (e) => { onStart?.(v); drag = { y: e.clientY, v }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; const range = max - min, px = e.shiftKey ? 750 : 150; set(dragDetent(drag.v, (drag.y - e.clientY) / px * range, detent, DETENT_PX / px * range), true); });
  const up = () => { if (!drag) return; drag = null; onEnd?.(v); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => { e.preventDefault(); prime?.(); by(v + (e.deltaY < 0 ? 1 : -1) * step * (e.shiftKey ? 1 : Math.max(1, Math.round((max - min) / 50)))); }, { passive: false });
  const KEYS = new Set(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End']);
  el.addEventListener('keydown', (e) => {
    if (!KEYS.has(e.key)) return; prime?.(); e.preventDefault();
    const big = Math.max(step, Math.round((max - min) / 20)), page = Math.max(big, Math.round((max - min) / 5));
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') by(v + (e.shiftKey ? step : big)); else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') by(v - (e.shiftKey ? step : big));
    else if (e.key === 'PageUp') by(v + page); else if (e.key === 'PageDown') by(v - page); else if (e.key === 'Home') set(min, true); else set(max, true);
  });
  el.addEventListener('dblclick', () => set(value, true));
  render();
  return { el, set, get value() { return v; }, get held() { return !!drag; }, setLabel: (t) => { lab.textContent = t; name = short(t); aria(); }, setColor: (c) => { fill.setAttribute('stroke', c); dot.setAttribute('fill', c); el.style.setProperty('--gc', c); },
    setMark: (on) => { if (marked === !!on) return; marked = !!on; mark.hidden = !marked; aria(); },
    setShape: (s) => { if (shape === s) return; shape = s; pie = s === 'pie'; el.classList.toggle('pie', pie); el.classList.toggle('ring', s === 'ring'); render(); } };
}
/**
 * RD-5 page binding: the console's knob row shows one page's gauges at a time. bindRow(slots, gauges, shape) moves each
 * gauge's own element into its slot (the same gauge, so its handlers, its "A" mark and what a held hand shows come with
 * it) and leaves a marker where it lived; a gauge the row lets go goes back to that place. Nothing is rebuilt, so a knob
 * the pointer holds keeps its capture when it is not the one leaving.
 */
const homes = new WeakMap();   // gauge element → { h: the comment marking its home, g: the gauge }
export function bindRow(slots, gauges, shape = 'arc') {
  const want = new Set(gauges.map(g => g?.el));
  for (const s of slots) { const el = s.firstElementChild, o = el && homes.get(el); if (!o || want.has(el)) continue; homes.delete(el); o.g.setShape('arc'); if (o.h.parentNode) o.h.replaceWith(el); else el.remove(); }
  slots.forEach((s, i) => {
    const g = gauges[i]; if (!g) return;
    if (g.el.parentNode !== s) { if (!homes.has(g.el)) { const h = document.createComment('gauge home'); g.el.before(h); homes.set(g.el, { h, g }); } s.replaceChildren(g.el); }
    g.setShape(shape);
  });
}
