/* TRIZONE Next — sw.js · BUILD next-0.12.0 · 2026-08-05 */
const CACHE = "trizone-next-0.12.0";
const NETWORK_FIRST = ["index.html", "plan.json"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c =>
    c.addAll(["./", "./index.html", "./styles.css", "./core.js", "./ui.js", "./plan.json"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const nf = NETWORK_FIRST.some(p => url.pathname.endsWith(p)) || url.pathname.endsWith("/");
  e.respondWith(
    nf ? fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
           .catch(() => caches.match(e.request))
       : caches.match(e.request).then(r => r || fetch(e.request))
  );
});
