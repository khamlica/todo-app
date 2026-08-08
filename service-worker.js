const CACHE = "todo-app-v587";

/* app shell precached so everything works offline */
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=587",
  "./app.js?v=587",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(ASSETS);
  }));
  self.skipWaiting();
});

/* remove old caches when a new version activates */
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    const deletions = [];
    for (let i = 0; i < names.length; i++) {
      if (names[i] !== CACHE) {
        deletions.push(caches.delete(names[i]));
      }
    }
    return Promise.all(deletions);
  }));
  self.clients.claim();
});

/* network-first for the app code (so edits show up online), cache-first for the rest */
self.addEventListener("fetch", function (event) {
  const request = event.request;
  const path = new URL(request.url).pathname;
  if (request.mode === "navigate" || /\.(html|js|css|webmanifest)$/.test(path)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/* try the network and refresh the cache, fall back to cache when offline */
function networkFirst(request) {
  return fetch(request).then(function (response) {
    const copy = response.clone();
    caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
    return response;
  }).catch(function () {
    return caches.match(request);
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function (cached) {
    return cached || fetch(request);
  });
}

/* focus the app (or open it) when a reminder notification is tapped */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window" }).then(function (windows) {
    for (let i = 0; i < windows.length; i++) {
      if ("focus" in windows[i]) return windows[i].focus();
    }
    if (clients.openWindow) return clients.openWindow("./");
  }));
});
