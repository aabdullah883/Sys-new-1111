/* Service Worker — نظام الموارد البشرية */
const CACHE = 'hr-shell-v2';
const SHELL = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // بيانات السيرفر: الشبكة دائماً، بدون أي تخزين
  if (url.pathname.indexOf('/api/') === 0) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  const isAppShell = url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('.js');

  if (isAppShell) {
    // الواجهة نفسها: الشبكة أولاً دائماً كي يصل أي تحديث فوراً (مهم خصوصاً على Chrome)
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(r => {
        if (r && r.status === 200 && url.origin === self.location.origin) {
          const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // الأيقونات وملف التطبيق الثابت: كاش أولاً، لا حاجة لتحديثها كل مرة
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r && r.status === 200 && url.origin === self.location.origin) {
        const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }))
  );
});
