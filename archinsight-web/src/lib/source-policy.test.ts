import { describe, expect, it } from 'vitest';
import {
  isDiscoverableProjectSource,
  isIgnoredProjectSourceDirectory,
  isSafeProjectSourceIdentity,
  normalizeProjectSourceIdentity
} from '@archinsight/contracts';

describe('project source policy', () => {
  it('normalizes host paths to stable POSIX identities', () => {
    expect(normalizeProjectSourceIdentity('./models\\shop.ai')).toBe('models/shop.ai');
  });

  it('shares discovery exclusions across hosts', () => {
    expect(['.git', '.codex', 'node_modules', 'build', 'dist'].every(isIgnoredProjectSourceDirectory)).toBe(true);
    expect(isIgnoredProjectSourceDirectory('models')).toBe(false);
    expect(isDiscoverableProjectSource('models/shop.ai')).toBe(true);
    expect(isDiscoverableProjectSource('models/shop.aiq')).toBe(false);
    expect(isDiscoverableProjectSource('.codex/skills/example.ai')).toBe(false);
    expect(isDiscoverableProjectSource('build/generated.ai')).toBe(false);
    expect(isSafeProjectSourceIdentity('../outside.ai')).toBe(false);
    expect(isSafeProjectSourceIdentity('/absolute.ai')).toBe(false);
    expect(isSafeProjectSourceIdentity('models/inside.ai')).toBe(true);
  });
});
