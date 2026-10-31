// CAT Monitoreo Bloque 7 - Service Worker (v12 - Rock-Solid Offline-First)
const CACHE_NAME = 'cat-bloque7-v12';

// Core entrypoints to cache
const PRECACHE_URLS = [
  './',
  './index.html',
  'index.html',
  './manifest.json',
  'manifest.json'
];

// 1. INSTALL: Precache assets individually so a single 404 never prevents installation
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of PRECACHE_URLS) {
        try {
          const req = new Request(url, { cache: 'reload' });
          const res = await fetch(req);
          if (res && res.status === 200) {
            await cache.put(req, res);
          }
        } catch (err) {
          console.warn('[SW] Pre-cache skipped for:', url);
        }
      }
    })
  );
});

// 2. ACTIVATE: Immediately delete old caches and take control of all open pages
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. FETCH: Offline-First for Navigation (HTML) & Cache-First for static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip Google Drive / Apps Script sync calls (leave them directly to browser)
  if (url.hostname.includes('script.google.com') || url.hostname.includes('google.com')) {
    return;
  }

  // A. Navigation & HTML pages (Opening the app, refreshing, home screen icon)
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async () => {
        // Fast-path: check cache first so the app opens instantly (0.05s) even with NO internet!
        const cached = await caches.match(event.request, { ignoreSearch: true }) ||
                       await caches.match('./index.html', { ignoreSearch: true }) ||
                       await caches.match('index.html', { ignoreSearch: true }) ||
                       await caches.match('./', { ignoreSearch: true });

        // In background, if online, fetch latest version from GitHub and update cache
        const backgroundFetch = fetch(event.request).then(async (netRes) => {
          if (netRes && netRes.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, netRes.clone());
            cache.put('./index.html', netRes.clone());
            cache.put('./', netRes.clone());
          }
          return netRes;
        }).catch(() => null);

        // If we have a cached copy, serve it IMMEDIATELY!
        if (cached) {
          return cached;
        }

        // If not cached yet (first launch), wait for network
        const fresh = await backgroundFetch;
        if (fresh) return fresh;

        // Fallback to any cached HTML
        return (await caches.match('./index.html', { ignoreSearch: true })) ||
               (await caches.match('./', { ignoreSearch: true }));
      })()
    );
    return;
  }

  // B. Other static assets (images, icons, manifest)
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const respClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
        }
        return networkResponse;
      }).catch(() => {
        return new Response('', { status: 408 });
      });
    })
  );
});
