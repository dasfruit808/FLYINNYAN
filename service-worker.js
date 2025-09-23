const CACHE_VERSION = 'flyin-nyan-v1';
const PRECACHE_PATHS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'styles/main.css',
  'scripts/app.js',
  'assets/logo.png',
  'assets/background.png',
  'assets/background1.png',
  'assets/background2.png',
  'assets/background3.png',
  'assets/player.png',
  'assets/player2.png',
  'assets/player3.png',
  'assets/villain1.png',
  'assets/villain2.png',
  'assets/villain3.png',
  'assets/powerbomb.png',
  'assets/powerburger.png',
  'assets/powerpizza.png',
  'assets/powerbeam.svg',
  'assets/powerchrono.svg',
  'assets/powerdouble.svg',
  'assets/powerdoubler.svg',
  'assets/powerember.svg',
  'assets/powermagnet.svg',
  'assets/weapon-pulse.svg',
  'assets/weapon-scatter.svg',
  'assets/weapon-lance.svg',
  'assets/asteroid1.png',
  'assets/asteroid2.png',
  'assets/asteroid3.png',
  'assets/boss1.png',
  'assets/point.png',
  'assets/point2.png',
  'assets/point3.png',
  'assets/character-happy.png',
  'assets/character-sad.png',
  'assets/character-cheering.png',
  'assets/audio/gameplay.mp3',
  'assets/audio/point.mp3',
  'assets/audio/projectile-standard.mp3',
  'assets/audio/projectile-spread.mp3',
  'assets/audio/projectile-missile.mp3',
  'assets/audio/explosion-generic.mp3',
  'assets/audio/explosion-asteroid.mp3',
  'assets/audio/explosion-powerbomb.mp3',
  'assets/audio/explosion-villain1.mp3',
  'assets/audio/explosion-villain2.mp3',
  'assets/audio/explosion-villain3.mp3',
  'assets/audio/hyperbeam.mp3',
  'assets/pump.png',
  'assets/FlightTime.ttf'
];

function toCacheUrls(paths) {
  const scope = self.registration?.scope ?? self.location.origin;
  return paths.map((path) => new URL(path, scope).toString());
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const urls = toCacheUrls(PRECACHE_PATHS);
      await Promise.all(
        urls.map(async (url) => {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn('[service-worker] Failed to precache', url, error);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const scope = self.registration?.scope ?? self.location.origin;
  if (requestUrl.origin !== new URL(scope).origin) {
    return;
  }

  const isDocumentRequest =
    event.request.mode === 'navigate' ||
    (event.request.destination === 'document' && event.request.mode === 'cors');

  if (isDocumentRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match(new URL('index.html', scope).toString());
          return cached ?? caches.match(event.request);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request));
    })
  );
});
