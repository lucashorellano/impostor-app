
const CACHE_NAME = 'impostor-ibp-v2';
const ASSETS = [
  './',
  'index.html',
  'player.html',
  'styles.css',
  'app.js',
  'player.js',
  'brand.json',
  'manifest.webmanifest',
  'assets/icons/icon_192_0.png',
  'assets/icons/icon_512_0.png',
  'assets/brand_logo.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
