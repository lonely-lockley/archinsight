// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLocalWorkspaceStorage,
  clearProjectStorage,
  hasLocalSource,
  readLocalSource,
  readProjectRegistry,
  readWorkspace,
  rememberProject,
  removeLocalSource,
  writeLocalSource,
  writeProjectRegistry,
  writeWorkspace
} from './storage';

describe('workspace storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns empty state for missing or malformed workspace data', () => {
    expect(readWorkspace('demo')).toEqual({ tabs: [] });

    localStorage.setItem('insight:demo:workspace', '{not-json');
    expect(readWorkspace('demo')).toEqual({ tabs: [] });
  });

  it('migrates legacy string tabs and fills missing source identities', () => {
    localStorage.setItem('insight:demo:workspace', JSON.stringify({
      activeTab: 'models/api.ai',
      tabs: [
        'models/api.ai',
        { id: 'worker', filePath: 'models/worker.ai', title: 'Worker' },
        { id: 'query', title: 'Query', sourceIdentity: 'query.ai' }
      ],
      ui: { sidebarVisible: false }
    }));

    expect(readWorkspace('demo')).toEqual({
      activeTab: 'models/api.ai',
      tabs: [
        {
          id: 'models/api.ai',
          filePath: 'models/api.ai',
          sourceIdentity: 'models/api.ai',
          title: 'api.ai'
        },
        {
          id: 'worker',
          filePath: 'models/worker.ai',
          sourceIdentity: 'models/worker.ai',
          title: 'Worker'
        },
        { id: 'query', title: 'Query', sourceIdentity: 'query.ai' }
      ],
      ui: { sidebarVisible: false }
    });
  });

  it('round-trips current workspace state', () => {
    const state = { tabs: [{ id: 'query', title: 'Query' }], activeTab: 'query' };
    writeWorkspace('demo', state);
    expect(readWorkspace('demo')).toEqual(state);
  });
});

describe('project registry storage', () => {
  beforeEach(() => localStorage.clear());

  it('filters malformed registry entries and invalid active ids', () => {
    localStorage.setItem('insight:projects', JSON.stringify({
      activeProjectId: 42,
      projects: [
        { id: 'valid', name: 'Valid' },
        { id: 'missing-name' },
        null,
        'legacy'
      ]
    }));

    expect(readProjectRegistry()).toEqual({
      activeProjectId: undefined,
      projects: [{ id: 'valid', name: 'Valid' }]
    });
  });

  it('remembers a project as active without duplicating it', () => {
    writeProjectRegistry({
      activeProjectId: 'old',
      projects: [
        { id: 'old', name: 'Old name' },
        { id: 'other', name: 'Other' }
      ]
    });

    expect(rememberProject({ id: 'old', name: 'Renamed' })).toEqual({
      activeProjectId: 'old',
      projects: [
        { id: 'old', name: 'Renamed' },
        { id: 'other', name: 'Other' }
      ]
    });
    expect(readProjectRegistry().projects).toHaveLength(2);
  });
});

describe('local source storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads legacy content, then prefers current content and records its timestamp', () => {
    localStorage.setItem('insight:demo:file:model.ai:content', 'legacy');
    expect(readLocalSource('demo', 'model.ai')).toBe('legacy');
    expect(hasLocalSource('demo', 'model.ai')).toBe(true);

    vi.spyOn(Date, 'now').mockReturnValue(123456);
    writeLocalSource('demo', 'model.ai', 'current');

    expect(readLocalSource('demo', 'model.ai')).toBe('current');
    expect(localStorage.getItem('insight:demo:source:model.ai:updatedAt')).toBe('123456');
  });

  it('removes both current and legacy source formats', () => {
    localStorage.setItem('insight:demo:source:model.ai:content', 'current');
    localStorage.setItem('insight:demo:source:model.ai:updatedAt', '1');
    localStorage.setItem('insight:demo:file:model.ai:content', 'legacy');
    localStorage.setItem('insight:demo:file:model.ai:updatedAt', '2');

    removeLocalSource('demo', 'model.ai');

    expect(readLocalSource('demo', 'model.ai')).toBeUndefined();
    expect(hasLocalSource('demo', 'model.ai')).toBe(false);
    expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index))).not.toContain(
      'insight:demo:file:model.ai:updatedAt'
    );
  });

  it('clears one project without touching another, then clears all Insight keys only', () => {
    localStorage.setItem('insight:one:workspace', '{}');
    localStorage.setItem('insight:two:workspace', '{}');
    localStorage.setItem('unrelated', 'keep');

    clearProjectStorage('one');
    expect(localStorage.getItem('insight:one:workspace')).toBeNull();
    expect(localStorage.getItem('insight:two:workspace')).toBe('{}');

    clearLocalWorkspaceStorage();
    expect(localStorage.getItem('insight:two:workspace')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
