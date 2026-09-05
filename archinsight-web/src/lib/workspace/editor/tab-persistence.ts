import { diagramModeDefinition, resolveStoredDiagramQuery } from '@archinsight/workbench/presets';
import type { WorkspaceTabState } from '$lib/storage';
import type { EditorViewMode, WorkspaceTab } from '@archinsight/workbench/types';

const defaultViewMode: EditorViewMode = 'split';
const defaultDiagramScale = 1;
const defaultEditorSplitRatio = 50;
const defaultQueryPanelHeight = 118;
const minDiagramScale = 0.25;
const maxDiagramScale = 3;
const minEditorSplitRatio = 20;
const maxEditorSplitRatio = 80;

export function workspaceTabState(tab: WorkspaceTab): WorkspaceTabState {
  const persistedQuery = tab.queryPreset
    ? {
        presetId: diagramModeDefinition(tab.diagramMode).id,
        presetVersion: diagramModeDefinition(tab.diagramMode).presetVersion
      }
    : { customizedQuery: tab.query };
  const state = {
    id: tab.id,
    sourceIdentity: tab.sourceIdentity,
    title: tab.title,
    diagramMode: tab.diagramMode,
    ...persistedQuery,
    deploymentEnvironment: tab.deploymentEnvironment,
    queryVisible: tab.queryVisible,
    queryPanelHeight: tab.queryPanelHeight,
    diagramScale: tab.diagramScale,
    diagramFit: tab.diagramFit,
    viewMode: tab.viewMode,
    editorSplitRatio: tab.editorSplitRatio
  };
  return tab.filePath === undefined
    ? { ...state, content: tab.content }
    : { ...state, filePath: tab.filePath };
}

export function tabToolbarState(
  tab?: Partial<WorkspaceTabState>
): Pick<WorkspaceTab,
  | 'diagramMode'
  | 'query'
  | 'queryPreset'
  | 'deploymentEnvironment'
  | 'queryVisible'
  | 'queryPanelHeight'
  | 'diagramScale'
  | 'diagramFit'
  | 'viewMode'
  | 'editorSplitRatio'
> {
  return {
    ...resolveStoredDiagramQuery(tab),
    deploymentEnvironment: tab?.deploymentEnvironment,
    queryVisible: tab?.queryVisible ?? false,
    queryPanelHeight: normalizeQueryPanelHeight(tab?.queryPanelHeight),
    diagramScale: normalizeDiagramScale(tab?.diagramScale),
    diagramFit: tab?.diagramFit ?? false,
    viewMode: normalizeViewMode(tab?.viewMode) ?? defaultViewMode,
    editorSplitRatio: normalizeEditorSplitRatio(tab?.editorSplitRatio)
  };
}

export function isProjectSourceTab(tab: WorkspaceTab): boolean {
  return tab.projectSource !== false;
}

export function virtualSourceIdentity(id: string): string {
  return `__unsaved__/${id.replace(/[^A-Za-z0-9_-]/g, '-')}.ai`;
}

function normalizeViewMode(value: string | undefined): EditorViewMode | undefined {
  return value === 'split' || value === 'code' || value === 'diagram' ? value : undefined;
}

function normalizeDiagramScale(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, minDiagramScale, maxDiagramScale)
    : defaultDiagramScale;
}

function normalizeEditorSplitRatio(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, minEditorSplitRatio, maxEditorSplitRatio)
    : defaultEditorSplitRatio;
}

function normalizeQueryPanelHeight(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, 80, 360)
    : defaultQueryPanelHeight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
