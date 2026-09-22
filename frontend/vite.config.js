import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        developer: resolve(__dirname, 'developer.html'),
      },
    },
  },
});
