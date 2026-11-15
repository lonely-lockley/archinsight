import { describe, expect, it } from 'vitest';
import {
  diagramDiffCompareDisabledReason,
  readyDiagramDiffPicker,
  selectDiagramDiffRevision,
} from '@archinsight/workbench/versioned-diagram-diff';

const revision = (id: string, current = false) => ({
  id,
  shortId: current ? 'HEAD' : id,
  actorName: 'Architect',
  createdAt: '2026-11-14T10:00:00.000Z',
  summary: id,
  sourcePath: 'model.ai',
  current,
});

describe('versioned diagram diff model', () => {
  it('defaults to HEAD and the nearest older file revision', () => {
    const state = readyDiagramDiffPicker({
      schemaVersion: 'diagram-diff-revisions.v1',
      workspaceIdentity: '/repo',
      source: 'model.ai',
      currentRevision: 'head',
      revisions: [revision('head', true), revision('older')],
    }, 'sample/api');
    expect(state).toMatchObject({ status: 'ready', before: 'older', after: 'head' });
    expect(diagramDiffCompareDisabledReason(state)).toBeUndefined();
    expect(selectDiagramDiffRevision(state, 'before', 'head')).toMatchObject({ before: 'head' });
  });

  it('keeps the action usable but disables Compare without a historical pair', () => {
    const state = readyDiagramDiffPicker({
      schemaVersion: 'diagram-diff-revisions.v1',
      workspaceIdentity: '/repo',
      source: 'untracked.ai',
      currentRevision: 'head',
      revisions: [revision('head', true)],
    }, 'sample/api');
    expect(diagramDiffCompareDisabledReason(state)).toBe('No earlier revision is available for this file');
  });
});
