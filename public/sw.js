// Offline service worker. On install it caches the app shell plus every
// script/style the page references, so the app works offline from the very
// first visit. User data lives in IndexedDB and is never touched here.
// Bump VERSION on every release so old caches are dropped.
const VERSION = 'pattern-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(SHELL);
      // Precache hashed assets referenced by index.html (and lazy chunks they import).
      const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
      const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => './' + m[1]);
      for (const a of assets) {
        try {
          const res = await fetch(a);
          if (!res.ok) continue;
          await cache.put(a, res.clone());
          if (a.endsWith('.js')) {
            const js = await res.text();
            for (const m of js.matchAll(/["'`]\.?\/?((?:assets\/)?[\w.-]+\.(?:js|css))["'`]/g)) {
              const url = './assets/' + m[1].replace(/^assets\//, '');
              try { await cache.add(url); } catch { /* not a real chunk */ }
            }
          }
        } catch { /* skip */ }
      }
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Pages: network first (to pick up updates), fall back to cache offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Assets: cache first; hashed filenames never change.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
