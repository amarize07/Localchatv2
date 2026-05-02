const CACHE_NAME = 'lanlink-pwa-v1';
const APP_SHELL = ['./', './index.html', './sw.js'];
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
];

async function cacheSafely(cache, url) {
  try {
    const request = new Request(url, { mode: 'cors', cache: 'no-cache' });
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(url, response.clone());
    }
  } catch (_) {
    // تجاهل الأخطاء الفردية حتى لا يفشل التثبيت بالكامل.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of [...APP_SHELL, ...CDN_ASSETS]) {
      await cacheSafely(cache, url);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached =
      (await cache.match(request, { ignoreSearch: false })) ||
      (await cache.match(request.url)) ||
      (request.mode === 'navigate' ? await cache.match('./index.html') : null);

    if (cached) return cached;

    try {
      const network = await fetch(request);
      if (network && (network.ok || network.type === 'opaque')) {
        cache.put(request, network.clone()).catch(() => {});
      }
      return network;
    } catch (error) {
      if (request.mode === 'navigate') {
        return (await cache.match('./index.html')) || Response.error();
      }
      throw error;
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'CLEAR_APP_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    })());
  }
});
