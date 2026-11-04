import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { getServerConfig, getServerOrigin } from './src/server/config.js';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const target = getServerOrigin(getServerConfig(env));
  return {
    root: fileURLToPath(new URL('./src/client', import.meta.url)),
    plugins: [react(), {
      name: 'pomekhi-offline-shell', apply: 'build',
      generateBundle(_options, bundle) {
        const assets = Object.keys(bundle).filter(name => /\.(?:js|css|woff2)$/.test(name));
        const cache = 'pomekhi-shell-' + createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16);
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(['/', ...assets.map(name => '/' + name)])};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pomekhi-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
 if (event.request.mode === 'navigate' && url.pathname === '/') event.respondWith(fetch(event.request).catch(() => caches.match('/')));
 else if (ASSETS.includes(url.pathname)) event.respondWith(caches.match(url.pathname).then(value => value || fetch(event.request)));
});` });
      },
    }],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: {
        allow: ['src/client', 'src/shared', 'node_modules'].map(path => fileURLToPath(new URL(path, import.meta.url))),
        // Preserve Vite 8 defaults when extending its replacement deny list.
        deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/src/server/**', '**/dist/server/**', '**/data/**'],
      },
      proxy: {
        '/api': target,
        '/socket.io': { target, ws: true },
      },
    },
    build: {
      outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
      emptyOutDir: true,
    },
  };
});
