// Small controls that keep every choice visible: a segmented control (one of a few), chips (one of many, wrapping)
// and a toggle chip (on/off). Dropdowns hide options behind a click; these show them and take one tap.

/**
 * @param {{ options: Array<[any, string, string?]>, value?: any, onChange?: (v) => void, chips?: boolean, color?: string, className?: string }} o
 *   options: [value, label, title]; chips = wrapping pills instead of a joined bar; color = fill of the active one
 */
export function segmented({ options, value, onChange, chips = false, color = '', className = '' }) {
  const el = document.createElement('div'); el.className = `${chips ? 'chips' : 'seg seg-ui'} ${className}`.trim(); el.setAttribute('role', 'radiogroup');
  let v = value, btns = [];
  const paint = () => btns.forEach(([b, val]) => { const on = val === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.style.background = on && color ? color : ''; });
  const setOptions = (opts) => {
    el.innerHTML = ''; btns = opts.map(([val, label, title]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (title) b.title = title; b.setAttribute('role', 'radio');
      b.onclick = () => { if (b.disabled) return; v = val; paint(); onChange?.(val); }; el.appendChild(b); return [b, val];
    }); paint();
  };
  setOptions(options);
  return { el, set: (x) => { v = x; paint(); }, get value() { return v; }, setOptions, disable: (val, off = true) => { const e = btns.find(([, x]) => x === val); if (e) e[0].disabled = off; } };
}

/** On/off pill. */
export function toggleChip({ label, on = false, onChange, title = '', color = '' }) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'tchip'; b.textContent = label; b.title = title; b.setAttribute('aria-pressed', on);
  let v = on; const paint = () => { b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); b.style.setProperty('--chip', color || 'var(--signal-cyan)'); };
  b.onclick = () => { v = !v; paint(); onChange?.(v); }; paint();
  return { el: b, set: (x) => { v = !!x; paint(); }, get value() { return v; } };
}

/** Long press: the touch way to reach what Shift, Alt or a right-click do with a mouse. Holding still for `ms` calls
 *  onLong; a move past `slop` px (a scroll, a drag), a release or a cancel first is an ordinary tap. The click that
 *  follows a fired long press is swallowed, so the tap action doesn't run too. A right-click or the keyboard's menu
 *  key (contextmenu) counts as a long press as well, and a touch never opens the browser's menu. Works on any
 *  EventTarget (the tests drive a bare one). Returns `cancel` for a host that rebuilds or hides the element. */
export const LONG_MS = 450, LONG_SLOP = 8;
export function longPress(el, onLong, { ms = LONG_MS, slop = LONG_SLOP } = {}) {
  let timer = 0, id = null, x0 = 0, y0 = 0, fired = false;
  const cancel = () => { clearTimeout(timer); timer = 0; id = null; };
  const fire = (e) => { cancel(); fired = true; onLong(e); };
  el.addEventListener('pointerdown', (e) => {
    if (e.button) return; cancel(); fired = false; id = e.pointerId; x0 = e.clientX; y0 = e.clientY;
    timer = setTimeout(() => { const pid = id; fire(e); id = pid; }, ms);   // id stays: the finger is still down
  });
  el.addEventListener('pointermove', (e) => { if (timer && e.pointerId === id && Math.hypot(e.clientX - x0, e.clientY - y0) > slop) cancel(); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, (e) => { if (e.pointerId === id) cancel(); });
  // capture: runs before the element's own onclick. Keyboard clicks (detail 0) always pass.
  el.addEventListener('click', (e) => { const f = fired; fired = false; if (f && e.detail !== 0) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // a touch sends its mouse events after the finger lifts: their mousedown must not pull the focus back here from
  // wherever the long press put it (the slot menu). A mouse's own mousedown comes before the hold, so it passes.
  el.addEventListener('mousedown', (e) => { if (fired) e.preventDefault(); }, true);
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (fired && id !== null) return; const down = id !== null; fire(e); fired = down; });   // touch: the timer may have won already
  return cancel;
}

/** Mount a control in place of an element (keeps the id on the new element so CSS / tests still find it). */
export function mount(id, ctl) { const old = document.getElementById(id); ctl.el.id = id; old.replaceWith(ctl.el); return ctl; }
