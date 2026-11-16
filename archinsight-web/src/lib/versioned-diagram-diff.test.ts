import { describe, expect, it } from 'vitest';
import {
  diagramDiffDeclarationSource,
  diagramDiffDeclarationNavigationAvailable,
  diagramDiffCompareDisabledReason,
  correspondingRevisionSource,
  orderedDiagramDiffRevisionPair,
  readyDiagramDiffPicker,
  selectDiagramDiffRevision,
  updateDiagramDiffRevisionSelection,
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
  it('allows declaration navigation only when the current Git revision participates in the diff', () => {
    expect(diagramDiffDeclarationNavigationAvailable({ status: 'idle' })).toBe(true);
    expect(diagramDiffDeclarationNavigationAvailable({
      status: 'showing-diff', before: 'old', after: 'current', beforeShort: 'old', afterShort: 'HEAD',
      currentRevision: 'current', selectedElementId: 'sample/api'
    })).toBe(true);
    expect(diagramDiffDeclarationNavigationAvailable({
      status: 'showing-diff', before: 'old', after: 'newer', beforeShort: 'old', afterShort: 'newer',
      currentRevision: 'current', selectedElementId: 'sample/api'
    })).toBe(false);
  });

  it('uses the selected element declaration instead of the active diagram source', () => {
    expect(diagramDiffDeclarationSource({
      declaration: { sourceName: 'services/api-gateway.ai', line: 8, column: 5 },
    })).toBe('services/api-gateway.ai');
    expect(diagramDiffDeclarationSource({
      declaration: { sourceName: 'views/architecture.aiq', line: 1, column: 1 },
    })).toBeUndefined();
    expect(diagramDiffDeclarationSource({})).toBeUndefined();
  });

  it('maps a moved model file by stable tab roots instead of treating the view as replaced', () => {
    const current = {
      tabRoots: {
        'services/api.ai': ['sample/api', 'sample/worker'],
        'services/other.ai': ['sample/other'],
      },
      contexts: [{ id: 'sample', type: 'Context', sourceIdentity: 'services/api.ai', attributes: {} }],
    };
    const moved = {
      tabRoots: {
        'systems/api/model.ai': ['sample/api', 'sample/worker'],
        'services/other.ai': ['sample/other'],
      },
      contexts: [{ id: 'sample', type: 'Context', sourceIdentity: 'systems/api/model.ai', attributes: {} }],
    };

    expect(correspondingRevisionSource(current, current, 'services/api.ai')).toBe('services/api.ai');
    expect(correspondingRevisionSource(current, moved, 'services/api.ai')).toBe('systems/api/model.ai');
    expect(correspondingRevisionSource({
      tabRoots: {}, contexts: [{ id: 'sample', type: 'Context', sourceIdentity: 'old/context.ai', attributes: {} }],
    }, {
      tabRoots: {}, contexts: [{ id: 'sample', type: 'Context', sourceIdentity: 'new/context.ai', attributes: {} }],
    }, 'old/context.ai')).toBe('new/context.ai');
    expect(correspondingRevisionSource({
      tabRoots: { 'old/extensions.ai': ['sample/api'] }, contexts: [],
    }, {
      tabRoots: { 'new/a.ai': ['sample/api'], 'new/b.ai': ['sample/api'] }, contexts: [],
    }, 'old/extensions.ai')).toBeUndefined();
  });

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
    if (state.status !== 'ready') throw new Error('Expected ready picker');
    expect(orderedDiagramDiffRevisionPair(state, 'head', 'older')).toEqual({ before: 'older', after: 'head' });
    expect(orderedDiagramDiffRevisionPair(state, 'older', 'head')).toEqual({ before: 'older', after: 'head' });
    expect(orderedDiagramDiffRevisionPair(state, 'head', 'head')).toBeUndefined();
    expect(orderedDiagramDiffRevisionPair(state, 'missing', 'older')).toBeUndefined();
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

  it('moves at most two selected interval boundaries according to the clicked revision', () => {
    const state = readyDiagramDiffPicker({
      schemaVersion: 'diagram-diff-revisions.v1',
      workspaceIdentity: '/repo',
      source: 'model.ai',
      currentRevision: 'head',
      revisions: ['head', 'upper', 'inside', 'lower', 'below'].map((id) => revision(id, id === 'head')),
    }, 'sample/api');
    if (state.status !== 'ready') throw new Error('Expected ready picker');

    expect(updateDiagramDiffRevisionSelection(state, [], 'upper')).toEqual(['upper']);
    expect(updateDiagramDiffRevisionSelection(state, ['upper'], 'upper')).toEqual([]);
    expect(updateDiagramDiffRevisionSelection(state, ['upper'], 'lower')).toEqual(['upper', 'lower']);
    expect(updateDiagramDiffRevisionSelection(state, ['upper', 'lower'], 'below')).toEqual(['upper', 'below']);
    expect(updateDiagramDiffRevisionSelection(state, ['upper', 'lower'], 'head')).toEqual(['head', 'lower']);
    expect(updateDiagramDiffRevisionSelection(state, ['upper', 'lower'], 'inside')).toEqual(['upper', 'inside']);
    expect(updateDiagramDiffRevisionSelection(state, ['upper', 'lower'], 'upper')).toEqual(['lower']);
    expect(updateDiagramDiffRevisionSelection(state, ['upper', 'lower'], 'missing')).toEqual(['upper', 'lower']);
  });
});
