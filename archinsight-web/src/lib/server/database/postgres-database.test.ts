import { describe, expect, it } from 'vitest';
import { normalizePostgresResult } from './postgres-database';

describe('normalizePostgresResult', () => {
  it('normalizes multi-statement pg results', () => {
    expect(
      normalizePostgresResult([
        { rows: [], rowCount: null },
        { rows: [{ version: 1 }], rowCount: 1 }
      ] as never)
    ).toEqual({
      rows: [{ version: 1 }],
      rowCount: null
    });
  });
});
