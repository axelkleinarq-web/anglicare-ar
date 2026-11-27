const CACHE = 'anglicare-ar-v2';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'lib/three.module.js', 'lib/mindar-image-three.prod.js', 'lib/controller-mGt1s8dJ.js', 'lib/ui-fBadYuor.js',
  'lib/addons/controls/OrbitControls.js', 'lib/addons/renderers/CSS3DRenderer.js',
  'assets/model.json', 'assets/targets.mind', 'assets/tracker.png', 'assets/tracker_colour.png', 'assets/icon-180.png', 'assets/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request))));
