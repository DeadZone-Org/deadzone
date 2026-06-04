import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      // dev: forward API calls to the local gateway
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8787', changeOrigin: true },
    },
  },
});
