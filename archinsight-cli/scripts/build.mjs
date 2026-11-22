import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

rmSync('build', { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: true,
  preserveSymlinks: true,
  outdir: 'build',
  external: ['@viz-js/viz', '@resvg/resvg-js'],
  alias: {
    '@archinsight/icons': path.resolve('../packages/archinsight-icons/src/index.js'),
  },
};

// Only the published CLI entry needs the lazy SVG chunks. Auxiliary contract
// entry points are built separately so esbuild cannot duplicate every bucket.
await build({
  ...shared,
  entryPoints: ['src/index.ts'],
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
});
await build({
  ...shared,
  entryPoints: ['src/system-theme.ts', 'src/git-adapter-contract-entry.ts', 'src/cache-contract-entry.ts'],
});
await build({
  ...shared,
  entryPoints: {
    'project-source-parser-worker': '../packages/insight-language/src/node-parallel-parser-worker.ts',
  },
});

mkdirSync('build/licenses', { recursive: true });
copyFileSync('../packages/archinsight-icons/src/generated/DEVICON-LICENSE', 'build/licenses/DEVICON-LICENSE');
const iconAudit = JSON.parse(readFileSync('../packages/archinsight-icons/src/generated/audit.json', 'utf8'));
writeFileSync('build/licenses/technology-icons-source.json', `${JSON.stringify({
  ...iconAudit.source,
  license: 'MIT',
  notice: 'Product names, logos, and brands remain subject to their respective owners.',
}, null, 2)}\n`);
