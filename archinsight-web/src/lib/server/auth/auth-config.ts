import type { AuthLoginOption, StandaloneTokenConfig } from './types';
import { randomBytes } from 'node:crypto';
import { runtimeEnv, type EnvSource } from '$lib/server/config/local-config';
import {
  booleanConfigValue,
  configValue,
  csvConfigValue,
  enumConfigValue,
  integerConfigValue,
  optionalConfigValue,
  optionalUrlConfigValue,
  requiredConfigValue,
  requiredUrlConfigValue,
  urlConfigValue
} from '$lib/server/config/config-values';
const runtimeTokenSecret = randomBytes(32).toString('base64url');

export type { EnvSource } from '$lib/server/config/local-config';

export type AuthMode = 'standalone' | 'local-dev' | 'oidc';

export type AuthConfig = {
  contextRoot: string;
  editorPath: string;
  mode: AuthMode;
  devLoginEnabled: boolean;
  devUserId: string | null;
  devUserEmail: string;
  devUserDisplayName: string;
  loginUrl: string | null;
  logoutUrl: string | null;
  standaloneSyncApiToken: string | null;
  tokenCookieName: string;
  cookieSecure: boolean;
  token: StandaloneTokenConfig;
  ghost: GhostConfig;
  oidc: OidcConfig;
};

export type OidcConfig = {
  callbackBaseUrl: string;
  stateCookiePrefix: string;
  stateTtlSeconds: number;
  providers: OidcProviderConfig[];
};

export type GhostConfig = {
  enabled: boolean;
  adminApiUrl: string | null;
  publicUrl: string | null;
  adminApiKey: string | null;
  syncApiToken: string | null;
  ssrCookieName: string;
  ssrSecretKey: string | null;
};

export type OidcProviderConfig = {
  id: string;
  label: string;
  issuer: string;
  authorizationUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  userInfoUrl: string | null;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string | null;
};

export function getAuthConfig(env?: EnvSource): AuthConfig {
  return parseAuthConfig(runtimeEnv(env));
}

export function parseAuthConfig(source: EnvSource): AuthConfig {
  const contextRoot = normalizePathPrefix(source.ARCHINSIGHT_CONTEXT_ROOT ?? '/');
  const editorPath = normalizeAbsolutePath(source.ARCHINSIGHT_EDITOR_PATH ?? '/editor');
  const mode = enumConfigValue(source, 'ARCHINSIGHT_AUTH_MODE', ['standalone', 'local-dev', 'oidc'], 'standalone');
  const tokenCookieName = configValue(source, 'ARCHINSIGHT_AUTH_TOKEN_COOKIE_NAME', 'archinsight-session');
  const devLoginEnabled = booleanConfigValue(source, 'ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED', false);
  if (devLoginEnabled && configValue(source, 'NODE_ENV', '').toLowerCase() === 'production') {
    throw new Error('ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED cannot be enabled in production');
  }
  const devUserId = optionalConfigValue(source, 'ARCHINSIGHT_AUTH_DEV_USER_ID');
  const devUserEmail = configValue(source, 'ARCHINSIGHT_AUTH_DEV_USER_EMAIL', 'dev@archinsight.local');
  const devUserDisplayName = configValue(source, 'ARCHINSIGHT_AUTH_DEV_USER_DISPLAY_NAME', 'Development User');
  const loginUrl = optionalConfigValue(source, 'ARCHINSIGHT_AUTH_LOGIN_URL');
  const logoutUrl = optionalConfigValue(source, 'ARCHINSIGHT_AUTH_LOGOUT_URL');
  const standaloneSyncApiToken = optionalConfigValue(source, 'ARCHINSIGHT_AUTH_STANDALONE_SYNC_API_TOKEN', { preserveWhitespace: true });
  const ghost = ghostConfig(source);
  const oidc = oidcConfig(source);
  const tokenSecret = authTokenSecret(source, mode);

  return {
    contextRoot,
    editorPath,
    mode,
    devLoginEnabled,
    devUserId,
    devUserEmail,
    devUserDisplayName,
    loginUrl,
    logoutUrl,
    standaloneSyncApiToken,
    tokenCookieName,
    cookieSecure: booleanConfigValue(source, 'ARCHINSIGHT_AUTH_COOKIE_SECURE', true),
    token: {
      secret: tokenSecret,
      issuer: configValue(source, 'ARCHINSIGHT_AUTH_TOKEN_ISSUER', 'archinsight'),
      audience: configValue(source, 'ARCHINSIGHT_AUTH_TOKEN_AUDIENCE', 'archinsight-editor'),
      ttlMinutes: integerConfigValue(source, 'ARCHINSIGHT_AUTH_TOKEN_TTL_MINUTES', 1440, { min: 1 })
    },
    ghost,
    oidc
  };

}

