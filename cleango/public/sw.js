/* LUMI service worker — offline shell + fast repeat loads.
   Strategy: never touch /api (always live); network-first for navigations with
   a cached shell fallback; cache-first for same-origin static assets. */
const CACHE = 'lumi-v45';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // third-party: let it pass
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;  // always live

  if (req.mode === 'navigate') {                              // pages: network-first, shell fallback
    e.respondWith(fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => hit)));
});
