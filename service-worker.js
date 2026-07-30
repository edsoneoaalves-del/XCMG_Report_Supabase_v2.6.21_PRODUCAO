const VERSION = '2.8.7';
// Versão do cache incrementada (independente da versão do app) para forçar a
// troca completa de qualquer cache anterior, inclusive de instalações feitas
// antes da correção do App Shell e do start_url.
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `xcmg-static-${VERSION}-${CACHE_VERSION}`;
const RUNTIME_CACHE = `xcmg-runtime-${VERSION}-${CACHE_VERSION}`;
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
// App Shell: estes dois arquivos sustentam toda a navegação offline e nunca
// podem ficar ausentes do cache atual.
const NAV_CRITICAL_ASSETS = ['./index.html', './offline.html'];
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

function toAbsolute(url) {
  return new URL(url, self.registration.scope).href;
}

async function cacheAsset(cache, url, options) {
  try {
    const response = await fetch(url, options);
    if (response && response.ok) {
      await cache.put(url, response.clone());
      return true;
    }
  } catch {}
  return false;
}

self.addEventListener('install', event => {
  // Pré-cache da nova versão sem interromper clientes ainda na versão anterior.
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // Um arquivo indisponível não pode cancelar toda a instalação do PWA.
    await Promise.allSettled(LOCAL_ASSETS.map(url => cacheAsset(cache, toAbsolute(url), { cache: 'reload' })));
    await Promise.allSettled(EXTERNAL_ASSETS.map(url => cacheAsset(cache, url, { mode: 'cors', cache: 'reload' })));

    // Garantia extra do App Shell: se index.html/offline.html não entraram no
    // cache na primeira tentativa (rede instável durante a instalação),
    // tenta novamente antes de liberar esta versão para uso.
    for (const url of NAV_CRITICAL_ASSETS) {
      const absolute = toAbsolute(url);
      for (let attempt = 0; attempt < 2 && !(await cache.match(absolute, { ignoreSearch: true })); attempt++) {
        await cacheAsset(cache, absolute, { cache: 'reload' });
      }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
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
        const alreadyCached = await currentCache.match(absolute, { ignoreSearch: true }).catch(() => null);
        if (alreadyCached) return;
        const fetched = await cacheAsset(currentCache, absolute, { cache: 'reload' });
        if (fetched) return;
        for (const staleKey of staleKeys) {
          try {
            const staleCache = await caches.open(staleKey);
            const staleResponse = await staleCache.match(absolute, { ignoreSearch: true });
            if (staleResponse) {
              await currentCache.put(absolute, staleResponse.clone());
              return;
            }
          } catch {}
        }
      }));

      // Remove apenas caches de outras versões; mantém a versão ativa intacta.
      await Promise.allSettled(staleKeys.map(key => caches.delete(key)));
    } catch (error) {
      console.warn('Falha ao migrar cache na ativação do Service Worker.', error);
    } finally {
      // clients.claim() precisa rodar mesmo se a migração de cache acima falhar,
      // para que o novo Service Worker sempre assuma o controle da navegação.
      await self.clients.claim();
    }
  })());
});

// Estratégia App Shell para navegação: Cache First em index.html, com
// atualização em segundo plano quando há rede. offline.html só é usado se
// index.html não existir em nenhum cache. Esta função nunca lança exceção e
// nunca retorna algo diferente de um Response, para que a navegação jamais
// termine em erro de rede (ERR_FAILED) no navegador.
async function handleNavigation(event, indexUrl, offlineUrl) {
  try {
    const cachedShell = await caches.match(indexUrl, { ignoreSearch: true });
    if (cachedShell) {
      event.waitUntil((async () => {
        try {
          const response = await fetch(event.request);
          if (response && response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(indexUrl, response.clone());
          }
        } catch {}
      })());
      return cachedShell;
    }
  } catch {}

  // Nada em cache ainda (primeira instalação desta versão): tenta a rede.
  try {
    const response = await fetch(event.request);
    if (response && response.ok) {
      try {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(indexUrl, response.clone());
      } catch {}
    }
    return response;
  } catch {}

  // index.html realmente não existe em nenhum cache e a rede falhou: única
  // situação em que offline.html é utilizado.
  try {
    const offlineShell = await caches.match(offlineUrl, { ignoreSearch: true });
    if (offlineShell) return offlineShell;
  } catch {}

  // Última garantia absoluta: a navegação nunca deve retornar erro de rede.
  return new Response(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>XCMG Report</title></head>'
    + '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07111f;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px">'
    + '<div><h1 style="margin:0 0 8px">XCMG Report</h1><p>Não foi possível carregar o aplicativo agora. Verifique a conexão e tente novamente.</p></div>'
    + '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  const scopeUrl = new URL(self.registration.scope);
  const connectivityPath = new URL('./connectivity-check.txt', scopeUrl).pathname;
  const indexUrl = toAbsolute('./index.html');
  const offlineUrl = toAbsolute('./offline.html');

  // O teste de conexão nunca pode usar cache nem resposta offline do Service Worker.
  if (url.origin === scopeUrl.origin && url.pathname === connectivityPath) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => new Response('offline', { status: 503 }))
    );
    return;
  }

  // Navigation Route: toda requisição de navegação (abrir/recarregar o app,
  // inclusive pelo ícone do PWA instalado) passa pela estratégia App Shell.
  // "/", "/index.html" e qualquer variação de query string (ex.: "/?source=pwa",
  // de instalações antigas do PWA) são tratadas como a mesma navegação: o
  // App Shell não depende do caminho/consulta exatos da URL solicitada.
  const isDocumentNavigation = request.mode === 'navigate'
    || (request.mode === 'same-origin' && request.destination === 'document');
  if (isDocumentNavigation) {
    event.respondWith(handleNavigation(event, indexUrl, offlineUrl));
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isSupabaseLibrary = url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@supabase/supabase-js@2');
  if (!isSameOrigin && !isSupabaseLibrary) return;

  event.respondWith((async () => {
    let cached = null;
    try {
      cached = await caches.match(request, { ignoreSearch: isSameOrigin });
    } catch {}
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
