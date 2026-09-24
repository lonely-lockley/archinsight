import type * as Monaco from 'monaco-editor';
import type { AiqCompletionResult } from '@insight/language';

export const queryLanguageId = 'archinsight-query';

const queryMonarchLanguage: Monaco.languages.IMonarchLanguage = {
  ignoreCase: true,
  keywords: ['MATCH', 'OPTIONAL', 'ROLLUP', 'WHERE', 'RETURN', 'GROUP', 'BY',
    'TABLE', 'WITH', 'UNWIND', 'AS', 'DISTINCT', 'ORDER', 'SKIP', 'LIMIT',
    'ASC', 'DESC', 'AND', 'OR', 'NOT', 'CONTAINS', 'IN', 'IS', 'TRUE', 'FALSE',
    'NULL', 'shortestPath'],
  tokenizer: {
    root: [
      [/#.*$/, 'comment.aiq'],
      [/'[^']*'/, 'string.aiq'],
      [/'[^']*$/, 'invalid.aiq'],
      [/\$[A-Za-z_][\w]*/, 'variable.aiq'],
      [/(:)([A-Za-z_][\w]*)/, ['delimiter.aiq', 'type.aiq']],
      [/[A-Za-z_][\w]*/, { cases: { '@keywords': 'keyword.aiq', '@default': 'identifier.aiq' } }],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number.aiq'],
      [/[{}()[\],.]/, 'delimiter.aiq'],
      [/[-=<>*|]+/, 'operator.aiq'],
      [/\s+/, 'white']
    ]
  }
};

export function registerQueryLanguage(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some((language) => language.id === queryLanguageId)) return;
  monaco.languages.register({ id: queryLanguageId, extensions: ['.aiq'] });
  monaco.languages.setMonarchTokensProvider(queryLanguageId, queryMonarchLanguage);
}

export function registerQueryCompletionProvider(
  monaco: typeof Monaco,
  complete: (source: string, cursorOffset: number) => AiqCompletionResult
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(queryLanguageId, {
    triggerCharacters: ['$', ':', '.', ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')],
    provideCompletionItems(model, position) {
      const result = complete(model.getValue(), model.getOffsetAt(position));
      const start = model.getPositionAt(result.replacementStartOffset);
      const end = model.getPositionAt(result.replacementEndOffset);
      const range = { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
      return { suggestions: result.items.map((item) => ({
        label: item.label,
        insertText: item.insertText,
        detail: item.detail,
        documentation: item.documentation,
        kind: aiqCompletionKind(monaco, item.kind),
        range
      })) };
    }
  });
}

function aiqCompletionKind(monaco: typeof Monaco, kind: string): Monaco.languages.CompletionItemKind {
  if (kind === 'keyword' || kind === 'selector') return monaco.languages.CompletionItemKind.Keyword;
  if (kind === 'function') return monaco.languages.CompletionItemKind.Function;
  if (kind === 'property') return monaco.languages.CompletionItemKind.Property;
  if (kind === 'type') return monaco.languages.CompletionItemKind.Class;
  if (kind === 'parameter') return monaco.languages.CompletionItemKind.Constant;
  return monaco.languages.CompletionItemKind.Variable;
}
