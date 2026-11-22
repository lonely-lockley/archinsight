import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadTechnologyIconSvg, technologyIconCatalog } from '../../packages/archinsight-icons/src/index.js';

for (const output of [
  'dist/extension.cjs',
  'dist/project-analysis-worker.cjs',
  'dist/project-source-parser-worker.cjs',
  'dist/diagram-viz-worker.cjs',
  'dist/diagram-viz-worker.mjs',
  'dist/diagram-chunks',
  'dist/icon-assets',
  'dist/licenses',
]) rmSync(output, { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: 'node',
  preserveSymlinks: true,
  outdir: 'dist',
  external: ['vscode', '@viz-js/viz'],
};

await build({
  ...shared,
  entryPoints: {
    extension: 'src/extension.ts',
    'project-analysis-worker': 'src/project-analysis-worker.ts',
    'project-source-parser-worker': '../packages/insight-language/src/node-parallel-parser-worker.ts',
  },
  format: 'cjs',
  entryNames: '[name]',
  outExtension: { '.js': '.cjs' },
});

await build({
  ...shared,
  entryPoints: ['src/diagram-viz-worker.ts'],
  format: 'esm',
  splitting: true,
  entryNames: '[name]',
  chunkNames: 'diagram-chunks/[name]-[hash]',
  outExtension: { '.js': '.mjs' },
  alias: {
    '@archinsight/icons': path.resolve('../packages/archinsight-icons/src/index.js'),
  },
});

const targetAssets = path.resolve('dist/icon-assets');
mkdirSync(targetAssets, { recursive: true });
for (const { id } of technologyIconCatalog()) {
  const svg = await loadTechnologyIconSvg(id);
  if (svg === undefined) throw new Error(`Missing packaged technology icon '${id}'`);
  writeFileSync(path.join(targetAssets, `${id}.svg`), svg);
}

mkdirSync('dist/licenses', { recursive: true });
copyFileSync('../packages/archinsight-icons/src/generated/DEVICON-LICENSE', 'dist/licenses/DEVICON-LICENSE');
const iconAudit = JSON.parse(readFileSync('../packages/archinsight-icons/src/generated/audit.json', 'utf8'));
writeFileSync('dist/licenses/technology-icons-source.json', `${JSON.stringify({
  ...iconAudit.source,
  license: 'MIT',
  notice: 'Product names, logos, and brands remain subject to their respective owners.',
}, null, 2)}\n`);
