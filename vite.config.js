import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { flattenToUniversalCss } from './scripts/flatten-css.mjs';

// Ressources PDF.js locales : aucun CDN, polices et plans restent sur la même origine.
const pdfResources = new Map(
  ['cmaps', 'standard_fonts', 'wasm'].flatMap((dir) =>
    readdirSync(new URL(`./node_modules/pdfjs-dist/${dir}/`, import.meta.url)).map((name) => [
      `pdfjs/${dir}/${name}`,
      new URL(`./node_modules/pdfjs-dist/${dir}/${name}`, import.meta.url),
    ]),
  ),
);

const PUBLIC_PRECACHE = [
  '/',
  '/terrain',
  '/logo.svg',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/site.webmanifest',
  '/images/landing/chantier-abidjan.webp',
  '/images/landing/chantier-abidjan.jpg',
  '/images/landing/equipe-terrain.webp',
  '/images/landing/equipe-terrain.jpg',
  '/images/landing/suivi-budget.webp',
  '/images/landing/suivi-budget.jpg',
];

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-pdf-resources',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const key = new URL(req.url, 'http://local').pathname.slice(1);
          const file = pdfResources.get(key);
          if (!file) return next();
          res.setHeader(
            'Content-Type',
            key.endsWith('.wasm')
              ? 'application/wasm'
              : key.endsWith('.js')
                ? 'application/javascript'
                : 'application/octet-stream',
          );
          res.end(readFileSync(file));
        });
      },
      generateBundle() {
        for (const [fileName, file] of pdfResources) {
          this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
        }
      },
      async closeBundle() {
        const distUrl = new URL('./dist/', import.meta.url);
        const assetsDir = new URL('./dist/assets/', import.meta.url);
        if (!existsSync(distUrl) || !existsSync(assetsDir)) return;

        // 1. Transpile toutes les feuilles CSS compilées en CSS3 universel sans @layer / oklch / oklab / @property
        const assetFiles = readdirSync(assetsDir);
        const cssParts = [];
        for (const name of assetFiles) {
          if (!name.endsWith('.css')) continue;
          const cssUrl = new URL(`./dist/assets/${name}`, import.meta.url);
          const rawCss = readFileSync(cssUrl, 'utf8');
          const universalCss = await flattenToUniversalCss(rawCss);
          writeFileSync(cssUrl, universalCss);
          cssParts.push(universalCss);
        }

        // 2. Calcule le cache versionné du Service Worker sur les assets finaux
        const assets = assetFiles
          .filter((name) => /\.(?:js|mjs|css|jpg|jpeg|webp|png|svg)$/.test(name))
          .map((name) => `/assets/${name}`);
        const pdfScripts = existsSync(new URL('./dist/pdfjs/wasm/', import.meta.url))
          ? readdirSync(new URL('./dist/pdfjs/wasm/', import.meta.url))
              .filter((name) => name.endsWith('.js'))
              .map((name) => `/pdfjs/wasm/${name}`)
          : [];
        const precache = [...PUBLIC_PRECACHE, ...assets, ...pdfScripts];
        const version = createHash('sha256').update(precache.join('\n') + cssParts.join('\n')).digest('hex').slice(0, 12);
        const cacheName = `cp-shell-${version}`;

        const sw = readFileSync(new URL('./scripts/service-worker.js', import.meta.url), 'utf8')
          .replace('__PRECACHE__', () => JSON.stringify(precache))
          .replace('__CACHE_NAME__', () => JSON.stringify(cacheName));
        writeFileSync(new URL('./dist/sw.js', import.meta.url), sw);

        // 3. Double garantie sur dist/index.html :
        //    - retire crossorigin inutile sur même origine
        //    - injecte <meta name="cp-cache-version"> pour purge immédiate des vieux caches HTTP
        //    - embarque aussi le CSS universel inline dans <style id="cp-inline-css"> (zéro FOUC, zéro blocage réseau)
        const htmlUrl = new URL('./dist/index.html', import.meta.url);
        let html = readFileSync(htmlUrl, 'utf8').replace(/\s+crossorigin(?:="[^"]*")?/g, '');
        const inlineBlock = [
          `<meta name="cp-cache-version" content="${cacheName}" />`,
          cssParts.length > 0 ? `<style id="cp-inline-css">${cssParts.join('\n').replace(/<\/style/gi, '<\\/style')}</style>` : '',
        ].filter(Boolean).join('\n    ');
        html = html.replace('</head>', () => `    ${inlineBlock}\n  </head>`);
        writeFileSync(htmlUrl, html);
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 8787}`,
        changeOrigin: false,
      },
    },
  },
  preview: {
    proxy: { '/api': { target: `http://localhost:${process.env.API_PORT || 8787}`, changeOrigin: false } },
    host: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    cssTarget: ['chrome79', 'safari13', 'ios13', 'firefox72'],
    sourcemap: false,
  },
});
