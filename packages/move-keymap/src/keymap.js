// MoveKeymap: listens to a MoveDevice, turns pads / steps / buttons / encoders / wheel into key actions on a sink.
//
// mapping = {
//   pads:    { [padIndex]: Action },      steps: { [stepIndex]: Action },      buttons: { [buttonName]: Action },
//   encoders:{ [encIndex]: Turn },        wheel: Turn,                          volume: Turn,
//   hardHit: { velocity: 100, keys: 'ShiftLeft' }   // optional: extra keys held while a pad is hit at/above this velocity
// }
// Action = 'KeyW' | ['ShiftLeft','KeyW'] | { keys, role?, label? } | { mouseButton: 0 }
// Turn   = { cw: Action, ccw: Action, tapMs?: 70 } | { mouse: 'x' | 'y', scale?: 8 }
//
// Events: 'action' {source, action, pressed, keys}, 'learn' {source}, 'learned' {source, action}, 'change'
import { resolveKeys } from './sinks.js';
import { nearestPaletteIndex } from 'movewire';

/** Role -> screen colour. The Move LED is the closest palette entry, so pads and the on-screen map always match. */
export const ROLE_HEX = { move: '#67e8f9', strafe: '#a5f3fc', fire: '#fb7185', use: '#a78bfa', run: '#f9a8d4', menu: '#ece9f7', weapon: '#fde047', map: '#9a94b8', other: '#5b4f80' };
export const ROLE_COLOR = Object.fromEntries(Object.entries(ROLE_HEX).map(([k, v]) => [k, nearestPaletteIndex(v)]));

const norm = (a) => (a == null ? null : typeof a === 'string' || Array.isArray(a) ? { keys: a } : a);

