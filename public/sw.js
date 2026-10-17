const CACHE = 'product-dashboard-shell-v2';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('product-dashboard-shell-')) await caches.delete(key);
  await self.clients.claim();
})()));
