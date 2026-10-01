// Dev only: when served from localhost, poll the dev server's file version and reload on change,
// so Chrome never runs a stale mix of ES modules after an edit.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  let known = null;
  const check = async () => {
    try { const { v } = await (await fetch('/__version', { cache: 'no-store' })).json(); if (known && v !== known) location.reload(); known = v; } catch {}
  };
  check(); setInterval(check, 2000);
}