export class MoveKeymap extends EventTarget {
  constructor(device, sink, mapping = {}, { leds = true } = {}) {
    super();
    this.device = device; this.sink = sink; this.leds = leds;
    this.held = new Map();        // source id -> keys[] currently down
    this.tapTimers = new Map();   // key code -> timeout
    this.learning = null;
    this.setMapping(mapping);
    this._handlers = {
      pad: (e) => this.onPad(e.detail), step: (e) => this.onStep(e.detail), button: (e) => this.onButton(e.detail),
      encoder: (e) => this.onTurn(`enc${e.detail.index}`, this.mapping.encoders?.[e.detail.index], e.detail.delta),
      wheel: (e) => this.onTurn('wheel', this.mapping.wheel, e.detail.delta),
      volume: (e) => this.onTurn('volume', this.mapping.volume, e.detail.delta),
    };
    for (const [t, h] of Object.entries(this._handlers)) device.addEventListener(t, h);
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  destroy() { this.releaseAll(); for (const [t, h] of Object.entries(this._handlers)) this.device.removeEventListener(t, h); }
  setSink(sink) { this.releaseAll(); this.sink = sink; }
  setMapping(m) { this.mapping = { pads: {}, steps: {}, buttons: {}, encoders: {}, ...m }; this.paintLeds(); this.emit('change', this.mapping); }
  assign(source, action) { // source: {type:'pad'|'step'|'button', id}
    const bucket = { pad: 'pads', step: 'steps', button: 'buttons' }[source.type];
    if (!bucket) return;
    if (action == null) delete this.mapping[bucket][source.id]; else this.mapping[bucket][source.id] = norm(action);
    this.paintLeds(); this.emit('change', this.mapping);
  }

  // ---- learn mode: next pad/step/button pressed becomes the target; then learnKey(name) assigns ----
  startLearn() { this.learning = { source: null }; this.emit('learn', { source: null }); }
  cancelLearn() { this.learning = null; }
  learnKey(keyName, role = 'other') {
    if (!this.learning?.source) return false;
    const action = { keys: keyName, role };
    this.assign(this.learning.source, action); this.emit('learned', { source: this.learning.source, action }); this.learning = null; return true;
  }

  // ---- inputs ----
  onPad(p) {
    const src = { type: 'pad', id: p.index };
    if (this.learning && p.on) { this.learning.source = src; this.emit('learn', { source: src }); return; }
    const a = norm(this.mapping.pads[p.index]); if (!a) return;
    const extra = p.on && this.mapping.hardHit && p.velocity >= (this.mapping.hardHit.velocity ?? 100) ? resolveKeys(this.mapping.hardHit.keys) : [];
    this.press(`pad${p.index}`, a, p.on, extra);
  }
  onStep(s) {
    const src = { type: 'step', id: s.index };
    if (this.learning && s.on) { this.learning.source = src; this.emit('learn', { source: src }); return; }
    const a = norm(this.mapping.steps[s.index]); if (!a) return;
    this.press(`step${s.index}`, a, s.on);
  }
  onButton(b) {
    const src = { type: 'button', id: b.name };
    if (this.learning && b.pressed) { this.learning.source = src; this.emit('learn', { source: src }); return; }
    const a = norm(this.mapping.buttons[b.name]); if (!a) return;
    this.press(`btn:${b.name}`, a, b.pressed);
  }
  onTurn(id, turn, delta) {
    if (!turn || !delta) return;
    if (turn.mouse) { const s = turn.scale ?? 8; this.sink?.mouseMove?.(turn.mouse === 'x' ? delta * s : 0, turn.mouse === 'y' ? delta * s : 0); this.emit('action', { source: id, action: turn, pressed: true, keys: [], delta }); return; }
    const a = norm(delta > 0 ? turn.cw : turn.ccw); if (!a) return;
    const ms = (turn.tapMs ?? 70) * Math.min(4, Math.abs(delta));
    this.tap(a, ms); this.emit('action', { source: id, action: a, pressed: true, keys: resolveKeys(a.keys).map(k => k.code), delta });
  }

  // ---- output ----
  press(id, action, pressed, extra = []) {
    if (action.mouseButton != null) { this.sink?.mouseButton?.(action.mouseButton, pressed); this.emit('action', { source: id, action, pressed, keys: [] }); return; }
    if (pressed) {
      if (this.held.has(id)) this.press(id, action, false);
      const keys = [...extra, ...resolveKeys(action.keys)];
      for (const k of keys) this.keyDown(k);
      this.held.set(id, keys);
    } else {
      const keys = this.held.get(id) || []; this.held.delete(id);
      for (const k of [...keys].reverse()) this.keyUp(k);
    }
    this.emit('action', { source: id, action, pressed, keys: (this.held.get(id) || resolveKeys(action.keys)).map(k => k.code) });
  }
  /** Down now, up after ms; repeated taps extend the hold instead of re-triggering. */
  tap(action, ms) {
    for (const k of resolveKeys(action.keys)) {
      if (this.tapTimers.has(k.code)) clearTimeout(this.tapTimers.get(k.code)); else this.keyDown(k);
      this.tapTimers.set(k.code, setTimeout(() => { this.tapTimers.delete(k.code); if (!this.isHeld(k)) this.keyUp(k); }, ms));
    }
  }
  isHeld(k) { for (const keys of this.held.values()) if (keys.some(x => x.code === k.code)) return true; return false; }
  keyDown(k) { this.sink?.down(k); }
  keyUp(k) { this.sink?.up(k); }
  releaseAll() {
    for (const [, keys] of this.held) for (const k of keys) this.sink?.up(k);
    this.held.clear();
    for (const [code, t] of this.tapTimers) { clearTimeout(t); this.sink?.up(resolveKeys(code)[0]); }
    this.tapTimers.clear();
  }

  // ---- LEDs: colour by role, steady (same colours as the on-screen map) ----
  colorFor(action) { const a = norm(action); return a?.color ?? (a?.hex ? nearestPaletteIndex(a.hex) : null) ?? ROLE_COLOR[a?.role] ?? ROLE_COLOR.other; }
  hexFor(action) { const a = norm(action); return a?.hex ?? ROLE_HEX[a?.role] ?? ROLE_HEX.other; }
  paintLeds() {
    if (!this.leds || !this.device?.inControl) return;
    for (let i = 0; i < 32; i++) this.device.setPadColor(i, this.mapping.pads[i] ? this.colorFor(this.mapping.pads[i]) : 0);
    for (let i = 0; i < 16; i++) this.device.setStepColor(i, this.mapping.steps[i] ? this.colorFor(this.mapping.steps[i]) : 0);
    for (const [name, a] of Object.entries(this.mapping.buttons)) { try { this.device.setButtonColor(name, this.colorFor(a)); } catch {} }
  }
}
