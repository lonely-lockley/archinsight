import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRepositoryFileSystem } from './in-memory-repository-file-system';
import { PostgresRepositoryFileSystem } from './postgres-repository-file-system';
import type { RepositoryFileSystem } from './types';
import {
  FakeRepositoryDatabase,
  TEST_OWNER_ID,
  TEST_REPOSITORY_ID
} from './repository-file-system.test-support';

const otherOwnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const adapters: Array<{ name: string; create: () => RepositoryFileSystem }> = [
  { name: 'in-memory', create: memoryRepository },
  { name: 'postgres', create: () => new PostgresRepositoryFileSystem(new FakeRepositoryDatabase()) }
];

afterEach(() => vi.useRealTimers());

describe.each(adapters)('$name repository behavior contract', ({ create }) => {
  it('enforces the project lifecycle, normalized names, and owner isolation', async () => {
    const repository = create();

    await expect(repository.createProject(TEST_OWNER_ID, { name: '  New Project  ' })).resolves.toMatchObject({
      name: 'New Project', fileCount: 0
    });
    await expect(repository.createProject(TEST_OWNER_ID, { name: 'new project' })).rejects.toMatchObject({ code: 'CONFLICT' });
    const projects = await repository.projects(TEST_OWNER_ID);
    expect(projects[0].name).toBe('New Project');
    const created = projects.find((project) => project.name === 'New Project');
    expect(created).toBeDefined();
    await expect(repository.updateProject(TEST_OWNER_ID, created!.id, { name: 'Renamed' })).resolves.toMatchObject({ name: 'Renamed' });
    await expect(repository.tree(otherOwnerId, created!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await repository.deleteProject(TEST_OWNER_ID, created!.id);
    expect((await repository.projects(TEST_OWNER_ID)).some((project) => project.id === created!.id)).toBe(false);
  });

  it('runs the same file and folder workflow without losing content', async () => {
    const repository = create();

    await repository.createFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, { path: 'docs' });
    const saved = await repository.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'docs/model', { content: 'context docs' });
    const renamed = await repository.rename(TEST_OWNER_ID, TEST_REPOSITORY_ID, { sourcePath: 'docs/model', targetPath: 'docs/main' });
    expect(renamed.revision).not.toBe(saved.revision);
    await repository.renameFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, { sourcePath: 'docs', targetPath: 'architecture' });

    await expect(repository.read(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'architecture/main')).resolves.toMatchObject({
      path: 'architecture/main.ai', content: 'context docs', readOnly: false
    });
    expect(await repository.sources(TEST_OWNER_ID, TEST_REPOSITORY_ID)).toEqual(new Map([
      ['archinsight.ai', 'context demo'],
      ['architecture/main.ai', 'context docs']
    ]));

    await repository.delete(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'architecture/main');
    await repository.deleteFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'architecture');
    await expect(repository.read(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'architecture/main')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('shares validation and collision rules for repository commands', async () => {
    const repository = create();

    await expect(repository.createProject(TEST_OWNER_ID, { name: ' ' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, '../secret', { content: '' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'new', {
      content: '', level: 'x'.repeat(51)
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(repository.rename(TEST_OWNER_ID, TEST_REPOSITORY_ID, null)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await repository.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'second', { content: '' });
    await expect(repository.rename(TEST_OWNER_ID, TEST_REPOSITORY_ID, {
      sourcePath: 'second', targetPath: 'archinsight'
    })).rejects.toMatchObject({ code: 'CONFLICT' });

    await repository.createFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, { path: 'docs' });
    await expect(repository.renameFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, {
      sourcePath: 'docs', targetPath: 'docs/nested'
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('changes the project updated timestamp after content and tree mutations', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const repository = create();
    const before = (await repository.projects(TEST_OWNER_ID))[0].updated;

    vi.setSystemTime(new Date('2026-02-02T00:00:00.000Z'));
    await repository.save(TEST_OWNER_ID, TEST_REPOSITORY_ID, 'archinsight', { content: 'context changed' });
    const afterSave = (await repository.projects(TEST_OWNER_ID))[0].updated;
    expect(afterSave).not.toBe(before);

    vi.setSystemTime(new Date('2026-02-03T00:00:00.000Z'));
    await repository.createFolder(TEST_OWNER_ID, TEST_REPOSITORY_ID, { path: 'docs' });
    expect((await repository.projects(TEST_OWNER_ID))[0].updated).not.toBe(afterSave);
  });
});

function memoryRepository(): InMemoryRepositoryFileSystem {
  const repository = new InMemoryRepositoryFileSystem();
  repository.setProjects(TEST_OWNER_ID, [{
    id: TEST_REPOSITORY_ID,
    name: 'Project 1',
    files: { 'archinsight.ai': 'context demo' }
  }]);
  return repository;
}
