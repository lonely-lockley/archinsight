import { getDatabaseConfig } from '$lib/server/database/database-config';
import { postgresDatabase } from '$lib/server/database/postgres-database';
import type { Queryable, TransactionalDatabase } from '$lib/server/database/types';
import type { EnvSource } from '$lib/server/auth/auth-config';
import type { PlaygroundPublication, PlaygroundPublicationStore } from './types';
import { forbidden } from '$lib/server/errors/application-error';

const defaultSlot = 'default';
let inMemoryStore: PlaygroundPublicationStore | undefined;
const postgresStores = new Map<string, Promise<PlaygroundPublicationStore>>();

export function playgroundPublicationStore(env?: EnvSource): PlaygroundPublicationStore {
  if (!getDatabaseConfig(env).enabled) {
    inMemoryStore ??= new InMemoryPlaygroundPublicationStore();
    return inMemoryStore;
  }
  return new LazyPostgresPlaygroundPublicationStore(env);
}

export function setPlaygroundPublicationStore(store: PlaygroundPublicationStore): void {
  inMemoryStore = store;
}

export class InMemoryPlaygroundPublicationStore implements PlaygroundPublicationStore {
  private readonly publications = new Map<string, PlaygroundPublication>();

  async current(slot = defaultSlot): Promise<PlaygroundPublication | null> {
    return this.publications.get(slot) ?? null;
  }

  async publish(slot: string, ownerId: string, repositoryId: string, publishedBy: string): Promise<PlaygroundPublication> {
    const now = new Date().toISOString();
    const publication = { slot, ownerId, repositoryId, publishedBy, publishedAt: now, updatedAt: now };
    this.publications.set(slot, publication);
    return publication;
  }

  async unpublish(slot: string): Promise<void> {
    this.publications.delete(slot);
  }
}

class LazyPostgresPlaygroundPublicationStore implements PlaygroundPublicationStore {
  constructor(private readonly env: EnvSource | undefined) {}

  async current(slot = defaultSlot) {
    return (await this.store()).current(slot);
  }

  async publish(slot: string, ownerId: string, repositoryId: string, publishedBy: string) {
    return (await this.store()).publish(slot, ownerId, repositoryId, publishedBy);
  }

  async unpublish(slot: string) {
    return (await this.store()).unpublish(slot);
  }

  private store(): Promise<PlaygroundPublicationStore> {
    const key = JSON.stringify(this.env ?? {});
    let store = postgresStores.get(key);
    if (!store) {
      store = postgresDatabase(this.env).then((database) => new PostgresPlaygroundPublicationStore(database));
      postgresStores.set(key, store);
      const pending = store;
      void pending.catch(() => {
        if (postgresStores.get(key) === pending) {
          postgresStores.delete(key);
        }
      });
    }
    return store;
  }
}

export class PostgresPlaygroundPublicationStore implements PlaygroundPublicationStore {
  constructor(private readonly database: TransactionalDatabase) {}

  async current(slot = defaultSlot): Promise<PlaygroundPublication | null> {
    return selectPublication(this.database, slot);
  }

  async publish(slot: string, ownerId: string, repositoryId: string, publishedBy: string): Promise<PlaygroundPublication> {
    return this.database.transaction(async (client) => {
      const owned = await client.query(
        'select id from public.repository where id = $1 and owner_id = $2 for update',
        [repositoryId, ownerId]
      );
      if (owned.rows.length === 0) {
        throw forbidden('Project is not owned by the current user');
      }
      await client.query(
        `
          insert into public.playground_publication (slot, repository_id, published_by)
          values ($1, $2, $3)
          on conflict (slot) do update
          set repository_id = excluded.repository_id,
              published_by = excluded.published_by,
              published_at = now(),
              updated_at = now()
        `,
        [slot, repositoryId, publishedBy]
      );
      const publication = await selectPublication(client, slot);
      if (!publication) {
        throw new Error('Playground publication was not saved');
      }
      return publication;
    });
  }

  async unpublish(slot: string): Promise<void> {
    await this.database.query('delete from public.playground_publication where slot = $1', [slot]);
  }
}

async function selectPublication(client: Queryable, slot: string): Promise<PlaygroundPublication | null> {
  const result = await client.query<{
    slot: string;
    repository_id: string;
    owner_id: string;
    published_by: string;
    published_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      select p.slot, p.repository_id, r.owner_id, p.published_by, p.published_at, p.updated_at
      from public.playground_publication p
      join public.repository r on r.id = p.repository_id
      where p.slot = $1
    `,
    [slot]
  );
  const row = result.rows[0];
  return row
    ? {
        slot: row.slot,
        repositoryId: row.repository_id,
        ownerId: row.owner_id,
        publishedBy: row.published_by,
        publishedAt: timestamp(row.published_at),
        updatedAt: timestamp(row.updated_at)
      }
    : null;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
