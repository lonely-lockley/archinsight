import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const sharedRuntimeDependencies = [
  'svelte',
  'monaco-editor',
  '@insight/language',
  '@archinsight/icons',
  '@archinsight/contracts',
  '@archinsight/editor-support'
];

export default defineConfig({
  base: './',
  plugins: [svelte()],
  resolve: {
    preserveSymlinks: false,
    dedupe: sharedRuntimeDependencies,
    alias: {
      '@archinsight/icons': fileURLToPath(new URL('../packages/archinsight-icons/src/index.js', import.meta.url))
    }
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
