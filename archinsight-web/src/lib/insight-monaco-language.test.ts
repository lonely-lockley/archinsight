import {
  coreLanguageSnapshot,
  insightSemanticTokenModifiers,
  insightSemanticTokenTypes
} from '@insight/language';
import { describe, expect, it, vi } from 'vitest';
import {
  createInsightTokensProvider,
  createInsightTokenVocabulary,
  createInsightSemanticTokensProvider,
  refreshInsightTokenVocabulary
} from '@archinsight/workbench/monaco';

describe('Insight Monaco lexical tokens', () => {
  it('maps lexer categories to stable editor scopes', () => {
    const provider = createInsightTokensProvider(createInsightTokenVocabulary(coreLanguageSnapshot));

    expect(scopes(provider, 'define type Gateway of System')).toEqual(expect.arrayContaining([
      'keyword.control.insight',
      'entity.name.type'
    ]));
    expect(scopes(provider, 'required Text owner')).toEqual(expect.arrayContaining([
      'keyword.declaration.insight',
      'entity.name.type',
      'variable'
    ]));
    expect(scopes(provider, 'source $from originalLink target $to')).toContain('variable.language.insight');
    expect(scopes(provider, '@deprecated(replace after migration)')).toEqual(expect.arrayContaining([
      'constant.language.annotation',
      'string'
    ]));
    expect(scopes(provider, 'name = API')).toEqual(expect.arrayContaining([
      'property',
      'variable.other',
      'string'
    ]));
    expect(scopes(provider, '# note')).toContain('comment');
    expect(scopes(provider, '-> api')).toContain('keyword.operator.insight');
  });

  it('clones and compares line state while carrying multiline text', () => {
    const provider = createInsightTokensProvider(createInsightTokenVocabulary(coreLanguageSnapshot));
    const initial = provider.getInitialState();
    const open = provider.tokenize('    description = first line', initial).endState;
    const continuation = provider.tokenize('        second line', open);
    const closed = provider.tokenize('    system api', continuation.endState).endState;

    expect(initial.equals(initial.clone())).toBe(true);
    expect(initial.equals(open)).toBe(false);
    expect(open.equals(open.clone())).toBe(true);
    expect(continuation.tokens.some((token) => token.startIndex === 8 && token.scopes === 'string')).toBe(true);
    expect(initial.equals(closed)).toBe(false);
    expect(provider.tokenize('system api', closed).endState.equals(initial)).toBe(true);
  });
});

describe('Insight Monaco semantic tokens', () => {
  it('publishes the language legend and refresh notifications', () => {
    const vocabulary = createInsightTokenVocabulary(coreLanguageSnapshot);
    const provider = createInsightSemanticTokensProvider(vocabulary);
    const listener = vi.fn();
    expect(provider.onDidChange).toBeTypeOf('function');
    const disposable = provider.onDidChange!(listener);

    expect(provider.getLegend()).toEqual({
      tokenTypes: [...insightSemanticTokenTypes],
      tokenModifiers: [...insightSemanticTokenModifiers]
    });
    provider.refresh();
    expect(listener).toHaveBeenCalledTimes(1);

    disposable.dispose();
    provider.refresh();
    expect(listener).toHaveBeenCalledTimes(1);

    const replacement = { ...coreLanguageSnapshot, schemaVersion: 'test-schema' };
    refreshInsightTokenVocabulary(vocabulary, replacement, ['model.ai']);
    expect(vocabulary.snapshot).toBe(replacement);
  });

  it('returns no semantic tokens after cancellation without reading the model', () => {
    const provider = createInsightSemanticTokensProvider(
      createInsightTokenVocabulary(coreLanguageSnapshot)
    );
    const getValue = vi.fn(() => 'context demo');

    const result = provider.provideDocumentRangeSemanticTokens(
      { getValue } as never,
      { startLineNumber: 1, endLineNumber: 1 } as never,
      { isCancellationRequested: true } as never
    ) as unknown as { data: Uint32Array };

    expect(result.data).toEqual(new Uint32Array());
    expect(getValue).not.toHaveBeenCalled();
  });

  it('encodes only semantic tokens inside the requested line range', () => {
    const provider = createInsightSemanticTokensProvider(
      createInsightTokenVocabulary(coreLanguageSnapshot)
    );
    const result = provider.provideDocumentRangeSemanticTokens(
      { getValue: () => 'context demo\n\nsystem api\n    name = API' } as never,
      { startLineNumber: 3, endLineNumber: 3 } as never,
      { isCancellationRequested: false } as never
    ) as unknown as { data: Uint32Array };

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.length % 5).toBe(0);
    expect(result.data[0]).toBe(2);
  });
});

function scopes(
  provider: ReturnType<typeof createInsightTokensProvider>,
  line: string
): string[] {
  return provider.tokenize(line, provider.getInitialState()).tokens.map((token) => token.scopes);
}
