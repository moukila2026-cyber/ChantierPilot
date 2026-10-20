import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
            key.endsWith('.js') || key.endsWith('.mjs')
              ? 'text/javascript'
              : key.endsWith('.wasm')
                ? 'application/wasm'
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
    },
    {
      name: 'terrain-offline-shell',
      generateBundle(_, bundle) {
        const assets = Object.keys(bundle)
          .filter((name) => /\.(js|mjs|css)$/.test(name))
          .map((name) => `/${name}`);
        const files = [...new Set([...PUBLIC_PRECACHE, ...assets])];
        const hasher = createHash('sha256').update(JSON.stringify(files));
        for (const pub of PUBLIC_PRECACHE) {
          if (pub === '/' || pub === '/terrain') continue;
          const p = new URL(`./public${pub}`, import.meta.url);
          if (existsSync(p)) hasher.update(readFileSync(p));
        }
        const version = hasher.digest('hex').slice(0, 12);
        const source = readFileSync(new URL('./scripts/service-worker.js', import.meta.url), 'utf8')
          .replace('__PRECACHE__', JSON.stringify(files))
          .replace('__CACHE_NAME__', JSON.stringify(`cp-shell-${version}`));
        this.emitFile({ type: 'asset', fileName: 'sw.js', source });
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
    sourcemap: false,
  },
});
