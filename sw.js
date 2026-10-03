// MIDI Warz service worker: makes the app installable and usable offline.
// Network first (you always get the latest when online), the cache answers when the network can't.
// The shell is cached on install; everything else (Tone, movewire, Doom, fonts) as it is first used.
const CACHE = 'midi-warz-v1';
const SHELL = ['./', './index.html', './poly.html', './drums.html', './chaos.html', './lights.html', './punchliner.html', './unassembler.html', './melodic.html', './doom.html',
  './styles.css', './favicon.svg', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './vendor/tone/Tone.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.endsWith('/__version') || req.headers.has('range')) return;   // dev reload ping, partial media: straight to the network
  const keep = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!keep) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true }); if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});
