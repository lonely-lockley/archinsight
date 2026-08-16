import { describe, expect, it } from 'vitest';
import type { Queryable, QueryResult, TransactionalDatabase } from '$lib/server/database/types';
import { PostgresPlaygroundPublicationStore } from './playground-publication-store';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';
const otherOwnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const repositoryId = '1ad2ba2c-10a6-4f5f-997a-029065a700bc';

describe('PostgresPlaygroundPublicationStore', () => {
  it('publishes only an owner-scoped project through a mocked transaction', async () => {
    const database = new FakePublicationDatabase();
    const store = new PostgresPlaygroundPublicationStore(database);

    await expect(store.publish('default', otherOwnerId, repositoryId, otherOwnerId)).rejects.toMatchObject({
      status: 403
    });
    await expect(store.current()).resolves.toBeNull();

    await expect(store.publish('default', ownerId, repositoryId, ownerId)).resolves.toMatchObject({
      slot: 'default',
      ownerId,
      repositoryId,
      publishedBy: ownerId
    });
    await expect(store.current()).resolves.toMatchObject({ ownerId, repositoryId });

    const ownershipChecks = database.queries.filter((query) =>
      query.sql.includes('from public.repository') && query.sql.includes('for update')
    );
    expect(ownershipChecks.map((query) => query.params)).toEqual([
      [repositoryId, otherOwnerId],
      [repositoryId, ownerId]
    ]);

    await store.unpublish('default');
    await expect(store.current()).resolves.toBeNull();
  });
});

type RepositoryRecord = { id: string; ownerId: string };
type PublicationRecord = {
  slot: string;
  repositoryId: string;
  publishedBy: string;
  publishedAt: string;
  updatedAt: string;
};

class FakePublicationDatabase implements TransactionalDatabase {
  readonly queries: Array<{ sql: string; params: unknown[] }> = [];
  private readonly repositories = new Map<string, RepositoryRecord>([
    [repositoryId, { id: repositoryId, ownerId }]
  ]);
  private readonly publications = new Map<string, PublicationRecord>();

  async transaction<T>(handler: (client: Queryable) => Promise<T>): Promise<T> {
    return handler(this);
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const statement = normalizeSql(sql);
    this.queries.push({ sql: statement, params: [...params] });
    if (statement.startsWith('select id from public.repository')) {
      const repository = this.repositories.get(String(params[0]));
      return asResult(rows(repository && repository.ownerId === params[1] ? [{ id: repository.id }] : []));
    }
    if (statement.startsWith('insert into public.playground_publication')) {
      const now = '2026-01-01T00:00:00.000Z';
      this.publications.set(String(params[0]), {
        slot: String(params[0]),
        repositoryId: String(params[1]),
        publishedBy: String(params[2]),
        publishedAt: now,
        updatedAt: now
      });
      return asResult(changed());
    }
    if (statement.includes('from public.playground_publication p')) {
      const publication = this.publications.get(String(params[0]));
      const repository = publication && this.repositories.get(publication.repositoryId);
      return asResult(rows(publication && repository ? [{
        slot: publication.slot,
        repository_id: publication.repositoryId,
        owner_id: repository.ownerId,
        published_by: publication.publishedBy,
        published_at: publication.publishedAt,
        updated_at: publication.updatedAt
      }] : []));
    }
    if (statement.startsWith('delete from public.playground_publication')) {
      const deleted = this.publications.delete(String(params[0]));
      return { rows: [], rowCount: deleted ? 1 : 0 } as QueryResult<T>;
    }
    throw new Error(`Unexpected SQL in fake publication database: ${statement}`);
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
