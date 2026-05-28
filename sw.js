const CACHE = 'pacifico-v156';
const ASSETS = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* Datos dinámicos de Microsoft — nunca cachear, siempre red directa.
     Si el SW devolviera una respuesta cacheada aquí, los registros nuevos
     creados desde otro dispositivo no se verían hasta limpiar el caché. */
  if (url.hostname.endsWith('graph.microsoft.com') ||
      url.hostname.endsWith('sharepoint.com') ||
      url.hostname.endsWith('microsoftonline.com') ||
      url.hostname.endsWith('microsoft.com')) {
    return; // sin respondWith → el navegador gestiona el request normalmente
  }

  /* Network-first para mismo origen (index.html siempre fresco) */
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  /* Cache-first para assets CDN estáticos (fuentes, librerías) */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
