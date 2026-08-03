import { Pool, type PoolClient, type PoolConfig, type QueryResult as PgQueryResult, type QueryResultRow } from 'pg';
import type { DatabaseConfig } from './database-config';
import { getDatabaseConfig } from './database-config';
import { migrateDatabase } from './migrations';
import type { QueryResult, Queryable, TransactionalDatabase } from './types';
import type { EnvSource } from '$lib/server/auth/auth-config';

const pools = new Map<string, Promise<PostgresDatabase>>();

export async function postgresDatabase(env: EnvSource | undefined): Promise<PostgresDatabase> {
  const config = getDatabaseConfig(env);
  if (!config.enabled) {
    throw new Error('Database integration is disabled');
  }
  const key = databaseKey(config);
  let pool = pools.get(key);
  if (!pool) {
    pool = createDatabase(config);
    pools.set(key, pool);
    const pending = pool;
    void pending.catch(() => {
      if (pools.get(key) === pending) {
        pools.delete(key);
      }
    });
  }
  return pool;
}

export class PostgresDatabase implements TransactionalDatabase {
  constructor(private readonly pool: Pool) {}

  async query<T extends QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query<T>(sql, params);
    return normalizePostgresResult(result);
  }

  async transaction<T>(handler: (client: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await handler(new PostgresTransactionClient(client));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

class PostgresTransactionClient implements Queryable {
  constructor(private readonly client: PoolClient) {}

  async query<T extends QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.client.query<T>(sql, params);
    return normalizePostgresResult(result);
  }
}

export function normalizePostgresResult<T extends QueryResultRow>(
  result: PgQueryResult<T> | Array<PgQueryResult<T>>
): QueryResult<T> {
  if (!Array.isArray(result)) {
    return { rows: [...result.rows], rowCount: result.rowCount };
  }
  return {
    rows: result.flatMap((entry) => [...entry.rows]),
    rowCount: result.reduce<number | null>((total, entry) => {
      if (total == null || entry.rowCount == null) {
        return null;
      }
      return total + entry.rowCount;
    }, 0)
  };
}

async function createDatabase(config: DatabaseConfig): Promise<PostgresDatabase> {
  const pool = new Pool(poolConfig(config));
  pool.on('error', (error) => {
    console.error('Postgres idle connection failed; the pool will reconnect on a later request', error);
  });
  const database = new PostgresDatabase(pool);
  try {
    if (config.migrationsEnabled) {
      await migrateDatabase(database);
    }
    return database;
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
}

function poolConfig(config: DatabaseConfig): PoolConfig {
  if (config.connectionString) {
    return {
      connectionString: config.connectionString,
      max: config.maxConnections,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined
    };
  }
  return {
    host: config.host,
    port: config.port,
    database: config.database ?? undefined,
    user: config.user ?? undefined,
    password: config.password ?? undefined,
    max: config.maxConnections,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined
  };
}

function databaseKey(config: DatabaseConfig): string {
  return JSON.stringify({
    url: config.connectionString,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    ssl: config.ssl,
    max: config.maxConnections,
    migrations: config.migrationsEnabled
  });
}
