const CACHE_NAME = "milkometer-static-v2";
const SHELL_ASSETS = ["/manifest.webmanifest", "/icon.svg"];

function isLocalhost() {
  return (
    self.location.hostname === "localhost" ||
    self.location.hostname === "127.0.0.1" ||
    self.location.hostname === "[::1]"
  );
}

self.addEventListener("install", (event) => {
  if (isLocalhost()) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  if (isLocalhost()) {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        const clients = await self.clients.matchAll({ type: "window" });
        await self.registration.unregister();
        for (const client of clients) {
          if ("navigate" in client) {
            await client.navigate(client.url).catch(() => {});
          }
        }
      })(),
    );
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (isLocalhost()) return;

  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/signin")) return;

  // Cache-first only for hashed production Next static chunks & icons
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Network-first for HTML navigations so farm data stays fresh
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
