// Service worker minimal : l'écran (sans aucune donnée) s'ouvre instantanément, même pendant le réveil du serveur.
// Rien de ce qui touche à l'API ou aux licences n'est jamais mis en cache.
const CACHE = 'master-shell-v1';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname !== '/') return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match('/');
    const net = fetch(e.request).then((r) => { if (r.ok) c.put('/', r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
