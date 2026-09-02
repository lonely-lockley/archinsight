import { describe, expect, it } from 'vitest';
import { InMemoryRepositoryFileSystem } from './in-memory-repository-file-system';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';

describe('InMemoryRepositoryFileSystem persistence adapter', () => {
  it('hydrates independent owner-scoped aggregates from seeds', async () => {
    const fs = new InMemoryRepositoryFileSystem();
    fs.setProjects(ownerId, [{ id: 'project-1', name: 'Project 1', files: { 'src/main.ai': 'context demo' } }]);
    fs.setProjects('other-owner', [{ id: 'project-2', name: 'Project 2', files: { 'other.ai': 'context other' } }]);

    expect((await fs.read(ownerId, 'project-1', 'src/main')).content).toBe('context demo');
    await expect(fs.read(ownerId, 'project-2', 'other')).rejects.toThrow('Repository not found');
    await expect(fs.projects('other-owner')).resolves.toEqual([
      expect.objectContaining({ id: 'project-2', name: 'Project 2', fileCount: 1 })
    ]);
  });
});
