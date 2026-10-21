// Cache public de la coque uniquement ; aucune réponse API, aucune photo privée
// et aucune altération des saisies terrain locales (file hors connexion IndexedDB préservée intégralement).
const PRECACHE = __PRECACHE__;
const CACHE = __CACHE_NAME__;
const PRIMARY_CSS = PRECACHE.find((p) => /^\/assets\/index-[^/]+\.css$/.test(p)) || '';
const HASHED_INDEX_CSS_RE = /^\/assets\/index-[A-Za-z0-9_-]+\.css$/;
const STATIC_ASSET_RE = /\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|wasm|bcmap|webmanifest)$/i;

function isValidAssetResponse(pathname, response) {
  if (!response || !response.ok) return false;
  if (!STATIC_ASSET_RE.test(pathname)) return true;
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  // Empêche de mettre en cache ou de servir index.html à la place d'un CSS, JS ou d'une image.
  return !ct.startsWith('text/html');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        PRECACHE.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' });
          if (!isValidAssetResponse(url, response)) {
            throw new Error(`Ressource invalide lors de la pré-mise en cache : ${url}`);
          }
          await cache.put(url, response);
        }),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  // Nettoyage complet de TOUS les anciens CacheStorage HTTP obsolètes (y compris les versions historiques).
  // IndexedDB (chantierpilot-terrain-v1 : saisies terrain et file de synchronisation) n'est JAMAIS touché.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(async () => {
        const windows = await self.clients.matchAll({ type: 'window' });
        for (const client of windows) {
          client.postMessage({ type: 'CP_SW_ACTIVATED', cache: CACHE });
        }
      }),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok && (url.pathname === '/' || url.pathname === '/terrain')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(url.pathname, { ignoreVary: true });
          if (exact) return exact;
          const terrain = await caches.match('/terrain', { ignoreVary: true });
          if (terrain) return terrain;
          return caches.match('/', { ignoreVary: true });
        }),
    );
    return;
  }

  // Auto-réparation CSS : si un onglet resté sur un ancien HTML réclame un ancien bundle index-<hash>.css
  // supprimé lors d'un redéploiement Vercel, on lui sert la feuille CSS universelle courante au lieu d'un 404.
  if (HASHED_INDEX_CSS_RE.test(url.pathname) && !PRECACHE.includes(url.pathname) && PRIMARY_CSS) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const fallbackCss = await cache.match(PRIMARY_CSS, { ignoreVary: true });
        if (fallbackCss && isValidAssetResponse(PRIMARY_CSS, fallbackCss)) return fallbackCss;
        return fetch(PRIMARY_CSS);
      }),
    );
    return;
  }

  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request, { ignoreVary: true });
        if (hit && isValidAssetResponse(url.pathname, hit)) return hit;
        if (hit) await cache.delete(request).catch(() => {});
        const fresh = await fetch(request);
        if (isValidAssetResponse(url.pathname, fresh)) {
          await cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      }),
    );
  }
});
