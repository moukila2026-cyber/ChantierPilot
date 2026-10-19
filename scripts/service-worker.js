// Cache public de la coque uniquement ; aucune réponse API et aucune photo privée.
const PRECACHE = __PRECACHE__;
const CACHE = __CACHE_NAME__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k.startsWith('cp-shell-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api'))return;
  if(request.mode==='navigate') {
    event.respondWith(fetch(request).catch(()=>caches.match('/terrain', { ignoreVary: true })));
  } else if(PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request, { ignoreVary: true }).then(hit=>hit||fetch(request)));
  }
});
