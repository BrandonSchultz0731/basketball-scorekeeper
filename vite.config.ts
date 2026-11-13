import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';

// BASE_PATH is set by the GitHub Pages workflow ("/<repo>/"); local dev serves from "/".
// basicSsl serves dev/preview over HTTPS with a self-signed cert, because iPhone Safari only
// allows camera access on HTTPS. It has no effect on `vite build`.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), basicSsl({ name: 'pickup-scorekeeper-dev' })],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        spike: resolve(import.meta.dirname, 'spike/index.html'),
        label: resolve(import.meta.dirname, 'label/index.html'),
        score: resolve(import.meta.dirname, 'score/index.html'),
        watch: resolve(import.meta.dirname, 'watch/index.html'),
      },
    },
  },
});
