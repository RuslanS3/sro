import { defineConfig } from 'vite';
// @ts-ignore
import react from '@vitejs/plugin-react';
// @ts-ignore
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  root: '.',
  publicDir: false,
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  }
});
