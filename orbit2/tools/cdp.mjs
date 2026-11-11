// Drive orbit2 in headless Chrome for reviews and e2e checks. Node 24 (global fetch + WebSocket), no deps.
//
//   import { launch } from './orbit2/tools/cdp.mjs';
//   const b = await launch({ port: 5401, debugPort: 9401 });        // starts serve.py + Chrome on YOUR ports
//   const p = await b.open('orbit2/index.html', { width: 1440, height: 900 });   // { mobile: true } for touch
//   await p.eval('__poly.applyTempo(120)');                         // window.__poly exposes the app internals
//   await p.click(200, 300); await p.key(' '); await p.key('Enter');   // trusted input events (Enter presses a focused button)
//   await p.shot('/tmp/me/desktop.png');                            // look at it with the Read tool
//   p.captureDownloads(); await p.eval('__poly.exportWav()'); const files = await p.downloads();   // [{ name, bytes }]
//   console.log(p.errors);                                          // page exceptions + console.error
//   await b.close();                                                // kills Chrome + server, deletes the profile
//
// Every reviewer uses its own port pair (see orbit2/docs/REVIEW-PANEL.md) so parallel reviews never collide.
// A CDP call that never answers fails after 30 s instead of hanging the script (eval: 120 s, or `eval(expr, { timeout })`).
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function launch({ port, debugPort, root = ROOT } = {}) {
  if (!port || !debugPort) throw new Error('launch({ port, debugPort }): pick your own ports');
  const profile = `/tmp/orbit2-cdp-${debugPort}`;
  const server = spawn('python3', ['serve.py', String(port)], { cwd: root, stdio: 'ignore' });
  // --disable-audio-output: a fake output stream clocks the AudioContext, so the transport runs (silently) even when the
  // Mac's own output device stalls (then currentTime freezes and nothing plays, on any commit)
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-audio-output', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${debugPort}/json/version`); break; } catch { await sleep(250); } }
  const base = `http://localhost:${port}`;
  return {
    base,
    async open(path, { width = 1440, height = 900, mobile = false, wait = 3500 } = {}) {
      const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('cdp: the page socket failed')); setTimeout(() => j(new Error('cdp: the page socket did not open in 10 s')), 10000).unref(); });
      let id = 0; const pending = new Map(), errors = [];
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
        if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
        if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value ?? a.description).join(' '));
      };
      const send = (method, params = {}, ms = 30000) => {   // e.g. a wheel event in a background tab never acks
        const pr = new Promise((r, j) => {
          const i = ++id, t = setTimeout(() => { pending.delete(i); j(new Error(`cdp: ${method} got no answer in ${ms / 1000} s`)); }, ms);
          pending.set(i, (d) => { clearTimeout(t); r(d); }); ws.send(JSON.stringify({ id: i, method, params }));
        });
        pr.catch(() => {}); return pr;   // a raced call that times out later must not crash the script (unhandled rejection)
      };
      await send('Runtime.enable'); await send('Page.enable');
      // in front and focused, like a real window: without it the page can turn hidden (Escape's native key code does
      // it), and a hidden page runs no rAF, no resize events, no ResizeObserver and no Tone.Draw callbacks
      await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await send('Page.navigate', { url: `${base}/${path}` }); await sleep(wait);
      const page = {
        errors, send,
        async eval(expression, { timeout = 120000 } = {}) {   // awaits promises: an offline render takes a while
          const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, timeout);
          if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
          return r.result?.result?.value;
        },
        async click(x, y) { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); },
        async tap(x, y) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); },
        // Enter needs its text ('\r'): without it Chrome sends a raw key down and a focused button is never pressed.
        // Escape needs its native key code (27): without it page scripts see it, but Chrome's own default (a modal
        // <dialog> closing) never runs
        async key(key, code = key === ' ' ? 'Space' : key) { const text = key === 'Enter' ? '\r' : key.length === 1 ? key : undefined, vk = key === 'Escape' ? { windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 } : {}; for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, ...vk, text: type === 'keyDown' ? text : undefined }); },
        async shot(file) { const { result } = await send('Page.captureScreenshot', { format: 'png' }); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(result.data, 'base64')); return file; },
        captureDownloads() { return page.eval(`(() => { window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, href: this.href }); }; })()`); },
        async downloads() {
          const list = await page.eval(`Promise.all((window.__dl || []).map(async d => ({ name: d.name, b64: await new Promise(async r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(await (await fetch(d.href)).blob()); }) })))`);
          await page.eval('window.__dl = []'); return list.map(d => ({ name: d.name, bytes: new Uint8Array(Buffer.from(d.b64, 'base64')) }));
        },
        sleep,
        close: () => { try { ws.close(); } catch {} },
      };
      return page;
    },
    async close() { chrome.kill('SIGKILL'); server.kill('SIGKILL'); await sleep(300); rmSync(profile, { recursive: true, force: true }); },
  };
}

/** WAV bytes → { frames, channels, sampleRate, chunks: [ids], acid?, firstOnset (frame where |x| > 1 % FS, or -1) }. */
export function parseWav(u) {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength), id = (o) => String.fromCharCode(...u.slice(o, o + 4));
  const out = { chunks: [], frames: 0, channels: 0, sampleRate: 0, bits: 0, firstOnset: -1 };
  for (let o = 12; o + 8 <= u.length;) {
    const c = id(o), sz = v.getUint32(o + 4, true); out.chunks.push(c);
    if (c === 'fmt ') { out.format = v.getUint16(o + 8, true); out.channels = v.getUint16(o + 10, true); out.sampleRate = v.getUint32(o + 12, true); out.bits = v.getUint16(o + 22, true); }
    if (c === 'acid') out.acid = { flags: v.getUint32(o + 8, true), beats: v.getUint32(o + 20, true), bpm: v.getFloat32(o + 28, true) };
    if (c === 'data') {
      const bps = out.bits / 8, step = bps * out.channels; out.frames = sz / step;
      const at = (i) => out.bits === 16 ? v.getInt16(o + 8 + i, true) / 32768 : out.bits === 32 && out.format === 3 ? v.getFloat32(o + 8 + i, true) : out.bits === 24 ? ((v.getUint8(o + 8 + i) | v.getUint8(o + 9 + i) << 8 | v.getInt8(o + 10 + i) << 16) / 8388608) : 0;
      for (let f = 0; f < out.frames; f++) if (Math.abs(at(f * step)) > 0.01) { out.firstOnset = f; break; }
    }
    o += 8 + sz + (sz & 1);
  }
  return out;
}

/** Stored (uncompressed) zip bytes → [{ name, bytes }]. */
export function unzipStored(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
  for (let i = 0; i + 30 <= b.length;) {
    if (v.getUint32(i, true) !== 0x04034b50) break;
    const sz = v.getUint32(i + 18, true), n = v.getUint16(i + 26, true), x = v.getUint16(i + 28, true), s = i + 30 + n + x;
    out.push({ name: new TextDecoder().decode(b.slice(i + 30, i + 30 + n)), bytes: b.slice(s, s + sz) }); i = s + sz;
  }
  return out;
}
