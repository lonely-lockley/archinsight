import { describe, expect, it } from 'vitest';
import {
  booleanConfigValue,
  ConfigurationError,
  enumConfigValue,
  integerConfigValue,
  optionalConfigValue,
  optionalUrlConfigValue
} from './config-values';

describe('configuration value parsers', () => {
  it.each([
    ['true', true], ['1', true], ['yes', true], ['on', true],
    ['false', false], ['0', false], ['no', false], ['off', false]
  ])('parses boolean spelling %s', (value, expected) => {
    expect(booleanConfigValue({ FEATURE_ENABLED: value }, 'FEATURE_ENABLED', !expected)).toBe(expected);
  });

  it('rejects malformed booleans and reports the exact key', () => {
    expect(() => booleanConfigValue({ FEATURE_ENABLED: 'ture' }, 'FEATURE_ENABLED', false))
      .toThrowError(new ConfigurationError('FEATURE_ENABLED', 'must be a boolean'));
  });

  it('parses bounded safe integers without silently applying defaults', () => {
    expect(integerConfigValue({ LIMIT: '0' }, 'LIMIT', 10, { min: 0 })).toBe(0);
    for (const value of ['-1', '1.5', 'NaN', '9007199254740992']) {
      expect(() => integerConfigValue({ LIMIT: value }, 'LIMIT', 10, { min: 0 }))
        .toThrow('LIMIT must be a safe integer');
    }
  });

  it('validates enums and URLs while preserving secret whitespace', () => {
    expect(enumConfigValue({ MODE: ' PLAYGROUND ' }, 'MODE', ['all', 'playground'], 'all')).toBe('playground');
    expect(() => enumConfigValue({ MODE: 'unknown' }, 'MODE', ['all', 'playground'], 'all'))
      .toThrow('MODE must be one of: all, playground');
    expect(optionalUrlConfigValue({ ENDPOINT: 'https://example.test/path' }, 'ENDPOINT', {
      protocols: ['https:'], allowCredentials: false
    })).toBe('https://example.test/path');
    expect(() => optionalUrlConfigValue({ ENDPOINT: 'https://user:secret@example.test' }, 'ENDPOINT', {
      protocols: ['https:'], allowCredentials: false
    })).toThrow('ENDPOINT must not contain credentials');
    expect(optionalConfigValue({ SECRET: '  exact secret  ' }, 'SECRET', { preserveWhitespace: true }))
      .toBe('  exact secret  ');
  });
});
