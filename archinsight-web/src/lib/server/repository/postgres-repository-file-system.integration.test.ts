import { randomUUID } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import { getDatabaseConfig, type DatabaseConfig } from '$lib/server/database/database-config';
import { migrateDatabase } from '$lib/server/database/migrations';
import { PostgresDatabase } from '$lib/server/database/postgres-database';
import { PostgresRepositoryFileSystem } from './postgres-repository-file-system';
import type { RepositoryNode } from './types';

const integrationEnabled = process.env.ARCHINSIGHT_POSTGRES_INTEGRATION === 'true'
  || Boolean(process.env.ARCHINSIGHT_TEST_DATABASE_URL);
const integrationIt = integrationEnabled ? it : it.skip;

describe('PostgresRepositoryFileSystem integration', () => {
  integrationIt('preserves both concurrent tree changes under a real row lock', async () => {
    const config = integrationDatabaseConfig();
    const pool = new Pool(poolConfig(config));
    const database = new PostgresDatabase(pool);
    const fileSystem = new PostgresRepositoryFileSystem(database);
    const ownerId = randomUUID();
    const repositoryId = randomUUID();
    const lockClient = await pool.connect();
    let lockTransactionOpen = false;
    let concurrentSaves: Promise<unknown>[] = [];
    const emptyTree: RepositoryNode = {
      id: repositoryId,
      parentId: null,
      name: '/',
      type: 'd',
      childNodes: []
    };

    try {
      await migrateDatabase(database);
      await database.query(
        `
          insert into public.repository (id, owner_id, name, structure)
          values ($1, $2, $3, $4::json)
        `,
        [repositoryId, ownerId, 'Concurrent integration test', JSON.stringify(emptyTree)]
      );

      await lockClient.query('begin');
      lockTransactionOpen = true;
      await lockClient.query('select id from public.repository where id = $1 for update', [repositoryId]);

      const firstSave = fileSystem.save(ownerId, repositoryId, 'first.ai', { content: 'context first' });
      const secondSave = fileSystem.save(ownerId, repositoryId, 'second.ai', { content: 'context second' });
      concurrentSaves = [firstSave, secondSave];
      await new Promise((resolve) => setTimeout(resolve, 100));
      await lockClient.query('commit');
      lockTransactionOpen = false;

      await Promise.all([firstSave, secondSave]);

      const tree = await fileSystem.tree(ownerId, repositoryId);
      expect(tree.root.children.map((child) => child.path).sort()).toEqual(['first.ai', 'second.ai']);
      const rows = await database.query<{ file_name: string }>(
        'select file_name from public.file where owner_id = $1 and repository_id = $2 order by file_name',
        [ownerId, repositoryId]
      );
      expect(rows.rows.map((row) => row.file_name)).toEqual(['first.ai', 'second.ai']);
    } finally {
      if (lockTransactionOpen) {
        await lockClient.query('rollback').catch(() => undefined);
      }
      lockClient.release();
      await Promise.allSettled(concurrentSaves);
      await pool.query('delete from public.file where repository_id = $1', [repositoryId]).catch(() => undefined);
      await pool.query('delete from public.repository where id = $1', [repositoryId]).catch(() => undefined);
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
