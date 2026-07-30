const VERSION = '2.8.7';
const STATIC_CACHE = `xcmg-static-${VERSION}`;
const RUNTIME_CACHE = `xcmg-runtime-${VERSION}`;
const LOCAL_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './connectivity-check.txt',
  './css/style.css?v=2.8.7',
  './js/offline-sync.js?v=2.8.7',
  './js/app.js?v=2.8.7',
  './js/pwa.js?v=2.8.7',
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
  // Pré-cache da nova versão sem interromper clientes ainda na versão anterior.
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
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const staleKeys = keys.filter(key => key.startsWith('xcmg-') && ![STATIC_CACHE, RUNTIME_CACHE].includes(key));

    // Autocorreção: se a instalação desta versão não conseguiu buscar algum
    // arquivo essencial (ex.: rede instável durante a atualização), o app
    // ficaria sem offline funcional assim que as versões antigas do cache
    // fossem apagadas. Antes de apagar, garante que cada arquivo essencial
    // exista na versão atual, recuperando da rede ou, na falta dela, de uma
    // versão anterior do cache.
    const currentCache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(LOCAL_ASSETS.map(async url => {
      const absolute = toAbsolute(url);
      const alreadyCached = await currentCache.match(absolute, { ignoreSearch: true });
      if (alreadyCached) return;
      try {
        const response = await fetch(absolute, { cache: 'reload' });
        if (response.ok) {
          await currentCache.put(absolute, response.clone());
          return;
        }
      } catch {}
      for (const staleKey of staleKeys) {
        const staleCache = await caches.open(staleKey);
        const staleResponse = await staleCache.match(absolute, { ignoreSearch: true });
        if (staleResponse) {
          await currentCache.put(absolute, staleResponse.clone());
          return;
        }
      }
    }));

    // Remove apenas caches de outras versões; mantém a versão ativa intacta.
    await Promise.all(staleKeys.map(key => caches.delete(key)));
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

  // O teste de conexão nunca pode usar cache nem resposta offline do Service Worker.
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
          || new Response('Aplicativo indisponível offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
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

    // JS/CSS/SDK: rede primeiro para publicar correções; cache para PWA offline.
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
