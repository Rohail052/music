const CACHE = 'allplay-v2';
const APP_SHELL = [
  './',
  './index.html',
  './script.js',
  './manifest.json',
  './allplay-icon.png',
  './allplay-icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)))
      ),
      self.clients.claim(),
    ])
  );
});

// Offline-first for shell, network-first for navigation (safe for SPA)
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Navigation fallback
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
