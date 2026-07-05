import type { Queryable } from './types';

type Migration = {
  version: number;
  name: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_repository_table',
    sql: `
      create table if not exists public.repository (
        id UUID primary key,
        owner_id UUID not null,
        name TEXT,
        structure JSON,
        permissions smallint not null default 70,
        created TIMESTAMP WITH TIME ZONE not null default now(),
        updated TIMESTAMP WITH TIME ZONE not null default now()
      )
    `
  },
  {
    version: 2,
    name: 'create_file_table',
    sql: `
      create table if not exists public.file (
        id UUID primary key,
        owner_id UUID not null,
        repository_id UUID not null,
        file_name VARCHAR(100) not null,
        content TEXT,
        level VARCHAR(50),
        project_identifier VARCHAR(50),
        created TIMESTAMP WITH TIME ZONE not null default now(),
        updated TIMESTAMP WITH TIME ZONE not null default now()
      )
    `
  },
  {
    version: 3,
    name: 'create_user_table',
    sql: `
      create table if not exists public.userdata (
        id UUID primary key,
        origin_id VARCHAR(50),
        email VARCHAR(100) not null,
        email_verified BOOLEAN,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        display_name VARCHAR(100) not null,
        avatar TEXT,
        source VARCHAR(50) not null,
        locale VARCHAR(10),
        created TIMESTAMP WITH TIME ZONE not null default now()
      );
      create unique index if not exists userdata_email_ind on public.userdata (email)
    `
  },
  {
    version: 4,
    name: 'add_ssr_to_user_table',
    sql: `
      alter table public.userdata
        add column if not exists ssr_session VARCHAR(50) null;
      create unique index if not exists idx_ssr_session on public.userdata (ssr_session)
    `
  },
  {
    version: 5,
    name: 'add_user_login_timestamps',
    sql: `
      alter table public.userdata
        add column if not exists updated_at TIMESTAMP WITH TIME ZONE not null default now(),
        add column if not exists deleted_at TIMESTAMP WITH TIME ZONE null,
        add column if not exists last_login TIMESTAMP WITH TIME ZONE null;

      update public.userdata
      set updated_at = created
      where updated_at is null
    `
  },
  {
    version: 6,
    name: 'harden_user_sessions',
    sql: `
      alter table public.userdata
        alter column ssr_session type VARCHAR(128),
        add column if not exists token_version BIGINT not null default 0;

      update public.userdata
      set ssr_session = null
      where ssr_session is not null
    `
  }
];

export async function migrateDatabase(database: Queryable): Promise<void> {
  await database.query(`
    create table if not exists public.archinsight_schema_history (
      version integer primary key,
      name text not null,
      applied_at TIMESTAMP WITH TIME ZONE not null default now()
    )
  `);

  for (const migration of migrations) {
    const applied = await database.query<{ version: number }>(
      'select version from public.archinsight_schema_history where version = $1',
      [migration.version]
    );
    if (applied.rows.length > 0) {
      continue;
    }
    await database.query(migration.sql);
    await database.query('insert into public.archinsight_schema_history (version, name) values ($1, $2)', [
      migration.version,
      migration.name
    ]);
  }
}
