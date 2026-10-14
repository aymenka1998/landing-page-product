const CACHE = 'product-dashboard-shell-v1';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { const response = await fetch('/', { cache: 'no-store', credentials: 'same-origin' }); if (response.ok) await cache.put('/', response); } catch {}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
  const request = event.request; const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') event.respondWith(fetch(request).then(response => { if (response.ok) caches.open(CACHE).then(cache => cache.put('/', response.clone())); return response; }).catch(async () => (await caches.match('/')) || new Response('يلزم اتصال بالشبكة المحلية لتشغيل لوحة التحكم.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});