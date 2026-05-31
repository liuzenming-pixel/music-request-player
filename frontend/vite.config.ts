import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

// 播放器用 AMLL【源码】构建(渲染正确、不漂;npm 发布产物 / tsdown 编译的 dist 都会让歌词下移)。
// 源码 vendor 在【仓库根 ../vendor-amll/】—— 放在 frontend(Vite root)之外,svgr 才能正常编译 .svg?react
// (Vite8/rolldown 对 root 内文件会跳过 svgr 的 JSX 编译)。其裸依赖通过 vendor-amll/node_modules
// 目录联接(junction → frontend/node_modules)解析。详见 ../vendor-amll/README。
const AMLL = resolve(__dirname, '../vendor-amll');

export default defineConfig({
  base: './',
  plugins: [svgr(), react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'jotai'],
    alias: {
      '@applemusic-like-lyrics/core/style.css': `${AMLL}/core/src/styles/index.css`,
      '@applemusic-like-lyrics/react-full': `${AMLL}/react-full/src`,
      '@applemusic-like-lyrics/react': `${AMLL}/react/src`,
      '@applemusic-like-lyrics/core': `${AMLL}/core/src`,
      '@applemusic-like-lyrics/lyric': `${AMLL}/lyric/src`,
      '@applemusic-like-lyrics/ttml': `${AMLL}/ttml/src`,
      // core 包内部的 package.json "imports" 子路径别名(我们只 vendor 了 src,需手动复刻)
      '#interfaces': `${AMLL}/core/src/interfaces.ts`,
      '#utils': `${AMLL}/core/src/utils`,
      '#styles': `${AMLL}/core/src/styles`,
      '#lyric': `${AMLL}/core/src/lyric-player`,
      '#bg': `${AMLL}/core/src/bg-player`,
    },
  },
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
        request: resolve(__dirname, 'request.html'),
        player: resolve(__dirname, 'player.html'),
      },
    },
  },
});
