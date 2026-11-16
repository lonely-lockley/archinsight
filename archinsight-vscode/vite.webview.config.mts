import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const sharedRuntimeDependencies = [
  'svelte',
  'monaco-editor',
  '@insight/language',
  '@archinsight/contracts',
  '@archinsight/editor-support'
];

export default defineConfig({
  base: './',
  plugins: [svelte()],
  resolve: {
    preserveSymlinks: false,
    dedupe: sharedRuntimeDependencies
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
