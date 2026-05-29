import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  server: {
    proxy: {
      '/api': {
        target: 'http://39.105.51.114:5123',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    rollupOptions: {
      input: {
        player: resolve(__dirname, 'index.html'),
        request: resolve(__dirname, 'request.html'),
      },
    },
  },
});
