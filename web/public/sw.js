// Firely service worker (§12.5 PWA offline).
// - App shell and built assets: cache-first (they are content-hashed by Vite).
// - Navigations: network-first, falling back to the cached shell so the app opens without signal.
// - API GET responses: network-first; the last good answer is kept and served offline with
//   the header `x-firely-offline: 1` so the UI can say "datos guardados".
// - Map tiles/styles: stale-while-revalidate with a size cap.
const VERSION = 'firely-v1';
const SHELL = `${VERSION}-shell`;
const API = `${VERSION}-api`;
const TILES = `${VERSION}-tiles`;
const MAX_TILES = 600;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function isApi(url) {
  return /\/(calendar|events|season|analogs|return-period|weekday|night|context|weather|risk|territory|recurrence|hotspots\.geojson|reported|watch|bulletin|admin\/search|regimes)(\/|\?|$)/.test(url.pathname);
}
function isTile(url) {
  return /tile|\.pbf$|\.mvt$|\/styles?\/|glyphs|sprite/.test(url.pathname + url.hostname);
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (!hit) throw error;
    const headers = new Headers(hit.headers);
    headers.set('x-firely-offline', '1');
    return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const update = fetch(request).then(response => {
    if (response.ok) { cache.put(request, response.clone()); trimCache(cacheName, MAX_TILES); }
    return response;
  }).catch(() => hit);
  return hit || update;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  if (url.origin === self.location.origin && /\/assets\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }
  if (isApi(url)) {
    event.respondWith(networkFirst(request, API));
    return;
  }
  if (url.origin !== self.location.origin && isTile(url)) {
    event.respondWith(staleWhileRevalidate(request, TILES));
  }
});
