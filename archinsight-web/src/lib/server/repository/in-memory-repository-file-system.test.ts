import { describe, expect, it } from 'vitest';
import { InMemoryRepositoryFileSystem } from './in-memory-repository-file-system';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';

describe('InMemoryRepositoryFileSystem', () => {
  it('normalizes file names and exposes a repository tree', async () => {
    const fs = repository();

    await expect(fs.projects(ownerId)).resolves.toEqual([
      expect.objectContaining({ id: 'project-1', name: 'Project 1', fileCount: 1 })
    ]);
    expect((await fs.read(ownerId, 'project-1', 'src/main')).path).toBe('src/main.ai');
    expect((await fs.tree(ownerId, 'project-1')).root.children[0]).toMatchObject({
      name: 'src',
      path: 'src',
      type: 'directory'
    });
  });

  it('renames folders by moving tree nodes without losing file content', async () => {
    const fs = repository();

    await fs.renameFolder(ownerId, 'project-1', {
      sourcePath: 'src',
      targetPath: 'model'
    });

    expect((await fs.read(ownerId, 'project-1', 'model/main')).content).toBe('context demo');
    await expect(fs.read(ownerId, 'project-1', 'src/main')).rejects.toThrow('Repository file not found');
  });

  it('deletes folders and removes all nested file contents from sources', async () => {
    const fs = repository();

    await fs.deleteFolder(ownerId, 'project-1', 'src');

    expect([...(await fs.sources(ownerId, 'project-1')).keys()]).toEqual([]);
    await expect(fs.read(ownerId, 'project-1', 'src/main')).rejects.toThrow('Repository file not found');
  });

  it('rejects paths outside project scope', async () => {
    const fs = repository();

    await expect(fs.read(ownerId, 'project-1', '../secret')).rejects.toThrow('outside project scope');
    await expect(fs.createFolder(ownerId, 'project-1', { path: '/absolute' })).rejects.toThrow('must be relative');
  });
});

function repository(): InMemoryRepositoryFileSystem {
  const fs = new InMemoryRepositoryFileSystem();
  fs.setProjects(ownerId, [
    {
      id: 'project-1',
      name: 'Project 1',
      files: {
        'src/main.ai': 'context demo'
      }
    }
  ]);
  return fs;
}
