import { describe, expect, it } from 'vitest';
import { actionCatalog, canExecute, controlState } from './action-model';

describe('action control model', () => {
  it('disables every repository mutation in playground', () => {
    for (const [actionId, action] of Object.entries(actionCatalog)) {
      if (action.effect !== 'repository-write') {
        continue;
      }
      const state = controlState(actionId as keyof typeof actionCatalog, {
        surface: 'playground',
        capabilities: ['repository:write-own']
      });
      expect(state).toMatchObject({ hidden: false, disabled: true });
      expect(canExecute(state)).toBe(false);
    }
  });

  it('represents hidden as disabled plus hidden', () => {
    expect(controlState('publication.toggle', { surface: 'editor', capabilities: [] })).toMatchObject({
      hidden: true,
      disabled: true
    });
  });

  it('keeps publication management separate from repository ownership', () => {
    expect(controlState('publication.toggle', {
      surface: 'editor',
      capabilities: ['repository:read-own', 'repository:write-own']
    }).hidden).toBe(true);
    expect(controlState('publication.toggle', {
      surface: 'editor',
      capabilities: ['repository:read-own', 'publication:manage']
    })).toEqual({ hidden: false, disabled: false });
  });

  it('can disable an authorized action because current UI context is unavailable', () => {
    expect(controlState('repository.file.save', {
      surface: 'editor',
      capabilities: ['repository:write-own'],
      available: false,
      unavailableReason: 'No active file'
    })).toEqual({ hidden: false, disabled: true, reason: 'No active file' });
  });
});
