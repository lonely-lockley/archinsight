import type { WorkspaceTab } from '$lib/workspace-types';
import {
  removeTab,
  retargetTab,
  uniqueTabId,
  type RemoveTabResult,
  type RetargetTabResult
} from './tab-model';

export type TabControllerState = {
  readonly tabs: WorkspaceTab[];
  readonly activeTabId: string | undefined;
  readonly editorTabId: string | undefined;
};

export type TabControllerPorts = {
  readState(): TabControllerState;
  writeState(state: TabControllerState): void;
};

export type TabController = {
  append(tab: WorkspaceTab): void;
  uniqueId(id: string): string;
  activate(id: string): void;
  selectEditor(id: string | undefined): void;
  patch(id: string, patch: Partial<WorkspaceTab>): void;
  patchBySourceIdentity(sourceIdentity: string, patch: Partial<WorkspaceTab>): void;
  replaceDiagnostics(resolve: (sourceIdentity: string) => WorkspaceTab['diagnostics']): void;
  clearDots(sourceIdentities: readonly string[]): void;
  remove(id: string): RemoveTabResult;
  retarget(
    tabId: string,
    target: { readonly path: string; readonly title: string; readonly content: string; readonly local: boolean }
  ): RetargetTabResult;
  reset(): void;
};

export function createTabController(ports: TabControllerPorts): TabController {
  const writeTabs = (tabs: WorkspaceTab[]): void => {
    ports.writeState({ ...ports.readState(), tabs });
  };

  return {
    append(tab) {
      const state = ports.readState();
      ports.writeState({ ...state, tabs: [...state.tabs, tab] });
    },

    uniqueId(id) {
      return uniqueTabId(ports.readState().tabs, id);
    },

    activate(id) {
      ports.writeState({ ...ports.readState(), activeTabId: id });
    },

    selectEditor(id) {
      ports.writeState({ ...ports.readState(), editorTabId: id });
    },

    patch(id, patch) {
      writeTabs(ports.readState().tabs.map((tab) => tab.id === id ? { ...tab, ...patch } : tab));
    },

    patchBySourceIdentity(sourceIdentity, patch) {
      writeTabs(ports.readState().tabs.map((tab) => (
        tab.sourceIdentity === sourceIdentity ? { ...tab, ...patch } : tab
      )));
    },

    replaceDiagnostics(resolve) {
      writeTabs(ports.readState().tabs.map((tab) => ({
        ...tab,
        diagnostics: resolve(tab.sourceIdentity)
      })));
    },

    clearDots(sourceIdentities) {
      const sources = new Set(sourceIdentities);
      writeTabs(ports.readState().tabs.map((tab) => (
        sources.has(tab.sourceIdentity) ? { ...tab, dot: undefined } : tab
      )));
    },

    remove(id) {
      const state = ports.readState();
      const transition = removeTab(state.tabs, state.activeTabId, id);
      ports.writeState({
        ...state,
        tabs: transition.tabs,
        activeTabId: transition.activeTabId
      });
      return transition;
    },

    retarget(tabId, target) {
      const state = ports.readState();
      const transition = retargetTab(
        state.tabs,
        tabId,
        target,
        state.activeTabId,
        state.editorTabId
      );
      ports.writeState({
        tabs: transition.tabs,
        activeTabId: transition.activeTabId,
        editorTabId: transition.editorTabId
      });
      return transition;
    },

    reset() {
      ports.writeState({ tabs: [], activeTabId: undefined, editorTabId: undefined });
    }
  };
}
