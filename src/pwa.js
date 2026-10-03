// Installable app: registers the service worker (offline + "Install MIDI Warz" in Chrome) and, on pages that have
// one, wires an install button to Chrome's install prompt.
if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).catch(() => {});
let deferred = null;
const btn = document.getElementById('btn-install');
const installed = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (btn && !installed()) btn.hidden = false; });
addEventListener('appinstalled', () => { deferred = null; if (btn) btn.hidden = true; });
if (btn) btn.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; btn.hidden = true; };
