/* Preenchidos pelo Vite a cada build; nenhum dado de produto entra no cache. */
const CACHE_NAME = '__CATALOG_CACHE__';
const PRECACHE = /*__PRECACHE__*/ [];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('shopping-rural-catalog-') && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // A API sempre depende de uma resposta nova do servidor, inclusive offline.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate' && url.pathname.startsWith('/catalogo')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
      } catch { /* Mostra apenas a interface offline, sem preços armazenados. */ }
      return (await caches.open(CACHE_NAME)).match('/catalogo');
    })());
  } else if (PRECACHE.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(url.pathname)) || fetch(event.request);
    })());
  }
});
