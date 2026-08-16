import { describe, expect, it } from 'vitest';
import { PostgresUserdataStore } from './userdata-store';
import type { Queryable, QueryResult, TransactionalDatabase } from '$lib/server/database/types';

const userId = '5913933c-2268-41e1-a558-622dc11f675a';

describe('PostgresUserdataStore', () => {
  it('upserts userdata and authenticates standalone claims by token version', async () => {
    const database = new FakeUserdataDatabase();
    const store = new PostgresUserdataStore(database);

    const user = await store.upsert({
      id: userId,
      email: 'Dev@Example.COM',
      displayName: 'Development User',
      source: 'local-dev'
    });

    expect(user).toMatchObject({
      id: userId,
      email: 'dev@example.com',
      displayName: 'Development User',
      tokenVersion: 0
    });

    await expect(store.authenticateStandaloneClaims({ userId, tokenVersion: 1 })).resolves.toBeNull();
    await expect(store.authenticateStandaloneClaims({ userId, tokenVersion: 0 })).resolves.toMatchObject({
      id: userId,
      email: 'dev@example.com'
    });
    expect(database.users.get(userId)?.last_login).toBe('logged-in');
  });

  it('increments token version when standalone sessions are revoked', async () => {
    const database = new FakeUserdataDatabase();
    const store = new PostgresUserdataStore(database);

    await store.upsert({
      id: userId,
      email: 'dev@example.com',
      displayName: 'Development User'
    });
    await store.revokeUserSessions(userId);

    await expect(store.authenticateStandaloneClaims({ userId, tokenVersion: 0 })).resolves.toBeNull();
    await expect(store.authenticateStandaloneClaims({ userId, tokenVersion: 1 })).resolves.toMatchObject({
      id: userId,
      tokenVersion: 1
    });
    expect(database.users.get(userId)?.ssr_session).toBeNull();
  });

  it('revokes a Ghost session and every standalone token for the same user', async () => {
    const database = new FakeUserdataDatabase();
    const store = new PostgresUserdataStore(database);

    await store.upsert({
      id: userId,
      email: 'ghost@example.com',
      displayName: 'Ghost User'
    });
    await store.storeSsrSession('ghost@example.com', 'ghost-session', 'token-secret');

    await expect(store.authenticateSsrSession('ghost-session', 'token-secret')).resolves.toMatchObject({
      id: userId,
      tokenVersion: 0
    });
    await expect(store.revokeSsrSession('ghost-session', 'token-secret')).resolves.toBe(true);
    await expect(store.authenticateSsrSession('ghost-session', 'token-secret')).resolves.toBeNull();
    await expect(store.authenticateStandaloneClaims({ userId, tokenVersion: 0 })).resolves.toBeNull();
    await expect(store.authenticateStandaloneClaims({ userId, tokenVersion: 1 })).resolves.toMatchObject({
      id: userId,
      tokenVersion: 1
    });
  });

  it('does not report an unknown Ghost session as revoked', async () => {
    const database = new FakeUserdataDatabase();
    const store = new PostgresUserdataStore(database);

    await expect(store.revokeSsrSession('unknown-session', 'token-secret')).resolves.toBe(false);
  });

  it('loads playground administration as an additive database role', async () => {
    const database = new FakeUserdataDatabase();
    const store = new PostgresUserdataStore(database);
    await store.upsert({ id: userId, email: 'admin@example.com', displayName: 'Admin' });
    database.grantRole(userId, 'playground_admin');

    await expect(store.authenticateStandaloneClaims({ userId, tokenVersion: 0 })).resolves.toMatchObject({
      roles: ['user', 'playground_admin']
    });
  });

  it('updates existing userdata by id without inserting a duplicate primary key', async () => {
    const database = new FakeUserdataDatabase();
    const store = new PostgresUserdataStore(database);

    await store.upsert({
      id: userId,
      email: 'old@example.com',
      displayName: 'Old User'
    });
    await store.upsert({
      id: userId,
      email: 'new@example.com',
      displayName: 'New User'
    });

    expect(database.users.size).toBe(1);
    expect(database.users.get(userId)).toMatchObject({
      email: 'new@example.com',
      display_name: 'New User'
    });
  });

  it('matches legacy google users by bare subject origin id', async () => {
    const database = new FakeUserdataDatabase();
    const store = new PostgresUserdataStore(database);
    const legacyId = '38dc0193-62d3-474e-9c07-cb2fc390f697';

    await store.upsert({
      id: legacyId,
      email: 'old-google@example.com',
      originId: '110918141358291416600',
      displayName: 'Old Google User',
      source: 'google'
    });
    const user = await store.upsert({
      email: 'new-google@example.com',
      originId: 'https://accounts.google.com|110918141358291416600',
      displayName: 'New Google User',
      source: 'google'
    });

    expect(user.id).toBe(legacyId);
    expect(database.users.size).toBe(1);
    expect(database.users.get(legacyId)).toMatchObject({
      origin_id: 'https://accounts.google.com|110918141358291416600',
      email: 'new-google@example.com',
      display_name: 'New Google User'
    });
  });
});

type UserRecord = Record<string, unknown> & {
  id: string;
  origin_id: string | null;
  email: string;
  email_verified: boolean | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  avatar: string | null;
  source: string;
  locale: string | null;
  ssr_session: string | null;
  token_version: number;
  deleted_at: string | null;
  last_login: string | null;
  roles: string[];
};

