const VERSION = '2.8.12';
const STATIC_CACHE = `xcmg-static-${VERSION}`;
const RUNTIME_CACHE = `xcmg-runtime-${VERSION}`;
const LOCAL_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './connectivity-check.txt',
  './css/style.css?v=2.8.12',
  './js/offline-sync.js?v=2.8.12',
  './js/app.js?v=2.8.12',
  './js/pwa.js?v=2.8.12',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

function toAbsolute(url) {
  return new URL(url, self.registration.scope).href;
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // Um arquivo indisponível não pode cancelar toda a instalação do PWA.
    await Promise.allSettled(LOCAL_ASSETS.map(async url => {
      const absolute = toAbsolute(url);
      const response = await fetch(absolute, { cache: 'reload' });
      if (response.ok) await cache.put(absolute, response.clone());
    }));
    await Promise.allSettled(EXTERNAL_ASSETS.map(async url => {
      const response = await fetch(url, { mode: 'cors', cache: 'reload' });
      if (response.ok) await cache.put(url, response.clone());
    }));
  })());
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
  const scopeUrl = new URL(self.registration.scope);
  const connectivityPath = new URL('./connectivity-check.txt', scopeUrl).pathname;
  const indexUrl = toAbsolute('./index.html');
  const rootUrl = toAbsolute('./');
  const offlineUrl = toAbsolute('./offline.html');

  if (url.origin === scopeUrl.origin && url.pathname === connectivityPath) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(indexUrl, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(indexUrl, { ignoreSearch: true }))
          || (await caches.match(rootUrl, { ignoreSearch: true }))
          || (await caches.match('/index.html', { ignoreSearch: true }))
          || (await caches.match('/', { ignoreSearch: true }))
          || (await caches.match(offlineUrl, { ignoreSearch: true }))
          || (await caches.match('/offline.html', { ignoreSearch: true }))
          || new Response('Aplicativo indisponível offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isSupabaseLibrary = url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@supabase/supabase-js@2');
  if (!isSameOrigin && !isSupabaseLibrary) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: isSameOrigin });
    const isCriticalAsset = ['script', 'style', 'worker'].includes(request.destination) || isSupabaseLibrary;

    if (isCriticalAsset) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return cached || new Response('', { status: 503, statusText: 'Offline' });
      }
    }

    if (cached) {
      event.waitUntil(fetch(request).then(async response => {
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
      }).catch(() => {}));
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
