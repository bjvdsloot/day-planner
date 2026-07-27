/**
 * Minimal service worker: caches the app shell so it loads instantly and
 * works offline (your data still syncs to the Gist once you're back online).
 */
const CACHE_NAME = "day-planner-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./gistSync.js",
  "./scheduler.js",
  "./reminders.js",
  "./charts.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls (GitHub Gist sync) — always go to network for those.
  if (url.origin.includes("api.github.com")) return;
  if (url.origin !== self.location.origin) return; // let CDN scripts (Chart.js) pass through normally

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
        return networkResponse;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
