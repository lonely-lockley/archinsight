// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisController } from '$lib/workspace/analysis/analysis-controller';
import type { AuthController } from '$lib/workspace/auth/auth-controller';
import type { DiagramController } from '$lib/workspace/diagram/diagram-controller';
import type { MonacoSession } from '$lib/workspace/editor/monaco-session';
import type { MessageController } from '$lib/workspace/messages/message-controller';
import type { ProjectSessionController } from '$lib/workspace/projects/project-session-controller';
import type { LayoutController } from '$lib/workspace/shell/layout-controller';
import type { WorkspaceActionController } from '$lib/workspace/shell/workspace-action-controller';
import { initialWorkspaceRuntimeState } from './workspace-runtime-state';
import { createWorkspaceRuntimeLifecycle } from './workspace-runtime-lifecycle';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  let state = initialWorkspaceRuntimeState();
  const authorizeWorkspace = vi.fn(async () => true);
  const redirectIfAuthRequired = vi.fn(() => false);
  const setupEditor = vi.fn(async () => undefined);
  const loadProjects = vi.fn(async () => undefined);
  const loadPublication = vi.fn(async () => undefined);
  const loadProject = vi.fn(async () => undefined);
  const closeRepositoryMenu = vi.fn();
  const error = vi.fn();
  const dispose = {
    analysis: vi.fn(), diagram: vi.fn(), layout: vi.fn(), monaco: vi.fn()
  };
  const handleGlobalKeydown = vi.fn();
  const lifecycle = createWorkspaceRuntimeLifecycle({
    host: {
      surface: () => 'editor',
      state: () => state,
      patchState: (patch) => { state = { ...state, ...patch }; },
      editorHost: () => document.createElement('div')
    },
    auth: { authorizeWorkspace, redirectIfAuthRequired } as unknown as AuthController,
    action: { handleGlobalKeydown } as unknown as WorkspaceActionController,
    analysis: { dispose: dispose.analysis } as unknown as AnalysisController,
    diagram: { dispose: dispose.diagram } as unknown as DiagramController,
    layout: { dispose: dispose.layout } as unknown as LayoutController,
    messages: { error } as unknown as MessageController,
    monaco: {
      startLanguageWorker: vi.fn(), setupEditor, dispose: dispose.monaco
    } as unknown as MonacoSession,
    projects: { loadProjects, loadPublication, loadProject } as unknown as ProjectSessionController,
    closeRepositoryMenu
  });
  return {
    lifecycle, authorizeWorkspace, redirectIfAuthRequired, setupEditor,
    loadProjects, loadPublication, loadProject, closeRepositoryMenu,
    handleGlobalKeydown, error, dispose,
    setState: (patch: Partial<typeof state>) => { state = { ...state, ...patch }; }
  };
}

describe('workspace runtime lifecycle', () => {
  it('starts the editor, restores authorized project state, and registers global handlers', async () => {
    const subject = fixture();
    subject.setState({
      activeProjectId: 'project-1',
      currentUser: { authenticated: true, capabilities: ['publication:manage'] }
    });
    const add = vi.spyOn(window, 'addEventListener');

    await subject.lifecycle.start();

    expect(subject.setupEditor).toHaveBeenCalledOnce();
    expect(subject.loadProjects).toHaveBeenCalledOnce();
    expect(subject.loadPublication).toHaveBeenCalledOnce();
    expect(subject.loadProject).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith('keydown', subject.handleGlobalKeydown);
    expect(add).toHaveBeenCalledWith('click', subject.closeRepositoryMenu);
  });

  it('stops before editor setup when workspace authorization redirects', async () => {
    const subject = fixture();
    subject.authorizeWorkspace.mockResolvedValueOnce(false);

    await subject.lifecycle.start();

    expect(subject.setupEditor).not.toHaveBeenCalled();
  });

  it('reports startup failures that are not authentication redirects', async () => {
    const subject = fixture();
    subject.setupEditor.mockRejectedValueOnce(new Error('Monaco failed'));

    await subject.lifecycle.start();

    expect(subject.redirectIfAuthRequired).toHaveBeenCalled();
    expect(subject.error).toHaveBeenCalledWith('Startup error: Monaco failed');
  });

  it('disposes domain resources and unregisters global handlers', () => {
    const subject = fixture();
    const remove = vi.spyOn(window, 'removeEventListener');

    subject.lifecycle.dispose();

    expect(Object.values(subject.dispose).every((callback) => callback.mock.calls.length === 1)).toBe(true);
    expect(remove).toHaveBeenCalledWith('keydown', subject.handleGlobalKeydown);
    expect(remove).toHaveBeenCalledWith('click', subject.closeRepositoryMenu);
  });
});
