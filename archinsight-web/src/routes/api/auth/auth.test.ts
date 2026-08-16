import { describe, expect, it } from 'vitest';
import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { GET as devLogin } from './dev/login/+server';
import { GET as me } from './me/+server';
import { GET as portalLogout, POST as logout } from './logout/+server';
import { POST as ghostSync } from './ghost/sync/+server';
import { POST as standaloneToken } from './standalone/token/+server';
import { GET as oidcLogin } from './oidc/login/[provider]/+server';
import { GET as oidcCallback } from './oidc/callback/[provider]/+server';
import { verifyGhostSessionSignature } from '$lib/server/auth/ghost-session';
import { getAuthConfig } from '$lib/server/auth/auth-config';

const devConfig = {
  ARCHINSIGHT_DATABASE_ENABLED: 'false',
  ARCHINSIGHT_REPOSITORY_BACKEND: 'memory',
  ARCHINSIGHT_AUTH_DEV_LOGIN_ENABLED: 'true',
  ARCHINSIGHT_AUTH_DEV_USER_ID: '5913933c-2268-41e1-a558-622dc11f675a',
  ARCHINSIGHT_AUTH_TOKEN_SECRET: 'standalone-token-test-secret',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};
const localDevConfig = {
  ...devConfig,
  ARCHINSIGHT_AUTH_MODE: 'local-dev'
};
const oidcConfig = {
  ...devConfig,
  ARCHINSIGHT_AUTH_OIDC_PROVIDERS: 'google',
  ARCHINSIGHT_AUTH_OIDC_CALLBACK_BASE_URL: 'http://localhost',
  ARCHINSIGHT_AUTH_OIDC_GOOGLE_CLIENT_ID: 'google-client',
  ARCHINSIGHT_AUTH_OIDC_GOOGLE_CLIENT_SECRET: 'google-secret',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};
const ghostConfig = {
  ...devConfig,
  ARCHINSIGHT_AUTH_GHOST_ENABLED: 'true',
  ARCHINSIGHT_AUTH_GHOST_ADMIN_API_URL: 'https://ghost.example',
  ARCHINSIGHT_AUTH_GHOST_ADMIN_API_KEY: 'ghost-key:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ARCHINSIGHT_AUTH_GHOST_SYNC_API_TOKEN: 'ghost-sync-token',
  ARCHINSIGHT_AUTH_GHOST_SSR_SECRET_KEY: 'ghost-ssr-secret',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};
const oidcGhostConfig = {
  ...oidcConfig,
  ...ghostConfig
};
const standaloneSyncConfig = {
  ...devConfig,
  ARCHINSIGHT_AUTH_STANDALONE_SYNC_API_TOKEN: 'standalone-sync-token',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};