function authTokenSecret(env: EnvSource, mode: string): string {
  const configured = optionalConfigValue(env, 'ARCHINSIGHT_AUTH_TOKEN_SECRET', { preserveWhitespace: true });
  if (configured) {
    return configured;
  }
  const persistentSecretRequired = configValue(env, 'NODE_ENV', '').toLowerCase() === 'production'
    || booleanConfigValue(env, 'ARCHINSIGHT_DATABASE_ENABLED', false)
    || enumConfigValue(env, 'ARCHINSIGHT_REPOSITORY_BACKEND', ['memory', 'postgres'], 'memory') === 'postgres'
    || mode === 'oidc'
    || csvConfigValue(env, 'ARCHINSIGHT_AUTH_OIDC_PROVIDERS').length > 0;
  if (persistentSecretRequired) {
    throw new Error('ARCHINSIGHT_AUTH_TOKEN_SECRET must be configured for production, Postgres, or OIDC authentication');
  }
  return runtimeTokenSecret;
}

function ghostConfig(env: EnvSource): GhostConfig {
  const enabled = booleanConfigValue(env, 'ARCHINSIGHT_AUTH_GHOST_ENABLED', false);
  const ssrSecretKey = optionalConfigValue(env, 'ARCHINSIGHT_AUTH_GHOST_SSR_SECRET_KEY', { preserveWhitespace: true });
  if (enabled && !ssrSecretKey) {
    throw new Error('ARCHINSIGHT_AUTH_GHOST_SSR_SECRET_KEY must be configured when Ghost integration is enabled');
  }
  return {
    enabled,
    adminApiUrl: optionalUrlConfigValue(env, 'ARCHINSIGHT_AUTH_GHOST_ADMIN_API_URL', { protocols: ['http:', 'https:'], allowCredentials: false }),
    publicUrl: optionalUrlConfigValue(env, 'ARCHINSIGHT_AUTH_GHOST_PUBLIC_URL', { protocols: ['http:', 'https:'], allowCredentials: false }),
    adminApiKey: optionalConfigValue(env, 'ARCHINSIGHT_AUTH_GHOST_ADMIN_API_KEY', { preserveWhitespace: true }),
    syncApiToken: optionalConfigValue(env, 'ARCHINSIGHT_AUTH_GHOST_SYNC_API_TOKEN', { preserveWhitespace: true }),
    ssrCookieName: configValue(env, 'ARCHINSIGHT_AUTH_GHOST_SSR_COOKIE_NAME', 'ghost-members-ssr'),
    ssrSecretKey
  };
}

export function loginOptions(config: AuthConfig): AuthLoginOption[] {
  const options: AuthLoginOption[] = [];
  if (config.devLoginEnabled && config.devUserId) {
    options.push({
      id: 'dev',
      label: 'Dev sign in',
      url: publicPath(config, '/api/auth/dev/login')
    });
  }
  for (const provider of config.oidc.providers) {
    options.push({
      id: provider.id,
      label: `${provider.label} sign in`,
      url: publicPath(config, `/api/auth/oidc/login/${encodeURIComponent(provider.id)}`)
    });
  }
  if (options.length > 0) {
    return options;
  }
  if (config.loginUrl) {
    return [
      {
        id: config.mode,
        label: `${providerLabel(config.mode)} sign in`,
        url: config.loginUrl
      }
    ];
  }
  return [];
}

export function publicPath(config: AuthConfig, path: string): string {
  return `${config.contextRoot}${normalizeAbsolutePath(path)}`;
}

export function postLoginRedirect(config: AuthConfig, returnTo: string | null): string {
  const safe = safeReturnTo(config, returnTo);
  if (safe) {
    return safe;
  }
  return publicPath(config, config.editorPath);
}

