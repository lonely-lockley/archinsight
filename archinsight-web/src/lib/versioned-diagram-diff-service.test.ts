import { describe, expect, it, vi } from 'vitest';
import type { VersionedRepository } from '@archinsight/contracts';
import type { ProjectSource, RenderGraph } from '@insight/language';
import {
  attributeVersionedDiagramDiff,
  buildVersionedDiagramDiff,
  changedDiagramDiffOrigins,
  loadVersionedModelComparison,
  projectVersionedDiagramDiff
} from '@archinsight/workbench/versioned-diagram-diff-service';

const graph = (context: string, title: string): RenderGraph => ({
  context,
  elements: {
    service: {
      id: 'service', context: 'sample', localId: 'service', type: 'System', constructor: 'system',
      sourceIdentity: 'model.ai', baseTypes: ['Element'], attributes: { name: [title] },
      declaration: { sourceName: 'model.ai', line: 1, column: 1 }
    }
  },
  edges: [], groups: [], externalElements: []
});

function repository(): VersionedRepository {
  return {
    catalogueForPath: vi.fn(),
    validatePair: vi.fn(async () => {}),
    readProjectAt: vi.fn(async (revision: string) => [{ sourceName: 'model.ai', source: revision }]),
    attribute: vi.fn(async () => ({ attribution: {}, diagnostics: [] }))
  };
}

describe('versioned diagram diff service', () => {
  it('owns validation, snapshot loading, graph selection and semantic diff construction', async () => {
    const repo = repository();
    const semantic = await buildVersionedDiagramDiff({
      repository: repo,
      beforeRevision: 'before',
      afterRevision: 'after',
      signal: new AbortController().signal,
      buildRevision: (sources: readonly ProjectSource[], revision: string) => ({ sources, revision }),
      selectGraph: (revision) => graph(revision.revision, revision.revision === 'before' ? 'Before' : 'After')
    });

    expect(repo.validatePair).toHaveBeenCalledWith('before', 'after', expect.any(AbortSignal));
    expect(repo.readProjectAt).toHaveBeenCalledTimes(2);
    expect(semantic.diff.elements.service?.status).toBe('changed');
    expect(changedDiagramDiffOrigins(semantic.diff)).toHaveProperty(semantic.diff.elements.service!.changeId);
  });

  it('uses an empty graph when a source exists on only one side and rejects absence on both sides', async () => {
    const repo = repository();
    const options = {
      repository: repo,
      beforeRevision: 'before',
      afterRevision: 'after',
      signal: new AbortController().signal,
      buildRevision: (_sources: readonly ProjectSource[], revision: string) => revision,
    };
    const added = await buildVersionedDiagramDiff({
      ...options,
      selectGraph: (revision: string) => revision === 'after' ? graph('after', 'After') : undefined
    });
    expect(added.diff.elements.service?.status).toBe('added');

    await expect(buildVersionedDiagramDiff({ ...options, selectGraph: () => undefined }))
      .rejects.toThrow('absent from both revisions');
  });

  it('attaches repository attribution to the same semantic diff', async () => {
    const repo = repository();
    const semantic = await buildVersionedDiagramDiff({
      repository: repo,
      beforeRevision: 'before',
      afterRevision: 'after',
      signal: new AbortController().signal,
      buildRevision: (_sources, revision) => revision,
      selectGraph: (revision) => graph(revision, revision === 'before' ? 'Before' : 'After')
    });
    const attributed = await attributeVersionedDiagramDiff(repo, semantic, new AbortController().signal);
    expect(attributed.diff).toBe(semantic.diff);
    expect(attributed.revisions).toEqual({ before: 'before', after: 'after' });
    expect(repo.attribute).toHaveBeenCalledWith(expect.objectContaining({
      before: 'before', after: 'after', origins: changedDiagramDiffOrigins(semantic.diff)
    }), expect.any(AbortSignal));
  });

  it('keeps full revision snapshots independent from repeated view projections', async () => {
    const repo = repository();
    const comparison = await loadVersionedModelComparison({
      repository: repo,
      beforeRevision: 'before',
      afterRevision: 'after',
      signal: new AbortController().signal,
      buildRevision: (sources, revision) => ({ sources, revision })
    });
    const c1 = await projectVersionedDiagramDiff(comparison, (revision) =>
      graph('c1', `${revision.revision}-c1`));
    const c2 = await projectVersionedDiagramDiff(comparison, (revision) =>
      graph('c2', `${revision.revision}-c2`));

    expect(repo.readProjectAt).toHaveBeenCalledTimes(2);
    expect(c1.before).toBe(comparison.before);
    expect(c2.after).toBe(comparison.after);
    expect(c1.diff.beforeContext).toBe('c1');
    expect(c2.diff.beforeContext).toBe('c2');
  });
});
