import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../packages/insight-language/package.json', import.meta.url));
const ts = require('typescript');

const consumers = [
  'archinsight-cli/src/cli-output.ts',
  'archinsight-vscode/src/diagram-viz-worker.ts',
  'archinsight-web/src/lib/graphviz.worker.ts',
  'archinsight-renderer/src/render-worker.mjs'
];

test('all Viz.js runtimes depend on shared result normalization without sharing execution boundaries', async () => {
  for (const consumer of consumers) {
    const source = await sourceFile(consumer);
    assert(
      namedImports(source, '@archinsight/graphviz').has('normalizeGraphvizSvgResult'),
      `${consumer} must import shared Graphviz result normalization`,
    );
    assert(hasCall(source, 'normalizeGraphvizSvgResult'), `${consumer} must normalize the renderer result`);
  }
});

test('runtime-specific isolation and output policy remain in their host adapters', async () => {
  const browser = await sourceFile('archinsight-web/src/lib/graphviz.worker.ts');
  const renderer = await sourceFile('archinsight-renderer/src/render-worker.mjs');
  const vscode = await sourceFile('archinsight-vscode/src/diagram-viz-worker.ts');

  assert(hasPropertyAccess(browser, 'self', 'onmessage'));
  assert(hasIdentifier(renderer, 'workerData'));
  assert(hasCall(renderer, 'validateSvgOutput'));
  assert(
    namedImports(vscode, './diagram-svg.js').has('makeGraphvizBackgroundsTransparent'),
    'VS Code worker must retain its transparent-background output policy',
  );
});

async function sourceFile(fileName) {
  const source = await readFile(fileName, 'utf8');
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
}

function namedImports(source, moduleName) {
  const names = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)
        || !ts.isStringLiteral(statement.moduleSpecifier)
        || statement.moduleSpecifier.text !== moduleName) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const item of bindings.elements) names.add(item.propertyName?.text ?? item.name.text);
  }
  return names;
}

function hasCall(source, name) {
  return anyNode(source, (node) => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === name);
}

function hasIdentifier(source, name) {
  return anyNode(source, (node) => ts.isIdentifier(node) && node.text === name);
}

function hasPropertyAccess(source, owner, property) {
  return anyNode(source, (node) => ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === owner
    && node.name.text === property);
}

function anyNode(root, predicate) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (predicate(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
