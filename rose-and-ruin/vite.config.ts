import { defineConfig } from 'vite';

// The game client. `npm run dev` starts this alongside the game server (scripts/dev.mjs);
// websocket traffic on /ws is proxied to the server so multiplayer works in development.
export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
