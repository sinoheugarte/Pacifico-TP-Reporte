const CACHE = 'pacifico-v57';
const ASSETS = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
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
      Promise.all(keys.filter(k => k !== CACHE && k !== 'sw-dl-v1').map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* Descarga forzada: la página almacena la respuesta en Cache API (sw-dl-v1)
     con Content-Type:octet-stream + Content-Disposition:attachment.
     El SW la sirve una sola vez y la borra del caché.
     Content-Disposition:attachment obliga al navegador a descargar
     sin abrir el visor de PDF → Android muestra la notificación ABRIR. */
  if (url.pathname.startsWith('/sw-download/')) {
    e.respondWith(
      caches.open('sw-dl-v1').then(cache =>
        cache.match(e.request).then(resp => {
          if (resp) { cache.delete(e.request); return resp; }
          return new Response('', { status: 404 });
        })
      )
    );
    return;
  }

  /* Datos dinámicos de Microsoft — nunca cachear, siempre red directa */
  if (url.hostname.endsWith('graph.microsoft.com') ||
      url.hostname.endsWith('sharepoint.com') ||
      url.hostname.endsWith('microsoftonline.com') ||
      url.hostname.endsWith('microsoft.com')) {
    return;
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
