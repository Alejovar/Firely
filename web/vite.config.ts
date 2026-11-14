import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';

// Astryx components ship pre-built CSS (imported in main.tsx). The StyleX compiler only transforms files that import
// '@stylexjs/stylex', i.e. OUR source; tokens are referenced as var(--...) strings.
export default defineConfig(({ mode }) => ({
  plugins: [stylex.vite({ dev: mode !== 'production', useCSSLayers: true, runtimeInjection: false }), react()],
}));
