import type * as Monaco from 'monaco-editor';
import type { LanguageSnapshot } from '@insight/language';
import {
  createInsightSemanticTokensProvider,
  createInsightTokenVocabulary,
  createInsightTokensProvider,
  type InsightSemanticTokensProvider,
  type InsightTokenVocabulary
} from './insight-monaco-language.js';
import { defineInsightThemes } from './monaco-themes.js';

export const insightEditorOptions = Object.freeze({
  automaticLayout: true,
  minimap: { enabled: true },
  autoIndent: 'full',
  suggest: { showWords: false },
  fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  tabSize: 4,
  insertSpaces: true,
  hover: { enabled: 'on' },
  fixedOverflowWidgets: true,
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  renderValidationDecorations: 'on',
  'semanticHighlighting.enabled': true,
  scrollBeyondLastLine: false
} satisfies Monaco.editor.IStandaloneEditorConstructionOptions);

export interface InsightMonacoRegistration {
  readonly vocabulary: InsightTokenVocabulary;
  readonly semanticTokensProvider: InsightSemanticTokensProvider;
}

/** Shared registration seam; hosts retain ownership of completion transport and models. */
export function registerInsightMonaco(
  monaco: typeof Monaco,
  snapshot: LanguageSnapshot
): InsightMonacoRegistration {
  if (!monaco.languages.getLanguages().some((language) => language.id === 'insight')) {
    monaco.languages.register({ id: 'insight' });
  }
  const vocabulary = createInsightTokenVocabulary(snapshot);
  monaco.languages.setTokensProvider('insight', createInsightTokensProvider(vocabulary));
  const semanticTokensProvider = createInsightSemanticTokensProvider(vocabulary);
  monaco.languages.registerDocumentRangeSemanticTokensProvider('insight', semanticTokensProvider);
  defineInsightThemes(monaco);
  return { vocabulary, semanticTokensProvider };
}
