import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_URL ?? 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep the heavy NEAR SDK out of the app shell chunk so a change to a
        // page never invalidates the wallet/runtime code in the browser cache.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          near: ['near-api-js', '@near-wallet-selector/core', '@near-wallet-selector/near-wallet'],
          ui: ['lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
