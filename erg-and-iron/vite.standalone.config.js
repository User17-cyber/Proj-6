// Builds the app as one script that expects React on the page (loaded from a
// CDN), so tools/build-standalone.mjs can inline it into a single HTML file.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'react/jsx-runtime': fileURLToPath(new URL('./tools/jsx-runtime-shim.js', import.meta.url)),
    },
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.jsx',
      formats: ['iife'],
      name: 'ErgAndIron',
      fileName: () => 'app.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
      },
    },
  },
});
