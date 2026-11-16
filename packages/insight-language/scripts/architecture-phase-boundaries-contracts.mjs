import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { IndexedGraph } from '../build/runtime/indexed-graph.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');

assertLayer('packages/insight-language/src', {
  allowedPackages: new Set(['antlr4ng']),
  forbidden: ['vscode', 'svelte', 'monaco-editor', '@sveltejs/', '@archinsight/', 'node:child_process', 'node:fs'],
});
assertLayer('packages/archinsight-workbench/src', {
  allowedPackages: new Set([
    '@insight/language', '@archinsight/contracts', '@archinsight/editor-support', 'monaco-editor', 'svelte',
  ]),
  forbidden: ['vscode', '@sveltejs/', 'node:child_process', 'node:fs', 'pg'],
});
assertHostsDoNotImportEachOther();

for (const relative of [
  'packages/insight-language/src/presentation-resolver.ts',
  'packages/insight-language/src/linked-project-index.ts',
  'packages/insight-language/src/document-aggregate.ts',
  'packages/insight-language/src/query-execution-context.ts',
  'packages/insight-language/src/query-view-pipeline.ts',
  'packages/insight-language/src/operator-implementation-registry.ts',
]) {
  assert(existsSync(path.join(repositoryRoot, relative)), `${relative} is missing`);
}

const graph = new IndexedGraph();
graph.addNode({ kind: 'source', id: 'model.ai' });
graph.addNode({ kind: 'context', id: 'shop' });
graph.addRelation({ id: 'declares', kind: 'DECLARES', source: 'model.ai', target: 'shop', ownerSource: 'model.ai' });
const restored = IndexedGraph.fromSnapshot(graph.snapshot());
assert.equal(restored.node('shop')?.kind, 'context');
assert.deepEqual([...restored.successors('model.ai')], ['shop']);

console.log('architecture import-layer and serialization contracts passed');

function assertLayer(relativeRoot, policy) {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  for (const file of sourceFiles(absoluteRoot)) {
    for (const specifier of importsOf(file)) {
      assert(!policy.forbidden.some((prefix) => specifier === prefix || specifier.startsWith(prefix)),
        `${path.relative(repositoryRoot, file)} imports forbidden dependency '${specifier}'`);
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
      const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      assert(policy.allowedPackages.has(packageName),
        `${path.relative(repositoryRoot, file)} imports undeclared layer dependency '${specifier}'`);
    }
  }
}

function assertHostsDoNotImportEachOther() {
  const hosts = ['archinsight-web', 'archinsight-vscode', 'archinsight-cli', 'archinsight-renderer'];
  for (const host of hosts) {
    const root = path.join(repositoryRoot, host, 'src');
    for (const file of sourceFiles(root)) {
      for (const specifier of importsOf(file)) {
        for (const other of hosts.filter((candidate) => candidate !== host)) {
          assert(!specifier.includes(`/${other}/src`) && !specifier.startsWith(`../../${other}/src`),
            `${path.relative(repositoryRoot, file)} crosses into ${other}/src`);
        }
      }
    }
  }
}

function sourceFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|svelte)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function importsOf(file) {
  const raw = readFileSync(file, 'utf8');
  const source = file.endsWith('.svelte') ? /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/.exec(raw)?.[1] ?? '' : raw;
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false,
    file.endsWith('.svelte') ? ts.ScriptKind.TS : undefined);
  return parsed.statements.flatMap((statement) => {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
        && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
      return [statement.moduleSpecifier.text];
    }
    return [];
  });
}
