import { createHash, createHmac, randomUUID } from 'node:crypto';
import { postgresDatabase } from '$lib/server/database/postgres-database';
import { getDatabaseConfig } from '$lib/server/database/database-config';
import type { Queryable, TransactionalDatabase } from '$lib/server/database/types';
import type { EnvSource } from './auth-config';
import type { AppRole, AuthenticatedUser, StandaloneTokenClaims, UserdataProfile } from './types';

type UserdataRow = {
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
  token_version: string | number;
  roles: string[] | null;
};

export async function authenticateStandaloneClaims(
  claims: StandaloneTokenClaims | null,
  env: EnvSource | undefined
): Promise<AuthenticatedUser | null> {
  if (!claims) {
    return null;
  }
  if (!getDatabaseConfig(env).enabled) {
    return {
      id: claims.userId,
      email: claims.email ?? null,
      displayName: claims.displayName ?? null,
      avatar: claims.avatar ?? null,
      tokenVersion: claims.tokenVersion,
      roles: ['user']
    };
  }
  const store = new PostgresUserdataStore(await postgresDatabase(env));
  return store.authenticateStandaloneClaims(claims);
}

export async function upsertUserdataProfile(
  profile: UserdataProfile,
  env: EnvSource | undefined
): Promise<AuthenticatedUser> {
  if (!getDatabaseConfig(env).enabled) {
    const email = normalizeEmail(profile.email);
    return {
      id: blankToNull(profile.id) ?? deterministicUserId(`${profile.source ?? 'standalone'}|${email}`),
      email,
      displayName: displayName(profile),
      avatar: blankToNull(profile.avatar),
      tokenVersion: 1,
      roles: ['user']
    };
  }
  const store = new PostgresUserdataStore(await postgresDatabase(env));
  return store.upsert(profile);
}

export async function authenticateSsrSession(
  session: string | null | undefined,
  env: EnvSource | undefined,
  tokenSecret: string
): Promise<AuthenticatedUser | null> {
  if (!getDatabaseConfig(env).enabled) {
    return null;
  }
  const store = new PostgresUserdataStore(await postgresDatabase(env));
  return store.authenticateSsrSession(session, tokenSecret);
}

export async function storeSsrSession(
  email: string,
  session: string | null | undefined,
  env: EnvSource | undefined,
  tokenSecret: string
): Promise<void> {
  if (!session || session.trim() === '' || !getDatabaseConfig(env).enabled) {
    return;
  }
  const store = new PostgresUserdataStore(await postgresDatabase(env));
  await store.storeSsrSession(email, session, tokenSecret);
}

export async function revokeUserSessions(userId: string, env: EnvSource | undefined): Promise<void> {
  if (!getDatabaseConfig(env).enabled) {
    return;
  }
  const store = new PostgresUserdataStore(await postgresDatabase(env));
  await store.revokeUserSessions(userId);
}

export async function revokeSsrSession(
  session: string,
  env: EnvSource | undefined,
  tokenSecret: string
): Promise<boolean> {
  if (!getDatabaseConfig(env).enabled) {
    return false;
  }
  const store = new PostgresUserdataStore(await postgresDatabase(env));
  return store.revokeSsrSession(session, tokenSecret);
}

export class PostgresUserdataStore {
  constructor(private readonly database: TransactionalDatabase) {}

  async authenticateStandaloneClaims(claims: StandaloneTokenClaims | null): Promise<AuthenticatedUser | null> {
    if (!claims) {
      return null;
    }
    return this.database.transaction(async (client) => {
      const row = await this.findByIdAndTokenVersion(client, claims.userId, claims.tokenVersion);
      if (!row) {
        return null;
      }
      await recordLogin(client, row.id);
      return authenticatedUser(row);
    });
  }