class FakeUserdataDatabase implements TransactionalDatabase {
  readonly users = new Map<string, UserRecord>();

  grantRole(id: string, role: string): void {
    const user = this.users.get(id);
    if (user && !user.roles.includes(role)) {
      user.roles.push(role);
    }
  }

  async transaction<T>(handler: (client: Queryable) => Promise<T>): Promise<T> {
    return handler(this);
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const statement = normalizeSql(sql);
    if (statement.startsWith('insert into public.userdata_role')) {
      const user = this.users.get(String(params[0]));
      if (user && !user.roles.includes('user')) {
        user.roles.push('user');
      }
      return asResult(changed());
    }
    if (statement.includes('from public.userdata') && statement.includes('where id = $1') && !statement.includes('token_version = $2')) {
      const user = this.users.get(String(params[0]));
      return asResult(rows(user && !user.deleted_at ? [user] : []));
    }
    if (statement.includes('from public.userdata') && statement.includes('where lower(email) = lower($1)')) {
      return asResult(rows([...this.users.values()].filter((user) => user.email.toLowerCase() === String(params[0]).toLowerCase() && !user.deleted_at)));
    }
    if (statement.includes('from public.userdata') && statement.includes('origin_id = any($2)')) {
      const originIds = Array.isArray(params[1]) ? params[1].map(String) : [];
      return asResult(rows([...this.users.values()].filter((user) => user.source === params[0] && user.origin_id !== null && originIds.includes(user.origin_id) && !user.deleted_at)));
    }
    if (statement.includes('from public.userdata') && statement.includes('where id = $1') && statement.includes('token_version = $2')) {
      const user = this.users.get(String(params[0]));
      return asResult(rows(user && user.token_version === Number(params[1]) && !user.deleted_at ? [user] : []));
    }
    if (statement.includes('from public.userdata') && statement.includes('where ssr_session = $1')) {
      const user = [...this.users.values()].find((candidate) => candidate.ssr_session === params[0] && !candidate.deleted_at);
      return asResult(rows(user ? [user] : []));
    }
    if (statement.startsWith('insert into public.userdata')) {
      this.users.set(String(params[0]), {
        id: String(params[0]),
        origin_id: nullable(params[1]),
        email: String(params[2]),
        email_verified: booleanOrNull(params[3]),
        first_name: nullable(params[4]),
        last_name: nullable(params[5]),
        display_name: String(params[6]),
        avatar: nullable(params[7]),
        source: String(params[8]),
        locale: nullable(params[9]),
        ssr_session: nullable(params[10]),
        token_version: 0,
        deleted_at: null,
        last_login: null,
        roles: []
      });
      return asResult(changed());
    }
    if (statement.startsWith('update public.userdata set origin_id')) {
      const user = this.users.get(String(params[0]));
      if (!user) {
        return asResult({ rows: [], rowCount: 0 });
      }
      user.origin_id = nullable(params[1]);
      user.email = String(params[2]);
      user.email_verified = booleanOrNull(params[3]);
      user.first_name = nullable(params[4]);
      user.last_name = nullable(params[5]);
      user.display_name = String(params[6]);
      user.avatar = nullable(params[7]);
      user.source = String(params[8]);
      user.locale = nullable(params[9]);
      user.ssr_session = nullable(params[10]);
      user.deleted_at = null;
      return asResult(changed());
    }
    if (statement.startsWith('update public.userdata set last_login')) {
      const user = this.users.get(String(params[0]));
      if (user) {
        user.last_login = 'logged-in';
      }
      return asResult(changed());
    }
    if (statement.startsWith('update public.userdata set ssr_session = $2')) {
      const user = [...this.users.values()].find((candidate) => candidate.email.toLowerCase() === String(params[0]).toLowerCase() && !candidate.deleted_at);
      if (!user) {
        return asResult({ rows: [], rowCount: 0 });
      }
      user.ssr_session = nullable(params[1]);
      return asResult(changed());
    }
    if (statement.startsWith('update public.userdata set ssr_session = null') && statement.includes('where id = $1')) {
      const user = this.users.get(String(params[0]));
      if (user) {
        user.ssr_session = null;
        user.token_version += 1;
      }
      return asResult(user ? changed() : { rows: [], rowCount: 0 });
    }
    if (statement.startsWith('update public.userdata set ssr_session = null') && statement.includes('where ssr_session = $1')) {
      const user = [...this.users.values()].find((candidate) => candidate.ssr_session === params[0] && !candidate.deleted_at);
      if (!user) {
        return asResult({ rows: [], rowCount: 0 });
      }
      user.ssr_session = null;
      user.token_version += 1;
      return asResult(changed());
    }
    throw new Error(`Unexpected SQL in fake userdata database: ${statement}`);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function rows<T extends Record<string, unknown>>(records: T[]): QueryResult<T> {
  return { rows: records, rowCount: records.length };
}

function changed(): QueryResult<Record<string, unknown>> {
  return { rows: [], rowCount: 1 };
}

function asResult<T extends Record<string, unknown>>(result: QueryResult<Record<string, unknown>>): QueryResult<T> {
  return result as QueryResult<T>;
}

function nullable(value: unknown): string | null {
  if (value == null || String(value).trim() === '') {
    return null;
  }
  return String(value);
}

function booleanOrNull(value: unknown): boolean | null {
  if (value == null) {
    return null;
  }
  return Boolean(value);
}
