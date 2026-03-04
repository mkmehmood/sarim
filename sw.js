// Service Worker for GULL AND ZUBAIR NASWAR DEALERS
const CACHE_NAME = 'gznd-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/virtual-scroll.js',
  './js/crypto.js',
  './js/idb-storage.js',
  './js/device-core.js',
  './js/app-globals.js',
  './js/delta-sync.js',
  './js/firebase-init.js',
  './js/sync-engine.js',
  './js/auth.js',
  './js/backup-restore.js',
  './js/ui-tabs.js',
  './js/ui-views.js',
  './js/ui-utils.js',
  './js/close-year.js',
  './js/device-management.js',
  './js/team-management.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  // Network-first for Firebase/API calls, cache-first for static assets
  const url = new URL(event.request.url);
  const isExternal = url.origin !== self.location.origin;
  const isFirebase = url.hostname.includes('firebase') || url.hostname.includes('googleapis');

  if (isExternal || isFirebase) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || fetchPromise;
    })
  );
});
