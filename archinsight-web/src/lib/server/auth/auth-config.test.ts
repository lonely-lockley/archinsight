import { describe, expect, it } from 'vitest';
import { getAuthConfig } from './auth-config';

describe('getAuthConfig', () => {
  it('allows the process-local fallback only for non-persistent local development', () => {
    const first = getAuthConfig({ NODE_ENV: 'development', ARCHINSIGHT_AUTH_MODE: 'local-dev' });
    const second = getAuthConfig({ NODE_ENV: 'development', ARCHINSIGHT_AUTH_MODE: 'local-dev' });

    expect(first.token.secret).toBe(second.token.secret);
    expect(first.token.secret.length).toBeGreaterThan(20);
  });

  it.each([
    ['production', { NODE_ENV: 'production' }],
    ['Postgres', { NODE_ENV: 'development', ARCHINSIGHT_DATABASE_ENABLED: 'true' }],
    ['Postgres repository backend', { NODE_ENV: 'development', ARCHINSIGHT_REPOSITORY_BACKEND: 'postgres' }],
    ['OIDC mode', { NODE_ENV: 'development', ARCHINSIGHT_AUTH_MODE: 'oidc' }]
  ])('requires a persistent token secret for %s', (_name, env) => {
    expect(() => getAuthConfig(env)).toThrow('ARCHINSIGHT_AUTH_TOKEN_SECRET must be configured');
  });

  it('accepts a configured persistent token secret', () => {
    const config = getAuthConfig({
      NODE_ENV: 'production',
      ARCHINSIGHT_DATABASE_ENABLED: 'true',
      ARCHINSIGHT_AUTH_TOKEN_SECRET: 'persistent-test-secret'
    });

    expect(config.token.secret).toBe('persistent-test-secret');
  });
});
