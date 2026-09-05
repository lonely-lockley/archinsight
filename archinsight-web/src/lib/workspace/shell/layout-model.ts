import type { WorkspaceTabState, WorkspaceUiState } from '$lib/storage';
import type { ProjectUiState } from '@archinsight/workbench/types';

export const minSidebarWidth = 150;
export const defaultSidebarWidth = 300;
export const collapsedSidebarWidth = 44;
export const minMessagesHeight = 150;
export const defaultMessagesHeight = 180;

export function defaultProjectUi(): ProjectUiState {
  return {
    sidebarVisible: true,
    sidebarWidth: defaultSidebarWidth,
    messagesVisible: false,
    messagesHeight: defaultMessagesHeight
  };
}

export function normalizeProjectUi(
  ui: WorkspaceUiState | undefined,
  tabs: readonly WorkspaceTabState[]
): ProjectUiState {
  const legacyUi = tabs.find((tab) => tab.ui !== undefined)?.ui;
  const source = ui ?? legacyUi;
  return {
    ...defaultProjectUi(),
    ...source,
    sidebarWidth: clamp(Number(source?.sidebarWidth ?? defaultSidebarWidth), minSidebarWidth, 720),
    messagesHeight: clamp(Number(source?.messagesHeight ?? defaultMessagesHeight), minMessagesHeight, 520)
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
