import { build } from 'esbuild';

await build({
  entryPoints: ['../packages/insight-language/src/node-parallel-parser-worker.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'build/project-source-parser-worker.mjs',
  sourcemap: true,
});
