/**
 * Service worker: network-first for the app shell, so a fresh upload always
 * shows up on your next reload — with a cached fallback only when you're
 * offline. (v1 of this file used cache-first, which meant updates could take
 * an extra reload or two to show up. Network-first fixes that.)
 */
const CACHE_NAME = "day-planner-v2-network-first";
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
  // Never touch API calls (GitHub Gist sync) — always straight to network.
  if (url.origin.includes("api.github.com")) return;
  if (url.origin !== self.location.origin) return; // let CDN scripts (Chart.js) pass through normally
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
