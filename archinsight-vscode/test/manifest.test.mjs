import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = json('package.json');
const extensionSource = readFileSync(path.join(extensionRoot, 'src', 'extension.ts'), 'utf8');
const diagramSessionSource = readFileSync(path.join(extensionRoot, 'src', 'diagram-session.ts'), 'utf8');
const diagramServiceSource = readFileSync(path.join(extensionRoot, 'src', 'vscode-diagram-service.ts'), 'utf8');
const controlsSource = readFileSync(path.join(extensionRoot, 'src', 'webview', 'ControlsApp.svelte'), 'utf8');
const workbenchSource = readFileSync(path.join(extensionRoot, 'src', 'webview', 'WorkbenchApp.svelte'), 'utf8');

test('contributed commands are unique, activated, and registered', () => {
  const contributed = manifest.contributes.commands.map((item) => item.command);
  assert.equal(new Set(contributed).size, contributed.length, 'contributed command ids must be unique');

  const activated = new Set(manifest.activationEvents
    .filter((event) => event.startsWith('onCommand:'))
    .map((event) => event.slice('onCommand:'.length)));
  const registered = new Set([...extensionSource.matchAll(/registerCommand\("([^"]+)"/g)]
    .map((match) => match[1]));

  for (const command of contributed) {
    assert(activated.has(command), `${command} must have an activation event`);
    assert(registered.has(command), `${command} must be registered by the extension`);
  }
});

test('menu commands refer to declared commands', () => {
  const contributed = new Set(manifest.contributes.commands.map((item) => item.command));
  for (const [menu, entries] of Object.entries(manifest.contributes.menus ?? {})) {
    for (const entry of entries) {
      assert(contributed.has(entry.command), `${menu} refers to undeclared command ${entry.command}`);
    }
  }
});

test('language, grammar, custom editor, view, and icon contributions resolve', () => {
  for (const language of manifest.contributes.languages) {
    assertPath(language.configuration);
    assertPath(language.icon.light);
    assertPath(language.icon.dark);
  }
  for (const grammar of manifest.contributes.grammars) {
    assertPath(grammar.path);
    const grammarDocument = json(grammar.path);
    assert.equal(grammarDocument.scopeName, grammar.scopeName);
  }
  assertPath(manifest.icon);

  for (const editor of manifest.contributes.customEditors) {
    assert(
      extensionSource.includes(`registerCustomEditorProvider(archinsightEditorViewType`),
      `${editor.viewType} must have a custom editor provider`,
    );
    assert(manifest.activationEvents.includes(`onCustomEditor:${editor.viewType}`));
  }
  const archinsightEditor = manifest.contributes.customEditors.find((editor) => editor.viewType === 'archinsight.editor');
  assert(archinsightEditor, 'Archinsight custom editor must be contributed');
  assert.deepEqual(
    archinsightEditor.selector.map((selector) => selector.filenamePattern).sort(),
    ['*.ai', '*.aiq'],
    'Insight models and AIQ queries must open in the Archinsight custom editor',
  );

  for (const views of Object.values(manifest.contributes.views ?? {})) {
    for (const view of views) {
      assert(
        extensionSource.includes(`registerWebviewViewProvider("${view.id}"`)
          || extensionSource.includes(`createTreeView("${view.id}"`),
        `${view.id} must have a registered view provider`,
      );
    }
  }
});

test('Insight and AIQ languages use their Archinsight file icons', () => {
  const languages = new Map(manifest.contributes.languages.map((language) => [language.id, language]));
  assert.deepEqual(languages.get('insight')?.icon, {
    light: './assets/file-icons/ai.svg',
    dark: './assets/file-icons/ai.svg',
  });
  assert.deepEqual(languages.get('archinsight-query')?.icon, {
    light: './assets/file-icons/aiq.svg',
    dark: './assets/file-icons/aiq.svg',
  });

  const aiIcon = readFileSync(path.join(extensionRoot, 'assets', 'file-icons', 'ai.svg'), 'utf8');
  const aiqIcon = readFileSync(path.join(extensionRoot, 'assets', 'file-icons', 'aiq.svg'), 'utf8');
  assert(aiIcon.includes('M17.2085 0.5C20.3898'), 'Insight icon must contain the web Archinsight mark');
  assert(aiqIcon.includes('M5.65 7.25 9.9 6.4'), 'AIQ icon must contain the web query graph');
  assert(aiIcon.includes('#36d074'));
  assert(aiqIcon.includes('#36d074'));
});

test('custom editor tabs force the Archinsight icon despite file-theme extension conflicts', () => {
  assert(extensionSource.includes('panel.iconPath = vscode.Uri.joinPath('));
  assert(extensionSource.includes('fileName.toLocaleLowerCase().endsWith(".aiq") ? "aiq.svg" : "ai.svg"'));
});

test('language configuration uses balanced editor pairs', () => {
  const configuration = json('language-configuration.json');
  assert.equal(configuration.comments.lineComment, '#');
  for (const [open, close] of configuration.brackets) {
    assert(open.length > 0 && close.length > 0);
  }
  for (const pair of [...configuration.autoClosingPairs, ...configuration.surroundingPairs]) {
    assert(pair.open.length > 0 && pair.close.length > 0);
  }
});

test('project structure uses the canonical language-core builders', () => {
  assert(extensionSource.includes('buildProjectStructure'));
  assert(extensionSource.includes('buildTypeHierarchy'));
  assert(extensionSource.includes('filterTypeHierarchy'));
  assert.equal(extensionSource.includes('function isOperatorType('), false);
});

test('built-in views come from the canonical language catalogue', () => {
  assert(diagramServiceSource.includes('BUILTIN_VIEW_QUERIES'));
  assert(diagramServiceSource.includes('builtinViewDefinition'));
  assert.equal(extensionSource.includes('./generated/builtin-view-queries'), false);
});

test('project analysis lifecycle is owned by the language session', () => {
  assert(extensionSource.includes('createProjectAnalysisSession'));
  assert.equal(extensionSource.includes('service.buildSnapshot'), false);
  assert.equal(extensionSource.includes('service.link('), false);
});

test('webview trust boundaries use the shared runtime message contracts', () => {
  assert(extensionSource.includes('parseControlsWebviewToHostMessage'));
  assert(extensionSource.includes('parseWorkbenchWebviewToHostMessage'));
  assert(extensionSource.includes('parsePreviewWebviewToHostMessage'));
  assert(controlsSource.includes('parseControlsHostToWebviewMessage'));
  assert(workbenchSource.includes('parseWorkbenchHostToWebviewMessage'));
  assert.equal(extensionSource.includes('type WorkbenchEditorMessage ='), false);
  assert.equal(controlsSource.includes('type IncomingMessage ='), false);
  assert.equal(workbenchSource.includes('type IncomingMessage ='), false);
});

test('custom editor and preview share one diagram state machine', () => {
  assert(diagramSessionSource.includes('export class DiagramSession'));
  assert.equal([...diagramServiceSource.matchAll(/new DiagramSession</g)].length, 1);
  assert.equal([...extensionSource.matchAll(/this\.diagram = createDiagramSession\(/g)].length, 2);
  assert.equal(extensionSource.includes('private renderGeneration'), false);
  assert.equal(extensionSource.includes('private pngResolve'), false);
  assert.equal(extensionSource.includes('private async exportPng'), false);
  assert.equal(extensionSource.includes('function fileNameWithExtension'), false);
});

test('AIQ custom editor initializes and renders the document query', () => {
  assert(extensionSource.includes('? { view: "no-filter", query: document.getText() }'));
  assert(extensionSource.includes('message.command === "selectQueryScope"'));
  assert.equal(extensionSource.includes('Choose the Insight source used for $tab'), false);
  assert(extensionSource.includes('activeQueryDocumentSource()'));
  assert(workbenchSource.includes('createQueryScopeWidgets'));
  assert(workbenchSource.includes("command: 'selectQueryScope'"));
  assert(workbenchSource.includes("queryDocument={editorLanguage() === 'archinsight-query'}"));
  assert(workbenchSource.includes("monaco.editor.setModelLanguage(model, editorLanguage())"));
  assert(workbenchSource.includes("return fileName.toLocaleLowerCase().endsWith('.aiq')"));
});

test('VS Code Monaco uses the same Insight themes as the web editor', () => {
  assert(workbenchSource.includes("from '@archinsight/workbench/monaco-themes'"));
  assert(workbenchSource.includes('defineInsightThemes(monaco)'));
  assert(workbenchSource.includes('insightDarkTheme'));
  assert(workbenchSource.includes('insightLightTheme'));
  assert.equal(workbenchSource.includes('function insightTokenRules('), false);
  assert.equal(workbenchSource.includes("'insight-vscode-dark'"), false);
});

function assertPath(relativePath) {
  assert(existsSync(path.resolve(extensionRoot, relativePath)), `${relativePath} must exist`);
}

function json(relativePath) {
  return JSON.parse(readFileSync(path.resolve(extensionRoot, relativePath), 'utf8'));
}
