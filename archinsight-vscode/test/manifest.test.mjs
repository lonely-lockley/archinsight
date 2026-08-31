import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = json('package.json');
const extensionSource = readFileSync(path.join(extensionRoot, 'src', 'extension.ts'), 'utf8');

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

function assertPath(relativePath) {
  assert(existsSync(path.resolve(extensionRoot, relativePath)), `${relativePath} must exist`);
}

function json(relativePath) {
  return JSON.parse(readFileSync(path.resolve(extensionRoot, relativePath), 'utf8'));
}
