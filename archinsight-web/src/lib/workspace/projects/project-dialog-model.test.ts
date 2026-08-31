import { describe, expect, it } from 'vitest';
import { formatProjectDate } from './project-dialog-model';

describe('project dialog model', () => {
  it('uses a placeholder for missing dates and preserves invalid values', () => {
    expect(formatProjectDate(undefined, 'en-US')).toBe('—');
    expect(formatProjectDate('', 'en-US')).toBe('—');
    expect(formatProjectDate('not-a-date', 'en-US')).toBe('not-a-date');
  });

  it('formats valid dates with the requested locale', () => {
    const value = '2026-08-31T10:15:00.000Z';
    const expected = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));

    expect(formatProjectDate(value, 'en-US')).toBe(expected);
  });
});
