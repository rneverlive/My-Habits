const CACHE_NAME = "hst-cache-v1";
const APP_SHELL = [
  "/My-Habits/",
  "/My-Habits/index.html",
  "/My-Habits/manifest.webmanifest",
  "/My-Habits/app.js",
  "/My-Habits/icons/icon-192.png",
  "/My-Habits/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method === "GET" && request.mode !== "navigate") {
    e.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return resp;
        })
      )
    );
    return;
  }
  e.respondWith(
    fetch(request).catch(() => caches.match("/My-Habits/index.html"))
  );
});
