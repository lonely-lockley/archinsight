import type { AnalysisController } from '$lib/workspace/analysis/analysis-controller';
import type { MonacoSession } from '$lib/workspace/editor/monaco-session';
import type { TabController } from '$lib/workspace/editor/tab-controller';
import type { RepositoryFileEffect } from '$lib/workspace/repository/repository-controller';
import {
  baseName,
  replaceDirectoryPrefix
} from '$lib/workspace/repository/repository-paths';
import { repositoryFilePathsInDirectory } from '$lib/workspace/repository/repository-tree';
import type { TreeNode, WorkspaceTab } from '$lib/workspace-types';

export type WorkspaceFileEffectsPorts = {
  tabs(): WorkspaceTab[];
  overlays(): Record<string, string>;
  setOverlays(overlays: Record<string, string>): void;
  storageProjectId(): string;
  tree(): TreeNode | undefined;
  tabController: TabController;
  monaco(): MonacoSession;
  analysis(): AnalysisController;
  writeLocalSource(projectId: string, path: string, content: string): void;
  removeLocalSource(projectId: string, path: string): void;
  refreshEditorTokenVocabulary(): void;
  closeTab(id: string): void;
  openFile(path: string): Promise<void>;
  fileSaved(path: string): void;
};

export type WorkspaceFileEffects = {
  retargetOpenTab(tabId: string, path: string, content: string, local: boolean): void;
  acceptDeletedFiles(paths: readonly string[]): Promise<void>;
  acceptFileEffect(effect: RepositoryFileEffect): Promise<void>;
};

export function createWorkspaceFileEffects(ports: WorkspaceFileEffectsPorts): WorkspaceFileEffects {
  const retargetOpenTab = (tabId: string, path: string, content: string, local: boolean): void => {
    const transition = ports.tabController.retarget(tabId, {
      path,
      title: baseName(path),
      content,
      local
    });
    const tab = transition.previousTab;
    const targetId = transition.targetId;
    if (tab === undefined || targetId === undefined) return;
    ports.monaco().retargetModel(tab.id, targetId);
    ports.analysis().removeDiagnostics([tab.sourceIdentity]);
    ports.monaco().syncActiveTab();
    ports.refreshEditorTokenVocabulary();
  };

  const retargetTabsForRename = (sourcePath: string, targetPath: string): void => {
    const tab = ports.tabs().find((item) => item.filePath === sourcePath);
    const overlays = { ...ports.overlays() };
    if (tab === undefined) {
      ports.removeLocalSource(ports.storageProjectId(), sourcePath);
      delete overlays[sourcePath];
      ports.setOverlays(overlays);
      return;
    }
    retargetOpenTab(tab.id, targetPath, tab.content, tab.local);
    if (tab.local) {
      overlays[targetPath] = tab.content;
      ports.writeLocalSource(ports.storageProjectId(), targetPath, tab.content);
    }
    ports.removeLocalSource(ports.storageProjectId(), sourcePath);
    delete overlays[sourcePath];
    ports.setOverlays(overlays);
  };

  return {
    retargetOpenTab,

    async acceptDeletedFiles(paths) {
      for (const path of paths) {
        const tab = ports.tabs().find((item) => item.filePath === path);
        if (tab !== undefined) ports.closeTab(tab.id);
        ports.removeLocalSource(ports.storageProjectId(), path);
        const overlays = { ...ports.overlays() };
        delete overlays[path];
        ports.setOverlays(overlays);
      }
      ports.analysis().removeDiagnostics([...paths]);
      ports.refreshEditorTokenVocabulary();
    },

    async acceptFileEffect(effect) {
      switch (effect.kind) {
        case 'file-renamed':
          retargetTabsForRename(effect.sourcePath, effect.path);
          return;
        case 'folder-renamed': {
          const paths = ports.tabs().flatMap((tab) => tab.filePath === undefined ? [] : [tab.filePath]);
          const files = repositoryFilePathsInDirectory(ports.tree(), effect.sourcePath, paths);
          for (const path of files) {
            retargetTabsForRename(path, replaceDirectoryPrefix(path, effect.sourcePath, effect.path));
          }
          return;
        }
        case 'file-saved':
          if (effect.tabId !== undefined) {
            retargetOpenTab(effect.tabId, effect.path, effect.content, false);
          } else {
            await ports.openFile(effect.path);
          }
          ports.fileSaved(effect.path);
          return;
        case 'folder-created':
          return;
      }
    }
  };
}
