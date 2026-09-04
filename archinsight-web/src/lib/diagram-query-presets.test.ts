import { describe, expect, it } from 'vitest';
import { BUILTIN_VIEW_DEFINITIONS } from '@insight/language';
import {
  diagramModeDefinition,
  diagramModeForQuery,
  normalizeDiagramMode,
  queryForDiagramMode,
  resolveStoredDiagramQuery
} from '@archinsight/workbench/presets';

describe('stored diagram query presets', () => {
  it('adapts the UI default alias to the canonical no-filter view', () => {
    expect(diagramModeDefinition('default').id).toBe('no-filter');
    expect(diagramModeForQuery(queryForDiagramMode('default'))).toBe('default');
    expect(normalizeDiagramMode('no-filter')).toBe('no-filter');
    expect(normalizeDiagramMode('unknown')).toBeUndefined();
  });

  it('accepts every catalogue entry without a local name list', () => {
    for (const definition of BUILTIN_VIEW_DEFINITIONS) {
      expect(normalizeDiagramMode(definition.id)).toBe(definition.id);
      expect(queryForDiagramMode(definition.id)).toBe(definition.query);
    }
  });

  it.each(['deployment-system', 'deployment-container'] as const)(
    'upgrades a saved built-in %s query when the preset changes',
    (diagramMode) => {
      const current = queryForDiagramMode(diagramMode);
      const previous = current.replace('\n   OR projectedPeer IS SystemElement', '');
      const oldest = previous.replace('\n    OR node IS SystemElement', '');

      for (const query of [previous, oldest]) {
        expect(resolveStoredDiagramQuery({
          diagramMode,
          query
        })).toEqual({
          diagramMode,
          query: current,
          queryPreset: true
        });
      }
    }
  );

  it('preserves a legacy custom query that predates the preset marker', () => {
    const query = 'MATCH (node:SystemElement) WHERE node.sourceIdentity = $tab RETURN node';

    expect(resolveStoredDiagramQuery({
      diagramMode: 'deployment-system',
      query
    })).toEqual({
      diagramMode: 'deployment-system',
      query,
      queryPreset: false
    });
  });

  it('keeps an explicitly customized query unchanged', () => {
    const query = 'MATCH (node:SystemElement) WHERE node.sourceIdentity = $tab RETURN node';

    expect(resolveStoredDiagramQuery({
      diagramMode: 'deployment-system',
      query,
      queryPreset: false
    })).toEqual({
      diagramMode: 'deployment-system',
      query,
      queryPreset: false
    });
  });

  it('refreshes a marked preset without depending on its saved text', () => {
    expect(resolveStoredDiagramQuery({
      diagramMode: 'deployment-container',
      query: 'outdated preset text',
      queryPreset: true
    })).toEqual({
      diagramMode: 'deployment-container',
      query: queryForDiagramMode('deployment-container'),
      queryPreset: true
    });
  });
});
