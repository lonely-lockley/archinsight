import { describe, expect, it } from 'vitest';
import { normalizeFileName } from './path';
import { InMemoryRepositoryFileSystem } from './in-memory-repository-file-system';
import { parseLinkRequest } from '@archinsight/contracts';
import { linkForSources } from '../language/language-pipeline';

describe('query file repository and rendering contract', () => {
  it('preserves query extensions through create, read, move and delete without adding model sources', async () => {
    expect(normalizeFileName('nested/c2.aiq')).toBe('nested/c2.aiq');
    expect(normalizeFileName('model')).toBe('model.ai');
    const repository = new InMemoryRepositoryFileSystem();
    repository.setProjects('owner', [{ id: 'p', name: 'p', files: { 'main.ai': 'context demo', 'nested/c2.aiq': 'MATCH (n) RETURN n' } }]);
    expect((await repository.read('owner', 'p', 'nested/c2.aiq')).content).toBe('MATCH (n) RETURN n');
    expect([...await repository.sources('owner', 'p')]).toEqual([['main.ai', 'context demo']]);
    await repository.rename('owner', 'p', { sourcePath: 'nested/c2.aiq', targetPath: 'impact.aiq' });
    expect((await repository.read('owner', 'p', 'impact.aiq')).content).toBe('MATCH (n) RETURN n');
    await repository.delete('owner', 'p', 'impact.aiq');
    await expect(repository.read('owner', 'p', 'impact.aiq')).rejects.toThrow();
  });
  it('renders a query tab against its selected model source and infers the context', async () => {
    const sources = new Map([['one.ai', 'context one\n\nsystem first\n    name = First\n'], ['two.ai', 'context two\n\nsystem second\n    name = Second\n']]);
    const result = await linkForSources(undefined, sources, {
      openSourceIdentities: ['q.aiq'], querySource: 'two.ai', query: 'MATCH (n:Element) WHERE n.sourceIdentity = $tab AND n.context = $context RETURN n'
    });
    expect(result.diagnostics.filter((item) => item.level === 'ERROR')).toEqual([]);
    expect(result.renders).toHaveLength(1);
    expect(result.renders[0].sourceIdentity).toBe('q.aiq');
    expect(result.renders[0].dot).toContain('Second');
    expect(result.renders[0].dot).not.toContain('First');
    const contextOnly = await linkForSources(undefined, sources, { openSourceIdentities: ['q.aiq'], queryContext: 'one', query: 'MATCH (n:Element) WHERE n.context = $context RETURN n' });
    expect(contextOnly.renders[0].dot).toContain('First');
    expect(contextOnly.renders[0].dot).not.toContain('Second');
  });
  it('validates the new scope fields at the HTTP boundary', () => {
    expect(parseLinkRequest({ querySource: 'one.ai', queryContext: 'one' })).toMatchObject({ querySource: 'one.ai', queryContext: 'one' });
    expect(() => parseLinkRequest({ querySource: 4 })).toThrow();
    expect(() => parseLinkRequest({ queryContext: ['one'] })).toThrow();
  });
});
