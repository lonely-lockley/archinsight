import { describe, expect, it, vi } from 'vitest';
import { repositoryFileSystem } from './repository-file-system';

const database = vi.hoisted(() => ({
  connect: vi.fn()
}));

vi.mock('$lib/server/database/postgres-database', () => ({
  postgresDatabase: database.connect
}));

describe('repositoryFileSystem', () => {
  it('retries lazy Postgres initialization after a failure', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const recoveredDatabase = {
      query,
      transaction: vi.fn()
    };
    database.connect.mockReset()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(recoveredDatabase);
    const fileSystem = repositoryFileSystem({
      ARCHINSIGHT_REPOSITORY_BACKEND: 'postgres',
      ARCHINSIGHT_DATABASE_URL: 'postgres://repository-recovery-test/database'
    });

    await expect(fileSystem.projects('owner')).rejects.toThrow('database unavailable');
    await expect(fileSystem.projects('owner')).resolves.toEqual([]);

    expect(database.connect).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
