// RD-1 screen-off proxy (DECISION A10): the Move as its LEDs show it, nothing else. Reads the lights the page sent
// (movewire caches every pad, step and button colour in move.ledState) and draws the device's face with them, the
// display left dark. A fresh sub-agent sees only that image. Muted (cdp.mjs); the Move is simulated as connected.
//
//   node orbit2/tools/moveview.mjs --out /tmp/move.png                       # today's page, a groove, stopped
//   node orbit2/tools/moveview.mjs --play --hold minus --out /tmp/drift.png  # playing, − held while the shot is taken
//   node orbit2/tools/moveview.mjs --bytes "b0 31 7f;90 47 64" --out x.png   # any Move bytes first (hex, ; between)
//   import { moveShot } from './moveview.mjs'; await moveShot(page, '/tmp/m.png')   # from another tool's page
import { launch } from './cdp.mjs';
import { ledsOf, drawMove, bytes } from './session-core.mjs';
import { openSet } from './session.mjs';
import { paletteHex } from 'movewire';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** The page's Move lights → { leds, svg }. */
export async function moveState(p) { const leds = ledsOf(await p.eval('[...__poly.move.ledState]')); return { leds, svg: drawMove(leds, paletteHex) }; }

/** Draw the Move as the page lit it and save it as a PNG (rendered by the page's own browser, on top, then removed). */
export async function moveShot(p, file) {
  const { leds, svg } = await moveState(p);
  await p.eval(`(() => { const d = document.createElement('div'); d.id = 'mv-shot'; d.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;background:#111;line-height:0'; d.innerHTML = ${JSON.stringify(svg)}; document.body.append(d); })()`);
  await p.eval('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const { result } = await p.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 980, height: 560, scale: 1 } });
  await p.eval(`document.getElementById('mv-shot').remove()`);
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(result.data, 'base64'));
  return leds;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; }, has = (k) => process.argv.includes(k);
  const b = await launch({ port: +arg('--port', 5400), debugPort: +arg('--debug-port', 9400) });
  try {
    const p = await openSet(b, { path: arg('--path', 'orbit2/index.html'), groove: arg('--groove', 'techno') }), send = (x) => p.eval(`__poly.move.receive(new Uint8Array(${JSON.stringify(x)}))`);
    if (has('--play')) { await send(bytes.btn('play', true)); await send(bytes.btn('play', false)); await sleep(1500); }
    for (const s of (arg('--bytes', '') || '').split(';').map(x => x.trim()).filter(Boolean)) { await send(s.split(/\s+/).map(h => parseInt(h, 16))); await sleep(80); }
    if (arg('--hold', null)) { await send(bytes.btn(arg('--hold'), true)); await sleep(600); }
    const leds = await moveShot(p, arg('--out', '/tmp/orbit2-moveview.png'));
    console.log(`${arg('--out', '/tmp/orbit2-moveview.png')} · ${leds.pads.filter(Boolean).length} pads, ${leds.steps.filter(Boolean).length} steps, ${Object.values(leds.buttons).filter(Boolean).length} buttons lit`);
    if (p.errors.length) { console.error(`page errors: ${p.errors.join(' | ')}`); process.exitCode = 2; }
  } finally { await b.close(); }
}
