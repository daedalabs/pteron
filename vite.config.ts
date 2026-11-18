import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: '../public',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'development-csp',
      apply: 'serve',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          return html
            .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            .replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:*");
        }
      }
    }
  ],
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'src/index.html'),
        canvas: resolve(import.meta.dirname, 'src/canvas.html'),
        geometry: resolve(import.meta.dirname, 'src/geometry.html')
      }
    }
  },
  optimizeDeps: {
    entries: ['index.html', 'canvas.html', 'geometry.html']
  },
  server: {
    host: '127.0.0.1',
    watch: {
      ignored: ['**/artifacts/**', '**/.tools/**', '**/.venv/**', '**/dist/**']
    }
  }
});
