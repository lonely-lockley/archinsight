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
  'PROJECT',
  'IMPLEMENTATION'
]);

const declarationKeywordTokens = new Set(['CONSTRUCTOR', 'REQUIRED']);
const typeTokens = new Set(['LIST_TYPE', 'TEXT_TYPE', 'TYPE_IDENTIFIER']);
const neutralSymbolTokens = new Set(['ANONYMOUS_ATTRIBUTE', 'COLON', 'EQ', 'LPAREN', 'RPAREN']);
const annotationTokens = new Set([
  'ATTRIBUTE_ANNOTATION',
  'PLANNED_ANNOTATION',
  'DEPRECATED_ANNOTATION',
  'ANNOTATION_VALUE'
]);
const projectionTokens = new Set(['PROJECTION_FROM', 'PROJECTION_TO', 'PROJECTION_THIS', 'PROJECTION_SLOT', 'PROJECTION_OWNER']);

export type InsightTokenVocabulary = {
  snapshot: LanguageSnapshot;
  staleSemanticTokens: boolean;
};

export function createInsightTokenVocabulary(snapshot: LanguageSnapshot): InsightTokenVocabulary {
  return { snapshot, staleSemanticTokens: false };
}

export function refreshInsightTokenVocabulary(
  vocabulary: InsightTokenVocabulary,
  snapshot: LanguageSnapshot,
  _sources: readonly string[],
  staleSemanticTokens = false
): void {
  vocabulary.snapshot = snapshot;
  vocabulary.staleSemanticTokens = staleSemanticTokens;
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

export function createInsightSemanticTokensProvider(vocabulary: InsightTokenVocabulary): Monaco.languages.DocumentSemanticTokensProvider {
  const cache = new Map<string, { readonly version: number; readonly tokens: Monaco.languages.SemanticTokens }>();
  const lastGoodTokens = new Map<string, Monaco.languages.SemanticTokens>();
  return {
    getLegend(): Monaco.languages.SemanticTokensLegend {
      return {
        tokenTypes: [...insightSemanticTokenTypes],
        tokenModifiers: [...insightSemanticTokenModifiers]
      };
    },

    provideDocumentSemanticTokens(model, _lastResultId, token): Monaco.languages.ProviderResult<Monaco.languages.SemanticTokens> {
      const uriKey = model.uri.toString();
      if (vocabulary.staleSemanticTokens) {
        const lastGood = lastGoodTokens.get(uriKey);
        if (lastGood !== undefined) {
          return lastGood;
        }
      }
      const snapshotKey = semanticSnapshotKey(vocabulary.snapshot);
      const cacheKey = `${uriKey}:${snapshotKey}`;
      const cached = cache.get(cacheKey);
      if (cached?.version === model.getVersionId()) {
        return cached.tokens;
      }
      if (token.isCancellationRequested) {
        return { data: new Uint32Array() };
      }
      const semanticTokens = encodeSemanticTokens(semanticHighlightInsight(model.getValue(), vocabulary.snapshot));
      cache.set(cacheKey, { version: model.getVersionId(), tokens: semanticTokens });
      if (!vocabulary.staleSemanticTokens) {
        lastGoodTokens.set(uriKey, semanticTokens);
      }
      return semanticTokens;
    },

    releaseDocumentSemanticTokens(_resultId: string | undefined): void {
      return;
    }
  };
}

function semanticSnapshotKey(snapshot: LanguageSnapshot): string {
  return [
    snapshot.schemaVersion,
    snapshot.types.length,
    snapshot.constructors.length,
    snapshot.operators.map((operator) => `${operator.spelling}/${operator.leftType ?? ""}/${operator.targetType}`).join("|")
  ].join(":");
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
    pushToken(result, startIndex, scopeFor(token));
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
  token: InsightLineToken
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
  if (token.name === 'COMMENT') {
    return 'comment';
  }
  if (token.name === 'TEXT') {
    return 'string';
  }
  return 'variable';
}
