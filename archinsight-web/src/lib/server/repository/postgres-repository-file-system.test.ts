import { describe, expect, it } from 'vitest';
import { PostgresRepositoryFileSystem } from './postgres-repository-file-system';
import {
  FakeRepositoryDatabase,
  TEST_FILE_ID,
  TEST_OWNER_ID,
  TEST_REPOSITORY_ID
} from './repository-file-system.test-support';

describe('PostgresRepositoryFileSystem persistence adapter', () => {
  it('uses repository.structure as the authoritative tree and reads file content by node id', async () => {
    const fs = new PostgresRepositoryFileSystem(new FakeRepositoryDatabase());

    await expect(fs.projects(TEST_OWNER_ID)).resolves.toEqual([
      expect.objectContaining({ id: TEST_REPOSITORY_ID, name: 'Project 1', fileCount: 1 })
    ]);
    expect((await fs.tree(TEST_OWNER_ID, TEST_REPOSITORY_ID)).root.children[0]).toMatchObject({
      name: 'archinsight.ai', path: 'archinsight.ai', type: 'file'
    });
    await expect(fs.read(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'archinsight')).resolves.toMatchObject({
      path: 'archinsight.ai', content: 'context demo'
    });
  });

  it('persists new tree nodes and file metadata by node id', async () => {
    const database = new FakeRepositoryDatabase();
    const fs = new PostgresRepositoryFileSystem(database);

    await fs.createFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, { path: 'docs' });
    const saved = await fs.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'docs/new-model', {
      content: 'context docs', level: 'system', projectIdentifier: 'docs'
    });

    expect(saved.path).toBe('docs/new-model.ai');
    expect([...database.files.values()].find((file) => file.file_name === 'new-model.ai')).toMatchObject({
      level: 'system', project_identifier: 'docs'
    });
  });

  it('deletes every nested file row when a folder is removed', async () => {
    const database = new FakeRepositoryDatabase();
    const fs = new PostgresRepositoryFileSystem(database);

    await fs.createFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, { path: 'docs' });
    await fs.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'docs/a', { content: 'context a' });
    await fs.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'docs/b', { content: 'context b' });
    await fs.deleteFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'docs');

    expect([...database.files.keys()]).toEqual([TEST_FILE_ID]);
  });

  it('locks the owner-scoped repository row before changing its tree', async () => {
    const database = new FakeRepositoryDatabase();
    const fs = new PostgresRepositoryFileSystem(database);

    await fs.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'second.ai', { content: 'context second' });

    const lock = database.queries.find((query) => query.sql.includes('from public.repository') && query.sql.includes('for update'));
    expect(lock?.params).toEqual([TEST_OWNER_ID, TEST_REPOSITORY_ID]);
    expect(database.queries.findIndex((query) => query === lock)).toBeLessThan(
      database.queries.findIndex((query) => query.sql.startsWith('insert into public.file'))
    );
  });
});
