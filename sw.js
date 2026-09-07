// OPEN CITY service worker: network-first with cache fallback, so the game
// stays fresh while you're online and still runs offline once visited.
const CACHE = 'opencity-v5-slots-replay-a11y';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(['.', 'index.html', 'manifest.json', 'icon.svg',
        'js/district.js', 'js/vehicleModel.js', 'js/characterModel.js', 'js/site-layout.js', 'js/input.js', 'js/wallet.js']).catch(() => {})
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n.startsWith('opencity-') && n !== CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never cache admin sessions, metrics, bank responses, or bearer requests.
  if (url.origin !== self.location.origin ||
      !/^\/(?:$|index\.html$|manifest\.json$|icon[^/]*$|js\/|assets\/)/.test(url.pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}));
        }
        return res;
      })
      .catch(async () => (await caches.match(e.request)) || new Response('Offline', { status: 503 }))
  );
});
