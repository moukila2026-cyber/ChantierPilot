import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Purge automatique des anciens CacheStorage HTTP obsolètes (jamais d'IndexedDB :
// toutes les saisies hors connexion dans chantierpilot-terrain-v1 restent intactes)
// et rafraîchissement doux unique si une nouvelle version du Service Worker s'active.
async function syncServiceWorkerSafely() {
  if (!('serviceWorker' in navigator)) return;
  const expectedCache = document.querySelector('meta[name="cp-cache-version"]')?.getAttribute('content') || '';

  navigator.serviceWorker.addEventListener('message', (event) => {
    const incomingCache = event.data?.cache;
    if (event.data?.type === 'CP_SW_ACTIVATED' && incomingCache && expectedCache && incomingCache !== expectedCache) {
      const guardKey = `cp-reloaded-${incomingCache}`;
      if (!sessionStorage.getItem(guardKey)) {
        sessionStorage.setItem(guardKey, '1');
        window.location.reload();
      }
    }
  });

  try {
    if ('caches' in window && expectedCache) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== expectedCache)
          .map((k) => caches.delete(k)),
      );
    }
  } catch {
    // Stockage de cache indisponible : on ignore sans bloquer l'interface.
  }

  try {
    const swUrl = expectedCache ? `/sw.js?v=${encodeURIComponent(expectedCache)}` : '/sw.js';
    const reg = await navigator.serviceWorker.register(swUrl, { scope: '/', updateViaCache: 'none' });
    reg.update().catch(() => {});
  } catch {
    // Pas de blocage si le navigateur refuse les Service Workers (navigation privée stricte, etc.).
  }
}

if (import.meta.env.PROD) {
  if (document.readyState === 'complete') {
    syncServiceWorkerSafely();
  } else {
    window.addEventListener('load', syncServiceWorkerSafely, { once: true });
  }
}
