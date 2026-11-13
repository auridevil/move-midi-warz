// Compact arc gauge (knob-like). Drag vertically (Shift = fine), mouse wheel, arrow keys (Home / End = min / max,
// Page Up / Down = big steps), double-click = back to the start value. Emits onChange(value). A screen reader sees a
// slider: its short label, min / max / now, and the formatted value with its unit as the spoken text.
// say: the spoken value when the shown one has no unit (4 → '4 steps'); defaults to fmt.
// exact: set() from code keeps the value as given (a tempo of 127.5); what the user turns still moves in steps.
// onStart / onEnd (A3 automation): a pointer takes the knob / lets it go (keys, the wheel and double-click have no
// start or end: the app times them). setMark(true) shows a small "A" (automated) and says it to screen readers.
const NS = 'http://www.w3.org/2000/svg';
const arc = (cx, cy, r, a0, a1) => { const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); const large = a1 - a0 > Math.PI ? 1 : 0; return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`; };
const short = (t) => String(t).split(' · ')[0];   // 'master tempo · knob 8' → 'master tempo': the hint is for eyes
const START = Math.PI * 0.75, SWEEP = Math.PI * 1.5;

export function makeGauge({ label, min = 0, max = 100, step = 1, value = min, exact = false, fmt = (v) => v, say = fmt, color = 'var(--signal-cyan)', title = '', onChange, onStart, onEnd }) {
  const el = document.createElement('div'); el.className = 'gauge'; el.title = title; el.tabIndex = 0;
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
  let v = value;
  const clamp = (x) => Math.min(max, Math.max(min, Math.round(x / step) * step));
  const render = () => { const f = (v - min) / (max - min || 1); const a = START + SWEEP * f; fill.setAttribute('d', f > 0.001 ? arc(24, 24, 18, START, a) : ''); dot.setAttribute('cx', 24 + 18 * Math.cos(a)); dot.setAttribute('cy', 24 + 18 * Math.sin(a)); val.textContent = fmt(v); el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', String(say(v))); };
  const set = (x, emit = false) => { const n = exact && !emit ? Math.min(max, Math.max(min, x)) : clamp(x); const changed = n !== v; v = n; render(); if (emit && changed) onChange?.(v); };
  // drag: 150 px of travel = full range; Shift = 5× finer
  let drag = null;
  el.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, v }; el.setPointerCapture(e.pointerId); e.preventDefault(); onStart?.(v); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; const range = max - min, px = e.shiftKey ? 750 : 150; set(drag.v + (drag.y - e.clientY) / px * range, true); });
  const up = () => { if (!drag) return; drag = null; onEnd?.(v); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => { e.preventDefault(); set(v + (e.deltaY < 0 ? 1 : -1) * step * (e.shiftKey ? 1 : Math.max(1, Math.round((max - min) / 50))), true); }, { passive: false });
  el.addEventListener('keydown', (e) => {
    const big = Math.max(step, Math.round((max - min) / 20)), page = Math.max(big, Math.round((max - min) / 5));
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(v + (e.shiftKey ? step : big), true); else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(v - (e.shiftKey ? step : big), true);
    else if (e.key === 'PageUp') set(v + page, true); else if (e.key === 'PageDown') set(v - page, true); else if (e.key === 'Home') set(min, true); else if (e.key === 'End') set(max, true); else return;
    e.preventDefault();
  });
  el.addEventListener('dblclick', () => set(value, true));
  render();
  return { el, set, get value() { return v; }, get held() { return !!drag; }, setLabel: (t) => { lab.textContent = t; name = short(t); aria(); }, setColor: (c) => { fill.setAttribute('stroke', c); dot.setAttribute('fill', c); },
    setMark: (on) => { if (marked === !!on) return; marked = !!on; mark.hidden = !marked; aria(); } };
}
