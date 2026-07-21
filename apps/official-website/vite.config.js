import { defineConfig } from 'vite';

export default defineConfig({
  root: './',
  build: {
    outDir: 'dist',
    assetsDir: 'website-assets',
    emptyOutDir: true,
  },
  server: {
    port: 5188,
  },
});
