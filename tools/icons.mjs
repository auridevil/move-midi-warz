// Render the PWA icons (icons/*.svg → PNG) with headless Chrome. Needs Chrome with --remote-debugging-port=9222
// (see tools/smoke.mjs) and the dev server. Usage: node tools/icons.mjs [baseUrl]
import { writeFileSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:5173';
const jobs = [['icon.svg', 192, 'icon-192.png'], ['icon.svg', 512, 'icon-512.png'], ['icon-maskable.svg', 512, 'icon-maskable-512.png'], ['icon.svg', 180, 'apple-touch-icon.png']];
for (const [src, size, out] of jobs) {
  const { webSocketDebuggerUrl } = await (await fetch('http://localhost:9222/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(webSocketDebuggerUrl); await new Promise(r => ws.onopen = r); let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  // open the SVG itself (512 px wide) and scale the page to the target size
  await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 512, height: 512, deviceScaleFactor: size / 512, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', { url: `${base}/icons/${src}` }); await new Promise(r => setTimeout(r, 700));
  const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`../icons/${out}`, import.meta.url), Buffer.from(shot.data, 'base64'));
  console.log(out, size); await send('Page.close').catch(() => {}); ws.close();
}
process.exit(0);
