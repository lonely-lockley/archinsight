import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizePostgresResult, postgresDatabase } from './postgres-database';

const pg = vi.hoisted(() => ({
  query: vi.fn(),
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

    await expect(postgresDatabase(env)).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      cause: expect.objectContaining({ message: 'database unavailable' })
    });
    await expect(postgresDatabase(env)).resolves.toBeInstanceOf(Object);

    expect(pg.pools).toHaveLength(2);
    expect(pg.end).toHaveBeenCalledTimes(1);
    expect(pg.on).toHaveBeenCalledTimes(2);
    expect(pg.on).toHaveBeenNthCalledWith(1, 'error', expect.any(Function));
  });
});
