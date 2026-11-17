const CACHE_NAME = 'devi-times-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch('/');
      if (!response.ok) throw new Error('Could not cache the app shell.');
      await cache.put('/', response.clone());
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);
      await cache.addAll([...new Set(assets)]);
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('devi-times-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const appShell = await caches.match('/');
          if (appShell) return appShell;
        }
        return new Response('This page is not available offline.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
