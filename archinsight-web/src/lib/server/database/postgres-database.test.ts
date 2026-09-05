import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePostgresResult, PostgresDatabaseProvider } from './postgres-database';
import { parseDatabaseConfig } from './database-config';

const pg = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  pools: [] as unknown[]
}));

vi.mock('pg', () => ({
  Pool: class {
    constructor(config: unknown) {
      pg.pools.push(config);
    }

    query(...args: unknown[]) {
      return pg.query(...args);
    }

    connect() {
      return pg.connect();
    }

    end() {
      return pg.end();
    }

    on(...args: unknown[]) {
      pg.on(...args);
      return this;
    }
  }
}));

beforeEach(() => {
  pg.query.mockReset();
  pg.connect.mockReset();
  pg.end.mockReset().mockResolvedValue(undefined);
  pg.on.mockReset();
  pg.pools.length = 0;
});

describe('normalizePostgresResult', () => {
  it('normalizes multi-statement pg results', () => {
    expect(
      normalizePostgresResult([
        { rows: [], rowCount: null },
        { rows: [{ version: 1 }], rowCount: 1 }
      ] as never)
    ).toEqual({
      rows: [{ version: 1 }],
      rowCount: null
    });
  });

  it('recreates the pool after database initialization fails', async () => {
    const env = {
      ARCHINSIGHT_DATABASE_ENABLED: 'true',
      ARCHINSIGHT_DATABASE_URL: 'postgres://recovery-test/database',
      ARCHINSIGHT_DATABASE_MIGRATIONS_ENABLED: 'true'
    };
    pg.query.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue({ rows: [], rowCount: 0 });

    const provider = new PostgresDatabaseProvider(parseDatabaseConfig(env));

    await expect(provider.get()).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      cause: expect.objectContaining({ message: 'database unavailable' })
    });
    await expect(provider.get()).resolves.toBeInstanceOf(Object);

    expect(pg.pools).toHaveLength(2);
    expect(pg.end).toHaveBeenCalledTimes(1);
    expect(pg.on).toHaveBeenCalledTimes(2);
    expect(pg.on).toHaveBeenNthCalledWith(1, 'error', expect.any(Function));
  });

  it('shares one lazy pool and closes it exactly once', async () => {
    const provider = new PostgresDatabaseProvider(parseDatabaseConfig({
      ARCHINSIGHT_DATABASE_ENABLED: 'true',
      ARCHINSIGHT_DATABASE_URL: 'postgres://lifecycle-test/database',
      ARCHINSIGHT_DATABASE_MIGRATIONS_ENABLED: 'false'
    }));

    const [first, second] = await Promise.all([provider.get(), provider.get()]);
    expect(first).toBe(second);
    expect(pg.pools).toHaveLength(1);

    await provider.dispose();
    await provider.dispose();
    expect(pg.end).toHaveBeenCalledOnce();
  });

  it('owns commit and client release around successful transactions', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ value: 42 }], rowCount: 1 }),
      release: vi.fn()
    };
    pg.connect.mockResolvedValue(client);
    const provider = new PostgresDatabaseProvider(parseDatabaseConfig({
      ARCHINSIGHT_DATABASE_ENABLED: 'true',
      ARCHINSIGHT_DATABASE_MIGRATIONS_ENABLED: 'false'
    }));
    const database = await provider.get();

    const result = await database.transaction(async (transaction) => {
      const selected = await transaction.query<{ value: number }>('select value');
      return selected.rows[0].value;
    });

    expect(result).toBe(42);
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['begin', 'select value', 'commit']);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