  async upsert(profile: UserdataProfile): Promise<AuthenticatedUser> {
    const email = normalizeEmail(profile.email);
    return this.database.transaction(async (client) => {
      const requestedId = blankToNull(profile.id);
      const source = blankToNull(profile.source) ?? 'standalone';
      const originIds = originIdsForLookup(profile.originId);
      const existing =
        (requestedId ? await findById(client, requestedId) : null) ??
        (originIds.length > 0 ? await findByOriginIds(client, source, originIds) : null) ??
        (await findByEmail(client, email));
      const id = existing?.id ?? requestedId ?? randomUUID();
      const row = rowFromProfile(profile, email, id);
      if (existing) {
        await client.query(
          `
            update public.userdata
            set origin_id = $2,
                email = $3,
                email_verified = $4,
                first_name = $5,
                last_name = $6,
                display_name = $7,
                avatar = $8,
                source = $9,
                locale = $10,
                ssr_session = $11,
                updated_at = now(),
                deleted_at = null
            where id = $1
          `,
          [
            row.id,
            row.origin_id,
            row.email,
            row.email_verified,
            row.first_name,
            row.last_name,
            row.display_name,
            row.avatar,
            row.source,
            row.locale,
            row.ssr_session
          ]
        );
      } else {
        await client.query(
          `
            insert into public.userdata (
              id, origin_id, email, email_verified, first_name, last_name,
              display_name, avatar, source, locale, ssr_session
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            row.id,
            row.origin_id,
            row.email,
            row.email_verified,
            row.first_name,
            row.last_name,
            row.display_name,
            row.avatar,
            row.source,
            row.locale,
            row.ssr_session
          ]
        );
      }
      await client.query(
        `
          insert into public.userdata_role (user_id, role)
          values ($1, 'user')
          on conflict (user_id, role) do nothing
        `,
        [id]
      );
      const saved = await findById(client, id);
      if (!saved) {
        throw new Error(`User was not saved: ${email}`);
      }
      return authenticatedUser(saved);
    });
  }

  async authenticateSsrSession(session: string | null | undefined, tokenSecret: string): Promise<AuthenticatedUser | null> {
    if (!session || session.trim() === '') {
      return null;
    }
    return this.database.transaction(async (client) => {
      const row = await findBySsrSession(client, sessionHash(session, tokenSecret));
      if (!row) {
        return null;
      }
      await recordLogin(client, row.id);
      return authenticatedUser(row);
    });
  }

  async storeSsrSession(email: string, session: string | null | undefined, tokenSecret: string): Promise<void> {
    if (!session || session.trim() === '') {
      return;
    }
    await this.database.query(
      `
        update public.userdata
        set ssr_session = $2,
            updated_at = now()
        where lower(email) = lower($1)
          and deleted_at is null
      `,
      [normalizeEmail(email), sessionHash(session, tokenSecret)]
    );
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.database.query(
      `
        update public.userdata
        set ssr_session = null,
            token_version = token_version + 1,
            updated_at = now()
        where id = $1
          and deleted_at is null
      `,
      [userId]
    );
  }

  async revokeSsrSession(session: string, tokenSecret: string): Promise<boolean> {
    const result = await this.database.query(
      `
        update public.userdata
        set ssr_session = null,
            token_version = token_version + 1,
            updated_at = now()
        where ssr_session = $1
          and deleted_at is null
      `,
      [sessionHash(session, tokenSecret)]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async findByIdAndTokenVersion(
    client: Queryable,
    userId: string,
    tokenVersion: number
  ): Promise<UserdataRow | null> {
    const result = await client.query<UserdataRow>(
      `
        select ${userColumns}
        from public.userdata
        where id = $1
          and token_version = $2
          and deleted_at is null
      `,
      [userId, tokenVersion]
    );
    return result.rows[0] ?? null;
  }
}

const userColumns = `
  id, origin_id, email, email_verified, first_name, last_name,
  display_name, avatar, source, locale, ssr_session, token_version,
  array(
    select role
    from public.userdata_role
    where user_id = public.userdata.id
    order by role
  ) as roles
`;

async function findById(client: Queryable, id: string): Promise<UserdataRow | null> {
  const result = await client.query<UserdataRow>(
    `
      select ${userColumns}
      from public.userdata
      where id = $1
        and deleted_at is null
    `,
    [id]
  );
  return result.rows[0] ?? null;
}

async function findByEmail(client: Queryable, email: string): Promise<UserdataRow | null> {
  const result = await client.query<UserdataRow>(
    `
      select ${userColumns}
      from public.userdata
      where lower(email) = lower($1)
        and deleted_at is null
    `,
    [email]
  );
  return result.rows[0] ?? null;
}

async function findByOriginIds(client: Queryable, source: string, originIds: string[]): Promise<UserdataRow | null> {
  const result = await client.query<UserdataRow>(
    `
      select ${userColumns}
      from public.userdata
      where source = $1
        and origin_id = any($2)
        and deleted_at is null
      order by array_position($2::varchar[], origin_id), updated_at desc nulls last
      limit 1
    `,
    [source, originIds]
  );
  return result.rows[0] ?? null;
}

async function findBySsrSession(client: Queryable, ssrSession: string): Promise<UserdataRow | null> {
  const result = await client.query<UserdataRow>(
    `
      select ${userColumns}
      from public.userdata
      where ssr_session = $1
        and deleted_at is null
    `,
    [ssrSession]
  );
  return result.rows[0] ?? null;
}

async function recordLogin(client: Queryable, userId: string): Promise<void> {
  await client.query(
    `
      update public.userdata
      set last_login = now(),
          updated_at = now()
      where id = $1
        and deleted_at is null
    `,
    [userId]
  );
}

function rowFromProfile(profile: UserdataProfile, email: string, id: string): UserdataRow {
  return {
    id,
    origin_id: blankToNull(profile.originId),
    email,
    email_verified: profile.emailVerified ?? null,
    first_name: blankToNull(profile.firstName),
    last_name: blankToNull(profile.lastName),
    display_name: displayName(profile),
    avatar: blankToNull(profile.avatar),
    source: blankToNull(profile.source) ?? 'standalone',
    locale: blankToNull(profile.locale),
    ssr_session: blankToNull(profile.ssrSession),
    token_version: 0,
    roles: ['user']
  };
}

function authenticatedUser(row: UserdataRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatar: row.avatar,
    tokenVersion: Number(row.token_version),
    roles: normalizedRoles(row.roles)
  };
}

function normalizedRoles(roles: string[] | null): AppRole[] {
  const result = new Set<AppRole>(['user']);
  for (const role of roles ?? []) {
    if (role === 'user' || role === 'playground_admin') {
      result.add(role);
    }
  }
  return [...result];
}

function displayName(profile: UserdataProfile): string {
  const explicit = blankToNull(profile.displayName);
  if (explicit) {
    return explicit;
  }
  const first = blankToNull(profile.firstName);
  const last = blankToNull(profile.lastName);
  if (first && last) {
    return `${first} ${last}`;
  }
  if (first) {
    return first;
  }
  return normalizeEmail(profile.email);
}

function normalizeEmail(email: string): string {
  if (!email || email.trim() === '') {
    throw new Error('User email is required');
  }
  return email.trim().toLowerCase();
}

function blankToNull(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') {
    return null;
  }
  return value.trim();
}

function originIdsForLookup(originId: string | null | undefined): string[] {
  const normalized = blankToNull(originId);
  if (!normalized) {
    return [];
  }
  const separator = normalized.lastIndexOf('|');
  if (separator >= 0 && separator < normalized.length - 1) {
    return [normalized.slice(separator + 1), normalized];
  }
  return [normalized];
}

function sessionHash(session: string, tokenSecret: string): string {
  return createHmac('sha256', tokenSecret).update(session).digest('hex');
}

function deterministicUserId(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
