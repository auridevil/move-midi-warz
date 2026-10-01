// Load every page in headless Chrome and print console errors. Usage: node tools/smoke.mjs [baseUrl]
// Needs a running dev server (npm start) and Chrome with --remote-debugging-port=9222, e.g.:
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/mw-chrome about:blank &
const base = process.argv[2] || 'http://localhost:5173';
const pages = ['index.html', 'drums.html', 'lights.html', 'chaos.html', 'poly.html', 'doom.html', 'melodic.html'];
let failed = 0;
for (const path of pages) {
  const { webSocketDebuggerUrl } = await (await fetch('http://localhost:9222/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value ?? a.description).join(' ')); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.navigate', { url: `${base}/${path}` });
  await new Promise(r => setTimeout(r, 3500));
  console.log(`${path.padEnd(14)} ${errors.length ? 'ERRORS\n  ' + errors.join('\n  ') : 'ok'}`); if (errors.length) failed++;
  await send('Page.close').catch(() => {}); ws.close();
}
process.exit(failed ? 1 : 0);
