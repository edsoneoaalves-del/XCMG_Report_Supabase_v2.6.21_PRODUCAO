const CACHE='xcmg-report-v2.6.21-production';
const ASSETS=['./','index.html','css/style.css?v=2.6.21','js/app.js?v=2.6.21','manifest.json','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).then(res=>{const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));return res}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))));

self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});
