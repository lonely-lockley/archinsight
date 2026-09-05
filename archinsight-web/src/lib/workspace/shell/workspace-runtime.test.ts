// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceRuntime } from './workspace-runtime';
import { createWorkspaceShellView } from './workspace-shell-model';
import {
  activeWorkspaceTab,
  canDownloadWorkspaceDiagram,
  initialWorkspaceRuntimeState,
  workspaceErrorSources
} from './workspace-runtime-state';
import {
  createEditorSynchronization,
  editorSymbolsFor,
  workspaceCoreSources
} from '../editor/workspace-editor-context';
import type { ProjectStructure } from '$lib/api';

describe('workspace runtime composition', () => {
  it('assembles controllers around one reactive state boundary', () => {
    let state = initialWorkspaceRuntimeState();
    state = {
      ...state,
      currentUser: {
        authenticated: true,
        capabilities: ['repository:write-own', 'publication:manage']
      }
    };
    const runtime = createWorkspaceRuntime({
      surface: () => 'editor',
      state: () => state,
      patchState: (patch) => { state = { ...state, ...patch }; },
      editorHost: () => document.createElement('div')
    });

    expect(runtime.controllers).toMatchObject({
      auth: runtime.authController,
      action: runtime.actionController,
      diagram: runtime.diagramController,
      download: runtime.downloadController,
      file: runtime.fileController,
      layout: runtime.layoutController,
      projectDialog: runtime.projectDialogController,
      repositoryDialog: runtime.repositoryDialogController
    });

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 17,
      clientY: 23
    } as unknown as MouseEvent;
    const node = { name: 'src', path: 'src', type: 'directory' as const, children: [] };
    runtime.openRepositoryMenu(node, event);
    expect(state.repositoryMenu).toEqual({ node, x: 17, y: 23 });
    runtime.closeRepositoryMenu();
    expect(state.repositoryMenu).toBeUndefined();
  });

  it('projects runtime state into the shell view and core editor support', () => {
    let state = initialWorkspaceRuntimeState();
    const runtime = createWorkspaceRuntime({
      surface: () => 'playground',
      state: () => state,
      patchState: (patch) => { state = { ...state, ...patch }; },
      editorHost: () => document.createElement('div')
    });

    const view = createWorkspaceShellView('playground', state, runtime);

    expect(view.surface).toBe('playground');
    expect(view.activeTab).toBeUndefined();
    expect(view.canDownloadCurrentDiagram).toBe(false);
    expect(view.emptyStrategy.actions.map((action) => action.id)).toEqual(['create-tab']);
    expect(activeWorkspaceTab(state)).toBeUndefined();
    expect(workspaceErrorSources(state)).toEqual(new Set());
    expect(canDownloadWorkspaceDiagram(state)).toBe(false);
    expect(editorSymbolsFor(state).types.length).toBeGreaterThan(0);
    expect(workspaceCoreSources.exists(workspaceCoreSources.identity())).toBe(true);
    expect(workspaceCoreSources.readonlyTabId('core.ai')).toBe('__readonly__/core.ai');
    expect(workspaceCoreSources.source('missing.ai').length).toBeGreaterThan(0);
  });

  it('synchronizes diagnostics, symbols, completion snapshots, and token vocabulary', () => {
    let state = initialWorkspaceRuntimeState();
    const replaceDiagnostics = vi.fn();
    const diagnosticsFor = vi.fn(() => []);
    const refreshMarkers = vi.fn();
    const refreshTokenVocabulary = vi.fn();
    const writeProjectStructure = vi.fn();
    const synchronization = createEditorSynchronization({
      tabs: () => state.tabs,
      projectSymbols: () => state.projectSymbols,
      snapshotRevision: () => state.workspaceCompletionSnapshotRevision,
      writeEditorSymbols: (editorSymbols) => { state = { ...state, editorSymbols }; },
      writeProjectStructure,
      replaceDiagnostics,
      diagnosticsFor,
      refreshMarkers,
      refreshTokenVocabulary
    });
    const structure: ProjectStructure = {
      schemaVersion: 'project-structure.v1',
      contexts: [{
        id: 'commerce', kind: 'context', constructor: 'Context', source: 'commerce.ai',
        line: 1, column: 1, children: []
      }]
    };

    synchronization.refreshDiagnostics();
    synchronization.refreshEditorSymbols();
    synchronization.acceptProjectStructure(structure);
    synchronization.refreshEditorTokenVocabulary({ repaint: false });

    expect(replaceDiagnostics).toHaveBeenCalledWith(diagnosticsFor);
    expect(refreshMarkers).toHaveBeenCalledOnce();
    expect(writeProjectStructure).toHaveBeenCalledWith(
      structure,
      expect.objectContaining({ revision: 1, contextIds: ['commerce'] }),
      1
    );
    expect(refreshTokenVocabulary).toHaveBeenCalledWith({ repaint: false });
  });
});
