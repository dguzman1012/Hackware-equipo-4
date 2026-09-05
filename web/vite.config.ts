import { defineConfig } from 'vite';

// El server sirve web/dist como estático; no hay dev server de Vite: `vite build --watch`.
export default defineConfig({
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
});
