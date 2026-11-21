import { describe, expect, it } from 'vitest';
import type { QueryResult, Queryable, TransactionalDatabase } from './types';
import { migrateDatabase } from './migrations';

describe('database migrations', () => {
  it('builds the owner-scoped playground read model through a mocked connection', async () => {
    const database = new RecordingDatabase();

    await migrateDatabase(database);

    const sql = database.queries.map((query) => query.sql).join('\n');
    expect(database.queries[0]).toEqual({
      sql: 'select pg_advisory_xact_lock($1, $2)',
      params: [1_095_910_216, 1]
    });
    expect(sql).toContain('create table if not exists public.playground_publication');
    expect(sql).toContain('create or replace view public.playground_current_repository');
    expect(sql).toContain('create or replace view public.playground_current_file');
    expect(sql).toContain("where p.slot = 'default'");
    expect(sql).toContain('join public.file f on f.repository_id = p.repository_id');
  });
});

class RecordingDatabase implements TransactionalDatabase {
  readonly queries: Array<{ sql: string; params: unknown[] }> = [];

  async transaction<T>(handler: (client: Queryable) => Promise<T>): Promise<T> {
    return handler(this);
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    this.queries.push({ sql: normalizeSql(sql), params: [...params] });
    return { rows: [], rowCount: 0 };
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim().toLowerCase();
}
