import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import insightDark from './themes/monaco/insight_dark.json';
import insightLight from './themes/monaco/insight_light.json';

export const insightDarkTheme = 'insight-dark';
export const insightLightTheme = 'insight-light';

export function defineInsightThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme(insightDarkTheme, insightDark as Monaco.editor.IStandaloneThemeData);
  monaco.editor.defineTheme(insightLightTheme, insightLight as Monaco.editor.IStandaloneThemeData);
}
