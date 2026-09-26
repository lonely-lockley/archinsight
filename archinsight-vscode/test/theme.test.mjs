import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderThemeForBodyClasses,
  renderThemeForColorThemeKind,
} from '../src/theme.ts';

test('maps all VS Code color theme kinds to Archinsight themes', () => {
  assert.equal(renderThemeForColorThemeKind(1), 'light');
  assert.equal(renderThemeForColorThemeKind(4), 'light');
  assert.equal(renderThemeForColorThemeKind(2), 'dark');
  assert.equal(renderThemeForColorThemeKind(3), 'dark');
});

test('recognizes regular and high-contrast light webview classes', () => {
  const classes = (...values) => ({ contains: (value) => values.includes(value) });
  assert.equal(renderThemeForBodyClasses(classes('vscode-light')), 'light');
  assert.equal(renderThemeForBodyClasses(classes('vscode-high-contrast-light')), 'light');
  assert.equal(renderThemeForBodyClasses(classes('vscode-dark')), 'dark');
  assert.equal(renderThemeForBodyClasses(classes('vscode-high-contrast')), 'dark');
});
