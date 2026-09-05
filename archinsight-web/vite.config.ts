import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const webSources = fileURLToPath(new URL('./src', import.meta.url));
const workbenchSources = fileURLToPath(
  new URL('../packages/archinsight-workbench/src', import.meta.url)
);
const sharedRuntimeDependencies = [
  'svelte',
  'monaco-editor',
  '@insight/language',
  '@archinsight/contracts',
  '@archinsight/editor-support'
];

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    conditions: ['browser'],
    // Resolve the linked workbench to its physical sources and keep browser singletons canonical.
    // Separate symlink and physical module ids can register Monaco extensions more than once.
    preserveSymlinks: false,
    dedupe: sharedRuntimeDependencies
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
});
