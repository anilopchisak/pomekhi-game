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
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: {
        allow: ['src/client', 'src/shared', 'node_modules'].map(path => fileURLToPath(new URL(path, import.meta.url))),
        // Preserve Vite 8 defaults when extending its replacement deny list.
        deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/src/server/**', '**/dist/server/**'],
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
