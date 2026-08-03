import type { AuthLoginOption, StandaloneTokenConfig } from './types';
import { randomBytes } from 'node:crypto';
import { runtimeEnv, type EnvSource } from '$lib/server/config/local-config';

const UNCONFIGURED = '__unset__';
const runtimeTokenSecret = randomBytes(32).toString('base64url');

export type { EnvSource } from '$lib/server/config/local-config';

export type AuthConfig = {
  contextRoot: string;
  editorPath: string;
  mode: string;
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
  adminApiKey: string | null;
  syncApiToken: string | null;
  ssrCookieName: string;
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
  const source = runtimeEnv(env);
  const contextRoot = normalizePathPrefix(source.ARCHINSIGHT_CONTEXT_ROOT ?? '/');
  const editorPath = normalizeAbsolutePath(source.ARCHINSIGHT_EDITOR_PATH ?? '/editor');
  const mode = (source.ARCHINSIGHT_AUTH_MODE ?? 'standalone').toLowerCase();
  const tokenCookieName = source.ARCHINSIGHT_AUTH_TOKEN_COOKIE_NAME ?? 'archinsight-session';
  const devLoginEnabled = booleanValue(source.ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED, false);
  const devUserId = optionalValue(source.ARCHINSIGHT_AUTH_DEV_USER_ID);
  const devUserEmail = source.ARCHINSIGHT_AUTH_DEV_USER_EMAIL ?? 'dev@archinsight.local';
  const devUserDisplayName = source.ARCHINSIGHT_AUTH_DEV_USER_DISPLAY_NAME ?? 'Development User';
  const loginUrl = optionalValue(source.ARCHINSIGHT_AUTH_LOGIN_URL);
  const logoutUrl = optionalValue(source.ARCHINSIGHT_AUTH_LOGOUT_URL);
  const standaloneSyncApiToken = optionalValue(source.ARCHINSIGHT_AUTH_STANDALONE_SYNC_API_TOKEN);
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
    cookieSecure: booleanValue(source.ARCHINSIGHT_AUTH_COOKIE_SECURE, true),
    token: {
      secret: tokenSecret,
      issuer: source.ARCHINSIGHT_AUTH_TOKEN_ISSUER ?? 'archinsight',
      audience: source.ARCHINSIGHT_AUTH_TOKEN_AUDIENCE ?? 'archinsight-editor',
      ttlMinutes: numberValue(source.ARCHINSIGHT_AUTH_TOKEN_TTL_MINUTES, 43200)
    },
    ghost,
    oidc
  };

}

function authTokenSecret(env: EnvSource, mode: string): string {
  const configured = optionalValue(env.ARCHINSIGHT_AUTH_TOKEN_SECRET);
  if (configured) {
    return configured;
  }
  const persistentSecretRequired = env.NODE_ENV === 'production'
    || booleanValue(env.ARCHINSIGHT_DATABASE_ENABLED, false)
    || (env.ARCHINSIGHT_REPOSITORY_BACKEND ?? '').toLowerCase() === 'postgres'
    || mode === 'oidc'
    || splitCsv(env.ARCHINSIGHT_AUTH_OIDC_PROVIDERS).length > 0;
  if (persistentSecretRequired) {
    throw new Error('ARCHINSIGHT_AUTH_TOKEN_SECRET must be configured for production, Postgres, or OIDC authentication');
  }
  return runtimeTokenSecret;
}

function ghostConfig(env: EnvSource): GhostConfig {
  return {
    enabled: booleanValue(env.ARCHINSIGHT_AUTH_GHOST_ENABLED, false),
    adminApiUrl: optionalValue(env.ARCHINSIGHT_AUTH_GHOST_ADMIN_API_URL),
    adminApiKey: optionalValue(env.ARCHINSIGHT_AUTH_GHOST_ADMIN_API_KEY),
    syncApiToken: optionalValue(env.ARCHINSIGHT_AUTH_GHOST_SYNC_API_TOKEN),
    ssrCookieName: env.ARCHINSIGHT_AUTH_GHOST_SSR_COOKIE_NAME ?? 'ghost-members-ssr'
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
  const providerIds = splitCsv(env.ARCHINSIGHT_AUTH_OIDC_PROVIDERS);
  return {
    callbackBaseUrl: env.ARCHINSIGHT_AUTH_OIDC_CALLBACK_BASE_URL ?? 'http://localhost:5173',
    stateCookiePrefix: env.ARCHINSIGHT_AUTH_OIDC_STATE_COOKIE_PREFIX ?? 'archinsight-oidc-state',
    stateTtlSeconds: numberValue(env.ARCHINSIGHT_AUTH_OIDC_STATE_TTL_SECONDS, 600),
    providers: providerIds.map((providerId) => oidcProviderConfig(env, providerId))
  };
}

function oidcProviderConfig(env: EnvSource, providerId: string): OidcProviderConfig {
  const prefix = `ARCHINSIGHT_AUTH_OIDC_${envKey(providerId)}_`;
  const defaults = defaultOidcProvider(providerId);
  const issuer = requiredValue(env[`${prefix}ISSUER`] ?? defaults.issuer, `${prefix}ISSUER`);
  return {
    id: providerId,
    label: env[`${prefix}LABEL`] ?? providerLabel(providerId),
    issuer,
    authorizationUrl: requiredValue(env[`${prefix}AUTHORIZATION_URL`] ?? defaults.authorizationUrl, `${prefix}AUTHORIZATION_URL`),
    tokenUrl: requiredValue(env[`${prefix}TOKEN_URL`] ?? defaults.tokenUrl, `${prefix}TOKEN_URL`),
    jwksUrl: requiredValue(env[`${prefix}JWKS_URL`] ?? defaults.jwksUrl, `${prefix}JWKS_URL`),
    userInfoUrl: optionalValue(env[`${prefix}USERINFO_URL`] ?? defaults.userInfoUrl),
    clientId: requiredValue(env[`${prefix}CLIENT_ID`], `${prefix}CLIENT_ID`),
    clientSecret: requiredValue(env[`${prefix}CLIENT_SECRET`], `${prefix}CLIENT_SECRET`),
    scopes: requiredValue(env[`${prefix}SCOPES`] ?? defaults.scopes, `${prefix}SCOPES`),
    redirectUri: optionalValue(env[`${prefix}REDIRECT_URI`])
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

function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, items) => item !== '' && items.indexOf(item) === index);
}

function envKey(value: string): string {
  return value.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, '_');
}

function requiredValue(value: string | null | undefined, name: string): string {
  const optional = optionalValue(value ?? undefined);
  if (!optional) {
    throw new Error(`${name} must be configured`);
  }
  return optional;
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

function optionalValue(value: string | null | undefined): string | null {
  if (!value || value.trim() === '' || value === UNCONFIGURED) {
    return null;
  }
  return value;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function numberValue(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
