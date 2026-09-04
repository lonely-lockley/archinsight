import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  resolve: {
    preserveSymlinks: true
  },
  optimizeDeps: {
    exclude: ['@insight/language']
  },
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        workbench: 'src/webview/workbench-main.ts',
        controls: 'src/webview/controls-main.ts'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
