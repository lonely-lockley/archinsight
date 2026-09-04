import { describe, expect, it } from 'vitest';
import { getAuthConfig } from './auth-config';

describe('getAuthConfig', () => {
  it('uses standalone JWT authentication by default', () => {
    const config = getAuthConfig({
      NODE_ENV: 'development',
      ARCHINSIGHT_AUTH_TOKEN_SECRET: 'default-auth-test-secret'
    });

    expect(config.mode).toBe('standalone');
    expect(config.ghost.enabled).toBe(false);
  });

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

  it('rejects development login in production', () => {
    expect(() => getAuthConfig({
      NODE_ENV: 'production',
      ARCHINSIGHT_AUTH_TOKEN_SECRET: 'persistent-test-secret',
      ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED: 'true'
    })).toThrow('ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED cannot be enabled in production');
  });

  it('limits standalone sessions to 24 hours by default', () => {
    const config = getAuthConfig({
      NODE_ENV: 'development',
      ARCHINSIGHT_AUTH_MODE: 'local-dev'
    });

    expect(config.token.ttlMinutes).toBe(1440);
  });

  it('requires the Ghost SSR signing secret when Ghost authentication is enabled', () => {
    expect(() => getAuthConfig({
      ARCHINSIGHT_AUTH_MODE: 'local-dev',
      ARCHINSIGHT_AUTH_GHOST_ENABLED: 'true'
    })).toThrow('ARCHINSIGHT_AUTH_GHOST_SSR_SECRET_KEY must be configured');
  });

  it('rejects malformed booleans and session durations instead of silently falling back', () => {
    expect(() => getAuthConfig({
      ARCHINSIGHT_AUTH_MODE: 'local-dev',
      ARCHINSIGHT_AUTH_COOKIE_SECURE: 'ture'
    })).toThrow('ARCHINSIGHT_AUTH_COOKIE_SECURE');
    expect(() => getAuthConfig({
      ARCHINSIGHT_AUTH_MODE: 'local-dev',
      ARCHINSIGHT_AUTH_TOKEN_TTL_MINUTES: '-1'
    })).toThrow('ARCHINSIGHT_AUTH_TOKEN_TTL_MINUTES');
  });
});
