import { describe, expect, it } from 'vitest';
import { parseApplicationConfig } from './application-config';

const localEnv = {
  NODE_ENV: 'development',
  ARCHINSIGHT_AUTH_MODE: 'local-dev'
};

describe('ApplicationConfig', () => {
  it('parses every server feature into one deeply immutable configuration', () => {
    const config = parseApplicationConfig(localEnv);

    expect(config).toMatchObject({
      runtimeProfile: 'all',
      repositoryBackend: 'memory',
      database: { enabled: false, port: 5432, maxConnections: 10 },
      renderer: { enabled: false },
      requestLimits: { maxRenderCount: 16 },
      analysisCache: { maxEntries: 32, ttlMs: 900_000 }
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.auth)).toBe(true);
    expect(Object.isFrozen(config.auth.oidc.providers)).toBe(true);
  });

  it.each([
    ['ARCHINSIGHT_RUNTIME_PROFILE', 'invalid'],
    ['ARCHINSIGHT_REPOSITORY_BACKEND', 'filesystem'],
    ['ARCHINSIGHT_AUTH_COOKIE_SECURE', 'ture'],
    ['ARCHINSIGHT_AUTH_TOKEN_TTL_MINUTES', '1.5'],
    ['ARCHINSIGHT_DATABASE_PORT', '0'],
    ['ARCHINSIGHT_DATABASE_MAX_CONNECTIONS', '-1'],
    ['ARCHINSIGHT_LIMITS_MAX_FILE_BYTES', '-1'],
    ['ARCHINSIGHT_ANALYSIS_CACHE_TTL_SECONDS', '0.5']
  ])('fails fast and identifies invalid key %s', (key, value) => {
    expect(() => parseApplicationConfig({ ...localEnv, [key]: value })).toThrow(key);
  });

  it('validates enabled renderer limits through the same integer policy', () => {
    expect(() => parseApplicationConfig({
      ...localEnv,
      ARCHINSIGHT_RENDERER_ENABLED: 'true',
      ARCHINSIGHT_RENDERER_URL: 'https://renderer.internal',
      ARCHINSIGHT_RENDERER_TOKEN: 'renderer-test-token',
      ARCHINSIGHT_RENDERER_TIMEOUT_MS: '-1'
    })).toThrow('ARCHINSIGHT_RENDERER_TIMEOUT_MS');
  });

  it('retains zero as an explicit disabling limit for requests and cache', () => {
    const config = parseApplicationConfig({
      ...localEnv,
      ARCHINSIGHT_LIMITS_MAX_RENDER_COUNT: '0',
      ARCHINSIGHT_ANALYSIS_CACHE_MAX_ENTRIES: '0',
      ARCHINSIGHT_ANALYSIS_CACHE_TTL_SECONDS: '0'
    });

    expect(config.requestLimits.maxRenderCount).toBe(0);
    expect(config.analysisCache).toMatchObject({ maxEntries: 0, ttlMs: 0 });
  });
});
