import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';

const extensionRoot = path.resolve(import.meta.dirname, '..');

test('keeps technology SVG assets lazy in the extension and render worker', () => {
  const extension = readFileSync(path.join(extensionRoot, 'dist/extension.cjs'), 'utf8');
  assert(statSync(path.join(extensionRoot, 'dist/extension.cjs')).size < 3_000_000);
  assert.doesNotMatch(extension, /var icons = \{/);
  assert.doesNotMatch(extension, /aria-hidden="true" focusable="false"><path/);
  assert.equal(readdirSync(path.join(extensionRoot, 'dist/icon-assets')).filter((name) => name.endsWith('.svg')).length, 616);
  const chunks = readdirSync(path.join(extensionRoot, 'dist/diagram-chunks')).filter((name) => name.endsWith('.mjs'));
  const assetChunks = chunks.filter((name) => {
    const source = readFileSync(path.join(extensionRoot, 'dist/diagram-chunks', name), 'utf8');
    return source.includes('var icons =') && source.includes('currentColor');
  });
  assert.equal(assetChunks.length, 26);
  assert.match(readFileSync(path.join(extensionRoot, 'dist/diagram-viz-worker.mjs'), 'utf8'), /diagram-chunks/);
  assert.match(readFileSync(path.join(extensionRoot, 'dist/licenses/DEVICON-LICENSE'), 'utf8'), /MIT License/);
  assert.equal(JSON.parse(readFileSync(path.join(extensionRoot, 'dist/licenses/technology-icons-source.json'), 'utf8')).version, '2.18.0');
});
