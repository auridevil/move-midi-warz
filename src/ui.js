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

/** Mount a control in place of an element (keeps the id on the new element so CSS / tests still find it). */
export function mount(id, ctl) { const old = document.getElementById(id); ctl.el.id = id; old.replaceWith(ctl.el); return ctl; }
