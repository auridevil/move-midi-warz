// Key table: DOM `code` -> { code, key, keyCode (legacy DOM), kbd (js-dos / GLFW key id) }.
const k = (code, key, keyCode, kbd = keyCode) => [code, { code, key, keyCode, kbd }];
export const KEYS = Object.fromEntries([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => k(`Key${c}`, c.toLowerCase(), c.charCodeAt(0))),
  ...'0123456789'.split('').map(d => k(`Digit${d}`, d, d.charCodeAt(0))),
  k('ArrowUp', 'ArrowUp', 38, 265), k('ArrowDown', 'ArrowDown', 40, 264), k('ArrowLeft', 'ArrowLeft', 37, 263), k('ArrowRight', 'ArrowRight', 39, 262),
  k('Space', ' ', 32, 32), k('Enter', 'Enter', 13, 257), k('Escape', 'Escape', 27, 256), k('Tab', 'Tab', 9, 258), k('Backspace', 'Backspace', 8, 259),
  k('ShiftLeft', 'Shift', 16, 340), k('ControlLeft', 'Control', 17, 341), k('AltLeft', 'Alt', 18, 342),
  k('ShiftRight', 'Shift', 16, 344), k('ControlRight', 'Control', 17, 345), k('AltRight', 'Alt', 18, 346),
  k('Comma', ',', 188, 44), k('Period', '.', 190, 46), k('Slash', '/', 191, 47), k('Semicolon', ';', 186, 59), k('Quote', "'", 222, 39),
  k('Minus', '-', 189, 45), k('Equal', '=', 187, 61), k('BracketLeft', '[', 219, 91), k('BracketRight', ']', 221, 93), k('Backquote', '`', 192, 96), k('Backslash', '\\', 220, 92),
  k('CapsLock', 'CapsLock', 20, 280), k('Insert', 'Insert', 45, 260), k('Delete', 'Delete', 46, 261), k('Home', 'Home', 36, 268), k('End', 'End', 35, 269), k('PageUp', 'PageUp', 33, 266), k('PageDown', 'PageDown', 34, 267),
  ...Array.from({ length: 12 }, (_, i) => k(`F${i + 1}`, `F${i + 1}`, 112 + i, 290 + i)),
  ...'0123456789'.split('').map(d => k(`Numpad${d}`, d, 96 + +d, 320 + +d)),
  k('NumpadAdd', '+', 107, 334), k('NumpadSubtract', '-', 109, 333), k('NumpadEnter', 'Enter', 13, 335),
]);

/** Resolve 'w' | 'W' | 'KeyW' | 'ctrl' | 'ArrowLeft' | '1' to a key entry (or null). */
export function keyByName(name) {
  if (!name) return null;
  if (KEYS[name]) return KEYS[name];
  const s = String(name);
  if (s.length === 1) { const up = s.toUpperCase(); return KEYS[/[A-Z]/.test(up) ? `Key${up}` : /[0-9]/.test(up) ? `Digit${up}` : ''] || Object.values(KEYS).find(e => e.key === s) || null; }
  const alias = { ctrl: 'ControlLeft', control: 'ControlLeft', shift: 'ShiftLeft', alt: 'AltLeft', esc: 'Escape', space: 'Space', enter: 'Enter', return: 'Enter', tab: 'Tab',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', comma: 'Comma', period: 'Period', minus: 'Minus', equal: 'Equal', plus: 'Equal', backspace: 'Backspace', del: 'Delete' }[s.toLowerCase()];
  if (alias) return KEYS[alias];
  const ci = Object.keys(KEYS).find(c => c.toLowerCase() === s.toLowerCase());
  return ci ? KEYS[ci] : null;
}
