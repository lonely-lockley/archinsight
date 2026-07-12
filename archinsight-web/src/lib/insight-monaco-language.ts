import {
  initialInsightLineLexerState,
  insightSemanticTokenModifiers,
  insightSemanticTokenTypes,
  semanticHighlightInsight,
  tokenizeInsightLine,
  type InsightLineLexerState,
  type InsightLineToken,
  type LanguageSnapshot
} from '@insight/language';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

const keywordTokens = new Set([
  'DEFINE',
  'EXTEND',
  'PRESENTATION',
  'TYPE',
  'OPERATOR',
  'ENUM',
  'OF',
  'OR',
  'ON',
  'CONSTRUCTOR',
  'REQUIRED',
  'IMPORT',
  'FROM',
  'AS',
  'CONTEXT',
  'ENVIRONMENT',
  'PROJECT',
  'IMPLEMENTATION'
]);

const declarationKeywordTokens = new Set(['CONSTRUCTOR', 'REQUIRED']);
const typeTokens = new Set(['LIST_TYPE', 'TEXT_TYPE', 'TYPE_IDENTIFIER']);
const neutralSymbolTokens = new Set(['ANONYMOUS_ATTRIBUTE', 'COLON', 'EQ', 'LPAREN', 'RPAREN']);
const annotationTokens = new Set([
  'ATTRIBUTE_ANNOTATION',
  'PLANNED_ANNOTATION',
  'DEPRECATED_ANNOTATION'
]);
const projectionTokens = new Set(['PROJECTION_FROM', 'PROJECTION_TO', 'PROJECTION_THIS', 'PROJECTION_SLOT', 'PROJECTION_OWNER']);

export type InsightTokenVocabulary = {
  snapshot: LanguageSnapshot;
};

export function createInsightTokenVocabulary(snapshot: LanguageSnapshot): InsightTokenVocabulary {
  return { snapshot };
}

export function refreshInsightTokenVocabulary(
  vocabulary: InsightTokenVocabulary,
  snapshot: LanguageSnapshot,
  _sources: readonly string[]
): void {
  vocabulary.snapshot = snapshot;
}

export function createInsightTokensProvider(_vocabulary: InsightTokenVocabulary): Monaco.languages.TokensProvider {
  return {
    getInitialState(): Monaco.languages.IState {
      return new InsightTokenizationState(initialInsightLineLexerState());
    },

    tokenize(line: string, state: Monaco.languages.IState): Monaco.languages.ILineTokens {
      const lexerState = state instanceof InsightTokenizationState
        ? state.lexerState
        : initialInsightLineLexerState();
      const tokenization = tokenizeInsightLine(line, lexerState);
      return {
        tokens: monacoTokens(line, tokenization.tokens),
        endState: new InsightTokenizationState(tokenization.endState)
      };
    }
  };
}

class InsightTokenizationState implements Monaco.languages.IState {
  public constructor(public readonly lexerState: InsightLineLexerState) {
  }

  public clone(): Monaco.languages.IState {
    return new InsightTokenizationState(this.lexerState);
  }

  public equals(other: Monaco.languages.IState): boolean {
    return other instanceof InsightTokenizationState
      && other.lexerState.textOpen === this.lexerState.textOpen
      && other.lexerState.indentation === this.lexerState.indentation;
  }
}

export type InsightSemanticTokensProvider = Monaco.languages.DocumentRangeSemanticTokensProvider & {
  refresh(): void;
};

