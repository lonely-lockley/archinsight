import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const webSources = fileURLToPath(new URL('./src', import.meta.url));
const workbenchSources = fileURLToPath(
  new URL('../packages/archinsight-workbench/src', import.meta.url)
);

export default defineConfig(({ mode }) => ({
  plugins: [sveltekit()],
  resolve: {
    conditions: ['browser'],
    // V8 ignores node_modules coverage. Resolve the linked workbench to its physical sources in
    // tests, while keeping peer-dependency lookup stable for normal application builds.
    preserveSymlinks: mode !== 'test',
    dedupe: mode === 'test'
      ? [
          'svelte',
          'monaco-editor',
          '@insight/language',
          '@archinsight/contracts',
          '@archinsight/editor-support'
        ]
      : []
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      allowExternal: true,
      include: [`${webSources}/**/*.{ts,svelte}`, `${workbenchSources}/**/*.{ts,svelte}`],
      exclude: [
        `${webSources}/**/*.test.ts`,
        `${webSources}/**/*.test-support.ts`,
        `${webSources}/**/*.d.ts`,
        `${webSources}/lib/generated/**`,
        `${workbenchSources}/themes/**`,
        // Declarative DI wiring is smoke-tested; its one closure per port is not a unit-coverage scope.
        `${webSources}/lib/workspace/shell/workspace-runtime.ts`
      ]
    }
  },
  optimizeDeps: {
    exclude: ['@insight/language']
  },
  server: {
    port: 5173
  }
}));
