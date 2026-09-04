import { createPublicKey, randomBytes, verify as verifySignature, type JsonWebKey as CryptoJsonWebKey } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import {
  oidcProvider,
  oidcRedirectUri,
  postLoginRedirect,
  safeReturnTo,
  type AuthConfig,
  type OidcProviderConfig
} from './auth-config';
import type { ApplicationServices } from '$lib/server/config/application-services';
import { issueStandaloneToken } from './standalone-token';
import { upsertUserdataProfile } from './userdata-store';
import { synchronizeGhostUser } from './ghost-service';
import type { UserdataProfile } from './types';

type OidcTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
};

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type IdTokenPayload = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
  locale?: string;
};

type JwksResponse = {
  keys?: OidcJwk[];
};

type OidcJwk = CryptoJsonWebKey & {
  kid?: string;
  kty?: string;
};

type ExpectedState = {
  nonce: string;
  returnTo: string;
};

const defaultFetch: typeof fetch = (...args) => fetch(...args);

export function startOidcLogin(
  providerId: string,
  returnTo: string | null,
  cookies: Cookies,
  services: ApplicationServices
): Response {
  const config = services.config.auth;
  const provider = requireProvider(config, providerId);
  const state = randomToken();
  const nonce = randomToken();
  cookies.set(stateCookieName(config, provider.id), stateCookieValue(state, nonce, safeReturnTo(config, returnTo) ?? ''), {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: config.oidc.stateTtlSeconds
  });

  return new Response(null, {
    status: 307,
    headers: {
      location: authorizationUrl(config, provider, state, nonce)
    }
  });
}

export async function completeOidcLogin(
  providerId: string,
  url: URL,
  cookies: Cookies,
  services: ApplicationServices,
  fetcher: typeof fetch = defaultFetch
): Promise<Response> {
  const config = services.config.auth;
  const provider = requireProvider(config, providerId);
  const providerError = url.searchParams.get('error');
  if (providerError) {
    return jsonError('OIDC provider rejected login', 400);
  }
  const code = url.searchParams.get('code');
  if (!code) {
    return jsonError('OIDC authorization code is required', 400);
  }
  const expected = expectedState(config, provider.id, url.searchParams.get('state'), cookies);
  const token = await exchangeAuthorizationCode(config, provider, code, fetcher);
  if (!token.id_token) {
    return jsonError('OIDC token response does not contain id_token', 400);
  }
  const profile = await userProfile(provider, token, expected.nonce, fetcher);
  if (config.ghost.enabled) {
    await synchronizeGhostUser(profile, cookies, services, fetcher);
  } else {
    const user = await upsertUserdataProfile(profile, services);
    const sessionToken = issueStandaloneToken(user, config.token);
    cookies.delete(config.ghost.ssrCookieName, { path: '/' });
    cookies.delete(`${config.ghost.ssrCookieName}.sig`, { path: '/' });
    cookies.set(config.tokenCookieName, sessionToken, {
      path: '/',
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax'
    });
  }
  cookies.delete(stateCookieName(config, provider.id), { path: '/' });

  return loginCompletionResponse(postLoginRedirect(config, expected.returnTo));
}

