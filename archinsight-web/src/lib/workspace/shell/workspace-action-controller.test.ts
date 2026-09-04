import { describe, expect, it, vi } from 'vitest';
import type { AppCapability } from '$lib/api';
import type { ProjectSummary } from '$lib/storage';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import {
  createWorkspaceActionController,
  type WorkspaceActionControllerPorts
} from './workspace-action-controller';

const tab = (overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id: 'main.ai',
  filePath: 'main.ai',
  sourceIdentity: 'main.ai',
  title: 'main.ai',
  content: 'system Main',
  svg: '<svg/>',
  dot: 'digraph {}',
  diagnostics: [],
  local: false,
  diagramMode: 'default',
  query: '',
  queryPreset: true,
  queryVisible: false,
  diagramScale: 1,
  diagramFit: false,
  viewMode: 'split',
  editorSplitRatio: 50,
  queryPanelHeight: 118,
  ...overrides
});

const project: ProjectSummary = { id: 'project-1', name: 'Project One' };

function fixture(overrides: Partial<WorkspaceActionControllerPorts> = {}) {
  let surface: 'editor' | 'playground' = 'editor';
  let capabilities: AppCapability[] = ['repository:write-own', 'publication:manage'];
  let projects: ProjectSummary[] = [project];
  let activeProjectId: string | undefined = project.id;
  let activeTab: WorkspaceTab | undefined = tab();
  const info = vi.fn();
  const newFile = vi.fn();
  const saveActiveTab = vi.fn();
  const openProjectDialog = vi.fn();
  const controller = createWorkspaceActionController({
    surface: () => surface,
    capabilities: () => capabilities,
    projects: () => projects,
    activeProjectId: () => activeProjectId,
    activeTab: () => activeTab,
    info,
    newFile,
    saveActiveTab,
    openProjectDialog,
    ...overrides
  });

  return {
    controller,
    info,
    newFile,
    saveActiveTab,
    openProjectDialog,
    setSurface: (next: 'editor' | 'playground') => { surface = next; },
    setCapabilities: (next: AppCapability[]) => { capabilities = next; },
    setProjects: (next: ProjectSummary[]) => { projects = next; },
    setActiveProjectId: (next: string | undefined) => { activeProjectId = next; },
    setActiveTab: (next: WorkspaceTab | undefined) => { activeTab = next; }
  };
}

describe('workspace action controller', () => {
  it('derives save, publication, and repository states from current workspace state', () => {
    const subject = fixture();

    expect(subject.controller.newTabState()).toEqual({ hidden: false, disabled: false });
    expect(subject.controller.saveState()).toEqual({ hidden: false, disabled: false });
    expect(subject.controller.publicationState()).toEqual({ hidden: false, disabled: false });
    expect(Object.values(subject.controller.repositoryStates()).every((state) => !state.disabled)).toBe(true);

    subject.setActiveTab(tab({ readOnly: true }));
    expect(subject.controller.saveState()).toMatchObject({ disabled: true, reason: 'File is read-only' });
    subject.setActiveTab(undefined);
    expect(subject.controller.saveState()).toMatchObject({ disabled: true, reason: 'No active file' });

    subject.setActiveProjectId(undefined);
    expect(Object.values(subject.controller.repositoryStates()).every((state) => state.disabled)).toBe(true);
  });

  it('applies surface authorization before local availability', () => {
    const subject = fixture();
    subject.setSurface('playground');

    expect(subject.controller.state('repository.file.create', false, 'No active project')).toEqual({
      hidden: false,
      disabled: true,
      reason: 'Published project cannot be modified'
    });
    expect(subject.controller.publicationState()).toMatchObject({
      hidden: true,
      reason: 'Publication management is unavailable in playground'
    });
  });

  it('reports denied actions and authorizes every repository command through one policy', () => {
    const subject = fixture();
    subject.setActiveProjectId(undefined);

    for (const actionId of [
      'repository.file.create',
      'repository.folder.create',
      'repository.file.rename',
      'repository.folder.rename',
      'repository.file.delete',
      'repository.folder.delete'
    ] as const) {
      expect(subject.controller.authorizeRepositoryAction(actionId)).toBe(false);
    }
    expect(subject.info).toHaveBeenCalledTimes(6);

    subject.setActiveProjectId(project.id);
    expect(subject.controller.authorizeRepositoryAction('repository.file.save')).toBe(true);
    expect(subject.controller.authorizeRepositoryAction('workspace.tab.create')).toBe(true);
  });

  it('filters hidden empty-workspace actions without hiding local tab creation', () => {
    const subject = fixture();
    subject.setProjects([]);
    subject.setActiveProjectId(undefined);
    subject.setCapabilities([]);

    expect(subject.controller.emptyStrategy()).toMatchObject({
      kind: 'no-projects',
      actions: [{ id: 'create-tab', label: 'Create New Tab', icon: 'new-file', primary: true }]
    });

    subject.setCapabilities(['repository:write-own']);
    expect(subject.controller.emptyStrategy().actions.map((action) => action.id)).toEqual([
      'create-tab',
      'manage-projects'
    ]);
  });

  it('dispatches empty-workspace actions to file and project controllers', () => {
    const subject = fixture();

    subject.controller.handleEmptyAction({ id: 'create-tab', label: 'New', icon: 'new-file' });
    subject.controller.handleEmptyAction({ id: 'create-project', label: 'Create', icon: 'folder' });
    subject.controller.handleEmptyAction({ id: 'manage-projects', label: 'Manage', icon: 'folder' });

    expect(subject.newFile).toHaveBeenCalledOnce();
    expect(subject.openProjectDialog.mock.calls).toEqual([[true], [false]]);

    subject.setCapabilities([]);
    subject.controller.handleEmptyAction({ id: 'manage-projects', label: 'Manage', icon: 'folder' });
    expect(subject.openProjectDialog).toHaveBeenCalledTimes(2);
  });

  it('handles the save shortcut only for an editable active tab', () => {
    const subject = fixture();
    const preventDefault = vi.fn();

    subject.controller.handleGlobalKeydown({ metaKey: false, ctrlKey: false, key: 's', preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();

    subject.setActiveTab(undefined);
    subject.controller.handleGlobalKeydown({ metaKey: false, ctrlKey: true, key: 'S', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(subject.saveActiveTab).not.toHaveBeenCalled();

    subject.setActiveTab(tab());
    subject.controller.handleGlobalKeydown({ metaKey: true, ctrlKey: false, key: 's', preventDefault });
    expect(subject.saveActiveTab).toHaveBeenCalledOnce();
  });

  it('opens project management only when the action is authorized', () => {
    const subject = fixture();
    subject.controller.manageProjects();
    expect(subject.openProjectDialog).toHaveBeenCalledWith(false);

    subject.setCapabilities([]);
    subject.controller.manageProjects();
    expect(subject.openProjectDialog).toHaveBeenCalledOnce();
    expect(subject.info).toHaveBeenCalledWith('Action is not permitted');
  });
});
