// Compact arc gauge (knob-like). Drag vertically (Shift = fine), mouse wheel, or arrow keys. Emits onChange(value).
const NS = 'http://www.w3.org/2000/svg';
const arc = (cx, cy, r, a0, a1) => { const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); const large = a1 - a0 > Math.PI ? 1 : 0; return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`; };
const START = Math.PI * 0.75, SWEEP = Math.PI * 1.5;

export function makeGauge({ label, min = 0, max = 100, step = 1, value = min, fmt = (v) => v, color = 'var(--signal-cyan)', title = '', onChange }) {
  const el = document.createElement('div'); el.className = 'gauge'; el.title = title; el.tabIndex = 0;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 48 48');
  const track = document.createElementNS(NS, 'path'); track.setAttribute('class', 'g-track'); track.setAttribute('d', arc(24, 24, 18, START, START + SWEEP));
  const fill = document.createElementNS(NS, 'path'); fill.setAttribute('class', 'g-fill'); fill.setAttribute('stroke', color);
  const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('class', 'g-dot'); dot.setAttribute('r', 2.6); dot.setAttribute('fill', color);
  svg.append(track, fill, dot);
  const val = document.createElement('b'); val.className = 'g-val'; const lab = document.createElement('span'); lab.className = 'g-label'; lab.textContent = label;
  el.append(svg, val, lab);
  let v = value;
  const clamp = (x) => Math.min(max, Math.max(min, Math.round(x / step) * step));
  const render = () => { const f = (v - min) / (max - min || 1); const a = START + SWEEP * f; fill.setAttribute('d', f > 0.001 ? arc(24, 24, 18, START, a) : ''); dot.setAttribute('cx', 24 + 18 * Math.cos(a)); dot.setAttribute('cy', 24 + 18 * Math.sin(a)); val.textContent = fmt(v); };
  const set = (x, emit = false) => { const n = clamp(x); const changed = n !== v; v = n; render(); if (emit && changed) onChange?.(v); };
  // drag: 150 px of travel = full range; Shift = 5× finer
  let drag = null;
  el.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, v }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; const range = max - min, px = e.shiftKey ? 750 : 150; set(drag.v + (drag.y - e.clientY) / px * range, true); });
  el.addEventListener('pointerup', () => { drag = null; }); el.addEventListener('pointercancel', () => { drag = null; });
  el.addEventListener('wheel', (e) => { e.preventDefault(); set(v + (e.deltaY < 0 ? 1 : -1) * step * (e.shiftKey ? 1 : Math.max(1, Math.round((max - min) / 50))), true); }, { passive: false });
  el.addEventListener('keydown', (e) => { const big = Math.max(step, Math.round((max - min) / 20)); if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(v + (e.shiftKey ? step : big), true); else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(v - (e.shiftKey ? step : big), true); else return; e.preventDefault(); });
  el.addEventListener('dblclick', () => set(value, true));
  render();
  return { el, set, get value() { return v; }, setLabel: (t) => { lab.textContent = t; }, setColor: (c) => { fill.setAttribute('stroke', c); dot.setAttribute('fill', c); } };
}
