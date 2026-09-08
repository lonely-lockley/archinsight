import type * as Monaco from 'monaco-editor';

export const queryLanguageId = 'archinsight-query';

const queryMonarchLanguage: Monaco.languages.IMonarchLanguage = {
  ignoreCase: true,
  keywords: ['MATCH', 'OPTIONAL', 'ROLLUP', 'WHERE', 'RETURN', 'GROUP', 'BY',
    'AND', 'OR', 'NOT', 'CONTAINS', 'IN', 'IS', 'TRUE', 'FALSE', 'NULL'],
  tokenizer: {
    root: [
      [/#.*$/, 'comment.aiq'],
      [/'[^']*'/, 'string.aiq'],
      [/'[^']*$/, 'invalid.aiq'],
      [/\$[A-Za-z_][\w]*/, 'variable.aiq'],
      [/(:)([A-Za-z_][\w]*)/, ['delimiter.aiq', 'type.aiq']],
      [/[A-Za-z_][\w]*/, { cases: { '@keywords': 'keyword.aiq', '@default': 'identifier.aiq' } }],
      [/\d+/, 'number.aiq'],
      [/[{}()[\],.]/, 'delimiter.aiq'],
      [/[-=<>]+/, 'operator.aiq'],
      [/\s+/, 'white']
    ]
  }
};

export function registerQueryLanguage(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some((language) => language.id === queryLanguageId)) return;
  monaco.languages.register({ id: queryLanguageId, extensions: ['.aiq'] });
  monaco.languages.setMonarchTokensProvider(queryLanguageId, queryMonarchLanguage);
}