describe('auth API', () => {
  it('returns anonymous user with configured login options', async () => {
    const response = await me({ cookies: cookies(), platform: { env: devConfig } } as never);

    await expect(response.json()).resolves.toMatchObject({
      authenticated: false,
      loginOptions: [
        {
          id: 'dev',
          label: 'Dev sign in',
          url: '/api/auth/dev/login'
        }
      ]
    });
  });

  it('returns configured OIDC providers as login options', async () => {
    const response = await me({ cookies: cookies(), platform: { env: oidcConfig } } as never);

    await expect(response.json()).resolves.toMatchObject({
      authenticated: false,
      loginOptions: [
        {
          id: 'dev',
          label: 'Dev sign in'
        },
        {
          id: 'google',
          label: 'Google sign in',
          url: '/api/auth/oidc/login/google'
        }
      ]
    });
  });

  it('does not authenticate local-dev requests without an explicit session cookie', async () => {
    const response = await me({ cookies: cookies(), platform: { env: localDevConfig } } as never);

    await expect(response.json()).resolves.toMatchObject({
      authenticated: false,
      id: null,
      loginOptions: [
        {
          id: 'dev',
          label: 'Dev sign in'
        }
      ]
    });
  });

  it('dev login redirects and sets standalone session cookie', async () => {
    const jar = cookies();
    const response = await devLogin({
      cookies: jar,
      url: new URL('http://localhost/api/auth/dev/login?returnTo=/editor'),
      platform: { env: devConfig }
    } as never);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/editor');
    expect(jar.setCalls[0]).toMatchObject({
      name: 'archinsight-session',
      options: {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: false
      }
    });

    const authenticated = await me({
      cookies: cookies({ 'archinsight-session': jar.setCalls[0].value }),
      platform: { env: devConfig }
    } as never);

    await expect(authenticated.json()).resolves.toMatchObject({
      authenticated: true,
      id: '5913933c-2268-41e1-a558-622dc11f675a',
      displayName: 'Development User'
    });
  });

  it('dev login establishes a signed Ghost session in Ghost mode', async () => {
    const jar = cookies();
    const response = await devLogin({
      cookies: jar,
      url: new URL('http://localhost/api/auth/dev/login?returnTo=/app/editor'),
      platform: { env: ghostConfig },
      fetch: fakeGhostFetch()
    } as never);

    expect(response.status).toBe(307);
    expect(jar.setCalls.map((call) => call.name)).toEqual(expect.arrayContaining([
      'ghost-members-ssr',
      'ghost-members-ssr.sig'
    ]));
    expect(jar.get('archinsight-session')).toBeUndefined();

    expect(verifyGhostSessionSignature(
      jar.get('ghost-members-ssr'),
      jar.get('ghost-members-ssr.sig'),
      getAuthConfig(ghostConfig).ghost
    )).toBe(true);
  });

  it('logout clears standalone session cookie', async () => {
    const jar = cookies();
    const response = await logout({ cookies: jar, platform: { env: devConfig } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(jar.deleteCalls[0]).toEqual({
      name: 'archinsight-session',
      options: {
        path: '/'
      }
    });
  });

  it('supports the legacy Portal GET logout contract', async () => {
    const jar = cookies({
      'archinsight-session': 'app-session',
      'ghost-members-ssr': 'ghost-session',
      'ghost-members-ssr.sig': 'ghost-signature'
    });
    const response = await portalLogout({ cookies: jar, platform: { env: ghostConfig } } as never);

    expect(response.status).toBe(200);
    expect(jar.deleteCalls.map((call) => call.name)).toEqual([
      'archinsight-session',
      'ghost-members-ssr',
      'ghost-members-ssr.sig'
    ]);
  });

  it('does not use the standalone session as a fallback in Ghost mode', async () => {
    const standaloneJar = cookies();
    await devLogin({
      cookies: standaloneJar,
      url: new URL('http://localhost/api/auth/dev/login'),
      platform: { env: devConfig }
    } as never);
    const standaloneSession = standaloneJar.setCalls.find((call) => call.name === 'archinsight-session')?.value ?? '';

    const response = await me({
      cookies: cookies({ 'archinsight-session': standaloneSession }),
      platform: { env: ghostConfig }
    } as never);

    await expect(response.json()).resolves.toMatchObject({ authenticated: false });
  });

  it('starts and completes OIDC login with a verified id_token', async () => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = keyPair.publicKey.export({ format: 'jwk' });
    const jar = cookies();
    const login = await oidcLogin({
      cookies: jar,
      params: { provider: 'google' },
      url: new URL('http://localhost/api/auth/oidc/login/google?returnTo=/editor'),
      platform: { env: oidcGhostConfig }
    } as never);

    expect(login.status).toBe(307);
    const location = new URL(login.headers.get('location') ?? '');
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('client_id')).toBe('google-client');
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost/api/auth/oidc/callback/google');
    const state = location.searchParams.get('state') ?? '';
    const nonce = location.searchParams.get('nonce') ?? '';
    expect(jar.setCalls[0].name).toBe('archinsight-oidc-state-google');

    const idToken = rs256Jwt(
      {
        alg: 'RS256',
        kid: 'test-key',
        typ: 'JWT'
      },
      {
        iss: 'https://accounts.google.com',
        aud: 'google-client',
        sub: 'google-user',
        exp: Math.floor(Date.now() / 1000) + 600,
        nonce,
        email: 'user@example.com',
        email_verified: true,
        name: 'Google User',
        picture: 'https://example.com/avatar.png'
      },
      keyPair.privateKey
    );
    const callback = await oidcCallback({
      cookies: jar,
      params: { provider: 'google' },
      url: new URL(`http://localhost/api/auth/oidc/callback/google?code=code-1&state=${encodeURIComponent(state)}`),
      platform: { env: oidcGhostConfig },
      fetch: fakeOidcFetch({
        token: {
          access_token: 'access-token',
          id_token: idToken
        },
        jwks: {
          keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }]
        },
        userInfo: {
          email: 'user@example.com',
          name: 'Google User From UserInfo'
        }
      }, true)
    } as never);

    expect(callback.status).toBe(200);
    expect(callback.headers.get('content-type')).toBe('text/html; charset=utf-8');
    await expect(callback.text()).resolves.toContain('window.location.replace(redirect)');
    expect(jar.deleteCalls).toContainEqual({
      name: 'archinsight-oidc-state-google',
      options: { path: '/' }
    });
    expect(jar.get('archinsight-session')).toBeUndefined();
    expect(jar.setCalls).toContainEqual(expect.objectContaining({
      name: 'ghost-members-ssr',
      value: 'ghost-session'
    }));
    expect(jar.setCalls).toContainEqual(expect.objectContaining({
      name: 'ghost-members-ssr.sig'
    }));
  });

  it('rejects standalone token sync when the endpoint is not configured', async () => {
    const response = await standaloneToken({
      cookies: cookies(),
      request: jsonRequest({ email: 'standalone@example.com' }, 'Bearer standalone-sync-token'),
      platform: { env: devConfig }
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Standalone token endpoint is not configured' });
  });

  it('does not expose standalone token sync in Ghost mode', async () => {
    const response = await standaloneToken({
      cookies: cookies(),
      request: jsonRequest({ email: 'standalone@example.com' }, 'Bearer standalone-sync-token'),
      platform: { env: { ...ghostConfig, ARCHINSIGHT_AUTH_STANDALONE_SYNC_API_TOKEN: 'standalone-sync-token' } }
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Standalone token endpoint is unavailable in Ghost mode' });
  });

  it('rejects standalone token sync with an invalid bearer token', async () => {
    const response = await standaloneToken({
      cookies: cookies(),
      request: jsonRequest({ email: 'standalone@example.com' }, 'Bearer wrong-token'),
      platform: { env: standaloneSyncConfig }
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid standalone token sync token' });
  });

  it('issues a standalone session token through the sync endpoint', async () => {
    const jar = cookies();
    const response = await standaloneToken({
      cookies: jar,
      request: jsonRequest(
        {
          email: 'Standalone@Example.COM',
          emailVerified: true,
          firstName: 'Standalone',
          lastName: 'User',
          avatar: 'https://example.com/standalone.png',
          originId: 'standalone-user',
          source: 'site'
        },
        'Bearer standalone-sync-token'
      ),
      platform: { env: standaloneSyncConfig }
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      email: 'standalone@example.com',
      displayName: 'Standalone User',
      avatar: 'https://example.com/standalone.png'
    });
    const session = jar.setCalls.find((call) => call.name === 'archinsight-session');
    expect(session).toMatchObject({
      name: 'archinsight-session',
      options: {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: false
      }
    });

    const authenticated = await me({
      cookies: cookies({ 'archinsight-session': session?.value ?? '' }),
      platform: { env: standaloneSyncConfig }
    } as never);
    await expect(authenticated.json()).resolves.toMatchObject({
      authenticated: true,
      email: 'standalone@example.com',
      displayName: 'Standalone User'
    });
  });

  it('rejects Ghost sync when the endpoint is not configured', async () => {
    const response = await ghostSync({
      cookies: cookies(),
      request: jsonRequest({ email: 'ghost@example.com' }, 'Bearer ghost-sync-token'),
      platform: { env: devConfig },
      fetch: fakeGhostFetch()
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Ghost sync endpoint is not configured' });
  });

  it('rejects Ghost sync with an invalid bearer token', async () => {
    const response = await ghostSync({
      cookies: cookies(),
      request: jsonRequest({ email: 'ghost@example.com' }, 'Bearer wrong-token'),
      platform: { env: ghostConfig },
      fetch: fakeGhostFetch()
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid Ghost sync token' });
  });

  it('syncs a Ghost user, creates a Ghost member, and sets the Ghost SSR cookie', async () => {
    const jar = cookies();
    const requests: Array<{ url: string; authorization: string | null; body: string | null }> = [];
    const response = await ghostSync({
      cookies: jar,
      request: jsonRequest(
        {
          email: 'Ghost@Example.COM',
          emailVerified: true,
          firstName: 'Ghost',
          lastName: 'User',
          avatar: 'https://example.com/avatar.png',
          originId: 'ghost-user',
          source: 'ghost',
          locale: 'en'
        },
        'Bearer ghost-sync-token'
      ),
      platform: { env: ghostConfig },
      fetch: fakeGhostFetch(requests)
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      email: 'ghost@example.com',
      displayName: 'Ghost User',
      avatar: 'https://example.com/avatar.png'
    });
    expect(jar.setCalls).toContainEqual({
      name: 'ghost-members-ssr',
      value: 'ghost-session',
      options: {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: false
      }
    });
    expect(requests[0].authorization).toMatch(/^Ghost /u);
    expect(requests.map((request) => request.url)).toEqual([
      "https://ghost.example/ghost/api/admin/members/?filter=email%3A'ghost%40example.com'",
      'https://ghost.example/ghost/api/admin/members',
      'https://ghost.example/ghost/api/admin/members/ghost-member/signin_urls/',
      'https://ghost.example/members/api/send-magic-link/'
    ]);
  });
});

function cookies(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    setCalls: [] as Array<{ name: string; value: string; options: Record<string, unknown> }>,
    deleteCalls: [] as Array<{ name: string; options: Record<string, unknown> }>,
    get(name: string) {
      return values.get(name);
    },
    set(name: string, value: string, options: Record<string, unknown>) {
      values.set(name, value);
      this.setCalls.push({ name, value, options });
    },
    delete(name: string, options: Record<string, unknown>) {
      values.delete(name);
      this.deleteCalls.push({ name, options });
    }
  };
}

function rs256Jwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: unknown): string {
  const encodedHeader = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign('RSA-SHA256').update(data).sign(privateKey as never, 'base64url');
  return `${data}.${signature}`;
}

function fakeOidcFetch(responses: {
  token: Record<string, unknown>;
  jwks: Record<string, unknown>;
  userInfo: Record<string, unknown>;
}, includeGhost = false) {
  const ghostFetch = fakeGhostFetch();
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return jsonResponse(responses.token);
    }
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
      return jsonResponse(responses.jwks);
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return jsonResponse(responses.userInfo);
    }
    if (includeGhost && url.startsWith('https://ghost.example/')) {
      return ghostFetch(input, init);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

function fakeGhostFetch(requests: Array<{ url: string; authorization: string | null; body: string | null }> = []) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      authorization: headers.get('authorization'),
      body: typeof init?.body === 'string' ? init.body : null
    });
    if (url.startsWith('https://ghost.example/ghost/api/admin/members/?filter=')) {
      return jsonResponse({ members: [] });
    }
    if (url === 'https://ghost.example/ghost/api/admin/members') {
      return jsonResponse({ members: [{ id: 'ghost-member', email: 'ghost@example.com', name: 'Ghost User' }] });
    }
    if (url === 'https://ghost.example/ghost/api/admin/members/ghost-member/signin_urls/') {
      return jsonResponse({ member_signin_urls: [{ url: 'https://ghost.example/members/api/send-magic-link/' }] });
    }
    if (url === 'https://ghost.example/members/api/send-magic-link/') {
      const session = 'ghost-session';
      const signature = createHmac('sha1', 'ghost-ssr-secret').update(`ghost-members-ssr=${session}`).digest('base64url');
      const headers = new Headers();
      headers.append('set-cookie', `ghost-members-ssr=${session}; Path=/; HttpOnly; SameSite=Lax`);
      headers.append('set-cookie', `ghost-members-ssr.sig=${signature}; Path=/; HttpOnly; SameSite=Lax`);
      return new Response(null, {
        status: 302,
        headers
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

function jsonRequest(body: Record<string, unknown>, authorization: string): Request {
  return new Request('http://localhost/api/auth/ghost/sync', {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
}
