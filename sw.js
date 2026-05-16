const CACHE = 'pacifico-v55';
const ASSETS = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

/* Almacén temporal para descargas de PDF forzadas via SW */
const _dlStore = new Map();

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

/* La página envía el ArrayBuffer del PDF; el SW lo guarda y devuelve 'ok' */
self.addEventListener('message', e => {
  if (e.data?.type === 'STORE_DL') {
    const { token, buffer, filename } = e.data;
    _dlStore.set(token, { buffer, filename });
    setTimeout(() => _dlStore.delete(token), 120000);
    e.ports[0]?.postMessage('ok');
  }
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* Descarga forzada: octet-stream + nosniff + attachment impide que
     Chrome detecte los bytes %PDF- y abra el visor en lugar del
     gestor de descargas nativo con la notificación ABRIR */
  if (url.pathname.startsWith('/sw-download/')) {
    const token = url.pathname.split('/')[2];
    const entry = _dlStore.get(token);
    if (entry) {
      _dlStore.delete(token);
      e.respondWith(new Response(entry.buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${entry.filename}"`,
          'X-Content-Type-Options': 'nosniff',
          'Content-Length': String(entry.buffer.byteLength)
        }
      }));
      return;
    }
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
