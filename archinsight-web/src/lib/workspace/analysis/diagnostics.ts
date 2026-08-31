import type { Diagnostic } from '$lib/api';
import type { MessageView } from '$lib/workspace-types';

export type DiagnosticsBySource = Record<string, Diagnostic[]>;

export function omitDiagnostics(
  current: DiagnosticsBySource,
  sources: readonly string[]
): DiagnosticsBySource {
  const next: DiagnosticsBySource = { ...current };
  for (const source of sources) {
    delete next[source];
  }
  return next;
}

export function diagnosticsBySource(diagnostics: readonly Diagnostic[]): DiagnosticsBySource {
  const result: DiagnosticsBySource = {};
  for (const diagnostic of diagnostics) {
    result[diagnostic.source] = [...(result[diagnostic.source] ?? []), diagnostic];
  }
  return result;
}

export function mergeDiagnostics(
  current: DiagnosticsBySource,
  checkedSources: readonly string[],
  diagnostics: readonly Diagnostic[]
): DiagnosticsBySource {
  const next: DiagnosticsBySource = { ...current };
  for (const source of checkedSources) {
    delete next[source];
  }
  for (const diagnostic of diagnostics) {
    next[diagnostic.source] = [...(next[diagnostic.source] ?? []), diagnostic];
  }
  return next;
}

export function uniqueDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const result: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

export function diagnosticErrorSources(...sources: readonly DiagnosticsBySource[]): Set<string> {
  const result = new Set<string>();
  for (const source of sources) {
    for (const [sourceIdentity, diagnostics] of Object.entries(source)) {
      if (diagnostics.some(isErrorDiagnostic)) {
        result.add(sourceIdentity);
      }
    }
  }
  return result;
}

export function diagnosticsHaveErrors(source: DiagnosticsBySource): boolean {
  return Object.values(source).some((diagnostics) => diagnostics.some(isErrorDiagnostic));
}

export function isErrorDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.level === 'ERROR';
}

export function isSourceDiagnostic(
  diagnostic: Diagnostic
): diagnostic is Diagnostic & { line: number; column: number } {
  return (diagnostic.category === undefined || diagnostic.category === 'SOURCE')
    && diagnostic.line !== undefined
    && diagnostic.column !== undefined;
}

export function tokenRangeAt(text: string, column: number): { start: number; end: number } {
  if (text.length === 0) {
    return { start: 0, end: 1 };
  }

  let index = Math.max(0, Math.min(column, text.length - 1));
  if (column >= text.length || isTokenBreak(text[index])) {
    while (index > 0 && isTokenBreak(text[index])) {
      index--;
    }
    if (isTokenBreak(text[index])) {
      return {
        start: Math.max(0, Math.min(column, text.length)),
        end: Math.max(1, Math.min(column + 1, text.length + 1))
      };
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

export function diagnosticPosition(diagnostic: Diagnostic): string {
  if (diagnostic.line === undefined || diagnostic.column === undefined) {
    return diagnostic.category === 'SYSTEM' ? 'system' : '-';
  }
  return `${diagnostic.line}:${diagnostic.column + 1}`;
}

export function diagnosticCounts(
  diagnostics: readonly Diagnostic[]
): { errors: number; warnings: number; notes: number } {
  let errors = 0;
  let warnings = 0;
  let notes = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.level === 'ERROR') {
      errors += 1;
    } else if (diagnostic.level === 'WARNING') {
      warnings += 1;
    } else {
      notes += 1;
    }
  }
  return { errors, warnings, notes };
}

export function messageLevel(diagnostic: Diagnostic): MessageView['level'] {
  if (diagnostic.level === 'ERROR') {
    return 'ERROR';
  }
  if (diagnostic.level === 'WARNING') {
    return 'WARNING';
  }
  return 'NOTE';
}

function diagnosticKey(diagnostic: Diagnostic): string {
  return [
    diagnostic.source,
    diagnostic.level ?? '',
    diagnostic.code,
    diagnostic.message,
    diagnostic.line ?? '',
    diagnostic.column ?? '',
    diagnostic.endLine ?? '',
    diagnostic.endColumn ?? ''
  ].join('\u0000');
}

function isTokenBreak(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

