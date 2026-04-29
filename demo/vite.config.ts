import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: 'mock-data',
  resolve: {
    alias: {
      '@vuer-ai/vuer-m3u/styles.css': resolve(__dirname, '../src/styles.css'),
      '@vuer-ai/vuer-m3u/preview': resolve(__dirname, '../src/preview/index.ts'),
      '@vuer-ai/vuer-m3u': resolve(__dirname, '../src/index.ts'),
    },
  },
});
