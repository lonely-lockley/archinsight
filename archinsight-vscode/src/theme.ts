import type { RenderTheme } from '@insight/language';

export function renderThemeForColorThemeKind(kind: number): RenderTheme {
  return kind === 1 || kind === 4 ? 'light' : 'dark';
}

export function renderThemeForBodyClasses(classes: Pick<DOMTokenList, 'contains'>): RenderTheme {
  return classes.contains('vscode-light') || classes.contains('vscode-high-contrast-light')
    ? 'light'
    : 'dark';
}
