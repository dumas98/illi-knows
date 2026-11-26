import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The end-to-end tests run their own API and web server on other ports.
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: !!process.env.WEB_PORT,
    proxy: {
      '/api': process.env.API_PROXY ?? 'http://localhost:4000'
    }
  }
});
