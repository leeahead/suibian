/* 碎片记忆 · service worker
 *
 * 只做一件事：让「打开」这一步不需要网络。
 * 所有数据在 IndexedDB 里，与这里无关——所以离线打开时页面照样能用。
 *
 * 策略：
 *   导航请求（打开页面）  → 网络优先，失败回落缓存（保证更新及时 + 断网可开）
 *   同源静态资源          → 缓存优先（图标、manifest）
 *   跨域请求（调 API）    → 一律直通，不缓存、不拦截
 *
 * 注意：service worker 只在 HTTPS 或 localhost 下注册成功。
 * 在局域网 http://10.x.x.x 上打开时注册会失败——这是规范行为，不是 bug，
 * 应用本身照常工作，只是没有离线外壳。
 */

const CACHE = 'suipian-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（API 调用）直通

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return r;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((r) => {
        if (r && r.status === 200 && r.type === 'basic') {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return r;
      });
    })
  );
});
