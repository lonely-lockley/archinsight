import type * as Monaco from 'monaco-editor';
import type { Diagnostic } from '$lib/api';
import { tokenRangeAt } from '../analysis/diagnostics';

export function markerRange(
  model: Pick<Monaco.editor.ITextModel, 'getLineCount' | 'getLineContent'>,
  diagnostic: Diagnostic & { line: number; column: number }
): {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
} {
  if (diagnostic.endLine !== undefined && diagnostic.endColumn !== undefined) {
    return {
      startLineNumber: Math.max(1, diagnostic.line),
      startColumn: Math.max(1, diagnostic.column + 1),
      endLineNumber: Math.max(1, diagnostic.endLine),
      endColumn: Math.max(2, diagnostic.endColumn + 1)
    };
  }
  const lineNumber = clamp(diagnostic.line, 1, model.getLineCount());
  const token = tokenRangeAt(model.getLineContent(lineNumber), diagnostic.column);
  return {
    startLineNumber: lineNumber,
    startColumn: token.start + 1,
    endLineNumber: lineNumber,
    endColumn: Math.max(token.start + 2, token.end + 1)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
