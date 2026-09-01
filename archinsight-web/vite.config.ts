import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    conditions: ['browser']
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,svelte}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/lib/generated/**',
        'src/lib/themes/**',
        // Declarative DI wiring is smoke-tested; its one closure per port is not a unit-coverage scope.
        'src/lib/workspace/shell/workspace-runtime.ts'
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
