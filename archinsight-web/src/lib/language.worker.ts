import { parseWithGeneratedInsightParser, type LanguageSnapshot } from '@insight/language';
import type { Diagnostic } from './api';

type SyntaxCheckRequest = {
  requestId: number;
  sources: Array<{ sourceIdentity: string; content: string }>;
  snapshot: LanguageSnapshot;
};

type SyntaxCheckResponse = {
  requestId: number;
  diagnostics: Diagnostic[];
};

self.onmessage = (event: MessageEvent<SyntaxCheckRequest>) => {
  const diagnostics: Diagnostic[] = [];
  for (const source of event.data.sources) {
    diagnostics.push(...checkSyntax(source.sourceIdentity, source.content, event.data.snapshot));
  }
  const response: SyntaxCheckResponse = {
    requestId: event.data.requestId,
    diagnostics
  };
  postMessage(response);
};

function checkSyntax(path: string, content: string, snapshot: LanguageSnapshot): Diagnostic[] {
  try {
    const parsed = parseWithGeneratedInsightParser({
      sourceName: path,
      source: content,
      cursorOffset: content.length,
      snapshot
    });
    if (parsed.parseFailure !== undefined) {
      return [
        {
          source: path,
          level: 'ERROR',
          code: 'PARSER_FAILED',
          message: parsed.parseFailure.message,
          category: 'SYSTEM'
        }
      ];
    }
    return (parsed.syntaxErrors ?? []).map((error) => {
      const range = diagnosticRange(content, error.line, error.column, error.offset);
      return {
        source: path,
        line: range.line,
        column: range.column,
        endLine: range.endLine,
        endColumn: range.endColumn,
        level: 'ERROR',
        code: 'SYNTAX_ERROR',
        message: error.message ?? 'Syntax error',
        category: 'SOURCE'
      };
    });
  } catch (error) {
    return [
      {
        source: path,
        level: 'ERROR',
        code: 'PARSER_FAILED',
        message: error instanceof Error ? error.message : String(error),
        category: 'SYSTEM'
      }
    ];
  }
}

function diagnosticRange(
  source: string,
  line: number,
  column: number,
  offset: number | undefined
): { line: number; column: number; endLine: number; endColumn: number } {
  const lines = source.split(/\r\n|\r|\n/);
  const lineIndex = Math.max(0, Math.min(line - 1, lines.length - 1));
  const text = lines[lineIndex] ?? '';
  const sourceColumn = offset === undefined ? column : columnAtOffset(source, offset, line, column);
  const clamped = Math.max(0, Math.min(sourceColumn, text.length));
  const token = tokenRangeAt(text, clamped);

  return {
    line: lineIndex + 1,
    column: token.start,
    endLine: lineIndex + 1,
    endColumn: Math.max(token.start + 1, token.end)
  };
}

function columnAtOffset(source: string, offset: number, fallbackLine: number, fallbackColumn: number): number {
  if (offset < 0 || offset > source.length) {
    return fallbackColumn;
  }
  let line = 1;
  let column = 0;
  for (let index = 0; index < offset; index++) {
    const char = source[index];
    if (char === '\n') {
      line++;
      column = 0;
    } else if (char !== '\r') {
      column++;
    }
  }
  return line === fallbackLine ? column : fallbackColumn;
}

function tokenRangeAt(text: string, column: number): { start: number; end: number } {
  if (text.length === 0) {
    return { start: column, end: column + 1 };
  }

  let index = Math.max(0, Math.min(column, text.length - 1));
  if (column >= text.length || isTokenBreak(text[index])) {
    while (index > 0 && isTokenBreak(text[index])) {
      index--;
    }
    if (isTokenBreak(text[index])) {
      return { start: column, end: column + 1 };
    }
  }

  let start = index;
  while (start > 0 && !isTokenBreak(text[start - 1])) {
    start--;
  }
  let end = index + 1;
  while (end < text.length && !isTokenBreak(text[end])) {
    end++;
  }
  return { start, end };
}

function isTokenBreak(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}
