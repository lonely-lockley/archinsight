import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('VS Code consumes the workbench package without reaching into the web application', async () => {
  const sources = await Promise.all([
    readFile('archinsight-vscode/src/webview/WorkbenchApp.svelte', 'utf8'),
    readFile('archinsight-vscode/package.json', 'utf8'),
    readFile('archinsight-vscode/build.gradle', 'utf8')
  ]);
  const combined = sources.join('\n');

  assert.match(combined, /@archinsight\/workbench/);
  assert.doesNotMatch(combined, /archinsight-web\/src|npm --prefix \.\.\/archinsight-web|project\(':archinsight-web'\)/);
});

test('the reusable workbench has no dependency on application-private aliases', async () => {
  const files = [
    'WorkspaceEditor.svelte',
    'EditorPanel.svelte',
    'QueryEditorPanel.svelte',
    'SvgPreviewPanel.svelte',
    'diagram-query-presets.ts',
    'insight-monaco-language.ts',
    'workspace-types.ts'
  ];
  for (const file of files) {
    const source = await readFile(`packages/archinsight-workbench/src/${file}`, 'utf8');
    assert.doesNotMatch(source, /\$lib|\$app|archinsight-web/, file);
  }
});

test('editor hosts use shared pure semantics and retain only enum adapters', async () => {
  const nativeHost = await readFile('archinsight-vscode/src/extension.ts', 'utf8');
  const webviewHost = await readFile('archinsight-vscode/src/webview/WorkbenchApp.svelte', 'utf8');
  const browserHost = await readFile('archinsight-web/src/lib/workspace/editor/monaco-session.ts', 'utf8');
  const structureHost = await readFile('archinsight-web/src/lib/StructurePanel.svelte', 'utf8');
  const diagnostics = await readFile('archinsight-web/src/lib/workspace/analysis/diagnostics.ts', 'utf8');

  assert.match(nativeHost, /completionSortText/);
  assert.match(nativeHost, /semanticTokenModifierBits/);
  assert.match(nativeHost, /filterTreeByQuery/);
  assert.match(nativeHost, /diagnosticIdentity/);
  assert.match(webviewHost, /completionSortText/);
  assert.match(browserHost, /completionSortText/);
  assert.match(structureHost, /filterTreeByQuery/);
  assert.match(diagnostics, /diagnosticIdentity/);

  for (const source of [nativeHost, webviewHost, browserHost, structureHost, diagnostics]) {
    assert.doesNotMatch(source, /function completionSortBucket|function completionDetail|function semanticTokenModifierBits|function filterStructureNodes|function diagnosticKey/);
  }

  assert.match(nativeHost, /function completionKind/);
  assert.match(webviewHost, /function completionItemKind/);
  assert.match(browserHost, /function completionItemKind/);
});
