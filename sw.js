/**
 * sw.js — "service worker": permite instalar la app en el celular y que abra rápido.
 * Estrategia: primero intenta la red (para tener siempre la última versión) y, si no hay
 * internet, usa la copia guardada. Las llamadas al backend (Apps Script) nunca se guardan.
 * Al publicar cambios, subir el número de VERSION para renovar la copia guardada.
 */
const VERSION = 'tuapp-0.3.1';
const ARCHIVOS = [
  './', 'index.html', 'legales.html', 'css/base.css',
  'js/config.js', 'js/api.js', 'js/ui.js', 'js/cliente.js', 'js/vendor/qrcode.min.js',
  'plantillas/cafeteria/plantilla.css', 'plantillas/cafeteria/plantilla.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;   // backend, fuentes: directo a la red
  e.respondWith(
    fetch(e.request).then(function (r) {
      const copia = r.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copia); });
      return r;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
