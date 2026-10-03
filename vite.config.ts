import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { visualizer } from 'rollup-plugin-visualizer';
import pkg from './package.json';

/**
 * Forces a full page reload when a hook file is saved, instead of hot-swapping it.
 */
const fullReloadOnHooksChange = {
  name: 'full-reload-on-hooks-change',
  handleHotUpdate({ file, server }: { file: string; server: any }) {
    if (file.includes('/src/js/hooks/')) {
      server.ws.send({ type: 'full-reload' });
      return [];
    }
  },
};

/**
 * Image proxy for WebGL textures to prevent cross-origin canvas tainting in dev server.
 */
const imageProxyPlugin = {
  name: 'image-proxy',
  configureServer(server: any) {
    server.middlewares.use('/api/proxy-image', async (req: any, res: any) => {
      const url = new URL(req.url, 'http://localhost').searchParams.get('url');
      if (!url) {
        res.statusCode = 400;
        return res.end('Missing url');
      }
      try {
        const response = await fetch(url);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
        const buffer = await response.arrayBuffer();
        res.end(Buffer.from(buffer));
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
  },
};

export default defineConfig(({ mode }) => ({
  appType: 'spa',
  plugins: [
    react(),
    svgr(),
    fullReloadOnHooksChange,
    imageProxyPlugin,
    (Boolean(process.env.ANALYZE) || mode === 'analyze') &&
      visualizer({ open: true, filename: 'build/stats.html', gzipSize: true, brotliSize: true }),
  ].filter(Boolean) as any,
  resolve: {
    tsconfigPaths: true,
  },
  define: {
    'import.meta.env.VITE_DATE': JSON.stringify(process.env.VITE_DATE || String(Math.floor(Date.now() / 1000))),
    'import.meta.env.VITE_VERSION': JSON.stringify(process.env.VITE_VERSION || pkg.version),
  },
  server: {
    host: true,
    port: 4000,
    open: !process.env.ELECTRON,
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    target: 'es2020',
    rolldownOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/@radix-ui/')) {
            return 'radix';
          }
          if (id.includes('node_modules/dashjs/')) {
            return 'dashjs';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/_archived/**'],
    env: {
      VITE_ENV: 'local',
    },
  },
}));
