import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';

// Astryx components ship pre-built CSS (imported in main.tsx). The StyleX compiler only transforms files that import
// '@stylexjs/stylex', i.e. OUR source; tokens are referenced as var(--...) strings.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = process.env.FIRELY_API_PROXY_TARGET || env.FIRELY_API_PROXY_TARGET || 'http://127.0.0.1:8000';
  const proxy = { '/api': { target, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api(?=\/|$)/, '') } };
  // The SSH tunnel reaches nginx, which still expects /api; a direct API target does not.
  if ((process.env.FIRELY_API_PROXY_PATH || env.FIRELY_API_PROXY_PATH) === 'preserve') {
    proxy['/api'].rewrite = (path: string) => path;
  }
  return {
    plugins: [stylex.vite({ dev: mode !== 'production', useCSSLayers: true, runtimeInjection: false }), react()],
    server: { proxy }, preview: { proxy },
  };
});
