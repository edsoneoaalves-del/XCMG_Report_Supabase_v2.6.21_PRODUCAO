const VERSION = '2.8.8';
const STATIC_CACHE = `xcmg-static-${VERSION}`;
const RUNTIME_CACHE = `xcmg-runtime-${VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/connectivity-check.txt',
  '/css/style.css?v=2.8.8',
  '/js/offline-sync.js?v=2.8.8',
  '/js/app.js?v=2.8.8',
  '/js/pwa.js?v=2.8.8',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // O teste de conexão nunca pode usar cache nem resposta offline do Service Worker.
  if (url.origin === self.location.origin && url.pathname === '/connectivity-check.txt') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put('/index.html', response.clone());
        return response;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/offline.html'));
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const isCriticalAsset = ['script', 'style', 'worker'].includes(request.destination);
    const cached = await caches.match(request);
    const networkPromise = fetch(request).then(async response => {
      if (response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    // JS/CSS usam rede primeiro para que correções publicadas não fiquem presas no cache antigo.
    if (isCriticalAsset) return (await networkPromise) || cached || new Response('', { status: 503, statusText: 'Offline' });
    if (cached) {
      event.waitUntil(networkPromise);
      return cached;
    }
    return (await networkPromise) || new Response('', { status: 503, statusText: 'Offline' });
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
