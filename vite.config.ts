import { defineConfig } from 'vite';

// Vite config: add a proxy for /api -> https://api.deezer.com during development
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://api.deezer.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
