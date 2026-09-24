import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    conditions: ['browser'],
    alias: [
      { find: '@insight/language', replacement: fileURLToPath(new URL('../packages/insight-language/src/index.ts', import.meta.url)) },
      { find: /^monaco-editor$/, replacement: fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs/editor/editor.api.js', import.meta.url)) }
    ]
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.ui.test.ts']
  }
});
