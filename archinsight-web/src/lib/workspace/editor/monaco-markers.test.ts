import { describe, expect, it } from 'vitest';
import { markerRange } from './monaco-markers';

const model = {
  getLineCount: () => 2,
  getLineContent: (line: number) => line === 1 ? 'context Main' : 'container api'
};

describe('Monaco diagnostic marker ranges', () => {
  it('uses an explicit parser range and translates zero-based columns', () => {
    expect(markerRange(model, {
      source: 'main.ai', line: 2, column: 4, endLine: 2, endColumn: 9,
      level: 'ERROR', code: 'E1', message: 'bad'
    })).toEqual({ startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 10 });
  });

  it('expands a point diagnostic to the surrounding token', () => {
    expect(markerRange(model, {
      source: 'main.ai', line: 2, column: 2,
      level: 'ERROR', code: 'E1', message: 'bad'
    })).toEqual({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 10 });
  });

  it('clamps invalid line numbers and always produces a visible range', () => {
    expect(markerRange(model, {
      source: 'main.ai', line: 99, column: 99,
      level: 'WARNING', code: 'W1', message: 'bad'
    })).toEqual({ startLineNumber: 2, startColumn: 11, endLineNumber: 2, endColumn: 14 });
  });
});
