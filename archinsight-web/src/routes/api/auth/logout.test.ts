import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { issueStandaloneToken } from '$lib/server/auth/standalone-token';
import { getAuthConfig } from '$lib/server/auth/auth-config';

const revocation = vi.hoisted(() => ({
  revokeSsrSession: vi.fn(),
  revokeUserSessions: vi.fn()
}));

vi.mock('$lib/server/auth/userdata-store', () => revocation);

import { POST as logout } from './logout/+server';

const userId = '5913933c-2268-41e1-a558-622dc11f675a';
const baseConfig = {
  NODE_ENV: 'test',
  ARCHINSIGHT_DATABASE_ENABLED: 'true',
  ARCHINSIGHT_REPOSITORY_BACKEND: 'postgres',
  ARCHINSIGHT_AUTH_TOKEN_SECRET: 'logout-test-token-secret',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};
const ghostConfig = {
  ...baseConfig,
  ARCHINSIGHT_AUTH_GHOST_ENABLED: 'true',
  ARCHINSIGHT_AUTH_GHOST_SSR_SECRET_KEY: 'logout-test-ghost-secret'
};

describe('logout session revocation', () => {
  beforeEach(() => {
    revocation.revokeSsrSession.mockReset();
    revocation.revokeUserSessions.mockReset();
  });

  it('revokes a verified Ghost session and deletes every authentication cookie', async () => {
    revocation.revokeSsrSession.mockResolvedValue(true);
    const jar = cookies(ghostCookies('ghost-session'));

    const response = await logout({ cookies: jar, platform: { env: ghostConfig } } as never);

    expect(response.status).toBe(200);
    expect(revocation.revokeSsrSession).toHaveBeenCalledWith(
      'ghost-session',
      expect.objectContaining(ghostConfig),
      'logout-test-token-secret'
    );
    expect(revocation.revokeUserSessions).not.toHaveBeenCalled();
    expect(jar.deleteCalls.map((call) => call.name)).toEqual([
      'archinsight-session',
      'ghost-members-ssr',
      'ghost-members-ssr.sig'
    ]);
  });

  it('does not fall back to a standalone token in Ghost mode', async () => {
    revocation.revokeSsrSession.mockResolvedValue(false);
    const config = getAuthConfig(ghostConfig);
    const token = issueStandaloneToken({ id: userId, tokenVersion: 3 }, config.token);
    const jar = cookies({
      ...ghostCookies('ghost-session'),
      [config.tokenCookieName]: token
    });

    const response = await logout({ cookies: jar, platform: { env: ghostConfig } } as never);

    expect(response.status).toBe(200);
    expect(revocation.revokeSsrSession).toHaveBeenCalledOnce();
    expect(revocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  it('revokes only the JWT-backed user in standalone mode', async () => {
    const config = getAuthConfig(baseConfig);
    const token = issueStandaloneToken({ id: userId, tokenVersion: 3 }, config.token);
    const jar = cookies({ [config.tokenCookieName]: token });

    const response = await logout({ cookies: jar, platform: { env: baseConfig } } as never);

    expect(response.status).toBe(200);
    expect(revocation.revokeSsrSession).not.toHaveBeenCalled();
    expect(revocation.revokeUserSessions).toHaveBeenCalledWith(userId, expect.objectContaining(baseConfig));
  });

  it('deletes browser cookies even if server-side revocation fails', async () => {
    revocation.revokeSsrSession.mockRejectedValue(new Error('database unavailable'));
    const jar = cookies(ghostCookies('ghost-session'));

    await expect(logout({ cookies: jar, platform: { env: ghostConfig } } as never)).rejects.toThrow('database unavailable');
    expect(jar.deleteCalls.map((call) => call.name)).toEqual([
      'archinsight-session',
      'ghost-members-ssr',
      'ghost-members-ssr.sig'
    ]);
  });
});

function ghostCookies(session: string): Record<string, string> {
  return {
    'ghost-members-ssr': session,
    'ghost-members-ssr.sig': createHmac('sha1', 'logout-test-ghost-secret')
      .update(`ghost-members-ssr=${session}`)
      .digest('base64url')
  };
}

function cookies(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    deleteCalls: [] as Array<{ name: string; options: Record<string, unknown> }>,
    get(name: string) {
      return values.get(name);
    },
    delete(name: string, options: Record<string, unknown>) {
      values.delete(name);
      this.deleteCalls.push({ name, options });
    }
  };
}
