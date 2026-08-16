import { randomUUID } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import { getDatabaseConfig, type DatabaseConfig } from '$lib/server/database/database-config';
import { migrateDatabase } from '$lib/server/database/migrations';
import { PostgresDatabase } from '$lib/server/database/postgres-database';
import { PostgresPlaygroundPublicationStore } from './playground-publication-store';

const integrationEnabled = process.env.ARCHINSIGHT_POSTGRES_INTEGRATION === 'true'
  || Boolean(process.env.ARCHINSIGHT_TEST_DATABASE_URL);
const integrationIt = integrationEnabled ? it : it.skip;

describe('PostgresPlaygroundPublicationStore integration', () => {
  integrationIt('publishes only an owned project and exposes it through the playground read model', async () => {
    const pool = new Pool(poolConfig(integrationDatabaseConfig()));
    const database = new PostgresDatabase(pool);
    const store = new PostgresPlaygroundPublicationStore(database);
    const ownerId = randomUUID();
    const otherUserId = randomUUID();
    const repositoryId = randomUUID();

    try {
      await migrateDatabase(database);
      await database.query(
        `insert into public.userdata (id, email, display_name, source)
         values ($1, $2, $3, 'test'), ($4, $5, $6, 'test')`,
        [ownerId, `${ownerId}@example.test`, 'Owner', otherUserId, `${otherUserId}@example.test`, 'Other']
      );
      await database.query(
        `insert into public.repository (id, owner_id, name, structure)
         values ($1, $2, 'Published project', $3::json)`,
        [repositoryId, ownerId, JSON.stringify({ id: repositoryId, parentId: null, name: '/', type: 'd', childNodes: [] })]
      );

      await expect(store.publish('default', otherUserId, repositoryId, otherUserId)).rejects.toBeInstanceOf(Response);
      const publication = await store.publish('default', ownerId, repositoryId, ownerId);
      expect(publication).toMatchObject({ ownerId, repositoryId, publishedBy: ownerId });

      const visible = await database.query<{ id: string }>('select id from public.playground_current_repository');
      expect(visible.rows).toEqual([{ id: repositoryId }]);
    } finally {
      await pool.query("delete from public.playground_publication where slot = 'default'").catch(() => undefined);
      await pool.query('delete from public.repository where id = $1', [repositoryId]).catch(() => undefined);
      await pool.query('delete from public.userdata where id = any($1)', [[ownerId, otherUserId]]).catch(() => undefined);
      await pool.end();
    }
  }, 10_000);
});

function integrationDatabaseConfig(): DatabaseConfig {
  const testUrl = process.env.ARCHINSIGHT_TEST_DATABASE_URL;
  const config = getDatabaseConfig(testUrl
    ? {
        ARCHINSIGHT_DATABASE_ENABLED: 'true',
        ARCHINSIGHT_DATABASE_URL: testUrl,
        ARCHINSIGHT_DATABASE_MIGRATIONS_ENABLED: 'true'
      }
    : undefined);
  if (!config.enabled) {
    throw new Error('Postgres integration requires ARCHINSIGHT_TEST_DATABASE_URL or an enabled local database config');
  }
  return config;
}

function poolConfig(config: DatabaseConfig): PoolConfig {
  if (config.connectionString) {
    return { connectionString: config.connectionString, ssl: config.ssl ? { rejectUnauthorized: false } : undefined };
  }
  return {
    host: config.host,
    port: config.port,
    database: config.database ?? undefined,
    user: config.user ?? undefined,
    password: config.password ?? undefined,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined
  };
}
