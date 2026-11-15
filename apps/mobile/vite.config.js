import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || loadEnv(mode, process.cwd()).VITE_API_URL || '/api') },
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true,
    fs: { allow: [fileURLToPath(new URL('./', import.meta.url)), fileURLToPath(new URL('../../packages/', import.meta.url))] },
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true } },
  },
}));
