// Sinks receive key down/up (and relative mouse motion) and deliver them somewhere.
import { keyByName } from './keys.js';

/** Dispatches synthetic KeyboardEvents (isTrusted=false) to a window/document/element. Works for most JS/WASM games on the same origin. */
export class DomKeySink {
  constructor(target = globalThis.window, { Ctor = globalThis.KeyboardEvent, MouseCtor = globalThis.MouseEvent, mouseTarget } = {}) {
    this.target = target; this.Ctor = Ctor; this.MouseCtor = MouseCtor; this.mouseTarget = mouseTarget || target;
    if (!this.Ctor) throw new Error('KeyboardEvent not available (not a browser?)');
  }
  event(type, k, repeat = false) {
    return new this.Ctor(type, { code: k.code, key: k.key, keyCode: k.keyCode, which: k.keyCode, bubbles: true, cancelable: true, repeat });
  }
  down(k) { this.target.dispatchEvent(this.event('keydown', k)); }
  up(k) { this.target.dispatchEvent(this.event('keyup', k)); }
  mouseMove(dx, dy) { if (this.MouseCtor) this.mouseTarget.dispatchEvent(new this.MouseCtor('mousemove', { movementX: dx, movementY: dy, bubbles: true })); }
  mouseButton(button, pressed) { if (this.MouseCtor) this.mouseTarget.dispatchEvent(new this.MouseCtor(pressed ? 'mousedown' : 'mouseup', { button, bubbles: true })); }
}

/** Talks straight to a js-dos CommandInterface (ci.sendKeyEvent uses GLFW-style key ids = our `kbd`). */
export class JsDosSink {
  constructor(ci) { this.ci = ci; }
  down(k) { this.ci.sendKeyEvent(k.kbd, true); }
  up(k) { this.ci.sendKeyEvent(k.kbd, false); }
  mouseMove(dx, dy) { this.ci.sendMouseRelativeMotion?.(dx, dy); }
  mouseButton(button, pressed) { this.ci.sendMouseButton?.(button, pressed); }
}

/** Records everything; for tests and for the on-screen "what would be sent" view. */
export class RecordingSink {
  constructor() { this.log = []; }
  down(k) { this.log.push(['down', k.code]); }
  up(k) { this.log.push(['up', k.code]); }
  mouseMove(dx, dy) { this.log.push(['mouse', dx, dy]); }
  mouseButton(b, p) { this.log.push(['mousebtn', b, p]); }
}

export const resolveKeys = (names) => (Array.isArray(names) ? names : [names]).map(keyByName).filter(Boolean);
