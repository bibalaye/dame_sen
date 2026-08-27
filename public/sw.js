/**
 * Service worker minimal : le jeu doit rester jouable sans réseau.
 *
 * Stratégie « réseau d'abord, cache en secours » — le joueur reçoit toujours la
 * dernière version quand la connexion le permet, et garde une partie jouable
 * quand elle lâche. Le mode en ligne, lui, a besoin du réseau par nature.
 */
const CACHE = 'dame-sen-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Les échanges temps réel et les requêtes non-GET ne se mettent pas en cache.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached ?? caches.match('/')),
      ),
  );
});
