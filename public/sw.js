/**
 * Service worker — makes Sea of Coin installable and playable offline.
 *
 * The whole game is a handful of static, same-origin files with no runtime
 * network calls, so caching is simple: stale-while-revalidate. Serve from cache
 * instantly when we have it (and refresh the copy in the background); fall back
 * to the network on a miss; when offline with no cache, serve the cached shell
 * for navigations. Bump CACHE to invalidate everything on a new release.
 *
 * Plain JS, no dependencies — consistent with the app's zero-dep philosophy.
 */

const CACHE = "sea-of-coin-v1";

self.addEventListener("install", () => {
  // Activate the new worker immediately rather than waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous releases (any name != current CACHE).
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache mutations (there are none, but be safe)

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);

      const network = fetch(req)
        .then((res) => {
          // Only cache successful, same-origin, basic responses.
          if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || (req.mode === "navigate" ? cache.match("/index.html") : undefined));

      // Stale-while-revalidate: cached first (fast, offline-safe); the network
      // promise still runs and refreshes the cache for next time.
      return cached || network;
    })(),
  );
});
