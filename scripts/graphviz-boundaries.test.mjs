import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const consumers = [
  'archinsight-cli/src/cli-output.ts',
  'archinsight-vscode/src/extension.ts',
  'archinsight-web/src/lib/graphviz.worker.ts',
  'archinsight-renderer/src/render-worker.mjs'
];

test('all Viz.js runtimes share result normalization without sharing execution boundaries', async () => {
  for (const consumer of consumers) {
    const source = await readFile(consumer, 'utf8');
    assert.match(source, /from ['"]@archinsight\/graphviz['"]/, consumer);
    assert.match(source, /normalizeGraphvizSvgResult\(viz\.render\(/, consumer);
    assert.doesNotMatch(source, /function formatMessages\(/, consumer);
  }
});

test('runtime-specific isolation and output policy remain in their host adapters', async () => {
  const browser = await readFile('archinsight-web/src/lib/graphviz.worker.ts', 'utf8');
  const renderer = await readFile('archinsight-renderer/src/render-worker.mjs', 'utf8');
  const vscode = await readFile('archinsight-vscode/src/extension.ts', 'utf8');

  assert.match(browser, /self\.onmessage/);
  assert.match(renderer, /workerData\.limits/);
  assert.match(renderer, /validateSvgOutput/);
  assert.match(vscode, /makeGraphvizBackgroundsTransparent/);
});
