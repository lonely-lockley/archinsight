import { describe, expect, it } from 'vitest';
import { legacyYamlToEnv, localConfigCandidatePaths } from './local-config';

describe('local config compatibility loader', () => {
  it('maps legacy archinsight YAML keys to web env keys', () => {
    const env = legacyYamlToEnv(`
archinsight:
  context-root: /app
  database:
    enabled: 'true'
    jdbc-url: 'jdbc:postgresql://localhost:5432/repository'
    username: 'repository_srv'
    password: '5678'
    maximum-pool-size: '10'
  auth:
    mode: 'local-dev'
    dev-user-id: '5913933c-2268-41e1-a558-622dc11f675a'
    dev-login:
      enabled: 'true'
    cookie:
      secure: 'false'
    token:
      secret: 'secret'
    oidc:
      providers: 'google'
      callback-base-url: 'http://localhost:5173'
      google:
        client-id: 'google-client'
        client-secret: 'google-secret'
  limits:
    max-query-chars: 42
`);

    expect(env).toMatchObject({
      ARCHINSIGHT_CONTEXT_ROOT: '/app',
      ARCHINSIGHT_DATABASE_ENABLED: 'true',
      ARCHINSIGHT_DATABASE_HOST: 'localhost',
      ARCHINSIGHT_DATABASE_PORT: '5432',
      ARCHINSIGHT_DATABASE_NAME: 'repository',
      ARCHINSIGHT_DATABASE_USER: 'repository_srv',
      ARCHINSIGHT_DATABASE_PASSWORD: '5678',
      ARCHINSIGHT_DATABASE_MAX_CONNECTIONS: '10',
      ARCHINSIGHT_REPOSITORY_BACKEND: 'postgres',
      ARCHINSIGHT_AUTH_MODE: 'local-dev',
      ARCHINSIGHT_AUTH_DEV_USER_ID: '5913933c-2268-41e1-a558-622dc11f675a',
      ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED: 'true',
      ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false',
      ARCHINSIGHT_AUTH_TOKEN_SECRET: 'secret',
      ARCHINSIGHT_AUTH_OIDC_PROVIDERS: 'google',
      ARCHINSIGHT_AUTH_OIDC_CALLBACK_BASE_URL: 'http://localhost:5173',
      ARCHINSIGHT_AUTH_OIDC_GOOGLE_CLIENT_ID: 'google-client',
      ARCHINSIGHT_AUTH_OIDC_GOOGLE_CLIENT_SECRET: 'google-secret',
      ARCHINSIGHT_LIMITS_MAX_QUERY_CHARS: '42'
    });
  });

  it('searches local config through ancestor directories', () => {
    expect(localConfigCandidatePaths('/workspace/insight/archinsight-web/build', undefined)).toContain(
      '/workspace/insight/local/application.yaml'
    );
  });
});
