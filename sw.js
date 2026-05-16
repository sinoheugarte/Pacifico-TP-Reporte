const CACHE = 'pacifico-v54';
const ASSETS = [
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

/* Almacén temporal para descargas servidas con Content-Disposition: attachment */
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

/* Recibe el buffer del PDF desde la página principal */
self.addEventListener('message', e => {
  if (e.data?.type === 'STORE_DL') {
    const { token, buffer, mime, filename } = e.data;
    _dlStore.set(token, { buffer, mime, filename });
    setTimeout(() => _dlStore.delete(token), 120000);
    e.ports[0]?.postMessage('ok');
  }
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* Descarga forzada via SW — responde con Content-Disposition: attachment
     para que Android Chrome muestre la notificación nativa de descarga */
  if (url.pathname.startsWith('/sw-download/')) {
    const token = url.pathname.split('/')[2];
    const entry = _dlStore.get(token);
    if (entry) {
      _dlStore.delete(token);
      e.respondWith(new Response(entry.buffer, {
        status: 200,
        headers: {
          'Content-Type': entry.mime,
          'Content-Disposition': `attachment; filename="${entry.filename}"`,
          'Content-Length': String(entry.buffer.byteLength)
        }
      }));
      return;
    }
  }

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