function loginCompletionResponse(redirect: string): Response {
  const encodedRedirect = JSON.stringify(redirect).replaceAll('<', '\\u003c');
  return new Response(
    `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Archinsight sign in</title></head>
  <body>
    <script>
      const redirect = ${encodedRedirect};
      if (window.opener && !window.opener.closed) {
        if (typeof window.opener.loginCallback === 'function') {
          window.opener.loginCallback();
        } else {
          window.opener.location.reload();
        }
        window.close();
      } else {
        window.location.replace(redirect);
      }
    </script>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
}

async function exchangeAuthorizationCode(
  config: AuthConfig,
  provider: OidcProviderConfig,
  code: string,
  fetcher: typeof fetch
): Promise<OidcTokenResponse> {
  const body = form({
    grant_type: 'authorization_code',
    code,
    redirect_uri: oidcRedirectUri(config, provider),
    client_id: provider.clientId,
    client_secret: provider.clientSecret
  });
  const response = await fetcher(provider.tokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!response.ok) {
    throw new Error(`OIDC token endpoint returned status ${response.status}`);
  }
  return (await response.json()) as OidcTokenResponse;
}

async function userProfile(
  provider: OidcProviderConfig,
  token: OidcTokenResponse,
  expectedNonce: string,
  fetcher: typeof fetch
): Promise<UserdataProfile> {
  const payload = await verifyIdToken(provider, token.id_token ?? '', expectedNonce, fetcher);
  const userInfo = provider.userInfoUrl && token.access_token ? await fetchUserInfo(provider, token.access_token, fetcher) : {};
  const email = stringValue(userInfo.email) ?? payload.email;
  if (!email) {
    throw new Error('OIDC id_token does not contain email');
  }
  return {
    email,
    emailVerified: booleanValue(userInfo.email_verified) ?? payload.email_verified ?? null,
    firstName: stringValue(userInfo.given_name) ?? payload.given_name ?? null,
    lastName: stringValue(userInfo.family_name) ?? payload.family_name ?? null,
    displayName: stringValue(userInfo.name) ?? payload.name ?? null,
    avatar: stringValue(userInfo.picture) ?? payload.picture ?? null,
    originId: `${provider.issuer}|${payload.sub}`,
    source: provider.id,
    locale: stringValue(userInfo.locale) ?? payload.locale ?? null
  };
}

async function verifyIdToken(
  provider: OidcProviderConfig,
  idToken: string,
  expectedNonce: string,
  fetcher: typeof fetch
): Promise<IdTokenPayload> {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('OIDC id_token is malformed');
  }
  const header = parseBase64UrlJson<JwtHeader>(encodedHeader);
  const payload = parseBase64UrlJson<IdTokenPayload>(encodedPayload);
  if (header.alg !== 'RS256') {
    throw new Error('Unsupported OIDC id_token algorithm');
  }
  if (!header.kid) {
    throw new Error('OIDC id_token does not contain key id');
  }
  const jwk = await signingKey(provider, header.kid, fetcher);
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(encodedSignature, 'base64url')
  );
  if (!valid) {
    throw new Error('OIDC id_token signature is invalid');
  }
  if (payload.iss !== provider.issuer) {
    throw new Error('OIDC id_token issuer does not match');
  }
  if (!audienceMatches(payload.aud, provider.clientId)) {
    throw new Error('OIDC id_token audience does not match');
  }
  if (!payload.sub) {
    throw new Error('OIDC id_token subject is missing');
  }
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('OIDC id_token is expired');
  }
  if (payload.nonce !== expectedNonce) {
    throw new Error('OIDC id_token nonce does not match');
  }
  return payload;
}

async function signingKey(provider: OidcProviderConfig, keyId: string, fetcher: typeof fetch): Promise<OidcJwk> {
  const response = await fetcher(provider.jwksUrl, {
    headers: {
      accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`OIDC JWKS endpoint returned status ${response.status}`);
  }
  const jwks = (await response.json()) as JwksResponse;
  const key = jwks.keys?.find((candidate) => candidate.kid === keyId && candidate.kty === 'RSA');
  if (!key) {
    throw new Error('OIDC signing key was not found');
  }
  return key;
}

async function fetchUserInfo(provider: OidcProviderConfig, accessToken: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  if (!provider.userInfoUrl) {
    return {};
  }
  const response = await fetcher(provider.userInfoUrl, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    return {};
  }
  return (await response.json()) as Record<string, unknown>;
}

function authorizationUrl(config: AuthConfig, provider: OidcProviderConfig, state: string, nonce: string): string {
  return `${provider.authorizationUrl}?${form({
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: oidcRedirectUri(config, provider),
    scope: provider.scopes,
    state,
    nonce
  })}`;
}

function expectedState(config: AuthConfig, providerId: string, actualState: string | null, cookies: Cookies): ExpectedState {
  if (!actualState) {
    throw new Error('OIDC state is required');
  }
  const cookie = cookies.get(stateCookieName(config, providerId));
  if (!cookie) {
    throw new Error('OIDC state cookie is missing');
  }
  const [state, nonce, encodedReturnTo] = cookie.split('.', 3);
  if (!state || !nonce || state !== actualState) {
    throw new Error('OIDC state does not match');
  }
  return {
    nonce,
    returnTo: safeReturnTo(config, decodeReturnTo(encodedReturnTo)) ?? ''
  };
}

function stateCookieName(config: AuthConfig, providerId: string): string {
  return `${config.oidc.stateCookiePrefix}-${providerId}`;
}

function stateCookieValue(state: string, nonce: string, returnTo: string): string {
  return `${state}.${nonce}.${encodeReturnTo(returnTo)}`;
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

function form(values: Record<string, string>): string {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function encodeReturnTo(returnTo: string): string {
  if (!returnTo) {
    return '';
  }
  return Buffer.from(returnTo, 'utf8').toString('base64url');
}

function decodeReturnTo(encoded: string | undefined): string {
  if (!encoded) {
    return '';
  }
  try {
    return Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    throw new Error('OIDC state is malformed');
  }
}

function parseBase64UrlJson<T>(encoded: string): T {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
}

function audienceMatches(actual: string | string[] | undefined, expected: string): boolean {
  if (Array.isArray(actual)) {
    return actual.includes(expected);
  }
  return actual === expected;
}

function requireProvider(config: AuthConfig, providerId: string): OidcProviderConfig {
  const provider = oidcProvider(config, providerId);
  if (!provider) {
    throw new Error('Unknown OIDC provider');
  }
  return provider;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
