import { describe, expect, it, vi } from 'vitest';
import { LazyPostgresRepositoryFileSystem } from './repository-file-system';

describe('repositoryFileSystem', () => {
  it('retries lazy Postgres initialization after a failure', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const recoveredDatabase = {
      query,
      transaction: vi.fn()
    };
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(recoveredDatabase);
    const fileSystem = new LazyPostgresRepositoryFileSystem(connect);

    await expect(fileSystem.projects('owner')).rejects.toThrow('database unavailable');
    await expect(fileSystem.projects('owner')).resolves.toEqual([]);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
