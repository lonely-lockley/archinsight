import type { WorkspaceTab } from '$lib/workspace-types';

export type RetargetTabResult = {
  tabs: WorkspaceTab[];
  targetId?: string;
  previousTab?: WorkspaceTab;
  activeTabId: string | undefined;
  editorTabId: string | undefined;
};

export type RemoveTabResult = {
  tabs: WorkspaceTab[];
  activeTabId: string | undefined;
};

export function uniqueTabId(tabs: readonly WorkspaceTab[], id: string): string {
  if (!tabs.some((tab) => tab.id === id)) {
    return id;
  }
  let suffix = 2;
  let next = `${id}-${suffix}`;
  while (tabs.some((tab) => tab.id === next)) {
    suffix += 1;
    next = `${id}-${suffix}`;
  }
  return next;
}

export function retargetTab(
  tabs: readonly WorkspaceTab[],
  tabId: string,
  target: {
    path: string;
    title: string;
    content: string;
    local: boolean;
  },
  activeTabId: string | undefined,
  editorTabId: string | undefined
): RetargetTabResult {
  const previousTab = tabs.find((tab) => tab.id === tabId);
  if (previousTab === undefined) {
    return {
      tabs: [...tabs],
      activeTabId,
      editorTabId
    };
  }

  const targetId = uniqueTabId(tabs, target.path);
  return {
    tabs: tabs.map((tab) => tab.id === previousTab.id
      ? {
          ...tab,
          id: targetId,
          filePath: target.path,
          sourceIdentity: target.path,
          title: target.title,
          content: target.content,
          local: target.local,
          diagnostics: []
        }
      : tab),
    targetId,
    previousTab,
    activeTabId: activeTabId === previousTab.id ? targetId : activeTabId,
    editorTabId: editorTabId === previousTab.id ? targetId : editorTabId
  };
}

export function removeTab(
  tabs: readonly WorkspaceTab[],
  activeTabId: string | undefined,
  tabId: string
): RemoveTabResult {
  const remaining = tabs.filter((tab) => tab.id !== tabId);
  return {
    tabs: remaining,
    activeTabId: activeTabId === tabId ? remaining.at(-1)?.id : activeTabId
  };
}