export function createInsightSemanticTokensProvider(vocabulary: InsightTokenVocabulary): InsightSemanticTokensProvider {
  const listeners = new Set<() => void>();
  return {
    onDidChange(listener): Monaco.IDisposable {
      listeners.add(listener);
      return {
        dispose(): void {
          listeners.delete(listener);
        }
      };
    },

    refresh(): void {
      for (const listener of listeners) {
        listener();
      }
    },

    getLegend(): Monaco.languages.SemanticTokensLegend {
      return {
        tokenTypes: [...insightSemanticTokenTypes],
        tokenModifiers: [...insightSemanticTokenModifiers]
      };
    },

    provideDocumentRangeSemanticTokens(model, range, token): Monaco.languages.ProviderResult<Monaco.languages.SemanticTokens> {
      if (token.isCancellationRequested) {
        return { data: new Uint32Array() };
      }
      return encodeSemanticTokens(
        semanticHighlightInsight(model.getValue(), vocabulary.snapshot)
          .filter((semanticToken) => tokenInRange(semanticToken, range))
      );
    }
  };
}

function tokenInRange(token: ReturnType<typeof semanticHighlightInsight>[number], range: Monaco.Range): boolean {
  const line = token.line + 1;
  return line >= range.startLineNumber && line <= range.endLineNumber;
}

function encodeSemanticTokens(tokens: ReturnType<typeof semanticHighlightInsight>): Monaco.languages.SemanticTokens {
  const data: number[] = [];
  let previousLine = 0;
  let previousColumn = 0;
  for (const token of tokens) {
    const deltaLine = token.line - previousLine;
    const deltaColumn = deltaLine === 0 ? token.column - previousColumn : token.column;
    data.push(
      deltaLine,
      deltaColumn,
      token.length,
      insightSemanticTokenTypes.indexOf(token.type),
      semanticTokenModifierBits(token.modifiers)
    );
    previousLine = token.line;
    previousColumn = token.column;
  }
  return { data: new Uint32Array(data) };
}

function semanticTokenModifierBits(modifiers: readonly string[] | undefined): number {
  return (modifiers ?? []).reduce((bits, modifier) => {
    const index = insightSemanticTokenModifiers.indexOf(modifier as (typeof insightSemanticTokenModifiers)[number]);
    return index < 0 ? bits : bits | (1 << index);
  }, 0);
}

function monacoTokens(
  line: string,
  tokens: readonly InsightLineToken[]
): Monaco.languages.IToken[] {
  const result: Monaco.languages.IToken[] = [{ startIndex: 0, scopes: 'source.insight' }];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const startIndex = Math.max(0, Math.min(line.length, token.startIndex));
    const stopIndex = Math.max(startIndex, Math.min(line.length - 1, token.stopIndex));
    pushToken(result, startIndex, scopeFor(token, next));
    const resetIndex = stopIndex + 1;
    if (resetIndex < (next?.startIndex ?? line.length)) {
      pushToken(result, resetIndex, 'source.insight');
    }
  }
  return result;
}

function pushToken(tokens: Monaco.languages.IToken[], startIndex: number, scopes: string): void {
  const last = tokens[tokens.length - 1];
  if (last !== undefined && last.startIndex === startIndex) {
    last.scopes = scopes;
    return;
  }
  tokens.push({ startIndex, scopes });
}

function scopeFor(
  token: InsightLineToken,
  next: InsightLineToken | undefined
): string {
  if (keywordTokens.has(token.name)) {
    return declarationKeywordTokens.has(token.name) ? 'keyword.declaration.insight' : 'keyword.control.insight';
  }
  if (typeTokens.has(token.name)) {
    return 'entity.name.type';
  }
  if (token.name === 'OPERATOR_IDENTIFIER') {
    return 'keyword.operator.insight';
  }
  if (neutralSymbolTokens.has(token.name)) {
    return 'variable.other';
  }
  if (projectionTokens.has(token.name)) {
    return 'variable.language.insight';
  }
  if (annotationTokens.has(token.name)) {
    return 'constant.language.annotation';
  }
  if (token.name === 'ANNOTATION_VALUE') {
    return 'string';
  }
  if (token.name === 'COMMENT') {
    return 'comment';
  }
  if (token.name === 'TEXT') {
    return 'string';
  }
  if (token.name === 'IDENTIFIER' && (next?.name === 'EQ' || next?.name === 'COLON')) {
    return 'property';
  }
  return 'variable';
}
