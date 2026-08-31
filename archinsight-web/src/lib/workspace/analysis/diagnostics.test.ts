import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '$lib/api';
import {
  diagnosticCounts,
  diagnosticErrorSources,
  diagnosticPosition,
  diagnosticsBySource,
  diagnosticsHaveErrors,
  isSourceDiagnostic,
  mergeDiagnostics,
  messageLevel,
  omitDiagnostics,
  tokenRangeAt,
  uniqueDiagnostics
} from './diagnostics';

const diagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  source: 'main.ai',
  level: 'ERROR',
  code: 'E001',
  message: 'Broken source',
  line: 2,
  column: 4,
  ...overrides
});

describe('workspace diagnostics model', () => {
  it('groups diagnostics by source while preserving source order', () => {
    const first = diagnostic();
    const other = diagnostic({ source: 'other.ai', code: 'W001', level: 'WARNING' });
    const second = diagnostic({ code: 'E002' });

    expect(diagnosticsBySource([first, other, second])).toEqual({
      'main.ai': [first, second],
      'other.ai': [other]
    });
  });

  it('replaces checked sources without mutating the previous diagnostics', () => {
    const oldMain = diagnostic({ code: 'OLD' });
    const untouched = diagnostic({ source: 'untouched.ai' });
    const current = { 'main.ai': [oldMain], 'untouched.ai': [untouched] };
    const replacement = diagnostic({ code: 'NEW' });
    const discovered = diagnostic({ source: 'new.ai' });

    expect(mergeDiagnostics(current, ['main.ai'], [replacement, discovered])).toEqual({
      'main.ai': [replacement],
      'untouched.ai': [untouched],
      'new.ai': [discovered]
    });
    expect(current).toEqual({ 'main.ai': [oldMain], 'untouched.ai': [untouched] });
  });

  it('omits requested sources without changing the input record', () => {
    const main = diagnostic();
    const other = diagnostic({ source: 'other.ai' });
    const current = { 'main.ai': [main], 'other.ai': [other] };

    expect(omitDiagnostics(current, ['main.ai', 'missing.ai'])).toEqual({ 'other.ai': [other] });
    expect(current).toEqual({ 'main.ai': [main], 'other.ai': [other] });
  });

  it('deduplicates exact diagnostics but preserves meaningful differences', () => {
    const first = diagnostic();
    const same = { ...first };
    const otherRange = diagnostic({ column: 5 });
    const otherLevel = diagnostic({ level: 'WARNING' });

    expect(uniqueDiagnostics([first, same, otherRange, otherLevel])).toEqual([
      first,
      otherRange,
      otherLevel
    ]);
  });

  it('finds error sources across diagnostic layers and ignores warnings', () => {
    const local = {
      'main.ai': [diagnostic({ level: 'WARNING' })],
      'broken.ai': [diagnostic({ source: 'broken.ai' })]
    };
    const linker = {
      'main.ai': [diagnostic()],
      'notes.ai': [diagnostic({ source: 'notes.ai', level: 'NOTICE' })]
    };

    expect([...diagnosticErrorSources(local, linker)]).toEqual(['broken.ai', 'main.ai']);
    expect(diagnosticsHaveErrors(local)).toBe(true);
    expect(diagnosticsHaveErrors({ 'main.ai': local['main.ai'] })).toBe(false);
  });

  it('only treats positioned source diagnostics as Monaco marker candidates', () => {
    expect(isSourceDiagnostic(diagnostic())).toBe(true);
    expect(isSourceDiagnostic(diagnostic({ category: 'SOURCE' }))).toBe(true);
    expect(isSourceDiagnostic(diagnostic({ category: 'SYSTEM' }))).toBe(false);
    expect(isSourceDiagnostic(diagnostic({ line: undefined }))).toBe(false);
    expect(isSourceDiagnostic(diagnostic({ column: undefined }))).toBe(false);
  });

  it('expands marker positions to the surrounding token and handles boundaries', () => {
    expect(tokenRangeAt('alpha beta', 7)).toEqual({ start: 6, end: 10 });
    expect(tokenRangeAt('alpha beta', 5)).toEqual({ start: 0, end: 5 });
    expect(tokenRangeAt(' alpha', 0)).toEqual({ start: 0, end: 1 });
    expect(tokenRangeAt('alpha beta', 10)).toEqual({ start: 6, end: 10 });
    expect(tokenRangeAt('', 4)).toEqual({ start: 0, end: 1 });
  });

  it('normalizes positions, message levels, and summary counts', () => {
    const error = diagnostic();
    const warning = diagnostic({ level: 'WARNING' });
    const notice = diagnostic({ level: 'NOTICE', line: undefined, column: undefined });
    const system = diagnostic({ category: 'SYSTEM', line: undefined, column: undefined });

    expect(diagnosticPosition(error)).toBe('2:5');
    expect(diagnosticPosition(notice)).toBe('-');
    expect(diagnosticPosition(system)).toBe('system');
    expect(messageLevel(error)).toBe('ERROR');
    expect(messageLevel(warning)).toBe('WARNING');
    expect(messageLevel(notice)).toBe('NOTE');
    expect(diagnosticCounts([error, warning, notice])).toEqual({ errors: 1, warnings: 1, notes: 1 });
  });
});

