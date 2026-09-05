import { describe, expect, it } from 'vitest';
import type { ProjectStructure } from './api';
import {
  completionSnapshotFromProjectStructure,
  visibleIdentifiersForSource
} from './workspace-completion-snapshot';

describe('workspace completion snapshot', () => {
  it('keeps imported identifiers source-scoped and indexes contextual identifiers at every nesting level', () => {
    const structure: ProjectStructure = {
      schemaVersion: 'project-structure.v1',
      contexts: [
        {
          id: 'eu',
          kind: 'context',
          constructor: 'Environment',
          type: 'Environment',
          source: 'eu.ai',
          line: 1,
          column: 1,
          children: [{
            id: 'production',
            kind: 'element',
            constructor: 'deployment',
            type: 'Deployment',
            source: 'eu.ai',
            line: 3,
            column: 1,
            children: [{
              id: 'compute',
              kind: 'element',
              constructor: 'compute',
              type: 'Compute',
              source: 'eu.ai',
              line: 4,
              column: 5,
              children: []
            }]
          }]
        },
        {
          id: 'app',
          kind: 'context',
          constructor: 'Context',
          type: 'Context',
          source: 'app.ai',
          line: 1,
          column: 1,
          children: [{
            id: 'backend',
            kind: 'import',
            constructor: 'import',
            type: 'System',
            source: 'app.ai',
            line: 3,
            column: 1,
            children: []
          }]
        }
      ]
    };

    const snapshot = completionSnapshotFromProjectStructure(structure, 7);

    expect(snapshot.contextualIdentifiers).toEqual([
      { label: 'production', type: 'Deployment', contextId: 'eu' },
      { label: 'compute', type: 'Compute', contextId: 'eu' }
    ]);
    expect([...visibleIdentifiersForSource(snapshot, 'app.ai').values()]).toEqual([
      { label: 'backend', type: 'System', imported: true }
    ]);
    expect(visibleIdentifiersForSource(snapshot, 'eu.ai').has('backend')).toBe(false);
  });
});