export function safeReturnTo(config: AuthConfig, returnTo: string | null | undefined): string | null {
  if (!returnTo || returnTo.trim() === '') {
    return null;
  }
  const trimmed = returnTo.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed, 'http://archinsight.local');
  } catch {
    return null;
  }
  if (parsed.origin !== 'http://archinsight.local') {
    return null;
  }
  if (config.contextRoot !== '' && parsed.pathname !== config.contextRoot && !parsed.pathname.startsWith(`${config.contextRoot}/`)) {
    return null;
  }
  if (parsed.pathname === publicPath(config, '/login')) {
    return null;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function oidcProvider(config: AuthConfig, providerId: string): OidcProviderConfig | null {
  return config.oidc.providers.find((provider) => provider.id === providerId) ?? null;
}

export function oidcRedirectUri(config: AuthConfig, provider: OidcProviderConfig): string {
  if (provider.redirectUri) {
    return provider.redirectUri;
  }
  return `${trimSlash(config.oidc.callbackBaseUrl)}${publicPath(config, `/api/auth/oidc/callback/${encodeURIComponent(provider.id)}`)}`;
}

function oidcConfig(env: EnvSource): OidcConfig {
  const providerIds = csvConfigValue(env, 'ARCHINSIGHT_AUTH_OIDC_PROVIDERS');
  return {
    callbackBaseUrl: urlConfigValue(env, 'ARCHINSIGHT_AUTH_OIDC_CALLBACK_BASE_URL', 'http://localhost:5173', { protocols: ['http:', 'https:'], allowCredentials: false }),
    stateCookiePrefix: configValue(env, 'ARCHINSIGHT_AUTH_OIDC_STATE_COOKIE_PREFIX', 'archinsight-oidc-state'),
    stateTtlSeconds: integerConfigValue(env, 'ARCHINSIGHT_AUTH_OIDC_STATE_TTL_SECONDS', 600, { min: 1 }),
    providers: providerIds.map((providerId) => oidcProviderConfig(env, providerId))
  };
}

function oidcProviderConfig(env: EnvSource, providerId: string): OidcProviderConfig {
  const prefix = `ARCHINSIGHT_AUTH_OIDC_${envKey(providerId)}_`;
  const defaults = defaultOidcProvider(providerId);
  const issuer = requiredUrlConfigValue({ ...env, [`${prefix}ISSUER`]: env[`${prefix}ISSUER`] ?? defaults.issuer }, `${prefix}ISSUER`, { protocols: ['http:', 'https:'], allowCredentials: false });
  return {
    id: providerId,
    label: configValue(env, `${prefix}LABEL`, providerLabel(providerId)),
    issuer,
    authorizationUrl: requiredUrlConfigValue(env, `${prefix}AUTHORIZATION_URL`, { protocols: ['http:', 'https:'], allowCredentials: false }, defaults.authorizationUrl),
    tokenUrl: requiredUrlConfigValue(env, `${prefix}TOKEN_URL`, { protocols: ['http:', 'https:'], allowCredentials: false }, defaults.tokenUrl),
    jwksUrl: requiredUrlConfigValue(env, `${prefix}JWKS_URL`, { protocols: ['http:', 'https:'], allowCredentials: false }, defaults.jwksUrl),
    userInfoUrl: defaults.userInfoUrl == null && env[`${prefix}USERINFO_URL`] == null
      ? null
      : optionalUrlConfigValue({ ...env, [`${prefix}USERINFO_URL`]: env[`${prefix}USERINFO_URL`] ?? defaults.userInfoUrl ?? undefined }, `${prefix}USERINFO_URL`, { protocols: ['http:', 'https:'], allowCredentials: false }),
    clientId: requiredConfigValue(env, `${prefix}CLIENT_ID`),
    clientSecret: requiredConfigValue(env, `${prefix}CLIENT_SECRET`, undefined, { preserveWhitespace: true }),
    scopes: requiredConfigValue(env, `${prefix}SCOPES`, defaults.scopes),
    redirectUri: optionalUrlConfigValue(env, `${prefix}REDIRECT_URI`, { protocols: ['http:', 'https:'], allowCredentials: false })
  };
}

function defaultOidcProvider(providerId: string): Omit<OidcProviderConfig, 'id' | 'label' | 'clientId' | 'clientSecret' | 'redirectUri'> {
  if (providerId !== 'google') {
    return {
      issuer: '',
      authorizationUrl: '',
      tokenUrl: '',
      jwksUrl: '',
      userInfoUrl: null,
      scopes: ''
    };
  }
  return {
    issuer: 'https://accounts.google.com',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: 'openid email profile'
  };
}

function envKey(value: string): string {
  return value.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, '_');
}

function providerLabel(provider: string): string {
  const parts = provider.split(/[-_\s]+/u).filter(Boolean);
  if (parts.length === 0) {
    return 'Default';
  }
  return parts.map(capitalizeProviderLabelPart).join(' ');
}

function capitalizeProviderLabelPart(value: string): string {
  if (value.length <= 2) {
    return value.toUpperCase();
  }
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function trimSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizePathPrefix(path: string): string {
  const absolute = normalizeAbsolutePath(path);
  return absolute === '/' ? '' : absolute;
}

function normalizeAbsolutePath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }
  const prefixed = path.startsWith('/') ? path : `/${path}`;
  return prefixed.replace(/\/+$/u, '') || '/';
}
